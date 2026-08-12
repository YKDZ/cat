FROM ghcr.io/astral-sh/uv:0.8.3@sha256:ef11ed817e6a5385c02cd49fdcc99c23d02426088252a8eace6b6e6a2a511f36 AS uv

FROM node:26.7.0-bookworm-slim@sha256:cd565714d4da3e84bfd341e31448f81d47c6362198f152345297c9c1154e6341

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  COREPACK_HOME=/corepack \
  PNPM_HOME=/pnpm \
  PATH=/pnpm:$PATH \
  SHELL=/bin/bash \
  UV_PYTHON=3.12.11

ARG PACKAGE_MANAGER_PIN=pnpm@11.11.0+sha512.4463f65fd80ed80d69bc1d4bf163ee94f605c7380fc318bb5b2ebe15f8cd12d49c51a4d59e951b401e764d3b6ca751cbf51bc50ed7001a6bcb4935e684c34882
ARG DOCKER_CE_VERSION=5:29.6.1-1~debian.12~bookworm
ARG DOCKER_BUILDX_VERSION=0.35.0-1~debian.12~bookworm
ARG DOCKER_COMPOSE_VERSION=5.3.1-1~debian.12~bookworm

COPY --from=uv /uv /usr/local/bin/uv

RUN apt-get update \
  && apt-get install --yes --no-install-recommends \
  curl \
  git \
  openssh-client \
  && install -m 0755 -d /etc/apt/keyrings \
  && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
  && chmod a+r /etc/apt/keyrings/docker.asc \
  && printf '%s\n' \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" \
  > /etc/apt/sources.list.d/docker.list \
  && apt-get update \
  && apt-get install --yes --no-install-recommends \
  docker-ce-cli="${DOCKER_CE_VERSION}" \
  docker-buildx-plugin="${DOCKER_BUILDX_VERSION}" \
  docker-compose-plugin="${DOCKER_COMPOSE_VERSION}" \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack install --global "${PACKAGE_MANAGER_PIN}" \
  && test "$(pnpm --version)" = "11.11.0" \
  && docker --version \
  && docker buildx version \
  && docker compose version
