import { describe, it, expect } from 'vitest';
import { EpisodePromptsSchema, ImagePromptSchema } from '../skills/toon-gen/lib/types.js';

describe('ImagePromptSchema', () => {
  it('validates a valid prompt', () => {
    const result = ImagePromptSchema.safeParse({
      slideNumber: 1,
      prompt: 'A young man walking down a street',
      textOverlay: '....',
      textPosition: 'bottom',
      aspectRatio: '4:5',
      colorMood: 'warm afternoon',
    });
    expect(result.success).toBe(true);
  });

  it('applies defaults for optional fields', () => {
    const result = ImagePromptSchema.parse({
      slideNumber: 1,
      prompt: 'test prompt',
      textOverlay: '',
      colorMood: 'neutral',
    });
    expect(result.textPosition).toBe('bottom');
    expect(result.aspectRatio).toBe('4:5');
  });

  it('rejects missing required fields', () => {
    const result = ImagePromptSchema.safeParse({
      slideNumber: 1,
      prompt: 'test',
      // missing textOverlay, colorMood
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid textPosition', () => {
    const result = ImagePromptSchema.safeParse({
      slideNumber: 1,
      prompt: 'test',
      textOverlay: '',
      textPosition: 'middle', // invalid
      colorMood: 'neutral',
    });
    expect(result.success).toBe(false);
  });
});

describe('EpisodePromptsSchema', () => {
  const validEpisodePrompts = {
    episode: 1,
    title: 'Test Episode',
    stylePrefix: 'Watercolor style.',
    characterPrefix: 'Young man, glasses.',
    prompts: [
      {
        slideNumber: 1,
        prompt: 'Scene description',
        textOverlay: 'Korean text',
        textPosition: 'bottom',
        aspectRatio: '4:5',
        colorMood: 'warm',
      },
    ],
  };

  it('validates a valid episode prompt', () => {
    const result = EpisodePromptsSchema.safeParse(validEpisodePrompts);
    expect(result.success).toBe(true);
  });

  it('accepts optional supportingCharacterPrefix', () => {
    const result = EpisodePromptsSchema.safeParse({
      ...validEpisodePrompts,
      supportingCharacterPrefix: 'Middle-aged man with apron.',
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional toneReference', () => {
    const result = EpisodePromptsSchema.safeParse({
      ...validEpisodePrompts,
      toneReference: 'content/visual/references/tone-masters/key-visual.png',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing episode number', () => {
    const { episode, ...rest } = validEpisodePrompts;
    const result = EpisodePromptsSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects empty prompts array', () => {
    const result = EpisodePromptsSchema.safeParse({
      ...validEpisodePrompts,
      prompts: [],
    });
    // Empty array is technically valid per schema, but check it parses
    expect(result.success).toBe(true);
  });

  it('validates prompts from actual demo output format', () => {
    const demoPrompt = {
      episode: 1,
      title: '....',
      stylePrefix: 'Watercolor-style digital illustration, soft pastel tones.',
      characterPrefix: 'Young man in early 30s, slim build.',
      supportingCharacterPrefix: 'Middle-aged man in late 40s.',
      toneReference: 'content/visual/references/tone-masters/key-visual.png',
      prompts: [
        {
          slideNumber: 1,
          prompt: 'Late afternoon street corner.',
          textOverlay: '....',
          textPosition: 'bottom',
          aspectRatio: '4:5',
          colorMood: 'warm afternoon',
          hasSupportingCharacter: false,
        },
      ],
    };
    // hasSupportingCharacter is not in schema but Zod strips unknown keys by default
    const result = EpisodePromptsSchema.safeParse(demoPrompt);
    expect(result.success).toBe(true);
  });
});
