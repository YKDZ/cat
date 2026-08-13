from __future__ import annotations

import fcntl
import hashlib
import json
import os
import re
import shutil
import stat
import sys
import time
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import BinaryIO, Literal, cast

from langcodes import standardize_tag, tag_is_valid

PLAN_SCHEMA_VERSION = "1"
STATE_SCHEMA_VERSION = "2"
PROVISIONER_VERSION = "1"
SERVER_PROTOCOL_VERSION = "1"
_SHA256_PATTERN = re.compile(r"^[a-f0-9]{64}$")
_PACKAGE_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")
_VERSION_PATTERN = re.compile(r"^[0-9]+(?:\.[0-9]+)*(?:[a-z0-9.-]+)?$")


class PlanError(ValueError):
    pass


class GenerationStateError(RuntimeError):
    pass


@dataclass(frozen=True)
class ArtifactSource:
    kind: Literal["https", "local"]
    declared_location: str
    location: str | Path
    base_directory: Path | None = None

    def canonical_value(self) -> dict[str, str]:
        key = "url" if self.kind == "https" else "path"
        return {"kind": self.kind, key: self.declared_location}


@dataclass(frozen=True)
class PipelineSettings:
    disabled_pipes: tuple[str, ...]
    sentence_boundary: str

    def canonical_value(self) -> dict[str, object]:
        return {
            "disabledPipes": list(self.disabled_pipes),
            "sentenceBoundary": self.sentence_boundary,
        }


@dataclass(frozen=True)
class ModelPlan:
    language_id: str
    distribution: str
    import_module: str
    version: str
    source: ArtifactSource
    sha256: str
    max_bytes: int
    validation_text: str
    pipeline: PipelineSettings

    def canonical_value(self) -> dict[str, object]:
        return {
            "languageId": self.language_id,
            "distribution": self.distribution,
            "importModule": self.import_module,
            "maxBytes": self.max_bytes,
            "pipeline": self.pipeline.canonical_value(),
            "sha256": self.sha256,
            "source": self.source.canonical_value(),
            "validationText": self.validation_text,
            "version": self.version,
        }


@dataclass(frozen=True)
class ProvisionPlan:
    schema_version: str
    models: tuple[ModelPlan, ...]

    def canonical_value(self) -> dict[str, object]:
        return {
            "models": [entry.canonical_value() for entry in self.models],
            "schemaVersion": self.schema_version,
        }

    @property
    def digest(self) -> str:
        return hashlib.sha256(canonical_json(self.canonical_value())).hexdigest()


@dataclass(frozen=True)
class GenerationIdentity:
    plan_digest: str
    schema_version: str
    provisioner_version: str
    server_protocol_version: str
    python_abi: str
    python_implementation: str
    python_version: str
    platform: str
    spacy_version: str
    site_packages_digest: str


@dataclass(frozen=True)
class GenerationState:
    active_generation_key: str
    previous_generation_key: str | None


class PinnedGeneration:
    def __init__(self, storage_key: str, path: Path, lease: BinaryIO) -> None:
        self.storage_key = storage_key
        self.path = path
        self._lease = lease

    def close(self) -> None:
        if self._lease.closed:
            return
        fcntl.flock(self._lease, fcntl.LOCK_UN)
        self._lease.close()

    def __enter__(self) -> PinnedGeneration:
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()


def canonical_json(value: object) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, separators=(",", ":"), sort_keys=True
    ).encode("utf-8")


def canonical_language_id(value: object) -> str:
    if not isinstance(value, str) or not value or value != value.strip():
        raise PlanError("languageId must be a non-empty canonical BCP 47 tag.")
    if not tag_is_valid(value):
        raise PlanError(f"Invalid BCP 47 languageId: {value}")
    result = standardize_tag(value)
    if result != value:
        raise PlanError(f"languageId must be canonical: {result}")
    return result


def _strict_object(
    value: object, expected_keys: set[str], context: str
) -> dict[str, object]:
    if not isinstance(value, dict):
        raise PlanError(f"{context} must be an object.")
    keys = set(value)
    if keys != expected_keys:
        missing = sorted(expected_keys - keys)
        unknown = sorted(keys - expected_keys)
        raise PlanError(
            f"{context} has invalid fields; missing={missing}, unknown={unknown}."
        )
    return cast(dict[str, object], value)


