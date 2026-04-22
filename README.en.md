# toon-generator

![banner](docs/banner.png)

> Claude Code plugin for automated Instagram webtoon (insta-toon) generation pipeline.

[한국어](README.md)

## Overview

**toon-generator** is a Claude Code plugin that bundles 4 skills and 5 sub-agents to automate the entire Instagram webtoon creation process — from content planning to image generation to video reels.

| Skill | What it does |
|-------|-------------|
| **toon-prep** | Socratic interview -> content docs -> reference images |
| **toon-slide** | Prompt JSON -> ref search/inspect -> Gemini or OpenAI API image generation |
| **toon-reels** | Slide images -> MP4 reels with BGM |

| Agent | Skill | Role |
|-------|-------|------|
| **story-writer** | toon-slide | Generates image prompt JSON from storyboards |
| **reference-explorer** | toon-slide | Searches and recommends reference images |
| **interviewer** | toon-prep | Collects project info via Socratic interview |
| **doc-generator** | toon-prep | Auto-generates content documents |

## Quick Install

```bash
# Project-local (recommended)
git clone https://github.com/anomie7/toon-generator.git .claude/plugins/toon-generator
cd .claude/plugins/toon-generator && npm install
```

```bash
# Global install (available in all projects)
git clone https://github.com/anomie7/toon-generator.git ~/.claude/plugins/toon-generator
cd ~/.claude/plugins/toon-generator && npm install
```

Skills and agents are auto-discovered after installation.

## Prerequisites

- [GEMINI_API_KEY](https://aistudio.google.com/) — Google AI Studio
- OPENAI_API_KEY — required only when using `gpt-image-2`
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

### Step 2: Image Generation (toon-slide)

```bash
/toon-slide --episode 1

# Use OpenAI GPT Image 2
/toon-slide --episode 1 --model gpt-image-2
```

For each slide: searches reference images → validates via Gemini API → generates the final illustration. Auto-selects Pro model for slides with Korean text, Flash for text-free slides. Pass `--model gpt-image-2` to generate with OpenAI GPT Image 2 instead.

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

Override with `--model <model-name>`. Supported image generation models include `gemini-3.1-flash-image-preview`, `gemini-3-pro-image-preview`, and `gpt-image-2`.

## Architecture

```
toon-generator/
  .claude-plugin/
    plugin.json         # Plugin manifest

  agents/               # Sub-agents (auto-discovered)
    story-writer.md
    reference-explorer.md
    interviewer.md
    doc-generator.md

  skills/               # Skills (auto-discovered)
    toon-prep/
      scripts/          #   generate-refs.ts (Gemini API)
      templates/        #   9 document templates
    toon-slide/
      scripts/          #   generate.ts, inspect.ts
      lib/              #   config, types, image-utils
    toon-reels/
      scripts/          #   make-reels.sh (ffmpeg)
```

## License

[MIT](LICENSE)
