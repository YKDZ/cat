from __future__ import annotations

import asyncio
import contextlib
import json
import os
import struct
import sys
import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from .generations import SERVER_PROTOCOL_VERSION
from .protocol_limits import (
    MAX_PARENT_REQUEST_FRAME_BYTES,
    MAX_WORKER_RESPONSE_FRAME_BYTES,
)


class ClientDisconnected(Exception):
    """The caller left before its active analysis could complete."""


class WorkerUnavailable(Exception):
    """The dedicated analysis worker could not produce a protocol response."""


class AnalysisRequestError(Exception):
    """The worker rejected an otherwise valid protocol request."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code


Disconnected = Callable[[], Awaitable[bool] | bool]


@dataclass(frozen=True)
class WorkerSlot:
    epoch: int
    process: asyncio.subprocess.Process
    reader: asyncio.StreamReader
    writer: asyncio.StreamWriter


class AnalysisCoordinator:
    """Serializes jobs through one disposable, long-lived spaCy worker process."""

    def __init__(
        self,
        worker_command: tuple[str, ...] | None = None,
        poll_interval_s: float = 0.01,
        max_pending: int = 16,
        generation_id: str | None = None,
        generation_storage_key: str | None = None,
        models_root: str | None = None,
        worker_start_timeout_s: float = 30.0,
    ) -> None:
        self._worker_command = worker_command or (sys.executable, "-m", "src.worker")
        self._poll_interval_s = poll_interval_s
        self._slot_lock = asyncio.Lock()
        self._max_pending = max_pending
        self._pending = 0
        self._worker: WorkerSlot | None = None
        self._next_epoch = 0
        self._closing = False
        self._generation_id = generation_id
        self._generation_storage_key = generation_storage_key
        self._models_root = models_root
        self._worker_start_timeout_s = worker_start_timeout_s
        self._request_counts: dict[str, int] = {"analyze": 0, "batch-analyze": 0}

    @property
    def worker_pid(self) -> str | None:
        return str(self._worker.process.pid) if self._worker is not None else None

    @property
    def is_ready(self) -> bool:
        return (
            not self._closing
            and self._worker is not None
            and self._worker.process.returncode is None
        )

    @property
    def request_counts(self) -> dict[str, int]:
        return dict(self._request_counts)

    async def start(self) -> None:
        if self._closing:
            raise WorkerUnavailable("Analysis coordinator is closed.")
        await self._ensure_worker(
            time.monotonic() + self._worker_start_timeout_s,
            lambda: False,
        )

    async def close(self) -> None:
        self._closing = True
        worker = self._worker
        if worker is not None:
            await self._discard_worker(worker)

    async def execute(
        self,
        payload: dict[str, Any],
        timeout_ms: int,
        disconnected: Disconnected,
    ) -> dict[str, Any]:
        kind = payload.get("kind")
        if kind in self._request_counts:
            self._request_counts[kind] += 1
        if self._pending >= self._max_pending:
            raise WorkerUnavailable("spaCy worker queue is full.")
        self._pending += 1
        deadline = time.monotonic() + timeout_ms / 1000
        worker: WorkerSlot | None = None
        discard = False
        acquired = False
        try:
            await self._acquire_slot(deadline, disconnected)
            acquired = True
            if self._closing:
                raise WorkerUnavailable("Analysis coordinator is closed.")
            worker = await self._ensure_worker(deadline, disconnected)
            if await self._is_disconnected(disconnected):
                raise ClientDisconnected()
            if time.monotonic() >= deadline:
                raise TimeoutError("spaCy analysis timed out.")

            job_id = uuid.uuid4().hex
            await self._write_frame(
                worker.writer,
                {**payload, "jobId": job_id, "workerEpoch": worker.epoch},
            )
            response = await self._read_response(worker, job_id, deadline, disconnected)
            if response.get("ok") is not True:
                status_code = response.get("statusCode")
                if isinstance(status_code, int):
                    raise AnalysisRequestError(
                        status_code,
                        str(response.get("error", "Worker rejected request.")),
                    )
                raise WorkerUnavailable(str(response.get("error", "Worker failed.")))
            result = response.get("result")
            if not isinstance(result, dict):
                raise WorkerUnavailable("Worker returned an invalid result.")
            return result
        except (ClientDisconnected, TimeoutError):
            discard = True
            raise
        except asyncio.CancelledError:
            discard = True
            raise
        except AnalysisRequestError:
            raise
        except (
            BrokenPipeError,
            ConnectionError,
            asyncio.IncompleteReadError,
            OSError,
        ) as error:
            discard = True
            raise WorkerUnavailable("spaCy worker exited unexpectedly.") from error
        except (json.JSONDecodeError, UnicodeDecodeError, struct.error) as error:
            discard = True
            raise WorkerUnavailable(
                "spaCy worker returned an invalid protocol frame."
            ) from error
        except WorkerUnavailable:
            discard = True
            raise
        finally:
            if discard and worker is not None:
                await self._discard_worker(worker)
            if acquired:
                self._slot_lock.release()
            self._pending -= 1

    async def _acquire_slot(self, deadline: float, disconnected: Disconnected) -> None:
        while True:
            if await self._is_disconnected(disconnected):
                raise ClientDisconnected()
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(
                    "spaCy analysis timed out while waiting for a worker."
                )
            try:
                await asyncio.wait_for(
                    self._slot_lock.acquire(), min(remaining, self._poll_interval_s)
                )
                return
            except TimeoutError:
                continue

    async def _ensure_worker(
        self, deadline: float, disconnected: Disconnected
    ) -> WorkerSlot:
        worker = self._worker
        if worker is not None and worker.process.returncode is None:
            return worker
        if worker is not None:
            await self._discard_worker(worker)
        if self._generation_id is None:
            raise WorkerUnavailable("spaCy worker generation is not configured.")
        self._next_epoch += 1
        epoch = self._next_epoch
        try:
            environment = os.environ.copy()
            environment["SPACY_GENERATION_ID"] = self._generation_id
            environment["SPACY_GENERATION_STORAGE_KEY"] = (
                self._generation_storage_key or self._generation_id
            )
            environment["SPACY_WORKER_EPOCH"] = str(epoch)
            if self._models_root is not None:
                environment["SPACY_MODELS_ROOT"] = self._models_root
            process = await asyncio.create_subprocess_exec(
                *self._worker_command,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                env=environment,
            )
        except OSError as error:
            raise WorkerUnavailable("Could not start spaCy worker.") from error
        if process.stdin is None or process.stdout is None:
            await self._stop_process(process)
            raise WorkerUnavailable("spaCy worker has no protocol streams.")
        candidate = WorkerSlot(
            epoch=epoch,
            process=process,
            reader=process.stdout,
            writer=process.stdin,
        )
        try:
            ready = await self._read_worker_ready(
                candidate.reader, deadline, disconnected
            )
            if ready != {
                "kind": "ready",
                "generationId": self._generation_id,
                "serverProtocolVersion": SERVER_PROTOCOL_VERSION,
                "workerEpoch": epoch,
            }:
                raise WorkerUnavailable(
                    "spaCy worker readiness handshake did not match its runtime."
                )
        except asyncio.CancelledError:
            await self._discard_worker(candidate)
            raise
        except BaseException as error:
            await self._discard_worker(candidate)
            if isinstance(error, ClientDisconnected | TimeoutError | WorkerUnavailable):
                raise
            raise WorkerUnavailable(
                "spaCy worker failed before its readiness handshake."
            ) from error
        self._worker = candidate
        return candidate

    async def _read_worker_ready(
        self,
        reader: asyncio.StreamReader,
        deadline: float,
        disconnected: Disconnected,
    ) -> dict[str, Any]:
        ready_task = asyncio.create_task(self._read_frame(reader))
        try:
            while True:
                if await self._is_disconnected(disconnected):
                    raise ClientDisconnected()
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError("spaCy worker readiness timed out.")
                done, _ = await asyncio.wait(
                    {ready_task},
                    timeout=min(remaining, self._poll_interval_s),
                )
                if ready_task in done:
                    return ready_task.result()
        finally:
            if not ready_task.done():
                ready_task.cancel()
                await asyncio.gather(ready_task, return_exceptions=True)

    async def _read_response(
        self,
        worker: WorkerSlot,
        job_id: str,
        deadline: float,
        disconnected: Disconnected,
    ) -> dict[str, Any]:
        response_task = asyncio.create_task(self._read_frame(worker.reader))
        try:
            while True:
                if await self._is_disconnected(disconnected):
                    raise ClientDisconnected()
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError("spaCy analysis timed out.")
                done, _ = await asyncio.wait(
                    {response_task},
                    timeout=min(remaining, self._poll_interval_s),
                )
                if response_task not in done:
                    continue
                response = response_task.result()
                if (
                    response.get("jobId") != job_id
                    or response.get("workerEpoch") != worker.epoch
                ):
                    raise WorkerUnavailable(
                        "Worker response did not match the active job."
                    )
                return response
        finally:
            if not response_task.done():
                response_task.cancel()
                await asyncio.gather(response_task, return_exceptions=True)

    async def _discard_worker(self, worker: WorkerSlot) -> None:
        if self._worker is worker:
            self._worker = None
        worker.writer.close()
        with contextlib.suppress(BrokenPipeError, ConnectionError, OSError):
            await worker.writer.wait_closed()
        await self._stop_process(worker.process)

    async def _stop_process(self, process: asyncio.subprocess.Process) -> None:
        if process.returncode is not None:
            await process.wait()
            return
        with contextlib.suppress(ProcessLookupError):
            process.terminate()
        try:
            await asyncio.wait_for(process.wait(), 0.25)
        except TimeoutError:
            with contextlib.suppress(ProcessLookupError):
                process.kill()
            await process.wait()

    async def _is_disconnected(self, disconnected: Disconnected) -> bool:
        result = disconnected()
        return await result if isinstance(result, Awaitable) else result

    async def _write_frame(
        self, writer: asyncio.StreamWriter, message: dict[str, Any]
    ) -> None:
        data = json.dumps(message, ensure_ascii=False, separators=(",", ":")).encode(
            "utf-8"
        )
        if len(data) > MAX_PARENT_REQUEST_FRAME_BYTES:
            raise AnalysisRequestError(413, "Analysis request exceeds protocol limit.")
        writer.write(struct.pack("!I", len(data)) + data)
        await writer.drain()

    async def _read_frame(self, reader: asyncio.StreamReader) -> dict[str, Any]:
        header = await reader.readexactly(4)
        size = struct.unpack("!I", header)[0]
        if size > MAX_WORKER_RESPONSE_FRAME_BYTES:
            raise WorkerUnavailable("Worker response exceeds protocol limit.")
        value = json.loads((await reader.readexactly(size)).decode("utf-8"))
        if not isinstance(value, dict):
            raise WorkerUnavailable("Worker response is not an object.")
        return value
