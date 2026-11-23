import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

interface StreamEntry {
  videoId: string;
  title: string;
  publishedText: string;
  isLive: boolean;
}

interface StreamsPayload {
  channelId: string;
  streamsUrl: string;
  isLive: boolean;
  liveVideoId: string | null;
  liveTitle: string | null;
  latestStreamStartTime: string | null;
  latestStreamEndTime: string | null;
  latestStream: StreamEntry | null;
  streams: StreamEntry[];
}

interface RuntimeOverrides {
  schedule?: {
    serviceDay: number;
    serviceHour: number;
    serviceMinute: number;
    durationMinutes: number;
    preWindowMinutes: number;
    postDespuesMinutes?: number;
  };
  youtube?: {
    channelId: string;
    channelHandle: string;
    streamsUrl: string;
    apiKey: string;
  };
  sheets?: {
    googleSheetCsvUrl: string;
  };
  recordatorioEntrega?: string;
  forcedMode?: 'auto' | 'antes' | 'vivo' | 'despues';
  kioskPin?: string;
  updatedAt?: number;
  features?: {
    showTemasYAnuncios?: boolean;
    showMomentosSidebar?: boolean;
  };
  content?: {
    recordatorios: string[];
    temaHoy: { titulo: string; detalle: string };
    avisoEquipo: { titulo: string; detalle: string };
    eventosProximos: Array<{
      dia: string;
      mes: string;
      titulo: string;
      detalle: string;
    }>;
    anunciosDespues: Array<{
      dia: string;
      mes: string;
      titulo: string;
      detalle: string;
    }>;
    versiculoDespues: { texto: string; cita: string };
  };
}

const DEFAULT_CHANNEL_ID = 'UC78ofRM0f1O4Sg8TWOc6FHg';
const DEFAULT_HANDLE = '@iglesiagrancomisionsansalv5614';
const CACHE_TTL_MS = 15_000;
const FORCE_MIN_INTERVAL_MS = 5_000;

let cachedStreams: { timestamp: number; data: StreamsPayload } | null = null;

interface WatchBroadcastInfo {
  videoId: string;
  channelId: string | null;
  title: string | null;
  isLive: boolean;
  isLiveContent: boolean;
  startTimestamp: string | null;
  endTimestamp: string | null;
}

const watchInfoCache = new Map<
  string,
  { fetchedAt: number; info: WatchBroadcastInfo }
>();

function getOverridesPath(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(__dirname, 'data', 'signage-config.json');
}

function readOverrides(): RuntimeOverrides {
  const filePath = getOverridesPath();
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as RuntimeOverrides;
  } catch {
    return {};
  }
}

function writeOverrides(next: RuntimeOverrides): void {
  const filePath = getOverridesPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf-8');
}

