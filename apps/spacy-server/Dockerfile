# syntax=docker/dockerfile:1

FROM ghcr.io/astral-sh/uv:0.8.3@sha256:ef11ed817e6a5385c02cd49fdcc99c23d02426088252a8eace6b6e6a2a511f36 AS uv

FROM python:3.12.11-slim-bookworm@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7 AS dependencies
WORKDIR /app
COPY --from=uv /uv /bin/uv
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    UV_CONCURRENT_DOWNLOADS=1 UV_HTTP_TIMEOUT=60 \
    uv sync --frozen --no-dev --no-install-project

FROM python:3.12.11-slim-bookworm@sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7 AS spacy
ARG DEPLOYMENT_BUILD_ID=local
LABEL org.opencontainers.image.version="${DEPLOYMENT_BUILD_ID}" \
    org.opencontainers.image.description="CAT spaCy language analysis runtime"
ENV HOME=/tmp/home \
    PATH=/app/.venv/bin:${PATH} \
    PIP_CACHE_DIR=/tmp/cache/pip \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SPACY_MODELS_ROOT=/models \
    TMPDIR=/tmp \
    XDG_CACHE_HOME=/tmp/cache
WORKDIR /app
COPY --from=dependencies /app/.venv /app/.venv
COPY default-plan.json ./default-plan.json
COPY src ./src
RUN groupadd --gid 10001 cat-spacy \
    && useradd --uid 10001 --gid 10001 --no-create-home --home-dir /models/home cat-spacy \
    && mkdir -p /models \
    && chown -R 10001:10001 /models \
    && chmod -R a-w /app
USER 10001:10001
VOLUME ["/models"]
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=18 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/ready', timeout=3).read()"
ENTRYPOINT ["python", "-m", "src.cli"]
CMD ["provision-and-serve"]
