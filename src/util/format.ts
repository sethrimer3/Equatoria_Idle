/**
 * Utility: format a number for UI display.
 */
export function formatNumber(n: number): string {
  if (n < 0) return '-' + formatNumber(-n);
  if (n < 1_000) return Math.floor(n).toString();
  if (n < 1_000_000) return (n / 1_000).toFixed(1) + 'K';
  if (n < 1_000_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n < 1_000_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
  return (n / 1_000_000_000_000).toFixed(2) + 'T';
}