def _string(value: object, context: str) -> str:
    if not isinstance(value, str) or not value:
        raise PlanError(f"{context} must be a non-empty string.")
    return value


def _parse_source(value: object, plan_path: Path, allow_local: bool) -> ArtifactSource:
    if not isinstance(value, dict):
        raise PlanError("model source must be an object.")
    kind = value.get("kind")
    if kind == "https":
        source = _strict_object(value, {"kind", "url"}, "HTTPS source")
        url = _string(source["url"], "source.url")
        if not url.startswith("https://"):
            raise PlanError("Remote model artifacts must use HTTPS.")
        return ArtifactSource("https", url, url)
    if kind == "local":
        source = _strict_object(value, {"kind", "path"}, "local source")
        if not allow_local:
            raise PlanError("Local artifacts are allowed only in an external plan.")
        declared = _string(source["path"], "source.path")
        relative = Path(declared)
        if relative.is_absolute():
            raise PlanError(
                "Local artifact paths must be relative to the external plan."
            )
        plan_directory = plan_path.parent.resolve()
        location = Path(os.path.abspath(plan_directory / relative))
        if not location.is_relative_to(plan_directory):
            raise PlanError(
                "Local artifact paths must be contained by the external plan directory."
            )
        return ArtifactSource("local", declared, location, plan_directory)
    raise PlanError("model source.kind must be 'https' or 'local'.")


def _parse_model(value: object, plan_path: Path, allow_local: bool) -> ModelPlan:
    item = _strict_object(
        value,
        {
            "languageId",
            "distribution",
            "importModule",
            "version",
            "source",
            "sha256",
            "maxBytes",
            "validationText",
            "pipeline",
        },
        "model",
    )
    distribution = _string(item["distribution"], "model.distribution")
    import_module = _string(item["importModule"], "model.importModule")
    version = _string(item["version"], "model.version")
    digest = _string(item["sha256"], "model.sha256")
    if _PACKAGE_PATTERN.fullmatch(distribution) is None:
        raise PlanError(f"Invalid model distribution: {distribution}")
    if _PACKAGE_PATTERN.fullmatch(import_module) is None:
        raise PlanError(f"Invalid model importModule: {import_module}")
    if _VERSION_PATTERN.fullmatch(version) is None:
        raise PlanError(f"Invalid model version: {version}")
    if _SHA256_PATTERN.fullmatch(digest) is None:
        raise PlanError("model.sha256 must be 64 lowercase hexadecimal characters.")
    max_bytes = item["maxBytes"]
    if isinstance(max_bytes, bool) or not isinstance(max_bytes, int) or max_bytes <= 0:
        raise PlanError("model.maxBytes must be a positive integer.")
    pipeline = _strict_object(
        item["pipeline"], {"disabledPipes", "sentenceBoundary"}, "model.pipeline"
    )
    disabled = pipeline["disabledPipes"]
    if not isinstance(disabled, list) or not all(
        isinstance(pipe, str) and pipe for pipe in disabled
    ):
        raise PlanError("pipeline.disabledPipes must be an array of strings.")
    if len(set(disabled)) != len(disabled):
        raise PlanError("pipeline.disabledPipes must not contain duplicates.")
    sentence_boundary = _string(
        pipeline["sentenceBoundary"], "pipeline.sentenceBoundary"
    )
    if sentence_boundary != "sentencizer":
        raise PlanError("pipeline.sentenceBoundary must be 'sentencizer'.")
    validation_text = _string(item["validationText"], "model.validationText")
    return ModelPlan(
        language_id=canonical_language_id(item["languageId"]),
        distribution=distribution,
        import_module=import_module,
        version=version,
        source=_parse_source(item["source"], plan_path, allow_local),
        sha256=digest,
        max_bytes=max_bytes,
        validation_text=validation_text,
        pipeline=PipelineSettings(tuple(disabled), sentence_boundary),
    )


