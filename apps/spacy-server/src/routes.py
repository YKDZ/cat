from __future__ import annotations

import os
from typing import cast

from fastapi import APIRouter, HTTPException, Request

from .coordinator import (
    AnalysisCoordinator,
    AnalysisRequestError,
    ClientDisconnected,
    WorkerUnavailable,
)
from .models import (
    AnalyzeRequest,
    LanguageAnalysisBatchRequest,
    LanguageAnalysisBatchResponse,
    LanguageAnalysisResponse,
)
from .runtime import GenerationRuntime

router = APIRouter()
test_router = APIRouter()


def _coordinator(request: Request) -> AnalysisCoordinator:
    return cast(AnalysisCoordinator, request.app.state.analysis_coordinator)


def _runtime(request: Request) -> GenerationRuntime:
    return cast(GenerationRuntime, request.app.state.generation_runtime)


async def _execute(
    coordinator: AnalysisCoordinator,
    payload: dict[str, object],
    timeout_ms: int,
    request: Request,
) -> dict[str, object]:
    try:
        return await coordinator.execute(payload, timeout_ms, request.is_disconnected)
    except TimeoutError as error:
        raise HTTPException(
            status_code=504, detail={"code": "analysis_timeout"}
        ) from error
    except WorkerUnavailable as error:
        raise HTTPException(
            status_code=503, detail={"code": "analysis_worker_unavailable"}
        ) from error
    except AnalysisRequestError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail={"code": "analysis_request_rejected"},
        ) from error
    except ClientDisconnected as error:
        raise HTTPException(
            status_code=499, detail={"code": "client_disconnected"}
        ) from error


@router.get("/live")
def live() -> dict[str, str]:
    return {"status": "live"}


@router.get("/ready")
def ready(request: Request) -> dict[str, str]:
    coordinator = _coordinator(request)
    if not coordinator.is_ready:
        raise HTTPException(status_code=503, detail={"code": "worker_not_ready"})
    runtime = _runtime(request)
    return {"status": "ready", "generationId": runtime.generation_id}


@router.get("/capabilities")
def capabilities(request: Request) -> dict[str, object]:
    return _runtime(request).capabilities()


@test_router.get("/_test/request-counts")
def request_counts(request: Request) -> dict[str, int]:
    if os.environ.get("CAT_TEST_EXPOSE_REQUEST_COUNTS") != "1":
        raise HTTPException(status_code=404, detail={"code": "not_found"})
    return _coordinator(request).request_counts


@router.post("/analyze", response_model=LanguageAnalysisResponse)
async def analyze(
    payload: AnalyzeRequest, request: Request
) -> LanguageAnalysisResponse:
    result = await _execute(
        _coordinator(request),
        {
            "kind": "analyze",
            "text": payload.text,
            "languageId": payload.language_id,
        },
        payload.timeout_ms,
        request,
    )
    return LanguageAnalysisResponse.model_validate(result)


@router.post("/batch-analyze", response_model=LanguageAnalysisBatchResponse)
async def batch_analyze(
    payload: LanguageAnalysisBatchRequest, request: Request
) -> LanguageAnalysisBatchResponse:
    result = await _execute(
        _coordinator(request),
        {
            "kind": "batch-analyze",
            "items": [item.model_dump(by_alias=True) for item in payload.items],
            "languageId": payload.language_id,
        },
        payload.timeout_ms,
        request,
    )
    return LanguageAnalysisBatchResponse.model_validate(result)
