from __future__ import annotations

import hashlib
import importlib
import importlib.metadata
import json
import os
import platform as platform_module
import subprocess
import sys
import sysconfig
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

from .generations import (
    PLAN_SCHEMA_VERSION,
    PROVISIONER_VERSION,
    SERVER_PROTOCOL_VERSION,
    GenerationIdentity,
    GenerationStateError,
    GenerationStore,
    PinnedGeneration,
    ProvisionPlan,
    _unique_object,
    canonical_json,
    generation_id,
    parse_plan_bytes,
    site_packages_digest,
)


@dataclass(frozen=True)
class RuntimeModel:
    language_id: str
    distribution: str
    import_module: str
    version: str
    semantic_config: dict[str, object]
    pipeline: dict[str, str]
    asset: dict[str, str]


@dataclass(frozen=True)
class RuntimeManifest:
    generation_id: str
    identity: dict[str, str]
    models: tuple[RuntimeModel, ...]
    effective_plan: ProvisionPlan
    site_packages_digest: str


class UnsupportedLanguageError(ValueError):
    pass


def _require_object(value: object, keys: set[str], context: str) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != keys:
        raise GenerationStateError(f"Generation manifest has invalid {context}.")
    return cast(dict[str, object], value)


def _require_string(value: object, context: str) -> str:
    if not isinstance(value, str) or not value:
        raise GenerationStateError(f"Generation manifest has invalid {context}.")
    return value


