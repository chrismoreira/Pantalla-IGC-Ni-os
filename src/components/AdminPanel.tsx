import { useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import {
  ActiveScreen,
  AnnouncementItem,
  CONFIG,
  ModeSetting,
  RuntimeOverrides,
  sanitizeKioskPin,
  SignageConfig,
  SignageContent,
} from '../config';
import { fetchSignageFromGoogleSheet } from '../utils/sheets';
import { ElSalvadorWallTime, formatClock12h, formatDateEs } from '../utils/time';
import { fetchChannelStreams, YouTubeLiveStatus } from '../utils/youtube';
import { IgcLogo } from './IgcLogo';

interface AdminPanelProps {
  svNow: ElSalvadorWallTime;
  autoScreen: ActiveScreen;
  activeConfig: SignageConfig;
  effectiveContent: SignageContent;
  ytStatus: YouTubeLiveStatus;
  onRefreshStreams: (targetOverride?: string, force?: boolean) => Promise<void>;
  onSavedConfig: (next: RuntimeOverrides) => void;
  onResetConfig: () => Promise<void>;
}

const DAYS_ES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

export function AdminPanel({
  svNow,
  autoScreen,
  activeConfig,
  effectiveContent,
  ytStatus,
  onRefreshStreams,
  onSavedConfig,
  onResetConfig,
}: AdminPanelProps) {
  const [schedule, setSchedule] = useState(activeConfig.schedule);
  const [youtube, setYoutube] = useState({
    channelId: activeConfig.youtube.channelId,
    channelHandle: activeConfig.youtube.channelHandle,
    streamsUrl: activeConfig.youtube.streamsUrl,
    apiKey: activeConfig.youtube.apiKey,
  });
  const [youtubeInput, setYoutubeInput] = useState(
    activeConfig.youtube.streamsUrl || activeConfig.youtube.channelHandle,
  );
  const [forcedMode, setForcedMode] = useState<ModeSetting>(activeConfig.forcedMode);
  const [kioskPin, setKioskPin] = useState<string>(activeConfig.kioskPin);
  const [sheetUrl, setSheetUrl] = useState(activeConfig.sheets.googleSheetCsvUrl);
  const [recordatorioEntrega, setRecordatorioEntrega] = useState(
    activeConfig.recordatorioEntrega,
  );
  const [features, setFeatures] = useState(activeConfig.features);
  const [content, setContent] = useState<SignageContent>(effectiveContent);

  const [saving, setSaving] = useState(false);
  const [refreshingYt, setRefreshingYt] = useState(false);
  const [testingCsv, setTestingCsv] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'ok' | 'error';
    message: string;
  } | null>(null);

  const buildNormalizedYoutube = async () => {
    const raw = youtubeInput.trim() || CONFIG.youtube.channelHandle;
    const probed = await fetchChannelStreams(raw);
    const resolvedStreamsUrl = probed.streamsUrl || raw;
    const handleMatch = resolvedStreamsUrl.match(/\/(@[a-zA-Z0-9._-]+)/);
    return {
      channelId: probed.channelId || youtube.channelId || CONFIG.youtube.channelId,
      channelHandle: handleMatch?.[1] ?? (raw.startsWith('@') ? raw : ''),
      streamsUrl: resolvedStreamsUrl,
      apiKey: youtube.apiKey,
    };
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);

    try {
      const normalizedYoutube = await buildNormalizedYoutube();
      setYoutube(normalizedYoutube);

      const safePin = sanitizeKioskPin(kioskPin);
      setKioskPin(safePin);

      const payload: RuntimeOverrides = {
        schedule,
        youtube: normalizedYoutube,
        sheets: { googleSheetCsvUrl: sheetUrl.trim() },
        recordatorioEntrega,
        forcedMode,
        kioskPin: safePin,
        features,
        content,
      };

      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Error al guardar');
      onSavedConfig(payload);
      await onRefreshStreams(normalizedYoutube.streamsUrl, true);
      setFeedback({
        type: 'ok',
        message:
          'Cambios guardados. La pantalla del televisor se actualizará automáticamente en unos segundos.',
      });
    } catch {
      setFeedback({
        type: 'error',
        message: 'No se pudo guardar la configuración en el servidor.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await onResetConfig();
      setSchedule(CONFIG.schedule);
      setYoutube({
        channelId: CONFIG.youtube.channelId,
        channelHandle: CONFIG.youtube.channelHandle,
        streamsUrl: CONFIG.youtube.streamsUrl,
        apiKey: CONFIG.youtube.apiKey,
      });
      setYoutubeInput(CONFIG.youtube.streamsUrl);
      setForcedMode(CONFIG.forcedMode);
      setKioskPin(CONFIG.kioskPin);
      setSheetUrl(CONFIG.sheets.googleSheetCsvUrl);
      setRecordatorioEntrega(CONFIG.recordatorioEntrega);
      setFeatures(CONFIG.features);
      setContent(CONFIG.defaults);
      await onRefreshStreams(CONFIG.youtube.streamsUrl, true);
      setFeedback({
        type: 'ok',
        message: 'Se restablecieron los valores predeterminados.',
      });
    } catch {
      setFeedback({
        type: 'error',
        message: 'No se pudo restablecer la configuración.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshYouTube = async () => {
    setRefreshingYt(true);
    setFeedback(null);
    try {
      const normalizedYoutube = await buildNormalizedYoutube();
      setYoutube(normalizedYoutube);
      await onRefreshStreams(normalizedYoutube.streamsUrl, true);
      setFeedback({
        type: 'ok',
        message: `Canal consultado: ${normalizedYoutube.streamsUrl}. Si deseas aplicarlo en la TV, presiona "Guardar cambios para la TV".`,
      });
    } finally {
      setRefreshingYt(false);
    }
  };

  const handleRestoreIgcChannel = async () => {
    setYoutubeInput(CONFIG.youtube.streamsUrl);
    setForcedMode('auto');
    setRefreshingYt(true);
    setYoutube({
      channelId: CONFIG.youtube.channelId,
      channelHandle: CONFIG.youtube.channelHandle,
      streamsUrl: CONFIG.youtube.streamsUrl,
      apiKey: youtube.apiKey,
    });
    await onRefreshStreams(CONFIG.youtube.streamsUrl);
    setRefreshingYt(false);
    setFeedback({
      type: 'ok',
      message:
        'Canal IGC y modo Automático cargados. Presiona "Guardar cambios para la TV" para aplicarlo.',
    });
  };

  const handleTestSheet = async () => {
    if (!sheetUrl.trim()) {
      setFeedback({
        type: 'error',
        message: 'Ingresa primero la URL CSV publicada de Google Sheets.',
      });
      return;
    }
    setTestingCsv(true);
    setFeedback(null);
    const loaded = await fetchSignageFromGoogleSheet(sheetUrl.trim(), content);
    setContent(loaded);
    setTestingCsv(false);
    setFeedback({
      type: 'ok',
      message: 'Datos cargados desde Google Sheets. Presiona Guardar cambios para aplicarlos en la TV.',
    });
  };

  const updateListItem = (
    list: AnnouncementItem[],
    index: number,
    patch: Partial<AnnouncementItem>,
  ): AnnouncementItem[] =>
    list.map((item, idx) => (idx === index ? { ...item, ...patch } : item));

  return (
    <div className="admin-shell">
      <div className="max-w-[1160px] mx-auto px-6 py-8 space-y-8">
        {/* Cabecera */}
        <header
          className="rounded-2xl p-6 flex flex-wrap items-center justify-between gap-6"
          style={{ backgroundColor: 'var(--verde)' }}
        >
          <div className="flex items-center gap-4">
            <IgcLogo height={54} variant="on-dark" />
            <div>
              <p
                className="font-display text-xs font-bold uppercase tracking-widest"
                style={{ color: 'var(--turquesa)' }}
              >
                {CONFIG.city}
              </p>
              <h1
                className="font-display text-2xl font-extrabold"
                style={{ color: 'var(--crema)' }}
              >
                Panel de administración · {CONFIG.ministryName}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {(
              [
                ['/?modo=auto', 'Ver TV (Auto)'],
                ['/?modo=antes', 'Antes'],
                ['/?modo=vivo', 'En vivo'],
                ['/?modo=despues', 'Después'],
              ] as const
            ).map(([href, label]) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-display text-sm font-bold transition-opacity hover:opacity-90"
                style={{
                  backgroundColor:
                    href === '/?modo=auto' ? 'var(--turquesa)' : 'var(--verde2)',
                  color:
                    href === '/?modo=auto' ? 'var(--verde3)' : 'var(--crema)',
                }}
              >
                {label}
                <ExternalLink size={14} />
              </a>
            ))}
          </div>
        </header>

        {/* Mensaje de estado */}
        {feedback && (
          <div
            className="rounded-xl px-5 py-3.5 font-body text-sm font-semibold flex items-center gap-3"
            style={{
              backgroundColor:
                feedback.type === 'ok' ? 'var(--turquesa)' : 'var(--naranja)',
              color: 'var(--verde3)',
            }}
          >
            <CheckCircle2 size={18} />
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Estado en vivo y Streamings detectados */}
        <section
          className="rounded-2xl p-6 space-y-5"
          style={{ backgroundColor: 'var(--verde)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2
                className="font-display text-xl font-bold"
                style={{ color: 'var(--crema)' }}
              >
                Estado de transmisión y reloj (El Salvador)
              </h2>
              <p className="font-body text-sm mt-1" style={{ color: 'var(--arena)' }}>
                {formatDateEs(svNow)} · {formatClock12h(svNow)} · Pantalla automática actual:{' '}
                <strong style={{ color: 'var(--amarillo)' }}>
                  {autoScreen === 'antes'
                    ? 'Antes'
                    : autoScreen === 'vivo'
                      ? 'En vivo'
                      : 'Después'}
                </strong>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleRestoreIgcChannel}
                disabled={refreshingYt}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg font-display text-sm font-bold"
                style={{
                  backgroundColor: 'var(--verde2)',
                  color: 'var(--crema)',
                }}
              >
                Restaurar canal IGC
              </button>

              <button
                type="button"
                onClick={handleRefreshYouTube}
                disabled={refreshingYt}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-display text-sm font-bold"
                style={{
                  backgroundColor: 'var(--amarillo)',
                  color: 'var(--verde3)',
                }}
              >
                <RefreshCw
                  size={16}
                  className={refreshingYt ? 'animate-spin' : ''}
                />
                {refreshingYt ? 'Consultando...' : 'Probar canal ahora'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <label className="block md:col-span-8">
              <span
                className="font-display text-xs font-bold uppercase tracking-wider block mb-1.5"
                style={{ color: 'var(--arena)' }}
              >
                Canal o transmisión de YouTube (acepta @handle, URL del canal o enlace de video)
              </span>
              <input
                type="text"
                value={youtubeInput}
                onChange={(e) => setYoutubeInput(e.target.value)}
                placeholder="Ej: @NASA, https://www.youtube.com/@dwespanol/streams o https://www.youtube.com/watch?v=..."
                className="w-full rounded-lg px-3.5 py-2.5 text-sm font-medium"
                style={{ backgroundColor: 'var(--verde3)', color: 'var(--crema)' }}
              />
            </label>

            <label className="block md:col-span-4">
              <span
                className="font-display text-xs font-bold uppercase tracking-wider block mb-1.5"
                style={{ color: 'var(--arena)' }}
              >
                Pantalla global en TV (para pruebas)
              </span>
              <select
                value={forcedMode}
                onChange={(e) => setForcedMode(e.target.value as ModeSetting)}
                className="w-full rounded-lg px-3.5 py-2.5 text-sm font-semibold"
                style={{ backgroundColor: 'var(--verde3)', color: 'var(--crema)' }}
              >
                <option value="auto">Automático (según horario)</option>
                <option value="vivo">Forzar En vivo (ideal para pruebas)</option>
                <option value="antes">Forzar Antes</option>
                <option value="despues">Forzar Después</option>
              </select>
            </label>
          </div>

          <div
            className="rounded-xl p-4 flex flex-wrap items-center justify-between gap-4"
            style={{ backgroundColor: 'var(--verde3)' }}
          >
            <div>
              <p className="font-display text-sm font-bold" style={{ color: 'var(--turquesa)' }}>
                Canal conectado: {ytStatus.streamsUrl || youtube.streamsUrl}
              </p>
              <p className="font-body text-sm mt-1" style={{ color: 'var(--crema)' }}>
                {ytStatus.isLive
                  ? `EN VIVO ahora: ${ytStatus.liveTitle}`
                  : ytStatus.latestStream
                    ? `Sin en vivo activo ahora. Respaldo actual: "${ytStatus.latestStream.title}"`
                    : 'Sin streamings detectados aún.'}
              </p>
              <p className="font-body text-xs mt-1" style={{ color: 'var(--arena)' }}>
                {ytStatus.streamEndedToday
                  ? 'Transmisión finalizada en la ventana actual: en modo Automático pasa a Después tras 1 minuto.'
                  : 'Detección automática activa (sin necesidad de API Key): al terminar el en vivo espera 1 minuto y cambia a Después.'}
              </p>
            </div>
            <span
              className="px-3.5 py-1.5 rounded-lg font-display text-xs font-extrabold uppercase tracking-wider"
              style={{
                backgroundColor: ytStatus.isLive ? 'var(--naranja)' : 'var(--verde2)',
                color: ytStatus.isLive ? 'var(--verde3)' : 'var(--arena)',
              }}
            >
              {ytStatus.isLive ? 'EN VIVO' : 'EN ESPERA'}
            </span>
          </div>

          {ytStatus.streams.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ytStatus.streams.slice(0, 4).map((stream) => (
                <a
                  key={stream.videoId}
                  href={`https://www.youtube.com/watch?v=${stream.videoId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl p-3.5 flex items-center justify-between gap-3 transition-opacity hover:opacity-90"
                  style={{ backgroundColor: 'var(--verde2)' }}
                >
                  <div className="min-w-0">
                    <p
                      className="font-display text-sm font-bold truncate"
                      style={{ color: 'var(--crema)' }}
                    >
                      {stream.title}
                    </p>
                    <p className="font-body text-xs mt-0.5" style={{ color: 'var(--arena)' }}>
                      {stream.publishedText || 'Stream del canal'} · ID: {stream.videoId}
                    </p>
                  </div>
                  <span
                    className="px-2.5 py-1 rounded text-xs font-display font-bold shrink-0"
                    style={{
                      backgroundColor: stream.isLive ? 'var(--naranja)' : 'var(--verde3)',
                      color: stream.isLive ? 'var(--verde3)' : 'var(--turquesa)',
                    }}
                  >
                    {stream.isLive ? 'VIVO' : 'VER'}
                  </span>
                </a>
              ))}
            </div>
          )}
        </section>

        {/* Horario e Integraciones */}
        <section
          className="rounded-2xl p-6 space-y-5"
          style={{ backgroundColor: 'var(--verde)' }}
        >
          <h2 className="font-display text-xl font-bold" style={{ color: 'var(--crema)' }}>
            Horario automático e integraciones
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <label className="block">
              <span className="font-display text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--arena)' }}>
                Día del servicio
              </span>
              <select
                value={schedule.serviceDay}
                onChange={(e) =>
                  setSchedule({ ...schedule, serviceDay: Number(e.target.value) })
                }
                className="w-full rounded-lg px-3 py-2.5 text-sm font-medium"
                style={{ backgroundColor: 'var(--verde3)', color: 'var(--crema)' }}
              >
                {DAYS_ES.map((day, idx) => (
                  <option key={day} value={idx}>
                    {day}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="font-display text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--arena)' }}>
                Hora (24h SV)
              </span>
              <input
                type="number"
                min={0}
                max={23}
                value={schedule.serviceHour}
                onChange={(e) =>
                  setSchedule({ ...schedule, serviceHour: Number(e.target.value) })
                }
                className="w-full rounded-lg px-3 py-2.5 text-sm font-medium tabular-nums"
                style={{ backgroundColor: 'var(--verde3)', color: 'var(--crema)' }}
              />
            </label>

            <label className="block">
              <span className="font-display text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--arena)' }}>
                Minuto
              </span>
              <input
                type="number"
                min={0}
                max={59}
                value={schedule.serviceMinute}
                onChange={(e) =>
                  setSchedule({ ...schedule, serviceMinute: Number(e.target.value) })
                }
                className="w-full rounded-lg px-3 py-2.5 text-sm font-medium tabular-nums"
                style={{ backgroundColor: 'var(--verde3)', color: 'var(--crema)' }}
              />
            </label>

            <label className="block">
              <span className="font-display text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--arena)' }}>
                Ventana previa (min)
              </span>
              <input
                type="number"
                min={10}
                max={360}
                value={schedule.preWindowMinutes}
                onChange={(e) =>
                  setSchedule({
                    ...schedule,
                    preWindowMinutes: Number(e.target.value),
                  })
                }
                className="w-full rounded-lg px-3 py-2.5 text-sm font-medium tabular-nums"
                style={{ backgroundColor: 'var(--verde3)', color: 'var(--crema)' }}
              />
            </label>

            <label className="block">
              <span className="font-display text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--arena)' }}>
                Duración máx. (min)
              </span>
              <input
                type="number"
                min={30}
                max={360}
                value={schedule.durationMinutes}
                onChange={(e) =>
                  setSchedule({
                    ...schedule,
                    durationMinutes: Number(e.target.value),
                  })
                }
                className="w-full rounded-lg px-3 py-2.5 text-sm font-medium tabular-nums"
                style={{ backgroundColor: 'var(--verde3)', color: 'var(--crema)' }}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <span className="font-display text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--arena)' }}>
                Google Sheets CSV publicado (opcional)
              </span>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://docs.google.com/spreadsheets/d/.../pub?output=csv"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  className="flex-1 rounded-lg px-3 py-2.5 text-sm"
                  style={{ backgroundColor: 'var(--verde3)', color: 'var(--crema)' }}
                />
                <button
                  type="button"
                  onClick={handleTestSheet}
                  disabled={testingCsv}
                  className="px-3.5 py-2 rounded-lg font-display text-xs font-bold shrink-0"
                  style={{ backgroundColor: 'var(--turquesa)', color: 'var(--verde3)' }}
                >
                  {testingCsv ? 'Leyendo...' : 'Cargar CSV'}
                </button>
              </div>
            </div>

            <label className="block">
              <span className="font-display text-xs font-bold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--arena)' }}>
                YouTube API Key (opcional, para fin automático)
              </span>
              <input
                type="password"
                placeholder="Dejar vacío para usar detección automática de /streams"
                value={youtube.apiKey}
                onChange={(e) => setYoutube({ ...youtube, apiKey: e.target.value })}
                className="w-full rounded-lg px-3 py-2.5 text-sm"
                style={{ backgroundColor: 'var(--verde3)', color: 'var(--crema)' }}
              />
            </label>
          </div>
        </section>

        {/* Contenido visible actualmente (Fase 1) */}
        <section
          className="rounded-2xl p-6 space-y-6"
          style={{ backgroundColor: 'var(--verde)' }}
        >
          <h2 className="font-display text-xl font-bold" style={{ color: 'var(--crema)' }}>
            Contenido de las pantallas
          </h2>

          {/* Recordatorios del equipo */}
          <div className="space-y-3 rounded-xl p-4" style={{ backgroundColor: 'var(--verde2)' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold" style={{ color: 'var(--amarillo)' }}>
                Recordatorios del equipo (Pantalla Antes)
              </h3>
              <button
                type="button"
                onClick={() =>
                  setContent({
                    ...content,
                    recordatorios: [...content.recordatorios, 'Nuevo recordatorio'],
                  })
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-display text-xs font-bold"
                style={{ backgroundColor: 'var(--turquesa)', color: 'var(--verde3)' }}
              >
                <Plus size={14} /> Agregar
              </button>
            </div>

            <div className="space-y-2">
              {content.recordatorios.map((rec, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span
                    className="w-7 h-7 rounded-md flex items-center justify-center font-display text-xs font-extrabold shrink-0"
                    style={{ backgroundColor: 'var(--naranja)', color: 'var(--verde3)' }}
                  >
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    value={rec}
                    onChange={(e) =>
                      setContent({
                        ...content,
                        recordatorios: content.recordatorios.map((r, i) =>
                          i === idx ? e.target.value : r,
                        ),
                      })
                    }
                    className="flex-1 rounded-lg px-3 py-2 text-sm"
                    style={{ backgroundColor: 'var(--verde3)', color: 'var(--crema)' }}
                  />
                  <button
                    type="button"
                    aria-label="Eliminar recordatorio"
                    onClick={() =>
                      setContent({
                        ...content,
                        recordatorios: content.recordatorios.filter((_, i) => i !== idx),
                      })
                    }
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: 'var(--verde3)', color: 'var(--arena)' }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block rounded-xl p-4" style={{ backgroundColor: 'var(--verde2)' }}>
              <span className="font-display text-sm font-bold block mb-2" style={{ color: 'var(--turquesa)' }}>
                Recordatorio de entrega (Pantalla Después)
              </span>
              <textarea
                rows={2}
                value={recordatorioEntrega}
                onChange={(e) => setRecordatorioEntrega(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ backgroundColor: 'var(--verde3)', color: 'var(--crema)' }}
              />
            </label>

            <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: 'var(--verde2)' }}>
              <span className="font-display text-sm font-bold block" style={{ color: 'var(--arena)' }}>
                Versículo al pie (Pantalla Después)
              </span>
              <input
                type="text"
                value={content.versiculoDespues.cita}
                onChange={(e) =>
                  setContent({
                    ...content,
                    versiculoDespues: {
                      ...content.versiculoDespues,
                      cita: e.target.value,
                    },
                  })
                }
                className="w-full rounded-lg px-3 py-1.5 text-sm font-semibold"
                style={{ backgroundColor: 'var(--verde3)', color: 'var(--crema)' }}
              />
              <textarea
                rows={2}
                value={content.versiculoDespues.texto}
                onChange={(e) =>
                  setContent({
                    ...content,
                    versiculoDespues: {
                      ...content.versiculoDespues,
                      texto: e.target.value,
                    },
                  })
                }
                className="w-full rounded-lg px-3 py-1.5 text-xs"
                style={{ backgroundColor: 'var(--verde3)', color: 'var(--crema)' }}
              />
            </div>
          </div>

          {/* Aviso al equipo (opcional mediante control remoto) */}
          <div className="space-y-3 rounded-xl p-4" style={{ backgroundColor: 'var(--verde2)' }}>
            <h3 className="font-display text-base font-bold" style={{ color: 'var(--naranja)' }}>
              Aviso al equipo (opcional al activar con control remoto en En vivo)
            </h3>
            <input
              type="text"
              value={content.avisoEquipo.titulo}
              onChange={(e) =>
                setContent({
                  ...content,
                  avisoEquipo: { ...content.avisoEquipo, titulo: e.target.value },
                })
              }
              className="w-full rounded-lg px-3 py-2 text-sm font-semibold"
              style={{ backgroundColor: 'var(--verde3)', color: 'var(--crema)' }}
            />
            <textarea
              rows={2}
              value={content.avisoEquipo.detalle}
              onChange={(e) =>
                setContent({
                  ...content,
                  avisoEquipo: { ...content.avisoEquipo, detalle: e.target.value },
                })
              }
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ backgroundColor: 'var(--verde3)', color: 'var(--crema)' }}
            />
          </div>

          {/* Fase 2 (Oculto actualmente en la TV) */}
          <details className="rounded-xl p-4" style={{ backgroundColor: 'var(--verde2)' }}>
            <summary
              className="cursor-pointer font-display text-base font-bold select-none"
              style={{ color: 'var(--arena)' }}
            >
              Fase 2 (oculto en la TV actualmente): Temas, Anuncios y Momentos
            </summary>

            <div className="mt-4 space-y-5">
              <div className="flex flex-wrap gap-6 rounded-lg p-3" style={{ backgroundColor: 'var(--verde3)' }}>
                <label className="inline-flex items-center gap-2.5 text-sm font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={features.showTemasYAnuncios}
                    onChange={(e) =>
                      setFeatures({ ...features, showTemasYAnuncios: e.target.checked })
                    }
                  />
                  <span>Mostrar Tema de hoy, Próximamente y Anuncios en TV</span>
                </label>

                <label className="inline-flex items-center gap-2.5 text-sm font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={features.showMomentosSidebar}
                    onChange={(e) =>
                      setFeatures({ ...features, showMomentosSidebar: e.target.checked })
                    }
                  />
                  <span>Mostrar barra derecha de Momentos en En vivo</span>
                </label>
              </div>

              {/* Tema de hoy */}
              <div className="space-y-3 rounded-lg p-4" style={{ backgroundColor: 'var(--verde3)' }}>
                <h3 className="font-display text-sm font-bold" style={{ color: 'var(--amarillo)' }}>
                  Tema de hoy (Pantalla Antes)
                </h3>
                <input
                  type="text"
                  value={content.temaHoy.titulo}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      temaHoy: { ...content.temaHoy, titulo: e.target.value },
                    })
                  }
                  placeholder="Título del tema"
                  className="w-full rounded-lg px-3 py-2 text-sm font-semibold"
                  style={{ backgroundColor: 'var(--verde)', color: 'var(--crema)' }}
                />
                <textarea
                  rows={2}
                  value={content.temaHoy.detalle}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      temaHoy: { ...content.temaHoy, detalle: e.target.value },
                    })
                  }
                  placeholder="Detalle o cita bíblica"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ backgroundColor: 'var(--verde)', color: 'var(--crema)' }}
                />
              </div>

              {/* Próximamente */}
              <div className="space-y-3 rounded-lg p-4" style={{ backgroundColor: 'var(--verde3)' }}>
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold" style={{ color: 'var(--turquesa)' }}>
                    Franja Próximamente (Pantalla En vivo)
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      setContent({
                        ...content,
                        eventosProximos: [
                          ...content.eventosProximos,
                          { dia: '01', mes: 'ENE', titulo: 'Nuevo evento', detalle: '' },
                        ],
                      })
                    }
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-display text-xs font-bold"
                    style={{ backgroundColor: 'var(--turquesa)', color: 'var(--verde3)' }}
                  >
                    <Plus size={14} /> Agregar evento
                  </button>
                </div>

                <div className="space-y-2.5">
                  {content.eventosProximos.map((ev, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        value={ev.dia}
                        onChange={(e) =>
                          setContent({
                            ...content,
                            eventosProximos: updateListItem(content.eventosProximos, idx, {
                              dia: e.target.value,
                            }),
                          })
                        }
                        placeholder="Día"
                        className="col-span-2 md:col-span-1 rounded-lg px-2.5 py-2 text-sm text-center"
                        style={{ backgroundColor: 'var(--verde)', color: 'var(--crema)' }}
                      />
                      <input
                        type="text"
                        value={ev.mes}
                        onChange={(e) =>
                          setContent({
                            ...content,
                            eventosProximos: updateListItem(content.eventosProximos, idx, {
                              mes: e.target.value.toUpperCase(),
                            }),
                          })
                        }
                        placeholder="Mes"
                        className="col-span-2 md:col-span-1 rounded-lg px-2.5 py-2 text-sm text-center uppercase"
                        style={{ backgroundColor: 'var(--verde)', color: 'var(--crema)' }}
                      />
                      <input
                        type="text"
                        value={ev.titulo}
                        onChange={(e) =>
                          setContent({
                            ...content,
                            eventosProximos: updateListItem(content.eventosProximos, idx, {
                              titulo: e.target.value,
                            }),
                          })
                        }
                        placeholder="Título"
                        className="col-span-8 md:col-span-4 rounded-lg px-3 py-2 text-sm font-semibold"
                        style={{ backgroundColor: 'var(--verde)', color: 'var(--crema)' }}
                      />
                      <input
                        type="text"
                        value={ev.detalle}
                        onChange={(e) =>
                          setContent({
                            ...content,
                            eventosProximos: updateListItem(content.eventosProximos, idx, {
                              detalle: e.target.value,
                            }),
                          })
                        }
                        placeholder="Detalle"
                        className="col-span-10 md:col-span-5 rounded-lg px-3 py-2 text-sm"
                        style={{ backgroundColor: 'var(--verde)', color: 'var(--crema)' }}
                      />
                      <button
                        type="button"
                        aria-label="Eliminar evento"
                        onClick={() =>
                          setContent({
                            ...content,
                            eventosProximos: content.eventosProximos.filter(
                              (_, i) => i !== idx,
                            ),
                          })
                        }
                        className="col-span-2 md:col-span-1 p-2 rounded-lg flex justify-center"
                        style={{ backgroundColor: 'var(--verde)', color: 'var(--arena)' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3 Anuncios */}
              <div className="space-y-3 rounded-lg p-4" style={{ backgroundColor: 'var(--verde3)' }}>
                <h3 className="font-display text-sm font-bold" style={{ color: 'var(--amarillo)' }}>
                  3 Anuncios (Pantalla Después)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {content.anunciosDespues.slice(0, 3).map((an, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg p-3 space-y-2"
                      style={{ backgroundColor: 'var(--verde2)' }}
                    >
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={an.dia}
                          onChange={(e) =>
                            setContent({
                              ...content,
                              anunciosDespues: updateListItem(content.anunciosDespues, idx, {
                                dia: e.target.value,
                              }),
                            })
                          }
                          className="w-16 rounded px-2 py-1.5 text-sm text-center"
                          style={{ backgroundColor: 'var(--verde)', color: 'var(--crema)' }}
                        />
                        <input
                          type="text"
                          value={an.mes}
                          onChange={(e) =>
                            setContent({
                              ...content,
                              anunciosDespues: updateListItem(content.anunciosDespues, idx, {
                                mes: e.target.value.toUpperCase(),
                              }),
                            })
                          }
                          className="w-20 rounded px-2 py-1.5 text-sm text-center uppercase"
                          style={{ backgroundColor: 'var(--verde)', color: 'var(--crema)' }}
                        />
                      </div>
                      <input
                        type="text"
                        value={an.titulo}
                        onChange={(e) =>
                          setContent({
                            ...content,
                            anunciosDespues: updateListItem(content.anunciosDespues, idx, {
                              titulo: e.target.value,
                            }),
                          })
                        }
                        className="w-full rounded px-2.5 py-1.5 text-sm font-semibold"
                        style={{ backgroundColor: 'var(--verde)', color: 'var(--crema)' }}
                      />
                      <textarea
                        rows={2}
                        value={an.detalle}
                        onChange={(e) =>
                          setContent({
                            ...content,
                            anunciosDespues: updateListItem(content.anunciosDespues, idx, {
                              detalle: e.target.value,
                            }),
                          })
                        }
                        className="w-full rounded px-2.5 py-1.5 text-xs"
                        style={{ backgroundColor: 'var(--verde)', color: 'var(--arena)' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </details>
        </section>

        {/* Aplicación nativa Fire TV (APK gratuita) */}
        <section
          className="rounded-2xl p-6 space-y-4"
          style={{ backgroundColor: 'var(--verde)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2
                className="font-display text-xl font-bold"
                style={{ color: 'var(--crema)' }}
              >
                Aplicación nativa para Fire TV (APK gratuita)
              </h2>
              <p className="font-body text-sm mt-1" style={{ color: 'var(--arena)' }}>
                El proyecto nativo Android/Kotlin está incluido en{' '}
                <code className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--verde3)', color: 'var(--turquesa)' }}>
                  firetv-apk/
                </code>{' '}
                junto al flujo automático de compilación en{' '}
                <code className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--verde3)', color: 'var(--turquesa)' }}>
                  .github/workflows/build-firetv-apk.yml
                </code>{' '}
                para generar el `.apk` gratis sin pagar apps de terceros.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined' && navigator.clipboard) {
                  void navigator.clipboard.writeText(window.location.origin);
                  setFeedback({
                    type: 'ok',
                    message: `URL copiada: ${window.location.origin}`,
                  });
                }
              }}
              className="px-4 py-2.5 rounded-lg font-display text-sm font-bold shrink-0"
              style={{ backgroundColor: 'var(--turquesa)', color: 'var(--verde3)' }}
            >
              Copiar URL del televisor
            </button>
          </div>

          <div
            className="rounded-xl p-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center"
            style={{ backgroundColor: 'var(--verde2)' }}
          >
            <div className="md:col-span-8">
              <p
                className="font-display text-sm font-bold"
                style={{ color: 'var(--amarillo)' }}
              >
                Inicio automático y PIN de salida / red en Fire TV
              </p>
              <p className="font-body text-xs mt-1 leading-relaxed" style={{ color: 'var(--arena)' }}>
                La app inicia automáticamente al encender el Fire TV. Para salir al menú normal o configurar el Wi-Fi, presiona{' '}
                <strong style={{ color: 'var(--crema)' }}>OK / Menú → Salir / Red Fire TV (PIN)</strong>{' '}
                o presiona <strong style={{ color: 'var(--crema)' }}>Atrás dos veces</strong> con el control remoto (si escribes menos de 4 dígitos se usará{' '}
                <strong style={{ color: 'var(--crema)' }}>{CONFIG.kioskPin}</strong>).
              </p>
            </div>
            <label className="block md:col-span-4">
              <span
                className="font-display text-xs font-bold uppercase tracking-wider block mb-1.5"
                style={{ color: 'var(--crema)' }}
              >
                PIN de salida (4 a 8 dígitos)
              </span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={kioskPin}
                onChange={(e) => setKioskPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder={CONFIG.kioskPin}
                className="w-full rounded-lg px-3.5 py-2.5 text-sm font-display font-bold tracking-[0.25em] text-center tabular-nums"
                style={{ backgroundColor: 'var(--verde3)', color: 'var(--amarillo)' }}
              />
            </label>
          </div>
        </section>

        {/* Acciones finales */}
        <footer className="flex flex-wrap items-center justify-between gap-4 pb-8">
          <button
            type="button"
            onClick={handleReset}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-display text-sm font-bold"
            style={{ backgroundColor: 'var(--verde2)', color: 'var(--arena)' }}
          >
            <RotateCcw size={16} />
            Restablecer valores por defecto
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl font-display text-base font-extrabold"
            style={{ backgroundColor: 'var(--naranja)', color: 'var(--verde3)' }}
          >
            <Save size={18} />
            {saving ? 'Guardando...' : 'Guardar cambios para la TV'}
          </button>
        </footer>
      </div>
    </div>
  );
}
