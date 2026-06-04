/**
 * rpg-weapons-tab.ts — Weapons sub-tab for the RPG overlay panel.
 *
 * Renders the "Weapons" sub-tab content:
 *   • Equipped slot count indicator
 *   • Per-weapon purchase / equip / unequip / tier-upgrade cards
 *
 * Extracted from rpg-menu-panel.ts to keep each sub-tab in its own module.
 */

import { WEAPON_DEFINITIONS } from '../../data/rpg/weapon-definitions';
import { resolveWeaponDefinition, getForgeCapacity, formatCraftedWeaponModifier, computeCraftedWeaponComposition, getCraftedModifierLines } from '../../data/rpg/crafted-weapon-helpers';
import type { WeaponDefinition } from '../../data/rpg/weapon-definitions';
import { TIER_BY_ID, type TierId } from '../../data/tiers';
import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getWeaponTierUpgradeCost, getMaxEquippedWeapons, MAX_WEAPON_TIER, getRpgUpgradeLevel } from '../../sim/rpg/rpg-state';
import type { ResourceState } from '../../sim/resources';
import { getMotes } from '../../sim/resources';
import type { ActionHandler } from '../../input';
import { formatNumberAs } from '../../util';
import type { NumberFormat } from '../../util';
import { makePageBreak } from '../ui-helpers';
import {
  getChainWhipParams, setChainWhipParam, resetChainWhipParams,
  CHAIN_WHIP_PARAM_DEFAULTS,
} from '../../render/rpg/rpg-weapon-constants';
import type { ChainWhipParamKey } from '../../render/rpg/rpg-weapon-constants';

// Sand blade accent color — matches the player mote's gold-sand glow.
const SAND_BLADE_ACCENT_COLOR = '#ffd764';

const LENS_RARITY_COLOR: Record<string, string> = {
  Common:    '#aaa',
  Uncommon:  '#5f5',
  Rare:      '#55f',
  Epic:      '#c5f',
  Legendary: '#fa0',
  Mythic:    '#f55',
};

function buildLensSlot(attachedLens: import('../../data/rpg/lens-types').CraftedLensData | undefined): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText =
    'margin:6px 0 4px;padding:5px 8px;border-radius:4px;font-size:0.78em;' +
    'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);cursor:default;';

  if (!attachedLens) {
    el.style.color = '#666';
    el.textContent = 'Lens: Empty';
    return el;
  }

  const domTierId = attachedLens.ingredients[0]?.tierId;
  const domColor = TIER_BY_ID.get(domTierId as import('../../data/tiers').TierId)?.color ?? '#aaa';
  el.style.borderColor = domColor + '55';

  const header = document.createElement('div');
  header.style.cssText = `color:${domColor};font-weight:600;margin-bottom:3px;`;
  header.textContent = `Lens: ${attachedLens.name}`;
  el.appendChild(header);

  for (const effect of attachedLens.effects) {
    const effEl = document.createElement('div');
    effEl.style.cssText = 'display:flex;align-items:center;gap:4px;margin:1px 0;font-size:0.75em;';

    const rarityColor = LENS_RARITY_COLOR[effect.rarity] ?? '#aaa';
    const tierColor = TIER_BY_ID.get(effect.tierId as import('../../data/tiers').TierId)?.color ?? '#aaa';

    const tierNumTag = document.createElement('span');
    tierNumTag.style.cssText = 'background:rgba(255,255,255,0.12);color:#ddd;font-size:0.7em;padding:0 3px;border-radius:2px;font-weight:700;';
    tierNumTag.textContent = `T${effect.effectTier}`;
    effEl.appendChild(tierNumTag);

    const tierTag = document.createElement('span');
    tierTag.style.cssText = `background:${tierColor};color:#000;font-size:0.7em;padding:0 3px;border-radius:2px;font-weight:700;`;
    tierTag.textContent = TIER_BY_ID.get(effect.tierId as import('../../data/tiers').TierId)?.displayName ?? effect.tierId;
    effEl.appendChild(tierTag);

    const rTag = document.createElement('span');
    rTag.style.cssText = `color:${rarityColor};font-weight:700;`;
    rTag.textContent = effect.rarity;
    effEl.appendChild(rTag);

    const val = document.createElement('span');
    val.style.color = '#bbb';
    val.textContent = `${effect.name}  ×${effect.magnitude.toFixed(1)}`;
    effEl.appendChild(val);

    if (!effect.isApplied) {
      const note = document.createElement('span');
      note.style.cssText = 'color:#555;font-size:0.7em;font-style:italic;';
      note.textContent = 'STUB';
      effEl.appendChild(note);
    } else {
      const note = document.createElement('span');
      note.style.cssText = 'color:#4a4;font-size:0.7em;font-style:italic;';
      note.textContent = '✓ active';
      effEl.appendChild(note);
    }

    el.appendChild(effEl);
  }

  return el;
}

