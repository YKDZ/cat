#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Usage: %s <label> <command> [args...]\n' "$0" >&2
}

if [[ $# -lt 2 ]]; then
  usage
  exit 2
fi

label="$1"
shift

: "${MOON_OUTPUT_STYLE:=buffer-only-failure}"
export MOON_OUTPUT_STYLE

log="$(mktemp -t moon-qa.XXXXXX.log)"
cleanup() {
  rm -f "$log"
}
trap cleanup EXIT

if "$@" >"$log" 2>&1; then
  printf '✅ %s\n' "$label"
else
  status=$?
  cat "$log"
  exit "$status"
fi