def parse_plan_bytes(
    data: bytes, path: Path, *, allow_local: bool = False
) -> ProvisionPlan:
    try:
        value = json.loads(data.decode("utf-8"), object_pairs_hook=_unique_object)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PlanError(f"Could not parse provision plan {path}: {error}") from error
    plan = _strict_object(value, {"schemaVersion", "models"}, "plan")
    schema_version = _string(plan["schemaVersion"], "plan.schemaVersion")
    if schema_version != PLAN_SCHEMA_VERSION:
        raise PlanError(f"Unsupported plan schemaVersion: {schema_version}")
    models = plan["models"]
    if not isinstance(models, list) or not models:
        raise PlanError("plan.models must be a non-empty array.")
    parsed = tuple(
        sorted(
            (_parse_model(item, path, allow_local) for item in models),
            key=lambda entry: entry.language_id,
        )
    )
    language_ids = [entry.language_id for entry in parsed]
    packages = [entry.distribution for entry in parsed]
    import_modules = [entry.import_module for entry in parsed]
    if len(language_ids) != len(set(language_ids)):
        raise PlanError("plan languageId values must be unique.")
    if len(packages) != len(set(packages)):
        raise PlanError("plan distribution values must be unique.")
    if len(import_modules) != len(set(import_modules)):
        raise PlanError("plan importModule values must be unique.")
    return ProvisionPlan(schema_version, parsed)


def load_plan(path: Path, *, allow_local: bool = False) -> ProvisionPlan:
    try:
        data = path.read_bytes()
    except OSError as error:
        raise PlanError(f"Could not read provision plan {path}: {error}") from error
    return parse_plan_bytes(data, path, allow_local=allow_local)


def compose_plan(
    default: ProvisionPlan, extension: ProvisionPlan | None
) -> ProvisionPlan:
    if extension is None:
        return default
    if extension.schema_version != default.schema_version:
        raise PlanError("External and default plan schemaVersion values must match.")
    default_languages = {entry.language_id for entry in default.models}
    default_packages = {entry.distribution for entry in default.models}
    default_import_modules = {entry.import_module for entry in default.models}
    for entry in extension.models:
        if entry.language_id in default_languages:
            raise PlanError(
                f"External plan conflicts with default languageId: {entry.language_id}"
            )
        if entry.distribution in default_packages:
            raise PlanError(
                "External plan conflicts with default distribution: "
                f"{entry.distribution}"
            )
        if entry.import_module in default_import_modules:
            raise PlanError(
                "External plan conflicts with default importModule: "
                f"{entry.import_module}"
            )
    combined = tuple(
        sorted(
            (*default.models, *extension.models), key=lambda entry: entry.language_id
        )
    )
    return ProvisionPlan(default.schema_version, combined)


def generation_id(identity: GenerationIdentity) -> str:
    digest = hashlib.sha256(canonical_json(asdict(identity))).hexdigest()
    return f"sha256:{digest}"


def site_packages_digest(root: Path) -> str:
    try:
        root_stat = root.lstat()
    except OSError as error:
        raise GenerationStateError(
            "Generation site-packages cannot be read."
        ) from error
    if not stat.S_ISDIR(root_stat.st_mode):
        raise GenerationStateError("Generation site-packages is not a directory.")

    digest = hashlib.sha256()

    def visit(directory: Path, relative: Path) -> None:
        try:
            entries = sorted(os.scandir(directory), key=lambda entry: entry.name)
        except OSError as error:
            raise GenerationStateError(
                "Generation site-packages cannot be enumerated."
            ) from error
        for entry in entries:
            entry_relative = relative / entry.name
            try:
                entry_stat = entry.stat(follow_symlinks=False)
            except OSError as error:
                raise GenerationStateError(
                    "Generation site-packages entry cannot be inspected."
                ) from error
            if stat.S_ISLNK(entry_stat.st_mode):
                raise GenerationStateError(
                    "Generation site-packages must not contain symlinks."
                )
            if stat.S_ISDIR(entry_stat.st_mode):
                visit(Path(entry.path), entry_relative)
                continue
            if not stat.S_ISREG(entry_stat.st_mode):
                raise GenerationStateError(
                    "Generation site-packages must contain only regular files."
                )
            if entry.name.endswith(".pyc"):
                continue
            path_bytes = entry_relative.as_posix().encode("utf-8")
            digest.update(len(path_bytes).to_bytes(8, "big"))
            digest.update(path_bytes)
            digest.update(entry_stat.st_size.to_bytes(8, "big"))
            try:
                descriptor = os.open(
                    entry.path,
                    os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0),
                )
                with os.fdopen(descriptor, "rb") as source:
                    opened_stat = os.fstat(source.fileno())
                    if (
                        not stat.S_ISREG(opened_stat.st_mode)
                        or opened_stat.st_dev != entry_stat.st_dev
                        or opened_stat.st_ino != entry_stat.st_ino
                    ):
                        raise GenerationStateError(
                            "Generation site-packages changed while hashing."
                        )
                    while chunk := source.read(1024 * 1024):
                        digest.update(chunk)
            except OSError as error:
                raise GenerationStateError(
                    "Generation site-packages file cannot be read."
                ) from error

    visit(root, Path())
    return digest.hexdigest()


