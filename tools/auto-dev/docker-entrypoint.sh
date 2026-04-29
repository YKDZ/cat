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
DIST="/opt/auto-dev/dist/cli.js"
GIT_WORKSPACE_ROOT="/opt/repo"

# Obtain GitHub token via GitHub App (required: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID)
GITHUB_TOKEN="$(node /opt/auto-dev/dist/scripts/get-installation-token.js)"
if [ -z "${GITHUB_TOKEN}" ]; then
  echo "[auto-dev] ERROR: Failed to obtain GitHub App installation token. Ensure GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_APP_INSTALLATION_ID are set."
  exit 1
fi
echo "[auto-dev] GitHub App token obtained."
export GITHUB_TOKEN
export GH_TOKEN="${GITHUB_TOKEN}"

# Clone / update the repo
if ! git -C "${GIT_WORKSPACE_ROOT}" rev-parse --git-dir > /dev/null 2>&1; then
  echo "[auto-dev] Initialising git repo at ${GIT_WORKSPACE_ROOT}..."
  git -C "${GIT_WORKSPACE_ROOT}" init
  git -C "${GIT_WORKSPACE_ROOT}" remote add origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO_FULL_NAME}.git"
  git -C "${GIT_WORKSPACE_ROOT}" fetch origin main --depth=1
  git -C "${GIT_WORKSPACE_ROOT}" checkout -B main origin/main
else
  echo "[auto-dev] Updating existing clone at ${GIT_WORKSPACE_ROOT}..."
  git -C "${GIT_WORKSPACE_ROOT}" remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO_FULL_NAME}.git"
  git -C "${GIT_WORKSPACE_ROOT}" fetch origin main --depth=1
  echo "[auto-dev] Force-resetting local main to origin/main..."
  git -C "${GIT_WORKSPACE_ROOT}" checkout -B main origin/main
fi
git -C "${GIT_WORKSPACE_ROOT}" config user.email "auto-dev[bot]@users.noreply.github.com"
git -C "${GIT_WORKSPACE_ROOT}" config user.name "Auto-Dev Bot"
git -C "${GIT_WORKSPACE_ROOT}" remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO_FULL_NAME}.git"
export MOON_WORKSPACE_ROOT="${GIT_WORKSPACE_ROOT}"

echo "[auto-dev] Starting coordinator for $REPO_FULL_NAME..."
exec node "${DIST}" start --repo "$REPO_FULL_NAME"
