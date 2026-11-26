#!/usr/bin/env bash
# GitHub runner only. No Discord or application credentials are read here.
set -euo pipefail
ms(){ python3 -c 'import time;print(time.monotonic_ns()//1000000)'; }
begin=$(ms)
pip_preinstalled=0
if test -x "$RUNNER_TEMP/video-python/bin/pip" && "$RUNNER_TEMP/video-python/bin/pip" show Pillow >/dev/null 2>&1; then pip_preinstalled=1; fi
pip_cache_dir="${PIP_CACHE_DIR:-$HOME/.cache/pip}"
pip_cache_before=0
if test -d "$pip_cache_dir"; then pip_cache_before=$(du -sk "$pip_cache_dir" 2>/dev/null | awk '{print $1}'); fi
python3 -m venv "$RUNNER_TEMP/video-python"
venv_ms=$(ms)
"$RUNNER_TEMP/video-python/bin/pip" -q install Pillow==12.0.0
pip_ms=$(ms)
if ! command -v ffmpeg >/dev/null; then
  sudo apt-get update -qq
  sudo apt-get install -y ffmpeg
fi
ffmpeg_ms=$(ms)
font_preexisting=0
if test -s "$RUNNER_TEMP/race-font.otf"; then font_preexisting=1; fi
font_http=$(curl -fsSL --connect-timeout 15 --max-time 120 --retry 3 --retry-max-time 180 -w '%{http_code}' https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf -o "$RUNNER_TEMP/race-font.otf")
font_ms=$(ms)
pip_cache_after=0
if test -d "$pip_cache_dir"; then pip_cache_after=$(du -sk "$pip_cache_dir" 2>/dev/null | awk '{print $1}'); fi
font_bytes=$(wc -c < "$RUNNER_TEMP/race-font.otf")
printf 'CI_VIDEO_PREP_PHASE venv_ms=%s pip_ms=%s ffmpeg_ms=%s font_ms=%s total_ms=%s pip_preinstalled=%s pip_cache_before_kib=%s pip_cache_after_kib=%s font_preexisting=%s font_http=%s font_bytes=%s font_cache_hit=0\n' \
 "$((venv_ms-begin))" "$((pip_ms-venv_ms))" "$((ffmpeg_ms-pip_ms))" "$((font_ms-ffmpeg_ms))" "$((font_ms-begin))" \
 "$pip_preinstalled" "$pip_cache_before" "$pip_cache_after" "$font_preexisting" "$font_http" "$font_bytes"
# This path always calls curl with no conditional cache, so font_cache_hit=0.
# pip's HTTP wheel cache-hit ratio is not exposed by pip's public CLI; print its
# cache size and preinstalled package state without claiming an exact hit ratio.
{
  echo "VIDEO_PYTHON=$RUNNER_TEMP/video-python/bin/python"
  echo "RACE_VIDEO_FONT=$RUNNER_TEMP/race-font.otf"
  echo "RACE_VIDEO_CHECK_OUTPUT=$RUNNER_TEMP/keso-race-check.mp4"
} >> "$GITHUB_ENV"