def load_runtime_manifest(path: Path) -> RuntimeManifest:
    try:
        value = json.loads(path.read_text("utf-8"), object_pairs_hook=_unique_object)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        raise GenerationStateError("Generation manifest cannot be read.") from error
    manifest = _require_object(
        value,
        {
            "schemaVersion",
            "generationId",
            "identity",
            "effectivePlan",
            "models",
            "sitePackagesDigest",
            "contentDigest",
        },
        "root",
    )
    if manifest["schemaVersion"] != "1":
        raise GenerationStateError("Generation manifest schemaVersion is unsupported.")
    manifest_generation_id = _require_string(manifest["generationId"], "generationId")
    digest = _require_string(manifest["contentDigest"], "contentDigest")
    payload = {key: item for key, item in manifest.items() if key != "contentDigest"}
    if hashlib.sha256(canonical_json(payload)).hexdigest() != digest:
        raise GenerationStateError("Generation manifest contentDigest does not match.")
    identity_value = _require_object(
        manifest["identity"],
        {
            "planDigest",
            "schemaVersion",
            "provisionerVersion",
            "serverProtocolVersion",
            "pythonAbi",
            "pythonImplementation",
            "pythonVersion",
            "platform",
            "spacyVersion",
            "sitePackagesDigest",
        },
        "identity",
    )
    identity = {
        key: _require_string(item, f"identity.{key}")
        for key, item in identity_value.items()
    }
    expected_identity_versions = {
        "schemaVersion": PLAN_SCHEMA_VERSION,
        "provisionerVersion": PROVISIONER_VERSION,
        "serverProtocolVersion": SERVER_PROTOCOL_VERSION,
    }
    for key, expected in expected_identity_versions.items():
        if identity[key] != expected:
            raise GenerationStateError(
                f"Generation identity {key} is not supported by this runtime."
            )
    identity_contract = GenerationIdentity(
        plan_digest=identity["planDigest"],
        schema_version=identity["schemaVersion"],
        provisioner_version=identity["provisionerVersion"],
        server_protocol_version=identity["serverProtocolVersion"],
        python_abi=identity["pythonAbi"],
        python_implementation=identity["pythonImplementation"],
        python_version=identity["pythonVersion"],
        platform=identity["platform"],
        spacy_version=identity["spacyVersion"],
        site_packages_digest=identity["sitePackagesDigest"],
    )
    if generation_id(identity_contract) != manifest_generation_id:
        raise GenerationStateError("Generation ID does not match its identity.")
    current_runtime = {
        "pythonAbi": sys.implementation.cache_tag,
        "pythonImplementation": sys.implementation.name,
        "pythonVersion": platform_module.python_version(),
        "platform": sysconfig.get_platform(),
        "spacyVersion": importlib.metadata.version("spacy"),
    }
    for key, actual in current_runtime.items():
        if identity[key] != actual:
            raise GenerationStateError(
                f"Generation identity {key} is incompatible with this runtime."
            )
    effective_plan = _require_object(
        manifest["effectivePlan"], {"schemaVersion", "models"}, "effectivePlan"
    )
    if identity["schemaVersion"] != effective_plan["schemaVersion"]:
        raise GenerationStateError("Generation plan schema identity does not match.")
    parsed_plan = parse_plan_bytes(
        canonical_json(effective_plan), path, allow_local=True
    )
    if parsed_plan.digest != identity["planDigest"]:
        raise GenerationStateError("Generation plan digest does not match.")
    raw_models = manifest["models"]
    if not isinstance(raw_models, list) or not raw_models:
        raise GenerationStateError("Generation manifest has no models.")
    models: list[RuntimeModel] = []
    for raw_model in raw_models:
        model = _require_object(
            raw_model,
            {
                "languageId",
                "distribution",
                "importModule",
                "version",
                "semanticConfig",
                "pipeline",
                "asset",
            },
            "model",
        )
        semantic = _require_object(
            model["semanticConfig"],
            {"disabledPipes", "sentenceBoundary"},
            "semanticConfig",
        )
        disabled = semantic["disabledPipes"]
        if (
            not isinstance(disabled, list)
            or not all(isinstance(item, str) for item in disabled)
            or semantic["sentenceBoundary"] != "sentencizer"
        ):
            raise GenerationStateError("Generation semanticConfig is invalid.")
        pipeline_value = _require_object(
            model["pipeline"], {"id", "version"}, "pipeline"
        )
        asset_value = _require_object(
            model["asset"], {"id", "version", "sha256"}, "asset"
        )
        models.append(
            RuntimeModel(
                language_id=_require_string(model["languageId"], "languageId"),
                distribution=_require_string(model["distribution"], "distribution"),
                import_module=_require_string(model["importModule"], "importModule"),
                version=_require_string(model["version"], "version"),
                semantic_config={
                    "disabledPipes": list(disabled),
                    "sentenceBoundary": "sentencizer",
                },
                pipeline={
                    key: _require_string(item, f"pipeline.{key}")
                    for key, item in pipeline_value.items()
                },
                asset={
                    key: _require_string(item, f"asset.{key}")
                    for key, item in asset_value.items()
                },
            )
        )
    language_ids = [model.language_id for model in models]
    if len(language_ids) != len(set(language_ids)):
        raise GenerationStateError("Generation manifest has duplicate language IDs.")
    planned_models = {entry.language_id: entry for entry in parsed_plan.models}
    for runtime_model in models:
        planned = planned_models.get(runtime_model.language_id)
        if (
            planned is None
            or runtime_model.distribution != planned.distribution
            or runtime_model.import_module != planned.import_module
            or runtime_model.version != planned.version
            or runtime_model.semantic_config != planned.pipeline.canonical_value()
            or runtime_model.asset["id"] != f"{planned.distribution}-{planned.version}"
            or runtime_model.asset["version"] != planned.version
            or runtime_model.asset["sha256"] != planned.sha256
        ):
            raise GenerationStateError(
                "Generation runtime model does not match its effective plan."
            )
    if len(models) != len(parsed_plan.models):
        raise GenerationStateError("Generation runtime model set is incomplete.")
    installed_digest = _require_string(
        manifest["sitePackagesDigest"], "sitePackagesDigest"
    )
    if installed_digest != identity["sitePackagesDigest"]:
        raise GenerationStateError(
            "Generation installed tree digest does not match its identity."
        )
    return RuntimeManifest(
        manifest_generation_id,
        identity,
        tuple(models),
        parsed_plan,
        installed_digest,
    )


def _validate_generation_models(manifest: RuntimeManifest, site_packages: Path) -> None:
    models = {model.language_id: model for model in manifest.models}
    for entry in manifest.effective_plan.models:
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
            ValueError,
        ) as error:
            raise GenerationStateError(
                "Generation model failed isolated startup validation."
            ) from error
        runtime_model = models[entry.language_id]
        if (
            not isinstance(value, dict)
            or set(value) != {"pipelineId", "pipelineVersion"}
            or value["pipelineId"] != runtime_model.pipeline["id"]
            or value["pipelineVersion"] != runtime_model.pipeline["version"]
        ):
            raise GenerationStateError(
                "Generation model startup validation does not match its manifest."
            )


