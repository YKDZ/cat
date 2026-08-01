from __future__ import annotations

import hashlib
import json
import os
import shutil
import stat
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import ClassVar
from unittest import mock

from src.generations import GenerationStore, load_plan, make_tree_owner_writable
from src.provisioner import (
    ArtifactError,
    ModelValidationError,
    Provisioner,
    ValidatedModel,
    load_hash_locked_external_plan,
    pip_install_wheel,
)

from .test_generations import model, write_plan


def active_generation_path(provisioner: Provisioner) -> Path:
    return provisioner.store.generation_path(
        provisioner.store.read_state().active_generation_key
    )


class ProvisionerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.artifact = self.root / "en_core_web_sm-3.8.0-py3-none-any.whl"
        self.artifact.write_bytes(b"official model wheel")
        self.plan_path = self.root / "plan.json"
        entry = model(
            "en",
            "en_core_web_sm",
            source={"kind": "local", "path": self.artifact.name},
        )
        entry["sha256"] = hashlib.sha256(self.artifact.read_bytes()).hexdigest()
        write_plan(self.plan_path, [entry])
        self.plan = load_plan(self.plan_path, allow_local=True)
        self.installs: list[tuple[Path, Path]] = []
        self.validations = 0

    def provisioner(self) -> Provisioner:
        def install(wheel: Path, site_packages: Path) -> None:
            self.installs.append((wheel, site_packages))
            site_packages.mkdir(parents=True, exist_ok=True)
            (site_packages / "installed.py").write_text(
                "installed = True\n", encoding="utf-8"
            )

        def validate(_entry: object, _site_packages: Path) -> ValidatedModel:
            self.validations += 1
            return ValidatedModel(
                pipeline_id="sentencizer",
                pipeline_version="1",
            )

        return Provisioner(
            GenerationStore(self.root / "models"),
            install_wheel=install,
            validate_model=validate,
            spacy_version="3.8.7",
            python_abi="cpython-312",
            platform="linux-x86_64",
        )

    def test_provisions_and_reuses_the_same_validated_generation(self) -> None:
        provisioner = self.provisioner()

        first = provisioner.provision(self.plan)
        second = provisioner.provision(self.plan)

        self.assertEqual(first, second)
        self.assertEqual(len(self.installs), 1)
        self.assertEqual(self.validations, 2)
        state = provisioner.store.read_state()
        self.assertIsNone(state.previous_generation_key)
        manifest = json.loads(
            (active_generation_path(provisioner) / "manifest.json").read_text()
        )
        self.assertEqual(manifest["generationId"], first)
        self.assertEqual(manifest["models"][0]["languageId"], "en")
        self.assertRegex(manifest["sitePackagesDigest"], r"^[a-f0-9]{64}$")
        generation = active_generation_path(provisioner)
        for path in (generation, generation / "site-packages/installed.py"):
            self.assertEqual(stat.S_IMODE(path.stat().st_mode) & 0o222, 0)

    def test_concurrent_provisioners_install_one_generation(self) -> None:
        first = self.provisioner()
        second = self.provisioner()

        with ThreadPoolExecutor(max_workers=2) as executor:
            identifiers = list(
                executor.map(lambda item: item.provision(self.plan), (first, second))
            )

        self.assertEqual(identifiers[0], identifiers[1])
        self.assertEqual(len(self.installs), 1)
        manifest = json.loads(
            (active_generation_path(first) / "manifest.json").read_text()
        )
        self.assertEqual(manifest["generationId"], identifiers[0])

    def test_hash_failure_removes_the_failed_staging_generation(self) -> None:
        invalid_path = self.root / "invalid.json"
        write_plan(
            invalid_path,
            [
                model(
                    "en",
                    "en_core_web_sm",
                    source={"kind": "local", "path": self.artifact.name},
                )
            ],
        )
        invalid_plan = load_plan(invalid_path, allow_local=True)
        provisioner = self.provisioner()

        with self.assertRaisesRegex(ArtifactError, "SHA-256"):
            provisioner.provision(invalid_plan)

        self.assertEqual(list(provisioner.store.generations.iterdir()), [])

    def test_size_limit_is_enforced_while_streaming(self) -> None:
        limited_path = self.root / "limited.json"
        entry = model(
            "en",
            "en_core_web_sm",
            source={"kind": "local", "path": self.artifact.name},
        )
        entry["sha256"] = hashlib.sha256(self.artifact.read_bytes()).hexdigest()
        entry["maxBytes"] = 4
        write_plan(limited_path, [entry])
        provisioner = self.provisioner()

        with self.assertRaisesRegex(ArtifactError, "size limit"):
            provisioner.provision(load_plan(limited_path, allow_local=True))

        self.assertEqual(list(provisioner.store.generations.iterdir()), [])

    def test_https_download_uses_one_monotonic_overall_deadline(self) -> None:
        remote_path = self.root / "remote.json"
        entry = model("en", "en_core_web_sm")
        entry["sha256"] = hashlib.sha256(b"chunk").hexdigest()
        write_plan(remote_path, [entry])
        remote = load_plan(remote_path).models[0]

        class Response:
            headers: ClassVar[dict[str, str]] = {}

            def __enter__(self) -> Response:
                return self

            def __exit__(self, *_args: object) -> None:
                return None

            def geturl(self) -> str:
                return "https://example.invalid/model.whl"

            def read(self, _size: int = -1) -> bytes:
                return b"chunk"

        destination = self.root / "download.whl"
        with (
            mock.patch(
                "src.provisioner.time.monotonic",
                side_effect=[0.0, 0.1, 0.2, 31.0],
            ),
            mock.patch(
                "src.provisioner.urllib.request.urlopen",
                return_value=Response(),
            ) as urlopen,
            self.assertRaisesRegex(ArtifactError, "timed out"),
        ):
            self.provisioner()._copy_artifact(remote, destination)

        self.assertFalse(destination.exists())
        self.assertAlmostEqual(urlopen.call_args.kwargs["timeout"], 29.9)

    def test_model_validation_failure_does_not_change_active(self) -> None:
        provisioner = self.provisioner()
        active = provisioner.provision(self.plan)
        other_artifact = self.root / "de_core_news_sm-3.8.0-py3-none-any.whl"
        other_artifact.write_bytes(b"different official wheel")
        other_path = self.root / "other.json"
        entry = model(
            "de",
            "de_core_news_sm",
            source={"kind": "local", "path": other_artifact.name},
        )
        entry["sha256"] = hashlib.sha256(other_artifact.read_bytes()).hexdigest()
        write_plan(other_path, [entry])
        failing = Provisioner(
            provisioner.store,
            install_wheel=lambda _wheel, _site: None,
            validate_model=lambda _entry, _site: (_ for _ in ()).throw(
                ModelValidationError("incompatible wheel")
            ),
            spacy_version="3.8.7",
            python_abi="cpython-312",
            platform="linux-x86_64",
        )

        with self.assertRaisesRegex(ModelValidationError, "incompatible"):
            failing.provision(load_plan(other_path, allow_local=True))

        manifest = json.loads(
            (active_generation_path(provisioner) / "manifest.json").read_text()
        )
        self.assertEqual(manifest["generationId"], active)
        self.assertEqual(
            [path.name for path in provisioner.store.generations.iterdir()],
            [provisioner.store.read_state().active_generation_key],
        )

    def test_new_activation_retains_active_and_previous(self) -> None:
        provisioner = self.provisioner()
        first = provisioner.provision(self.plan)
        other_artifact = self.root / "de_core_news_sm-3.8.0-py3-none-any.whl"
        other_artifact.write_bytes(b"different official wheel")
        other_path = self.root / "other.json"
        entry = model(
            "de",
            "de_core_news_sm",
            source={"kind": "local", "path": other_artifact.name},
        )
        entry["sha256"] = hashlib.sha256(other_artifact.read_bytes()).hexdigest()
        write_plan(other_path, [entry])
        other = load_plan(other_path, allow_local=True)
        second = provisioner.provision(other)

        state = provisioner.store.read_state()
        self.assertNotEqual(state.active_generation_key, state.previous_generation_key)
        previous = provisioner.store.generation_path(
            state.previous_generation_key or ""
        )
        self.assertTrue(previous.exists())
        self.assertEqual(
            json.loads((previous / "manifest.json").read_text())["generationId"], first
        )
        self.assertEqual(
            json.loads(
                (active_generation_path(provisioner) / "manifest.json").read_text()
            )["generationId"],
            second,
        )

    def test_failed_state_replace_preserves_the_old_active_generation(self) -> None:
        store = GenerationStore(self.root / "models")
        store.create_generation_for_test("old")
        store.create_generation_for_test("new")
        store.activate("old")

        with (
            mock.patch("src.generations.os.replace", side_effect=OSError("crash")),
            self.assertRaisesRegex(OSError, "crash"),
        ):
            store.activate("new")

        self.assertEqual(store.read_state().active_generation_key, "old")
        self.assertEqual(list(store.root.glob(".state.json.*")), [])

    def test_removes_orphan_staging_directories_before_reuse(self) -> None:
        provisioner = self.provisioner()
        identifier = provisioner.provision(self.plan)
        orphan = provisioner.store.generations / ".staging-crashed-process"
        orphan.mkdir()

        self.assertEqual(provisioner.provision(self.plan), identifier)

        self.assertFalse(orphan.exists())

    def test_cleanup_error_after_activation_does_not_fail_provisioning(self) -> None:
        provisioner = self.provisioner()

        with mock.patch.object(
            provisioner.store, "cleanup", side_effect=OSError("busy")
        ):
            identifier = provisioner.provision(self.plan)

        self.assertEqual(
            json.loads(
                (active_generation_path(provisioner) / "manifest.json").read_text()
            )["generationId"],
            identifier,
        )

    def test_tampered_manifest_is_not_reused(self) -> None:
        provisioner = self.provisioner()
        identifier = provisioner.provision(self.plan)
        manifest = active_generation_path(provisioner) / "manifest.json"
        manifest.write_text(
            manifest.read_text().replace('"version":"3.8.0"', '"version":"0"', 1)
        )

        self.assertEqual(provisioner.provision(self.plan), identifier)

        self.assertEqual(len(self.installs), 2)

    def test_manifest_with_duplicate_keys_is_not_reused(self) -> None:
        provisioner = self.provisioner()
        identifier = provisioner.provision(self.plan)
        manifest = active_generation_path(provisioner) / "manifest.json"
        manifest.write_text(
            '{"schemaVersion":"1","schemaVersion":"1"}', encoding="utf-8"
        )

        self.assertEqual(provisioner.provision(self.plan), identifier)

        self.assertEqual(len(self.installs), 2)

    def test_missing_site_packages_is_not_reused(self) -> None:
        provisioner = self.provisioner()
        identifier = provisioner.provision(self.plan)
        site_packages = active_generation_path(provisioner) / "site-packages"
        make_tree_owner_writable(site_packages)
        shutil.rmtree(site_packages)

        self.assertEqual(provisioner.provision(self.plan), identifier)

        self.assertEqual(len(self.installs), 2)

    def test_tampered_site_packages_is_rebuilt_and_reactivated_read_only(
        self,
    ) -> None:
        provisioner = self.provisioner()
        identifier = provisioner.provision(self.plan)
        installed = (
            active_generation_path(provisioner) / "site-packages" / "installed.py"
        )
        os.chmod(installed, 0o600)
        installed.write_text("tampered = True\n", encoding="utf-8")

        self.assertEqual(provisioner.provision(self.plan), identifier)

        self.assertEqual(len(self.installs), 2)
        rebuilt = active_generation_path(provisioner) / "site-packages/installed.py"
        self.assertNotEqual(rebuilt, installed)
        self.assertEqual(rebuilt.read_text(), "installed = True\n")
        self.assertEqual(stat.S_IMODE(rebuilt.stat().st_mode) & 0o222, 0)

    def test_logical_identity_binds_the_installed_tree_digest(self) -> None:
        identifiers: list[str] = []
        for marker in ("first", "second"):
            store = GenerationStore(self.root / f"models-{marker}")

            def install(
                _wheel: Path, site_packages: Path, content: str = marker
            ) -> None:
                site_packages.mkdir(parents=True, exist_ok=True)
                (site_packages / "installed.py").write_text(content)

            provisioner = Provisioner(
                store,
                install_wheel=install,
                validate_model=lambda _entry, _site: ValidatedModel(
                    pipeline_id="sentencizer", pipeline_version="1"
                ),
                spacy_version="3.8.7",
                python_abi="cpython-312",
                platform="linux-x86_64",
            )
            identifiers.append(provisioner.provision(self.plan))
            state = store.read_state()
            manifest = json.loads(
                (
                    store.generation_path(state.active_generation_key) / "manifest.json"
                ).read_text()
            )
            self.assertEqual(
                manifest["identity"]["sitePackagesDigest"],
                manifest["sitePackagesDigest"],
            )

        self.assertNotEqual(identifiers[0], identifiers[1])

    def test_failed_state_publish_keeps_the_old_active_generation_complete(
        self,
    ) -> None:
        provisioner = self.provisioner()
        provisioner.provision(self.plan)
        old_key = provisioner.store.read_state().active_generation_key
        installed = (
            provisioner.store.generation_path(old_key)
            / "site-packages"
            / "installed.py"
        )
        os.chmod(installed, 0o600)
        installed.write_text("corrupt = True\n")

        with (
            mock.patch.object(
                provisioner.store,
                "activate",
                side_effect=OSError("state publish crashed"),
            ),
            self.assertRaisesRegex(OSError, "state publish crashed"),
        ):
            provisioner.provision(self.plan)

        self.assertEqual(provisioner.store.read_state().active_generation_key, old_key)
        self.assertTrue(
            (provisioner.store.generation_path(old_key) / "manifest.json").is_file()
        )
        self.assertEqual(
            len(
                [
                    path
                    for path in provisioner.store.generations.iterdir()
                    if not path.name.startswith(".staging-")
                ]
            ),
            2,
        )

    def test_fsyncs_the_complete_tree_before_rename_and_state_publish(self) -> None:
        provisioner = self.provisioner()
        events: list[str] = []
        replace = os.replace
        activate = provisioner.store.activate

        def tracked_replace(source: Path, destination: Path) -> None:
            events.append("rename")
            replace(source, destination)

        def tracked_activate(storage_key: str) -> None:
            events.append("state")
            activate(storage_key)

        with (
            mock.patch(
                "src.provisioner.fsync_tree",
                side_effect=lambda _path: events.append("fsync-tree"),
            ),
            mock.patch("src.provisioner.os.replace", side_effect=tracked_replace),
            mock.patch.object(
                provisioner.store, "activate", side_effect=tracked_activate
            ),
        ):
            provisioner.provision(self.plan)

        self.assertLess(events.index("fsync-tree"), events.index("rename"))
        self.assertLess(events.index("rename"), events.index("state"))


