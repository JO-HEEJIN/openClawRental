/**
 * YouTube Data API v3 tool.
 *
 * Provides search, trending, channel analytics, and upload capabilities
 * for the agent runtime.
 */

export interface YouTubeTrendResult {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  tags: string[];
  categoryId: string;
  duration: string;
  thumbnailUrl: string;
}

export interface YouTubeSearchParams {
  query: string;
  maxResults?: number;
  regionCode?: string;
  videoDuration?: 'short' | 'medium' | 'long';
  order?: 'relevance' | 'date' | 'viewCount' | 'rating';
  publishedAfter?: string;
}

export interface YouTubeUploadParams {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  privacyStatus: 'private' | 'unlisted' | 'public';
  videoData: ArrayBuffer;
  accessToken: string;
}

export interface YouTubeUploadResult {
  videoId: string;
  url: string;
  status: string;
}

export class YouTubeTool {
  private readonly baseUrl = 'https://www.googleapis.com/youtube/v3';

  constructor(private readonly apiKey: string) {}

  /** Search for trending Shorts in a specific niche/region */
  async searchTrending(params: YouTubeSearchParams): Promise<YouTubeTrendResult[]> {
    const searchParams = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      q: params.query,
      maxResults: String(params.maxResults ?? 25),
      regionCode: params.regionCode ?? 'KR',
      videoDuration: params.videoDuration ?? 'short',
      order: params.order ?? 'viewCount',
      key: this.apiKey,
    });

    if (params.publishedAfter) {
      searchParams.set('publishedAfter', params.publishedAfter);
    }

    const searchRes = await fetch(
      `${this.baseUrl}/search?${searchParams.toString()}`,
    );
    if (!searchRes.ok) {
      throw new Error(`YouTube search API error: ${searchRes.status}`);
    }

    const searchData = (await searchRes.json()) as {
      items: {
        id: { videoId: string };
        snippet: {
          title: string;
          channelTitle: string;
          publishedAt: string;
          thumbnails: { high: { url: string } };
        };
      }[];
    };

    const videoIds = searchData.items.map((item) => item.id.videoId);
    if (videoIds.length === 0) return [];

    // Fetch detailed stats for each video
    const statsParams = new URLSearchParams({
      part: 'statistics,contentDetails,snippet',
      id: videoIds.join(','),
      key: this.apiKey,
    });

    const statsRes = await fetch(
      `${this.baseUrl}/videos?${statsParams.toString()}`,
    );
    if (!statsRes.ok) {
      throw new Error(`YouTube videos API error: ${statsRes.status}`);
    }

    const statsData = (await statsRes.json()) as {
      items: {
        id: string;
        snippet: {
          title: string;
          channelTitle: string;
          publishedAt: string;
          tags?: string[];
          categoryId: string;
          thumbnails: { high: { url: string } };
        };
        statistics: {
          viewCount: string;
          likeCount: string;
          commentCount: string;
        };
        contentDetails: { duration: string };
      }[];
    };

    return statsData.items.map((item) => ({
      videoId: item.id,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      viewCount: parseInt(item.statistics.viewCount ?? '0', 10),
      likeCount: parseInt(item.statistics.likeCount ?? '0', 10),
      commentCount: parseInt(item.statistics.commentCount ?? '0', 10),
      tags: item.snippet.tags ?? [],
      categoryId: item.snippet.categoryId,
      duration: item.contentDetails.duration,
      thumbnailUrl: item.snippet.thumbnails.high.url,
    }));
  }

  /** Get trending videos for a specific region/category */
  async getTrending(
    regionCode = 'KR',
    categoryId?: string,
    maxResults = 25,
  ): Promise<YouTubeTrendResult[]> {
    const params = new URLSearchParams({
      part: 'snippet,statistics,contentDetails',
      chart: 'mostPopular',
      regionCode,
      maxResults: String(maxResults),
      key: this.apiKey,
    });

    if (categoryId) {
      params.set('videoCategoryId', categoryId);
    }

    const res = await fetch(`${this.baseUrl}/videos?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`YouTube trending API error: ${res.status}`);
    }

    const data = (await res.json()) as {
      items: {
        id: string;
        snippet: {
          title: string;
          channelTitle: string;
          publishedAt: string;
          tags?: string[];
          categoryId: string;
          thumbnails: { high: { url: string } };
        };
        statistics: {
          viewCount: string;
          likeCount: string;
          commentCount: string;
        };
        contentDetails: { duration: string };
      }[];
    };

    return data.items.map((item) => ({
      videoId: item.id,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      viewCount: parseInt(item.statistics.viewCount ?? '0', 10),
      likeCount: parseInt(item.statistics.likeCount ?? '0', 10),
      commentCount: parseInt(item.statistics.commentCount ?? '0', 10),
      tags: item.snippet.tags ?? [],
      categoryId: item.snippet.categoryId,
      duration: item.contentDetails.duration,
      thumbnailUrl: item.snippet.thumbnails.high.url,
    }));
  }

  /** Upload a video to YouTube (requires OAuth access token) */
  async upload(params: YouTubeUploadParams): Promise<YouTubeUploadResult> {
    const metadata = {
      snippet: {
        title: params.title,
        description: params.description,
        tags: params.tags,
        categoryId: params.categoryId,
      },
      status: {
        privacyStatus: params.privacyStatus,
        selfDeclaredMadeForKids: false,
      },
    };

    // Resumable upload: Step 1 - initiate
    const initRes = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': 'video/*',
          'X-Upload-Content-Length': String(params.videoData.byteLength),
        },
        body: JSON.stringify(metadata),
      },
    );

    if (!initRes.ok) {
      throw new Error(`YouTube upload init error: ${initRes.status}`);
    }

    const uploadUrl = initRes.headers.get('Location');
    if (!uploadUrl) {
      throw new Error('YouTube upload: no resumable upload URL returned');
    }

    // Step 2 - upload video data
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/*',
        'Content-Length': String(params.videoData.byteLength),
      },
      body: params.videoData,
    });

    if (!uploadRes.ok) {
      throw new Error(`YouTube upload error: ${uploadRes.status}`);
    }

    const data = (await uploadRes.json()) as {
      id: string;
      status: { uploadStatus: string };
    };

    return {
      videoId: data.id,
      url: `https://youtube.com/shorts/${data.id}`,
      status: data.status.uploadStatus,
    };
  }
}
