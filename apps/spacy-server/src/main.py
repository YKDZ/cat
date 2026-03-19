from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI

from .models import MODEL_MAP
from .routes import router

_models_loaded: bool = False


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Eagerly load models specified via SPACY_PRELOAD_LANGS env var (comma-separated)
    preload = os.getenv("SPACY_PRELOAD_LANGS", "")
    if preload:
        from .routes import get_model  # noqa: PLC0415

        for lang in preload.split(","):
            lang = lang.strip()
            if lang and lang in MODEL_MAP:
                get_model(lang)

    yield


app = FastAPI(title="CAT spaCy Server", lifespan=lifespan)
app.include_router(router)
