import { useCallback, useEffect, useMemo, useState } from 'react';
import { ControlMenu } from './components/ControlMenu';
import { ScreenAntes } from './components/ScreenAntes';
import { ScreenDespues } from './components/ScreenDespues';
import { ScreenVivo } from './components/ScreenVivo';
import { ActiveScreen, CONFIG, ModeSetting, SignageContent } from './config';
import { fetchSignageFromGoogleSheet } from './utils/sheets';
import { getElSalvadorNow, getServiceWindowState } from './utils/time';
import { pollYouTubeLiveStatus, YouTubeLiveStatus } from './utils/youtube';

const STORAGE_KEY = 'igc_pantalla_cuidado_ninos_v1';

interface PersistedState {
  modeSetting: ModeSetting;
  currentMoment: number;
  showTeamAlert: boolean;
  muted: boolean;
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

  const [content, setContent] = useState<SignageContent>(CONFIG.defaults);
  const [ytStatus, setYtStatus] = useState<YouTubeLiveStatus>({
    isLive: false,
    liveVideoId: null,
    liveTitle: null,
    streamEndedToday: false,
  });

  // Persist state in localStorage whenever settings change
  useEffect(() => {
    saveState({
      modeSetting,
      currentMoment,
      showTeamAlert,
      muted,
    });
  }, [modeSetting, currentMoment, showTeamAlert, muted]);

  // Proportional 1920x1080 stage scaling
  useEffect(() => {
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
  }, []);

  // 1-second clock & countdown ticker
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const svNow = useMemo(() => getElSalvadorNow(nowMs), [nowMs]);
  const windowInfo = useMemo(
    () => getServiceWindowState(nowMs, ytStatus.streamEndedToday),
    [nowMs, ytStatus.streamEndedToday],
  );

  const effectiveScreen: ActiveScreen =
    modeSetting === 'auto' ? windowInfo.autoScreen : modeSetting;

  // Google Sheets CSV polling (every 5 minutes)
  useEffect(() => {
    if (!CONFIG.sheets.googleSheetCsvUrl.trim()) {
      setContent(CONFIG.defaults);
      return;
    }

    let cancelled = false;
    const loadSheet = async () => {
      const nextContent = await fetchSignageFromGoogleSheet(
        CONFIG.sheets.googleSheetCsvUrl,
        CONFIG.defaults,
      );
      if (!cancelled) {
        setContent(nextContent);
      }
    };

    void loadSheet();
    const interval = window.setInterval(() => {
      void loadSheet();
    }, CONFIG.sheets.pollIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  // Optional YouTube Data API v3 polling (every 90 seconds)
  useEffect(() => {
    if (!CONFIG.youtube.apiKey.trim()) {
      return;
    }

    let cancelled = false;
    const checkYouTube = async () => {
      const result = await pollYouTubeLiveStatus(
        CONFIG.youtube.channelId,
        CONFIG.youtube.apiKey,
        windowInfo.serviceStartMs,
        windowInfo.serviceEndMs,
      );
      if (!cancelled) {
        setYtStatus(result);
      }
    };

    void checkYouTube();
    const interval = window.setInterval(() => {
      void checkYouTube();
    }, CONFIG.youtube.pollIntervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [windowInfo.serviceStartMs, windowInfo.serviceEndMs]);

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
  }, [menuOpen, handlePrevMoment, handleNextMoment, handleToggleTeamAlert]);

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
            content={content}
            modeSetting={modeSetting}
          />
        )}

        {effectiveScreen === 'vivo' && (
          <ScreenVivo
            svNow={svNow}
            content={content}
            currentMoment={currentMoment}
            onSelectMoment={setCurrentMoment}
            showTeamAlert={showTeamAlert}
            muted={muted}
            liveVideoId={ytStatus.liveVideoId}
            liveTitle={ytStatus.liveTitle}
            modeSetting={modeSetting}
          />
        )}

        {effectiveScreen === 'despues' && (
          <ScreenDespues
            svNow={svNow}
            content={content}
            modeSetting={modeSetting}
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
