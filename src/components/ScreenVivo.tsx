import { Check } from 'lucide-react';
import { CONFIG, ModeSetting, SignageContent } from '../config';
import { ElSalvadorWallTime, formatClock12h } from '../utils/time';
import { buildYouTubeEmbedUrl } from '../utils/youtube';
import { IgcLogo } from './IgcLogo';

interface ScreenVivoProps {
  svNow: ElSalvadorWallTime;
  content: SignageContent;
  currentMoment: number;
  onSelectMoment: (index: number) => void;
  showTeamAlert: boolean;
  muted: boolean;
  liveVideoId: string | null;
  liveTitle: string | null;
  isLiveNow: boolean;
  modeSetting: ModeSetting;
  channelId?: string;
  showTemasYAnuncios?: boolean;
  showMomentosSidebar?: boolean;
}

export function ScreenVivo({
  svNow,
  content,
  currentMoment,
  onSelectMoment,
  showTeamAlert,
  muted,
  liveVideoId,
  liveTitle,
  isLiveNow,
  modeSetting,
  channelId = CONFIG.youtube.channelId,
  showTemasYAnuncios = false,
  showMomentosSidebar = false,
}: ScreenVivoProps) {
  const clockLabel = formatClock12h(svNow);
  const embedUrl = buildYouTubeEmbedUrl(
    channelId,
    liveVideoId,
    muted,
  );
  const eventos = content.eventosProximos;
  const playerWidth = showMomentosSidebar ? 1300 : showTemasYAnuncios ? 1400 : 1600;
  const playerHeight = showMomentosSidebar ? 731 : showTemasYAnuncios ? 788 : 900;

  return (
    <div
      className="w-full h-full flex flex-col justify-between px-[48px] pt-[30px] pb-[28px]"
      style={{ backgroundColor: 'var(--verde)', color: 'var(--crema)' }}
    >
      {/* Cabecera */}
      <header className="flex items-center justify-between h-[76px]">
        <div className="flex items-center gap-6 min-w-0">
          <IgcLogo height={62} variant="on-dark" />
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span
                className="font-display text-[28px] font-extrabold tracking-tight"
                style={{ color: 'var(--crema)' }}
              >
                {CONFIG.ministryName}
              </span>
              <span
                className="font-body text-[21px] font-medium"
                style={{ color: 'var(--arena)' }}
              >
                · {CONFIG.city}
              </span>
            </div>
            {liveTitle && (
              <p
                className="font-body text-[19px] font-medium truncate max-w-[1050px]"
                style={{ color: 'var(--turquesa)' }}
              >
                {isLiveNow ? 'En vivo: ' : 'Última transmisión: '}
                {liveTitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-6 shrink-0">
          <span
            className="font-display text-[20px] font-extrabold uppercase tracking-[0.12em] px-5 py-2 rounded-[10px]"
            style={{
              backgroundColor: 'var(--naranja)',
              color: 'var(--verde3)',
            }}
          >
            EN VIVO
          </span>

          <div className="text-right">
            <span
              className="font-display text-[36px] font-extrabold tabular-nums leading-none"
              style={{ color: 'var(--crema)' }}
            >
              {clockLabel}
            </span>
            {modeSetting !== 'auto' && (
              <p
                className="font-body text-[14px] font-medium leading-none mt-1"
                style={{ color: 'var(--arena)' }}
              >
                Modo manual
              </p>
            )}
          </div>
        </div>
      </header>

      {/* Fila principal: YouTube 16:9 con marco turquesa (+ Panel lateral opcional Fase 2) */}
      <main
        className={`flex items-center my-auto ${
          showMomentosSidebar ? 'justify-between gap-[36px]' : 'justify-center'
        }`}
      >
        {/* Reproductor YouTube 16:9 con marco turquesa detrás */}
        <div
          className="relative shrink-0"
          style={{ width: `${playerWidth}px`, height: `${playerHeight}px` }}
        >
          {/* Marco turquesa detrás */}
          <div
            className="absolute inset-0 rounded-[18px]"
            style={{
              backgroundColor: 'var(--turquesa)',
              transform: 'translate(10px, 10px)',
            }}
            aria-hidden="true"
          />
          <div
            className="relative w-full h-full border-[4px]"
            style={{
              backgroundColor: 'var(--verde3)',
              borderColor: 'var(--turquesa)',
            }}
          >
            <iframe
              key={`${channelId}-${liveVideoId ?? 'channel'}-${muted ? 'm1' : 'm0'}`}
              src={embedUrl}
              title="Transmisión en vivo Iglesia Gran Comisión"
              width={playerWidth}
              height={playerHeight}
              className="w-full h-full border-0 block"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </div>

        {/* Panel lateral Fase 2: Momentos del servicio + Aviso al equipo */}
        {showMomentosSidebar && (
          <aside className="flex-1 flex flex-col justify-between gap-5 h-[731px] min-w-0">
          {/* Lista de momentos del servicio */}
          <section
            className="rounded-[20px] p-[28px] flex-1 flex flex-col justify-between"
            style={{ backgroundColor: 'var(--verde2)' }}
          >
            <div className="flex items-center justify-between pb-4 border-b" style={{ borderColor: 'rgba(250, 242, 230, 0.14)' }}>
              <h2
                className="font-display text-[25px] font-bold tracking-tight"
                style={{ color: 'var(--crema)' }}
              >
                Momentos del servicio
              </h2>
              <span
                className="font-display text-[18px] font-bold tabular-nums"
                style={{ color: 'var(--arena)' }}
              >
                {currentMoment + 1}/{CONFIG.momentos.length}
              </span>
            </div>

            <ul className="flex-1 flex flex-col justify-center gap-2.5 my-3">
              {CONFIG.momentos.map((momento, idx) => {
                const isPast = idx < currentMoment;
                const isCurrent = idx === currentMoment;

                return (
                  <li key={momento}>
                    <button
                      type="button"
                      onClick={() => onSelectMoment(idx)}
                      className="w-full text-left flex items-center justify-between gap-4 px-5 py-3.5 rounded-[14px] transition-colors"
                      style={{
                        backgroundColor: isCurrent
                          ? 'var(--amarillo)'
                          : isPast
                            ? 'rgba(13, 39, 37, 0.45)'
                            : 'rgba(13, 39, 37, 0.22)',
                        color: isCurrent
                          ? 'var(--verde3)'
                          : isPast
                            ? 'var(--arena)'
                            : 'var(--crema)',
                      }}
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <span
                          className="w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0 font-display text-[17px] font-extrabold tabular-nums"
                          style={{
                            backgroundColor: isCurrent
                              ? 'var(--verde3)'
                              : isPast
                                ? 'var(--turquesa)'
                                : 'var(--gris-verdoso)',
                            color: isCurrent
                              ? 'var(--amarillo)'
                              : isPast
                                ? 'var(--verde3)'
                                : 'var(--crema)',
                          }}
                        >
                          {isPast ? (
                            <Check size={20} strokeWidth={3} aria-hidden="true" />
                          ) : (
                            idx + 1
                          )}
                        </span>
                        <span
                          className={`font-display text-[23px] truncate ${
                            isCurrent ? 'font-extrabold' : 'font-semibold'
                          }`}
                        >
                          {momento}
                        </span>
                      </div>

                      {isCurrent && (
                        <span
                          className="font-display text-[14px] font-extrabold uppercase tracking-wider shrink-0"
                          style={{ color: 'var(--verde3)' }}
                        >
                          Ahora
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Tarjeta naranja Aviso al equipo (visible/ocultable) */}
          {showTeamAlert && (
            <section
              className="rounded-[20px] px-[28px] py-[22px] shrink-0"
              style={{
                backgroundColor: 'var(--naranja)',
                color: 'var(--verde3)',
              }}
            >
              <p className="font-display text-[18px] font-extrabold uppercase tracking-[0.1em]">
                {content.avisoEquipo.titulo}
              </p>
              <p className="font-body text-[21px] font-semibold leading-[1.35] mt-1.5">
                {content.avisoEquipo.detalle}
              </p>
            </section>
          )}
          </aside>
        )}
      </main>

      {/* Aviso al equipo flotante (solo si se activa manualmente en Fase 1 sin barra lateral) */}
      {!showMomentosSidebar && showTeamAlert && (
        <section
          className="absolute left-1/2 bottom-[36px] -translate-x-1/2 z-20 max-w-[1100px] rounded-[20px] px-[34px] py-[20px]"
          style={{
            backgroundColor: 'var(--naranja)',
            color: 'var(--verde3)',
          }}
        >
          <p className="font-display text-[18px] font-extrabold uppercase tracking-[0.1em]">
            {content.avisoEquipo.titulo}
          </p>
          <p className="font-body text-[22px] font-semibold leading-[1.35] mt-1">
            {content.avisoEquipo.detalle}
          </p>
        </section>
      )}

      {/* Franja inferior animada PRÓXIMAMENTE (Fase 2) */}
      {showTemasYAnuncios && (
        <footer
          className="h-[104px] rounded-[18px] flex items-center overflow-hidden"
          style={{ backgroundColor: 'var(--verde3)' }}
        >
          <div
            className="h-full px-[36px] flex items-center justify-center shrink-0 z-10"
            style={{
              backgroundColor: 'var(--turquesa)',
              color: 'var(--verde3)',
            }}
          >
            <span className="font-display text-[24px] font-extrabold uppercase tracking-[0.12em]">
              Próximamente
            </span>
          </div>

          <div className="flex-1 overflow-hidden relative h-full flex items-center">
            <div className="igc-marquee-track items-center gap-[48px] pl-[36px]">
              {[...eventos, ...eventos].map((ev, index) => (
                <div
                  key={`${ev.titulo}-${index}`}
                  className="flex items-center gap-5 shrink-0 pr-8"
                >
                  <div
                    className="px-4 py-2 rounded-[10px] text-center shrink-0"
                    style={{
                      backgroundColor: 'var(--amarillo)',
                      color: 'var(--verde3)',
                    }}
                  >
                    <span className="font-display text-[20px] font-extrabold tabular-nums">
                      {ev.dia} {ev.mes}
                    </span>
                  </div>
                  <div>
                    <p
                      className="font-display text-[22px] font-bold leading-tight"
                      style={{ color: 'var(--crema)' }}
                    >
                      {ev.titulo}
                    </p>
                    {ev.detalle && (
                      <p
                        className="font-body text-[18px] font-medium leading-tight mt-0.5"
                        style={{ color: 'var(--arena)' }}
                      >
                        {ev.detalle}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
