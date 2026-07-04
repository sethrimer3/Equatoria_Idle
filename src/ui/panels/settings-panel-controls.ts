// ─── Slider glow constants ───────────────────────────────────────

/** Dark gold RGB used at 0% slider value. */
const DARK_GOLD_RGB  = [100,  95, 45] as const;
/** Bright gold RGB used at 100% slider value. */
const BRIGHT_GOLD_RGB = [255, 241, 114] as const;
/** Maximum glow blur radius in px (at 100%). */
const MAX_GLOW_RADIUS_PX = 8;
/** Maximum glow alpha (at 100%). */
const MAX_GLOW_ALPHA = 0.65;
/** Maximum box-shadow blur radius in px for the slider wrapper border glow (at 100%). */
const MAX_BORDER_GLOW_RADIUS_PX = 6;
/** Slider value (0–1) below which glow is suppressed to avoid dim artefacts near 0%. */
const MIN_GLOW_THRESHOLD = 0.25;

export function createSliderRow(
  label: string,
  initialValue: number,
  onChange: (value: number) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'settings-row';

  const lbl = document.createElement('label');
  lbl.textContent = label;
  row.appendChild(lbl);

  const sliderWrapper = document.createElement('div');
  sliderWrapper.className = 'settings-slider-wrapper';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = String(Math.round(initialValue * 100));
  slider.className = 'settings-slider';

  const pctLabel = document.createElement('span');
  pctLabel.className = 'settings-slider-pct';

  function updateGlow(v: number): void {
    // v is 0–1; interpolate between dark gold and bright gold
    const r = Math.round(DARK_GOLD_RGB[0] + (BRIGHT_GOLD_RGB[0] - DARK_GOLD_RGB[0]) * v);
    const g = Math.round(DARK_GOLD_RGB[1] + (BRIGHT_GOLD_RGB[1] - DARK_GOLD_RGB[1]) * v);
    const b = Math.round(DARK_GOLD_RGB[2] + (BRIGHT_GOLD_RGB[2] - DARK_GOLD_RGB[2]) * v);
    const color = `rgb(${r},${g},${b})`;
    const glowPx = Math.round(v * MAX_GLOW_RADIUS_PX);
    const glowAlpha = v * MAX_GLOW_ALPHA;
    const glowColor = `rgba(${r},${g},${b},${glowAlpha})`;

    pctLabel.textContent = `${Math.round(v * 100)}%`;
    pctLabel.style.color = color;
    pctLabel.style.textShadow = v > MIN_GLOW_THRESHOLD ? `0 0 ${glowPx}px ${glowColor}` : 'none';

    sliderWrapper.style.borderColor = color;
    sliderWrapper.style.boxShadow = v > MIN_GLOW_THRESHOLD ? `0 0 ${Math.round(v * MAX_BORDER_GLOW_RADIUS_PX)}px ${glowColor}` : 'none';
  }

  updateGlow(initialValue);

  slider.addEventListener('input', () => {
    const v = parseInt(slider.value) / 100;
    updateGlow(v);
    onChange(v);
  });

  sliderWrapper.appendChild(slider);
  row.appendChild(sliderWrapper);
  row.appendChild(pctLabel);

  return row;
}

export function createSteppedSliderRow(
  label: string,
  initialValue: number,
  min: number,
  max: number,
  step: number,
  formatValue: (value: number) => string,
  onChange: (value: number) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'settings-row';

  const lbl = document.createElement('label');
  lbl.textContent = label;
  row.appendChild(lbl);

  const sliderWrapper = document.createElement('div');
  sliderWrapper.className = 'settings-slider-wrapper settings-slider-wrapper--stepped';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(initialValue);
  slider.className = 'settings-slider settings-slider--stepped';

  const tickList = document.createElement('div');
  tickList.className = 'settings-slider-ticks';
  for (let value = min; value <= max; value += step) {
    const tick = document.createElement('span');
    tick.className = 'settings-slider-tick';
    tick.classList.toggle('settings-slider-tick--center', value === 0);
    tickList.appendChild(tick);
  }

  const valueLabel = document.createElement('span');
  valueLabel.className = 'settings-slider-pct settings-slider-value';

  function updateValue(value: number): void {
    const normalized = max === min ? 0 : (value - min) / (max - min);
    const r = Math.round(DARK_GOLD_RGB[0] + (BRIGHT_GOLD_RGB[0] - DARK_GOLD_RGB[0]) * normalized);
    const g = Math.round(DARK_GOLD_RGB[1] + (BRIGHT_GOLD_RGB[1] - DARK_GOLD_RGB[1]) * normalized);
    const b = Math.round(DARK_GOLD_RGB[2] + (BRIGHT_GOLD_RGB[2] - DARK_GOLD_RGB[2]) * normalized);
    const color = `rgb(${r},${g},${b})`;
    const glowColor = `rgba(${r},${g},${b},${normalized * MAX_GLOW_ALPHA})`;
    valueLabel.textContent = formatValue(value);
    valueLabel.style.color = color;
    valueLabel.style.textShadow = Math.abs(value) > 0 ? `0 0 ${MAX_GLOW_RADIUS_PX}px ${glowColor}` : 'none';
    sliderWrapper.style.borderColor = color;
    sliderWrapper.style.boxShadow = Math.abs(value) > 0 ? `0 0 ${MAX_BORDER_GLOW_RADIUS_PX}px ${glowColor}` : 'none';
  }

  updateValue(initialValue);

  slider.addEventListener('input', () => {
    const value = Number(slider.value);
    updateValue(value);
    onChange(value);
  });

  sliderWrapper.appendChild(slider);
  sliderWrapper.appendChild(tickList);
  row.appendChild(sliderWrapper);
  row.appendChild(valueLabel);

  return row;
}

export function createToggleRow(
  label: string,
  initialValue: boolean,
  onChange: (value: boolean) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'settings-row';

  const lbl = document.createElement('label');
  lbl.textContent = label;
  row.appendChild(lbl);

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = initialValue;
  checkbox.className = 'settings-checkbox';
  checkbox.addEventListener('change', () => {
    onChange(checkbox.checked);
  });
  row.appendChild(checkbox);

  return row;
}

export function createSelectRow(
  label: string,
  initialValue: string,
  options: Array<{ value: string; label: string }>,
  onChange: (value: string) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'settings-row';

  const lbl = document.createElement('label');
  lbl.textContent = label;
  row.appendChild(lbl);

  const select = document.createElement('select');
  select.className = 'settings-select';
  for (const optionDef of options) {
    const option = document.createElement('option');
    option.value = optionDef.value;
    option.textContent = optionDef.label;
    select.appendChild(option);
  }
  select.value = initialValue;
  select.addEventListener('change', () => {
    onChange(select.value);
  });
  row.appendChild(select);

  return row;
}
