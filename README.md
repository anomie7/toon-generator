# toon-generator-skill

![banner](docs/banner.png)

> Claude Code skill package for automated Instagram webtoon (insta-toon) generation pipeline.

[English](#english) | [한국어](#한국어)

---

## English

**toon-generator-skill** is a set of 3 Claude Code skills that automate the entire Instagram webtoon creation process — from content planning to image generation to video reels.

| Skill | What it does |
|-------|-------------|
| **toon-prep** | Socratic interview → content docs → reference images |
| **toon-gen** | Prompt JSON → ref search/inspect → Gemini API image generation |
| **toon-reels** | Slide images → MP4 reels with BGM |

### Quick Install

```bash
git clone https://github.com/anomie7/toon-generator-skill.git ~/.claude/skills/toon-generator-skill
cd ~/.claude/skills/toon-generator-skill && npm install
```

### Prerequisites

- [GEMINI_API_KEY](https://aistudio.google.com/) — Google AI Studio
- Node.js >= 18
- ffmpeg (`brew install ffmpeg`) — for toon-reels only

---

## 한국어

### Demo

<!-- TODO: R2 영상 URL로 교체 -->
[![Demo Preview](docs/demo-preview.gif)](https://github.com/anomie7/toon-generator-skill)

> GIF를 클릭하면 전체 데모 영상을 볼 수 있습니다

### 개요

인스타툰 제작의 전체 파이프라인을 자동화하는 Claude Code 스킬 패키지입니다.

```
toon-prep                    toon-gen                      toon-reels
(콘텐츠 준비)          -->   (이미지 생성)           -->   (릴스 영상)

 인터뷰                       프롬프트 JSON                  슬라이드 수집
   |                            |                              |
 문서 생성                    ref 탐색/검수                   페이드 전환
   |                            |                              |
 레퍼런스 이미지               Gemini API 생성                 BGM 합성
                                                               |
                                                            MP4 출력
```

### 포함된 스킬

| 스킬 | 설명 | 주요 기능 |
|------|------|-----------|
| **toon-prep** | 콘텐츠 준비 | 소크라테스식 인터뷰 → 캐릭터/콘티/아트디렉션 문서 → 레퍼런스 이미지 생성 |
| **toon-gen** | 이미지 생성 | 프롬프트 JSON → ref 탐색(reference-explorer) → 적합성 검수(inspect) → Gemini API 이미지 생성 |
| **toon-reels** | 릴스 영상 | 슬라이드 이미지 → 페이드 전환 → BGM 합성 → MP4 (4:5 / 9:16) |

### 설치

#### 방법 1: 글로벌 설치 (모든 프로젝트에서 사용)

```bash
git clone https://github.com/anomie7/toon-generator-skill.git ~/.claude/skills/toon-generator-skill
cd ~/.claude/skills/toon-generator-skill && npm install
```

#### 방법 2: 프로젝트 로컬 설치

```bash
git clone https://github.com/anomie7/toon-generator-skill.git .claude/skills/toon-generator-skill
cd .claude/skills/toon-generator-skill && npm install
```

### 사전 조건

1. **GEMINI_API_KEY**: [Google AI Studio](https://aistudio.google.com/)에서 발급

   ```bash
   export GEMINI_API_KEY="your-key-here"
   ```

2. **Node.js >= 18**

3. **ffmpeg** (toon-reels 사용 시):

   ```bash
   brew install ffmpeg  # macOS
   ```

### 사용법

#### 1단계: 콘텐츠 준비 (toon-prep)

```bash
# 인터뷰부터 시작 (전체 파이프라인)
/toon-prep --content-dir ./content

# 이미 기획이 있으면 문서 생성부터
/toon-prep --content-dir ./content --skip-interview

# 레퍼런스 이미지만 생성
/toon-prep --content-dir ./content --skip-interview --skip-docs
```

toon-prep이 완료되면 다음이 생성됩니다:

```
content/
  interview-result.json          # 인터뷰 결과
  character-sheet.md             # 캐릭터 시트
  character-concept.md           # 인물 컨셉
  visual/
    art-direction.md             # 아트 디렉션
    character-sheet-detailed.md  # 상세 캐릭터 시트
    references/                  # 레퍼런스 이미지 (7종)
  episode-design/EP1.md~         # 에피소드 설계
  conti/EP1.md~                  # 콘티
```

#### 2단계: 이미지 생성 (toon-gen)

```bash
# EP1 전체 생성
/toon-gen --episode 1

# 특정 슬라이드만
/toon-gen --episode 3 --slide 2

# 프로덕션 모델로 생성
/toon-gen --episode 1 --model gemini-3-pro-image-preview

# 생성 직후 자동 검수
/toon-gen --episode 1 --auto-inspect
```

#### 3단계: 릴스 영상 (toon-reels)

```bash
# 기본 (4:5, 3초/슬라이드)
/toon-reels output/EP1

# BGM 포함
/toon-reels output/EP1 --bgm content/audio/EP1/bgm.mp3

# 릴스용 세로 비율 + 페이드 전환
/toon-reels output/EP1 --ratio 9:16 --fade 0.5
```

### 모델 자동 선택

`toon-gen`은 슬라이드의 텍스트 유무에 따라 모델을 자동 선택합니다:

| 조건 | 모델 | 이유 |
|------|------|------|
| 한글 텍스트 있음 | `gemini-3-pro-image-preview` (Pro) | 한글 렌더링 정확도 우수 |
| 텍스트 없음 | `gemini-3.1-flash-image-preview` (Flash) | 빠르고 저렴 |

`--model`로 고정 지정하면 자동 선택을 무시합니다.

### 아키텍처

```
toon-generator-skill/
  toon-prep/
    SKILL.md                    # 스킬 정의
    agents/
      interviewer.md            # 소크라테스식 인터뷰 에이전트
      doc-generator.md          # 문서 생성 에이전트
    scripts/
      generate-refs.ts          # 레퍼런스 이미지 생성 (Gemini API)
    templates/                  # 문서 템플릿 (9종)

  toon-gen/
    SKILL.md                    # 스킬 정의
    agents/
      story-writer.md           # 프롬프트 JSON 생성 에이전트
      reference-explorer.md     # ref 탐색/추천 에이전트
    scripts/
      generate.ts               # 이미지 생성 (Gemini API)
      inspect.ts                # ref/이미지 적합성 검증 (Gemini API)
    lib/
      config.ts                 # 설정 + 모델 레지스트리
      types.ts                  # 타입 정의 (Zod 스키마)
      image-utils.ts            # 이미지 유틸리티

  toon-reels/
    SKILL.md                    # 스킬 정의
    scripts/
      make-reels.sh             # ffmpeg 기반 영상 생성
```

### 커스터마이징

- **문서 템플릿**: `toon-prep/templates/*.tmpl.md`를 수정하면 생성되는 문서 구조를 변경할 수 있습니다
- **아트 디렉션**: `content/visual/art-direction.md`에 스타일/금지 요소를 정의하면 모든 프롬프트에 자동 반영됩니다
- **에이전트 프롬프트**: `agents/*.md` 파일을 수정하여 에이전트 동작을 조정할 수 있습니다

### Roadmap

- [ ] Remotion 기반 고급 릴스 (애니메이션, Ken Burns 효과)
- [ ] 슬라이드별 텍스트 길이에 따른 자동 duration 조절
- [ ] 자동 BGM 선택 연동
- [ ] 에피소드 간 자동 스타일 일관성 검증

### 라이선스

[MIT](LICENSE)
