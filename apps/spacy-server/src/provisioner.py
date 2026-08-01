from __future__ import annotations

import hashlib
import importlib.metadata
import json
import os
import platform as platform_module
import shutil
import stat
import subprocess
import sys
import sysconfig
import time
import urllib.request
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Protocol, cast
from urllib.parse import unquote, urlparse

from packaging.tags import sys_tags
from packaging.utils import canonicalize_name, parse_wheel_filename
from packaging.version import Version

from .generations import (
    PROVISIONER_VERSION,
    SERVER_PROTOCOL_VERSION,
    GenerationIdentity,
    GenerationStateError,
    GenerationStore,
    ModelPlan,
    ProvisionPlan,
    _unique_object,
    canonical_json,
    fsync_tree,
    generation_id,
    make_tree_owner_writable,
    make_tree_read_only,
    parse_plan_bytes,
    site_packages_digest,
)

MANIFEST_SCHEMA_VERSION = "1"
DOWNLOAD_TIMEOUT_SECONDS = 30.0
COPY_CHUNK_SIZE = 1024 * 1024


class ArtifactError(RuntimeError):
    pass


class ModelValidationError(RuntimeError):
    pass


class HttpResponse(Protocol):
    headers: object

    def read(self, size: int = -1) -> bytes: ...

    def geturl(self) -> str: ...

    def __enter__(self) -> HttpResponse: ...

    def __exit__(self, *_args: object) -> None: ...


@dataclass(frozen=True)
class ValidatedModel:
    pipeline_id: str
    pipeline_version: str


InstallWheel = Callable[[Path, Path], None]
ValidateModel = Callable[[ModelPlan, Path], ValidatedModel]


def load_hash_locked_external_plan(path: Path, expected_sha256: str) -> ProvisionPlan:
    if len(expected_sha256) != 64 or any(
        character not in "0123456789abcdef" for character in expected_sha256
    ):
        raise ArtifactError(
            "External plan SHA-256 must be 64 lowercase hex characters."
        )
    try:
        data = path.read_bytes()
    except OSError as error:
        raise ArtifactError(f"Could not read external plan: {path}") from error
    actual = hashlib.sha256(data).hexdigest()
    if actual != expected_sha256:
        raise ArtifactError(
            f"External plan SHA-256 mismatch: expected {expected_sha256}, got {actual}."
        )
    return parse_plan_bytes(data, path, allow_local=True)


def pip_install_wheel(wheel: Path, site_packages: Path) -> None:
    site_packages.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            "--no-input",
            "--no-compile",
            "--no-index",
            "--no-deps",
            "--only-binary=:all:",
            "--target",
            str(site_packages),
            str(wheel),
        ],
        check=True,
        env={
            **os.environ,
            "PIP_NO_CACHE_DIR": "1",
            "PYTHONDONTWRITEBYTECODE": "1",
        },
    )


def validate_installed_model(entry: ModelPlan, site_packages: Path) -> ValidatedModel:
    try:
        result = subprocess.run(
            [sys.executable, "-m", "src.model_validator", str(site_packages)],
            input=canonical_json(entry.canonical_value()),
            capture_output=True,
            check=True,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
        )
        value = json.loads(
            result.stdout.decode("utf-8"), object_pairs_hook=_unique_object
        )
    except (
        subprocess.SubprocessError,
        UnicodeDecodeError,
        json.JSONDecodeError,
    ) as error:
        detail = ""
        if isinstance(error, subprocess.CalledProcessError):
            detail = error.stderr.decode("utf-8", errors="replace").strip()
        raise ModelValidationError(
            f"Model {entry.distribution} failed isolated validation: {detail}"
        ) from error
    if (
        not isinstance(value, dict)
        or set(value) != {"pipelineId", "pipelineVersion"}
        or not isinstance(value["pipelineId"], str)
        or not isinstance(value["pipelineVersion"], str)
    ):
        raise ModelValidationError(
            f"Model {entry.distribution} returned invalid validation output."
        )
    return ValidatedModel(value["pipelineId"], value["pipelineVersion"])


