#!/usr/bin/env bash
# GitHub runner only. No Discord or application credentials are read here.
set -euo pipefail
python3 -m venv "$RUNNER_TEMP/video-python"
"$RUNNER_TEMP/video-python/bin/pip" -q install Pillow==12.0.0
if ! command -v ffmpeg >/dev/null; then
  sudo apt-get update -qq
  sudo apt-get install -y ffmpeg
fi
curl -fsSL --retry 3 https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf -o "$RUNNER_TEMP/race-font.otf"
{
  echo "VIDEO_PYTHON=$RUNNER_TEMP/video-python/bin/python"
  echo "RACE_VIDEO_FONT=$RUNNER_TEMP/race-font.otf"
  echo "RACE_VIDEO_CHECK_OUTPUT=$RUNNER_TEMP/keso-race-check.mp4"
} >> "$GITHUB_ENV"
