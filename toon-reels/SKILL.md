---
name: toon-reels
description: >
  인스타툰 슬라이드 이미지를 릴스(MP4) 영상으로 변환. ffmpeg 기반으로
  슬라이드 전환, BGM 합성, 4:5/9:16 비율을 지원한다.
allowed-tools:
  - Bash(bash ${CLAUDE_SKILL_DIR}/scripts/make-reels.sh *)
  - Bash(ffmpeg *)
  - Bash(ffprobe *)
  - Read
  - Glob
argument-hint: "<episode-dir> [--duration sec] [--bgm audio-file] [--ratio 4:5|9:16]"
---

# toon-reels

인스타툰 EP 이미지를 릴스 영상으로 변환하는 스킬.

## 사전 조건

- `ffmpeg` 설치 필요 (`brew install ffmpeg`)
- EP 이미지가 `output/EP{N}/EP{N}_S{NN}_{slug}.png` 형식으로 존재해야 함

## 인자

- `<episode-dir>` (필수): EP 이미지 폴더 경로 (예: `output/EP2`)
- `--duration <sec>` (선택): 슬라이드당 표시 시간 (기본: 3초)
- `--fade <sec>` (선택): 페이드 전환 시간 (기본: 0, 전환 없음)
- `--ratio <4:5|9:16>` (선택): 출력 비율 (기본: 4:5)
- `--bgm <audio-file>` (선택): 배경음악 파일 경로
- `--output <file>` (선택): 출력 파일 경로 (기본: `<episode-dir>/<EP>_reels_<ratio>.mp4`)

## 사용 예시

```bash
# 기본 (4:5, 3초/슬라이드, BGM 없음)
bash ${CLAUDE_SKILL_DIR}/scripts/make-reels.sh output/EP2

# BGM 포함
bash ${CLAUDE_SKILL_DIR}/scripts/make-reels.sh output/EP2 --bgm content/audio/EP2/bgm.mp3

# 릴스용 세로 비율 + 페이드 전환
bash ${CLAUDE_SKILL_DIR}/scripts/make-reels.sh output/EP2 --ratio 9:16 --fade 0.5

# 짧은 슬라이드 + 커스텀 출력
bash ${CLAUDE_SKILL_DIR}/scripts/make-reels.sh output/EP1 --duration 2 --output output/EP1/EP1_short.mp4
```

## BGM 준비

BGM은 사용자가 직접 준비해야 한다. 아래 사이트에서 검색 키워드로 적절한 음원을 찾아 다운로드:

| 사이트 | URL | 특징 |
|--------|-----|------|
| Pixabay Music | https://pixabay.com/music/ | 무료, 상업적 사용 가능 |
| Free Music Archive | https://freemusicarchive.org/ | CC 라이선스 |
| Chosic | https://www.chosic.com/free-music/lofi/ | Lo-fi/Ambient 특화 |
| Meta Sound Collection | https://www.facebook.com/sound/collection | 인스타 프로 계정 전용 |

다운로드한 음원은 `content/audio/EP{N}/bgm.mp3` 경로에 저장 권장.

## 출력

- `<episode-dir>/<EP>_reels_<ratio>.mp4`
- 해상도: 1080x1350 (4:5) 또는 1080x1920 (9:16)
- 코덱: H.264 (libx264), AAC 오디오

## 처리 방식

1. EP 폴더에서 `EP*_S*.png` 패턴의 이미지를 정렬 수집
2. 각 이미지를 목표 해상도로 변환 (블러 배경 + 중앙 원본 합성)
3. 페이드 전환 또는 단순 concat으로 합치기
4. BGM이 있으면 fade in/out 적용 후 합성
