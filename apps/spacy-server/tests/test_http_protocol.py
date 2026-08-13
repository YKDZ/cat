from __future__ import annotations

import unittest
from typing import Any

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient

from src.main import app as server_app
from src.main import bounded_request_validation_handler
from src.models import AnalyzeRequest
from src.protocol_limits import (
    MAX_BATCH_ITEMS,
    MAX_ID_UTF8_BYTES,
    MAX_TEXT_UTF8_BYTES,
    MAX_TIMEOUT_MS,
)
from src.routes import router

GENERATION = {
    "id": "sha256:" + "a" * 64,
    "planDigest": "b" * 64,
    "schemaVersion": "1",
    "provisionerVersion": "1",
    "serverProtocolVersion": "1",
    "pythonAbi": "cpython-312",
    "pythonImplementation": "cpython",
    "pythonVersion": "3.12.11",
    "platform": "linux-x86_64",
    "spacyVersion": "3.8.7",
    "sitePackagesDigest": "d" * 64,
}
ATTESTATION = {
    "contract": "cat.language-analysis/v1",
    "languageId": "en",
    "generation": GENERATION,
    "semanticConfig": {
        "disabledPipes": ["ner", "parser"],
        "sentenceBoundary": "sentencizer",
    },
    "engine": {"name": "spaCy", "version": "3.8.7"},
    "pipeline": {"id": "sentencizer", "version": "1"},
    "model": {"id": "en_core_web_sm", "version": "3.8.0"},
    "assets": [{"id": "en_core_web_sm-3.8.0", "version": "3.8.0", "sha256": "c" * 64}],
}
ANALYSIS = {"sentences": [], "tokens": [], "runtimeAttestation": ATTESTATION}


class Coordinator:
    is_ready = True

    def __init__(self) -> None:
        self.payloads: list[dict[str, Any]] = []

    async def execute(
        self,
        payload: dict[str, Any],
        _timeout_ms: int,
        _disconnected: object,
    ) -> dict[str, Any]:
        self.payloads.append(payload)
        if payload["kind"] == "batch-analyze":
            return {
                "runtimeAttestation": ATTESTATION,
                "results": [{"id": "a", "result": ANALYSIS}],
            }
        return ANALYSIS


class Runtime:
    generation_id = GENERATION["id"]

    def capabilities(self) -> dict[str, object]:
        return {
            "generation": GENERATION,
            "engine": {"name": "spaCy", "version": "3.8.7"},
            "languages": [{"languageId": "en"}],
        }


