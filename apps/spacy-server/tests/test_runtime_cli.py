from __future__ import annotations

import hashlib
import importlib.metadata
import json
import platform as platform_module
import subprocess
import sys
import sysconfig
import tempfile
import unittest
from collections.abc import Callable
from pathlib import Path
from typing import cast
from unittest import mock

from src.generations import (
    GenerationIdentity,
    GenerationStateError,
    GenerationStore,
    canonical_json,
    generation_id,
)
from src.provisioner import ModelValidationError, validate_installed_model
from src.runtime import GenerationRuntime


def write_generation(store: GenerationStore, marker: str, language_id: str) -> str:
    effective_plan = {
        "schemaVersion": "1",
        "models": [
            {
                "languageId": language_id,
                "distribution": "en_core_web_sm",
                "importModule": "en_core_web_sm",
                "version": "3.8.0",
                "source": {
                    "kind": "https",
                    "url": "https://example.invalid/en_core_web_sm-3.8.0-py3-none-any.whl",
                },
                "sha256": "b" * 64,
                "maxBytes": 1024,
                "validationText": f"Validation {marker}. Second sentence.",
                "pipeline": {
                    "disabledPipes": ["ner", "parser"],
                    "sentenceBoundary": "sentencizer",
                },
            }
        ],
    }
    plan_digest = hashlib.sha256(canonical_json(effective_plan)).hexdigest()
    installed_digest = hashlib.sha256().hexdigest()
    identity = GenerationIdentity(
        plan_digest=plan_digest,
        schema_version="1",
        provisioner_version="1",
        server_protocol_version="1",
        python_abi=sys.implementation.cache_tag,
        python_implementation=sys.implementation.name,
        python_version=platform_module.python_version(),
        platform=sysconfig.get_platform(),
        spacy_version=importlib.metadata.version("spacy"),
        site_packages_digest=installed_digest,
    )
    identifier = generation_id(identity)
    path = store.generation_path(identifier)
    (path / "site-packages").mkdir(parents=True, exist_ok=True)
    manifest = {
        "schemaVersion": "1",
        "generationId": identifier,
        "identity": {
            "planDigest": plan_digest,
            "schemaVersion": "1",
            "provisionerVersion": "1",
            "serverProtocolVersion": "1",
            "pythonAbi": identity.python_abi,
            "pythonImplementation": identity.python_implementation,
            "pythonVersion": identity.python_version,
            "platform": identity.platform,
            "spacyVersion": identity.spacy_version,
            "sitePackagesDigest": identity.site_packages_digest,
        },
        "effectivePlan": effective_plan,
        "sitePackagesDigest": installed_digest,
        "models": [
            {
                "languageId": language_id,
                "distribution": "en_core_web_sm",
                "importModule": "en_core_web_sm",
                "version": "3.8.0",
                "semanticConfig": {
                    "disabledPipes": ["ner", "parser"],
                    "sentenceBoundary": "sentencizer",
                },
                "pipeline": {"id": "sentencizer", "version": "1"},
                "asset": {
                    "id": "en_core_web_sm-3.8.0",
                    "version": "3.8.0",
                    "sha256": "b" * 64,
                },
            }
        ],
    }
    manifest["contentDigest"] = hashlib.sha256(canonical_json(manifest)).hexdigest()
    (path / "manifest.json").write_text(json.dumps(manifest), "utf-8")
    return identifier


def rewrite_manifest(
    path: Path, mutate: Callable[[dict[str, object]], None]
) -> dict[str, object]:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    mutate(manifest)
    manifest.pop("contentDigest", None)
    manifest["contentDigest"] = hashlib.sha256(canonical_json(manifest)).hexdigest()
    path.write_text(json.dumps(manifest), encoding="utf-8")
    return cast(dict[str, object], manifest)


