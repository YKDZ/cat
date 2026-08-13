from __future__ import annotations

import json
import os
import struct
import sys
import time
from pathlib import Path
from typing import Any, cast

mode = sys.argv[1] if len(sys.argv) > 1 else "ready"
marker = Path(sys.argv[2]) if len(sys.argv) > 2 else None


def read_frame() -> dict[str, Any] | None:
    header = sys.stdin.buffer.read(4)
    if not header:
        return None
    size = struct.unpack("!I", header)[0]
    value = json.loads(sys.stdin.buffer.read(size))
    if not isinstance(value, dict):
        raise ValueError("Worker fixture request must be an object.")
    return cast(dict[str, Any], value)


def write_frame(message: dict[str, Any]) -> None:
    data = json.dumps(message, ensure_ascii=False, separators=(",", ":")).encode(
        "utf-8"
    )
    sys.stdout.buffer.write(struct.pack("!I", len(data)) + data)
    sys.stdout.buffer.flush()


if mode == "exit-before-handshake":
    sys.exit(24)
if mode == "delayed-handshake" or (
    mode == "delay-replacement" and marker is not None and marker.exists()
):
    time.sleep(0.1)
write_frame(
    {
        "kind": "ready",
        "generationId": (
            "wrong-generation"
            if mode == "bad-handshake"
            else os.environ["SPACY_GENERATION_ID"]
        ),
        "serverProtocolVersion": "1",
        "workerEpoch": int(os.environ["SPACY_WORKER_EPOCH"]),
    }
)

while request := read_frame():
    if request.get("crash"):
        if mode == "delay-replacement" and marker is not None:
            marker.write_text("replacement", encoding="utf-8")
        sys.exit(23)
    if request.get("malformed"):
        sys.stdout.buffer.write(b"\x00\x00\x00\x01{")
        sys.stdout.buffer.flush()
        continue
    if request.get("wrong_epoch"):
        write_frame(
            {
                "jobId": request["jobId"],
                "workerEpoch": request["workerEpoch"] + 1,
                "ok": True,
                "result": {},
            }
        )
        continue
    if request.get("unsupported"):
        write_frame(
            {
                "jobId": request["jobId"],
                "workerEpoch": request["workerEpoch"],
                "ok": False,
                "statusCode": 422,
                "error": "Unsupported language.",
            }
        )
        continue
    delay_ms = int(request.get("delay_ms", 0))
    if delay_ms:
        time.sleep(delay_ms / 1000)
    write_frame(
        {
            "jobId": request["jobId"],
            "workerEpoch": request["workerEpoch"],
            "ok": True,
            "result": {
                "pid": str(__import__("os").getpid()),
                "items": request.get("items", []),
                "text": request.get("text"),
            },
        }
    )