class HttpProtocolTest(unittest.TestCase):
    def setUp(self) -> None:
        app = FastAPI()
        self.coordinator = Coordinator()
        app.state.analysis_coordinator = self.coordinator
        app.state.generation_runtime = Runtime()
        app.include_router(router)
        app.add_exception_handler(
            RequestValidationError, bounded_request_validation_handler
        )
        self.client = TestClient(app)

    def test_exposes_only_the_generation_protocol_routes(self) -> None:
        application_paths = {
            getattr(route, "path", None) for route in server_app.routes
        }
        paths = {getattr(route, "path", None) for route in router.routes}
        self.assertEqual(
            paths, {"/live", "/ready", "/capabilities", "/analyze", "/batch-analyze"}
        )
        self.assertEqual(application_paths, paths)
        self.assertEqual(self.client.get("/health").status_code, 404)
        self.assertEqual(self.client.get("/languages").status_code, 404)

    def test_request_accepts_only_canonical_language_id_not_internal_routing_keys(
        self,
    ) -> None:
        self.assertEqual(
            self.client.post(
                "/analyze",
                json={"text": "Hello", "languageId": "en", "lang": "en"},
            ).status_code,
            422,
        )
        self.assertEqual(
            self.client.post(
                "/analyze", json={"text": "Hello", "languageId": "en-us"}
            ).status_code,
            422,
        )
        AnalyzeRequest.model_validate({"text": "Hello", "languageId": "en-US"})

    def test_live_ready_and_capabilities_report_the_pinned_generation(self) -> None:
        self.assertEqual(self.client.get("/live").json(), {"status": "live"})
        self.assertEqual(
            self.client.get("/ready").json(),
            {"status": "ready", "generationId": GENERATION["id"]},
        )
        self.assertEqual(
            self.client.get("/capabilities").json()["generation"]["id"],
            GENERATION["id"],
        )

    def test_analysis_forwards_only_the_canonical_language_identity(self) -> None:
        response = self.client.post(
            "/analyze", json={"text": "Hello", "languageId": "en", "timeoutMs": 123}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.coordinator.payloads,
            [{"kind": "analyze", "text": "Hello", "languageId": "en"}],
        )
        self.assertEqual(
            response.json()["runtimeAttestation"]["generation"]["id"],
            GENERATION["id"],
        )

    def test_oversized_utf8_payloads_return_413_without_worker_dispatch(self) -> None:
        cases = [
            (
                "/analyze",
                {
                    "text": "é" * (MAX_TEXT_UTF8_BYTES // 2 + 1),
                    "languageId": "en",
                },
            ),
            (
                "/analyze",
                {
                    "text": "x",
                    "languageId": "é" * (MAX_ID_UTF8_BYTES // 2 + 1),
                },
            ),
            (
                "/batch-analyze",
                {
                    "items": [
                        {"id": str(index), "text": "x"}
                        for index in range(MAX_BATCH_ITEMS + 1)
                    ],
                    "languageId": "en",
                },
            ),
            (
                "/batch-analyze",
                {
                    "items": [
                        {
                            "id": "é" * (MAX_ID_UTF8_BYTES // 2 + 1),
                            "text": "x",
                        }
                    ],
                    "languageId": "en",
                },
            ),
            (
                "/batch-analyze",
                {
                    "items": [
                        {"id": "a", "text": "x" * MAX_TEXT_UTF8_BYTES},
                        {"id": "b", "text": "x" * MAX_TEXT_UTF8_BYTES},
                        {"id": "c", "text": "x"},
                    ],
                    "languageId": "en",
                },
            ),
        ]

        for path, payload in cases:
            with self.subTest(path=path):
                response = self.client.post(path, json=payload)
                self.assertEqual(response.status_code, 413)
                self.assertNotIn("x" * 1024, response.text)
        self.assertEqual(self.coordinator.payloads, [])

    def test_invalid_ids_utf8_and_timeout_return_422(self) -> None:
        invalid = [
            {"text": "x", "languageId": "en", "timeoutMs": MAX_TIMEOUT_MS + 1},
            {"text": "x", "languageId": "en-us"},
        ]
        for payload in invalid:
            with self.subTest(payload=payload):
                self.assertEqual(
                    self.client.post("/analyze", json=payload).status_code, 422
                )
        self.assertEqual(
            self.client.post(
                "/batch-analyze",
                json={
                    "items": [{"id": "", "text": "x"}],
                    "languageId": "en",
                },
            ).status_code,
            422,
        )

    def test_cjk_and_emoji_limits_are_measured_as_utf8_bytes(self) -> None:
        AnalyzeRequest.model_validate(
            {
                "text": "😀" * (MAX_TEXT_UTF8_BYTES // 4),
                "languageId": "en",
            }
        )
        with self.assertRaises(ValueError):
            AnalyzeRequest.model_validate(
                {
                    "text": "😀" * (MAX_TEXT_UTF8_BYTES // 4 + 1),
                    "languageId": "en",
                }
            )
        with self.assertRaises(ValueError):
            AnalyzeRequest.model_validate(
                {
                    "text": "界" * (MAX_TEXT_UTF8_BYTES // 3 + 1),
                    "languageId": "en",
                }
            )
        self.assertEqual(
            self.client.post(
                "/batch-analyze",
                json={
                    "items": [
                        {"id": "same", "text": "a"},
                        {"id": "same", "text": "b"},
                    ],
                    "languageId": "en",
                },
            ).status_code,
            422,
        )
        self.assertEqual(
            self.client.post(
                "/analyze",
                content=b'{"text":"\\ud800","languageId":"en"}',
                headers={"content-type": "application/json"},
            ).status_code,
            422,
        )


if __name__ == "__main__":
    unittest.main()
