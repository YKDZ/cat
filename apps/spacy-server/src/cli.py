from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Sequence
from pathlib import Path

from .generations import GenerationStore, ProvisionPlan, compose_plan, load_plan
from .provisioner import Provisioner, load_hash_locked_external_plan
from .runtime import GenerationRuntime

DEFAULT_PLAN_PATH = Path(__file__).parents[1] / "default-plan.json"


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="cat-spacy-server")
    result.add_argument(
        "mode", choices=("provision-only", "serve-only", "provision-and-serve")
    )
    result.add_argument(
        "--models-root",
        default=os.environ.get("SPACY_MODELS_ROOT", "/models"),
    )
    result.add_argument(
        "--external-plan", default=os.environ.get("SPACY_EXTERNAL_PLAN") or None
    )
    result.add_argument(
        "--external-plan-sha256",
        default=os.environ.get("SPACY_EXTERNAL_PLAN_SHA256") or None,
    )
    return result


def load_provision_plan(args: argparse.Namespace) -> ProvisionPlan:
    default = load_plan(DEFAULT_PLAN_PATH)
    external_path = args.external_plan
    expected_digest = args.external_plan_sha256
    if (external_path is None) != (expected_digest is None):
        raise ValueError(
            "External plan path and explicit SHA-256 must be configured together."
        )
    extension = (
        None
        if external_path is None
        else load_hash_locked_external_plan(Path(external_path), expected_digest)
    )
    return compose_plan(default, extension)


def provision(args: argparse.Namespace, store: GenerationStore) -> str:
    return Provisioner(store).provision(load_provision_plan(args))


def exec_server(models_root: Path) -> None:
    environment = {**os.environ, "SPACY_MODELS_ROOT": str(models_root)}
    command = [
        sys.executable,
        "-m",
        "uvicorn",
        "src.main:app",
        "--host",
        "0.0.0.0",
        "--port",
        "8000",
    ]
    os.execvpe(command[0], command, environment)


def main(arguments: Sequence[str] | None = None) -> None:
    args = parser().parse_args(arguments)
    models_root = Path(args.models_root)
    store = GenerationStore(models_root)
    if args.mode in {"provision-only", "provision-and-serve"}:
        provision(args, store)
    if args.mode == "serve-only":
        with GenerationRuntime.open_active(store):
            pass
    if args.mode in {"serve-only", "provision-and-serve"}:
        exec_server(models_root)


if __name__ == "__main__":
    main()
