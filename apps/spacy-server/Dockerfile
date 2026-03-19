# syntax=docker/dockerfile:1
FROM python:3.12-slim AS base

WORKDIR /app

# Install system dependencies required by some spaCy models
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download spaCy language models.
# Override at build time via:
#   docker build --build-arg SPACY_MODELS="en_core_web_sm zh_core_web_sm" .
ARG SPACY_MODELS="en_core_web_sm zh_core_web_sm ja_core_news_sm de_core_news_sm"
RUN for model in $SPACY_MODELS; do python -m spacy download "$model"; done

# Copy application source
COPY src/ ./src/

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