def make_tree_read_only(root: Path) -> None:
    paths = [root, *root.rglob("*")]
    for path in reversed(paths):
        path_stat = path.lstat()
        if stat.S_ISLNK(path_stat.st_mode):
            raise GenerationStateError("Generation tree must not contain symlinks.")
        os.chmod(path, stat.S_IMODE(path_stat.st_mode) & ~0o222)


def make_tree_owner_writable(root: Path) -> None:
    if not root.exists():
        return
    paths = [root, *root.rglob("*")]
    for path in paths:
        path_stat = path.lstat()
        if stat.S_ISLNK(path_stat.st_mode):
            continue
        owner_bits = stat.S_IWUSR
        if stat.S_ISDIR(path_stat.st_mode):
            owner_bits |= stat.S_IRUSR | stat.S_IXUSR
        os.chmod(path, stat.S_IMODE(path_stat.st_mode) | owner_bits)


def fsync_tree(root: Path) -> None:
    def visit(path: Path) -> None:
        path_stat = path.lstat()
        if stat.S_ISLNK(path_stat.st_mode):
            raise GenerationStateError("Generation tree must not contain symlinks.")
        if stat.S_ISREG(path_stat.st_mode):
            descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
            try:
                opened_stat = os.fstat(descriptor)
                if (
                    not stat.S_ISREG(opened_stat.st_mode)
                    or opened_stat.st_dev != path_stat.st_dev
                    or opened_stat.st_ino != path_stat.st_ino
                ):
                    raise GenerationStateError("Generation tree changed while syncing.")
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
            return
        if not stat.S_ISDIR(path_stat.st_mode):
            raise GenerationStateError(
                "Generation tree must contain only directories and regular files."
            )
        with os.scandir(path) as iterator:
            children = sorted(iterator, key=lambda entry: entry.name)
        for child in children:
            visit(Path(child.path))
        descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)

    visit(root)


class GenerationStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.generations = root / "generations"
        self.locks = root / "locks"
        self.generation_locks = self.locks / "generations"
        self.state_path = root / "state.json"
        self.generations.mkdir(parents=True, exist_ok=True)
        self.generation_locks.mkdir(parents=True, exist_ok=True)

    def generation_path(self, storage_key: str) -> Path:
        if not storage_key or "/" in storage_key or storage_key in {".", ".."}:
            raise GenerationStateError("Invalid generation storage key.")
        return self.generations / storage_key

    def create_generation_for_test(self, generation: str) -> None:
        path = self.generation_path(generation)
        path.mkdir(parents=True, exist_ok=True)
        (path / "manifest.json").write_text("{}\n", encoding="utf-8")

    def read_state(self) -> GenerationState:
        try:
            value = json.loads(
                self.state_path.read_text(encoding="utf-8"),
                object_pairs_hook=_unique_object,
            )
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, PlanError) as error:
            raise GenerationStateError(
                "No valid active generation state exists."
            ) from error
        if not isinstance(value, dict) or set(value) != {
            "schemaVersion",
            "activeGenerationKey",
            "previousGenerationKey",
        }:
            raise GenerationStateError("Generation state has an invalid shape.")
        if value["schemaVersion"] != STATE_SCHEMA_VERSION:
            raise GenerationStateError("Generation state schemaVersion is unsupported.")
        active = value["activeGenerationKey"]
        previous = value["previousGenerationKey"]
        if not isinstance(active, str) or not active:
            raise GenerationStateError("Generation state has no active generation.")
        if previous is not None and (not isinstance(previous, str) or not previous):
            raise GenerationStateError("Generation previous storage key is invalid.")
        if not (self.generation_path(active) / "manifest.json").is_file():
            raise GenerationStateError("Active generation storage is incomplete.")
        if (
            previous is not None
            and not (self.generation_path(previous) / "manifest.json").is_file()
        ):
            raise GenerationStateError("Previous generation storage is incomplete.")
        return GenerationState(active, previous)

    def activate(self, storage_key: str) -> None:
        if not (self.generation_path(storage_key) / "manifest.json").is_file():
            raise GenerationStateError("Cannot activate incomplete generation storage.")
        previous: str | None = None
        if self.state_path.exists():
            current = self.read_state()
            if current.active_generation_key == storage_key:
                return
            previous = current.active_generation_key
        value = {
            "schemaVersion": STATE_SCHEMA_VERSION,
            "activeGenerationKey": storage_key,
            "previousGenerationKey": previous,
        }
        temporary = self.root / f".state.json.{os.getpid()}.{uuid.uuid4().hex}"
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            data = canonical_json(value) + b"\n"
            offset = 0
            while offset < len(data):
                offset += os.write(descriptor, data[offset:])
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        try:
            os.replace(temporary, self.state_path)
            self._fsync_directory(self.root)
        finally:
            temporary.unlink(missing_ok=True)

    def open_lease(self, storage_key: str) -> BinaryIO:
        path = self.generation_locks / f"{storage_key}.lock"
        return path.open("a+b")

    def pin_generation(self, storage_key: str) -> PinnedGeneration:
        path = self.generation_path(storage_key)
        if not (path / "manifest.json").is_file():
            raise GenerationStateError(f"Generation is incomplete: {storage_key}")
        lease = self.open_lease(storage_key)
        try:
            fcntl.flock(lease, fcntl.LOCK_SH)
            if not (path / "manifest.json").is_file():
                raise GenerationStateError(f"Generation disappeared: {storage_key}")
            return PinnedGeneration(storage_key, path, lease)
        except BaseException:
            lease.close()
            raise

    def pin_active(
        self, before_lock: Callable[[str], None] | None = None
    ) -> PinnedGeneration:
        while True:
            active = self.read_state().active_generation_key
            if before_lock is not None:
                before_lock(active)
            pinned = self.pin_generation(active)
            try:
                if self.read_state().active_generation_key == active:
                    return pinned
            except BaseException:
                pinned.close()
                raise
            pinned.close()

    @contextmanager
    def provision_lock(
        self, *, timeout_seconds: float = 60.0, poll_seconds: float = 0.05
    ) -> Iterator[None]:
        path = self.locks / "provision.lock"
        with path.open("a+b") as lock:
            deadline = time.monotonic() + timeout_seconds
            while True:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError as error:
                    if time.monotonic() >= deadline:
                        raise TimeoutError(
                            "Timed out waiting for the provision lock."
                        ) from error
                    time.sleep(poll_seconds)
            try:
                yield
            finally:
                fcntl.flock(lock, fcntl.LOCK_UN)

    def cleanup(self) -> list[str]:
        state = self.read_state()
        retained = {
            state.active_generation_key,
            state.previous_generation_key,
        }
        removed: list[str] = []
        for path in sorted(self.generations.iterdir(), key=lambda item: item.name):
            if not path.is_dir() or path.name.startswith(".") or path.name in retained:
                continue
            lease = self.open_lease(path.name)
            try:
                try:
                    fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    continue
                try:
                    make_tree_owner_writable(path)
                    shutil.rmtree(path)
                    removed.append(path.name)
                except OSError as error:
                    print(
                        f"Could not clean generation {path.name}; will retry: {error}",
                        file=sys.stderr,
                    )
            finally:
                lease.close()
        return removed

    def cleanup_staging(self) -> list[str]:
        removed: list[str] = []
        for path in sorted(self.generations.glob(".staging-*")):
            try:
                make_tree_owner_writable(path)
                shutil.rmtree(path)
                removed.append(path.name)
            except OSError as error:
                print(
                    f"Could not clean staging generation {path.name}; "
                    f"will retry: {error}",
                    file=sys.stderr,
                )
        return removed

    @staticmethod
    def _fsync_directory(path: Path) -> None:
        descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def _unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    value: dict[str, object] = {}
    for key, item in pairs:
        if key in value:
            raise PlanError(f"Duplicate JSON object key: {key}")
        value[key] = item
    return value
