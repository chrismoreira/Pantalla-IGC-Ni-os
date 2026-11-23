import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const STORAGE_KEY = 'igc_pantalla_cuidado_ninos_v2';

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
    showTeamAlert: false,
    muted: false,
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
        typeof parsed.showTeamAlert === 'boolean' ? parsed.showTeamAlert : false,
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : false,
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
  const [exitHintVisible, setExitHintVisible] = useState<boolean>(false);
  const isNativeKiosk =
    typeof window !== 'undefined' &&
    Boolean(window.IGCKiosk?.isNativeKiosk?.());
  const lastBackPressRef = useRef<number>(0);
  const exitHintTimerRef = useRef<number | null>(null);

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

  const lastConfigJsonRef = useRef<string>('');
  const lastUpdatedAtRef = useRef<number | null>(null);

  // Poll /api/config every 5s so admin panel edits sync to the TV almost immediately
  useEffect(() => {
    let cancelled = false;
    const urlMode = readUrlModeParam();

    const loadServerConfig = async () => {
      try {
        const res = await fetch(`/api/config?t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as RuntimeOverrides;
        if (!cancelled && data && typeof data === 'object') {
          const signature = JSON.stringify(data);
          if (signature !== lastConfigJsonRef.current) {
            lastConfigJsonRef.current = signature;
            setRuntimeOverrides(data);

            if (
              typeof data.updatedAt === 'number' &&
              lastUpdatedAtRef.current !== null &&
              data.updatedAt > lastUpdatedAtRef.current &&
              !urlMode &&
              data.forcedMode
            ) {
              setModeSetting(data.forcedMode);
            }
            if (typeof data.updatedAt === 'number') {
              lastUpdatedAtRef.current = data.updatedAt;
            }
          }
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
    }, 5_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // Sync admin-configured Fire TV exit PIN to native Android bridge when running in the APK
  useEffect(() => {
    if (adminView || !isNativeKiosk) return;
    window.IGCKiosk?.setExitPin?.(activeConfig.kioskPin);
  }, [adminView, isNativeKiosk, activeConfig.kioskPin]);

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
    modeSetting !== 'auto'
      ? modeSetting
      : activeConfig.forcedMode !== 'auto'
        ? activeConfig.forcedMode
        : windowInfo.autoScreen;

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

  const refreshStreams = useCallback(
    async (targetOverride?: string) => {
      const target =
        targetOverride?.trim() ||
        activeConfig.youtube.streamsUrl ||
        activeConfig.youtube.channelHandle ||
        activeConfig.youtube.channelId;

      const channelData = await fetchChannelStreams(target);

      if (!targetOverride && activeConfig.youtube.apiKey.trim()) {
        const apiResult = await pollYouTubeLiveStatus(
          channelData.channelId || activeConfig.youtube.channelId,
          activeConfig.youtube.apiKey,
          windowInfo.serviceStartMs,
          windowInfo.serviceEndMs,
        );
        setYtStatus({
          channelId: channelData.channelId,
          streamsUrl: channelData.streamsUrl,
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
        channelId: channelData.channelId,
        streamsUrl: channelData.streamsUrl,
        isLive: channelData.isLive,
        liveVideoId: channelData.liveVideoId,
        liveTitle: channelData.liveTitle,
        latestStream: channelData.latestStream,
        streams: channelData.streams,
        streamEndedToday: false,
      });
    },
    [
      activeConfig.youtube.streamsUrl,
      activeConfig.youtube.channelHandle,
      activeConfig.youtube.channelId,
      activeConfig.youtube.apiKey,
      windowInfo.serviceStartMs,
      windowInfo.serviceEndMs,
    ],
  );

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

      if (e.key === 'Escape' && isNativeKiosk) {
        e.preventDefault();
        const now = Date.now();
        if (now - lastBackPressRef.current < 1800) {
          lastBackPressRef.current = 0;
          setExitHintVisible(false);
          if (exitHintTimerRef.current !== null) {
            window.clearTimeout(exitHintTimerRef.current);
            exitHintTimerRef.current = null;
          }
          window.IGCKiosk?.requestExitWithPin?.();
        } else {
          lastBackPressRef.current = now;
          setExitHintVisible(true);
          if (exitHintTimerRef.current !== null) {
            window.clearTimeout(exitHintTimerRef.current);
          }
          exitHintTimerRef.current = window.setTimeout(() => {
            setExitHintVisible(false);
            exitHintTimerRef.current = null;
          }, 2200);
        }
        return;
      }

      if (e.key === 'ArrowLeft' && activeConfig.features.showMomentosSidebar) {
        e.preventDefault();
        handlePrevMoment();
      } else if (e.key === 'ArrowRight' && activeConfig.features.showMomentosSidebar) {
        e.preventDefault();
        handleNextMoment();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        handleToggleTeamAlert();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (exitHintTimerRef.current !== null) {
        window.clearTimeout(exitHintTimerRef.current);
        exitHintTimerRef.current = null;
      }
    };
  }, [
    adminView,
    menuOpen,
    isNativeKiosk,
    activeConfig.features.showMomentosSidebar,
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
          zIndex: 1,
        }}
      >
        {effectiveScreen === 'antes' && (
          <ScreenAntes
            svNow={svNow}
            countdownTargetMs={windowInfo.countdownTargetMs}
            content={effectiveContent}
            modeSetting={modeSetting}
            schedule={activeConfig.schedule}
            showTemaHoy={activeConfig.features.showTemasYAnuncios}
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
            channelId={ytStatus.channelId ?? activeConfig.youtube.channelId}
            stageScale={stageScale}
            showTemasYAnuncios={activeConfig.features.showTemasYAnuncios}
            showMomentosSidebar={activeConfig.features.showMomentosSidebar}
          />
        )}

        {effectiveScreen === 'despues' && (
          <ScreenDespues
            svNow={svNow}
            content={effectiveContent}
            modeSetting={modeSetting}
            schedule={activeConfig.schedule}
            recordatorioEntrega={activeConfig.recordatorioEntrega}
            showAnuncios={activeConfig.features.showTemasYAnuncios}
          />
        )}
      </div>

      {/* Capa superior para avisos y menú de control por encima del portal de video */}
      <div
        style={{
          position: 'fixed',
          width: '1920px',
          height: '1080px',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) scale(${stageScale})`,
          transformOrigin: 'center center',
          zIndex: 50,
          pointerEvents: menuOpen ? 'auto' : 'none',
        }}
      >
        {effectiveScreen === 'vivo' &&
          !activeConfig.features.showMomentosSidebar &&
          showTeamAlert && (
            <section
              className="absolute left-1/2 bottom-[36px] -translate-x-1/2 max-w-[1100px] rounded-[20px] px-[34px] py-[20px]"
              style={{
                backgroundColor: 'var(--naranja)',
                color: 'var(--verde3)',
              }}
            >
              <p className="font-display text-[18px] font-extrabold uppercase tracking-[0.1em]">
                {effectiveContent.avisoEquipo.titulo}
              </p>
              <p className="font-body text-[22px] font-semibold leading-[1.35] mt-1">
                {effectiveContent.avisoEquipo.detalle}
              </p>
            </section>
          )}

        {exitHintVisible && !menuOpen && (
          <div
            className="absolute top-[28px] left-1/2 -translate-x-1/2 rounded-[14px] px-6 py-3 font-display text-[20px] font-bold border-2"
            style={{
              backgroundColor: 'rgba(13, 39, 37, 0.94)',
              borderColor: 'var(--amarillo)',
              color: 'var(--crema)',
            }}
          >
            Presiona Atrás otra vez para ingresar PIN de salida
          </div>
        )}

        <ControlMenu
          isOpen={menuOpen}
          modeSetting={modeSetting}
          effectiveScreen={effectiveScreen}
          currentMoment={currentMoment}
          showTeamAlert={showTeamAlert}
          muted={muted}
          showMomentosSidebar={activeConfig.features.showMomentosSidebar}
          onChangeMode={setModeSetting}
          onPrevMoment={handlePrevMoment}
          onNextMoment={handleNextMoment}
          onToggleTeamAlert={handleToggleTeamAlert}
          onToggleMuted={handleToggleMuted}
          onRequestExitWithPin={
            isNativeKiosk
              ? () => window.IGCKiosk?.requestExitWithPin?.()
              : undefined
          }
          onClose={() => setMenuOpen(false)}
        />
      </div>
    </div>
  );
}
