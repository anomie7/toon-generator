import * as fs from 'fs';
import * as path from 'path';
import type { RefImage } from './image-utils.js';
import type { OpenAIImageModel } from './config.js';

interface OpenAIImageRequest {
  apiKey: string;
  model: OpenAIImageModel;
  prompt: string;
  refImages?: RefImage[];
  ratio: string;
}

interface OpenAIImageResponse {
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
  error?: {
    message?: string;
    type?: string;
  };
}

function roundToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}

export function openAIImageSizeFromRatio(ratio: string): string {
  const [rawW, rawH] = ratio.split(':').map(Number);
  if (!rawW || !rawH) return 'auto';

  const shortEdge = 1024;
  if (rawW === rawH) return `${shortEdge}x${shortEdge}`;

  if (rawW > rawH) {
    return `${roundToMultiple(shortEdge * (rawW / rawH), 16)}x${shortEdge}`;
  }

  return `${shortEdge}x${roundToMultiple(shortEdge * (rawH / rawW), 16)}`;
}

function parseImageResponse(json: OpenAIImageResponse): string {
  if (json.error) {
    throw new Error(json.error.message || json.error.type || 'OpenAI image API error');
  }

  const first = json.data?.[0];
  if (!first) {
    throw new Error('OpenAI image API returned no image data');
  }

  if (first.b64_json) {
    return first.b64_json;
  }

  throw new Error('OpenAI image API did not return base64 image data');
}

async function parseOpenAIResponse(response: Response): Promise<string> {
  const json = await response.json() as OpenAIImageResponse;
  if (!response.ok) {
    throw new Error(json.error?.message || `OpenAI image API request failed: ${response.status}`);
  }
  return parseImageResponse(json);
}

async function generateFromPrompt(request: OpenAIImageRequest): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${request.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: request.model,
      prompt: request.prompt,
      size: openAIImageSizeFromRatio(request.ratio),
      quality: 'high',
      output_format: 'png',
    }),
  });

  return parseOpenAIResponse(response);
}

function blobFromRef(ref: RefImage): Blob {
  const bytes = fs.readFileSync(ref.path);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Blob([arrayBuffer], { type: ref.mimeType });
}

async function generateFromReferences(request: OpenAIImageRequest, refImages: RefImage[]): Promise<string> {
  const form = new FormData();
  form.append('model', request.model);
  form.append('prompt', request.prompt);
  form.append('size', openAIImageSizeFromRatio(request.ratio));
  form.append('quality', 'high');
  form.append('output_format', 'png');
  form.append('input_fidelity', 'high');

  for (const ref of refImages) {
    form.append('image[]', blobFromRef(ref), path.basename(ref.path));
  }

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${request.apiKey}`,
    },
    body: form,
  });

  return parseOpenAIResponse(response);
}

export async function generateOpenAIImage(request: OpenAIImageRequest): Promise<string> {
  const refImages = request.refImages || [];
  if (refImages.length > 0) {
    return generateFromReferences(request, refImages);
  }
  return generateFromPrompt(request);
}
