# toon-generator-skill

![banner](docs/banner.png)

> Claude Code skill package for automated Instagram webtoon (insta-toon) generation pipeline.

[한국어](README.md)

## Overview

**toon-generator-skill** is a set of 3 Claude Code skills that automate the entire Instagram webtoon creation process — from content planning to image generation to video reels.

| Skill | What it does |
|-------|-------------|
| **toon-prep** | Socratic interview → content docs → reference images |
| **toon-gen** | Prompt JSON → ref search/inspect → Gemini API image generation |
| **toon-reels** | Slide images → MP4 reels with BGM |

## Quick Install

```bash
# Global install (available in all projects)
git clone https://github.com/anomie7/toon-generator-skill.git ~/.claude/skills/toon-generator-skill
cd ~/.claude/skills/toon-generator-skill && npm install
```

```bash
# Project-local install
git clone https://github.com/anomie7/toon-generator-skill.git .claude/skills/toon-generator-skill
cd .claude/skills/toon-generator-skill && npm install
```

## Prerequisites

- [GEMINI_API_KEY](https://aistudio.google.com/) — Google AI Studio
- Node.js >= 18
- ffmpeg (`brew install ffmpeg`) — for toon-reels only

## Usage

### Step 1: Content Preparation (toon-prep)

```bash
/toon-prep --content-dir ./content
```

Runs a Socratic interview to collect your webtoon concept, then auto-generates:
- Character sheets, art direction, emotion charts
- Episode designs and storyboards (conti)
- Reference images (character, background, tone masters)

### Step 2: Image Generation (toon-gen)

```bash
/toon-gen --episode 1
```

For each slide: searches reference images → validates via Gemini API → generates the final illustration. Auto-selects Pro model for slides with Korean text, Flash for text-free slides.

### Step 3: Reels Video (toon-reels)

```bash
/toon-reels output/EP1 --bgm content/audio/EP1/bgm.mp3
```

Converts slide images into an Instagram-ready MP4 with fade transitions and BGM.

## Model Auto-Selection

| Condition | Model | Reason |
|-----------|-------|--------|
| Korean text present | `gemini-3-pro-image-preview` (Pro) | Better Korean text rendering |
| No text | `gemini-3.1-flash-image-preview` (Flash) | Faster, cheaper |

Override with `--model <model-name>`.

## Architecture

```
toon-generator-skill/
  toon-prep/          # Content preparation skill
    agents/           #   interviewer, doc-generator
    scripts/          #   generate-refs.ts (Gemini API)
    templates/        #   9 document templates

  toon-gen/           # Image generation skill
    agents/           #   story-writer, reference-explorer
    scripts/          #   generate.ts, inspect.ts
    lib/              #   config, types, image-utils

  toon-reels/         # Video generation skill
    scripts/          #   make-reels.sh (ffmpeg)
```

## License

[MIT](LICENSE)
