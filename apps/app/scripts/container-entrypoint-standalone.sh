#!/bin/sh
set -eu

prepare_database() {
  node /usr/local/bin/container-runner.mjs node /app/.preparation/prepare-database.mjs
}

bootstrap_deployment() {
  node /usr/local/bin/container-runner.mjs node /app/dist/bootstrap-only/bootstrap-only-cli.js
}

case "${1:-}" in
  prepare-only) prepare_database ;;
  bootstrap-only) bootstrap_deployment ;;
  prepare-and-start)
    prepare_database
    exec node /usr/local/bin/container-runner.mjs node /app/dist/server/index.mjs
    ;;
  *)
    echo "Unsupported container command '${1:-}'. Expected prepare-only, bootstrap-only, or prepare-and-start." >&2
    exit 64
    ;;
esac
