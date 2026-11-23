import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminPanel } from './components/AdminPanel';
import { ControlMenu } from './components/ControlMenu';
import { ScreenAntes } from './components/ScreenAntes';
import { ScreenDespues } from './components/ScreenDespues';
import { ScreenVivo } from './components/ScreenVivo';
import {
  ActiveScreen,
  CONFIG,
  mergeWithRuntimeConfig,
  ModeSetting,
  RuntimeOverrides,
  SignageContent,
} from './config';
import { fetchSignageFromGoogleSheet } from './utils/sheets';
import { getElSalvadorNow, getServiceWindowState } from './utils/time';
import {
  fetchChannelStreams,
  pollYouTubeLiveStatus,
  YouTubeLiveStatus,
} from './utils/youtube';

const STORAGE_KEY = 'igc_pantalla_cuidado_ninos_v1';

interface PersistedState {
  modeSetting: ModeSetting;
  currentMoment: number;
  showTeamAlert: boolean;
  muted: boolean;
}

function isAdminRoute(): boolean {
  try {
    const path = window.location.pathname.toLowerCase();
    const params = new URLSearchParams(window.location.search);
    return path === '/admin' || path.startsWith('/admin/') || params.get('admin') === '1';
  } catch {
    return false;
  }
}

function readUrlModeParam(): ModeSetting | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('modo')?.trim().toLowerCase();
    if (raw === 'antes' || raw === 'vivo' || raw === 'despues' || raw === 'auto') {
      return raw;
    }
  } catch {
    // Ignore URL parsing errors
  }
  return null;
}

function loadInitialState(): PersistedState {
  const urlMode = readUrlModeParam();
  const fallback: PersistedState = {
    modeSetting: urlMode ?? 'auto',
    currentMoment: 0,
    showTeamAlert: true,
    muted: true,
  };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;

    const savedMode =
      parsed.modeSetting === 'auto' ||
      parsed.modeSetting === 'antes' ||
      parsed.modeSetting === 'vivo' ||
      parsed.modeSetting === 'despues'
        ? parsed.modeSetting
        : 'auto';

    const savedMoment =
      typeof parsed.currentMoment === 'number' &&
      parsed.currentMoment >= 0 &&
      parsed.currentMoment < CONFIG.momentos.length
        ? Math.floor(parsed.currentMoment)
        : 0;

    return {
      modeSetting: urlMode ?? savedMode,
      currentMoment: savedMoment,
      showTeamAlert:
        typeof parsed.showTeamAlert === 'boolean' ? parsed.showTeamAlert : true,
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : true,
    };
  } catch {
    return fallback;
  }
}

function saveState(state: PersistedState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors on restricted TV browsers
  }
}

