import { z } from 'zod';

const envSchema = z.object({
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
});

export const config = envSchema.parse({
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
});

// --- Supported models (central registry) ---

export const models = {
  imageFlash: 'gemini-3.1-flash-image-preview',
  imagePro: 'gemini-3-pro-image-preview',
  textPro: 'gemini-3.1-pro-preview',
} as const;

export type ImageModel = typeof models.imageFlash | typeof models.imagePro;

export function isValidImageModel(model: string): model is ImageModel {
  return model === models.imageFlash || model === models.imagePro;
}

export function validateModel(model: string): void {
  if (!isValidImageModel(model)) {
    console.error(
      `Unknown model: "${model}"\n` +
      `Supported image models:\n` +
      `  - ${models.imageFlash} (Flash - fast, cheap)\n` +
      `  - ${models.imagePro} (Pro - best Korean text)`,
    );
    process.exit(1);
  }
}
