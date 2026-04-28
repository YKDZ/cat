FROM node:24-bookworm

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    SHELL=/bin/bash \
    PNPM_HOME="/pnpm" \
    PATH="$PNPM_HOME:$PATH"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        openssh-server \
        curl \
        gnupg \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
    && pnpm setup \
    && pnpm install -g @anthropic-ai/claude-code

RUN pnpm install -g playwright \
    && npx playwright install --with-deps chromium

RUN mkdir -p /var/run/sshd \
    && echo "PermitRootLogin prohibit-password" >> /etc/ssh/sshd_config \
    && echo "PubkeyAuthentication yes" >> /etc/ssh/sshd_config \
    && echo "PasswordAuthentication yes" >> /etc/ssh/sshd_config

WORKDIR /workspace

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
