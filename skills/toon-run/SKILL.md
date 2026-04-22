---
name: toon-run
description: >
  인스타툰 전체 파이프라인 통합 스킬. /toon-run로 실행하면
  콘텐츠 준비(toon-prep) -> 이미지 생성(toon-slide) -> 릴스 변환(toon-reels)까지
  전체 워크플로우를 순차 실행한다.
allowed-tools:
  - Skill(toon-prep)
  - Skill(toon-slide)
  - Skill(toon-reels)
  - Read
  - Glob
  - AskUserQuestion
argument-hint: "[--content-dir path] [--episode N] [--skip-prep] [--skip-reels]"
---

# toon-run

인스타툰 전체 파이프라인 통합 스킬.
`/toon-run`로 실행하면 콘텐츠 준비부터 릴스 변환까지 전체 워크플로우를 오케스트레이션한다.

## 인자

- `--content-dir path` (선택): 콘텐츠 문서 루트 디렉토리 (기본: `./content`)
- `--episode N` (선택): 특정 에피소드만 생성 (미지정 시 전체)
- `--skip-prep` (선택): toon-prep 단계 건너뛰기 (이미 콘텐츠가 준비된 경우)
- `--skip-reels` (선택): toon-reels 단계 건너뛰기
- `--model model-name` (선택): 이미지 모델 고정 지정 (`gemini-3.1-flash-image-preview`, `gemini-3-pro-image-preview`, `gpt-image-2`)

## 전체 워크플로우

```
Phase 1: toon-prep (콘텐츠 준비)
  1.1 인터뷰 -> interview-result.json
  1.2 문서 생성 -> content/ 문서 8종
  1.3 문서 검수 -> doc-inspector 통과
  1.4 레퍼런스 이미지 생성 -> content/visual/references/
  >>> 사용자 확인: 캐릭터/배경 ref 검토

Phase 2: toon-slide (이미지 생성) - EP별 반복
  2.1 story-writer -> 프롬프트 JSON
  2.2 슬라이드별 반복:
      A. 요소 정의
      B. ref 탐색 (reference-explorer)
      E. 에셋 생성 (필요시)
      C+D+F. pipeline-slide (검수 + 생성)
  >>> 사용자 확인: 생성된 이미지 검토

Phase 3: toon-reels (릴스 변환) - EP별 반복
  3.1 BGM 확인/안내
  3.2 make-reels.sh 실행
  >>> 사용자 확인: 릴스 영상 검토
```

## 실행 흐름

### Phase 1: 콘텐츠 준비

`--skip-prep`이 아니면 toon-prep 스킬을 호출한다.

```
Skill(toon-prep) --content-dir {content-dir}
```

**완료 조건:**
- `{content-dir}/interview-result.json` 존재
- `{content-dir}/visual/art-direction.md` 존재
- `{content-dir}/conti/EP*.md` 존재 (에피소드 수만큼)
- `{content-dir}/visual/references/character/full-body.png` 존재

**Phase 1 완료 후 사용자 확인:**
- 캐릭터 레퍼런스 이미지가 기획 의도와 일치하는지 확인 요청
- 사용자가 "OK" 또는 수정 지시를 할 때까지 대기

---

### Phase 2: 이미지 생성

에피소드별로 toon-slide 스킬을 호출한다.

**에피소드 순서 결정:**
- `--episode N` 지정 시: 해당 EP만
- 미지정 시: `{content-dir}/conti/EP*.md`를 Glob으로 탐색하여 전체 EP 순차 생성

```
Skill(toon-slide) --episode {N} --content-dir {content-dir} [--model {model}]
```

**EP 생성 완료 후 사용자 확인:**
- 생성된 슬라이드 이미지를 사용자에게 보여주고 피드백 요청
- 수정이 필요한 슬라이드가 있으면 해당 슬라이드만 재생성
- 사용자가 "OK"하면 다음 EP 또는 Phase 3으로 진행

---

### Phase 3: 릴스 변환

`--skip-reels`가 아니면 toon-reels 스킬을 호출한다.

**BGM 확인:**
- `{content-dir}/audio/EP{N}/bgm.mp3` 존재 여부 확인
- 없으면 사용자에게 BGM 준비 안내 (다운로드 사이트 제공)
- BGM 없이 진행할지 대기할지 AskUserQuestion으로 확인

```
Skill(toon-reels) output/EP{N} [--bgm {bgm_path}]
```

---

## 부분 실행

| 시나리오 | 사용 방법 |
|----------|-----------|
| 콘텐츠가 이미 있고 이미지만 생성 | `--skip-prep` |
| 특정 EP만 생성 | `--episode 3` |
| 이미지까지만, 릴스 불필요 | `--skip-reels` |
| 이미지 생성 후 릴스만 따로 | `/toon-reels output/EP1` |

## 사용 예시

```
# 전체 파이프라인 (처음부터 끝까지)
/toon-run

# 콘텐츠 준비 건너뛰고 EP1만 생성
/toon-run --skip-prep --episode 1

# 프로덕션 모델로 전체 생성 (릴스 제외)
/toon-run --model gemini-3-pro-image-preview --skip-reels
```
