from __future__ import annotations

from typing import Any

from .models import (
    LanguageAnalysisResponse,
    RuntimeAttestationResponse,
    SentenceResponse,
    TokenResponse,
)
from .offsets import utf16_offsets


def doc_to_response(
    doc: Any, attestation: RuntimeAttestationResponse
) -> LanguageAnalysisResponse:
    offsets = utf16_offsets(doc.text)
    all_tokens: list[TokenResponse] = []
    sentences: list[SentenceResponse] = []
    for sent in doc.sents:
        tokens = [
            TokenResponse(
                text=token.text,
                lemma=token.lemma_,
                pos=token.pos_,
                start=offsets[token.idx],
                end=offsets[token.idx + len(token.text)],
                is_stop=token.is_stop,
                is_punct=token.is_punct,
            )
            for token in sent
            if not token.is_space
        ]
        all_tokens.extend(tokens)
        sentences.append(
            SentenceResponse(
                text=sent.text,
                start=offsets[sent.start_char],
                end=offsets[sent.end_char],
                tokens=tokens,
            )
        )
    return LanguageAnalysisResponse(
        sentences=sentences,
        tokens=all_tokens,
        runtime_attestation=attestation,
    )
