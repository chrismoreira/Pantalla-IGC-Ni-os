interface IgcLogoProps {
  height?: number;
  variant?: 'on-dark' | 'on-light';
}

export function IgcLogo({ height = 68, variant = 'on-dark' }: IgcLogoProps) {
  const img = (
    <img
      src="/assets/aistudio/IGC_ES_Blanco_92123a15.png"
      alt="Iglesia Gran Comisión El Salvador"
      referrerPolicy="no-referrer"
      style={{
        height: `${height}px`,
        width: 'auto',
      }}
      className="block object-contain shrink-0 select-none"
    />
  );

  if (variant === 'on-light') {
    return (
      <div
        className="inline-flex items-center justify-center rounded-[16px] px-5 py-3 shrink-0"
        style={{ backgroundColor: 'var(--verde)' }}
      >
        {img}
      </div>
    );
  }

  return img;
}