class ExternalPlanTest(unittest.TestCase):
    def test_requires_the_explicit_raw_plan_hash(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "external.json"
            write_plan(path, [model("de", "de_core_news_sm")])
            expected = hashlib.sha256(path.read_bytes()).hexdigest()

            plan = load_hash_locked_external_plan(path, expected)

            self.assertEqual(plan.models[0].language_id, "de")
            with self.assertRaisesRegex(ArtifactError, "plan SHA-256"):
                load_hash_locked_external_plan(path, "0" * 64)

    def test_local_sources_reject_symlinks_fifos_and_oversized_files_before_open(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "target.whl"
            target.write_bytes(b"wheel")
            link = root / "linked.whl"
            os.symlink(target.name, link)
            fifo = root / "fifo.whl"
            os.mkfifo(fifo)
            oversized = root / "oversized.whl"
            oversized.write_bytes(b"too large")

            for source, max_bytes in ((link, 1024), (fifo, 1024), (oversized, 1)):
                with self.subTest(source=source.name):
                    plan_path = root / f"{source.name}.json"
                    entry = model(
                        "de",
                        "de_core_news_sm",
                        source={"kind": "local", "path": source.name},
                    )
                    entry["maxBytes"] = max_bytes
                    entry["sha256"] = hashlib.sha256(b"wheel").hexdigest()
                    write_plan(plan_path, [entry])
                    plan = load_plan(plan_path, allow_local=True)
                    provisioner = Provisioner(
                        GenerationStore(root / f"models-{source.name}"),
                        install_wheel=lambda _wheel, _site: None,
                        validate_model=lambda _entry, _site: ValidatedModel(
                            pipeline_id="sentencizer", pipeline_version="1"
                        ),
                        spacy_version="3.8.7",
                    )
                    with (
                        mock.patch.object(
                            Path,
                            "open",
                            side_effect=AssertionError("unsafe local source open"),
                        ),
                        self.assertRaises(ArtifactError),
                    ):
                        provisioner._copy_artifact(
                            plan.models[0], root / f"copy-{source.name}"
                        )


class PipCommandTest(unittest.TestCase):
    @mock.patch("src.provisioner.subprocess.run")
    def test_installs_only_the_already_copied_local_wheel_without_dependencies(
        self, run: mock.Mock
    ) -> None:
        wheel = Path("/models/generations/.staging/artifacts/model.whl")
        site = Path("/models/generations/.staging/site-packages")

        pip_install_wheel(wheel, site)

        command = run.call_args.args[0]
        self.assertIn("--no-index", command)
        self.assertIn("--no-deps", command)
        self.assertIn("--no-compile", command)
        self.assertIn("--only-binary=:all:", command)
        self.assertEqual(command[-1], str(wheel))
        self.assertNotIn("https://", " ".join(command))
        run.assert_called_once()


if __name__ == "__main__":
    unittest.main()
