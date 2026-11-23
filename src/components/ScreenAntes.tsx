import { CONFIG, ModeSetting, SignageContent } from '../config';
import {
  ElSalvadorWallTime,
  formatClock12h,
  formatCountdown,
  formatDateEs,
  formatServiceTimeLabel,
} from '../utils/time';
import { IgcLogo } from './IgcLogo';

interface ScreenAntesProps {
  svNow: ElSalvadorWallTime;
  countdownTargetMs: number;
  content: SignageContent;
  modeSetting: ModeSetting;
  schedule?: typeof CONFIG.schedule;
}

export function ScreenAntes({
  svNow,
  countdownTargetMs,
  content,
  modeSetting,
  schedule = CONFIG.schedule,
}: ScreenAntesProps) {
  const countdown = formatCountdown(countdownTargetMs, svNow.utcMs);
  const clockLabel = formatClock12h(svNow);
  const dateLabel = formatDateEs(svNow);
  const serviceTimeLabel = formatServiceTimeLabel(schedule);

  const showHours = countdown.days > 0 || Number(countdown.hours) > 0;
  const countdownText = showHours
    ? `${countdown.hours}:${countdown.minutes}:${countdown.seconds}`
    : `${countdown.minutes}:${countdown.seconds}`;

  return (
    <div
      className="w-full h-full flex flex-col justify-between px-[72px] py-[52px]"
      style={{ backgroundColor: 'var(--crema)', color: 'var(--verde3)' }}
    >
      {/* Cabecera */}
      <header className="flex items-center justify-between border-b pb-6" style={{ borderColor: 'rgba(22, 64, 61, 0.16)' }}>
        <div className="flex items-center gap-6">
          <IgcLogo height={64} variant="on-light" />
          <div>
            <p
              className="font-display text-[20px] font-bold tracking-wide uppercase"
              style={{ color: 'var(--verde2)' }}
            >
              Ministerio infantil · {CONFIG.city}
            </p>
            <h1
              className="font-display text-[38px] font-extrabold leading-tight tracking-tight"
              style={{ color: 'var(--verde)' }}
            >
              {CONFIG.ministryName}
            </h1>
          </div>
        </div>

        <div className="text-right">
          <p
            className="font-display text-[40px] font-extrabold tabular-nums leading-none"
            style={{ color: 'var(--verde)' }}
          >
            {clockLabel}
          </p>
          <p
            className="font-body text-[21px] font-medium mt-2"
            style={{ color: 'var(--gris-verdoso)' }}
          >
            {dateLabel}
            {modeSetting !== 'auto' ? ' · Modo manual' : ''}
          </p>
        </div>
      </header>

      {/* Bloque central: Cuenta regresiva + Recordatorios del equipo */}
      <main className="grid grid-cols-12 gap-[56px] items-center my-auto py-4">
        {/* Columna izquierda: Cuenta regresiva gigante */}
        <section className="col-span-6 flex flex-col justify-center">
          <p
            className="font-display text-[24px] font-bold uppercase tracking-[0.14em] mb-4"
            style={{ color: 'var(--verde2)' }}
          >
            El servicio comienza en
          </p>

          {countdown.days > 0 && (
            <p
              className="font-display text-[34px] font-bold mb-2 tabular-nums"
              style={{ color: 'var(--verde)' }}
            >
              {countdown.days} {countdown.days === 1 ? 'día' : 'días'} y
            </p>
          )}

          <div
            className="font-display font-extrabold tabular-nums leading-[0.95] tracking-tight"
            style={{
              fontSize: showHours ? '164px' : '220px',
              color: countdown.isImminent ? 'var(--verde3)' : 'var(--verde)',
            }}
          >
            {countdownText}
          </div>

          <div className="mt-8 flex items-center gap-4">
            <span
              className="inline-block w-4 h-4 rounded-full shrink-0"
              style={{ backgroundColor: 'var(--naranja)' }}
              aria-hidden="true"
            />
            <p
              className="font-display text-[28px] font-bold"
              style={{ color: 'var(--verde)' }}
            >
              {serviceTimeLabel} · Hora de El Salvador
            </p>
          </div>
        </section>

        {/* Columna derecha: Tarjeta verde oscura con lista numerada */}
        <section
          className="col-span-6 rounded-[24px] p-[44px]"
          style={{
            backgroundColor: 'var(--verde)',
            color: 'var(--crema)',
          }}
        >
          <div className="flex items-center justify-between mb-7 border-b pb-5" style={{ borderColor: 'rgba(250, 242, 230, 0.16)' }}>
            <h2
              className="font-display text-[34px] font-bold tracking-tight"
              style={{ color: 'var(--amarillo)' }}
            >
              Recordatorios del equipo
            </h2>
            <span
              className="font-display text-[20px] font-bold tabular-nums uppercase tracking-wider"
              style={{ color: 'var(--arena)' }}
            >
              {content.recordatorios.length} puntos
            </span>
          </div>

          <ol className="space-y-5">
            {content.recordatorios.map((item, idx) => (
              <li key={idx} className="flex items-start gap-5">
                <span
                  className="font-display text-[24px] font-extrabold tabular-nums w-[46px] h-[46px] rounded-[12px] flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    backgroundColor: 'var(--naranja)',
                    color: 'var(--verde3)',
                  }}
                >
                  {idx + 1}
                </span>
                <p
                  className="font-body text-[25px] font-medium leading-[1.38]"
                  style={{ color: 'var(--crema)' }}
                >
                  {item}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      {/* Pie: Tema de hoy */}
      <footer
        className="rounded-[20px] px-[40px] py-[26px] flex items-center justify-between gap-10"
        style={{
          backgroundColor: 'var(--arena)',
          color: 'var(--verde3)',
        }}
      >
        <div className="flex items-center gap-8 min-w-0">
          <span
            className="font-display text-[20px] font-extrabold uppercase tracking-[0.12em] px-5 py-2.5 rounded-[12px] shrink-0"
            style={{
              backgroundColor: 'var(--verde)',
              color: 'var(--crema)',
            }}
          >
            Tema de hoy
          </span>
          <div className="min-w-0">
            <h3
              className="font-display text-[30px] font-bold leading-snug truncate"
              style={{ color: 'var(--verde3)' }}
            >
              {content.temaHoy.titulo}
            </h3>
            <p
              className="font-body text-[21px] font-medium truncate mt-0.5"
              style={{ color: 'var(--verde)' }}
            >
              {content.temaHoy.detalle}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