// ─── Types ─────────────────────────────────────────────────────────

export interface RpgWeaponsTabPane {
  element: HTMLElement;
  update(rpgState: RpgSimState, resources: ResourceState, numberFormat: NumberFormat, isDevMode: boolean): void;
}

// ─── Helpers ───────────────────────────────────────────────────────

function tierColor(tierId: string): string {
  return TIER_BY_ID.get(tierId as import('../../data/tiers').TierId)?.color ?? '#fff172';
}

// ─── Factory ───────────────────────────────────────────────────────

export function createRpgWeaponsTabPane(dispatch: ActionHandler): RpgWeaponsTabPane {
  const element = document.createElement('div');

  // ── Slot picker popup ──────────────────────────────────────────
  // Shown when the user clicks "Equip" on a purchased weapon.
  // Overlays the full viewport; user picks which of the 5 stat-panel
  // slots (boxes 7–11) to equip the weapon into.
  const slotPopupOverlay = document.createElement('div');
  slotPopupOverlay.className = 'weapon-slot-popup-overlay';
  slotPopupOverlay.style.display = 'none';

  const slotPopupBox = document.createElement('div');
  slotPopupBox.className = 'weapon-slot-popup-box';

  const slotPopupTitle = document.createElement('div');
  slotPopupTitle.className = 'weapon-slot-popup-title';
  slotPopupBox.appendChild(slotPopupTitle);

  const slotPopupGrid = document.createElement('div');
  slotPopupGrid.className = 'weapon-slot-popup-grid';
  slotPopupBox.appendChild(slotPopupGrid);

  const slotPopupCancel = document.createElement('button');
  slotPopupCancel.className = 'weapon-store__btn weapon-slot-popup-cancel';
  slotPopupCancel.textContent = 'Cancel';
  slotPopupCancel.addEventListener('click', () => { slotPopupOverlay.style.display = 'none'; });
  slotPopupBox.appendChild(slotPopupCancel);

  slotPopupOverlay.appendChild(slotPopupBox);
  // Clicking the dark backdrop also closes the popup
  slotPopupOverlay.addEventListener('click', (e) => {
    if (e.target === slotPopupOverlay) slotPopupOverlay.style.display = 'none';
  });

  // Append to document.body so update()'s innerHTML clear doesn't destroy the overlay.
  // position:fixed ensures it overlays the full viewport regardless of where it lives in the DOM.
  document.body.appendChild(slotPopupOverlay);

  /** Show the slot picker for the given weapon / state snapshot. */
  function showSlotPicker(weaponId: string, _weaponName: string, rpgState: RpgSimState): void {
    const maxSlots = getMaxEquippedWeapons(rpgState);
    slotPopupTitle.textContent = `Equip to which slot?`;
    slotPopupGrid.textContent = '';

    for (let s = 0; s < 5; s++) {
      const btn = document.createElement('button');
      btn.className = 'weapon-store__btn weapon-slot-popup-slot-btn';
      const isLocked = s >= maxSlots;
      const occupant = rpgState.equippedWeaponSlots.get(s);
      const occupantDef = occupant ? resolveWeaponDefinition(occupant) : undefined;
      const occupantName = occupantDef ? occupantDef.name : (occupant ?? 'Empty');
      btn.textContent = `Slot ${s + 1}: ${isLocked ? '🔒 Locked' : (occupant ? occupantName : 'Empty')}`;
      btn.disabled = isLocked;
      if (!isLocked) {
        btn.addEventListener('click', () => {
          slotPopupOverlay.style.display = 'none';
          dispatch({ kind: 'equip_weapon_to_slot', weaponId, slotIndex: s });
        });
      }
      slotPopupGrid.appendChild(btn);
    }

    slotPopupOverlay.style.display = 'flex';
  }

  /**
   * Builds the sand blade Enable/Disable card.
   * The sand blade is always the default melee weapon (not purchasable).
   * Unlike other weapons, it uses an Enable/Disable toggle rather than Equip/Unequip.
   */
  function buildSandBladeCard(rpgState: RpgSimState): HTMLElement {
    const card = document.createElement('div');
    card.className = 'weapon-store__card';
    if (rpgState.sandBladeEnabled) card.classList.add('weapon-store__card--equipped');
    card.style.borderColor = SAND_BLADE_ACCENT_COLOR + '66';

    // Name row with "Default" badge
    const nameRow = document.createElement('div');
    nameRow.className = 'weapon-store__card-name';
    nameRow.style.color = SAND_BLADE_ACCENT_COLOR;
    nameRow.textContent = 'Sand Blade';
    const defaultBadge = document.createElement('span');
    defaultBadge.className = 'weapon-tier-badge';
    defaultBadge.style.color = SAND_BLADE_ACCENT_COLOR;
    defaultBadge.style.borderColor = SAND_BLADE_ACCENT_COLOR + '88';
    defaultBadge.textContent = 'Default Melee';
    nameRow.appendChild(defaultBadge);
    card.appendChild(nameRow);

    // Description
    const descEl = document.createElement('div');
    descEl.className = 'weapon-store__card-desc';
    descEl.textContent =
      'The player\'s built-in melee swipe. Always active unless disabled or replaced by the Diamond Blade. ' +
      'Disable to use ranged-only builds with auto-move keeping distance from enemies.';
    card.appendChild(descEl);

    // Enable/Disable button
    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';
    btnRow.style.flexWrap = 'wrap';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'weapon-store__btn';
    if (rpgState.sandBladeEnabled) {
      toggleBtn.className += ' weapon-store__btn--equipped';
      toggleBtn.textContent = 'Disable';
      toggleBtn.style.borderColor = '#ff8888';
      toggleBtn.style.color = '#ff8888';
    } else {
      toggleBtn.textContent = 'Enable';
      toggleBtn.style.borderColor = SAND_BLADE_ACCENT_COLOR + 'aa';
      toggleBtn.style.color = SAND_BLADE_ACCENT_COLOR;
    }
    toggleBtn.addEventListener('click', () => dispatch({ kind: 'toggle_sand_blade' }));
    btnRow.appendChild(toggleBtn);
    card.appendChild(btnRow);

    return card;
  }

  function buildWeaponCard(
    weapon: WeaponDefinition,
    rpgState: RpgSimState,
    resources: ResourceState,
    numberFormat: NumberFormat,
    isDevMode: boolean,
  ): HTMLElement {
    const card = document.createElement('div');
    card.className = 'weapon-store__card';

    const isPurchased = rpgState.purchasedWeaponIds.has(weapon.id);
    const isEquipped  = rpgState.equippedWeaponIds.has(weapon.id);
    const balance     = getMotes(resources, weapon.costTierId);
    const canAfford   = isDevMode || balance >= weapon.cost;
    const currentTier = rpgState.weaponTiersByWeaponId.get(weapon.id) ?? 1;
    const maxSlots    = getMaxEquippedWeapons(rpgState);
    const canEquipMore = rpgState.equippedWeaponIds.size < maxSlots;

    if (isEquipped) card.classList.add('weapon-store__card--equipped');

    // Name + equipped badge + tier badge row
    const nameRow = document.createElement('div');
    nameRow.className = 'weapon-store__card-name';
    nameRow.textContent = weapon.name;
    if (isPurchased) {
      const tierBadge = document.createElement('span');
      tierBadge.className = 'weapon-tier-badge';
      const color = tierColor(weapon.costTierId);
      tierBadge.style.color = color;
      tierBadge.style.borderColor = color + '88';
      tierBadge.textContent = `Tier ${currentTier}`;
      nameRow.appendChild(tierBadge);
    }
    if (isEquipped) {
      const equippedBadge = document.createElement('span');
      equippedBadge.className = 'weapon-store__equipped-badge';
      equippedBadge.textContent = 'Equipped';
      nameRow.appendChild(equippedBadge);
    }
    card.appendChild(nameRow);

    // Description
    const descEl = document.createElement('div');
    descEl.className = 'weapon-store__card-desc';
    descEl.textContent = weapon.description;
    card.appendChild(descEl);

    // Stats row
    const statsRow = document.createElement('div');
    statsRow.className = 'weapon-store__card-stats';
    const effect = weapon.stats.effect;
    let effectLabel = 'Single target';
    if (effect?.kind === 'multi')    effectLabel = `Hits ${effect.targetCount} targets`;
    if (effect?.kind === 'aoe')      effectLabel = `AoE ${effect.aoeRadius}px`;
    if (effect?.kind === 'piercing') effectLabel = `${Math.round(effect.defPierceRatio * 100)}% DEF pierce`;
    statsRow.innerHTML =
      `<span>+${weapon.stats.damage} ATK</span>` +
      `<span>+${weapon.stats.defBonus} DEF</span>` +
      `<span>${weapon.stats.cooldownMs}ms CD</span>` +
      `<span>${weapon.stats.range}px RNG</span>` +
      `<span>${effectLabel}</span>`;
    card.appendChild(statsRow);

    // Cost row
    const costRow = document.createElement('div');
    costRow.className = 'weapon-store__card-cost';
    if (!isPurchased) {
      const costText = formatNumberAs(weapon.cost, numberFormat);
      costRow.textContent = `Cost: ${costText} ${weapon.costTierId} motes`;
      if (!canAfford) costRow.classList.add('weapon-store__card-cost--cannot-afford');
    }
    card.appendChild(costRow);

    // Action buttons row
    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';
    btnRow.style.flexWrap = 'wrap';

    if (!isPurchased) {
      const btn = document.createElement('button');
      btn.className = 'weapon-store__btn';
      btn.textContent = canAfford ? 'Purchase' : 'Need motes';
      btn.disabled = !canAfford;
      btn.addEventListener('click', () => dispatch({ kind: 'purchase_weapon', weaponId: weapon.id }));
      btnRow.appendChild(btn);
    } else {
      if (!isEquipped) {
        const equipBtn = document.createElement('button');
        equipBtn.className = 'weapon-store__btn';
        equipBtn.textContent = canEquipMore ? 'Equip' : `Full (${maxSlots}/${maxSlots})`;
        equipBtn.disabled = !canEquipMore;
        equipBtn.addEventListener('click', () => showSlotPicker(weapon.id, weapon.name, rpgState));
        btnRow.appendChild(equipBtn);
      } else {
        const unequipBtn = document.createElement('button');
        unequipBtn.className = 'weapon-store__btn weapon-store__btn--equipped';
        unequipBtn.textContent = 'Unequip';
        unequipBtn.addEventListener('click', () => dispatch({ kind: 'unequip_weapon', weaponId: weapon.id }));
        btnRow.appendChild(unequipBtn);
      }

      // Tier upgrade button (max tier = MAX_WEAPON_TIER)
      if (currentTier < MAX_WEAPON_TIER) {
        const tierUpgradeCost = getWeaponTierUpgradeCost(weapon.cost, currentTier);
        const canAffordTier = isDevMode || balance >= tierUpgradeCost;
        const tierUpgradeBtn = document.createElement('button');
        tierUpgradeBtn.className = 'weapon-store__btn';
        tierUpgradeBtn.style.background = 'rgba(100,200,255,0.1)';
        tierUpgradeBtn.style.borderColor = 'rgba(100,200,255,0.35)';
        tierUpgradeBtn.style.color = '#64c8ff';
        const tierCostText = formatNumberAs(Math.round(tierUpgradeCost), numberFormat);
        tierUpgradeBtn.textContent = `Tier ${currentTier + 1} (${tierCostText} ${weapon.costTierId})`;
        tierUpgradeBtn.disabled = !canAffordTier;
        tierUpgradeBtn.addEventListener('click', () => dispatch({ kind: 'upgrade_weapon_tier', weaponId: weapon.id }));
        btnRow.appendChild(tierUpgradeBtn);
      } else {
        const maxedEl = document.createElement('span');
        maxedEl.style.color = '#64c8ff';
        maxedEl.style.fontSize = '0.8em';
        maxedEl.style.alignSelf = 'center';
        maxedEl.textContent = `Max Tier (${MAX_WEAPON_TIER})`;
        btnRow.appendChild(maxedEl);
      }
    }

    card.appendChild(btnRow);
    return card;
  }

  // ── Crafted weapon card ────────────────────────────────────────
  function buildCraftedWeaponCard(
    craftedWeapon: import('../../data/rpg/crafted-weapon-types').CraftedWeaponData,
    rpgState: RpgSimState,
  ): HTMLElement {
    const card = document.createElement('div');
    card.className = 'weapon-store__card';
    const isEquipped = rpgState.equippedWeaponIds.has(craftedWeapon.id);
    if (isEquipped) card.classList.add('weapon-store__card--equipped');
    const dominantColor = tierColor(craftedWeapon.dominantTierId);
    card.style.borderColor = dominantColor + '66';

    // Name row
    const nameRow = document.createElement('div');
    nameRow.className = 'weapon-store__card-name';
    nameRow.style.color = dominantColor;
    nameRow.textContent = craftedWeapon.name;
    const craftBadge = document.createElement('span');
    craftBadge.className = 'weapon-tier-badge';
    craftBadge.style.color = dominantColor;
    craftBadge.style.borderColor = dominantColor + '88';
    craftBadge.textContent = 'Forged';
    nameRow.appendChild(craftBadge);
    if (isEquipped) {
      const eqBadge = document.createElement('span');
      eqBadge.className = 'weapon-store__equipped-badge';
      eqBadge.textContent = 'Equipped';
      nameRow.appendChild(eqBadge);
    }
    card.appendChild(nameRow);

    // Procedural SVG icon — linear gradient filled from composition colors
    {
      const svgNS = 'http://www.w3.org/2000/svg';
      const iconSize = 36;
      const gradId = `cw-grad-${craftedWeapon.id}`;
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('width', String(iconSize));
      svg.setAttribute('height', String(iconSize));
      svg.setAttribute('viewBox', '0 0 36 36');
      svg.style.cssText = 'display:block;margin:4px 0;filter:drop-shadow(0 0 4px ' + dominantColor + '88);';

      const defs = document.createElementNS(svgNS, 'defs');
      const grad = document.createElementNS(svgNS, 'linearGradient');
      grad.setAttribute('id', gradId);
      grad.setAttribute('x1', '0%');
      grad.setAttribute('y1', '0%');
      grad.setAttribute('x2', '100%');
      grad.setAttribute('y2', '100%');

      // Build gradient stops from composition shares
      let cumulative = 0;
      const sorted = [...craftedWeapon.composition].sort((a, b) => b.share - a.share);
      for (const entry of sorted) {
        const color = TIER_BY_ID.get(entry.tierId as TierId)?.color ?? '#ffffff';
        const stop1 = document.createElementNS(svgNS, 'stop');
        stop1.setAttribute('offset', `${Math.round(cumulative * 100)}%`);
        stop1.setAttribute('stop-color', color);
        grad.appendChild(stop1);
        cumulative += entry.share;
        const stop2 = document.createElementNS(svgNS, 'stop');
        stop2.setAttribute('offset', `${Math.round(cumulative * 100)}%`);
        stop2.setAttribute('stop-color', color);
        grad.appendChild(stop2);
      }
      defs.appendChild(grad);
      svg.appendChild(defs);

      // Crystal/diamond silhouette path (centered in 36×36 viewBox)
      const path = document.createElementNS(svgNS, 'path');
      // Diamond: top point, right ear, bottom point, left ear; with a horizontal divider line
      path.setAttribute('d', 'M18 2 L30 14 L18 34 L6 14 Z');
      path.setAttribute('fill', `url(#${gradId})`);
      path.setAttribute('opacity', '0.92');
      svg.appendChild(path);

      // Horizontal facet line (top facet separator)
      const line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', '6');
      line.setAttribute('y1', '14');
      line.setAttribute('x2', '30');
      line.setAttribute('y2', '14');
      line.setAttribute('stroke', 'rgba(255,255,255,0.25)');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);

      card.appendChild(svg);
    }

    // Composition percentages
    const compRow = document.createElement('div');
    compRow.className = 'weapon-store__card-desc';
    compRow.textContent = formatCraftedWeaponModifier(craftedWeapon);
    card.appendChild(compRow);

    // Base level / weighted mote value row
    const baseLvlRow = document.createElement('div');
    baseLvlRow.style.cssText = 'font-size:0.72em;color:#aaa;margin:2px 0 2px;';
    const multStr = craftedWeapon.baseStatMultiplier.toFixed(2);
    baseLvlRow.textContent =
      `Lv.${craftedWeapon.baseLevel} | ×${multStr} base | ${craftedWeapon.totalWeightedMoteValue.toLocaleString()} mote-wt`;
    card.appendChild(baseLvlRow);

    // Per-tier modifier lines
    const modLines = getCraftedModifierLines(craftedWeapon);
    if (modLines.length > 0) {
      const modEl = document.createElement('div');
      modEl.style.cssText = 'font-size:0.72em;color:#bbb;margin:2px 0 4px;line-height:1.5;';
      modEl.textContent = modLines.join('\n');
      modEl.style.whiteSpace = 'pre-line';
      card.appendChild(modEl);
    }

    // Stats row
    const { stats } = craftedWeapon.definition;
    const statsRow = document.createElement('div');
    statsRow.className = 'weapon-store__card-stats';
    const effect = stats.effect;
    let effectLabel = 'Single target';
    if (effect?.kind === 'multi')    effectLabel = `Hits ${(effect as { targetCount: number }).targetCount} targets`;
    if (effect?.kind === 'aoe')      effectLabel = `AoE ${(effect as { aoeRadius: number }).aoeRadius}px`;
    if (effect?.kind === 'piercing') effectLabel = `${Math.round((effect as { defPierceRatio: number }).defPierceRatio * 100)}% DEF pierce`;
    statsRow.innerHTML =
      `<span>+${stats.damage} ATK</span>` +
      `<span>+${stats.defBonus} DEF</span>` +
      `<span>${stats.cooldownMs}ms CD</span>` +
      `<span>${stats.range >= 9999 ? '∞' : stats.range}px RNG</span>` +
      `<span>${effectLabel}</span>`;
    card.appendChild(statsRow);

    // Lens slot
    const lensSlotEl = buildLensSlot(craftedWeapon.attachedLens);
    card.appendChild(lensSlotEl);

    // Equip/unequip buttons
    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';
    btnRow.style.flexWrap = 'wrap';
    const maxSlots = getMaxEquippedWeapons(rpgState);
    const canEquipMore = rpgState.equippedWeaponIds.size < maxSlots;
    if (!isEquipped) {
      const equipBtn = document.createElement('button');
      equipBtn.className = 'weapon-store__btn';
      equipBtn.textContent = canEquipMore ? 'Equip' : `Full (${maxSlots}/${maxSlots})`;
      equipBtn.disabled = !canEquipMore;
      equipBtn.addEventListener('click', () => showSlotPicker(craftedWeapon.id, craftedWeapon.name, rpgState));
      btnRow.appendChild(equipBtn);
    } else {
      const unequipBtn = document.createElement('button');
      unequipBtn.className = 'weapon-store__btn weapon-store__btn--equipped';
      unequipBtn.textContent = 'Unequip';
      unequipBtn.addEventListener('click', () => dispatch({ kind: 'unequip_weapon', weaponId: craftedWeapon.id }));
      btnRow.appendChild(unequipBtn);
    }
    card.appendChild(btnRow);
    return card;
  }

  // ── Forge crafting panel ───────────────────────────────────────
  function buildForgeCraftingPanel(rpgState: RpgSimState, isDevMode: boolean): HTMLElement {
    const panel = document.createElement('div');
    panel.style.cssText =
      'background:rgba(20,10,30,0.85);border:1px solid rgba(200,160,80,0.4);border-radius:6px;' +
      'padding:12px;margin-bottom:12px;';

    const heading = document.createElement('div');
    heading.style.cssText = 'color:#d4a040;font-weight:700;font-size:0.9em;letter-spacing:0.05em;margin-bottom:8px;';
    const forgeCraftLevel = getRpgUpgradeLevel(rpgState, 'forge_craft_level') + 1;
    const capacity = getForgeCapacity(forgeCraftLevel);
    heading.textContent = `Forge Crafting  (Capacity: ${capacity} mote types)`;
    panel.appendChild(heading);

    // Refined crystal inventory
    const inventoryEl = document.createElement('div');
    inventoryEl.style.cssText = 'font-size:0.8em;margin-bottom:10px;color:#bbb;';
    if (rpgState.refinedCrystalsByTierId.size === 0) {
      inventoryEl.textContent = 'No refined crystals yet. Trigger forge crunches to produce them.';
    } else {
      const rows: string[] = [];
      for (const [tierId, count] of rpgState.refinedCrystalsByTierId) {
        if (count <= 0) continue;
        const name = TIER_BY_ID.get(tierId as TierId)?.displayName ?? tierId;
        rows.push(`${name}: ${count}`);
      }
      inventoryEl.textContent = rows.length > 0
        ? 'Refined crystals: ' + rows.join(' · ')
        : 'No refined crystals yet. Trigger forge crunches to produce them.';
    }
    panel.appendChild(inventoryEl);

    // Ingredient inputs
    const inputsHeading = document.createElement('div');
    inputsHeading.style.cssText = 'color:#ccc;font-size:0.8em;margin-bottom:6px;';
    inputsHeading.textContent = 'Select ingredients:';
    panel.appendChild(inputsHeading);

    const ingredientMap = new Map<TierId, HTMLInputElement>();
    const previewEl = document.createElement('div');
    previewEl.style.cssText = 'font-size:0.78em;color:#aaa;margin:8px 0;min-height:1.4em;';

    function refreshPreview(): void {
      const ingredients: Array<{ tierId: TierId; refinedCount: number }> = [];
      for (const [tierId, input] of ingredientMap) {
        const n = Math.max(0, parseInt(input.value, 10) || 0);
        if (n > 0) ingredients.push({ tierId, refinedCount: n });
      }
      if (ingredients.length === 0) {
        previewEl.textContent = '';
        return;
      }
      const comp = computeCraftedWeaponComposition(ingredients);
      previewEl.textContent = 'Preview: ' + comp
        .map(e => `${TIER_BY_ID.get(e.tierId as TierId)?.displayName ?? e.tierId} ${Math.round(e.share * 100)}%`)
        .join(' · ');
    }

    const inputGrid = document.createElement('div');
    inputGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin-bottom:8px;';

    for (const [tierId, available] of rpgState.refinedCrystalsByTierId) {
      if (available <= 0 && !isDevMode) continue;
      const name = TIER_BY_ID.get(tierId as TierId)?.displayName ?? tierId;
      const color = TIER_BY_ID.get(tierId as TierId)?.color ?? '#fff';

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;';

      const label = document.createElement('label');
      label.style.cssText = `color:${color};font-size:0.78em;min-width:64px;`;
      label.textContent = `${name} (${available})`;

      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = isDevMode ? '9999' : String(available);
      input.value = '0';
      input.style.cssText =
        'width:54px;background:rgba(0,0,0,0.5);border:1px solid rgba(200,200,200,0.3);' +
        'color:#fff;padding:2px 4px;border-radius:3px;font-size:0.78em;';
      input.addEventListener('input', refreshPreview);
      ingredientMap.set(tierId as TierId, input);

      row.appendChild(label);
      row.appendChild(input);
      inputGrid.appendChild(row);
    }
    panel.appendChild(inputGrid);
    panel.appendChild(previewEl);

    // Craft button
    const craftBtn = document.createElement('button');
    craftBtn.className = 'weapon-store__btn';
    craftBtn.style.cssText = 'background:rgba(200,160,0,0.15);border-color:rgba(200,160,0,0.5);color:#d4a040;';
    craftBtn.textContent = 'Craft Weapon';
    craftBtn.addEventListener('click', () => {
      const ingredients: Array<{ tierId: string; refinedCount: number }> = [];
      for (const [tierId, input] of ingredientMap) {
        const n = Math.max(0, parseInt(input.value, 10) || 0);
        if (n > 0) ingredients.push({ tierId, refinedCount: n });
      }
      if (ingredients.length > 0) {
        dispatch({ kind: 'craft_weapon', ingredients });
      }
    });
    panel.appendChild(craftBtn);

    return panel;
  }

  function update(
    rpgState: RpgSimState,
    resources: ResourceState,
    numberFormat: NumberFormat,
    isDevMode: boolean,
  ): void {
    element.innerHTML = '';

    // Slot count info
    const slotsInfo = document.createElement('div');
    slotsInfo.style.cssText = 'text-align:center;margin-bottom:8px;color:#fff172;font-size:0.85em;';
    const maxSlots = getMaxEquippedWeapons(rpgState);
    slotsInfo.textContent = `Equipped: ${rpgState.equippedWeaponIds.size} / ${maxSlots} slot${maxSlots !== 1 ? 's' : ''}`;
    element.appendChild(slotsInfo);

    element.appendChild(makePageBreak('small'));

    // Forge crafting section (only if forge is relevant or crystals exist)
    const hasCrystals = Array.from(rpgState.refinedCrystalsByTierId.values()).some(n => n > 0);
    if (hasCrystals || isDevMode) {
      element.appendChild(buildForgeCraftingPanel(rpgState, isDevMode));
    }

    const list = document.createElement('div');
    list.className = 'weapon-store__list';
    // Sand blade card appears at the very top — it is the default melee with an Enable/Disable toggle.
    list.appendChild(buildSandBladeCard(rpgState));
    // Crafted weapons appear after sand blade, before purchasable weapons
    for (const craftedWeapon of rpgState.craftedWeapons) {
      list.appendChild(buildCraftedWeaponCard(craftedWeapon, rpgState));
    }
    for (const weapon of WEAPON_DEFINITIONS) {
      list.appendChild(buildWeaponCard(weapon, rpgState, resources, numberFormat, isDevMode));
    }
    element.appendChild(list);
    element.appendChild(makePageBreak('small'));

    if (isDevMode) {
      element.appendChild(buildChainWhipDevPanel());
    }
  }

  return { element, update };
}