class Provisioner:
    def __init__(
        self,
        store: GenerationStore,
        *,
        install_wheel: InstallWheel = pip_install_wheel,
        validate_model: ValidateModel = validate_installed_model,
        spacy_version: str | None = None,
        python_abi: str | None = None,
        python_implementation: str | None = None,
        python_version: str | None = None,
        platform: str | None = None,
        lock_timeout_seconds: float = 60.0,
    ) -> None:
        self.store = store
        self._install_wheel = install_wheel
        self._validate_model = validate_model
        self._spacy_version = spacy_version or importlib.metadata.version("spacy")
        self._python_abi = python_abi or sys.implementation.cache_tag
        self._python_implementation = python_implementation or sys.implementation.name
        self._python_version = python_version or platform_module.python_version()
        self._platform = platform or sysconfig.get_platform()
        self._lock_timeout_seconds = lock_timeout_seconds

    def provision(self, plan: ProvisionPlan) -> str:
        with self.store.provision_lock(timeout_seconds=self._lock_timeout_seconds):
            self.store.cleanup_staging()
            reusable = self._find_reusable(plan)
            if reusable is not None:
                storage_key, identifier = reusable
                self.store.activate(storage_key)
                self._best_effort_cleanup()
                return identifier
            return self._build_activate_cleanup(plan)

    def _build_activate_cleanup(
        self,
        plan: ProvisionPlan,
    ) -> str:
        storage_key = f"generation-{uuid.uuid4().hex}"
        staging = self.store.generations / f".staging-{storage_key}"
        staging.mkdir(mode=0o700)
        artifacts = staging / "artifacts"
        site_packages = staging / "site-packages"
        artifacts.mkdir()
        site_packages.mkdir()
        try:
            local_wheels: list[tuple[ModelPlan, Path]] = []
            for entry in plan.models:
                filename = self._artifact_filename(entry)
                destination = artifacts / filename
                self._copy_artifact(entry, destination)
                self._validate_wheel(entry, destination)
                local_wheels.append((entry, destination))
            for _entry, wheel in local_wheels:
                self._install_wheel(wheel, site_packages)
            validated = [
                (entry, self._validate_model(entry, site_packages))
                for entry, _wheel in local_wheels
            ]
            installed_digest = site_packages_digest(site_packages)
            identity = self._identity(plan, installed_digest)
            identifier = generation_id(identity)
            manifest = self._manifest(
                identifier, identity, validated, plan, installed_digest
            )
            self._write_manifest(staging / "manifest.json", manifest)
            make_tree_read_only(staging)
            fsync_tree(staging)
            final = self.store.generation_path(storage_key)
            if final.exists():
                raise GenerationStateError(
                    "Unique generation storage key already exists."
                )
            os.replace(staging, final)
            self.store._fsync_directory(self.store.generations)
            self.store.activate(storage_key)
            self._best_effort_cleanup()
            return identifier
        finally:
            if staging.exists():
                make_tree_owner_writable(staging)
                shutil.rmtree(staging)

    def _copy_artifact(self, entry: ModelPlan, destination: Path) -> None:
        deadline = time.monotonic() + DOWNLOAD_TIMEOUT_SECONDS
        try:
            with self._open_source(entry, deadline) as source:
                headers = getattr(source, "headers", None)
                if headers is not None:
                    length_value = headers.get("Content-Length")
                    if length_value is not None and int(length_value) > entry.max_bytes:
                        raise ArtifactError(
                            f"Artifact for {entry.distribution} exceeds its size limit."
                        )
                    final_url = getattr(source, "geturl", lambda: "")()
                    if urlparse(final_url).scheme != "https":
                        raise ArtifactError(
                            "HTTPS artifact redirected to a non-HTTPS URL."
                        )
                digest = hashlib.sha256()
                written = 0
                with destination.open("xb") as output:
                    while True:
                        remaining = deadline - time.monotonic()
                        if remaining <= 0:
                            raise ArtifactError(
                                f"Artifact download timed out for {entry.distribution}."
                            )
                        self._set_read_timeout(source, remaining)
                        chunk = source.read(COPY_CHUNK_SIZE)
                        if time.monotonic() > deadline:
                            raise ArtifactError(
                                f"Artifact download timed out for {entry.distribution}."
                            )
                        if not chunk:
                            break
                        written += len(chunk)
                        if written > entry.max_bytes:
                            raise ArtifactError(
                                f"Artifact for {entry.distribution} "
                                "exceeds its size limit."
                            )
                        digest.update(chunk)
                        output.write(chunk)
                    output.flush()
                    os.fsync(output.fileno())
            actual = digest.hexdigest()
            if actual != entry.sha256:
                raise ArtifactError(
                    f"Artifact SHA-256 mismatch for {entry.distribution}: "
                    f"expected {entry.sha256}, got {actual}."
                )
        except ArtifactError:
            destination.unlink(missing_ok=True)
            raise
        except (OSError, ValueError) as error:
            destination.unlink(missing_ok=True)
            raise ArtifactError(
                f"Could not stage artifact for {entry.distribution}."
            ) from error

    @contextmanager
    def _open_source(
        self, entry: ModelPlan, deadline: float
    ) -> Iterator[BinaryIO | HttpResponse]:
        if entry.source.kind == "local":
            path = cast(Path, entry.source.location)
            base_directory = entry.source.base_directory
            if base_directory is None:
                raise ArtifactError("Local artifact has no trusted base directory.")
            relative = Path(entry.source.declared_location)
            if not relative.parts or any(
                part in {".", ".."} for part in relative.parts
            ):
                raise ArtifactError(
                    f"Local artifact for {entry.distribution} has an unsafe path."
                )
            directory_descriptor = os.open(
                base_directory,
                os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_NOFOLLOW", 0),
            )
            try:
                for component in relative.parts[:-1]:
                    next_descriptor = os.open(
                        component,
                        os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_NOFOLLOW", 0),
                        dir_fd=directory_descriptor,
                    )
                    os.close(directory_descriptor)
                    directory_descriptor = next_descriptor
                filename = relative.parts[-1]
                path_stat = os.stat(
                    filename, dir_fd=directory_descriptor, follow_symlinks=False
                )
                if not stat.S_ISREG(path_stat.st_mode):
                    raise ArtifactError(
                        f"Local artifact for {entry.distribution} must be a "
                        "regular file."
                    )
                if path_stat.st_size > entry.max_bytes:
                    raise ArtifactError(
                        f"Artifact for {entry.distribution} exceeds its size limit."
                    )
                descriptor = os.open(
                    filename,
                    os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0),
                    dir_fd=directory_descriptor,
                )
                with os.fdopen(descriptor, "rb") as source:
                    opened_stat = os.fstat(source.fileno())
                    if (
                        not stat.S_ISREG(opened_stat.st_mode)
                        or opened_stat.st_dev != path_stat.st_dev
                        or opened_stat.st_ino != path_stat.st_ino
                    ):
                        raise ArtifactError(
                            f"Local artifact for {entry.distribution} changed "
                            "while opening."
                        )
                    yield source
            except ArtifactError:
                raise
            except OSError as error:
                raise ArtifactError(
                    f"Could not open local artifact for {entry.distribution}: {path}."
                ) from error
            finally:
                os.close(directory_descriptor)
            return
        request = urllib.request.Request(
            cast(str, entry.source.location),
            headers={
                "Accept-Encoding": "identity",
                "User-Agent": "cat-spacy-provisioner/1",
            },
        )
        try:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ArtifactError(
                    f"Artifact download timed out for {entry.distribution}."
                )
            with cast(
                HttpResponse,
                urllib.request.urlopen(request, timeout=remaining),
            ) as response:
                yield response
        except ArtifactError:
            raise
        except Exception as error:
            raise ArtifactError(f"Could not download {entry.distribution}.") from error

    @staticmethod
    def _set_read_timeout(source: BinaryIO | HttpResponse, timeout: float) -> None:
        file = getattr(source, "fp", None)
        raw = getattr(file, "raw", None)
        socket = getattr(raw, "_sock", None)
        if socket is not None:
            socket.settimeout(timeout)

    def _find_reusable(self, plan: ProvisionPlan) -> tuple[str, str] | None:
        candidates: list[str] = []
        try:
            state = self.store.read_state()
            candidates.append(state.active_generation_key)
            if state.previous_generation_key is not None:
                candidates.append(state.previous_generation_key)
        except GenerationStateError:
            pass
        candidates.extend(
            path.name
            for path in sorted(self.store.generations.iterdir())
            if path.is_dir() and not path.name.startswith(".staging-")
        )
        for storage_key in dict.fromkeys(candidates):
            identifier = self._reusable_identifier(storage_key, plan)
            if identifier is not None:
                return storage_key, identifier
        return None

    def _reusable_identifier(self, storage_key: str, plan: ProvisionPlan) -> str | None:
        path = self.store.generation_path(storage_key)
        try:
            manifest = json.loads(
                (path / "manifest.json").read_text("utf-8"),
                object_pairs_hook=_unique_object,
            )
        except (OSError, UnicodeDecodeError, ValueError):
            return None
        if not (path / "site-packages").is_dir():
            return None
        if not isinstance(manifest, dict):
            return None
        installed_digest = manifest.get("sitePackagesDigest")
        if not isinstance(installed_digest, str):
            return None
        try:
            actual_installed_digest = site_packages_digest(path / "site-packages")
            if actual_installed_digest != installed_digest:
                return None
        except GenerationStateError:
            return None
        identity = self._identity(plan, actual_installed_digest)
        identifier = generation_id(identity)
        content_digest = manifest.get("contentDigest")
        if not isinstance(content_digest, str):
            return None
        payload = {
            key: value for key, value in manifest.items() if key != "contentDigest"
        }
        if hashlib.sha256(canonical_json(payload)).hexdigest() != content_digest:
            return None
        try:
            validated = [
                (entry, self._validate_model(entry, path / "site-packages"))
                for entry in plan.models
            ]
        except ModelValidationError:
            return None
        if manifest != self._manifest(
            identifier, identity, validated, plan, installed_digest
        ):
            return None
        return identifier

    def _identity(
        self, plan: ProvisionPlan, installed_digest: str
    ) -> GenerationIdentity:
        return GenerationIdentity(
            plan_digest=plan.digest,
            schema_version=plan.schema_version,
            provisioner_version=PROVISIONER_VERSION,
            server_protocol_version=SERVER_PROTOCOL_VERSION,
            python_abi=self._python_abi,
            python_implementation=self._python_implementation,
            python_version=self._python_version,
            platform=self._platform,
            spacy_version=self._spacy_version,
            site_packages_digest=installed_digest,
        )

    def _manifest(
        self,
        identifier: str,
        identity: GenerationIdentity,
        models: list[tuple[ModelPlan, ValidatedModel]],
        plan: ProvisionPlan,
        installed_digest: str,
    ) -> dict[str, object]:
        identity_value = {
            "planDigest": identity.plan_digest,
            "schemaVersion": identity.schema_version,
            "provisionerVersion": identity.provisioner_version,
            "serverProtocolVersion": identity.server_protocol_version,
            "pythonAbi": identity.python_abi,
            "pythonImplementation": identity.python_implementation,
            "pythonVersion": identity.python_version,
            "platform": identity.platform,
            "spacyVersion": identity.spacy_version,
            "sitePackagesDigest": identity.site_packages_digest,
        }
        payload: dict[str, object] = {
            "schemaVersion": MANIFEST_SCHEMA_VERSION,
            "generationId": identifier,
            "identity": identity_value,
            "effectivePlan": plan.canonical_value(),
            "sitePackagesDigest": installed_digest,
            "models": [
                {
                    "languageId": entry.language_id,
                    "distribution": entry.distribution,
                    "importModule": entry.import_module,
                    "version": entry.version,
                    "semanticConfig": entry.pipeline.canonical_value(),
                    "pipeline": {
                        "id": validated.pipeline_id,
                        "version": validated.pipeline_version,
                    },
                    "asset": {
                        "id": f"{entry.distribution}-{entry.version}",
                        "version": entry.version,
                        "sha256": entry.sha256,
                    },
                }
                for entry, validated in models
            ],
        }
        return {
            **payload,
            "contentDigest": hashlib.sha256(canonical_json(payload)).hexdigest(),
        }

    @staticmethod
    def _write_manifest(path: Path, manifest: dict[str, object]) -> None:
        with path.open("xb") as output:
            output.write(canonical_json(manifest) + b"\n")
            output.flush()
            os.fsync(output.fileno())

    @staticmethod
    def _artifact_filename(entry: ModelPlan) -> str:
        if entry.source.kind == "local":
            filename = cast(Path, entry.source.location).name
        else:
            filename = Path(
                unquote(urlparse(cast(str, entry.source.location)).path)
            ).name
        if (
            not filename
            or filename != Path(filename).name
            or not filename.endswith(".whl")
        ):
            raise ArtifactError(
                f"Artifact for {entry.distribution} must have a wheel filename."
            )
        return filename

    @staticmethod
    def _validate_wheel(entry: ModelPlan, wheel: Path) -> None:
        try:
            distribution, version, _build, tags = parse_wheel_filename(wheel.name)
        except Exception as error:
            raise ArtifactError(f"Invalid wheel filename: {wheel.name}") from error
        if canonicalize_name(entry.distribution) != distribution:
            raise ArtifactError(
                f"Wheel distribution does not match {entry.distribution}: "
                f"{distribution}."
            )
        if Version(entry.version) != version:
            raise ArtifactError(
                f"Wheel version does not match {entry.distribution}: {version}."
            )
        compatible = set(sys_tags())
        if tags.isdisjoint(compatible):
            raise ArtifactError(
                f"Wheel is incompatible with this Python runtime: {wheel.name}"
            )

    def _best_effort_cleanup(self) -> None:
        try:
            self.store.cleanup()
        except OSError as error:
            print(f"Generation cleanup will be retried: {error}", file=sys.stderr)
