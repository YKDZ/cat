#!/bin/sh
set -eu

capability=${CONTAINER_CAPABILITY:-prepare-and-start}
prepare=${PREPARE_DATABASE_COMMAND:-/app/prepare-database.mjs}

prepare_database() {
  node "$prepare"
}

case "$capability" in
  start-only)
    case "${1:-}" in
      start-only) exec node /app/dist/server/index.mjs ;;
      prepare-only|prepare-and-start)
        echo "Container capability 'start-only' does not support '${1}'." >&2
        exit 64
        ;;
      *) echo "Unsupported container command '${1:-}'. Expected start-only." >&2; exit 64 ;;
    esac
    ;;
  prepare-and-start)
    case "${1:-}" in
      prepare-only) prepare_database ;;
      prepare-and-start) prepare_database; exec node /app/dist/server/index.mjs ;;
      *) echo "Unsupported container command '${1:-}'. Expected prepare-only or prepare-and-start." >&2; exit 64 ;;
    esac
    ;;
  *) echo "Unsupported CONTAINER_CAPABILITY '$capability'." >&2; exit 64 ;;
esac
