import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import { config, models } from '../../toon-slide/lib/config.js';
import { withRetry } from '../../toon-slide/lib/image-utils.js';

// --- Types ---

interface RefSpec {
  name: string;
  fileName: string;
  prompt: string;
  category: 'character' | 'background' | 'tone-master';
}

// --- Args ---

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};
  const categories = new Set<string>();

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--category') {
      while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        categories.add(args[++i]);
      }
    } else if (args[i].startsWith('--') && i + 1 < args.length) {
      parsed[args[i].slice(2)] = args[++i];
    }
  }

  if (!parsed['content-dir']) {
    console.error(
      'Usage: generate-refs.ts --content-dir <path> [--output-dir <path>] [--model <model>] [--category character background tone-master]\n\n' +
      'Reads art-direction.md and character-sheet-detailed.md from content-dir,\n' +
      'then generates reference images (character sheets, backgrounds, tone masters).\n\n' +
      'Options:\n' +
      '  --content-dir   Path to content directory (required)\n' +
      '  --output-dir    Output directory (default: <content-dir>/visual/references)\n' +
      '  --model         Gemini model (default: gemini-3.1-flash-image-preview)\n' +
      '  --category      Filter categories: character, background, tone-master (default: all)',
    );
    process.exit(1);
  }

  return {
    contentDir: parsed['content-dir'],
    outputDir: parsed['output-dir'] || '',
    model: parsed.model || models.imageFlash,
    categories: categories.size > 0 ? categories : new Set(['character', 'background', 'tone-master']),
  };
}

// --- Read content documents ---

function readContentFile(contentDir: string, ...segments: string[]): string | null {
  const filePath = path.join(contentDir, ...segments);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8');
  }
  return null;
}

// --- Build reference specs from content ---

function buildRefSpecs(
  artDirection: string,
  characterDetail: string,
  characterSheet: string | null,
  categories: Set<string>,
): RefSpec[] {
  const specs: RefSpec[] = [];

  if (categories.has('character')) {
    // Full-body character sheet
    specs.push({
      name: 'Full Body Character Sheet',
      fileName: 'character/full-body.png',
      category: 'character',
      prompt: buildCharacterPrompt(artDirection, characterDetail, characterSheet, 'full-body'),
    });

    // Expression sheet
    specs.push({
      name: 'Expression Sheet',
      fileName: 'character/expressions.png',
      category: 'character',
      prompt: buildCharacterPrompt(artDirection, characterDetail, characterSheet, 'expressions'),
    });

    // Indoor pose (home setting)
    specs.push({
      name: 'Indoor Pose - Home',
      fileName: 'character/full-body-home.png',
      category: 'character',
      prompt: buildCharacterPrompt(artDirection, characterDetail, characterSheet, 'indoor-home'),
    });
  }

  if (categories.has('background')) {
    specs.push({
      name: 'Main Location Background',
      fileName: 'scenes/main-location.png',
      category: 'background',
      prompt: buildBackgroundPrompt(artDirection, 'main'),
    });

    specs.push({
      name: 'Secondary Location Background',
      fileName: 'scenes/secondary-location.png',
      category: 'background',
      prompt: buildBackgroundPrompt(artDirection, 'secondary'),
    });
  }

  if (categories.has('tone-master')) {
    specs.push({
      name: 'Tone Master - Key Visual',
      fileName: 'tone-masters/key-visual.png',
      category: 'tone-master',
      prompt: buildToneMasterPrompt(artDirection, characterDetail, 'key-visual'),
    });

    specs.push({
      name: 'Tone Master - Mood Sample',
      fileName: 'tone-masters/mood-sample.png',
      category: 'tone-master',
      prompt: buildToneMasterPrompt(artDirection, characterDetail, 'mood-sample'),
    });
  }

  return specs;
}

// --- Prompt builders ---

function buildCharacterPrompt(
  artDirection: string,
  characterDetail: string,
  characterSheet: string | null,
  variant: 'full-body' | 'expressions' | 'indoor-home',
): string {
  const styleSection = extractSection(artDirection, 'style', 'character');
  const characterInfo = characterSheet
    ? `Character info:\n${characterSheet}\n\n`
    : '';

  const base = `${styleSection}\n\n${characterInfo}Detailed character design:\n${characterDetail}`;

  switch (variant) {
    case 'full-body':
      return `Create a CHARACTER DESIGN REFERENCE SHEET showing a full-body front view of the main character on a plain white background. ` +
        `The character should be standing in a neutral pose, clearly showing their complete outfit, hairstyle, and proportions. ` +
        `Include clean linework suitable for animation/illustration reference. ` +
        `4:5 aspect ratio.\n\n${base}`;

    case 'expressions':
      return `Create an EXPRESSION SHEET showing the main character's face in 6-8 different emotions: neutral, happy, sad, surprised, tired, thoughtful, embarrassed, determined. ` +
        `Arrange in a grid layout on a plain white background. Each expression should be a bust/head shot clearly showing the emotion. ` +
        `Consistent art style across all expressions. 4:5 aspect ratio.\n\n${base}`;

    case 'indoor-home':
      return `Create a CHARACTER REFERENCE showing the main character in a relaxed indoor home setting. ` +
        `The character should be in comfortable home clothes (pajamas, loungewear), sitting or lying on a bed/couch. ` +
        `Show full body with natural, relaxed posture. Plain or minimal background. 4:5 aspect ratio.\n\n${base}`;
  }
}

