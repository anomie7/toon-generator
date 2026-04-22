import { GoogleGenAI } from '@google/genai';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { config, models, validateModel } from '../lib/config.js';
import {
  EpisodePromptsSchema,
  type EpisodePrompts,
  type ImagePrompt,
} from '../lib/types.js';
import {
  type RefImage,
  loadRefImages,
  withRetry,
  toSlug,
  stripDuplicatePrefix,
  saveMetadata,
  readImageDimensions,
  checkAspectRatio,
} from '../lib/image-utils.js';

// --- Args ---

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};
  const flags = new Set<string>();
  const refPaths: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--fix') {
      flags.add('fix');
    } else if (args[i] === '--auto-inspect') {
      flags.add('auto-inspect');
    } else if (args[i] === '--ref') {
      while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        refPaths.push(args[++i]);
      }
    } else if (args[i].startsWith('--') && i + 1 < args.length) {
      parsed[args[i].slice(2)] = args[++i];
    }
  }

  if (!parsed.prompt || !parsed.ratio) {
    console.error(
      'Usage: generate.ts --prompt <json-path> --ratio 4:5 [--slide N] [--model model-name] [--ref img1 img2 ...] [--output-dir path] [--content-dir path] [--auto-inspect]\n' +
      '       generate.ts --prompt <json-path> --ratio 4:5 --slide N --fix [--variants N] [--model model-name]',
    );
    if (!parsed.ratio) console.error('Error: --ratio is required (e.g. --ratio 4:5)');
    process.exit(1);
  }

  const fix = flags.has('fix');
  if (fix && !parsed.slide) {
    console.error('--fix requires --slide N');
    process.exit(1);
  }

  return {
    promptPath: parsed.prompt,
    slide: parsed.slide ? parseInt(parsed.slide, 10) : undefined,
    model: parsed.model || '',  // empty = auto-select based on textOverlay
    refPaths,
    fix,
    autoInspect: flags.has('auto-inspect'),
    variants: parsed.variants ? parseInt(parsed.variants, 10) : 1,
    outputDir: parsed['output-dir'] || '',
    contentDir: parsed['content-dir'] || './content',
    ratio: parsed.ratio,
  };
}

// --- Model selection ---

function selectModel(explicitModel: string, prompt: ImagePrompt): string {
  if (explicitModel) {
    validateModel(explicitModel);
    return explicitModel;
  }
  // textOverlay or episodeTitle present -> Pro (better Korean text rendering)
  if (prompt.textOverlay || prompt.episodeTitle) return models.imagePro;
  // No text -> Flash (faster, cheaper)
  return models.imageFlash;
}

// --- Image generation ---

async function generateImage(
  ai: GoogleGenAI,
  model: string,
  prompt: ImagePrompt,
  stylePrefix: string,
  characterPrefix: string,
  refImages: RefImage[],
  ratioOverride: string,
): Promise<string> {
  const episodeTitleInstruction = (prompt.episodeTitle && prompt.slideNumber === 1)
    ? `\n\nInclude the text "${prompt.episodeTitle}" in small sans-serif font at the top-left corner of the image.`
    : '';

  const textInstruction = prompt.textOverlay
    ? `\n\nRender the following Korean text in the image at the ${prompt.textPosition || 'bottom'} area. Use clean sans-serif font: "${prompt.textOverlay}"`
    : '';

  const fullPrompt = `${stylePrefix} ${characterPrefix} ${prompt.prompt}${episodeTitleInstruction}${textInstruction}`;

  const parts: Array<Record<string, unknown>> = [];

  if (refImages.length > 0) {
    for (const ref of refImages) {
      parts.push({
        inlineData: {
          mimeType: ref.mimeType,
          data: ref.base64,
        },
      });
    }
    const refDesc = refImages.length === 1
      ? 'the provided reference image'
      : `the ${refImages.length} provided reference images`;
    parts.push({
      text: `Use ${refDesc} for character, background, and style consistency. Do NOT copy text or titles from reference images. Generate a new illustration based on the following description:\n\n${fullPrompt}`,
    });
  } else {
    parts.push({ text: fullPrompt });
  }

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: {
      responseModalities: ['IMAGE'],
      aspectRatio: ratioOverride,
    } as Record<string, unknown>,
  });

  const responseParts = response.candidates?.[0]?.content?.parts;
  if (!responseParts) throw new Error('Image generation failed: empty response');

  for (const part of responseParts) {
    if (part.inlineData) {
      return part.inlineData.data as string;
    }
  }

  throw new Error('Image generation failed: no inlineData found');
}