function extractStreamEntries(html: string): {
  channelId: string;
  streams: StreamEntry[];
} {
  const channelMatch = html.match(/"externalId":"(UC[a-zA-Z0-9_-]{22})"/);
  const channelId = channelMatch?.[1] ?? DEFAULT_CHANNEL_ID;

  const dataMatch = html.match(/var ytInitialData = (\{.*?\});<\/script>/);
  if (!dataMatch) {
    return { channelId, streams: [] };
  }

  const data = JSON.parse(dataMatch[1]) as Record<string, unknown>;
  const contentsObj = data.contents as
    | {
        twoColumnBrowseResultsRenderer?: {
          tabs?: Array<{
            tabRenderer?: {
              selected?: boolean;
              title?: string;
              content?: {
                richGridRenderer?: {
                  contents?: Array<{
                    richItemRenderer?: {
                      content?: {
                        lockupViewModel?: Record<string, unknown>;
                        videoRenderer?: Record<string, unknown>;
                      };
                    };
                  }>;
                };
              };
            };
          }>;
        };
      }
    | undefined;

  const tabs = contentsObj?.twoColumnBrowseResultsRenderer?.tabs ?? [];
  const streamsTab =
    tabs.find((t) => t.tabRenderer?.selected) ??
    tabs.find((t) =>
      /En directo|Streams|En vivo|Live/i.test(t.tabRenderer?.title ?? ''),
    );

  const gridContents =
    streamsTab?.tabRenderer?.content?.richGridRenderer?.contents ?? [];

  const streams: StreamEntry[] = [];

  for (const item of gridContents) {
    const content = item.richItemRenderer?.content;
    if (!content) continue;

    if (content.lockupViewModel) {
      const vm = content.lockupViewModel as {
        contentId?: string;
        metadata?: {
          lockupMetadataViewModel?: {
            title?: { content?: string };
            metadata?: {
              contentMetadataViewModel?: {
                metadataRows?: Array<{
                  metadataParts?: Array<{
                    text?: { content?: string };
                  }>;
                }>;
              };
            };
          };
        };
        contentImage?: {
          thumbnailViewModel?: {
            overlays?: Array<{
              thumbnailBottomOverlayViewModel?: {
                badges?: Array<{
                  thumbnailBadgeViewModel?: {
                    text?: string;
                    badgeStyle?: string;
                  };
                }>;
              };
            }>;
          };
        };
      };

      const videoId = vm.contentId;
      if (!videoId) continue;

      const title =
        vm.metadata?.lockupMetadataViewModel?.title?.content ??
        'Transmisión Iglesia Gran Comisión';

      const rows =
        vm.metadata?.lockupMetadataViewModel?.metadata
          ?.contentMetadataViewModel?.metadataRows ?? [];
      const parts = rows.flatMap(
        (r) => r.metadataParts?.map((p) => p.text?.content ?? '') ?? [],
      );
      const publishedText =
        parts.find((text) =>
          /emitido|transmitido|en directo|viendo|watching|espectadores|streamed/i.test(
            text,
          ),
        ) ??
        parts[parts.length - 1] ??
        '';

      const badges =
        vm.contentImage?.thumbnailViewModel?.overlays?.flatMap(
          (o) =>
            o.thumbnailBottomOverlayViewModel?.badges?.map(
              (b) => b.thumbnailBadgeViewModel,
            ) ?? [],
        ) ?? [];

      const isLive =
        badges.some(
          (b) =>
            b?.badgeStyle === 'THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE' ||
            /^(EN VIVO|EN DIRECTO|LIVE)$/i.test((b?.text ?? '').trim()),
        ) || parts.some((text) => /\b(viendo|watching|espectadores)\b/i.test(text));

      streams.push({ videoId, title, publishedText, isLive });
    } else if (content.videoRenderer) {
      const vr = content.videoRenderer as {
        videoId?: string;
        title?: { runs?: Array<{ text?: string }> };
        publishedTimeText?: { simpleText?: string };
        badges?: Array<{
          metadataBadgeRenderer?: { style?: string; label?: string };
        }>;
        thumbnailOverlays?: Array<{
          thumbnailOverlayTimeStatusRenderer?: { style?: string };
        }>;
      };

      if (!vr.videoId) continue;
      const title =
        vr.title?.runs?.map((r) => r.text ?? '').join('') ||
        'Transmisión Iglesia Gran Comisión';
      const publishedText = vr.publishedTimeText?.simpleText ?? '';
      const isLive = Boolean(
        vr.badges?.some(
          (b) =>
            b.metadataBadgeRenderer?.style === 'BADGE_STYLE_TYPE_LIVE_NOW',
        ) ||
          vr.thumbnailOverlays?.some(
            (o) => o.thumbnailOverlayTimeStatusRenderer?.style === 'LIVE',
          ),
      );

      streams.push({
        videoId: vr.videoId,
        title,
        publishedText,
        isLive,
      });
    }

    if (streams.length >= 10) break;
  }

  return { channelId, streams };
}

