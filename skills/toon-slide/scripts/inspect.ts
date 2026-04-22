import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import { models, requireGeminiApiKey } from '../lib/config.js';
import type { InspectionResult } from '../lib/types.js';
import { loadRefImages, withRetry } from '../lib/image-utils.js';

// --- Args ---

function parseArgs() {
  const args = process.argv.slice(2);
  const refPaths: string[] = [];
  let prompt = '';
  let concept = '';
  let model: string = models.textPro;
  let artDirectionPath = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--refs') {
      while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        refPaths.push(args[++i]);
      }
    } else if (args[i] === '--prompt' && i + 1 < args.length) {
      prompt = args[++i];
    } else if (args[i] === '--concept' && i + 1 < args.length) {
      concept = args[++i];
    } else if (args[i] === '--model' && i + 1 < args.length) {
      model = args[++i];
    } else if (args[i] === '--art-direction' && i + 1 < args.length) {
      artDirectionPath = args[++i];
    }
  }

  if (refPaths.length === 0 || !concept) {
    console.error(
      'Usage: inspect.ts --refs <img1> [img2 ...] --concept "slide concept" [--prompt "prompt text"] [--model model-name] [--art-direction path]',
    );
    process.exit(1);
  }

  return { refPaths, prompt, concept, model, artDirectionPath };
}

// --- Load art direction ---

function loadArtDirection(artDirectionPath: string): string {
  if (!artDirectionPath) return '';
  if (!fs.existsSync(artDirectionPath)) {
    console.warn(`[warn] Art direction file not found: ${artDirectionPath}`);
    return '';
  }
  return fs.readFileSync(artDirectionPath, 'utf-8');
}

// --- Inspection prompt ---

function buildInspectionPrompt(
  concept: string,
  prompt: string,
  refPaths: string[],
  artDirection: string,
): string {
  const refList = refPaths.map((p, i) => `  ${i + 1}. ${path.basename(p)}`).join('\n');

  const artStyleSection = artDirection
    ? `## Art Style Requirements (from art-direction.md)\n${artDirection}`
    : `## Art Style Requirements
- Evaluate based on the slide concept and provided references
- Check for style consistency across reference images
- Verify mood and lighting match the intended atmosphere`;

  return `You are a visual art director evaluating reference images for an Instagram webtoon slide.
Your job is to evaluate whether the provided reference images are suitable for composing the following slide.

## Slide Concept
${concept}

${prompt ? `## Image Generation Prompt\n${prompt}\n` : ''}
## Reference Images Provided
${refList}

${artStyleSection}

## Evaluation Criteria
For each reference image, evaluate:
1. **Style match**: Does it match the project's art style?
2. **Content relevance**: Does it contain the right elements (correct scene, correct pose, correct object)?
3. **Mood/lighting match**: Does the lighting and atmosphere fit the slide's emotional tone?
4. **Consistency**: Will this ref maintain visual consistency with the series?

## Required Output Format (JSON only)
Respond with ONLY a JSON object, no markdown fencing:
{
  "verdict": "PASS" or "FAIL",
  "score": 1-10,
  "issues": ["list of specific problems found, empty if PASS"],
  "suggestions": ["actionable suggestions to fix issues, empty if PASS"],
  "missing_assets": ["list of assets that should be newly generated, empty if all refs are sufficient"]
}`;
}

// --- Main ---

async function main() {
  const args = parseArgs();
  const ai = new GoogleGenAI({ apiKey: requireGeminiApiKey() });

  const refImages = loadRefImages(args.refPaths);
  if (refImages.length === 0) {
    console.error('No valid reference images found');
    process.exit(1);
  }

  console.log(`\n[inspect] Evaluating ${refImages.length} ref(s) against slide concept`);
  console.log(`[model] ${args.model}`);
  console.log(`[concept] ${args.concept}`);
  refImages.forEach((r) => console.log(`[ref] ${r.path}`));

  const artDirection = loadArtDirection(args.artDirectionPath);
  if (artDirection) {
    console.log(`[art-direction] ${args.artDirectionPath}`);
  }

  const inspectionPrompt = buildInspectionPrompt(
    args.concept,
    args.prompt,
    args.refPaths,
    artDirection,
  );

  const parts: Array<Record<string, unknown>> = [];
  for (const ref of refImages) {
    parts.push({
      inlineData: {
        mimeType: ref.mimeType,
        data: ref.base64,
      },
    });
  }
  parts.push({ text: inspectionPrompt });

  const response = await withRetry(async () => {
    const result = await ai.models.generateContent({
      model: args.model,
      contents: [{ role: 'user', parts }],
    });
    return result;
  });

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    console.error('Empty response from API');
    process.exit(1);
  }

  // Parse JSON from response
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result: InspectionResult = JSON.parse(cleaned);

    console.log(`\n--- Inspection Result ---`);
    console.log(`Verdict: ${result.verdict}`);
    console.log(`Score: ${result.score}/10`);

    if (result.issues && result.issues.length > 0) {
      console.log(`\nIssues:`);
      result.issues.forEach((issue: string) => console.log(`  - ${issue}`));
    }

    if (result.suggestions && result.suggestions.length > 0) {
      console.log(`\nSuggestions:`);
      result.suggestions.forEach((s: string) => console.log(`  - ${s}`));
    }

    if (result.missing_assets && result.missing_assets.length > 0) {
      console.log(`\nMissing assets to generate:`);
      result.missing_assets.forEach((a: string) => console.log(`  - ${a}`));
    }

    // Output JSON for programmatic use
    console.log(`\n--- JSON ---`);
    console.log(JSON.stringify(result, null, 2));

    // Exit with non-zero if FAIL
    if (result.verdict === 'FAIL') {
      process.exit(1);
    }
  } catch {
    console.error('Failed to parse inspection result:');
    console.log(text);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
