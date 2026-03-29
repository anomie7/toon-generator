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

// --- Image dimension reading (PNG + JPEG, no external dependency) ---

export interface ImageDimensions {
  width: number;
  height: number;
}

export function readImageDimensions(filePath: string): ImageDimensions {
  const buf = fs.readFileSync(filePath);

  // PNG: starts with 0x89504E47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return {
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }

  // JPEG: starts with 0xFFD8
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset < buf.length - 1) {
      if (buf[offset] !== 0xff) break;
      const marker = buf[offset + 1];
      // SOF0~SOF15 (0xC0~0xCF, except 0xC4=DHT and 0xCC=DAC)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xcc) {
        return {
          height: buf.readUInt16BE(offset + 5),
          width: buf.readUInt16BE(offset + 7),
        };
      }
      const segLen = buf.readUInt16BE(offset + 2);
      offset += 2 + segLen;
    }
    throw new Error(`Failed to read JPEG dimensions: no SOF marker found in ${filePath}`);
  }

  // WebP: starts with RIFF....WEBP
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    // VP8 lossy
    if (buf[12] === 0x56 && buf[13] === 0x50 && buf[14] === 0x38 && buf[15] === 0x20) {
      return {
        width: buf.readUInt16LE(26) & 0x3fff,
        height: buf.readUInt16LE(28) & 0x3fff,
      };
    }
  }

  throw new Error(`Unsupported image format: ${filePath}`);
}

/** @deprecated Use readImageDimensions instead */
export const readPngDimensions = readImageDimensions;

export function checkAspectRatio(
  dimensions: ImageDimensions,
  expected: string,
  tolerance = 0.08,
): boolean {
  const [wRatio, hRatio] = expected.split(':').map(Number);
  const expectedRatio = wRatio / hRatio;
  const actualRatio = dimensions.width / dimensions.height;
  return Math.abs(actualRatio - expectedRatio) <= tolerance;
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
