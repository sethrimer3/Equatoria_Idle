export type NumberFormat = 'letters' | 'scientific' | 'engineering';

// Letter suffix names: K=Thousand, M=Million, B=Billion, T=Trillion,
// Qa=Quadrillion, Qi=Quintillion, Sx=Sextillion, Sp=Septillion
const _SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '\u2070', '1': '\u00b9', '2': '\u00b2', '3': '\u00b3',
  '4': '\u2074', '5': '\u2075', '6': '\u2076', '7': '\u2077',
  '8': '\u2078', '9': '\u2079', '-': '\u207b',
};

/**
 * Utility: format a number for UI display using the given format mode.
 */
export function formatNumberAs(n: number, format: NumberFormat): string {
  if (!isFinite(n) || isNaN(n)) return '0';
  if (n < 0) return '-' + formatNumberAs(-n, format);
  switch (format) {
    case 'scientific':  return _formatScientific(n);
    case 'engineering': return _formatEngineering(n);
    case 'letters':
    default:            return _formatLetters(n);
  }
}

/** Convenience wrapper — uses 'letters' format (legacy default). */
export function formatNumber(n: number): string {
  return formatNumberAs(n, 'letters');
}

function _formatLetters(n: number): string {
  if (n < 1_000) return Math.floor(n).toString();
  if (n < 1e6)  return (n / 1e3).toFixed(1)  + 'K';
  if (n < 1e9)  return (n / 1e6).toFixed(2)  + 'M';
  if (n < 1e12) return (n / 1e9).toFixed(2)  + 'B';
  if (n < 1e15) return (n / 1e12).toFixed(2) + 'T';
  if (n < 1e18) return (n / 1e15).toFixed(2) + 'Qa';
  if (n < 1e21) return (n / 1e18).toFixed(2) + 'Qi';
  if (n < 1e24) return (n / 1e21).toFixed(2) + 'Sx';
  return (n / 1e24).toFixed(2) + 'Sp';
}

function _formatScientific(n: number): string {
  if (n === 0) return '0';
  if (n < 1_000) return Math.floor(n).toString();
  const exp = Math.floor(Math.log10(n));
  const mantissa = n / Math.pow(10, exp);
  return mantissa.toFixed(2) + 'e' + exp;
}

function _formatEngineering(n: number): string {
  if (n === 0) return '0';
  if (n < 1_000) return Math.floor(n).toString();
  const exp = Math.floor(Math.log10(n));
  const engExp = Math.floor(exp / 3) * 3;
  const mantissa = n / Math.pow(10, engExp);
  return mantissa.toFixed(2) + '\u00d710' + _toSuperscript(engExp);
}

function _toSuperscript(n: number): string {
  return String(n).split('').map(c => _SUPERSCRIPT_MAP[c] ?? c).join('');
}
