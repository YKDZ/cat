FROM node:24-bookworm

# 禁用 Corepack 下载提示并设置默认 Shell
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV SHELL=/bin/bash

# 启用 Corepack
RUN corepack enable

# 配置 pnpm 全局目录环境变量
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

# 设置 pnpm 环境并安装全局工具
RUN pnpm setup \
    && pnpm add --global nx
