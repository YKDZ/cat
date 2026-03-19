from __future__ import annotations

from pydantic import BaseModel


# Mapping from BCP-47 language code (first subtag) to spaCy model name.
# Can be extended by setting the SPACY_EXTRA_MODELS environment variable:
#   SPACY_EXTRA_MODELS=nl:nl_core_news_sm,sv:sv_core_news_sm
MODEL_MAP: dict[str, str] = {
    "en": "en_core_web_sm",
    "zh": "zh_core_web_sm",
    "ja": "ja_core_news_sm",
    "ko": "ko_core_news_sm",
    "de": "de_core_news_sm",
    "fr": "fr_core_news_sm",
    "es": "es_core_news_sm",
    "pt": "pt_core_news_sm",
    "ru": "ru_core_news_sm",
    "it": "it_core_news_sm",
}


class TokenResponse(BaseModel):
    text: str
    lemma: str
    pos: str
    start: int
    end: int
    is_stop: bool
    is_punct: bool


class SentenceResponse(BaseModel):
    text: str
    start: int
    end: int
    tokens: list[TokenResponse]


class SegmentResponse(BaseModel):
    sentences: list[SentenceResponse]
    tokens: list[TokenResponse]


class SegmentRequest(BaseModel):
    text: str
    lang: str


class BatchSegmentItem(BaseModel):
    id: str
    text: str


class BatchSegmentRequest(BaseModel):
    items: list[BatchSegmentItem]
    lang: str


class BatchSegmentItemResult(BaseModel):
    id: str
    result: SegmentResponse


class BatchSegmentResponse(BaseModel):
    results: list[BatchSegmentItemResult]
