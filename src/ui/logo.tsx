export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="var(--mantine-color-brand-7)" />
      <path d="M5 18h6c3 0 3-8 6-8h6" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="6" cy="18" r="2.6" fill="#fff" />
      <circle cx="14" cy="14" r="2.6" fill="#fff" />
      <circle cx="22" cy="10" r="2.6" fill="#F5B83D" />
    </svg>
  );
}