// ── Quartz whip physics dev panel ─────────────────────────────────────────────

const CHAIN_PARAM_LABELS: Record<ChainWhipParamKey, string> = {
  CHAIN_MIN_RADIUS:          'Min link radius (px)',
  CHAIN_MAX_RADIUS:          'Max link radius (px)',
  CHAIN_LASH_MS:             'Lash duration (ms)',
  CHAIN_RETRACT_MS:          'Retract duration (ms)',
  CHAIN_HIT_CD_MS:           'Hit cooldown (ms)',
  CHAIN_REST_LENGTH:         'Rest length (px/node)',
  CHAIN_SPRING_K:            'Spring stiffness K',
  CHAIN_ANCHOR_K:            'Anchor spring K (idle)',
  CHAIN_RETRACT_ANCHOR_K:    'Anchor spring K (retract)',
  CHAIN_DAMPING_COEFF:       'Damping coefficient',
  CHAIN_DAMPING_SPEED_SCALE: 'Damping speed scale',
  CHAIN_LASH_SPEED:          'Lash impulse speed (px/dt)',
  CHAIN_MIN_INERTIA:         'Min inertia (node 0)',
  CHAIN_MAX_INERTIA:         'Max inertia (tip node)',
  CHAIN_LINK_GAP_RATIO:      'Link gap ratio',
};

