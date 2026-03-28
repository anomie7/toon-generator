# Nano Banana (Gemini Image Generation) API Guide

## SDK

```typescript
import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
```

## Image Generation

```typescript
const response = await ai.models.generateContent({
  model: 'gemini-3.1-flash-image-preview',  // test
  // model: 'gemini-3-pro-image-preview',    // production
  contents: prompt,
  config: {
    responseModalities: ['IMAGE'],
    aspectRatio: '4:5',
  },
});
```

## Response Parsing

```typescript
const parts = response.candidates?.[0]?.content?.parts;
for (const part of parts) {
  if (part.inlineData) {
    const base64Data = part.inlineData.data;
    // Save as PNG
    fs.writeFileSync(outputPath, Buffer.from(base64Data, 'base64'));
  }
}
```

## Prompt Best Practices

1. **Descriptive prose**: Describe scenes in complete sentences, not keyword lists
2. **Character consistency**: Use identical character description prefix for every prompt
3. **Lighting/Color**: Specify concrete lighting conditions and color temperature
4. **Composition**: Specify camera angle (eye-level, low angle) and distance (close-up, wide shot)
5. **Style lock**: Insert style prefix before every prompt

## Available Aspect Ratios

- `1:1` - Square
- `4:5` - Instagram portrait (recommended)
- `16:9` - Widescreen
- `9:16` - Vertical fullscreen

## Reference Image Usage

Pass reference images alongside prompts for character/style consistency:

```typescript
contents: [
  {
    role: 'user',
    parts: [
      { inlineData: { mimeType: 'image/png', data: base64Image } },
      { text: 'Use this reference for style consistency. Generate: ...' },
    ],
  },
]
```

## Multiple References

Combine background + character + object references for best results:

```typescript
contents: [
  {
    role: 'user',
    parts: [
      { inlineData: { mimeType: 'image/jpeg', data: bgRefBase64 } },
      { text: 'Background reference.' },
      { inlineData: { mimeType: 'image/png', data: charRefBase64 } },
      { text: 'Character reference.' },
      { text: 'Using the above references for style/composition, generate: [prompt]' },
    ],
  },
]
```

## Error Handling

- Rate limit: retry with exponential backoff (max 3 attempts)
- Empty response: check `response.candidates` exists and has parts with `inlineData`
- Safety filter: if blocked, simplify the prompt and retry
