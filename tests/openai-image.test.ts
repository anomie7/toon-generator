import { describe, expect, it } from 'vitest';
import { openAIImageSizeFromRatio } from '../skills/toon-slide/lib/openai-image.js';

describe('openAIImageSizeFromRatio', () => {
  it('maps 4:5 to a valid portrait size', () => {
    expect(openAIImageSizeFromRatio('4:5')).toBe('1024x1280');
  });

  it('maps 16:9 to a valid landscape size', () => {
    expect(openAIImageSizeFromRatio('16:9')).toBe('1824x1024');
  });

  it('maps square ratios to 1024 square', () => {
    expect(openAIImageSizeFromRatio('1:1')).toBe('1024x1024');
  });

  it('falls back to auto for invalid ratios', () => {
    expect(openAIImageSizeFromRatio('bad')).toBe('auto');
  });
});
