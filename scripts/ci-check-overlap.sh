#!/usr/bin/env bash
# Both tasks run on the same existing runner. Video preparation is network/I/O
# bound and only writes runner-temp files and its own GITHUB_ENV entries.
# Preserve every npm check, the original five-minute preparation cap, and fail
# closed on either exit code. The actual render stays in its original later step.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
start=$SECONDS
# Keep video variables out of all earlier test steps, including the mocked encoder.
video_env="${RUNNER_TEMP:?}/keso-video-prepare.env"
: > "$video_env"
GITHUB_ENV="$video_env" timeout --kill-after=10s 300s bash scripts/race-video/prepare.sh &
prep_pid=$!
trap 'kill "$prep_pid" 2>/dev/null || true' EXIT
if (cd services/valorant-results && npm run check); then check_status=0; else check_status=$?; fi
if wait "$prep_pid"; then prep_status=0; else prep_status=$?; fi
trap - EXIT
printf 'CI_CHECK_OVERLAP check=%s prep=%s wall_seconds=%s\n' "$check_status" "$prep_status" "$((SECONDS-start))"
test "$check_status" -eq 0
test "$prep_status" -eq 0
