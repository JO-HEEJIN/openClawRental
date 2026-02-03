export interface InstagramHashtagResult { id: string; name: string; mediaCount: number; }
export interface InstagramTrendingPost { id: string; caption: string; mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'; mediaUrl: string; permalink: string; timestamp: string; likeCount: number; commentsCount: number; hashtags: string[]; }
export interface InstagramReelsUploadParams { videoUrl: string; caption: string; accessToken: string; igUserId: string; shareToFeed?: boolean; }
export interface InstagramUploadResult { containerId: string; mediaId: string; permalink: string; status: string; }

export class InstagramTool {
  private readonly baseUrl = 'https://graph.facebook.com/v19.0';
  constructor(private readonly accessToken: string) {}

  async searchHashtags(query: string, igUserId: string): Promise<InstagramHashtagResult[]> {
    const res = await fetch(`${this.baseUrl}/ig_hashtag_search?${new URLSearchParams({ q: query, user_id: igUserId, access_token: this.accessToken }).toString()}`);
    if (!res.ok) throw new Error(`Instagram hashtag search error: ${res.status}`);
    const data = (await res.json()) as { data: { id: string; name: string }[] };
    const results: InstagramHashtagResult[] = [];
    for (const h of data.data.slice(0, 10)) {
      try {
        const r = await fetch(`${this.baseUrl}/${h.id}?fields=id,name,media_count&access_token=${this.accessToken}`);
        if (r.ok) { const d = (await r.json()) as { id: string; name: string; media_count: number }; results.push({ id: d.id, name: d.name, mediaCount: d.media_count }); }
      } catch { /* skip */ }
    }
    return results;
  }

  async uploadReel(params: InstagramReelsUploadParams): Promise<InstagramUploadResult> {
    const cRes = await fetch(`${this.baseUrl}/${params.igUserId}/media`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ media_type: 'REELS', video_url: params.videoUrl, caption: params.caption, share_to_feed: String(params.shareToFeed ?? true), access_token: params.accessToken }).toString() });
    if (!cRes.ok) throw new Error(`Instagram container error: ${cRes.status}`);
    const cData = (await cRes.json()) as { id: string };
    let status = 'IN_PROGRESS'; let attempts = 0;
    while (status === 'IN_PROGRESS' && attempts < 30) { await new Promise(r => setTimeout(r, 2000)); attempts++; const sRes = await fetch(`${this.baseUrl}/${cData.id}?fields=status_code&access_token=${params.accessToken}`); if (sRes.ok) { status = ((await sRes.json()) as { status_code: string }).status_code; } }
    if (status !== 'FINISHED') throw new Error(`Instagram processing failed: ${status}`);
    const pRes = await fetch(`${this.baseUrl}/${params.igUserId}/media_publish`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ creation_id: cData.id, access_token: params.accessToken }).toString() });
    if (!pRes.ok) throw new Error(`Instagram publish error: ${pRes.status}`);
    const pData = (await pRes.json()) as { id: string };
    let permalink = '';
    const mRes = await fetch(`${this.baseUrl}/${pData.id}?fields=permalink&access_token=${params.accessToken}`);
    if (mRes.ok) { permalink = ((await mRes.json()) as { permalink: string }).permalink; }
    return { containerId: cData.id, mediaId: pData.id, permalink, status: 'published' };
  }
}
