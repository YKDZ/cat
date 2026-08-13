from __future__ import annotations

import json
import os
import struct
import sys
from pathlib import Path
from typing import Any

from .analysis import doc_to_response
from .generations import SERVER_PROTOCOL_VERSION, GenerationStore
from .models import (
    LanguageAnalysisBatchItemResult,
    LanguageAnalysisBatchResponse,
    RuntimeAttestationResponse,
)
from .protocol_limits import (
    MAX_PARENT_REQUEST_FRAME_BYTES,
    MAX_WORKER_RESPONSE_FRAME_BYTES,
)
from .runtime import GenerationRuntime, UnsupportedLanguageError


class ResponseFrameTooLarge(ValueError):
    pass


def read_exactly(size: int) -> bytes:
    chunks: list[bytes] = []
    while size:
        chunk = sys.stdin.buffer.read(size)
        if not chunk:
            raise EOFError("Incomplete worker protocol frame.")
        chunks.append(chunk)
        size -= len(chunk)
    return b"".join(chunks)


def read_frame() -> dict[str, Any] | None:
    header = sys.stdin.buffer.read(4)
    if not header:
        return None
    if len(header) != 4:
        raise EOFError("Incomplete worker protocol header.")
    size = struct.unpack("!I", header)[0]
    if size > MAX_PARENT_REQUEST_FRAME_BYTES:
        raise ValueError("Worker protocol frame exceeds limit.")
    value = json.loads(read_exactly(size))
    if not isinstance(value, dict):
        raise ValueError("Worker protocol request must be an object.")
    return value


def write_frame(message: dict[str, Any]) -> None:
    data = json.dumps(message, ensure_ascii=False, separators=(",", ":")).encode(
        "utf-8"
    )
    if len(data) > MAX_WORKER_RESPONSE_FRAME_BYTES:
        raise ResponseFrameTooLarge("Worker response exceeds protocol limit.")
    sys.stdout.buffer.write(struct.pack("!I", len(data)) + data)
    sys.stdout.buffer.flush()


def analyze(runtime: GenerationRuntime, request: dict[str, Any]) -> dict[str, Any]:
    language_id = str(request["languageId"])
    nlp = runtime.get_model(language_id)
    attestation = RuntimeAttestationResponse.model_validate(
        runtime.attestation(language_id)
    )
    if request["kind"] == "analyze":
        return doc_to_response(nlp(str(request["text"])), attestation).model_dump(
            mode="json", by_alias=True
        )
    items = request["items"]
    results = [
        {
            "id": item["id"],
            "result": doc_to_response(doc, attestation).model_dump(
                mode="json", by_alias=True
            ),
        }
        for item, doc in zip(
            items, nlp.pipe([str(item["text"]) for item in items]), strict=True
        )
    ]
    return LanguageAnalysisBatchResponse(
        runtime_attestation=attestation,
        results=[
            LanguageAnalysisBatchItemResult.model_validate(result) for result in results
        ],
    ).model_dump(mode="json", by_alias=True)


def warm_runtime_models(runtime: GenerationRuntime) -> None:
    """Load and exercise every declared model before publishing readiness."""
    for entry in runtime.manifest.effective_plan.models:
        runtime.get_model(entry.language_id)(entry.validation_text)


def serve(runtime: GenerationRuntime) -> None:
    warm_runtime_models(runtime)
    write_frame(
        {
            "kind": "ready",
            "generationId": runtime.generation_id,
            "serverProtocolVersion": SERVER_PROTOCOL_VERSION,
            "workerEpoch": int(os.environ["SPACY_WORKER_EPOCH"]),
        }
    )
    while request := read_frame():
        job_id = request.get("jobId")
        worker_epoch = request.get("workerEpoch")
        try:
            write_frame(
                {
                    "jobId": job_id,
                    "workerEpoch": worker_epoch,
                    "ok": True,
                    "result": analyze(runtime, request),
                }
            )
        except (UnsupportedLanguageError, ResponseFrameTooLarge) as error:
            write_frame(
                {
                    "jobId": job_id,
                    "workerEpoch": worker_epoch,
                    "ok": False,
                    "statusCode": (
                        413 if isinstance(error, ResponseFrameTooLarge) else 422
                    ),
                    "error": str(error),
                }
            )
        except Exception as error:
            print(
                f"spaCy worker job {job_id} failed: {error}",
                file=sys.stderr,
                flush=True,
            )
            write_frame(
                {
                    "jobId": job_id,
                    "workerEpoch": worker_epoch,
                    "ok": False,
                    "error": str(error),
                }
            )


def main() -> None:
    models_root = Path(os.environ["SPACY_MODELS_ROOT"])
    generation_id = os.environ["SPACY_GENERATION_ID"]
    storage_key = os.environ["SPACY_GENERATION_STORAGE_KEY"]
    try:
        with GenerationRuntime.open_generation(
            GenerationStore(models_root),
            storage_key,
            expected_generation_id=generation_id,
            validate_models=False,
        ) as runtime:
            serve(runtime)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