function buildBackgroundPrompt(artDirection: string, variant: 'main' | 'secondary'): string {
  const bgSection = extractSection(artDirection, 'background', 'scene');

  switch (variant) {
    case 'main':
      return `Create a BACKGROUND REFERENCE IMAGE of the main location described in the art direction. ` +
        `Hyper-realistic textures and lighting. No characters or text in the image. ` +
        `This will be used as a background reference for webtoon/comic illustration. 4:5 aspect ratio.\n\n${bgSection}`;

    case 'secondary':
      return `Create a BACKGROUND REFERENCE IMAGE of a secondary/outdoor location described in the art direction. ` +
        `Hyper-realistic textures and natural lighting. No characters or text in the image. ` +
        `This will be used as a background reference for webtoon/comic illustration. 4:5 aspect ratio.\n\n${bgSection}`;
  }
}

function buildToneMasterPrompt(
  artDirection: string,
  characterDetail: string,
  variant: 'key-visual' | 'mood-sample',
): string {
  const styleSection = extractSection(artDirection, 'style', 'tone', 'mood');

  switch (variant) {
    case 'key-visual':
      return `Create a KEY VISUAL / TONE MASTER image that represents the overall visual style and mood of this webtoon series. ` +
        `Show the main character in a characteristic pose in the primary setting. ` +
        `This image defines the color palette, lighting style, line quality, and overall atmosphere. ` +
        `4:5 aspect ratio.\n\n${styleSection}\n\nCharacter:\n${characterDetail}`;

    case 'mood-sample':
      return `Create a MOOD/ATMOSPHERE SAMPLE image that represents the emotional tone of this webtoon series. ` +
        `Show the main character in a characteristic everyday setting that captures the series' core atmosphere. ` +
        `The mood, lighting, and color palette should match the art direction below. ` +
        `4:5 aspect ratio.\n\n${styleSection}\n\nCharacter:\n${characterDetail}`;
  }
}

// --- Extract relevant sections from markdown ---

function extractSection(markdown: string, ...keywords: string[]): string {
  const lines = markdown.split('\n');
  const sections: string[] = [];
  let capturing = false;
  let currentSection: string[] = [];
  let headerLevel = 0;

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headerMatch) {
      // Save previous section if capturing
      if (capturing && currentSection.length > 0) {
        sections.push(currentSection.join('\n'));
        currentSection = [];
      }

      const level = headerMatch[1].length;
      const title = headerMatch[2].toLowerCase();
      const isRelevant = keywords.some((kw) => title.includes(kw));

      if (isRelevant) {
        capturing = true;
        headerLevel = level;
        currentSection.push(line);
      } else if (capturing && level <= headerLevel) {
        capturing = false;
      }
    } else if (capturing) {
      currentSection.push(line);
    }
  }

  if (currentSection.length > 0) {
    sections.push(currentSection.join('\n'));
  }

  // If no sections found, return the full document (truncated)
  if (sections.length === 0) {
    return markdown.slice(0, 2000);
  }

  return sections.join('\n\n');
}

// --- Generate a single reference image ---

async function generateRefImage(
  ai: GoogleGenAI,
  model: string,
  spec: RefSpec,
): Promise<string> {
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: spec.prompt }] }],
    config: {
      responseModalities: ['IMAGE'],
      imageGenerationConfig: {
        aspectRatio: '4:5',
      },
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

  // Read content documents
  const artDirection = readContentFile(args.contentDir, 'visual', 'art-direction.md');
  if (!artDirection) {
    console.error(`[error] art-direction.md not found in ${args.contentDir}/visual/`);
    process.exit(1);
  }

  const characterDetail = readContentFile(args.contentDir, 'visual', 'character-sheet-detailed.md');
  if (!characterDetail) {
    console.error(`[error] character-sheet-detailed.md not found in ${args.contentDir}/visual/`);
    process.exit(1);
  }

  const characterSheet = readContentFile(args.contentDir, 'character-sheet.md');

  // Determine output directory
  const outputDir = args.outputDir || path.join(args.contentDir, 'visual', 'references');

  // Build specs
  const specs = buildRefSpecs(artDirection, characterDetail, characterSheet, args.categories);

  console.log(`\n[generate-refs] ${specs.length} reference images to generate`);
  console.log(`[model] ${args.model}`);
  console.log(`[content] ${args.contentDir}`);
  console.log(`[output] ${outputDir}\n`);

  // Generate
  const results: Array<{ name: string; path: string; success: boolean; error?: string }> = [];

  for (const spec of specs) {
    const outputPath = path.join(outputDir, spec.fileName);
    const outputSubDir = path.dirname(outputPath);
    fs.mkdirSync(outputSubDir, { recursive: true });

    console.log(`[${spec.category}] Generating: ${spec.name}`);
    console.log(`  -> ${spec.fileName}`);

    try {
      const imageBase64 = await withRetry(() => generateRefImage(ai, args.model, spec));

      fs.writeFileSync(outputPath, Buffer.from(imageBase64, 'base64'));

      // Save prompt metadata
      const metaPath = outputPath.replace(/\.png$/, '.meta.json');
      fs.writeFileSync(metaPath, JSON.stringify({
        name: spec.name,
        category: spec.category,
        model: args.model,
        promptLength: spec.prompt.length,
        timestamp: new Date().toISOString(),
      }, null, 2));

      console.log(`  OK`);
      results.push({ name: spec.name, path: outputPath, success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  FAILED: ${message}`);
      results.push({ name: spec.name, path: outputPath, success: false, error: message });
    }
  }

  // Summary
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  console.log(`\n--- Results ---`);
  console.log(`OK: ${succeeded}, FAILED: ${failed}, TOTAL: ${results.length}`);

  if (succeeded > 0) {
    console.log(`\nGenerated files:`);
    for (const r of results.filter((r) => r.success)) {
      console.log(`  ${r.path}`);
    }
  }

  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
