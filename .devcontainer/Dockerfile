FROM node:24-bookworm

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV SHELL=/bin/bash

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable \
    && pnpm setup \
    && pnpm install -g @github/copilot
