#!/usr/bin/env bash
# Run E2E suite in batches, restarting the API container between batches.
# The API container has a memory leak under sustained load (dies ~15min in).
# Batching + restart works around it while we investigate the root cause.
set -u
cd "$(dirname "$0")/.."

BATCH_SIZE=${BATCH_SIZE:-10}
LOG=/tmp/e2e-batches.log
: > "$LOG"

SUITES=()
while IFS= read -r f; do SUITES+=("$f"); done < <(ls tests/e2e/*.test.ts | sort)
TOTAL=${#SUITES[@]}
NUM_BATCHES=$(( (TOTAL + BATCH_SIZE - 1) / BATCH_SIZE ))

echo "=== Running $TOTAL suites in $NUM_BATCHES batches of $BATCH_SIZE ===" | tee -a "$LOG"

TOTAL_PASS=0
TOTAL_FAIL=0
TOTAL_SKIP=0
FAILED_SUITES=()

for ((b=0; b<NUM_BATCHES; b++)); do
  start=$((b * BATCH_SIZE))
  group=("${SUITES[@]:start:BATCH_SIZE}")
  echo "" | tee -a "$LOG"
  echo "=== BATCH $((b+1))/$NUM_BATCHES (${#group[@]} suites) ===" | tee -a "$LOG"

  # Restart API + wait healthy
  docker compose -f docker-compose.yml -f docker-compose.test.yml restart api >/dev/null 2>&1
  node scripts/wait-for-health.js >/dev/null 2>&1 || {
    echo "!!! API não ficou healthy após restart, abortando batch" | tee -a "$LOG"
    continue
  }

  # Run the batch
  out=$(npx jest --config jest.config.e2e.js "${group[@]}" 2>&1)
  echo "$out" | tail -6 | tee -a "$LOG"

  # Extract counts from the "Tests: X failed, Y skipped, Z passed, W total" line
  summary=$(echo "$out" | grep -E "^Tests:" | tail -1)
  pass=$(echo "$summary" | grep -oE '[0-9]+ passed' | head -1 | awk '{print $1}')
  fail=$(echo "$summary" | grep -oE '[0-9]+ failed' | head -1 | awk '{print $1}')
  skip=$(echo "$summary" | grep -oE '[0-9]+ skipped' | head -1 | awk '{print $1}')
  TOTAL_PASS=$((TOTAL_PASS + ${pass:-0}))
  TOTAL_FAIL=$((TOTAL_FAIL + ${fail:-0}))
  TOTAL_SKIP=$((TOTAL_SKIP + ${skip:-0}))

  # Capture failed suite names for later investigation
  while IFS= read -r line; do
    FAILED_SUITES+=("$line")
  done < <(echo "$out" | grep -E "^FAIL " | sed 's/^FAIL //; s/ .*$//')
done

echo "" | tee -a "$LOG"
echo "=== FINAL ===" | tee -a "$LOG"
echo "Tests: $TOTAL_PASS passed, $TOTAL_FAIL failed, $TOTAL_SKIP skipped" | tee -a "$LOG"
if [ ${#FAILED_SUITES[@]} -gt 0 ]; then
  echo "Failed suites (${#FAILED_SUITES[@]}):" | tee -a "$LOG"
  printf '  - %s\n' "${FAILED_SUITES[@]}" | tee -a "$LOG"
fi
