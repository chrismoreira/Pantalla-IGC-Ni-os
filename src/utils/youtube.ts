import { isTimestampInWindow } from './time';

export interface StreamEntry {
  videoId: string;
  title: string;
  publishedText: string;
  isLive: boolean;
}

export interface YouTubeLiveStatus {
  isLive: boolean;
  liveVideoId: string | null;
  liveTitle: string | null;
  latestStream: StreamEntry | null;
  streams: StreamEntry[];
  streamEndedToday: boolean;
}

export async function fetchChannelStreams(
  channelHandle: string,
): Promise<Omit<YouTubeLiveStatus, 'streamEndedToday'>> {
  try {
    const res = await fetch(
      `/api/youtube/streams?handle=${encodeURIComponent(channelHandle)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) {
      return {
        isLive: false,
        liveVideoId: null,
        liveTitle: null,
        latestStream: null,
        streams: [],
      };
    }
    const data = (await res.json()) as {
      isLive?: boolean;
      liveVideoId?: string | null;
      liveTitle?: string | null;
      latestStream?: StreamEntry | null;
      streams?: StreamEntry[];
    };
    return {
      isLive: Boolean(data.isLive),
      liveVideoId: data.liveVideoId ?? null,
      liveTitle: data.liveTitle ?? null,
      latestStream: data.latestStream ?? null,
      streams: Array.isArray(data.streams) ? data.streams : [],
    };
  } catch {
    return {
      isLive: false,
      liveVideoId: null,
      liveTitle: null,
      latestStream: null,
      streams: [],
    };
  }
}

export function buildYouTubeEmbedUrl(
  channelId: string,
  liveVideoId: string | null,
  muted: boolean,
): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : '';

  const params = new URLSearchParams({
    autoplay: '1',
    mute: muted ? '1' : '0',
    controls: '1',
    enablejsapi: '1',
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    iv_load_policy: '3',
  });

  if (origin) {
    params.set('origin', origin);
  }

  if (liveVideoId) {
    return `https://www.youtube.com/embed/${encodeURIComponent(liveVideoId)}?${params.toString()}`;
  }

  params.set('channel', channelId);
  return `https://www.youtube.com/embed/live_stream?${params.toString()}`;
}

interface PlaylistItemsResponse {
  items?: Array<{
    contentDetails?: {
      videoId?: string;
    };
  }>;
}

interface VideosListResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      liveBroadcastContent?: string;
    };
    liveStreamingDetails?: {
      actualStartTime?: string;
      actualEndTime?: string;
    };
  }>;
}

export async function pollYouTubeLiveStatus(
  channelId: string,
  apiKey: string,
  serviceStartMs: number,
  serviceEndMs: number,
): Promise<YouTubeLiveStatus> {
  if (!apiKey.trim()) {
    return {
      isLive: false,
      liveVideoId: null,
      liveTitle: null,
      latestStream: null,
      streams: [],
      streamEndedToday: false,
    };
  }

  // Use uploads playlist ("UU" + channelId.slice(2)) instead of search.list
  const uploadsPlaylistId = `UU${channelId.slice(2)}`;

  try {
    const playlistUrl = new URL(
      'https://www.googleapis.com/youtube/v3/playlistItems',
    );
    playlistUrl.searchParams.set('part', 'contentDetails');
    playlistUrl.searchParams.set('playlistId', uploadsPlaylistId);
    playlistUrl.searchParams.set('maxResults', '6');
    playlistUrl.searchParams.set('key', apiKey);

    const playlistRes = await fetch(playlistUrl.toString());
    if (!playlistRes.ok) {
      return {
        isLive: false,
        liveVideoId: null,
        liveTitle: null,
        latestStream: null,
        streams: [],
        streamEndedToday: false,
      };
    }

    const playlistData = (await playlistRes.json()) as PlaylistItemsResponse;
    const videoIds = (playlistData.items ?? [])
      .map((item) => item.contentDetails?.videoId)
      .filter((id): id is string => Boolean(id));

    if (videoIds.length === 0) {
      return {
        isLive: false,
        liveVideoId: null,
        liveTitle: null,
        latestStream: null,
        streams: [],
        streamEndedToday: false,
      };
    }

    const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    videosUrl.searchParams.set('part', 'snippet,liveStreamingDetails');
    videosUrl.searchParams.set('id', videoIds.join(','));
    videosUrl.searchParams.set('key', apiKey);

    const videosRes = await fetch(videosUrl.toString());
    if (!videosRes.ok) {
      return {
        isLive: false,
        liveVideoId: null,
        liveTitle: null,
        latestStream: null,
        streams: [],
        streamEndedToday: false,
      };
    }

    const videosData = (await videosRes.json()) as VideosListResponse;
    const items = videosData.items ?? [];

    const activeStream = items.find(
      (item) =>
        item.snippet?.liveBroadcastContent === 'live' ||
        (Boolean(item.liveStreamingDetails?.actualStartTime) &&
          !item.liveStreamingDetails?.actualEndTime),
    );

    if (activeStream?.id) {
      return {
        isLive: true,
        liveVideoId: activeStream.id,
        liveTitle: activeStream.snippet?.title ?? null,
        latestStream: null,
        streams: [],
        streamEndedToday: false,
      };
    }

    const endedInServiceWindow = items.some((item) =>
      isTimestampInWindow(
        item.liveStreamingDetails?.actualEndTime,
        serviceStartMs,
        serviceEndMs,
      ),
    );

    return {
      isLive: false,
      liveVideoId: null,
      liveTitle: null,
      latestStream: null,
      streams: [],
      streamEndedToday: endedInServiceWindow,
    };
  } catch {
    return {
      isLive: false,
      liveVideoId: null,
      liveTitle: null,
      latestStream: null,
      streams: [],
      streamEndedToday: false,
    };
  }
}
