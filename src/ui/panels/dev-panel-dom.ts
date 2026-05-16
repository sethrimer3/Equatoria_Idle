// ─── Wave jump targets ───────────────────────────────────────────

export const WAVE_JUMP_TARGETS = [2, 5, 8, 12, 15, 18, 22, 25, 26] as const;

// ─── DOM helpers ────────────────────────────────────────────────

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function makeSubTitle(text: string): HTMLElement {
  const h = el('div', 'settings-dev-title');
  h.textContent = text;
  return h;
}
