import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Volume2, VolumeX, X } from 'lucide-react';
import { ActiveScreen, CONFIG, ModeSetting } from '../config';

interface ControlMenuProps {
  isOpen: boolean;
  modeSetting: ModeSetting;
  effectiveScreen: ActiveScreen;
  currentMoment: number;
  showTeamAlert: boolean;
  muted: boolean;
  onChangeMode: (mode: ModeSetting) => void;
  onPrevMoment: () => void;
  onNextMoment: () => void;
  onToggleTeamAlert: () => void;
  onToggleMuted: () => void;
  onClose: () => void;
}

const MODE_OPTIONS: Array<{ value: ModeSetting; label: string }> = [
  { value: 'auto', label: 'Automático' },
  { value: 'antes', label: 'Antes' },
  { value: 'vivo', label: 'En vivo' },
  { value: 'despues', label: 'Después' },
];

export function ControlMenu({
  isOpen,
  modeSetting,
  effectiveScreen,
  currentMoment,
  showTeamAlert,
  muted,
  onChangeMode,
  onPrevMoment,
  onNextMoment,
  onToggleTeamAlert,
  onToggleMuted,
  onClose,
}: ControlMenuProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      closeBtnRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleMenuKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const focusables = Array.from(
          menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [],
        );
        if (focusables.length === 0) return;

        const currentIndex = focusables.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        e.preventDefault();
        e.stopPropagation();

        if (e.key === 'ArrowDown') {
          const next = focusables[(currentIndex + 1) % focusables.length];
          next?.focus();
        } else {
          const prev =
            focusables[
              (currentIndex - 1 + focusables.length) % focusables.length
            ];
          prev?.focus();
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const focusables = Array.from(
          menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [],
        );
        const currentIndex = focusables.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (currentIndex === -1) return;

        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'ArrowRight') {
          focusables[(currentIndex + 1) % focusables.length]?.focus();
        } else {
          focusables[
            (currentIndex - 1 + focusables.length) % focusables.length
          ]?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleMenuKeyDown, true);
    return () => window.removeEventListener('keydown', handleMenuKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(13, 39, 37, 0.84)' }}
      onClick={onClose}
    >
      <div
        ref={menuRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menú de control de pantalla"
        className="w-[820px] rounded-[28px] p-[44px] border-2"
        style={{
          backgroundColor: 'var(--verde)',
          borderColor: 'var(--turquesa)',
          color: 'var(--crema)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between pb-6 border-b"
          style={{ borderColor: 'rgba(250, 242, 230, 0.16)' }}
        >
          <div>
            <h2
              className="font-display text-[32px] font-extrabold"
              style={{ color: 'var(--crema)' }}
            >
              Control de pantalla
            </h2>
            <p
              className="font-body text-[18px] mt-1"
              style={{ color: 'var(--arena)' }}
            >
              Pantalla activa: {effectiveScreen === 'antes' ? 'Antes' : effectiveScreen === 'vivo' ? 'En vivo' : 'Después'}
            </p>
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            className="flex items-center gap-2.5 px-5 py-3 rounded-[14px] font-display text-[19px] font-bold focus:outline-none focus:ring-4"
            style={{
              backgroundColor: 'var(--amarillo)',
              color: 'var(--verde3)',
            }}
          >
            <X size={22} strokeWidth={2.75} aria-hidden="true" />
            Cerrar menú
          </button>
        </div>

        <div className="space-y-7 mt-7">
          {/* 1. Pantalla */}
          <div>
            <p
              className="font-display text-[19px] font-bold uppercase tracking-wider mb-3"
              style={{ color: 'var(--turquesa)' }}
            >
              Pantalla
            </p>
            <div className="grid grid-cols-4 gap-3">
              {MODE_OPTIONS.map((opt) => {
                const selected = modeSetting === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChangeMode(opt.value)}
                    className="py-4 px-4 rounded-[14px] font-display text-[21px] font-bold transition-colors focus:outline-none focus:ring-4"
                    style={{
                      backgroundColor: selected
                        ? 'var(--naranja)'
                        : 'var(--verde2)',
                      color: selected ? 'var(--verde3)' : 'var(--crema)',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Momento del servicio */}
          <div>
            <p
              className="font-display text-[19px] font-bold uppercase tracking-wider mb-3"
              style={{ color: 'var(--turquesa)' }}
            >
              Momento del servicio
            </p>
            <div
              className="flex items-center justify-between gap-4 rounded-[16px] p-3"
              style={{ backgroundColor: 'var(--verde2)' }}
            >
              <button
                type="button"
                onClick={onPrevMoment}
                aria-label="Momento anterior"
                className="p-3.5 rounded-[12px] focus:outline-none focus:ring-4"
                style={{
                  backgroundColor: 'var(--verde3)',
                  color: 'var(--crema)',
                }}
              >
                <ChevronLeft size={28} />
              </button>

              <div className="text-center">
                <p
                  className="font-display text-[26px] font-extrabold"
                  style={{ color: 'var(--amarillo)' }}
                >
                  {CONFIG.momentos[currentMoment]}
                </p>
                <p
                  className="font-body text-[16px] tabular-nums"
                  style={{ color: 'var(--arena)' }}
                >
                  Paso {currentMoment + 1} de {CONFIG.momentos.length}
                </p>
              </div>

              <button
                type="button"
                onClick={onNextMoment}
                aria-label="Siguiente momento"
                className="p-3.5 rounded-[12px] focus:outline-none focus:ring-4"
                style={{
                  backgroundColor: 'var(--verde3)',
                  color: 'var(--crema)',
                }}
              >
                <ChevronRight size={28} />
              </button>
            </div>
          </div>

          {/* 3. Aviso al equipo & 4. Sonido */}
          <div className="grid grid-cols-2 gap-5">
            <div>
              <p
                className="font-display text-[19px] font-bold uppercase tracking-wider mb-3"
                style={{ color: 'var(--turquesa)' }}
              >
                Aviso al equipo
              </p>
              <button
                type="button"
                onClick={onToggleTeamAlert}
                className="w-full py-4 px-6 rounded-[14px] font-display text-[22px] font-bold flex items-center justify-between focus:outline-none focus:ring-4"
                style={{
                  backgroundColor: showTeamAlert
                    ? 'var(--naranja)'
                    : 'var(--verde2)',
                  color: showTeamAlert ? 'var(--verde3)' : 'var(--crema)',
                }}
              >
                <span>{showTeamAlert ? 'Visible' : 'Oculto'}</span>
                <span className="text-[16px] uppercase tracking-wider">
                  Cambiar
                </span>
              </button>
            </div>

            <div>
              <p
                className="font-display text-[19px] font-bold uppercase tracking-wider mb-3"
                style={{ color: 'var(--turquesa)' }}
              >
                Sonido
              </p>
              <button
                type="button"
                onClick={onToggleMuted}
                className="w-full py-4 px-6 rounded-[14px] font-display text-[22px] font-bold flex items-center justify-between focus:outline-none focus:ring-4"
                style={{
                  backgroundColor: muted ? 'var(--verde2)' : 'var(--turquesa)',
                  color: muted ? 'var(--crema)' : 'var(--verde3)',
                }}
              >
                <span className="flex items-center gap-3">
                  {muted ? <VolumeX size={24} /> : <Volume2 size={24} />}
                  {muted ? 'Silenciado' : 'Activado'}
                </span>
                <span className="text-[16px] uppercase tracking-wider">
                  Cambiar
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Ayuda de control remoto */}
        <div
          className="mt-7 pt-5 border-t flex items-center justify-between font-body text-[17px]"
          style={{
            borderColor: 'rgba(250, 242, 230, 0.14)',
            color: 'var(--arena)',
          }}
        >
          <span>OK / M: Abrir o cerrar menú</span>
          <span>Izq / Der (sin menú): Momento</span>
          <span>Arriba / Abajo (sin menú): Aviso</span>
        </div>
      </div>
    </div>
  );
}
