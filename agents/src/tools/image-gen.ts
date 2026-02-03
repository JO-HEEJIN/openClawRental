export interface ImageGenParams { prompt: string; width?: number; height?: number; style?: 'natural' | 'vivid'; quality?: 'standard' | 'hd'; }
export interface ImageGenResult { imageData: ArrayBuffer; contentType: string; revisedPrompt: string; }

export class ImageGenTool {
  constructor(private readonly apiKey: string) {}

  async generate(params: ImageGenParams): Promise<ImageGenResult> {
    const res = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` }, body: JSON.stringify({ model: 'dall-e-3', prompt: params.prompt, n: 1, size: this.mapSize(params.width ?? 1080, params.height ?? 1920), style: params.style ?? 'vivid', quality: params.quality ?? 'standard', response_format: 'b64_json' }) });
    if (!res.ok) throw new Error(`Image gen error: ${res.status}`);
    const data = (await res.json()) as { data: { b64_json: string; revised_prompt: string }[] };
    const b64 = data.data[0]?.b64_json;
    if (!b64) throw new Error('No image data');
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { imageData: bytes.buffer, contentType: 'image/png', revisedPrompt: data.data[0]?.revised_prompt ?? params.prompt };
  }

  buildThumbnailPrompt(topic: string, style: string, textOverlay?: string): string {
    const parts = [`Create a YouTube Shorts thumbnail. Topic: ${topic}. Style: ${style}. Vertical 9:16. Bold colors, high contrast, mobile-friendly.`];
    if (textOverlay) parts.push(`Space for text: "${textOverlay}". Do not render text.`);
    return parts.join(' ');
  }

  private mapSize(w: number, h: number): '1024x1024' | '1024x1792' | '1792x1024' {
    const r = w / h; if (r < 0.8) return '1024x1792'; if (r > 1.2) return '1792x1024'; return '1024x1024';
  }
}
