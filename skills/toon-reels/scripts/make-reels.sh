#!/bin/bash
# make-reels.sh - EP 이미지를 인스타 릴스 영상으로 변환
#
# Usage:
#   make-reels.sh <episode-dir> [options]
#
# Options:
#   --duration <sec>    슬라이드당 표시 시간 (기본: 3)
#   --fade <sec>        페이드 전환 시간 (기본: 0)
#   --ratio <4:5|9:16>  출력 비율 (기본: 4:5)
#   --bgm <audio-file>  배경음악 파일 경로
#   --output <file>     출력 파일 경로 (기본: <episode-dir>/reels.mp4)
#
# Examples:
#   make-reels.sh output/EP2
#   make-reels.sh output/EP2 --duration 2.5 --bgm content/audio/EP2/bgm.mp3
#   make-reels.sh output/EP2 --ratio 9:16 --fade 0.8
#
# Prerequisites:
#   ffmpeg (brew install ffmpeg)

set -euo pipefail

# --- 인자 파싱 ---
EP_DIR="${1:?Usage: make-reels.sh <episode-dir> [options]}"
shift

DURATION=3
FADE=0
RATIO="4:5"
BGM=""
OUTPUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --duration) DURATION="$2"; shift 2 ;;
    --fade)     FADE="$2"; shift 2 ;;
    --ratio)    RATIO="$2"; shift 2 ;;
    --bgm)      BGM="$2"; shift 2 ;;
    --output)   OUTPUT="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# --- 해상도 설정 ---
if [[ "$RATIO" == "9:16" ]]; then
  WIDTH=1080
  HEIGHT=1920
elif [[ "$RATIO" == "4:5" ]]; then
  WIDTH=1080
  HEIGHT=1350
else
  echo "Unsupported ratio: $RATIO (use 4:5 or 9:16)"
  exit 1
fi

# --- 이미지 수집 ---
IMAGES=()
while IFS= read -r f; do
  IMAGES+=("$f")
done < <(find "$EP_DIR" -maxdepth 1 -name "EP*_S*.png" ! -name "*_v*" ! -name "*_orig*" ! -name "*_prev*" ! -name "*_fix*" | sort)

NUM=${#IMAGES[@]}
if [[ $NUM -eq 0 ]]; then
  echo "No images found in $EP_DIR"
  exit 1
fi

echo "[reels] $NUM slides, ${DURATION}s each, fade ${FADE}s, ratio ${RATIO} (${WIDTH}x${HEIGHT})"

# --- 출력 경로 ---
if [[ -z "$OUTPUT" ]]; then
  EP_NAME=$(basename "$EP_DIR")
  OUTPUT="${EP_DIR}/${EP_NAME}_reels_${RATIO//:/x}.mp4"
fi

# --- 임시 디렉토리 ---
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

# --- 각 슬라이드를 영상 클립으로 변환 ---
echo "[reels] Generating slide clips..."

for i in "${!IMAGES[@]}"; do
  IMG="${IMAGES[$i]}"
  CLIP="${TMP_DIR}/slide_$(printf '%02d' $i).mp4"

  # 블러 배경 + 중앙 원본 합성으로 레터박스 대신 보기 좋게
  ffmpeg -y -loop 1 -i "$IMG" -t "$DURATION" \
    -filter_complex "
      [0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},boxblur=20:5[bg];
      [0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black@0[fg];
      [bg][fg]overlay=0:0,format=yuv420p
    " \
    -c:v libx264 -preset fast -crf 18 -r 30 \
    "$CLIP" 2>/dev/null

  echo "  [$((i+1))/$NUM] $(basename "$IMG")"
done

# --- 클립 목록 + 페이드 전환으로 합치기 ---
echo "[reels] Applying fade transitions..."

INPUTS=""
for i in "${!IMAGES[@]}"; do
  INPUTS="$INPUTS -i ${TMP_DIR}/slide_$(printf '%02d' $i).mp4"
done

if [[ $NUM -eq 1 ]]; then
  cp "${TMP_DIR}/slide_00.mp4" "${TMP_DIR}/merged.mp4"
elif [[ $(echo "$FADE == 0" | bc) -eq 1 ]]; then
  # 페이드 없이 단순 concat
  CONCAT_LIST="${TMP_DIR}/concat.txt"
  for i in "${!IMAGES[@]}"; do
    echo "file 'slide_$(printf '%02d' $i).mp4'" >> "$CONCAT_LIST"
  done
  ffmpeg -y -f concat -safe 0 -i "$CONCAT_LIST" -c copy "${TMP_DIR}/merged.mp4" 2>/dev/null
else
  # xfade 체인 생성
  OFFSET=$(echo "$DURATION - $FADE" | bc)
  FILTER_CHAIN=""
  CURRENT_OFFSET="$OFFSET"

  for ((i=1; i<NUM; i++)); do
    if [[ $i -eq 1 ]]; then
      IN_A="[0:v]"
      IN_B="[1:v]"
    else
      IN_A="[xf$((i-1))]"
      IN_B="[$i:v]"
    fi

    if [[ $i -eq $((NUM-1)) ]]; then
      OUT="[outv]"
    else
      OUT="[xf$i]"
    fi

    FILTER_CHAIN="${FILTER_CHAIN}${IN_A}${IN_B}xfade=transition=fade:duration=${FADE}:offset=${CURRENT_OFFSET}${OUT};"
    CURRENT_OFFSET=$(echo "$CURRENT_OFFSET + $DURATION - $FADE" | bc)
  done

  FILTER_CHAIN="${FILTER_CHAIN%;}"

  ffmpeg -y $INPUTS \
    -filter_complex "$FILTER_CHAIN" \
    -map "[outv]" \
    -c:v libx264 -preset fast -crf 18 -r 30 \
    "${TMP_DIR}/merged.mp4" 2>/dev/null
fi

# --- BGM 합성 ---
if [[ -n "$BGM" && -f "$BGM" ]]; then
  echo "[reels] Adding BGM: $(basename "$BGM")"
  VIDEO_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${TMP_DIR}/merged.mp4")

  ffmpeg -y -i "${TMP_DIR}/merged.mp4" -i "$BGM" \
    -filter_complex "[1:a]afade=t=in:st=0:d=1,afade=t=out:st=$(echo "$VIDEO_DUR - 2" | bc):d=2,atrim=0:${VIDEO_DUR}[a]" \
    -map 0:v -map "[a]" \
    -c:v copy -c:a aac -b:a 192k -shortest \
    "$OUTPUT" 2>/dev/null
else
  cp "${TMP_DIR}/merged.mp4" "$OUTPUT"
fi

# --- 결과 ---
FILE_SIZE=$(du -h "$OUTPUT" | cut -f1)
VIDEO_DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUTPUT" | xargs printf '%.1f')

echo ""
echo "--- Done ---"
echo "Output: $OUTPUT"
echo "Duration: ${VIDEO_DUR}s"
echo "Size: $FILE_SIZE"
echo "Resolution: ${WIDTH}x${HEIGHT}"