const YT_HEADERS = {
  'Accept-Language': 'es-SV,es;q=0.9,en;q=0.8',
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

interface ResolvedTarget {
  kind: 'handle' | 'channel' | 'video';
  value: string;
  streamsUrl: string;
  liveUrl?: string;
}

function resolveYouTubeTarget(rawInput: string): ResolvedTarget {
  const input = rawInput.trim();
  if (!input) {
    return {
      kind: 'handle',
      value: DEFAULT_HANDLE,
      streamsUrl: `https://www.youtube.com/${DEFAULT_HANDLE}/streams`,
      liveUrl: `https://www.youtube.com/${DEFAULT_HANDLE}/live`,
    };
  }

  // Direct video ID (11 chars)
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
    return {
      kind: 'video',
      value: input,
      streamsUrl: `https://www.youtube.com/watch?v=${input}`,
    };
  }

  // Direct channel ID (UC...)
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(input)) {
    return {
      kind: 'channel',
      value: input,
      streamsUrl: `https://www.youtube.com/channel/${input}/streams`,
      liveUrl: `https://www.youtube.com/channel/${input}/live`,
    };
  }

  // Direct @handle
  if (/^@[a-zA-Z0-9._-]+$/.test(input)) {
    return {
      kind: 'handle',
      value: input,
      streamsUrl: `https://www.youtube.com/${input}/streams`,
      liveUrl: `https://www.youtube.com/${input}/live`,
    };
  }

  // Try URL parsing
  try {
    const normalizedUrl = input.startsWith('http') ? input : `https://${input}`;
    const url = new URL(normalizedUrl);
    const host = url.hostname.toLowerCase();

    if (host.includes('youtu.be')) {
      const vid = url.pathname.replace(/^\/+/, '').split('/')[0];
      if (vid && /^[a-zA-Z0-9_-]{11}$/.test(vid)) {
        return {
          kind: 'video',
          value: vid,
          streamsUrl: `https://www.youtube.com/watch?v=${vid}`,
        };
      }
    }

    if (host.includes('youtube.com')) {
      const watchV = url.searchParams.get('v');
      if (watchV && /^[a-zA-Z0-9_-]{11}$/.test(watchV)) {
        return {
          kind: 'video',
          value: watchV,
          streamsUrl: `https://www.youtube.com/watch?v=${watchV}`,
        };
      }

      const livePathMatch = url.pathname.match(/^\/live\/([a-zA-Z0-9_-]{11})/);
      if (livePathMatch) {
        return {
          kind: 'video',
          value: livePathMatch[1],
          streamsUrl: `https://www.youtube.com/watch?v=${livePathMatch[1]}`,
        };
      }

      const channelMatch = url.pathname.match(/^\/channel\/(UC[a-zA-Z0-9_-]{22})/);
      if (channelMatch) {
        return {
          kind: 'channel',
          value: channelMatch[1],
          streamsUrl: `https://www.youtube.com/channel/${channelMatch[1]}/streams`,
          liveUrl: `https://www.youtube.com/channel/${channelMatch[1]}/live`,
        };
      }

      const handleMatch = url.pathname.match(/^\/(@[a-zA-Z0-9._-]+)/);
      if (handleMatch) {
        return {
          kind: 'handle',
          value: handleMatch[1],
          streamsUrl: `https://www.youtube.com/${handleMatch[1]}/streams`,
          liveUrl: `https://www.youtube.com/${handleMatch[1]}/live`,
        };
      }
    }
  } catch {
    // Fallback below
  }

  return {
    kind: 'handle',
    value: DEFAULT_HANDLE,
    streamsUrl: `https://www.youtube.com/${DEFAULT_HANDLE}/streams`,
    liveUrl: `https://www.youtube.com/${DEFAULT_HANDLE}/live`,
  };
}

