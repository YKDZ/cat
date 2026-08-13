from __future__ import annotations

import fcntl
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from src.generations import (
    GenerationIdentity,
    GenerationStateError,
    GenerationStore,
    PlanError,
    canonical_json,
    compose_plan,
    fsync_tree,
    generation_id,
    load_plan,
    site_packages_digest,
)


def model(
    language_id: str,
    distribution: str,
    *,
    source: dict[str, object] | None = None,
) -> dict[str, object]:
    return {
        "languageId": language_id,
        "distribution": distribution,
        "importModule": distribution,
        "version": "3.8.0",
        "source": source
        or {
            "kind": "https",
            "url": f"https://example.invalid/{distribution}-3.8.0-py3-none-any.whl",
        },
        "sha256": "a" * 64,
        "maxBytes": 1024,
        "validationText": "Model validation text. Second sentence.",
        "pipeline": {
            "disabledPipes": ["ner", "parser"],
            "sentenceBoundary": "sentencizer",
        },
    }


def write_plan(path: Path, models: list[dict[str, object]]) -> None:
    path.write_text(
        json.dumps({"schemaVersion": "1", "models": models}), encoding="utf-8"
    )


class PlanTest(unittest.TestCase):
    def test_loads_a_versioned_hash_locked_plan(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "plan.json"
            write_plan(path, [model("en", "en_core_web_sm")])

            plan = load_plan(path)

        self.assertEqual(plan.schema_version, "1")
        self.assertEqual(plan.models[0].language_id, "en")
        self.assertEqual(plan.models[0].sha256, "a" * 64)

    def test_rejects_noncanonical_language_ids_and_undeclared_fields(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "plan.json"
            invalid = model("zh-hans", "zh_core_web_sm")
            invalid["model"] = "internal-routing-key"
            write_plan(path, [invalid])

            with self.assertRaises(PlanError):
                load_plan(path)

    def test_rejects_duplicate_json_object_keys(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "plan.json"
            path.write_text(
                '{"schemaVersion":"1","schemaVersion":"1","models":[]}',
                encoding="utf-8",
            )

            with self.assertRaisesRegex(PlanError, "Duplicate"):
                load_plan(path)

    def test_external_plan_is_strictly_additive(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            default_path = root / "default.json"
            external_path = root / "external.json"
            write_plan(default_path, [model("en", "en_core_web_sm")])
            write_plan(external_path, [model("de", "de_core_news_sm")])

            composed = compose_plan(load_plan(default_path), load_plan(external_path))

            self.assertEqual(
                [entry.language_id for entry in composed.models], ["de", "en"]
            )

            write_plan(external_path, [model("en", "other_package")])
            with self.assertRaisesRegex(PlanError, "languageId"):
                compose_plan(load_plan(default_path), load_plan(external_path))

            write_plan(external_path, [model("de", "en_core_web_sm")])
            with self.assertRaisesRegex(PlanError, "distribution"):
                compose_plan(load_plan(default_path), load_plan(external_path))

            import_conflict = model("de", "other_package")
            import_conflict["importModule"] = "en_core_web_sm"
            write_plan(external_path, [import_conflict])
            with self.assertRaisesRegex(PlanError, "importModule"):
                compose_plan(load_plan(default_path), load_plan(external_path))

    def test_rejects_duplicate_import_modules_within_a_plan(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "plan.json"
            duplicate = model("de", "de_model_package")
            duplicate["importModule"] = "en_core_web_sm"
            write_plan(path, [model("en", "en_core_web_sm"), duplicate])

            with self.assertRaisesRegex(PlanError, "importModule"):
                load_plan(path)

    def test_local_artifacts_are_relative_and_contained_by_external_plan(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            external_path = root / "external.json"
            write_plan(
                external_path,
                [
                    model(
                        "de",
                        "de_core_news_sm",
                        source={"kind": "local", "path": "wheels/de.whl"},
                    )
                ],
            )
            loaded = load_plan(external_path, allow_local=True)
            self.assertEqual(
                loaded.models[0].source.location, root / "wheels" / "de.whl"
            )

            write_plan(
                external_path,
                [
                    model(
                        "de",
                        "de_core_news_sm",
                        source={"kind": "local", "path": "../de.whl"},
                    )
                ],
            )
            with self.assertRaisesRegex(PlanError, "contained"):
                load_plan(external_path, allow_local=True)

    def test_local_artifact_location_preserves_the_declared_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "target.whl"
            target.write_bytes(b"wheel")
            link = root / "linked.whl"
            os.symlink(target.name, link)
            plan_path = root / "external.json"
            write_plan(
                plan_path,
                [
                    model(
                        "de",
                        "de_core_news_sm",
                        source={"kind": "local", "path": link.name},
                    )
                ],
            )

            loaded = load_plan(plan_path, allow_local=True)

            self.assertEqual(loaded.models[0].source.location, link)


class GenerationIdentityTest(unittest.TestCase):
    def test_every_runtime_compatibility_input_changes_the_generation_id(self) -> None:
        baseline = GenerationIdentity(
            plan_digest="a" * 64,
            schema_version="1",
            provisioner_version="1",
            server_protocol_version="1",
            python_abi="cpython-312",
            python_implementation="cpython",
            python_version="3.12.11",
            platform="linux-x86_64",
            spacy_version="3.8.7",
            site_packages_digest="b" * 64,
        )
        fields = tuple(baseline.__dataclass_fields__)

        for field in fields:
            changed = {
                name: ("different" if name == field else getattr(baseline, name))
                for name in fields
            }
            with self.subTest(field=field):
                self.assertNotEqual(
                    generation_id(baseline),
                    generation_id(GenerationIdentity(**changed)),
                )


class SitePackagesDigestTest(unittest.TestCase):
    def test_binds_relative_paths_and_file_bytes_but_ignores_pyc(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            package = root / "package"
            package.mkdir()
            module = package / "module.py"
            module.write_bytes(b"value = 1\n")
            baseline = site_packages_digest(root)

            module.write_bytes(b"value = 2\n")
            self.assertNotEqual(site_packages_digest(root), baseline)
            module.write_bytes(b"value = 1\n")
            module.rename(package / "renamed.py")
            renamed = site_packages_digest(root)
            self.assertNotEqual(renamed, baseline)

            (package / "cached.pyc").write_bytes(b"runtime cache")
            self.assertEqual(site_packages_digest(root), renamed)

    def test_rejects_symlinks(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "target.py"
            target.write_text("value = 1\n", encoding="utf-8")
            os.symlink(target, root / "linked.py")

            with self.assertRaisesRegex(GenerationStateError, "symlinks"):
                site_packages_digest(root)

    def test_canonical_json_emits_compact_unescaped_utf8(self) -> None:
        self.assertEqual(
            canonical_json({"text": "中文😀"}),
            '{"text":"中文😀"}'.encode(),
        )

    def test_fsync_tree_flushes_every_regular_file_and_directory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            nested = root / "nested"
            nested.mkdir()
            (root / "root.txt").write_text("root", encoding="utf-8")
            (nested / "nested.txt").write_text("nested", encoding="utf-8")

            with mock.patch("src.generations.os.fsync") as fsync:
                fsync_tree(root)

            self.assertEqual(fsync.call_count, 4)


class GenerationStoreTest(unittest.TestCase):
    def test_activation_atomically_tracks_active_and_previous(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = GenerationStore(Path(directory))
            store.create_generation_for_test("generation-a")
            store.create_generation_for_test("generation-b")
            store.activate("generation-a")
            store.activate("generation-b")

            state = store.read_state()

            self.assertEqual(state.active_generation_key, "generation-b")
            self.assertEqual(state.previous_generation_key, "generation-a")
            self.assertEqual(list(Path(directory).glob(".state.json.*")), [])

    def test_state_rejects_duplicate_json_keys(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = GenerationStore(Path(directory))
            store.state_path.write_text(
                '{"schemaVersion":"2","activeGenerationKey":"a",'
                '"activeGenerationKey":"b","previousGenerationKey":null}',
                encoding="utf-8",
            )

            with self.assertRaisesRegex(Exception, "valid active generation"):
                store.read_state()

    def test_pin_retries_if_active_changes_before_shared_lease(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = GenerationStore(Path(directory))
            store.create_generation_for_test("generation-a")
            store.create_generation_for_test("generation-b")
            store.activate("generation-a")
            observed: list[str] = []

            def before_lock(generation: str) -> None:
                observed.append(generation)
                if len(observed) == 1:
                    store.activate("generation-b")

            pinned = store.pin_active(before_lock=before_lock)
            self.addCleanup(pinned.close)

            self.assertEqual(observed, ["generation-a", "generation-b"])
            self.assertEqual(pinned.storage_key, "generation-b")

    def test_cleanup_skips_a_leased_generation_and_retries_later(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = GenerationStore(Path(directory))
            for generation in ("old", "previous", "active"):
                store.create_generation_for_test(generation)
            store.activate("previous")
            store.activate("active")
            leased = store.pin_generation("old")

            self.assertEqual(store.cleanup(), [])
            self.assertTrue(store.generation_path("old").exists())
            with self.assertRaises(BlockingIOError):
                contender = store.open_lease("old")
                self.addCleanup(contender.close)
                fcntl.flock(contender, fcntl.LOCK_EX | fcntl.LOCK_NB)

            leased.close()
            self.assertEqual(store.cleanup(), ["old"])
            self.assertFalse(store.generation_path("old").exists())

    def test_provision_lock_wait_is_bounded(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = GenerationStore(Path(directory))
            lock = (store.locks / "provision.lock").open("a+b")
            self.addCleanup(lock.close)
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)

            with (
                self.assertRaisesRegex(TimeoutError, "provision lock"),
                store.provision_lock(timeout_seconds=0.01, poll_seconds=0.001),
            ):
                self.fail("contended provision lock must not be acquired")


if __name__ == "__main__":
    unittest.main()
