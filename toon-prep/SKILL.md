---
name: toon-prep
description: >
  인스타툰 콘텐츠 준비 스킬. 소크라테스식 인터뷰로 기획 정보를 수집하고,
  콘텐츠 문서(캐릭터 시트/아트 디렉션/콘티 등)를 자동 생성하며,
  레퍼런스 이미지(캐릭터/배경/톤마스터)까지 만든다.
allowed-tools:
  - Agent(interviewer)
  - Agent(doc-generator)
  - Bash(npx tsx ${CLAUDE_SKILL_DIR}/scripts/*)
  - Read
  - Write
  - Glob
  - AskUserQuestion
argument-hint: "[--content-dir path] [--skip-interview] [--skip-docs] [--skip-refs] [--model model-name]"
---

# toon-prep

인스타툰 콘텐츠 준비 스킬.
소크라테스식 인터뷰 -> 콘텐츠 문서 생성 -> 레퍼런스 이미지 생성의 3단계 파이프라인을 오케스트레이션한다.

## 인자

- `--content-dir path` (선택): 콘텐츠 문서 출력 디렉토리 (기본: `./content`)
- `--skip-interview` (선택): 인터뷰 단계 건너뛰기 (이미 `interview-result.json`이 있을 때)
- `--skip-docs` (선택): 문서 생성 단계 건너뛰기 (이미 문서가 있을 때)
- `--skip-refs` (선택): 레퍼런스 이미지 생성 단계 건너뛰기
- `--model model-name` (선택): Gemini 모델. `gemini-3.1-flash-image-preview` (테스트, 기본값) / `gemini-3-pro-image-preview` (프로덕션)
- `--episodes N` (선택): 생성할 에피소드 수 (기본: 인터뷰에서 결정)

## 사전 조건

- `GEMINI_API_KEY` 환경변수 설정 (3단계 레퍼런스 이미지 생성에 필요)
- `npm install`이 완료된 상태 (`${CLAUDE_SKILL_DIR}/../node_modules/` 존재)
  - 패키지 루트: `${CLAUDE_SKILL_DIR}/../`

## 출력 구조

3단계를 모두 완료하면 아래 구조가 생성된다:

```
{content-dir}/
  interview-result.json              # 1단계 출력
  character-sheet.md                 # 2단계 출력 (기초 문서)
  character-concept.md
  character-sheet-detailed.md        # (선택) 상세 캐릭터 시트 + 프롬프트 키워드
  visual/
    art-direction.md
    character-sheet-detailed.md
  emotion-chart.md
  bgm-guide.md
  captions.md                        # 에피소드별 캡션 + 댓글 유도 문구
  episode-design/
    EP1.md ~ EP{N}.md               # 에피소드별 설계서
  conti/
    EP1.md ~ EP{N}.md               # 에피소드별 콘티
  visual/
    references/
      character/
        full-body.png               # 3단계 출력
        expressions.png
        full-body-home.png
      scenes/
        main-location.png
        secondary-location.png
      tone-masters/
        key-visual.png
        mood-sample.png
```

---

## 실행 흐름

### 0단계: 사전 확인

1. `{content-dir}` 디렉토리 존재 확인. 없으면 생성
2. `--skip-*` 플래그에 따라 건너뛸 단계 결정
3. 각 단계의 선행 조건 확인:
   - `--skip-interview` 시: `{content-dir}/interview-result.json` 존재 여부 확인
   - `--skip-docs` 시: 필수 문서(`art-direction.md`, `character-sheet-detailed.md` 등) 존재 여부 확인

### 1단계: 소크라테스식 인터뷰 (interviewer 에이전트)

**목적:** 사용자와의 대화를 통해 인스타툰 기획에 필요한 핵심 정보를 수집한다.

**실행:**
```
Agent(interviewer) 호출
- 에이전트가 AskUserQuestion으로 사용자에게 질문
- 5단계 인터뷰 진행:
  Phase 1: 프로젝트 개요 (목적/타겟/플랫폼/시리즈 구조)
  Phase 2: 캐릭터 디자인 (주인공/조연/관계)
  Phase 3: 서사 구조 (전체 아크/에피소드 수/감정선)
  Phase 4: 비주얼 방향 (작화 스타일/색감/분위기)
  Phase 5: 확인 및 출력
```

**출력:** `{content-dir}/interview-result.json`

**판단 기준:**
- 인터뷰 결과에 project, mainCharacter, narrative, visual 섹션이 모두 존재해야 함
- 누락된 섹션이 있으면 에이전트가 보충 질문

**이미 `interview-result.json`이 존재하는 경우:**
- 사용자에게 기존 결과를 사용할지, 새로 인터뷰할지 질문
- 기존 결과 사용 시 1단계 건너뛰기

---

### 2단계: 콘텐츠 문서 생성 (doc-generator 에이전트)

**목적:** 인터뷰 결과와 템플릿을 기반으로 toon-gen 스킬이 사용할 콘텐츠 문서를 생성한다.

**실행:**
```
Agent(doc-generator) 호출
- 입력: {content-dir}/interview-result.json + ${CLAUDE_SKILL_DIR}/templates/*.tmpl.md
- 3차에 걸쳐 문서 생성 (순서 중요 - 앞 문서가 뒤 문서에 영향)
```

**생성 순서:**

#### 1차: 기초 문서 (캐릭터 + 비주얼)
| 템플릿 | 출력 파일 | 설명 |
|--------|-----------|------|
| `character-sheet.tmpl.md` | `{content-dir}/character-sheet.md` | 성격/말투/내면 갈등 |
| `character-concept.tmpl.md` | `{content-dir}/character-concept.md` | 정서적 결/해석 기준 |
| `art-direction.tmpl.md` | `{content-dir}/visual/art-direction.md` | 작화 스타일/금지 요소 |
| `character-sheet-detailed.tmpl.md` | `{content-dir}/visual/character-sheet-detailed.md` | 외형/감정 표현/프롬프트 키워드 |

#### 2차: 서사 문서
| 템플릿 | 출력 파일 | 설명 |
|--------|-----------|------|
| `emotion-chart.tmpl.md` | `{content-dir}/emotion-chart.md` | 회차별 감정 흐름 |
| `bgm-guide.tmpl.md` | `{content-dir}/bgm-guide.md` | BGM/사운드 가이드 |

#### 3차: 에피소드별 문서 (EP 수만큼 반복)
| 템플릿 | 출력 파일 | 설명 |
|--------|-----------|------|
| `episode-design.tmpl.md` | `{content-dir}/episode-design/EP{N}.md` | 에피소드 감정/구조/장면 |
| `conti.tmpl.md` | `{content-dir}/conti/EP{N}.md` | 슬라이드별 화면/텍스트/연출 |

**완료 확인:**
- 모든 문서가 정상 생성되었는지 Glob으로 확인
- 필수 문서(`art-direction.md`, `character-sheet-detailed.md`, `conti/EP*.md`, `episode-design/EP*.md`) 누락 시 에이전트에 재생성 요청

---

### 3단계: 레퍼런스 이미지 생성 (generate-refs.ts)

**목적:** 2단계에서 생성한 문서를 기반으로 toon-gen이 사용할 레퍼런스 이미지를 생성한다.

**실행:**
```bash
npx tsx ${CLAUDE_SKILL_DIR}/scripts/generate-refs.ts \
  --content-dir {content-dir} \
  --output-dir {content-dir}/visual/references \
  --model {model}
```

**생성 이미지 (7종):**

| 카테고리 | 파일 | 용도 |
|----------|------|------|
| character | `character/full-body.png` | 전신 정면 기본 포즈 |
| character | `character/expressions.png` | 감정 표현 시트 (6가지) |
| character | `character/full-body-home.png` | 실내복 전신 |
| background | `background/main-location.png` | 메인 배경 |
| background | `background/secondary-location.png` | 보조 배경 |
| tone-master | `tone-masters/key-visual.png` | 톤/스타일 기준 이미지 |
| tone-master | `tone-masters/mood-sample.png` | 분위기 샘플 |

**옵션:**
- `--category character` 등으로 특정 카테고리만 생성 가능
- 이미 존재하는 이미지는 건너뛰지 않음 (덮어쓰기)

**실패 시:**
- Gemini API 호출 실패: 스크립트 내장 재시도 로직(3회)이 처리
- 특정 카테고리만 실패: `--category`로 해당 카테고리만 재실행
- 품질 불만족: 사용자에게 확인 후 재생성 여부 결정

---

## 완료 후

3단계가 모두 완료되면 사용자에게 결과를 요약하고, toon-gen 스킬로 이미지 생성을 진행할 수 있음을 안내한다:

```
toon-prep 완료:
- interview-result.json 생성 완료
- 콘텐츠 문서 {N}종 생성 완료
- 레퍼런스 이미지 7종 생성 완료

다음 단계: /toon-gen --episode 1 로 EP1 이미지 생성을 시작할 수 있습니다.
```

**레퍼런스 이미지 확인 권장:**
- 3단계에서 생성된 레퍼런스 이미지를 사용자에게 직접 확인하도록 권장
- 특히 캐릭터 full-body.png의 외형이 기획 의도와 일치하는지
- 색감/분위기가 art-direction.md와 부합하는지
- 불만족 시 프롬프트를 수정하여 재생성

---

## 부분 실행

이미 일부 단계가 완료된 경우 건너뛸 수 있다:

| 시나리오 | 사용 방법 |
|----------|-----------|
| 이미 기획이 있고 문서화만 필요 | `interview-result.json`을 직접 작성 후 `--skip-interview` |
| 이미 문서가 있고 ref만 필요 | `--skip-interview --skip-docs` |
| 인터뷰만 진행하고 싶을 때 | `--skip-docs --skip-refs` |
| 문서 일부만 재생성 | doc-generator 에이전트를 직접 호출 |

---

## 템플릿 커스터마이징

`${CLAUDE_SKILL_DIR}/templates/` 아래 `.tmpl.md` 파일을 수정하여 문서 구조를 변경할 수 있다.

- 각 템플릿은 `{{플레이스홀더}}` 형태의 변수를 포함
- HTML 코멘트(`<!-- -->`)로 doc-generator 에이전트용 작성 지침이 포함되어 있음
- 템플릿 수정 시 doc-generator 에이전트의 출력에 즉시 반영됨

---

## 트러블슈팅

| 문제 | 해결 |
|------|------|
| `GEMINI_API_KEY` 없음 | `.env` 파일에 설정하거나 `export GEMINI_API_KEY=...` 실행 |
| 인터뷰가 중단됨 | `interview-result.json`이 부분 저장되어 있으면 수동 편집 후 `--skip-interview` |
| 문서 생성 품질 낮음 | `interview-result.json`의 내용이 충분한지 확인. 부족하면 인터뷰 재진행 |
| ref 이미지 스타일 불일치 | `art-direction.md`의 작화 스타일 섹션을 보강 후 3단계 재실행 |
| npm 패키지 없음 | `cd ${CLAUDE_SKILL_DIR}/.. && npm install` 실행 |