export default function App() {
  const [adminView] = useState<boolean>(() => isAdminRoute());
  const [initialState] = useState<PersistedState>(() => loadInitialState());
  const [modeSetting, setModeSetting] = useState<ModeSetting>(
    initialState.modeSetting,
  );
  const [currentMoment, setCurrentMoment] = useState<number>(
    initialState.currentMoment,
  );
  const [showTeamAlert, setShowTeamAlert] = useState<boolean>(
    initialState.showTeamAlert,
  );
  const [muted, setMuted] = useState<boolean>(initialState.muted);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [stageScale, setStageScale] = useState<number>(() => {
    if (typeof window === 'undefined') return 1;
    return Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  });

  const [runtimeOverrides, setRuntimeOverrides] = useState<RuntimeOverrides>({});
  const [overridesLoaded, setOverridesLoaded] = useState<boolean>(false);
  const activeConfig = useMemo(
    () => mergeWithRuntimeConfig(runtimeOverrides),
    [runtimeOverrides],
  );

  const [sheetContent, setSheetContent] = useState<SignageContent | null>(null);
  const effectiveContent = sheetContent ?? activeConfig.defaults;

  const [ytStatus, setYtStatus] = useState<YouTubeLiveStatus>({
    isLive: false,
    liveVideoId: null,
    liveTitle: null,
    latestStream: null,
    streams: [],
    streamEndedToday: false,
  });

  // Poll /api/config every 30s so admin panel edits sync to the TV automatically
  useEffect(() => {
    let cancelled = false;
    const loadServerConfig = async () => {
      try {
        const res = await fetch('/api/config', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as RuntimeOverrides;
        if (!cancelled && data && typeof data === 'object') {
          setRuntimeOverrides(data);
        }
      } catch {
        // Ignore if static hosting without backend
      } finally {
        if (!cancelled) {
          setOverridesLoaded(true);
        }
      }
    };

    void loadServerConfig();
    const interval = window.setInterval(() => {
      void loadServerConfig();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // Persist TV remote state in localStorage
  useEffect(() => {
    if (adminView) return;
    saveState({
      modeSetting,
      currentMoment,
      showTeamAlert,
      muted,
    });
  }, [adminView, modeSetting, currentMoment, showTeamAlert, muted]);

  // Proportional 1920x1080 stage scaling
  useEffect(() => {
    if (adminView) return;
    const updateScale = () => {
      const scale = Math.min(
        window.innerWidth / 1920,
        window.innerHeight / 1080,
      );
      setStageScale(scale);
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [adminView]);

  // 1-second clock & countdown ticker
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const svNow = useMemo(() => getElSalvadorNow(nowMs), [nowMs]);
  const windowInfo = useMemo(
    () =>
      getServiceWindowState(
        nowMs,
        ytStatus.streamEndedToday,
        activeConfig.schedule,
      ),
    [nowMs, ytStatus.streamEndedToday, activeConfig.schedule],
  );

  const effectiveScreen: ActiveScreen =
    modeSetting === 'auto' ? windowInfo.autoScreen : modeSetting;

  // Google Sheets CSV polling (every 5 minutes)
  useEffect(() => {
    const csvUrl = activeConfig.sheets.googleSheetCsvUrl.trim();
    if (!csvUrl) {
      setSheetContent(null);
      return;
    }

    let cancelled = false;
    const loadSheet = async () => {
      const nextContent = await fetchSignageFromGoogleSheet(
        csvUrl,
        activeConfig.defaults,
      );
      if (!cancelled) {
        setSheetContent(nextContent);
      }
    };

    void loadSheet();
    const interval = window.setInterval(() => {
      void loadSheet();
    }, activeConfig.sheets.pollIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    activeConfig.sheets.googleSheetCsvUrl,
    activeConfig.sheets.pollIntervalMs,
    activeConfig.defaults,
  ]);

  const refreshStreams = useCallback(async () => {
    const channelData = await fetchChannelStreams(
      activeConfig.youtube.channelHandle,
    );

    if (activeConfig.youtube.apiKey.trim()) {
      const apiResult = await pollYouTubeLiveStatus(
        activeConfig.youtube.channelId,
        activeConfig.youtube.apiKey,
        windowInfo.serviceStartMs,
        windowInfo.serviceEndMs,
      );
      setYtStatus({
        isLive: apiResult.isLive || channelData.isLive,
        liveVideoId: apiResult.liveVideoId ?? channelData.liveVideoId,
        liveTitle: apiResult.liveTitle ?? channelData.liveTitle,
        latestStream: channelData.latestStream,
        streams: channelData.streams,
        streamEndedToday: apiResult.streamEndedToday,
      });
      return;
    }

    setYtStatus({
      isLive: channelData.isLive,
      liveVideoId: channelData.liveVideoId,
      liveTitle: channelData.liveTitle,
      latestStream: channelData.latestStream,
      streams: channelData.streams,
      streamEndedToday: false,
    });
  }, [
    activeConfig.youtube.channelHandle,
    activeConfig.youtube.channelId,
    activeConfig.youtube.apiKey,
    windowInfo.serviceStartMs,
    windowInfo.serviceEndMs,
  ]);

  // Poll channel /streams endpoint + optional YouTube Data API v3 (every 90 seconds)
  useEffect(() => {
    void refreshStreams();
    const interval = window.setInterval(() => {
      void refreshStreams();
    }, activeConfig.youtube.pollIntervalMs);

    return () => window.clearInterval(interval);
  }, [refreshStreams, activeConfig.youtube.pollIntervalMs]);

  const handlePrevMoment = useCallback(() => {
    setCurrentMoment((prev) => Math.max(0, prev - 1));
  }, []);

  const handleNextMoment = useCallback(() => {
    setCurrentMoment((prev) =>
      Math.min(CONFIG.momentos.length - 1, prev + 1),
    );
  }, []);

  const handleToggleTeamAlert = useCallback(() => {
    setShowTeamAlert((prev) => !prev);
  }, []);

  const handleToggleMuted = useCallback(() => {
    setMuted((prev) => !prev);
  }, []);

  // Fire TV remote control & keyboard listener when menu is closed
  useEffect(() => {
    if (adminView) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (menuOpen) return;

      if (
        e.key === 'Enter' ||
        e.key === ' ' ||
        e.key === 'Spacebar' ||
        e.key === 'm' ||
        e.key === 'M'
      ) {
        e.preventDefault();
        setMenuOpen(true);
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevMoment();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextMoment();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        handleToggleTeamAlert();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    adminView,
    menuOpen,
    handlePrevMoment,
    handleNextMoment,
    handleToggleTeamAlert,
  ]);

  if (adminView) {
    if (!overridesLoaded) {
      return (
        <div className="admin-shell flex items-center justify-center min-h-screen">
          <p className="font-display text-lg font-bold" style={{ color: 'var(--arena)' }}>
            Cargando configuración...
          </p>
        </div>
      );
    }

    return (
      <AdminPanel
        svNow={svNow}
        autoScreen={windowInfo.autoScreen}
        activeConfig={activeConfig}
        effectiveContent={effectiveContent}
        ytStatus={ytStatus}
        onRefreshStreams={refreshStreams}
        onSavedConfig={(next) => setRuntimeOverrides(next)}
        onResetConfig={async () => {
          await fetch('/api/config', { method: 'DELETE' });
          setRuntimeOverrides({});
          setSheetContent(null);
        }}
      />
    );
  }

  return (
    <div id="viewport">
      <div
        id="stage"
        style={{
          transform: `scale(${stageScale})`,
        }}
      >
        {effectiveScreen === 'antes' && (
          <ScreenAntes
            svNow={svNow}
            countdownTargetMs={windowInfo.countdownTargetMs}
            content={effectiveContent}
            modeSetting={modeSetting}
            schedule={activeConfig.schedule}
          />
        )}

        {effectiveScreen === 'vivo' && (
          <ScreenVivo
            svNow={svNow}
            content={effectiveContent}
            currentMoment={currentMoment}
            onSelectMoment={setCurrentMoment}
            showTeamAlert={showTeamAlert}
            muted={muted}
            liveVideoId={
              ytStatus.isLive
                ? ytStatus.liveVideoId
                : (ytStatus.latestStream?.videoId ?? null)
            }
            liveTitle={
              ytStatus.isLive
                ? ytStatus.liveTitle
                : (ytStatus.latestStream?.title ?? null)
            }
            isLiveNow={ytStatus.isLive}
            modeSetting={modeSetting}
          />
        )}

        {effectiveScreen === 'despues' && (
          <ScreenDespues
            svNow={svNow}
            content={effectiveContent}
            modeSetting={modeSetting}
            schedule={activeConfig.schedule}
            recordatorioEntrega={activeConfig.recordatorioEntrega}
          />
        )}

        <ControlMenu
          isOpen={menuOpen}
          modeSetting={modeSetting}
          effectiveScreen={effectiveScreen}
          currentMoment={currentMoment}
          showTeamAlert={showTeamAlert}
          muted={muted}
          onChangeMode={setModeSetting}
          onPrevMoment={handlePrevMoment}
          onNextMoment={handleNextMoment}
          onToggleTeamAlert={handleToggleTeamAlert}
          onToggleMuted={handleToggleMuted}
          onClose={() => setMenuOpen(false)}
        />
      </div>
    </div>
  );
}