class GenerationRuntime:
    def __init__(self, pinned: PinnedGeneration, manifest: RuntimeManifest) -> None:
        self._pinned = pinned
        self.manifest = manifest
        self._models = {model.language_id: model for model in manifest.models}
        self._loaded_models: dict[str, Any] = {}
        self._import_path_added = False

    @classmethod
    def open_active(
        cls, store: GenerationStore, *, validate_models: bool = True
    ) -> GenerationRuntime:
        pinned = store.pin_active()
        return cls._from_pinned(pinned, validate_models=validate_models)

    @classmethod
    def open_generation(
        cls,
        store: GenerationStore,
        storage_key: str,
        *,
        expected_generation_id: str | None = None,
        validate_models: bool = True,
    ) -> GenerationRuntime:
        return cls._from_pinned(
            store.pin_generation(storage_key),
            expected_generation_id=expected_generation_id,
            validate_models=validate_models,
        )

    @classmethod
    def _from_pinned(
        cls,
        pinned: PinnedGeneration,
        *,
        expected_generation_id: str | None = None,
        validate_models: bool,
    ) -> GenerationRuntime:
        try:
            manifest = load_runtime_manifest(pinned.path / "manifest.json")
            if (
                expected_generation_id is not None
                and manifest.generation_id != expected_generation_id
            ):
                raise GenerationStateError(
                    "Generation manifest does not match the requested identity."
                )
            if not (pinned.path / "site-packages").is_dir():
                raise GenerationStateError("Generation site-packages is missing.")
            if (
                site_packages_digest(pinned.path / "site-packages")
                != manifest.site_packages_digest
            ):
                raise GenerationStateError(
                    "Generation site-packages digest does not match."
                )
            if validate_models:
                _validate_generation_models(manifest, pinned.path / "site-packages")
            return cls(pinned, manifest)
        except BaseException:
            pinned.close()
            raise

    @property
    def generation_id(self) -> str:
        return self.manifest.generation_id

    @property
    def storage_key(self) -> str:
        return self._pinned.storage_key

    def generation_identity(self) -> dict[str, str]:
        return {"id": self.generation_id, **self.manifest.identity}

    def capabilities(self) -> dict[str, object]:
        return {
            "generation": self.generation_identity(),
            "engine": {
                "name": "spaCy",
                "version": self.manifest.identity["spacyVersion"],
            },
            "languages": [
                {
                    "languageId": model.language_id,
                    "semanticConfig": model.semantic_config,
                    "pipeline": model.pipeline,
                    "model": {"id": model.distribution, "version": model.version},
                    "assets": [model.asset],
                }
                for model in self.manifest.models
            ],
        }

    def attestation(self, language_id: str) -> dict[str, object]:
        model = self._require_model(language_id)
        return {
            "contract": "cat.language-analysis/v1",
            "languageId": language_id,
            "generation": self.generation_identity(),
            "semanticConfig": model.semantic_config,
            "engine": {
                "name": "spaCy",
                "version": self.manifest.identity["spacyVersion"],
            },
            "pipeline": model.pipeline,
            "model": {"id": model.distribution, "version": model.version},
            "assets": [model.asset],
        }

    def get_model(self, language_id: str) -> Any:
        model = self._require_model(language_id)
        loaded = self._loaded_models.get(language_id)
        if loaded is not None:
            return loaded
        if not self._import_path_added:
            sys.path.insert(0, str(self._pinned.path / "site-packages"))
            importlib.invalidate_caches()
            self._import_path_added = True
        import spacy

        loaded = spacy.load(
            model.import_module,
            disable=cast(list[str], model.semantic_config["disabledPipes"]),
        )
        boundary = cast(str, model.semantic_config["sentenceBoundary"])
        if not loaded.has_pipe(boundary):
            loaded.add_pipe(boundary)
        self._loaded_models[language_id] = loaded
        return loaded

    def close(self) -> None:
        if self._import_path_added:
            import_path = str(self._pinned.path / "site-packages")
            if import_path in sys.path:
                sys.path.remove(import_path)
            self._import_path_added = False
        self._pinned.close()

    def __enter__(self) -> GenerationRuntime:
        return self

    def __exit__(self, *_args: object) -> None:
        self.close()

    def _require_model(self, language_id: str) -> RuntimeModel:
        model = self._models.get(language_id)
        if model is None:
            raise UnsupportedLanguageError(
                f"Unsupported languageId: {language_id}. "
                f"Available: {sorted(self._models)}"
            )
        return model
