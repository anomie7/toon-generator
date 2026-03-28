import * as fs from 'fs';
import * as path from 'path';

// --- Reference image type ---

export interface RefImage {
  base64: string;
  path: string;
  mimeType: string;
}

// --- MIME type detection ---

export function detectMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  };
  return mimeMap[ext] || 'image/png';
}

// --- Load reference images ---

export function loadRefImages(paths: string[]): RefImage[] {
  const images: RefImage[] = [];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      images.push({
        base64: fs.readFileSync(p).toString('base64'),
        path: p,
        mimeType: detectMimeType(p),
      });
      console.log(`[ref] ${p}`);
    } else {
      console.warn(`[ref] File not found, skipping: ${p}`);
    }
  }
  return images;
}

// --- Retry with exponential backoff ---

export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      console.log(`  Retry ${attempt + 1}/${maxRetries} in ${Math.round(delay / 1000)}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Unreachable');
}

// --- Slug generation ---

export function toSlug(slideNumber: number): string {
  const slugMap: Record<number, string> = {
    1: 'cover',
    8: 'ending',
  };
  return slugMap[slideNumber] || `scene${slideNumber}`;
}

// --- Prompt deduplication ---

export function stripDuplicatePrefix(prompt: string, prefix: string): string {
  const trimmedPrefix = prefix.trim();
  if (trimmedPrefix && prompt.startsWith(trimmedPrefix)) {
    console.warn('  [warn] Stripped duplicate prefix from prompt field');
    return prompt.slice(trimmedPrefix.length).trim();
  }
  return prompt;
}

// --- Metadata ---

export interface GenerationMeta {
  slide: number;
  model: string;
  refs: string[];
  toneReference: string | null;
  fix: boolean;
  variant: number;
  timestamp: string;
  promptLength: number;
}

export function saveMetadata(imagePath: string, meta: GenerationMeta): void {
  const metaPath = imagePath.replace(/\.png$/, '.meta.json');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}