class RuntimeTest(unittest.TestCase):
    def test_pins_one_manifest_for_capabilities_and_attestation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = GenerationStore(Path(directory))
            identifier = write_generation(store, "a", "en")
            store.activate(identifier)

            with GenerationRuntime.open_active(store, validate_models=False) as runtime:
                capabilities = runtime.capabilities()
                attestation = runtime.attestation("en")

            capability_generation = cast(dict[str, object], capabilities["generation"])
            attestation_generation = cast(dict[str, object], attestation["generation"])
            self.assertEqual(capability_generation["id"], identifier)
            self.assertEqual(attestation_generation["id"], identifier)
            self.assertEqual(attestation["languageId"], "en")

    def test_running_process_stays_pinned_after_new_activations(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = GenerationStore(Path(directory))
            first = write_generation(store, "a", "en")
            second = write_generation(store, "b", "en")
            third = write_generation(store, "c", "en")
            store.activate(first)
            runtime = GenerationRuntime.open_active(store, validate_models=False)
            self.addCleanup(runtime.close)
            store.activate(second)
            store.activate(third)

            self.assertEqual(runtime.generation_id, first)
            self.assertEqual(store.cleanup(), [])
            self.assertTrue(store.generation_path(first).exists())

            runtime.close()
            self.assertEqual(store.cleanup(), [first])
            with GenerationRuntime.open_active(
                store, validate_models=False
            ) as restarted:
                self.assertEqual(restarted.generation_id, third)

    def test_rejects_manifest_that_does_not_match_the_pinned_directory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = GenerationStore(Path(directory))
            identifier = write_generation(store, "a", "en")
            manifest_path = store.generation_path(identifier) / "manifest.json"
            manifest = json.loads(manifest_path.read_text())
            manifest["generationId"] = "different"
            manifest_path.write_text(json.dumps(manifest))
            store.activate(identifier)

            with self.assertRaisesRegex(GenerationStateError, "manifest"):
                GenerationRuntime.open_active(store, validate_models=False)

    def test_startup_hard_fails_when_installed_model_validation_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = GenerationStore(Path(directory))
            identifier = write_generation(store, "a", "en")
            store.activate(identifier)

            with (
                mock.patch(
                    "src.runtime.subprocess.run",
                    side_effect=__import__("subprocess").CalledProcessError(
                        1, ["validator"]
                    ),
                ),
                self.assertRaisesRegex(GenerationStateError, "startup validation"),
            ):
                GenerationRuntime.open_active(store)

    def test_provisioning_validation_reports_subprocess_timeout(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = GenerationStore(Path(directory))
            identifier = write_generation(store, "a", "en")
            with GenerationRuntime.open_generation(
                store, identifier, validate_models=False
            ) as runtime:
                entry = runtime.manifest.effective_plan.models[0]

            with (
                mock.patch(
                    "src.provisioner.subprocess.run",
                    side_effect=subprocess.TimeoutExpired(["validator"], 1),
                ),
                self.assertRaisesRegex(ModelValidationError, "timed out"),
            ):
                validate_installed_model(entry, Path(directory), 1)

    def test_startup_rejects_site_packages_tampering(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = GenerationStore(Path(directory))
            identifier = write_generation(store, "a", "en")
            site_packages = store.generation_path(identifier) / "site-packages"
            (site_packages / "injected.py").write_text(
                "injected = True\n", encoding="utf-8"
            )
            store.activate(identifier)

            with self.assertRaisesRegex(GenerationStateError, "digest"):
                GenerationRuntime.open_active(store, validate_models=False)

    def test_rejects_noncurrent_generation_identity_versions(self) -> None:
        for identity_key in (
            "schemaVersion",
            "provisionerVersion",
            "serverProtocolVersion",
        ):
            with (
                self.subTest(identity_key=identity_key),
                tempfile.TemporaryDirectory() as directory,
            ):
                store = GenerationStore(Path(directory))
                identifier = write_generation(store, "a", "en")
                old_path = store.generation_path(identifier)

                def mutate(value: dict[str, object], key: str = identity_key) -> None:
                    cast(dict[str, object], value["identity"])[key] = "0"

                manifest = rewrite_manifest(old_path / "manifest.json", mutate)
                identity = cast(dict[str, str], manifest["identity"])
                incompatible = generation_id(
                    GenerationIdentity(
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
                )
                manifest["generationId"] = incompatible
                manifest.pop("contentDigest")
                manifest["contentDigest"] = hashlib.sha256(
                    canonical_json(manifest)
                ).hexdigest()
                (old_path / "manifest.json").write_text(
                    json.dumps(manifest), encoding="utf-8"
                )
                new_path = store.generation_path(incompatible)
                old_path.rename(new_path)

                with self.assertRaisesRegex(GenerationStateError, "not supported"):
                    GenerationRuntime.open_generation(
                        store, incompatible, validate_models=False
                    )

    def test_rejects_asset_identity_or_version_tampering(self) -> None:
        for asset_key, value in (("id", "other-asset"), ("version", "0")):
            with (
                self.subTest(asset_key=asset_key),
                tempfile.TemporaryDirectory() as directory,
            ):
                store = GenerationStore(Path(directory))
                identifier = write_generation(store, "a", "en")
                manifest_path = store.generation_path(identifier) / "manifest.json"

                def mutate(
                    manifest: dict[str, object],
                    key: str = asset_key,
                    changed: str = value,
                ) -> None:
                    models = cast(list[dict[str, object]], manifest["models"])
                    cast(dict[str, object], models[0]["asset"])[key] = changed

                rewrite_manifest(manifest_path, mutate)

                with self.assertRaisesRegex(GenerationStateError, "effective plan"):
                    GenerationRuntime.open_generation(
                        store, identifier, validate_models=False
                    )

    def test_startup_validator_pipeline_must_match_the_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = GenerationStore(Path(directory))
            identifier = write_generation(store, "a", "en")
            store.activate(identifier)
            result = subprocess.CompletedProcess(
                ["validator"],
                0,
                stdout=b'{"pipelineId":"other","pipelineVersion":"1"}',
                stderr=b"",
            )

            with (
                mock.patch("src.runtime.subprocess.run", return_value=result),
                self.assertRaisesRegex(GenerationStateError, "does not match"),
            ):
                GenerationRuntime.open_active(store)


class CliModeTest(unittest.TestCase):
    def test_empty_external_plan_environment_is_treated_as_unset(self) -> None:
        from src.cli import parser

        with mock.patch.dict(
            "os.environ",
            {"SPACY_EXTERNAL_PLAN": "", "SPACY_EXTERNAL_PLAN_SHA256": ""},
        ):
            args = parser().parse_args(["provision-only"])

        self.assertIsNone(args.external_plan)
        self.assertIsNone(args.external_plan_sha256)

    @mock.patch("src.cli.exec_server")
    @mock.patch("src.cli.load_provision_plan")
    def test_serve_only_never_reads_a_plan(
        self, load_plan: mock.Mock, execute: mock.Mock
    ) -> None:
        from src.cli import main

        with tempfile.TemporaryDirectory() as directory:
            store = GenerationStore(Path(directory))
            identifier = write_generation(store, "a", "en")
            store.activate(identifier)

            with mock.patch("src.runtime._validate_generation_models"):
                main(["serve-only", "--models-root", directory])

        load_plan.assert_not_called()
        execute.assert_called_once()

    def test_serve_only_fails_without_an_active_generation(self) -> None:
        from src.cli import main

        with (
            tempfile.TemporaryDirectory() as directory,
            self.assertRaises(GenerationStateError),
        ):
            main(["serve-only", "--models-root", directory])

    @mock.patch("src.cli.exec_server")
    @mock.patch("src.cli.provision")
    def test_provision_and_serve_executes_the_same_server_after_provisioning(
        self, provision: mock.Mock, execute: mock.Mock
    ) -> None:
        from src.cli import main

        with tempfile.TemporaryDirectory() as directory:
            store = GenerationStore(Path(directory))
            identifier = write_generation(store, "a", "en")
            store.activate(identifier)
            provision.return_value = identifier

            with mock.patch("src.cli.GenerationRuntime.open_active") as open_active:
                main(["provision-and-serve", "--models-root", directory])

        provision.assert_called_once()
        open_active.assert_not_called()
        execute.assert_called_once()


if __name__ == "__main__":
    unittest.main()
