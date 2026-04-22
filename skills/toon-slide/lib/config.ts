import { z } from 'zod';

const envSchema = z.object({
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
});

export const config = envSchema.parse({
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
});

// --- Supported models (central registry) ---

export const models = {
  imageFlash: 'gemini-3.1-flash-image-preview',
  imagePro: 'gemini-3-pro-image-preview',
  textPro: 'gemini-3.1-pro-preview',
  openaiImage2: 'gpt-image-2',
} as const;

export type GeminiImageModel = typeof models.imageFlash | typeof models.imagePro;
export type OpenAIImageModel = typeof models.openaiImage2;
export type ImageModel = GeminiImageModel | OpenAIImageModel;

export function isGeminiImageModel(model: string): model is GeminiImageModel {
  return model === models.imageFlash || model === models.imagePro;
}

export function isOpenAIImageModel(model: string): model is OpenAIImageModel {
  return model === models.openaiImage2;
}

export function isValidImageModel(model: string): model is ImageModel {
  return isGeminiImageModel(model) || isOpenAIImageModel(model);
}

export function resolveImageModel(model: string): ImageModel {
  const normalized = model.trim().toLowerCase();
  if (normalized === 'gpt-image2' || normalized === 'gpt-image-2') {
    return models.openaiImage2;
  }
  if (isValidImageModel(normalized)) {
    return normalized;
  }
  if (isValidImageModel(model)) {
    return model;
  }
  throw new Error(`Unknown image model: ${model}`);
}

export function imageProvider(model: string): 'gemini' | 'openai' {
  const resolved = resolveImageModel(model);
  if (isGeminiImageModel(resolved)) return 'gemini';
  if (isOpenAIImageModel(resolved)) return 'openai';
  throw new Error(`Unknown image model: ${model}`);
}

export function validateModel(model: string): void {
  try {
    resolveImageModel(model);
  } catch {
    console.error(
      `Unknown model: "${model}"\n` +
      `Supported image models:\n` +
      `  - ${models.imageFlash} (Flash - fast, cheap)\n` +
      `  - ${models.imagePro} (Pro - best Korean text)\n` +
      `  - ${models.openaiImage2} (OpenAI GPT Image 2)`,
    );
    process.exit(1);
  }
}

export function requireGeminiApiKey(): string {
  if (!config.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is required for Gemini models and image inspection.');
    process.exit(1);
  }
  return config.GEMINI_API_KEY;
}

export function requireOpenAIApiKey(): string {
  if (!config.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is required for OpenAI image models such as gpt-image-2.');
    process.exit(1);
  }
  return config.OPENAI_API_KEY;
}
