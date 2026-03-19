"""
Utility script to pre-download spaCy models listed in MODEL_MAP.
Run inside the Docker build or standalone:
    python download_models.py [lang1 lang2 ...]

If no arguments are provided, all models in MODEL_MAP are downloaded.
"""
from __future__ import annotations

import subprocess
import sys

from src.models import MODEL_MAP


def main() -> None:
    langs = sys.argv[1:] if len(sys.argv) > 1 else list(MODEL_MAP.keys())
    models_to_download = {MODEL_MAP[lang] for lang in langs if lang in MODEL_MAP}
    unknown = [lang for lang in langs if lang not in MODEL_MAP]

    if unknown:
        print(f"Warning: unknown languages skipped: {unknown}", file=sys.stderr)

    for model in sorted(models_to_download):
        print(f"Downloading {model} ...")
        subprocess.run(
            [sys.executable, "-m", "spacy", "download", model],
            check=True,
        )

    print("Done.")


if __name__ == "__main__":
    main()
