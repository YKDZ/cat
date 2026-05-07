FROM node:24-bookworm

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV SHELL=/bin/bash
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apt-get update \
    && apt-get install -y --no-install-recommends screen tmux \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && pnpm setup \
    && pnpm install -g @github/copilot @anthropic-ai/claude-code \
    && pnpm approve-builds --all -g