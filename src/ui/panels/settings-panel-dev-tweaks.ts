import { particleTweaks, PARTICLE_TWEAKS_DEFAULTS, resetParticleTweaks } from '../../data/particles/particle-tweaks';

/** Ordered list of tweakable parameters shown in dev mode. */
const DEV_TWEAK_FIELDS: ReadonlyArray<{
  key: keyof typeof particleTweaks;
  label: string;
}> = [
  { key: 'minVelocity',                       label: 'Min Velocity' },
  { key: 'pointerLockedForce',                 label: 'Drag Force (Dragging Speed)' },
  { key: 'dragBoostMultiplier',                label: 'Drag Boost Multiplier' },
  { key: 'particleWallBounce',                 label: 'Wall Bounce' },
  { key: 'plMaxVelocity',                      label: 'PL Max Velocity' },
  { key: 'plVelocityDamping',                  label: 'PL Velocity Damping' },
  { key: 'plMatrixForceScale',                 label: 'PL Force Scale' },
  { key: 'plProtectedRepulsionStrength',       label: 'PL Protected Repulsion' },
];

export function createDevTweaksSection(): HTMLElement {
  const section = document.createElement('div');
  section.className = 'settings-dev-section';

  const title = document.createElement('div');
  title.className = 'settings-dev-title';
  title.textContent = '⚙ Particle Tweaks';
  section.appendChild(title);

  const inputs = new Map<keyof typeof particleTweaks, HTMLInputElement>();

  for (const field of DEV_TWEAK_FIELDS) {
    const row = document.createElement('div');
    row.className = 'settings-dev-row';

    const lbl = document.createElement('label');
    lbl.textContent = field.label;
    row.appendChild(lbl);

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'settings-dev-input';
    input.step = 'any';
    input.value = String(particleTweaks[field.key]);
    input.addEventListener('change', () => {
      const parsed = parseFloat(input.value);
      if (!isNaN(parsed)) {
        particleTweaks[field.key] = parsed;
      } else {
        // Revert to current tweak value on invalid input
        input.value = String(particleTweaks[field.key]);
      }
    });
    // Prevent tap-through to game canvas while editing
    input.addEventListener('pointerdown', (e) => e.stopPropagation());

    row.appendChild(input);
    section.appendChild(row);
    inputs.set(field.key, input);
  }

  // Reset-to-defaults button
  const resetBtn = document.createElement('button');
  resetBtn.className = 'settings-dev-reset-btn';
  resetBtn.textContent = '↺ Reset to Defaults';
  resetBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  resetBtn.addEventListener('click', () => {
    resetParticleTweaks();
    // Refresh all inputs to show restored defaults
    for (const field of DEV_TWEAK_FIELDS) {
      const input = inputs.get(field.key);
      if (input) {
        input.value = String(PARTICLE_TWEAKS_DEFAULTS[field.key]);
      }
    }
  });
  section.appendChild(resetBtn);

  return section;
}
