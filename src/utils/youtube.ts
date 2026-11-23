import { isTimestampInWindow } from './time';

export interface StreamEntry {
  videoId: string;
  title: string;
  publishedText: string;
  isLive: boolean;
}

export interface YouTubeLiveStatus {
  channelId?: string;
  streamsUrl?: string;
  isLive: boolean;
  liveVideoId: string | null;
  liveTitle: string | null;
  latestStreamStartTime?: string | null;
  latestStreamEndTime?: string | null;
  endedAtMs?: number | null;
  latestStream: StreamEntry | null;
  streams: StreamEntry[];
  streamEndedToday: boolean;
}

export async function fetchChannelStreams(
  channelTarget: string,
  force = false,
): Promise<Omit<YouTubeLiveStatus, 'streamEndedToday' | 'endedAtMs'>> {
  try {
    const forceQuery = force ? '&force=1' : '';
    const res = await fetch(
      `/api/youtube/streams?target=${encodeURIComponent(channelTarget)}${forceQuery}&t=${Date.now()}`,
      { cache: 'no-store' },
    );
    if (!res.ok) {
      return {
        isLive: false,
        liveVideoId: null,
        liveTitle: null,
        latestStreamStartTime: null,
        latestStreamEndTime: null,
        latestStream: null,
        streams: [],
      };
    }
    const data = (await res.json()) as {
      channelId?: string;
      streamsUrl?: string;
      isLive?: boolean;
      liveVideoId?: string | null;
      liveTitle?: string | null;
      latestStreamStartTime?: string | null;
      latestStreamEndTime?: string | null;
      latestStream?: StreamEntry | null;
      streams?: StreamEntry[];
    };
    return {
      channelId: data.channelId,
      streamsUrl: data.streamsUrl,
      isLive: Boolean(data.isLive),
      liveVideoId: data.liveVideoId ?? null,
      liveTitle: data.liveTitle ?? null,
      latestStreamStartTime: data.latestStreamStartTime ?? null,
      latestStreamEndTime: data.latestStreamEndTime ?? null,
      latestStream: data.latestStream ?? null,
      streams: Array.isArray(data.streams) ? data.streams : [],
    };
  } catch {
    return {
      isLive: false,
      liveVideoId: null,
      liveTitle: null,
      latestStreamStartTime: null,
      latestStreamEndTime: null,
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

    const endedItem = items.find((item) =>
      isTimestampInWindow(
        item.liveStreamingDetails?.actualEndTime,
        serviceStartMs,
        serviceEndMs,
      ),
    );
    const parsedEndMs = endedItem?.liveStreamingDetails?.actualEndTime
      ? Date.parse(endedItem.liveStreamingDetails.actualEndTime)
      : NaN;

    return {
      isLive: false,
      liveVideoId: null,
      liveTitle: null,
      endedAtMs: Number.isNaN(parsedEndMs) ? null : parsedEndMs,
      latestStream: null,
      streams: [],
      streamEndedToday: Boolean(endedItem),
    };
  } catch {
    return {
      isLive: false,
      liveVideoId: null,
      liveTitle: null,
      endedAtMs: null,
      latestStream: null,
      streams: [],
      streamEndedToday: false,
    };
  }
}
