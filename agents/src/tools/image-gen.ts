/**
 * Image Generation tool.
 *
 * Generates thumbnails and images via AI (routed through AI Gateway).
 * Supports text overlay for YouTube Shorts thumbnails.
 */

import type { AIGatewayClient } from '../framework/types';

export interface ImageGenParams {
  prompt: string;
  width?: number;
  height?: number;
  style?: 'natural' | 'vivid';
  quality?: 'standard' | 'hd';
}

export interface ImageGenResult {
  imageData: ArrayBuffer;
  contentType: string;
  revisedPrompt: string;
}

export interface TextOverlayParams {
  text: string;
  position: 'top' | 'center' | 'bottom';
  fontSize: number;
  fontColor: string;
  backgroundColor?: string;
  fontWeight?: 'normal' | 'bold';
}

export class ImageGenTool {
  constructor(
    private readonly apiKey: string,
  ) {}

  /** Generate a thumbnail image using DALL-E */
  async generate(params: ImageGenParams): Promise<ImageGenResult> {
    const body = {
      model: 'dall-e-3',
      prompt: params.prompt,
      n: 1,
      size: this.mapSize(params.width ?? 1080, params.height ?? 1920),
      style: params.style ?? 'vivid',
      quality: params.quality ?? 'standard',
      response_format: 'b64_json',
    };

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Image generation error: ${res.status} - ${text}`);
    }

    const data = (await res.json()) as {
      data: { b64_json: string; revised_prompt: string }[];
    };

    const b64 = data.data[0]?.b64_json;
    if (!b64) {
      throw new Error('No image data returned from generation API');
    }

    // Decode base64 to ArrayBuffer
    const binaryString = atob(b64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return {
      imageData: bytes.buffer,
      contentType: 'image/png',
      revisedPrompt: data.data[0]?.revised_prompt ?? params.prompt,
    };
  }

  /** Build a thumbnail prompt optimized for YouTube Shorts */
  buildThumbnailPrompt(
    topic: string,
    style: string,
    textOverlay?: string,
  ): string {
    const parts = [
      'Create a YouTube Shorts thumbnail image.',
      `Topic: ${topic}.`,
      `Visual style: ${style}.`,
      'Vertical orientation (9:16 aspect ratio).',
      'Bold, eye-catching colors with high contrast.',
      'Clean composition suitable for mobile viewing.',
    ];

    if (textOverlay) {
      parts.push(
        `Include space for text overlay that reads: "${textOverlay}".`,
        'Leave clear area for text, do not render the text itself.',
      );
    }

    return parts.join(' ');
  }

  /** Map requested dimensions to DALL-E supported sizes */
  private mapSize(
    width: number,
    height: number,
  ): '1024x1024' | '1024x1792' | '1792x1024' {
    const ratio = width / height;
    if (ratio < 0.8) return '1024x1792'; // Portrait (Shorts)
    if (ratio > 1.2) return '1792x1024'; // Landscape
    return '1024x1024'; // Square
  }
}
