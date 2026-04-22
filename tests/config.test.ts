import { describe, expect, it } from 'vitest';
import { imageProvider, models, resolveImageModel } from '../skills/toon-slide/lib/config.js';

describe('image model config', () => {
  it('resolves OpenAI image model aliases', () => {
    expect(resolveImageModel('gpt-image-2')).toBe(models.openaiImage2);
    expect(resolveImageModel('GPT-image2')).toBe(models.openaiImage2);
  });

  it('detects the OpenAI provider', () => {
    expect(imageProvider('gpt-image-2')).toBe('openai');
  });

  it('detects the Gemini provider', () => {
    expect(imageProvider(models.imageFlash)).toBe('gemini');
  });
});
