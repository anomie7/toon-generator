---
name: toon-slide
description: >
  인스타툰 이미지 생성 파이프라인. 콘텐츠 문서(콘티/에피소드 설계/아트 디렉션)를
  입력받아 story-writer -> ref 탐색 -> pipeline-slide(검수+생성)까지 전체 워크플로우를 실행한다.
allowed-tools:
  - Agent(story-writer)
  - Agent(reference-explorer)
  - Bash(node --import tsx ${CLAUDE_SKILL_DIR}/scripts/*)
  - Read
  - Write
  - Glob
argument-hint: "--episode N [--slide N] [--content-dir path] [--model model-name]"
---

# toon-slide

인스타툰 이미지 생성 파이프라인 스킬.
콘텐츠 문서를 입력받아 프롬프트 JSON 생성 -> ref 탐색 -> 검수+이미지 생성까지 전체 워크플로우를 오케스트레이션한다.

## 인자

- `--episode N` (필수): 생성할 에피소드 번호
- `--slide N` (선택): 특정 슬라이드만 생성 (미지정 시 전체)
- `--content-dir path` (선택): 콘텐츠 문서 루트 디렉토리 (기본: `./content`)
- `--model model-name` (선택): Gemini 모델을 고정 지정. 미지정 시 슬라이드별 자동 선택

## 모델 자동 선택 전략

`--model` 미지정 시, 각 슬라이드의 `textOverlay` 유무에 따라 모델이 자동 선택된다:

| 조건 | 선택 모델 | 이유 |
|------|----------|------|
| `textOverlay` 또는 `episodeTitle` 있음 | `gemini-3-pro-image-preview` (Pro) | 한글 텍스트 렌더링 정확도 우수 |
| `textOverlay` 없음 | `gemini-3.1-flash-image-preview` (Flash) | 빠르고 저렴 |
| E단계 에셋 생성 | Flash 권장 | 참고용 에셋, 텍스트 불필요 |

## 사전 조건

- `GEMINI_API_KEY` 환경변수 설정
- `{content-dir}/` 아래에 콘텐츠 문서가 존재해야 함
- 프로젝트 루트에 `zod`, `@google/genai` 패키지가 설치된 상태 (`npm install`)
- 사전 조건이 충족되지 않으면 스킬 실행 전에 사용자에게 안내하고, 필요한 패키지를 설치할지 확인한다

## 필요한 콘텐츠 문서

| 파일 | 용도 | 필수 |
|------|------|------|
| `{content-dir}/conti/EP{N}.md` | 슬라이드별 화면/텍스트/연출 | 필수 |
| `{content-dir}/episode-design/EP{N}.md` | 에피소드 감정/구조/장면 설계 | 필수 |
| `{content-dir}/visual/art-direction.md` | 아트 디렉션 (스타일/색감/금지 요소) | 필수 |
| `{content-dir}/visual/character-sheet-detailed.md` | 상세 캐릭터 시트 (외형/감정 표현) | 필수 |
| `{content-dir}/visual/references/` | 레퍼런스 이미지 디렉토리 | 권장 |

## 출력 구조

```
output/
  prompts/EP{N}_prompts.json    # 1단계 출력
  assets/EP{N}/                 # E단계 에셋 (필요시)
  EP{N}/                        # 최종 이미지
    EP{N}_S{NN}_{slug}.png
    EP{N}_S{NN}_{slug}.meta.json
    variables/                  # 개선 루프 변형본
```

---

## 워크플로우

### 1단계: story-writer -> 프롬프트 JSON 생성

story-writer 에이전트를 호출하여 프롬프트 JSON을 생성한다.

**호출:**
```
Agent(story-writer): "EP{N} 이미지 프롬프트를 생성해줘. content-dir: {content-dir}"
```

**확인사항:**
- 출력 파일: `output/prompts/EP{N}_prompts.json`
- `episodeTitle` 필드는 슬라이드 1(커버)에만 포함
- `toneReference` 필드가 존재하고 실제 파일을 가리키는지 확인
- 조연 등장 EP이면 `supportingCharacterPrefix`와 `hasSupportingCharacter` 확인

---

### 2단계: 슬라이드별 반복 (A -> B -> pipeline-slide)

각 슬라이드에 대해 아래를 순서대로 실행한다.

#### A. 요소 정의 (오케스트레이터)

프롬프트 JSON과 콘티를 읽고, 해당 슬라이드에 필요한 요소를 정의한다.

**읽을 파일:**
- `output/prompts/EP{N}_prompts.json` - 해당 슬라이드의 prompt, colorMood
- `{content-dir}/conti/EP{N}.md` - 해당 슬라이드의 연출 포인트

**정의 항목:**
- **배경**: 공간, 시간대, 분위기
- **인물(포즈/표정)**: 주인공의 자세, 시선, 감정 표현
- **사물(소품/UI)**: 장면에 등장하는 오브젝트

#### B. ref 탐색 (reference-explorer 에이전트)

A에서 정의한 요소를 reference-explorer 에이전트에 전달한다.

**호출:**
```
Agent(reference-explorer):
  "에피소드: EP{N}, 슬라이드: {S}
   content-dir: {content-dir}
   요소 정의:
   - 배경: {배경 설명}
   - 인물: {인물 설명}
   - 사물: {사물 설명}
   프롬프트: {prompt 텍스트}
   colorMood: {colorMood}"
```

**에이전트가 누락 요소를 보고하면:**
- 누락된 요소에 대해 에셋 생성이 필요 → 아래 E단계 실행 후 ref 목록에 추가

#### E. 에셋 생성 (ref가 부족할 때만)

reference-explorer가 누락으로 보고한 요소만 새로 생성한다.

**에셋용 프롬프트 JSON 작성:**
```json
{
  "episode": {N},
  "title": "에셋 설명",
  "stylePrefix": "(art-direction.md에서 추출)",
  "characterPrefix": "",
  "prompts": [{ "slideNumber": 1, "prompt": "...", "textOverlay": "", "colorMood": "..." }]
}
```

**호출:**
```bash
node --import tsx ${CLAUDE_SKILL_DIR}/scripts/generate.ts \
  --prompt {asset_prompt.json} \
  --slide 1 \
  --ratio 4:5 \
  --output-dir output/assets/EP{N} \
  --content-dir {content-dir}
```

**캐릭터 에셋 규칙:**
- 캐릭터 포즈 에셋 생성 시 **반드시** 기존 캐릭터 시트를 `--ref`로 포함
- 기존 캐릭터 ref 탐색: `Glob: {content-dir}/visual/references/character/**/*`

#### C+D+F. pipeline-slide 실행 (검수 + 생성)

B(+E)에서 확보한 ref를 pipeline-slide.ts에 전달한다.
**pipeline-slide.ts가 C(검수) → D(선정) → F(생성) + dimension 검증을 코드로 강제한다.**

**호출:**
```bash
node --import tsx ${CLAUDE_SKILL_DIR}/scripts/pipeline-slide.ts \
  --prompt output/prompts/EP{N}_prompts.json \
  --slide {S} \
  --ratio 4:5 \
  --ref {bg_ref} {char_ref} [obj_ref] \
  --concept "{슬라이드 컨셉}" \
  --content-dir {content-dir} \
  [--model {model}]
```

**결과 처리:**

| exit code | 의미 | 다음 단계 |
|-----------|------|----------|
| 0 | 성공 | 다음 슬라이드로 |
| 1 | 생성 실패 | 에러 확인 후 재시도 |
| 2 | ref 검수 실패 (INSPECT FAIL) | B로 돌아가 다른 ref 탐색, 또는 E에서 에셋 생성 (최대 2회) |

**exit code 2일 때 INSPECT_RESULT JSON이 출력된다.**
- `issues`와 `suggestions`를 참고하여 다른 ref를 찾거나 에셋을 생성
- 재시도는 최대 2회까지

---

### 개선 루프 (검수 후)

슬라이드 생성 완료 후, 생성된 이미지를 검수하고 필요시 개선한다.

#### 검수 방법

inspect.ts로 생성된 이미지를 검수:

```bash
node --import tsx ${CLAUDE_SKILL_DIR}/scripts/inspect.ts \
  --refs output/EP{N}/EP{N}_S{NN}_{slug}.png \
  --concept "{슬라이드 컨셉}" \
  --prompt "{원본 프롬프트}" \
  --art-direction {content-dir}/visual/art-direction.md
```

#### 개선 처리

- score 90+ : 루프 종료, 다음 슬라이드로
- score < 90 : 개선본을 `output/EP{N}/revisions/`에 생성
- 원본을 직접 덮어쓰지 않는다
- 최대 3회 개선 시도 후 사용자에게 판단 위임

---

### 재생성 규칙 (원본 보존)

생성된 슬라이드에 대해 재생성/개선을 요청할 때, **원본은 항상 보존**한다.

#### 디렉토리 구조

```
output/EP{N}/
  EP{N}_S01_cover.png              # 원본 (덮어쓰지 않음)
  EP{N}_S01_cover.meta.json
  ...
  revisions/                        # 재생성/개선본 폴더
    v1/
      EP{N}_S03_scene3.png          # 1차 개선본
      EP{N}_S03_scene3.meta.json
      EP{N}_S03_scene3.prompt.json  # 개선에 사용한 프롬프트
    v2/
      EP{N}_S03_scene3.png          # 2차 개선본
      ...
```

#### 규칙

1. **원본 덮어쓰기 금지**: `output/EP{N}/EP{N}_S{NN}_{slug}.png`는 최초 생성본을 유지
2. **개선본 위치**: `output/EP{N}/revisions/v{N}/`에 버전별로 저장
3. **프롬프트 보존**: 개선에 사용한 수정 프롬프트를 `.prompt.json`으로 함께 저장
4. **채택 시 교체**: 사용자가 개선본을 확인하고 채택을 명시하면, 그때 원본 위치로 복사
5. **버전 넘버링**: `v1`, `v2`, `v3` 순서로 증가 (기존 revisions 폴더 확인 후 다음 번호 부여)

#### prompt.json 형식

```json
{
  "originalSlide": 3,
  "revisionVersion": 1,
  "changeReason": "배경 톤이 너무 밝아 감정선과 불일치",
  "modifiedPrompt": "...(수정된 프롬프트 전문)",
  "modifiedRefs": ["ref1.png", "ref2.png"],
  "inspectScore": {
    "before": 72,
    "after": 91
  }
}
```

---

## 스크립트 경로

모든 스크립트는 `${CLAUDE_SKILL_DIR}/scripts/` 아래에 위치한다:

| 스크립트 | 용도 |
|---------|------|
| `pipeline-slide.ts` | 슬라이드별 파이프라인 (C검수 → D선정 → F생성 + dimension 검증) |
| `generate.ts` | Gemini API로 이미지 생성 (pipeline-slide가 내부 호출) |
| `inspect.ts` | ref/이미지 적합성 검증 (pipeline-slide가 내부 호출) |

## 에이전트

| 에이전트 | 용도 | 모델 |
|---------|------|------|
| `story-writer` | 프롬프트 JSON 생성 | sonnet |
| `reference-explorer` | ref 이미지 탐색/추천 | haiku |

---

## EP간 스타일 일관성 규칙

EP2 이상을 생성할 때는 이전 EP에서 생성된 이미지를 스타일 ref로 활용하여 시리즈 일관성을 유지한다.

**일관성 체크리스트 (EP2+ 생성 전 확인):**
- [ ] 이전 EP 출력 폴더(`output/EP{N-1}/`)가 존재하는가?
- [ ] 동일 공간이 등장하는 슬라이드의 배경 ref를 이전 EP에서 가져왔는가?
- [ ] toneReference가 이전 EP의 대표 슬라이드 또는 tone-masters를 가리키는가?

## 주의사항

- 에셋 생성은 ref가 부족할 때만 실행 (불필요한 에셋 생성 방지)
- 같은 공간은 EP 간에 동일한 ref를 재활용하여 배경 일관성 유지
- 이전 EP의 생성된 이미지는 스타일 일관성이 검증된 ref이므로 적극 활용
