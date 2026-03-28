# 데모 인스타툰 생성 계획

## 목적

toon-generator-skill의 GitHub 레포 README에 넣을 데모 결과물을 생성한다.
"이 스킬로 이런 걸 만들 수 있다"를 보여주는 2가지 비즈니스 홍보 인스타툰 샘플.

## 스킬 위치

`/Users/demin_coder/Dev/toon-generator-skill` (이미 npm install 완료)

## 생성할 데모 2종

### 데모 1: 동네 카페 홍보용 인스타툰

**컨셉**: "오늘도 그 자리" — 단골손님의 하루를 통해 카페의 매력을 자연스럽게 보여주는 감성 인스타툰

- 타겟: 카페 인스타그램 팔로워, 동네 주민
- 톤: 따뜻하고 아늑한, 수채화 느낌의 파스텔 톤
- 스타일: 컬러 일러스트, 부드러운 라인, 따뜻한 조명

| 슬라이드 | 화면 | 텍스트 |
|----------|------|--------|
| S1 (커버) | 카페 외관, 오후 햇살 | "오늘도 그 자리" |
| S2 | 문을 열고 들어오는 주인공 (직장인) | "퇴근하면 발이 저절로 향하는 곳이 있다" |
| S3 | 사장님이 주문도 안 받고 만들기 시작 | "어서오세요~ 오늘도 그거죠?" |
| S4 | 시그니처 음료 클로즈업 (라떼아트) | "매일 마셔도 질리지 않는 맛" |
| S5 | 창가 자리에서 노트북 펴는 주인공 | "여기 앉으면 이상하게 집중이 잘 돼" |
| S6 | 해질녘 카페 내부, 주인공 미소 | "작은 카페 하나가 하루를 바꿔놓기도 한다" |

### 데모 2: 피부과 홍보용 인스타툰

**컨셉**: "거울 보기가 싫었던 날" — 피부 고민이 있는 직장인의 변화 스토리

- 타겟: 20-30대, 피부 고민 있는 사람
- 톤: 깔끔하고 신뢰감 있는, 밝은 톤 (병원 청결감)
- 스타일: 컬러 일러스트, 클린한 라인, 밝고 깨끗한 조명

| 슬라이드 | 화면 | 텍스트 |
|----------|------|--------|
| S1 (커버) | 거울 앞에 서 있는 주인공 (걱정스러운 표정) | "거울 보기가 싫었던 날" |
| S2 | 회사에서 마스크 만지작거리는 주인공 | "마스크 벗기가 두려웠다" |
| S3 | 밤에 스마트폰으로 피부과 검색 | "용기 내서 예약 버튼을 눌렀다" |
| S4 | 상담실에서 친절한 의사와 대화 | "선생님이 하나하나 설명해주셨다" |
| S5 | 시술 후 거울을 보며 놀라는 표정 | "이게... 나야?" |
| S6 | 밝은 표정으로 마스크 없이 출근 | "이제 거울 보는 게 좋아졌다" |

## 실행 방법

### 디렉토리 구조

```
/Users/demin_coder/Dev/toon-generator-skill/demos/
  cafe/
    content/         # 콘텐츠 문서
    output/          # 생성 결과
  clinic/
    content/         # 콘텐츠 문서
    output/          # 생성 결과
```

### 실행 순서 (각 데모별)

toon-prep 전체 파이프라인은 시간이 오래 걸리므로 **핵심 문서만 직접 작성 후 toon-gen으로 이미지 생성**.

#### 1. 최소 필수 문서 직접 작성

아래 4개 파일만 작성하면 toon-gen 실행 가능:

1. `content/visual/art-direction.md` — 스타일, 색감, 금지 요소 정의
2. `content/visual/character-sheet-detailed.md` — 주인공 외형/감정 표현
3. `content/conti/EP1.md` — 6슬라이드 콘티 (위 테이블 내용)
4. `content/episode-design/EP1.md` — 에피소드 감정/구조

**중요**: 이 데모들은 기존 인스타툰 프로젝트(모노크롬 스타일)와 다르게 **컬러 일러스트** 스타일이다.
art-direction.md에서 스타일을 각 데모에 맞게 정의해야 한다.

#### 2. 프롬프트 JSON 생성

story-writer 에이전트를 호출하거나, 위 테이블 기반으로 직접 `output/prompts/EP1_prompts.json` 작성.

```
Agent(story-writer): "EP1 이미지 프롬프트를 생성해줘. content-dir: demos/cafe/content"
```

#### 3. 이미지 생성

```bash
npx tsx /Users/demin_coder/Dev/toon-generator-skill/toon-gen/scripts/generate.ts \
  --prompt demos/cafe/output/prompts/EP1_prompts.json \
  --slide 1 \
  --content-dir demos/cafe/content \
  --model gemini-3-pro-image-preview
```

슬라이드 1~6을 순차 생성. 텍스트가 있는 슬라이드는 Pro 모델 사용.

#### 4. 결과 확인 및 데모 폴더에 복사

생성된 이미지 중 품질 좋은 것을 선별하여 `docs/demos/`에 복사.

### 최종 활용

생성된 데모 이미지를 README.md의 Demo 섹션에 추가:

```markdown
<details>
<summary>Demo (결과물 미리보기)</summary>

#### 카페 홍보 인스타툰
![cafe demo](docs/demos/cafe-showcase.png)

#### 피부과 홍보 인스타툰
![clinic demo](docs/demos/clinic-showcase.png)

</details>
```

또는 각 슬라이드를 격자(2x3)로 합성한 쇼케이스 이미지를 만들어도 좋다.

## 주의사항

- GEMINI_API_KEY 환경변수가 설정되어 있어야 함
- 데모용이므로 ref 탐색/검수(B~D 단계) 없이 바로 생성해도 무방
- 각 데모의 스타일이 다르므로 art-direction.md를 데모별로 다르게 작성
- 생성된 이미지는 demos/ 디렉토리에 저장하고, .gitignore에 demos/*/output/은 제외하되 docs/demos/는 커밋
