export interface YouTubeTrendResult { videoId: string; title: string; channelTitle: string; publishedAt: string; viewCount: number; likeCount: number; commentCount: number; tags: string[]; categoryId: string; duration: string; thumbnailUrl: string; }
export interface YouTubeSearchParams { query: string; maxResults?: number; regionCode?: string; videoDuration?: 'short' | 'medium' | 'long'; order?: 'relevance' | 'date' | 'viewCount' | 'rating'; publishedAfter?: string; }
export interface YouTubeUploadParams { title: string; description: string; tags: string[]; categoryId: string; privacyStatus: 'private' | 'unlisted' | 'public'; videoData: ArrayBuffer; accessToken: string; }
export interface YouTubeUploadResult { videoId: string; url: string; status: string; }

export class YouTubeTool {
  private readonly baseUrl = 'https://www.googleapis.com/youtube/v3';
  constructor(private readonly apiKey: string) {}

  async searchTrending(params: YouTubeSearchParams): Promise<YouTubeTrendResult[]> {
    const sp = new URLSearchParams({ part: 'snippet', type: 'video', q: params.query, maxResults: String(params.maxResults ?? 25), regionCode: params.regionCode ?? 'KR', videoDuration: params.videoDuration ?? 'short', order: params.order ?? 'viewCount', key: this.apiKey });
    if (params.publishedAfter) sp.set('publishedAfter', params.publishedAfter);
    const searchRes = await fetch(`${this.baseUrl}/search?${sp.toString()}`);
    if (!searchRes.ok) throw new Error(`YouTube search error: ${searchRes.status}`);
    const searchData = (await searchRes.json()) as { items: { id: { videoId: string } }[] };
    const videoIds = searchData.items.map(i => i.id.videoId);
    if (!videoIds.length) return [];
    const statsRes = await fetch(`${this.baseUrl}/videos?${new URLSearchParams({ part: 'statistics,contentDetails,snippet', id: videoIds.join(','), key: this.apiKey }).toString()}`);
    if (!statsRes.ok) throw new Error(`YouTube videos error: ${statsRes.status}`);
    const statsData = (await statsRes.json()) as { items: { id: string; snippet: { title: string; channelTitle: string; publishedAt: string; tags?: string[]; categoryId: string; thumbnails: { high: { url: string } } }; statistics: { viewCount: string; likeCount: string; commentCount: string }; contentDetails: { duration: string } }[] };
    return statsData.items.map(i => ({ videoId: i.id, title: i.snippet.title, channelTitle: i.snippet.channelTitle, publishedAt: i.snippet.publishedAt, viewCount: parseInt(i.statistics.viewCount ?? '0', 10), likeCount: parseInt(i.statistics.likeCount ?? '0', 10), commentCount: parseInt(i.statistics.commentCount ?? '0', 10), tags: i.snippet.tags ?? [], categoryId: i.snippet.categoryId, duration: i.contentDetails.duration, thumbnailUrl: i.snippet.thumbnails.high.url }));
  }

  async getTrending(regionCode = 'KR', categoryId?: string, maxResults = 25): Promise<YouTubeTrendResult[]> {
    const p = new URLSearchParams({ part: 'snippet,statistics,contentDetails', chart: 'mostPopular', regionCode, maxResults: String(maxResults), key: this.apiKey });
    if (categoryId) p.set('videoCategoryId', categoryId);
    const res = await fetch(`${this.baseUrl}/videos?${p.toString()}`);
    if (!res.ok) throw new Error(`YouTube trending error: ${res.status}`);
    const data = (await res.json()) as { items: { id: string; snippet: { title: string; channelTitle: string; publishedAt: string; tags?: string[]; categoryId: string; thumbnails: { high: { url: string } } }; statistics: { viewCount: string; likeCount: string; commentCount: string }; contentDetails: { duration: string } }[] };
    return data.items.map(i => ({ videoId: i.id, title: i.snippet.title, channelTitle: i.snippet.channelTitle, publishedAt: i.snippet.publishedAt, viewCount: parseInt(i.statistics.viewCount ?? '0', 10), likeCount: parseInt(i.statistics.likeCount ?? '0', 10), commentCount: parseInt(i.statistics.commentCount ?? '0', 10), tags: i.snippet.tags ?? [], categoryId: i.snippet.categoryId, duration: i.contentDetails.duration, thumbnailUrl: i.snippet.thumbnails.high.url }));
  }

  async upload(params: YouTubeUploadParams): Promise<YouTubeUploadResult> {
    const metadata = { snippet: { title: params.title, description: params.description, tags: params.tags, categoryId: params.categoryId }, status: { privacyStatus: params.privacyStatus, selfDeclaredMadeForKids: false } };
    const initRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', { method: 'POST', headers: { Authorization: `Bearer ${params.accessToken}`, 'Content-Type': 'application/json', 'X-Upload-Content-Type': 'video/*', 'X-Upload-Content-Length': String(params.videoData.byteLength) }, body: JSON.stringify(metadata) });
    if (!initRes.ok) throw new Error(`YouTube upload init error: ${initRes.status}`);
    const uploadUrl = initRes.headers.get('Location');
    if (!uploadUrl) throw new Error('No resumable upload URL');
    const uploadRes = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/*', 'Content-Length': String(params.videoData.byteLength) }, body: params.videoData });
    if (!uploadRes.ok) throw new Error(`YouTube upload error: ${uploadRes.status}`);
    const data = (await uploadRes.json()) as { id: string; status: { uploadStatus: string } };
    return { videoId: data.id, url: `https://youtube.com/shorts/${data.id}`, status: data.status.uploadStatus };
  }
}