function extractJsonAfterMarker(
  html: string,
  marker: string,
): Record<string, unknown> | null {
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const start = html.indexOf('{', idx + marker.length);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function parseWatchBroadcastFromHtml(
  html: string,
  expectedVideoId?: string,
): WatchBroadcastInfo | null {
  const playerResponse =
    extractJsonAfterMarker(html, 'var ytInitialPlayerResponse =') ??
    extractJsonAfterMarker(html, 'ytInitialPlayerResponse =');

  const videoDetails = playerResponse?.videoDetails as
    | {
        videoId?: string;
        channelId?: string;
        title?: string;
        isLive?: boolean;
        isLiveContent?: boolean;
      }
    | undefined;

  const microformat = (
    playerResponse?.microformat as
      | {
          playerMicroformatRenderer?: {
            liveBroadcastDetails?: {
              isLiveNow?: boolean;
              startTimestamp?: string;
              endTimestamp?: string;
            };
          };
        }
      | undefined
  )?.playerMicroformatRenderer;

  const liveDetails = microformat?.liveBroadcastDetails;
  const parsedVideoId = videoDetails?.videoId ?? expectedVideoId ?? null;
  if (!parsedVideoId) return null;

  const metaTitle = html.match(/<meta name="title" content="([^"]+)"/)?.[1]?.trim();
  const docTitle = html
    .match(/<title>([^<]+)<\/title>/)?.[1]
    ?.replace(/\s*-\s*YouTube$/, '')
    .trim();

  const endTimestamp = liveDetails?.endTimestamp ?? null;
  const startTimestamp = liveDetails?.startTimestamp ?? null;
  const isLiveNowFlag = Boolean(videoDetails?.isLive || liveDetails?.isLiveNow);
  const isLive = isLiveNowFlag && !endTimestamp;
  const isLiveContent = Boolean(
    videoDetails?.isLiveContent || isLiveNowFlag || startTimestamp || endTimestamp,
  );

  return {
    videoId: parsedVideoId,
    channelId: videoDetails?.channelId ?? null,
    title: videoDetails?.title?.trim() || metaTitle || docTitle || null,
    isLive,
    isLiveContent,
    startTimestamp,
    endTimestamp,
  };
}

async function fetchWatchBroadcastInfo(
  videoId: string,
  force = false,
): Promise<WatchBroadcastInfo | null> {
  const cached = watchInfoCache.get(videoId);
  if (cached) {
    const ttl = cached.info.endTimestamp ? 600_000 : CACHE_TTL_MS;
    const minRefresh = force ? FORCE_MIN_INTERVAL_MS : ttl;
    if (Date.now() - cached.fetchedAt < minRefresh) {
      return cached.info;
    }
  }

  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: YT_HEADERS,
    });
    if (!res.ok) return null;
    const html = await res.text();
    const info = parseWatchBroadcastFromHtml(html, videoId);
    if (info) {
      watchInfoCache.set(videoId, { fetchedAt: Date.now(), info });
    }
    return info;
  } catch {
    return null;
  }
}

async function detectLiveFromChannelLivePage(
  liveUrl: string,
): Promise<{ videoId: string; title: string; channelId: string | null } | null> {
  try {
    const res = await fetch(liveUrl, { headers: YT_HEADERS });
    if (!res.ok) return null;
    const html = await res.text();
    const info = parseWatchBroadcastFromHtml(html);
    if (!info || !info.isLive) return null;

    return {
      videoId: info.videoId,
      title: info.title || 'Transmisión en vivo',
      channelId: info.channelId,
    };
  } catch {
    return null;
  }
}

