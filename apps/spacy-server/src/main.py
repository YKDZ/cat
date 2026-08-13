from __future__ import annotations

import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response

from .coordinator import AnalysisCoordinator
from .generations import GenerationStore
from .routes import router, test_router
from .runtime import GenerationRuntime


async def bounded_request_validation_handler(
    _request: Request, error: Exception
) -> Response:
    if not isinstance(error, RequestValidationError):
        raise error
    errors = error.errors()
    status_code = (
        413 if any(item.get("type") == "payload_too_large" for item in errors) else 422
    )
    detail = [
        {key: item[key] for key in ("type", "loc", "msg") if key in item}
        for item in errors
    ]
    return JSONResponse(status_code=status_code, content={"detail": detail})


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    models_root = Path(os.environ.get("SPACY_MODELS_ROOT", "/models"))
    runtime = GenerationRuntime.open_active(GenerationStore(models_root))
    coordinator = AnalysisCoordinator(
        generation_id=runtime.generation_id,
        generation_storage_key=runtime.storage_key,
        models_root=str(models_root),
    )
    try:
        await coordinator.start()
        app.state.generation_runtime = runtime
        app.state.analysis_coordinator = coordinator
        yield
    finally:
        await coordinator.close()
        runtime.close()


app = FastAPI(
    title="CAT spaCy Server",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
app.include_router(router)
if os.environ.get("CAT_TEST_EXPOSE_REQUEST_COUNTS") == "1":
    app.include_router(test_router)
app.add_exception_handler(RequestValidationError, bounded_request_validation_handler)