// --- Main ---

async function main() {
  const args = parseArgs();
  const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });

  // Load prompts
  const rawJson = fs.readFileSync(args.promptPath, 'utf-8');
  const episodePrompts: EpisodePrompts = EpisodePromptsSchema.parse(JSON.parse(rawJson));

  // Filter slides
  const slidesToGenerate = args.slide
    ? episodePrompts.prompts.filter((p) => p.slideNumber === args.slide)
    : episodePrompts.prompts;

  if (slidesToGenerate.length === 0) {
    console.error(`Slide ${args.slide} not found`);
    process.exit(1);
  }

  // Output directory
  const epDir = args.outputDir || path.join('output', `EP${episodePrompts.episode}`);
  fs.mkdirSync(epDir, { recursive: true });

  // Load reference images
  let refImages: RefImage[] = [];
  let refSources: string[] = [];

  // File name prefix: use directory basename when --output-dir is set, otherwise EP{N}
  const filePrefix = args.outputDir ? path.basename(epDir) : `EP${episodePrompts.episode}`;

  if (args.fix) {
    const slug = toSlug(args.slide!);
    const existingFile = path.join(epDir, `${filePrefix}_S${String(args.slide).padStart(2, '0')}_${slug}.png`);
    if (fs.existsSync(existingFile)) {
      refImages = loadRefImages([existingFile]);
      refSources = [existingFile];
    } else {
      console.warn(`[fix] No existing image found at ${existingFile}, generating without reference`);
    }
  } else if (args.refPaths.length > 0) {
    refImages = loadRefImages(args.refPaths);
    refSources = refImages.map((r) => r.path);
  } else if (episodePrompts.toneReference && fs.existsSync(episodePrompts.toneReference)) {
    refImages = loadRefImages([episodePrompts.toneReference]);
    refSources = [episodePrompts.toneReference];
    console.log(`[tone ref] ${episodePrompts.toneReference}`);
  }

  const variantCount = args.variants;
  const modeLabel = args.fix ? `fix (${variantCount} variants)` : 'generate';

  const modelMode = args.model ? `fixed: ${args.model}` : 'auto (Flash/Pro by textOverlay)';

  console.log(`\n[EP${episodePrompts.episode}] "${episodePrompts.title}" - ${slidesToGenerate.length} slides`);
  console.log(`[model] ${modelMode}`);
  console.log(`[refs] ${refSources.length > 0 ? refSources.join(', ') : 'none'}`);
  console.log(`[mode] ${modeLabel}\n`);

  // Generate
  const results: Array<{ slide: number; path: string; success: boolean; error?: string }> = [];

  for (const prompt of slidesToGenerate) {
    const slug = toSlug(prompt.slideNumber);

    for (let v = 0; v < variantCount; v++) {
      const variantSuffix = variantCount > 1 ? `_v${v + 1}` : '';
      const fixLabel = args.fix ? '_fix' : '';
      const fileName = `${filePrefix}_S${String(prompt.slideNumber).padStart(2, '0')}_${slug}${fixLabel}${variantSuffix}.png`;
      const outputPath = path.join(epDir, fileName);

      const slideModel = selectModel(args.model, prompt);

      console.log(`[${prompt.slideNumber}/${slidesToGenerate.length}${variantCount > 1 ? ` v${v + 1}` : ''}] Generating: ${fileName}`);
      console.log(`  model: ${slideModel}${!args.model ? (prompt.textOverlay ? ' (auto: text)' : ' (auto: no-text)') : ''}`);
      console.log(`  mood: ${prompt.colorMood}`);

      try {
        const cleanedPrompt = {
          ...prompt,
          prompt: stripDuplicatePrefix(
            stripDuplicatePrefix(prompt.prompt, episodePrompts.stylePrefix),
            episodePrompts.characterPrefix,
          ),
        };

        const effectiveRatio = args.ratio;
        const maxDimensionRetries = 2;

        for (let dimAttempt = 0; dimAttempt <= maxDimensionRetries; dimAttempt++) {
          const imageBase64 = await withRetry(() =>
            generateImage(
              ai,
              slideModel,
              cleanedPrompt,
              episodePrompts.stylePrefix,
              episodePrompts.characterPrefix,
              refImages,
              args.ratio,
            ),
          );

          fs.writeFileSync(outputPath, Buffer.from(imageBase64, 'base64'));
          const dims = readImageDimensions(outputPath);
          const ratioOk = checkAspectRatio(dims, effectiveRatio);

          if (ratioOk) {
            console.log(`  dimension: ${dims.width}x${dims.height} (${effectiveRatio} OK)`);
            break;
          }

          if (dimAttempt < maxDimensionRetries) {
            console.warn(`  dimension: ${dims.width}x${dims.height} (expected ${effectiveRatio}, retry ${dimAttempt + 1}/${maxDimensionRetries})`);
          } else {
            console.warn(`  dimension: ${dims.width}x${dims.height} (expected ${effectiveRatio}, max retries reached - keeping last result)`);
          }
        }

        saveMetadata(outputPath, {
          slide: prompt.slideNumber,
          model: slideModel,
          refs: refSources,
          toneReference: episodePrompts.toneReference || null,
          fix: args.fix,
          variant: v + 1,
          timestamp: new Date().toISOString(),
          promptLength: cleanedPrompt.prompt.length,
        });
        console.log(`  -> ${outputPath}`);
        results.push({ slide: prompt.slideNumber, path: outputPath, success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`  FAILED: ${message}`);
        results.push({ slide: prompt.slideNumber, path: outputPath, success: false, error: message });
      }
    }
  }

  // Auto-inspect generated images
  if (args.autoInspect) {
    const successResults = results.filter((r) => r.success);
    if (successResults.length > 0) {
      console.log(`\n--- Auto-Inspect ---`);
      const scriptDir = path.dirname(new URL(import.meta.url).pathname);
      const inspectScript = path.join(scriptDir, 'inspect.ts');
      const artDirectionPath = path.join(args.contentDir, 'visual', 'art-direction.md');
      const artDirectionArg = fs.existsSync(artDirectionPath) ? `--art-direction "${artDirectionPath}"` : '';

      for (const result of successResults) {
        const slidePrompt = slidesToGenerate.find((p) => p.slideNumber === result.slide);
        const concept = slidePrompt?.colorMood || 'slide scene';
        const promptText = slidePrompt?.prompt || '';

        console.log(`[inspect] ${path.basename(result.path)}`);
        try {
          const output = execSync(
            `node --import tsx "${inspectScript}" --refs "${result.path}" --concept "${concept}" --prompt "${promptText.slice(0, 200)}" ${artDirectionArg}`,
            { encoding: 'utf-8', timeout: 60000 },
          );
          const jsonMatch = output.match(/--- JSON ---\n([\s\S]+)/);
          if (jsonMatch) {
            const inspection = JSON.parse(jsonMatch[1].trim());
            console.log(`  ${inspection.verdict} (score: ${inspection.score}/10)`);
            if (inspection.issues?.length > 0) {
              inspection.issues.forEach((issue: string) => console.log(`  - ${issue}`));
            }
          }
        } catch {
          console.log(`  [inspect] FAIL or timeout - manual review recommended`);
        }
      }
    }
  }

  // Summary
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  console.log(`\n--- Results ---`);
  console.log(`OK: ${succeeded}, FAILED: ${failed}, TOTAL: ${results.length}`);

  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
