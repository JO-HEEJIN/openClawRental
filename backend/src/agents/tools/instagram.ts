/**
 * Instagram Graph API tool.
 *
 * Provides hashtag search, trending analysis, and Reels upload
 * capabilities for the agent runtime.
 */

export interface InstagramHashtagResult {
  id: string;
  name: string;
  mediaCount: number;
}

export interface InstagramTrendingPost {
  id: string;
  caption: string;
  mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  mediaUrl: string;
  permalink: string;
  timestamp: string;
  likeCount: number;
  commentsCount: number;
  hashtags: string[];
}

export interface InstagramReelsUploadParams {
  videoUrl: string;
  caption: string;
  accessToken: string;
  igUserId: string;
  shareToFeed?: boolean;
}

export interface InstagramUploadResult {
  containerId: string;
  mediaId: string;
  permalink: string;
  status: string;
}

export class InstagramTool {
  private readonly baseUrl = 'https://graph.facebook.com/v19.0';

  constructor(private readonly accessToken: string) {}

  /** Search for hashtags and get media counts */
  async searchHashtags(
    query: string,
    igUserId: string,
  ): Promise<InstagramHashtagResult[]> {
    const params = new URLSearchParams({
      q: query,
      user_id: igUserId,
      access_token: this.accessToken,
    });

    const res = await fetch(
      `${this.baseUrl}/ig_hashtag_search?${params.toString()}`,
    );
    if (!res.ok) {
      throw new Error(`Instagram hashtag search error: ${res.status}`);
    }

    const data = (await res.json()) as {
      data: { id: string; name: string }[];
    };

    // Get media counts for each hashtag
    const results: InstagramHashtagResult[] = [];
    for (const hashtag of data.data.slice(0, 10)) {
      try {
        const countRes = await fetch(
          `${this.baseUrl}/${hashtag.id}?fields=id,name,media_count&access_token=${this.accessToken}`,
        );
        if (countRes.ok) {
          const countData = (await countRes.json()) as {
            id: string;
            name: string;
            media_count: number;
          };
          results.push({
            id: countData.id,
            name: countData.name,
            mediaCount: countData.media_count,
          });
        }
      } catch {
        // Skip hashtags that fail
      }
    }

    return results;
  }

  /** Get top/recent media for a hashtag */
  async getHashtagMedia(
    hashtagId: string,
    igUserId: string,
    edge: 'top_media' | 'recent_media' = 'top_media',
  ): Promise<InstagramTrendingPost[]> {
    const params = new URLSearchParams({
      user_id: igUserId,
      fields: 'id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count',
      access_token: this.accessToken,
    });

    const res = await fetch(
      `${this.baseUrl}/${hashtagId}/${edge}?${params.toString()}`,
    );
    if (!res.ok) {
      throw new Error(`Instagram hashtag media error: ${res.status}`);
    }

    const data = (await res.json()) as {
      data: {
        id: string;
        caption?: string;
        media_type: string;
        media_url: string;
        permalink: string;
        timestamp: string;
        like_count?: number;
        comments_count?: number;
      }[];
    };

    return data.data.map((post) => {
      const caption = post.caption ?? '';
      const hashtagMatches = caption.match(/#[\w\uAC00-\uD7AF]+/g) ?? [];
      return {
        id: post.id,
        caption,
        mediaType: post.media_type as InstagramTrendingPost['mediaType'],
        mediaUrl: post.media_url,
        permalink: post.permalink,
        timestamp: post.timestamp,
        likeCount: post.like_count ?? 0,
        commentsCount: post.comments_count ?? 0,
        hashtags: hashtagMatches,
      };
    });
  }

  /** Upload a Reel to Instagram (two-step container creation + publish) */
  async uploadReel(params: InstagramReelsUploadParams): Promise<InstagramUploadResult> {
    // Step 1: Create media container
    const containerBody = new URLSearchParams({
      media_type: 'REELS',
      video_url: params.videoUrl,
      caption: params.caption,
      share_to_feed: String(params.shareToFeed ?? true),
      access_token: params.accessToken,
    });

    const containerRes = await fetch(
      `${this.baseUrl}/${params.igUserId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: containerBody.toString(),
      },
    );

    if (!containerRes.ok) {
      const text = await containerRes.text();
      throw new Error(`Instagram container creation error: ${containerRes.status} - ${text}`);
    }

    const containerData = (await containerRes.json()) as { id: string };
    const containerId = containerData.id;

    // Step 2: Wait for container to be ready, then publish
    let status = 'IN_PROGRESS';
    let attempts = 0;
    const maxAttempts = 30;

    while (status === 'IN_PROGRESS' && attempts < maxAttempts) {
      await new Promise((r) => setTimeout(r, 2000));
      attempts++;

      const statusRes = await fetch(
        `${this.baseUrl}/${containerId}?fields=status_code&access_token=${params.accessToken}`,
      );
      if (statusRes.ok) {
        const statusData = (await statusRes.json()) as { status_code: string };
        status = statusData.status_code;
      }
    }

    if (status !== 'FINISHED') {
      throw new Error(`Instagram upload processing failed. Status: ${status}`);
    }

    // Step 3: Publish
    const publishRes = await fetch(
      `${this.baseUrl}/${params.igUserId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          creation_id: containerId,
          access_token: params.accessToken,
        }).toString(),
      },
    );

    if (!publishRes.ok) {
      const text = await publishRes.text();
      throw new Error(`Instagram publish error: ${publishRes.status} - ${text}`);
    }

    const publishData = (await publishRes.json()) as { id: string };

    // Get permalink
    const mediaRes = await fetch(
      `${this.baseUrl}/${publishData.id}?fields=permalink&access_token=${params.accessToken}`,
    );
    let permalink = '';
    if (mediaRes.ok) {
      const mediaData = (await mediaRes.json()) as { permalink: string };
      permalink = mediaData.permalink;
    }

    return {
      containerId,
      mediaId: publishData.id,
      permalink,
      status: 'published',
    };
  }
}
