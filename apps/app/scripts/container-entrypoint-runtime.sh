#!/bin/sh
set -eu

case "${1:-}" in
  start-only) exec node /usr/local/bin/container-runner.mjs node /app/dist/server/index.mjs ;;
  prepare-only|bootstrap-only|prepare-and-start)
    echo "Container capability 'start-only' does not support '${1}'." >&2
    exit 64
    ;;
  *) echo "Unsupported container command '${1:-}'. Expected start-only." >&2; exit 64 ;;
esac
