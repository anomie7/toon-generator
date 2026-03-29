import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
  readImageDimensions,
  checkAspectRatio,
  stripDuplicatePrefix,
  toSlug,
  detectMimeType,
} from '../skills/toon-slide/lib/image-utils.js';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');

describe('readImageDimensions', () => {
  it('reads 4:5 PNG dimensions correctly', () => {
    const dims = readImageDimensions(path.join(FIXTURES, 'test-4x5.png'));
    expect(dims.width).toBe(800);
    expect(dims.height).toBe(1000);
  });

  it('reads 16:9 PNG dimensions correctly', () => {
    const dims = readImageDimensions(path.join(FIXTURES, 'test-16x9.png'));
    expect(dims.width).toBe(1408);
    expect(dims.height).toBe(768);
  });

  it('reads square PNG dimensions correctly', () => {
    const dims = readImageDimensions(path.join(FIXTURES, 'test-square.png'));
    expect(dims.width).toBe(1000);
    expect(dims.height).toBe(1000);
  });

  it('reads 4:5 JPEG dimensions correctly', () => {
    const dims = readImageDimensions(path.join(FIXTURES, 'test-jpeg-4x5.jpg'));
    expect(dims.width).toBe(800);
    expect(dims.height).toBe(1000);
  });

  it('reads 16:9 JPEG dimensions correctly', () => {
    const dims = readImageDimensions(path.join(FIXTURES, 'test-jpeg-16x9.jpg'));
    expect(dims.width).toBe(1408);
    expect(dims.height).toBe(768);
  });

  it('reads JPEG saved as .png (format mismatch)', () => {
    // Simulate the real-world case: Gemini returns JPEG but saved as .png
    const dims = readImageDimensions(path.join(FIXTURES, 'test-jpeg-16x9.jpg'));
    expect(dims.width).toBe(1408);
    expect(dims.height).toBe(768);
  });
});

describe('checkAspectRatio', () => {
  it('passes for exact 4:5 ratio', () => {
    expect(checkAspectRatio({ width: 800, height: 1000 }, '4:5')).toBe(true);
  });

  it('passes for close-enough 4:5 ratio (within tolerance)', () => {
    expect(checkAspectRatio({ width: 928, height: 1152 }, '4:5')).toBe(true);
  });

  it('fails for 16:9 when expecting 4:5', () => {
    expect(checkAspectRatio({ width: 1408, height: 768 }, '4:5')).toBe(false);
  });

  it('fails for square when expecting 4:5', () => {
    expect(checkAspectRatio({ width: 1000, height: 1000 }, '4:5')).toBe(false);
  });

  it('passes for exact 16:9 ratio', () => {
    expect(checkAspectRatio({ width: 1920, height: 1080 }, '16:9')).toBe(true);
  });

  it('passes for 1:1 ratio', () => {
    expect(checkAspectRatio({ width: 1000, height: 1000 }, '1:1')).toBe(true);
  });
});

describe('stripDuplicatePrefix', () => {
  it('strips prefix when prompt starts with it', () => {
    const prefix = 'Watercolor style, soft tones.';
    const prompt = 'Watercolor style, soft tones. A man walks down the street.';
    expect(stripDuplicatePrefix(prompt, prefix)).toBe('A man walks down the street.');
  });

  it('returns prompt unchanged when no duplication', () => {
    const prefix = 'Watercolor style, soft tones.';
    const prompt = 'A man walks down the street.';
    expect(stripDuplicatePrefix(prompt, prefix)).toBe(prompt);
  });

  it('handles empty prefix', () => {
    expect(stripDuplicatePrefix('some prompt', '')).toBe('some prompt');
  });

  it('handles whitespace-only prefix', () => {
    expect(stripDuplicatePrefix('some prompt', '   ')).toBe('some prompt');
  });
});

describe('toSlug', () => {
  it('returns cover for slide 1', () => {
    expect(toSlug(1)).toBe('cover');
  });

  it('returns ending for slide 8', () => {
    expect(toSlug(8)).toBe('ending');
  });

  it('returns sceneN for other slides', () => {
    expect(toSlug(2)).toBe('scene2');
    expect(toSlug(5)).toBe('scene5');
    expect(toSlug(7)).toBe('scene7');
  });
});

describe('detectMimeType', () => {
  it('detects PNG', () => {
    expect(detectMimeType('image.png')).toBe('image/png');
  });

  it('detects JPG', () => {
    expect(detectMimeType('photo.jpg')).toBe('image/jpeg');
  });

  it('detects JPEG', () => {
    expect(detectMimeType('photo.jpeg')).toBe('image/jpeg');
  });

  it('detects WEBP', () => {
    expect(detectMimeType('image.webp')).toBe('image/webp');
  });

  it('defaults to PNG for unknown', () => {
    expect(detectMimeType('file.bmp')).toBe('image/png');
  });
});
