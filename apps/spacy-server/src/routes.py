from __future__ import annotations

import os

import spacy
from fastapi import APIRouter, HTTPException

from .models import (
    MODEL_MAP,
    BatchSegmentRequest,
    BatchSegmentResponse,
    SegmentRequest,
    SegmentResponse,
    SentenceResponse,
    TokenResponse,
)

router = APIRouter()

# Runtime model cache: lang code → loaded spaCy Language object
_models: dict[str, spacy.Language] = {}

# Allow extra models via env var: SPACY_EXTRA_MODELS=nl:nl_core_news_sm,sv:sv_core_news_sm
_extra = os.getenv("SPACY_EXTRA_MODELS", "")
if _extra:
    for _entry in _extra.split(","):
        _entry = _entry.strip()
        if ":" in _entry:
            _lang, _model = _entry.split(":", 1)
            MODEL_MAP[_lang.strip()] = _model.strip()


def get_model(lang: str) -> spacy.Language:
    """Load and cache spaCy model for the given language code."""
    if lang not in _models:
        model_name = MODEL_MAP.get(lang)
        if not model_name:
            raise HTTPException(
                status_code=422,
                detail=f"Unsupported language: '{lang}'. Available: {sorted(MODEL_MAP.keys())}",
            )
        # Disable NER and dependency parser to reduce memory and speed up processing.
        # Add sentencizer as a lightweight sentence boundary detector.
        nlp = spacy.load(model_name, disable=["ner", "parser"])
        if not nlp.has_pipe("sentencizer"):
            nlp.add_pipe("sentencizer")
        _models[lang] = nlp
    return _models[lang]


def _doc_to_response(doc: spacy.tokens.Doc) -> SegmentResponse:
    """Convert a spaCy Doc to the API SegmentResponse format."""
    all_tokens: list[TokenResponse] = []
    sentences: list[SentenceResponse] = []

    for sent in doc.sents:
        sent_tokens = [
            TokenResponse(
                text=token.text,
                lemma=token.lemma_,
                pos=token.pos_,
                start=token.idx,
                end=token.idx + len(token.text),
                is_stop=token.is_stop,
                is_punct=token.is_punct,
            )
            for token in sent
            if not token.is_space
        ]
        all_tokens.extend(sent_tokens)
        sentences.append(
            SentenceResponse(
                text=sent.text,
                start=sent.start_char,
                end=sent.end_char,
                tokens=sent_tokens,
            )
        )

    return SegmentResponse(sentences=sentences, tokens=all_tokens)


@router.post("/segment", response_model=SegmentResponse)
def segment(request: SegmentRequest) -> SegmentResponse:
    """Segment a single text into sentences and tokens."""
    nlp = get_model(request.lang)
    doc = nlp(request.text)
    return _doc_to_response(doc)


@router.post("/batch-segment", response_model=BatchSegmentResponse)
def batch_segment(request: BatchSegmentRequest) -> BatchSegmentResponse:
    """Batch-segment multiple texts using spaCy nlp.pipe() for throughput."""
    nlp = get_model(request.lang)
    texts = [item.text for item in request.items]
    ids = [item.id for item in request.items]

    results = [
        {"id": item_id, "result": _doc_to_response(doc)}
        for item_id, doc in zip(ids, nlp.pipe(texts))
    ]

    return BatchSegmentResponse(results=results)


@router.get("/languages")
def languages() -> dict[str, list[str]]:
    """Return the list of supported language codes."""
    return {"languages": sorted(MODEL_MAP.keys())}


@router.get("/health")
def health() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}
