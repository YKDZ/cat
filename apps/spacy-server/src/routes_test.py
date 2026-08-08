import asyncio
import errno
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from src.coordinator import (
    AnalysisCoordinator,
    AnalysisRequestError,
    ClientDisconnected,
    WorkerUnavailable,
)
from src.offsets import utf16_offsets
from src.protocol import validate_batch_item_ids
from src.worker import ResponseFrameTooLarge, write_frame

NORMAL_REQUEST_TIMEOUT_MS = 1_000


class Utf16OffsetsTest(unittest.TestCase):
    def test_non_bmp_characters_use_js_utf16_code_units(self) -> None:
        offsets = utf16_offsets("A😀 word")

        self.assertEqual(offsets, [0, 1, 3, 4, 5, 6, 7, 8])

    def test_batch_protocol_rejects_empty_and_duplicate_items(self) -> None:
        with self.assertRaisesRegex(ValueError, "at least one"):
            validate_batch_item_ids([])
        with self.assertRaisesRegex(ValueError, "must be unique"):
            validate_batch_item_ids(["same", "same"])

    def test_worker_response_frame_limit_is_enforced_before_write(self) -> None:
        with (
            mock.patch("src.worker.MAX_WORKER_RESPONSE_FRAME_BYTES", 1),
            self.assertRaises(ResponseFrameTooLarge),
        ):
            write_frame({"value": "too large"})


class AnalysisCoordinatorTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        fixture = Path(__file__).parents[1] / "tests" / "worker_fixture.py"
        self.coordinator = AnalysisCoordinator(
            worker_command=(sys.executable, str(fixture)),
            poll_interval_s=0.005,
            generation_id="generation-test",
        )
        await self.coordinator.start()

    async def asyncTearDown(self) -> None:
        await self.coordinator.close()

    async def test_returns_a_worker_result_and_reuses_its_model_process(self) -> None:
        first = await self.coordinator.execute(
            {"text": "first"}, NORMAL_REQUEST_TIMEOUT_MS, never_disconnected
        )
        second = await self.coordinator.execute(
            {"text": "second"}, NORMAL_REQUEST_TIMEOUT_MS, never_disconnected
        )

        self.assertEqual(first["text"], "first")
        self.assertEqual(second["text"], "second")
        self.assertEqual(first["pid"], second["pid"])

    async def test_timeout_terminates_the_active_worker_and_replaces_it(self) -> None:
        active_pid = self.coordinator.worker_pid
        with self.assertRaises(TimeoutError):
            await self.coordinator.execute({"delay_ms": 100}, 10, never_disconnected)

        self.assertIsNone(self.coordinator.worker_pid)
        self.assertProcessGone(active_pid)
        result = await self.coordinator.execute(
            {"text": "replacement"}, NORMAL_REQUEST_TIMEOUT_MS, never_disconnected
        )
        self.assertNotEqual(result["pid"], active_pid)

    async def test_client_disconnect_terminates_the_active_worker(self) -> None:
        disconnected = asyncio.Event()
        request = asyncio.create_task(
            self.coordinator.execute(
                {"delay_ms": 100},
                NORMAL_REQUEST_TIMEOUT_MS,
                lambda: disconnected.is_set(),
            )
        )
        await asyncio.sleep(0.01)
        disconnected.set()

        with self.assertRaises(ClientDisconnected):
            await request
        self.assertIsNone(self.coordinator.worker_pid)

    async def test_task_cancellation_terminates_the_active_worker(self) -> None:
        active_pid = self.coordinator.worker_pid
        request = asyncio.create_task(
            self.coordinator.execute(
                {"delay_ms": 100}, NORMAL_REQUEST_TIMEOUT_MS, never_disconnected
            )
        )
        await asyncio.sleep(0.01)
        request.cancel()

        with self.assertRaises(asyncio.CancelledError):
            await request
        self.assertIsNone(self.coordinator.worker_pid)
        self.assertProcessGone(active_pid)

    async def test_batch_uses_the_same_bounded_protocol(self) -> None:
        result = await self.coordinator.execute(
            {"items": [{"id": "a", "text": "one"}, {"id": "b", "text": "two"}]},
            NORMAL_REQUEST_TIMEOUT_MS,
            never_disconnected,
        )

        self.assertEqual(
            result["items"], [{"id": "a", "text": "one"}, {"id": "b", "text": "two"}]
        )

    async def test_queued_disconnect_does_not_kill_the_running_job(self) -> None:
        running = asyncio.create_task(
            self.coordinator.execute(
                {"delay_ms": 60}, NORMAL_REQUEST_TIMEOUT_MS, never_disconnected
            )
        )
        await asyncio.sleep(0.01)
        active_pid = self.coordinator.worker_pid
        with self.assertRaises(ClientDisconnected):
            await self.coordinator.execute(
                {"text": "queued"}, NORMAL_REQUEST_TIMEOUT_MS, lambda: True
            )

        completed = await running
        self.assertEqual(completed["pid"], active_pid)
        self.assertEqual(self.coordinator.worker_pid, active_pid)

    async def test_crashed_worker_reports_unavailable_and_is_replaced(self) -> None:
        active_pid = self.coordinator.worker_pid
        with self.assertRaises(WorkerUnavailable):
            await self.coordinator.execute(
                {"crash": True}, NORMAL_REQUEST_TIMEOUT_MS, never_disconnected
            )

        result = await self.coordinator.execute(
            {"text": "replacement"}, NORMAL_REQUEST_TIMEOUT_MS, never_disconnected
        )
        self.assertNotEqual(result["pid"], active_pid)

    async def test_malformed_worker_frame_terminates_the_protocol_peer(self) -> None:
        active_pid = self.coordinator.worker_pid
        with self.assertRaises(WorkerUnavailable):
            await self.coordinator.execute(
                {"malformed": True}, NORMAL_REQUEST_TIMEOUT_MS, never_disconnected
            )

        self.assertIsNone(self.coordinator.worker_pid)
        self.assertProcessGone(active_pid)

    async def test_stale_worker_epoch_cannot_publish_into_a_replacement_slot(
        self,
    ) -> None:
        active_pid = self.coordinator.worker_pid
        with self.assertRaises(WorkerUnavailable):
            await self.coordinator.execute(
                {"wrong_epoch": True}, NORMAL_REQUEST_TIMEOUT_MS, never_disconnected
            )

        self.assertIsNone(self.coordinator.worker_pid)
        self.assertProcessGone(active_pid)

    async def test_worker_request_rejection_does_not_replace_a_healthy_worker(
        self,
    ) -> None:
        active_pid = self.coordinator.worker_pid
        with self.assertRaises(AnalysisRequestError) as error:
            await self.coordinator.execute(
                {"unsupported": True}, NORMAL_REQUEST_TIMEOUT_MS, never_disconnected
            )

        self.assertEqual(error.exception.status_code, 422)
        self.assertEqual(self.coordinator.worker_pid, active_pid)

    async def test_parent_request_frame_limit_returns_413_without_replacement(
        self,
    ) -> None:
        active_pid = self.coordinator.worker_pid
        with (
            mock.patch("src.coordinator.MAX_PARENT_REQUEST_FRAME_BYTES", 8),
            self.assertRaises(AnalysisRequestError) as error,
        ):
            await self.coordinator.execute(
                {"text": "too large"}, NORMAL_REQUEST_TIMEOUT_MS, never_disconnected
            )

        self.assertEqual(error.exception.status_code, 413)
        self.assertEqual(self.coordinator.worker_pid, active_pid)

    async def test_worker_is_not_ready_before_a_valid_handshake(self) -> None:
        fixture = Path(__file__).parents[1] / "tests" / "worker_fixture.py"
        coordinator = AnalysisCoordinator(
            worker_command=(sys.executable, str(fixture), "delayed-handshake"),
            generation_id="generation-test",
            worker_start_timeout_s=0.02,
        )
        self.addAsyncCleanup(coordinator.close)
        startup = asyncio.create_task(coordinator.start())
        await asyncio.sleep(0.005)
        self.assertFalse(coordinator.is_ready)

        with self.assertRaises(TimeoutError):
            await startup
        self.assertFalse(coordinator.is_ready)

    async def test_rejects_bad_or_missing_worker_handshakes(self) -> None:
        fixture = Path(__file__).parents[1] / "tests" / "worker_fixture.py"
        for mode in ("bad-handshake", "exit-before-handshake"):
            with self.subTest(mode=mode):
                coordinator = AnalysisCoordinator(
                    worker_command=(sys.executable, str(fixture), mode),
                    generation_id="generation-test",
                    worker_start_timeout_s=1.0,
                )
                try:
                    with self.assertRaises(WorkerUnavailable):
                        await coordinator.start()
                    self.assertFalse(coordinator.is_ready)
                finally:
                    await coordinator.close()

    async def test_replacement_handshake_uses_the_request_deadline(self) -> None:
        fixture = Path(__file__).parents[1] / "tests" / "worker_fixture.py"
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / "replacement"
            coordinator = AnalysisCoordinator(
                worker_command=(
                    sys.executable,
                    str(fixture),
                    "delay-replacement",
                    str(marker),
                ),
                generation_id="generation-test",
                worker_start_timeout_s=1.0,
            )
            self.addAsyncCleanup(coordinator.close)
            await coordinator.start()
            with self.assertRaises(WorkerUnavailable):
                await coordinator.execute(
                    {"crash": True}, NORMAL_REQUEST_TIMEOUT_MS, never_disconnected
                )

            started = time.monotonic()
            with self.assertRaises(TimeoutError):
                await coordinator.execute(
                    {"text": "replacement"}, 20, never_disconnected
                )
            self.assertLess(time.monotonic() - started, 0.08)

    async def test_replacement_handshake_observes_client_disconnect(self) -> None:
        fixture = Path(__file__).parents[1] / "tests" / "worker_fixture.py"
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / "replacement"
            coordinator = AnalysisCoordinator(
                worker_command=(
                    sys.executable,
                    str(fixture),
                    "delay-replacement",
                    str(marker),
                ),
                generation_id="generation-test",
                worker_start_timeout_s=1.0,
            )
            self.addAsyncCleanup(coordinator.close)
            await coordinator.start()
            with self.assertRaises(WorkerUnavailable):
                await coordinator.execute({"crash": True}, 200, never_disconnected)
            disconnected = asyncio.Event()
            request = asyncio.create_task(
                coordinator.execute(
                    {"text": "replacement"},
                    NORMAL_REQUEST_TIMEOUT_MS,
                    lambda: disconnected.is_set(),
                )
            )
            await asyncio.sleep(0.01)
            started = time.monotonic()
            disconnected.set()

            with self.assertRaises(ClientDisconnected):
                await request
            self.assertLess(time.monotonic() - started, 0.08)

    async def test_shutdown_terminates_an_active_worker_without_a_zombie(self) -> None:
        active_pid = self.coordinator.worker_pid
        request = asyncio.create_task(
            self.coordinator.execute(
                {"delay_ms": 100}, NORMAL_REQUEST_TIMEOUT_MS, never_disconnected
            )
        )
        await asyncio.sleep(0.01)
        await self.coordinator.close()

        with self.assertRaises(WorkerUnavailable):
            await request
        self.assertIsNone(self.coordinator.worker_pid)
        self.assertProcessGone(active_pid)

    def assertProcessGone(self, pid: str | None) -> None:
        if pid is None:
            self.fail("Expected a worker PID")
            return
        try:
            os.kill(int(pid), 0)
        except OSError as error:
            self.assertEqual(error.errno, errno.ESRCH)
        else:
            self.fail(f"Worker {pid} is still running")


async def never_disconnected() -> bool:
    return False


if __name__ == "__main__":
    unittest.main()
