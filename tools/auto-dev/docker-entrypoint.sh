#!/usr/bin/env bash
set -euo pipefail

echo "[auto-dev] Starting container..."

if [ -f /workspace/pnpm-lock.yaml ]; then
  echo "[auto-dev] Installing dependencies..."
  cd /workspace && pnpm install --frozen-lockfile
fi

echo "[auto-dev] Building auto-dev..."
cd /workspace && pnpm moon run auto-dev:build

echo "[auto-dev] Configuring SSH..."
node -e "
  const { generateSSHConfig } = require('/workspace/tools/auto-dev/dist/ssh/ssh-config.js');
  generateSSHConfig();
" 2>/dev/null || echo "[auto-dev] SSH config generation skipped (dist not found)"

echo "[auto-dev] Starting SSH daemon..."
mkdir -p /var/run/sshd
/usr/sbin/sshd -D -e &
SSHD_PID=$!

REPO_FULL_NAME="${GITHUB_REPOSITORY:-owner/repo}"

echo "[auto-dev] Starting coordinator for $REPO_FULL_NAME..."
exec node /workspace/tools/auto-dev/dist/cli.js start --repo "$REPO_FULL_NAME"
