#!/bin/bash
# Run the full audio pipeline for all 40 reciters.
# Output is logged to tmp/pipeline.log
# Usage: ./scripts/run-pipeline.sh

set -e

cd "$(dirname "$0")/.."

LOG_FILE="tmp/pipeline.log"
mkdir -p tmp

echo "Starting pipeline at $(date)" | tee "$LOG_FILE"
echo "Log file: $(pwd)/$LOG_FILE"

if bun run scripts/prepare-audio.ts >> "$LOG_FILE" 2>&1; then
  echo "" >> "$LOG_FILE"
  echo "Pipeline finished successfully at $(date)" >> "$LOG_FILE"
  echo "Pipeline finished successfully at $(date)"
else
  EXIT_CODE=$?
  echo "" >> "$LOG_FILE"
  echo "Pipeline FAILED at $(date) (exit code $EXIT_CODE)" >> "$LOG_FILE"
  echo "Pipeline FAILED at $(date) (exit code $EXIT_CODE)"
  exit $EXIT_CODE
fi
