#!/usr/bin/env bash
# test-decision-round-trip.sh
#
# End-to-end test for the auto-dev decision waiting system.
#
# Proves that:
#   1. The agent blocks on `auto-dev request-decision` calls
#   2. The coordinator receives and queues each decision
#   3. `resolve-decision` unblocks the waiting agent
#   4. The agent successfully colletes 5 decisions across 2 rounds
#   5. The final document is created in the feature branch
#
# Usage:
#   bash tools/auto-dev/scripts/test-decision-round-trip.sh
#
# Requires: gh CLI authenticated, Docker running auto-dev-auto-dev-1

set -euo pipefail

CONTAINER="auto-dev-auto-dev-1"
REPO="YKDZ/cat"
FIXTURE="$(dirname "$0")/../test-fixtures/decision-round-trip-issue.md"

# Choices mapped by decision title keyword → choice key.
# The coordinator socket poller may resolve some decisions before the script's
# polling loop sees them (if the script starts after the agent already sent the
# request).  Using a title-keyed associative array avoids index drift.
declare -A TITLE_CHOICES
TITLE_CHOICES["Document title style"]="formal"
TITLE_CHOICES["Target audience"]="both"
TITLE_CHOICES["timestamp"]="yes"
TITLE_CHOICES["recommendation vs"]="yes"
TITLE_CHOICES["ordered in the document"]="round"
TOTAL=${#CHOICES[@]}

# ─── helpers ─────────────────────────────────────────────────────────────────

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
err()  { echo "[$(date '+%H:%M:%S')] ERROR: $*" >&2; }

# Run the auto-dev CLI inside the container
cli() {
  docker exec "$CONTAINER" node /workspace/tools/auto-dev/dist/cli.js "$@"
}

# List IDs of pending (unresolved) decisions from inside the container
pending_decisions() {
  docker exec "$CONTAINER" sh -c \
    'for f in /workspace/tools/auto-dev/state/decisions/*.json; do
       [ -f "$f" ] || continue
       node -e "
         const d=JSON.parse(require(\"fs\").readFileSync(\"$f\",\"utf8\"));
         if(d.status===\"pending\") process.stdout.write(d.id+\"\\n\");
       " 2>/dev/null
     done' 2>/dev/null || true
}

# Wait for a new pending decision to appear; echos the decision ID
wait_for_decision() {
  local max_wait="${1:-300}"
  local deadline=$(( SECONDS + max_wait ))
  local seen="${2:-}"   # already-seen IDs (colon-separated), skip them
  while [[ $SECONDS -lt $deadline ]]; do
    while IFS= read -r id; do
      [[ -z "$id" ]] && continue
      if [[ ":${seen}:" != *":${id}:"* ]]; then
        echo "$id"
        return 0
      fi
    done < <(pending_decisions)
    sleep 2
  done
  return 1
}

# ─── main ────────────────────────────────────────────────────────────────────

echo "╔═══════════════════════════════════════════════════╗"
echo "║  Auto-Dev Decision Round-Trip Test                ║"
echo "║  Decisions: 2 (round 1) + 3 (round 2) = 5 total  ║"
echo "╚═══════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Create the test issue ────────────────────────────────────────────
log "[1/5] Creating test issue..."
ISSUE_URL=$(gh issue create \
  --repo "$REPO" \
  --title "[auto-dev test] Decision round-trip — create decision log" \
  --label "auto-dev:ready" \
  --body-file "$FIXTURE")
ISSUE_NUM=$(echo "$ISSUE_URL" | grep -oP '\d+$')
log "      Issue #${ISSUE_NUM}: ${ISSUE_URL}"

# ── Step 2: Wait for coordinator to claim ────────────────────────────────────
log "[2/5] Waiting for coordinator to claim issue #${ISSUE_NUM} (up to 120 s)..."
CLAIM_DEADLINE=$(( SECONDS + 120 ))
while [[ $SECONDS -lt $CLAIM_DEADLINE ]]; do
  LABELS=$(gh issue view "$ISSUE_NUM" --repo "$REPO" --json labels \
    --jq '.labels[].name' 2>/dev/null || true)
  if echo "$LABELS" | grep -q "auto-dev:claimed"; then
    log "      Claimed ✓"
    break
  fi
  echo -n "."
  sleep 5
done
echo ""

RUN_ID=$(gh issue view "$ISSUE_NUM" --repo "$REPO" --json comments \
  --jq '.comments[].body
        | select(startswith("🤖 **Auto-Dev** claimed"))
        | match("Run ID: `([^`]+)`").captures[0].string' \
  2>/dev/null | head -1 || true)
log "      Run ID: ${RUN_ID}"

# ── Step 3: Resolve all 5 decisions as they arrive ───────────────────────────
log "[3/5] Resolving decisions (${TOTAL} total across 2 rounds)..."
echo "      Round 1 expects 2 decisions; Round 2 expects 3."
echo ""

# Pre-populate SEEN with decisions already resolved by the socket poller so
# the script doesn't re-process them with the wrong choice.
while IFS= read -r id; do
  [[ -z "$id" ]] && continue
  SEEN="${SEEN}:${id}"
  log "      (already resolved: ${id})"
done < <(docker exec "$CONTAINER" sh -c \
  'for f in /workspace/tools/auto-dev/state/decisions/*.json; do
     [ -f "$f" ] || continue
     node -e "const d=JSON.parse(require(\"fs\").readFileSync(\"$f\",\"utf8\"));if(d.status===\"resolved\")process.stdout.write(d.id+\"\n\");" 2>/dev/null
   done' 2>/dev/null)

for (( i=0; i<TOTAL; i++ )); do
  ROUND=$(( i < 2 ? 1 : 2 ))
  ROUND_IDX=$(( i < 2 ? i+1 : i-1 ))

  log "      Waiting for decision $((i+1))/${TOTAL} (round ${ROUND}, #${ROUND_IDX})..."
  DEC_ID=$(wait_for_decision 300 "$SEEN") || {
    err "Timed out waiting for decision $((i+1)). Test FAILED."
    exit 1
  }
  SEEN="${SEEN}:${DEC_ID}"

  # Determine choice by matching decision title keywords
  TITLE=$(docker exec "$CONTAINER" sh -c \
    "node -e \"const d=JSON.parse(require('fs').readFileSync(
      '/workspace/tools/auto-dev/state/decisions/${DEC_ID}.json','utf8'));
      process.stdout.write(d.title);\" 2>/dev/null" || echo "")

  CHOICE=""
  for keyword in "${!TITLE_CHOICES[@]}"; do
    if [[ "$TITLE" == *"$keyword"* ]]; then
      CHOICE="${TITLE_CHOICES[$keyword]}"
      break
    fi
  done

  if [[ -z "$CHOICE" ]]; then
    err "No choice mapping found for title: '${TITLE}'. Defaulting to first option."
    CHOICE="yes"
  fi

  log "      → Decision: \"${TITLE}\""
  log "      → Resolving with choice: '${CHOICE}'"

  cli resolve-decision "$DEC_ID" --choice "$CHOICE" > /dev/null
  log "      → Resolved ✓"
  echo ""
done

# ── Step 4: Wait for workflow completion ─────────────────────────────────────
log "[4/5] Waiting for workflow to complete (up to 600 s)..."
DONE_DEADLINE=$(( SECONDS + 600 ))
FINAL_STATUS=""
while [[ $SECONDS -lt $DONE_DEADLINE ]]; do
  FINAL_STATUS=$(docker exec "$CONTAINER" sh -c \
    "for f in /workspace/tools/auto-dev/state/runs/*.json; do
       [ -f \"\$f\" ] || continue
       node -e \"
         const r=JSON.parse(require('fs').readFileSync('\$f','utf8'));
         if(r.issueNumber===${ISSUE_NUM}) process.stdout.write(r.status+'\\n');
       \" 2>/dev/null
     done" 2>/dev/null | tail -1 || true)
  if [[ "$FINAL_STATUS" == "completed" || "$FINAL_STATUS" == "failed" ]]; then
    log "      Workflow finished: ${FINAL_STATUS}"
    break
  fi
  echo -n "."
  sleep 10
done
echo ""

if [[ "$FINAL_STATUS" != "completed" ]]; then
  err "Workflow did not complete successfully (status=${FINAL_STATUS:-timeout}). Test FAILED."
  exit 1
fi

# ── Step 5: Verify the document ──────────────────────────────────────────────
log "[5/5] Verifying output document..."
git fetch origin "auto-dev/issue-${ISSUE_NUM}" --quiet 2>/dev/null || true
DOC=$(git show "origin/auto-dev/issue-${ISSUE_NUM}:tools/auto-dev/docs/test-decision-log.md" 2>/dev/null || true)

if [[ -z "$DOC" ]]; then
  err "Document not found in branch 'auto-dev/issue-${ISSUE_NUM}'. Test FAILED."
  exit 1
fi
log "      Document found ✓"

# Sanity-check: document must mention all 5 chosen values
ALL_PASS=true
for kw in "formal" "both" "yes" "round" "Summary"; do
  if echo "$DOC" | grep -qi "$kw"; then
    log "      Contains '${kw}' ✓"
  else
    err "Document missing expected keyword '${kw}'"
    ALL_PASS=false
  fi
done

echo ""
echo "════════════════════════════════════════════"
echo "  Generated document preview"
echo "════════════════════════════════════════════"
echo "$DOC"
echo "════════════════════════════════════════════"
echo ""

if [[ "$ALL_PASS" == "true" ]]; then
  echo "✅  Test PASSED — decision waiting system works correctly."
  echo "    Issue #${ISSUE_NUM} | Run ${RUN_ID}"
else
  echo "❌  Test FAILED — document is missing expected content."
  exit 1
fi