async function fetchChannelStreams(
  rawTarget: string,
  force = false,
): Promise<StreamsPayload> {
  const target = resolveYouTubeTarget(rawTarget);

  if (
    cachedStreams &&
    cachedStreams.data.streamsUrl === target.streamsUrl &&
    Date.now() - cachedStreams.timestamp <
      (force ? FORCE_MIN_INTERVAL_MS : CACHE_TTL_MS)
  ) {
    return cachedStreams.data;
  }

  if (target.kind === 'video') {
    const watchInfo = await fetchWatchBroadcastInfo(target.value, force);
    const title = watchInfo?.title || 'Transmisión seleccionada';
    const channelId = watchInfo?.channelId || DEFAULT_CHANNEL_ID;
    const isLive = Boolean(watchInfo?.isLive);

    const entry: StreamEntry = {
      videoId: target.value,
      title,
      publishedText: isLive ? 'En vivo ahora' : 'Video seleccionado',
      isLive,
    };
    const payload: StreamsPayload = {
      channelId,
      streamsUrl: target.streamsUrl,
      isLive,
      liveVideoId: isLive ? target.value : null,
      liveTitle: isLive ? title : null,
      latestStreamStartTime: watchInfo?.startTimestamp ?? null,
      latestStreamEndTime: watchInfo?.endTimestamp ?? null,
      latestStream: entry,
      streams: [entry],
    };
    cachedStreams = { timestamp: Date.now(), data: payload };
    return payload;
  }

  const response = await fetch(target.streamsUrl, { headers: YT_HEADERS });
  if (!response.ok) {
    throw new Error(`YouTube streams responded with ${response.status}`);
  }

  const html = await response.text();
  const { channelId: parsedChannelId, streams } = extractStreamEntries(html);
  const channelId =
    target.kind === 'channel' ? target.value : parsedChannelId;
  let liveItem = streams.find((s) => s.isLive) ?? null;

  // Fallback to /live endpoint in case a 24/7 or active broadcast isn't flagged in /streams
  if (!liveItem && target.liveUrl) {
    const liveFallback = await detectLiveFromChannelLivePage(target.liveUrl);
    if (liveFallback) {
      liveItem = {
        videoId: liveFallback.videoId,
        title: liveFallback.title,
        publishedText: 'En vivo ahora',
        isLive: true,
      };
      if (!streams.some((s) => s.videoId === liveItem?.videoId)) {
        streams.unshift(liveItem);
      }
    }
  }

  const latestStream = streams[0] ?? null;
  let latestStreamStartTime: string | null = null;
  let latestStreamEndTime: string | null = null;

  // When no live item is detected on /streams, inspect the top stream's watch page for exact start/end timestamps
  if (!liveItem && latestStream) {
    const watchInfo = await fetchWatchBroadcastInfo(latestStream.videoId, force);
    if (watchInfo) {
      if (watchInfo.isLive) {
        liveItem = {
          videoId: latestStream.videoId,
          title: watchInfo.title || latestStream.title,
          publishedText: 'En vivo ahora',
          isLive: true,
        };
        latestStream.isLive = true;
      } else {
        latestStreamStartTime = watchInfo.startTimestamp;
        latestStreamEndTime = watchInfo.endTimestamp;
      }
    }
  }

  const payload: StreamsPayload = {
    channelId,
    streamsUrl: target.streamsUrl,
    isLive: Boolean(liveItem),
    liveVideoId: liveItem?.videoId ?? null,
    liveTitle: liveItem?.title ?? null,
    latestStreamStartTime,
    latestStreamEndTime,
    latestStream,
    streams,
  };

  cachedStreams = { timestamp: Date.now(), data: payload };
  return payload;
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '256kb' }));

  app.get('/api/youtube/streams', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const overrides = readOverrides();
    const force = req.query.force === '1';
    const rawTarget =
      typeof req.query.target === 'string' && req.query.target.trim()
        ? req.query.target.trim()
        : typeof req.query.handle === 'string' && req.query.handle.trim()
          ? req.query.handle.trim()
          : overrides.youtube?.streamsUrl ||
            overrides.youtube?.channelHandle ||
            overrides.youtube?.channelId ||
            DEFAULT_HANDLE;

    try {
      const payload = await fetchChannelStreams(rawTarget, force);
      res.json(payload);
    } catch {
      res.status(200).json({
        channelId: overrides.youtube?.channelId ?? DEFAULT_CHANNEL_ID,
        streamsUrl: `https://www.youtube.com/${DEFAULT_HANDLE}/streams`,
        isLive: false,
        liveVideoId: null,
        liveTitle: null,
        latestStreamStartTime: null,
        latestStreamEndTime: null,
        latestStream: null,
        streams: [],
      } satisfies StreamsPayload);
    }
  });

  app.get('/api/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(readOverrides());
  });

  app.put('/api/config', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const body = req.body as RuntimeOverrides;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ error: 'Configuración inválida' });
      return;
    }

    try {
      const stamped: RuntimeOverrides = {
        ...body,
        updatedAt: Date.now(),
      };
      writeOverrides(stamped);
      cachedStreams = null;
      res.json({ ok: true, config: stamped });
    } catch {
      res.status(500).json({ error: 'No se pudo guardar la configuración' });
    }
  });

  app.delete('/api/config', (_req, res) => {
    try {
      const filePath = getOverridesPath();
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      cachedStreams = null;
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'No se pudo restablecer la configuración' });
    }
  });

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store');
          }
        },
      }),
    );
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.setHeader('Cache-Control', 'no-store');
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Pantalla IGC running on http://0.0.0.0:${port}`);
  });
}

void startServer();
