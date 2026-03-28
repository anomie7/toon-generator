import { z } from 'zod';

// --- Conti ---

export interface SlideConti {
  slideNumber: number;
  scene: string;
  text: string;
  direction: string;
}

export interface EpisodeConti {
  episode: number;
  title: string;
  slides: SlideConti[];
}

// --- Image Prompt (core schema for generation pipeline) ---

export const ImagePromptSchema = z.object({
  slideNumber: z.number(),
  prompt: z.string(),
  textOverlay: z.string(),
  episodeTitle: z.string().optional(),
  textPosition: z.enum(['top', 'bottom']).default('bottom'),
  aspectRatio: z.string().default('4:5'),
  colorMood: z.string(),
});

export const EpisodePromptsSchema = z.object({
  episode: z.number(),
  title: z.string(),
  stylePrefix: z.string(),
  characterPrefix: z.string(),
  supportingCharacterPrefix: z.string().optional(),
  toneReference: z.string().optional(),
  prompts: z.array(ImagePromptSchema),
});

export type ImagePrompt = z.infer<typeof ImagePromptSchema>;
export type EpisodePrompts = z.infer<typeof EpisodePromptsSchema>;

// --- Generation Result ---

export interface GenerationResult {
  episode: number;
  slideNumber: number;
  outputPath: string;
  success: boolean;
  error?: string;
}

// --- Inspection Result ---

export interface InspectionResult {
  verdict: 'PASS' | 'FAIL';
  score: number;
  issues: string[];
  suggestions: string[];
  missing_assets: string[];
}
