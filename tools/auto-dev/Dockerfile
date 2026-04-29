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
    && pnpm setup

RUN npm install -g @anthropic-ai/claude-code \
    && node "$(npm root -g)/@anthropic-ai/claude-code/install.cjs"

RUN mkdir -p /var/run/sshd \
    && echo "PermitRootLogin yes" >> /etc/ssh/sshd_config \
    && echo "PubkeyAuthentication yes" >> /etc/ssh/sshd_config \
    && echo "PasswordAuthentication yes" >> /etc/ssh/sshd_config

WORKDIR /build

# Copy workspace files needed for building
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json tsconfig.json tsconfig.node.json ./
COPY tools/auto-dev/ tools/auto-dev/

# Install dependencies and build the coordinator
RUN pnpm install --frozen-lockfile --filter @tools/auto-dev 2>&1 | tail -10 \
    && cd tools/auto-dev \
    && npx vite build 2>&1 \
    && echo "Build complete"

# Install prod deps with plain npm (avoids pnpm workspace complexity)
RUN mkdir -p /opt/auto-dev \
    && cp -r /build/tools/auto-dev/dist /opt/auto-dev/dist \
    && cp /build/tools/auto-dev/package.json /opt/auto-dev/package.json \
    && cd /opt/auto-dev && npm install --omit=dev --no-package-lock 2>&1 | tail -5

WORKDIR /workspace

COPY tools/auto-dev/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && printf '#!/bin/bash\nexec node /opt/auto-dev/dist/cli.js "$@"\n' > /usr/local/bin/auto-dev \
    && chmod +x /usr/local/bin/auto-dev

ENTRYPOINT ["docker-entrypoint.sh"]
