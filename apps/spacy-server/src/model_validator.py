from __future__ import annotations

import importlib
import importlib.metadata
import json
import sys
from pathlib import Path

import spacy
from packaging.specifiers import SpecifierSet
from packaging.utils import canonicalize_name

from .generations import ModelPlan, parse_plan_bytes


def _entry_from_stdin() -> ModelPlan:
    entry = json.loads(sys.stdin.buffer.read())
    plan = {
        "schemaVersion": "1",
        "models": [entry],
    }
    return parse_plan_bytes(
        json.dumps(plan, separators=(",", ":")).encode("utf-8"),
        Path("isolated-validation-plan.json"),
        allow_local=True,
    ).models[0]


def validate(entry: ModelPlan, site_packages: Path) -> dict[str, str]:
    normalized = canonicalize_name(entry.distribution)
    distribution = next(
        (
            candidate
            for candidate in importlib.metadata.distributions(path=[str(site_packages)])
            if canonicalize_name(candidate.metadata.get("Name") or "") == normalized
        ),
        None,
    )
    if distribution is None or distribution.version != entry.version:
        raise RuntimeError("Installed distribution metadata does not match the plan.")
    sys.path.insert(0, str(site_packages))
    importlib.invalidate_caches()
    module = importlib.import_module(entry.import_module)
    module_file = module.__file__
    if module_file is None:
        raise RuntimeError("Model import module has no filesystem location.")
    metadata_value = json.loads(
        (Path(module_file).parent / "meta.json").read_text("utf-8")
    )
    compatible = metadata_value.get("spacy_version")
    spacy_version = importlib.metadata.version("spacy")
    if not isinstance(compatible, str) or not SpecifierSet(compatible).contains(
        spacy_version, prereleases=True
    ):
        raise RuntimeError(
            "Model metadata is incompatible with the locked spaCy runtime."
        )
    model_language = metadata_value.get("lang")
    if model_language != entry.language_id.split("-", 1)[0]:
        raise RuntimeError("Model metadata language does not match languageId.")
    nlp = spacy.load(entry.import_module, disable=list(entry.pipeline.disabled_pipes))
    if not nlp.has_pipe(entry.pipeline.sentence_boundary):
        nlp.add_pipe(entry.pipeline.sentence_boundary)
    document = nlp(entry.validation_text)
    if not any(not token.is_space for token in document) or not list(document.sents):
        raise RuntimeError("Model failed its minimum language-specific analysis.")
    return {"pipelineId": ",".join(nlp.pipe_names), "pipelineVersion": "1"}


def main() -> None:
    result = validate(_entry_from_stdin(), Path(sys.argv[1]))
    sys.stdout.write(json.dumps(result, separators=(",", ":")))


if __name__ == "__main__":
    main()
