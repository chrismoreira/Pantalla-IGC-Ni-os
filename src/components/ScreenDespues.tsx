import { CONFIG, ModeSetting, SignageContent } from '../config';
import {
  ElSalvadorWallTime,
  formatClock12h,
  formatDateEs,
  formatServiceTimeLabel,
} from '../utils/time';
import { IgcLogo } from './IgcLogo';

interface ScreenDespuesProps {
  svNow: ElSalvadorWallTime;
  content: SignageContent;
  modeSetting: ModeSetting;
  schedule?: typeof CONFIG.schedule;
  recordatorioEntrega?: string;
  showAnuncios?: boolean;
}

export function ScreenDespues({
  svNow,
  content,
  modeSetting,
  schedule = CONFIG.schedule,
  recordatorioEntrega = CONFIG.recordatorioEntrega,
  showAnuncios = false,
}: ScreenDespuesProps) {
  const clockLabel = formatClock12h(svNow);
  const dateLabel = formatDateEs(svNow);
  const nextServiceLabel = formatServiceTimeLabel(schedule);
  const anuncios = content.anunciosDespues.slice(0, 3);

  return (
    <div
      className="w-full h-full flex flex-col justify-between px-[72px] py-[48px]"
      style={{ backgroundColor: 'var(--verde)', color: 'var(--crema)' }}
    >
      {/* Cabecera */}
      <header
        className="flex items-center justify-between pb-5 border-b"
        style={{ borderColor: 'rgba(250, 242, 230, 0.16)' }}
      >
        <div className="flex items-center gap-6">
          <IgcLogo height={68} variant="on-dark" />
          <div>
            <p
              className="font-display text-[20px] font-bold uppercase tracking-wide"
              style={{ color: 'var(--arena)' }}
            >
              Ministerio infantil · {CONFIG.city}
            </p>
            <h1
              className="font-display text-[36px] font-extrabold leading-tight"
              style={{ color: 'var(--crema)' }}
            >
              {CONFIG.ministryName}
            </h1>
          </div>
        </div>

        <div className="text-right">
          <p
            className="font-display text-[38px] font-extrabold tabular-nums leading-none"
            style={{ color: 'var(--crema)' }}
          >
            {clockLabel}
          </p>
          <p
            className="font-body text-[20px] font-medium mt-2"
            style={{ color: 'var(--arena)' }}
          >
            {dateLabel}
            {modeSetting !== 'auto' ? ' · Modo manual' : ''}
          </p>
        </div>
      </header>

      {/* Tarjeta turquesa principal */}
      <section
        className={`rounded-[24px] flex items-center justify-between gap-12 ${
          showAnuncios ? 'px-[52px] py-[40px]' : 'px-[64px] py-[64px] my-auto'
        }`}
        style={{
          backgroundColor: 'var(--turquesa)',
          color: 'var(--verde3)',
        }}
      >
        <div className="max-w-[1160px]">
          <h2
            className={`font-display font-extrabold leading-[1.08] tracking-tight ${
              showAnuncios ? 'text-[56px]' : 'text-[66px]'
            }`}
          >
            ¡Gracias por servir hoy!
          </h2>
          <p
            className={`font-body font-semibold leading-[1.4] mt-4 ${
              showAnuncios ? 'text-[27px]' : 'text-[31px]'
            }`}
          >
            {recordatorioEntrega}
          </p>
        </div>

        <div
          className="rounded-[18px] px-[40px] py-[30px] shrink-0 text-right"
          style={{
            backgroundColor: 'var(--verde3)',
            color: 'var(--crema)',
          }}
        >
          <p
            className="font-display text-[18px] font-bold uppercase tracking-[0.12em]"
            style={{ color: 'var(--turquesa)' }}
          >
            Próximo servicio
          </p>
          <p
            className="font-display text-[36px] font-extrabold mt-2 tabular-nums"
            style={{ color: 'var(--crema)' }}
          >
            {nextServiceLabel}
          </p>
        </div>
      </section>

      {/* 3 tarjetas de anuncios con fecha (Fase 2) */}
      {showAnuncios && (
        <section className="grid grid-cols-3 gap-[32px]">
          {anuncios.map((anuncio, idx) => (
            <article
              key={`${anuncio.titulo}-${idx}`}
              className="rounded-[20px] p-[32px] flex flex-col justify-between gap-5"
              style={{
                backgroundColor: 'var(--verde2)',
                border: '1px solid rgba(250, 242, 230, 0.12)',
              }}
            >
              <div className="flex items-start gap-5">
                <div
                  className="w-[82px] h-[86px] rounded-[14px] flex flex-col items-center justify-center shrink-0"
                  style={{
                    backgroundColor: 'var(--amarillo)',
                    color: 'var(--verde3)',
                  }}
                >
                  <span className="font-display text-[34px] font-extrabold leading-none tabular-nums">
                    {anuncio.dia}
                  </span>
                  <span className="font-display text-[16px] font-extrabold uppercase tracking-wider mt-1">
                    {anuncio.mes}
                  </span>
                </div>

                <div className="min-w-0">
                  <h3
                    className="font-display text-[26px] font-bold leading-snug"
                    style={{ color: 'var(--crema)' }}
                  >
                    {anuncio.titulo}
                  </h3>
                  <p
                    className="font-body text-[20px] font-normal leading-[1.45] mt-2"
                    style={{ color: 'var(--arena)' }}
                  >
                    {anuncio.detalle}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {/* Versículo al pie (Mateo 19:14) */}
      <footer
        className="rounded-[18px] px-[40px] py-[24px] text-center"
        style={{ backgroundColor: 'var(--verde3)' }}
      >
        <p
          className="font-display italic font-bold text-[25px] leading-snug"
          style={{ color: 'var(--arena)' }}
        >
          {content.versiculoDespues.texto}{' '}
          <span style={{ color: 'var(--amarillo)' }}>
            — {content.versiculoDespues.cita}
          </span>
        </p>
      </footer>
    </div>
  );
}
