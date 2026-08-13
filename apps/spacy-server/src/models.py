from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel
from pydantic_core import PydanticCustomError

from .generations import PlanError, canonical_language_id
from .protocol import validate_batch_item_ids
from .protocol_limits import (
    MAX_BATCH_ITEMS,
    MAX_BATCH_TEXT_UTF8_BYTES,
    MAX_ID_UTF8_BYTES,
    MAX_TEXT_UTF8_BYTES,
    MAX_TIMEOUT_MS,
)


def _utf8_size(value: str, context: str) -> int:
    try:
        return len(value.encode("utf-8"))
    except UnicodeEncodeError as error:
        raise ValueError(f"{context} must be valid UTF-8 text.") from error


def _bounded_utf8(value: str, limit: int, context: str) -> str:
    if _utf8_size(value, context) > limit:
        raise PydanticCustomError(
            "payload_too_large",
            f"{context} exceeds its UTF-8 byte limit.",
        )
    return value


class ProtocolModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
        extra="forbid",
    )


class TokenResponse(ProtocolModel):
    text: str
    lemma: str
    pos: str
    start: int
    end: int
    is_stop: bool
    is_punct: bool


class SentenceResponse(ProtocolModel):
    text: str
    start: int
    end: int
    tokens: list[TokenResponse]


class RuntimeAssetResponse(ProtocolModel):
    id: str
    version: str
    sha256: str


class RuntimeGenerationResponse(ProtocolModel):
    id: str
    plan_digest: str
    schema_version: str
    provisioner_version: str
    server_protocol_version: str
    python_abi: str
    python_implementation: str
    python_version: str
    platform: str
    spacy_version: str
    site_packages_digest: str


class RuntimeAttestationResponse(ProtocolModel):
    contract: str
    language_id: str
    generation: RuntimeGenerationResponse
    semantic_config: dict[str, object]
    engine: dict[str, str]
    pipeline: dict[str, str]
    model: dict[str, str]
    assets: list[RuntimeAssetResponse]


class LanguageAnalysisResponse(ProtocolModel):
    sentences: list[SentenceResponse]
    tokens: list[TokenResponse]
    runtime_attestation: RuntimeAttestationResponse


class AnalyzeRequest(ProtocolModel):
    text: str
    language_id: str
    timeout_ms: int = Field(default=30_000, gt=0, le=MAX_TIMEOUT_MS)

    @field_validator("text")
    @classmethod
    def require_bounded_text(cls, value: str) -> str:
        return _bounded_utf8(value, MAX_TEXT_UTF8_BYTES, "text")

    @field_validator("language_id")
    @classmethod
    def require_canonical_language_id(cls, value: str) -> str:
        _bounded_utf8(value, MAX_ID_UTF8_BYTES, "languageId")
        try:
            return canonical_language_id(value)
        except PlanError as error:
            raise ValueError(str(error)) from error


class LanguageAnalysisBatchItem(ProtocolModel):
    id: str
    text: str

    @field_validator("id")
    @classmethod
    def require_bounded_id(cls, value: str) -> str:
        if not value:
            raise ValueError("Batch item id must not be empty.")
        return _bounded_utf8(value, MAX_ID_UTF8_BYTES, "Batch item id")

    @field_validator("text")
    @classmethod
    def require_bounded_text(cls, value: str) -> str:
        return _bounded_utf8(value, MAX_TEXT_UTF8_BYTES, "Batch item text")


class LanguageAnalysisBatchRequest(ProtocolModel):
    items: list[LanguageAnalysisBatchItem] = Field(min_length=1)
    language_id: str
    timeout_ms: int = Field(default=30_000, gt=0, le=MAX_TIMEOUT_MS)

    @field_validator("items", mode="before")
    @classmethod
    def require_bounded_item_count(cls, value: object) -> object:
        if isinstance(value, list) and len(value) > MAX_BATCH_ITEMS:
            raise PydanticCustomError(
                "payload_too_large",
                "Language analysis batch exceeds its item limit.",
            )
        return value

    @field_validator("language_id")
    @classmethod
    def require_canonical_language_id(cls, value: str) -> str:
        return AnalyzeRequest.require_canonical_language_id(value)

    @model_validator(mode="after")
    def require_unique_item_ids(self) -> LanguageAnalysisBatchRequest:
        validate_batch_item_ids([item.id for item in self.items])
        if (
            sum(_utf8_size(item.text, "Batch item text") for item in self.items)
            > MAX_BATCH_TEXT_UTF8_BYTES
        ):
            raise PydanticCustomError(
                "payload_too_large",
                "Language analysis batch exceeds its total UTF-8 byte limit.",
            )
        return self


class LanguageAnalysisBatchItemResult(ProtocolModel):
    id: str
    result: LanguageAnalysisResponse


class LanguageAnalysisBatchResponse(ProtocolModel):
    runtime_attestation: RuntimeAttestationResponse
    results: list[LanguageAnalysisBatchItemResult]
