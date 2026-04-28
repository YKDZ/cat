#!/usr/bin/env bash
set -euo pipefail

echo "[auto-dev] Starting container..."

# Configure SSH password if provided
if [ -n "${SSH_PASSWORD:-}" ]; then
  echo "root:${SSH_PASSWORD}" | chpasswd
  echo "[auto-dev] SSH password set."
fi

# Configure SSH public key if provided
if [ -n "${SSH_PUBLIC_KEY:-}" ]; then
  mkdir -p /root/.ssh
  echo "${SSH_PUBLIC_KEY}" >> /root/.ssh/authorized_keys
  chmod 700 /root/.ssh
  chmod 600 /root/.ssh/authorized_keys
  echo "[auto-dev] SSH public key installed."
fi

echo "[auto-dev] Starting SSH daemon..."
mkdir -p /var/run/sshd
/usr/sbin/sshd -D -e &

REPO_FULL_NAME="${GITHUB_REPOSITORY:-owner/repo}"
DIST="/workspace/tools/auto-dev/dist/cli.js"

echo "[auto-dev] Waiting for dist to be available at ${DIST}..."
until [ -f "${DIST}" ]; do sleep 1; done

echo "[auto-dev] Starting coordinator for $REPO_FULL_NAME..."
exec node "${DIST}" start --repo "$REPO_FULL_NAME"
