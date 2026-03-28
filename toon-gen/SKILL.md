---
name: toon-gen
description: >
  인스타툰 이미지 생성 파이프라인. 콘텐츠 문서(콘티/에피소드 설계/아트 디렉션)를
  입력받아 story-writer -> ref 탐색/검수 -> 이미지 생성까지 전체 워크플로우를 실행한다.
allowed-tools:
  - Agent(story-writer)
  - Agent(reference-explorer)
  - Bash(npx tsx ${CLAUDE_SKILL_DIR}/scripts/*)
  - Read
  - Write
  - Glob
argument-hint: "--episode N [--slide N] [--content-dir path] [--model model-name]"
---

# toon-gen

인스타툰 이미지 생성 파이프라인 스킬.
콘텐츠 문서를 입력받아 프롬프트 JSON 생성 -> ref 탐색/검수 -> 이미지 생성까지 전체 워크플로우를 오케스트레이션한다.

## 인자

- `--episode N` (필수): 생성할 에피소드 번호
- `--slide N` (선택): 특정 슬라이드만 생성 (미지정 시 전체)
- `--content-dir path` (선택): 콘텐츠 문서 루트 디렉토리 (기본: `./content`)
- `--model model-name` (선택): Gemini 모델을 고정 지정. 미지정 시 슬라이드별 자동 선택 (아래 참조)

## 모델 자동 선택 전략

`--model` 미지정 시, 각 슬라이드의 `textOverlay` 유무에 따라 모델이 자동 선택된다:

| 조건 | 선택 모델 | 이유 |
|------|----------|------|
| `textOverlay` 또는 `episodeTitle` 있음 | `gemini-3-pro-image-preview` (Pro) | 한글 텍스트 렌더링 정확도 우수 (에러율 10% 미만) |
| `textOverlay` 없음 | `gemini-3.1-flash-image-preview` (Flash) | 빠르고 저렴, 텍스트 없는 일러스트에 충분 |
| E단계 에셋 생성 | Flash 권장 | 참고용 에셋, 텍스트 불필요 |

모델 특성 비교:

| 모델 | 속도 | 비용 | 한글 텍스트 | 품질 |
|------|------|------|------------|------|
| `gemini-3.1-flash-image-preview` | 빠름 | $0.045/img | 보통 | 높음 |
| `gemini-3-pro-image-preview` | 느림 | $0.134/img | 우수 | 최고 |

`--model`로 고정 지정하면 자동 선택을 무시하고 모든 슬라이드에 해당 모델을 사용한다.

## 사전 조건

- `GEMINI_API_KEY` 환경변수 설정
- `{content-dir}/` 아래에 콘텐츠 문서가 존재해야 함
- `npm install`이 완료된 상태 (`${CLAUDE_SKILL_DIR}/node_modules/` 존재)

## 필요한 콘텐츠 문서

| 파일 | 용도 | 필수 |
|------|------|------|
| `{content-dir}/conti/EP{N}.md` | 슬라이드별 화면/텍스트/연출 | 필수 |
| `{content-dir}/episode-design/EP{N}.md` | 에피소드 감정/구조/장면 설계 | 필수 |
| `{content-dir}/visual/art-direction.md` | 아트 디렉션 (스타일/색감/금지 요소) | 필수 |
| `{content-dir}/visual/character-sheet-detailed.md` | 상세 캐릭터 시트 (외형/감정 표현) | 필수 |
| `{content-dir}/character-concept.md` | 인물 컨셉 (정서적 결) | 선택 |
| `{content-dir}/emotion-chart.md` | 감정선표 (회차별 감정 흐름) | 선택 |
| `{content-dir}/character-sheet.md` | 캐릭터 시트 (성격/말투) | 선택 |
| `{content-dir}/visual/references/` | 레퍼런스 이미지 디렉토리 | 권장 |

## 출력 구조

```
output/
  prompts/EP{N}_prompts.json    # 프롬프트 JSON (1단계)
  assets/EP{N}/                 # 프리프로덕션 에셋 (E단계)
  EP{N}/                        # 최종 이미지 (F단계)
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
- 프롬프트가 영어로 작성되었는지, textOverlay는 콘티 언어인지 확인

---

### 2단계: 슬라이드별 반복 (A -> F)

각 슬라이드에 대해 아래 A~F를 순서대로 실행한다.
`--slide`가 지정되면 해당 슬라이드만, 미지정 시 전체 슬라이드를 순차 처리한다.

#### A. 요소 정의 (오케스트레이터)

프롬프트 JSON과 콘티를 읽고, 해당 슬라이드에 필요한 요소를 정의한다.

**읽을 파일:**
- `output/prompts/EP{N}_prompts.json` - 해당 슬라이드의 prompt, colorMood
- `{content-dir}/conti/EP{N}.md` - 해당 슬라이드의 연출 포인트

**정의 항목:**
- **배경**: 공간, 시간대, 분위기
- **인물(포즈/표정)**: 주인공의 자세, 시선, 감정 표현
- **사물(소품/UI)**: 장면에 등장하는 오브젝트

**출력 예시:**
```
슬라이드 3 요소 정의:
- 배경: 자취방 밤, 책상 위 노트북 불빛만 켜진 상태
- 인물: 의자에 앉은 주인공, 턱을 괴고 화면을 멍하니 바라봄
- 사물: 노트북(열린 상태), 빈 컵, 이어폰
```

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

**에이전트 출력:**
- 요소별(배경/인물/사물) ref 매핑
- `--ref` 명령어
- 누락 요소 목록

#### C. ref 검수 (inspect 스크립트)

B에서 추천받은 ref의 적합성을 Gemini API로 검증한다.

**호출:**
```bash
npx tsx ${CLAUDE_SKILL_DIR}/scripts/inspect.ts \
  --refs {bg_ref} {char_ref} [obj_ref] \
  --concept "{슬라이드 컨셉}" \
  --prompt "{이미지 프롬프트 텍스트}" \
  --art-direction {content-dir}/visual/art-direction.md
```

**결과 처리:**

| 결과 | 다음 단계 |
|------|----------|
| PASS (score 7+) | D단계로 진행 |
| FAIL + 다른 ref 후보 있음 | B로 돌아가 재탐색 (최대 2회) |
| FAIL + 적합한 ref 없음 | E로 넘어가 에셋 신규 생성 |

**구조적 FAIL 예외:**

issues가 아래 항목**만**으로 구성된 FAIL은 프롬프트 보강 후 F단계로 직행 가능:
- **"4-head-tall proportion"** - 캐릭터 시트와 생성 스타일 간 등신 차이 (구조적)
- **"hyper-realistic textures"** - 2D 캐릭터 시트와 배경 사진의 렌더링 차이 (구조적)

단, 이 외 이슈(포즈 불일치, 색상 충돌, 구도 미스 등)가 **하나라도** 동반되면 E단계 필수.

#### D. ref 선정 (오케스트레이터)

검수를 통과한 ref를 슬라이드용으로 확정한다.

**선정 원칙:**
- 2~3장 조합: 배경 ref + 캐릭터 ref + (선택)오브젝트 ref
- 배경과 캐릭터는 각 1장 이상 필수
- toneReference도 있으면 자동으로 ref에 포함됨 (generate.ts가 처리)

#### E. 에셋 생성 (ref가 부족할 때만)

D에서 적합한 ref를 확보하지 못한 요소만 새로 생성한다.

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
npx tsx ${CLAUDE_SKILL_DIR}/scripts/generate.ts \
  --prompt {asset_prompt.json} \
  --slide 1 \
  --output-dir output/assets/EP{N} \
  --content-dir {content-dir}
```

**캐릭터 에셋 규칙:**
- 캐릭터 포즈 에셋 생성 시 **반드시** 기존 캐릭터 시트(full-body, expressions 등)를 `--ref`로 포함
- ref 없이 캐릭터를 생성하면 헤어스타일/의상/비율이 불일치함
- 기존 캐릭터 ref 탐색: `Glob: {content-dir}/visual/references/character/**/*`

**에셋이 유일한 ref가 되는 경우:**
- F단계에서 새로 생성한 에셋만 ref로 사용하면 스타일 약화 위험
- 캐릭터 시트나 이전 EP 이미지를 추가 ref로 보강할 것

#### F. 이미지 생성 (generate.ts)

D+E에서 확보한 복수 ref를 조합하여 최종 슬라이드를 생성한다.

**호출:**
```bash
npx tsx ${CLAUDE_SKILL_DIR}/scripts/generate.ts \
  --prompt output/prompts/EP{N}_prompts.json \
  --slide {S} \
  --ref {bg_ref} {char_ref} [obj_ref] \
  --content-dir {content-dir} \
  --model {model}
```

**출력:** `output/EP{N}/EP{N}_S{NN}_{slug}.png`

**ref 조합 예시:**
- 배경 + 캐릭터: `--ref bg_room.png full-body.png`
- 배경 + 캐릭터 + 오브젝트: `--ref bg_room.png full-body.png obj_phone.png`
- 이전 EP ref + 에셋: `--ref output/EP5/EP5_S03_room.png output/assets/EP6/char_pose.png`

---

### 개선 루프 (검수 후)

슬라이드 생성 완료 후, 생성된 이미지를 검수하고 필요시 개선한다.

#### 검수 방법

inspect.ts로 생성된 이미지 자체를 ref로 넣고, 원래 프롬프트와 비교 검수:

```bash
npx tsx ${CLAUDE_SKILL_DIR}/scripts/inspect.ts \
  --refs output/EP{N}/EP{N}_S{NN}_{slug}.png \
  --concept "{슬라이드 컨셉}" \
  --prompt "{원본 프롬프트}" \
  --art-direction {content-dir}/visual/art-direction.md
```

#### 개선 처리

- score 90+ : 루프 종료, 다음 슬라이드로
- score < 90 : 개선본을 `output/EP{N}/variables/`에 생성

```bash
npx tsx ${CLAUDE_SKILL_DIR}/scripts/generate.ts \
  --prompt output/prompts/EP{N}_prompts.json \
  --slide {S} \
  --ref {개선된_ref_조합} \
  --output-dir output/EP{N}/variables \
  --content-dir {content-dir}
```

- 원본을 직접 덮어쓰지 않는다
- 사용자가 이미지를 확인하고 채택 확인 후 원본 파일을 교체
- 최대 3회 개선 시도 후 사용자에게 판단 위임

---

## 금지 요소 처리

프로젝트별 금지 요소는 `{content-dir}/visual/art-direction.md`의 "금지 요소" 섹션에 정의된다.
이 스킬은 해당 섹션을 읽어 모든 프롬프트에 반영한다.

**처리 순서:**
1. art-direction.md 읽기
2. "금지 요소" 또는 "금지 키워드" 섹션 추출
3. story-writer에 전달 (프롬프트 생성 시 반영)
4. inspect.ts에 `--art-direction` 인자로 전달 (검수 시 반영)

---

## 스크립트 경로

모든 스크립트는 `${CLAUDE_SKILL_DIR}/scripts/` 아래에 위치한다:

| 스크립트 | 용도 |
|---------|------|
| `${CLAUDE_SKILL_DIR}/scripts/generate.ts` | Gemini API로 이미지 생성 |
| `${CLAUDE_SKILL_DIR}/scripts/inspect.ts` | ref/이미지 적합성 검증 |

실행은 항상 `npx tsx`를 사용한다 (스킬 패키지의 node_modules 자동 해결).

## 에이전트

| 에이전트 | 용도 | 모델 |
|---------|------|------|
| `story-writer` | 프롬프트 JSON 생성 | sonnet |
| `reference-explorer` | ref 이미지 탐색/추천 | haiku |

---

## 사용 예시

```
# EP3 전체 생성
/toon-gen --episode 3

# EP5 슬라이드 2만 생성
/toon-gen --episode 5 --slide 2

# 커스텀 콘텐츠 디렉토리
/toon-gen --episode 1 --content-dir ./my-webtoon/content

# 프로덕션 모델로 생성
/toon-gen --episode 1 --model gemini-3-pro-image-preview
```

## EP간 스타일 일관성 규칙

EP2 이상을 생성할 때는 이전 EP에서 생성된 이미지를 스타일 ref로 활용하여 시리즈 일관성을 유지한다.

**자동 참조 절차:**
1. B단계(ref 탐색) 시 `output/EP{N-1}/` 에서 유사한 구도/장면의 슬라이드를 탐색
2. 같은 공간(자취방 등)이 등장하면 이전 EP의 동일 공간 슬라이드를 배경 ref로 우선 사용
3. 캐릭터 포즈가 유사하면 이전 EP의 해당 슬라이드를 추가 ref로 포함

**일관성 체크리스트 (EP2+ 생성 전 확인):**
- [ ] 이전 EP 출력 폴더(`output/EP{N-1}/`)가 존재하는가?
- [ ] 동일 공간이 등장하는 슬라이드의 배경 ref를 이전 EP에서 가져왔는가?
- [ ] toneReference가 이전 EP의 대표 슬라이드 또는 tone-masters를 가리키는가?

## 주의사항

- 프롬프트 JSON의 `prompt` 필드에 stylePrefix/characterPrefix를 중복 삽입하지 말 것 (generate.ts가 자동 조합)
- 에셋 생성은 ref가 부족할 때만 실행 (불필요한 에셋 생성 방지)
- 같은 공간(자취방 등)은 EP 간에 동일한 ref를 재활용하여 배경 일관성 유지
- 이전 EP의 생성된 이미지는 스타일 일관성이 검증된 ref이므로 적극 활용
