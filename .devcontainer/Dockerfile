FROM node:24-bookworm

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    SHELL=/bin/bash \
    PNPM_HOME="/pnpm" \
    PATH="$PNPM_HOME:$PATH"

RUN apt-get update \
    && apt-get install -y --no-install-recommends screen tmux \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && pnpm setup \
    && pnpm install -g @github/copilot @anthropic-ai/claude-code
