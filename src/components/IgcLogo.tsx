interface IgcLogoProps {
  size?: number;
}

export function IgcLogo({ size = 64 }: IgcLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Logo Iglesia Gran Comisión"
      className="shrink-0"
    >
      <circle cx="50" cy="50" r="50" fill="#FD7D42" />
      {/* Estilizada "O" abierta de IGC en crema #FAF2E6 */}
      <path
        d="M50 22C34.536 22 22 34.536 22 50C22 65.464 34.536 78 50 78C65.464 78 78 65.464 78 50C78 44.365 76.336 39.118 73.471 34.725"
        stroke="#FAF2E6"
        strokeWidth="12.5"
        strokeLinecap="round"
      />
      <circle cx="69" cy="28.5" r="6.25" fill="#FAF2E6" />
    </svg>
  );
}