const CHAIN_PARAM_ORDER: ChainWhipParamKey[] = [
  'CHAIN_LASH_MS', 'CHAIN_RETRACT_MS', 'CHAIN_HIT_CD_MS',
  'CHAIN_REST_LENGTH', 'CHAIN_SPRING_K', 'CHAIN_ANCHOR_K', 'CHAIN_RETRACT_ANCHOR_K',
  'CHAIN_DAMPING_COEFF', 'CHAIN_DAMPING_SPEED_SCALE',
  'CHAIN_LASH_SPEED', 'CHAIN_MIN_INERTIA', 'CHAIN_MAX_INERTIA',
  'CHAIN_MIN_RADIUS', 'CHAIN_MAX_RADIUS', 'CHAIN_LINK_GAP_RATIO',
];

function buildChainWhipDevPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.style.cssText = 'margin-top:12px;background:rgba(20,10,30,0.85);border:1px solid rgba(160,216,239,0.35);border-radius:6px;padding:12px;';

  const heading = document.createElement('div');
  heading.style.cssText = 'color:#a0d8ef;font-weight:700;font-size:0.85em;letter-spacing:0.05em;margin-bottom:8px;';
  heading.textContent = '🔧 Quartz Whip Physics (Dev Mode)';
  panel.appendChild(heading);

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;';

  const current = getChainWhipParams();

  for (const key of CHAIN_PARAM_ORDER) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:2px;';

    const label = document.createElement('label');
    label.style.cssText = 'font-size:0.72em;color:#88b8cc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    label.textContent = CHAIN_PARAM_LABELS[key];

    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex;gap:4px;align-items:center;';

    const input = document.createElement('input');
    input.type = 'number';
    input.value = String(current[key]);
    input.step = key.includes('_MS') ? '10' : '0.01';
    input.style.cssText =
      'width:80px;background:rgba(0,0,0,0.5);border:1px solid rgba(160,216,239,0.35);' +
      'border-radius:3px;color:#e0f0ff;font-size:0.8em;padding:2px 4px;';
    input.addEventListener('change', () => {
      const val = parseFloat(input.value);
      if (!isNaN(val)) setChainWhipParam(key, val);
    });

    const dflt = CHAIN_WHIP_PARAM_DEFAULTS[key];
    const resetBtn = document.createElement('button');
    resetBtn.textContent = '↺';
    resetBtn.title = `Reset to default (${dflt})`;
    resetBtn.style.cssText =
      'padding:2px 5px;background:rgba(40,40,60,0.8);border:1px solid rgba(160,216,239,0.25);' +
      'border-radius:3px;color:#a0d8ef;font-size:0.75em;cursor:pointer;touch-action:manipulation;';
    resetBtn.addEventListener('click', () => {
      setChainWhipParam(key, dflt);
      input.value = String(dflt);
    });

    inputRow.appendChild(input);
    inputRow.appendChild(resetBtn);
    row.appendChild(label);
    row.appendChild(inputRow);
    grid.appendChild(row);
  }

  panel.appendChild(grid);

  const resetAllBtn = document.createElement('button');
  resetAllBtn.textContent = '↺ Reset All to Defaults';
  resetAllBtn.style.cssText =
    'margin-top:10px;width:100%;padding:5px;background:rgba(40,20,60,0.8);' +
    'border:1px solid rgba(160,216,239,0.35);border-radius:4px;color:#a0d8ef;' +
    'font-size:0.78em;font-weight:600;cursor:pointer;touch-action:manipulation;';
  resetAllBtn.addEventListener('click', () => {
    resetChainWhipParams();
    // Refresh displayed values in order matching CHAIN_PARAM_ORDER
    const inputs = grid.querySelectorAll('input[type="number"]');
    CHAIN_PARAM_ORDER.forEach((key, i) => {
      (inputs[i] as HTMLInputElement).value = String(CHAIN_WHIP_PARAM_DEFAULTS[key]);
    });
  });
  panel.appendChild(resetAllBtn);

  return panel;
}
