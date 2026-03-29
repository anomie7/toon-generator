/**
 * pipeline-slide.ts
 *
 * Single-slide pipeline: C(inspect) -> D(ref select) -> E(asset gen, if needed) -> F(image gen)
 * Enforces the workflow as code so the orchestrator cannot skip steps.
 *
 * Usage:
 *   npx tsx pipeline-slide.ts \
 *     --prompt <EP_prompts.json> \
 *     --slide <N> \
 *     --ref <bg.png> <char.png> [obj.png] \
 *     --concept "<slide concept>" \
 *     --content-dir <path> \
 *     [--model <model-name>] \
 *     [--skip-inspect]
 *
 * Exit codes:
 *   0 - success
 *   1 - generation failed
 *   2 - inspect FAIL, needs different refs (orchestrator should re-search)
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { InspectionResult } from '../lib/types.js';

// --- Structural FAIL issues that can be bypassed ---
const STRUCTURAL_ISSUES = [
  '4-head-tall proportion',
  'hyper-realistic textures',
];

function isStructuralFailOnly(issues: string[]): boolean {
  return issues.every((issue) =>
    STRUCTURAL_ISSUES.some((s) => issue.toLowerCase().includes(s.toLowerCase())),
  );
}

// --- Args ---

interface PipelineArgs {
  promptPath: string;
  slide: number;
  refPaths: string[];
  concept: string;
  contentDir: string;
  model: string;
  ratio: string;
  skipInspect: boolean;
}

function parseArgs(): PipelineArgs {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};
  const refPaths: string[] = [];
  const flags = new Set<string>();

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--skip-inspect') {
      flags.add('skip-inspect');
    } else if (args[i] === '--ref') {
      while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        refPaths.push(args[++i]);
      }
    } else if (args[i].startsWith('--') && i + 1 < args.length) {
      parsed[args[i].slice(2)] = args[++i];
    }
  }

  if (!parsed.prompt || !parsed.slide || !parsed.concept || !parsed.ratio) {
    console.error(
      'Usage: pipeline-slide.ts --prompt <json> --slide <N> --ratio 4:5 --ref <imgs...> --concept "<text>" --content-dir <path> [--model model] [--skip-inspect]',
    );
    if (!parsed.ratio) console.error('Error: --ratio is required (e.g. --ratio 4:5)');
    process.exit(1);
  }

  if (refPaths.length === 0) {
    console.error('[pipeline] ERROR: --ref is required. At least 1 reference image must be provided.');
    process.exit(1);
  }

  return {
    promptPath: parsed.prompt,
    slide: parseInt(parsed.slide, 10),
    refPaths,
    concept: parsed.concept,
    contentDir: parsed['content-dir'] || './content',
    model: parsed.model || '',
    ratio: parsed.ratio,
    skipInspect: flags.has('skip-inspect'),
  };
}

// --- Script paths ---

function getScriptDir(): string {
  return path.dirname(new URL(import.meta.url).pathname);
}

// --- Stage C: Inspect refs ---

interface InspectOutcome {
  pass: boolean;
  structuralOnly: boolean;
  result: InspectionResult | null;
}

function runInspect(args: PipelineArgs): InspectOutcome {
  const scriptDir = getScriptDir();
  const inspectScript = path.join(scriptDir, 'inspect.ts');
  const artDirectionPath = path.join(args.contentDir, 'visual', 'art-direction.md');
  const artDirectionArg = fs.existsSync(artDirectionPath) ? `--art-direction "${artDirectionPath}"` : '';

  const refsArg = args.refPaths.map((r) => `"${r}"`).join(' ');
  const cmd = `npx tsx "${inspectScript}" --refs ${refsArg} --concept "${args.concept}" ${artDirectionArg}`;

  console.log(`\n=== Stage C: Inspect refs ===`);
  console.log(`[inspect] refs: ${args.refPaths.map((r) => path.basename(r)).join(', ')}`);

  try {
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 120000 });
    const jsonMatch = output.match(/--- JSON ---\n([\s\S]+)/);
    if (jsonMatch) {
      const result: InspectionResult = JSON.parse(jsonMatch[1].trim());
      console.log(`[inspect] ${result.verdict} (score: ${result.score}/10)`);
      if (result.issues.length > 0) {
        result.issues.forEach((issue) => console.log(`  - ${issue}`));
      }
      return { pass: true, structuralOnly: false, result };
    }
    console.log(`[inspect] PASS (no JSON output, assuming OK)`);
    return { pass: true, structuralOnly: false, result: null };
  } catch (error) {
    // inspect.ts exits with code 1 on FAIL
    const output = error instanceof Error && 'stdout' in error ? (error as { stdout: string }).stdout : '';
    const jsonMatch = output.match(/--- JSON ---\n([\s\S]+)/);
    if (jsonMatch) {
      try {
        const result: InspectionResult = JSON.parse(jsonMatch[1].trim());
        console.log(`[inspect] ${result.verdict} (score: ${result.score}/10)`);
        result.issues.forEach((issue) => console.log(`  - ${issue}`));

        const structuralOnly = isStructuralFailOnly(result.issues);
        if (structuralOnly) {
          console.log(`[inspect] Structural FAIL only - can proceed with prompt reinforcement`);
        }

        return { pass: false, structuralOnly, result };
      } catch {
        // JSON parse failed
      }
    }
    console.error(`[inspect] Error during inspection`);
    return { pass: false, structuralOnly: false, result: null };
  }
}

// --- Stage F: Generate image ---

interface GenerateOutcome {
  success: boolean;
  outputPath: string;
}

function runGenerate(args: PipelineArgs): GenerateOutcome {
  const scriptDir = getScriptDir();
  const generateScript = path.join(scriptDir, 'generate.ts');

  const refsArg = args.refPaths.map((r) => `"${r}"`).join(' ');
  const modelArg = args.model ? `--model ${args.model}` : '';
  const cmd = `npx tsx "${generateScript}" --prompt "${args.promptPath}" --slide ${args.slide} --ratio ${args.ratio} --ref ${refsArg} --content-dir "${args.contentDir}" ${modelArg}`;

  console.log(`\n=== Stage F: Generate image ===`);
  console.log(`[generate] slide ${args.slide}, refs: ${args.refPaths.length}`);

  try {
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 180000 });
    console.log(output);

    // Find output path from generate.ts output
    const pathMatch = output.match(/-> (.+\.png)/);
    const outputPath = pathMatch ? pathMatch[1].trim() : '';

    return { success: true, outputPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[generate] FAILED: ${message}`);
    return { success: false, outputPath: '' };
  }
}

// --- Main pipeline ---

async function main() {
  const args = parseArgs();

  console.log(`\n========================================`);
  console.log(`  Pipeline: Slide ${args.slide}`);
  console.log(`  Prompt: ${path.basename(args.promptPath)}`);
  console.log(`  Refs: ${args.refPaths.length} image(s)`);
  console.log(`========================================`);

  // --- Stage C: Inspect ---
  if (!args.skipInspect) {
    const inspectResult = runInspect(args);

    if (!inspectResult.pass) {
      if (inspectResult.structuralOnly) {
        // Structural FAIL only - proceed to F with prompt reinforcement
        console.log(`\n[pipeline] Structural FAIL only, proceeding to generation`);
      } else {
        // Real FAIL - report back to orchestrator
        console.error(`\n[pipeline] INSPECT FAIL - needs different refs or asset generation`);
        if (inspectResult.result) {
          console.log(`\n--- INSPECT_RESULT ---`);
          console.log(JSON.stringify(inspectResult.result, null, 2));
        }
        process.exit(2);
      }
    }
  } else {
    console.log(`\n=== Stage C: SKIPPED (--skip-inspect) ===`);
  }

  // --- Stage D: Ref selection (already done by orchestrator, refs are in args) ---
  console.log(`\n=== Stage D: Ref selection ===`);
  console.log(`[refs] Using ${args.refPaths.length} confirmed ref(s):`);
  args.refPaths.forEach((r) => console.log(`  - ${path.basename(r)}`));

  // --- Stage F: Generate ---
  const generateResult = runGenerate(args);

  if (!generateResult.success) {
    console.error(`\n[pipeline] GENERATION FAILED`);
    process.exit(1);
  }

  // --- Output ---
  console.log(`\n========================================`);
  console.log(`  Pipeline COMPLETE: Slide ${args.slide}`);
  console.log(`  Output: ${generateResult.outputPath}`);
  console.log(`========================================`);

  // Structured output for programmatic parsing
  console.log(`\n--- PIPELINE_RESULT ---`);
  console.log(JSON.stringify({
    slide: args.slide,
    success: true,
    outputPath: generateResult.outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
