import type { TierId } from '../../data/tiers';
import type { NumberFormat } from '../../util/format';
import type { ActionHandler } from '../../input';

export interface RpgRender {
  canvas: HTMLCanvasElement;
  statsPanel: HTMLElement;
  /** Container inside the right column of the stats panel where the RPG menu button should be appended. */
  menuButtonContainer: HTMLElement;
  update(deltaMs: number, autoMoveEnabled?: boolean): void;
  resize(container: HTMLElement): void;
  setActive(active: boolean): void;
  /** Re-reads rpgSimState.equippedWeaponIds and immediately updates playerStats ATK/DEF + weapon particles. */
  notifyEquip(): void;
  /** Dev-mode only: immediately jump to the given wave number (must be multiple of 10). */
  devJumpToWave(wave: number): void;
  /** Immediately restart at the current respawnWave with the visual restart transition. */
  respawnNow(): void;
  /** Enable/disable low graphics mode (skips glows and expensive effects). */
  setLowGraphicsMode(enabled: boolean): void;
  /** Enable/disable screen shake (forwarded to Zenith Binary Horizon). */
  setScreenShakeEnabled(enabled: boolean): void;
  /** Sets enemy indicator style for RPG enemies. */
  setEnemyIndicatorStyle(style: 'triangle' | 'outline' | 'off'): void;
  /** Launch a boss fight for the given 1-based bossId from the RPG menu. */
  startBossFight(bossId: number): void;
  /** Update the number-format setting used to render stat values in the stats panel. */
  setNumberFormat(format: NumberFormat): void;
  /** Position the tappable zone name / wave label at the top or bottom of the battlefield. */
  setZonePosition(position: 'top' | 'bottom'): void;
  /** Show or hide dev-mode numerical designators on each RPG stats panel box. */
  setDevMode(enabled: boolean): void;
  /** Show or hide the RPG debug overlay (nearby enemy HP/status + recent combos). Hidden by default even in dev mode. */
  setRpgDebugOverlay(enabled: boolean): void;
  /** Enable/disable invincibility mode — player takes no damage (dev mode only). */
  setInvincibilityMode(enabled: boolean): void;
  /** Enable/disable topographic terrain debug outlines/dots (dev mode only). */
  setTopographicTerrainDebugEnabled(enabled: boolean): void;
  /** Configure individual RPG developer visual overlays. */
  setDeveloperVisuals(options: {
    viewport: boolean;
    pathfinding: boolean;
    verdureWalls: boolean;
    nadirAnchors: boolean;
    bossStage: boolean;
    topographyLighting: boolean;
    softImpetusAsteroidShadows: boolean;
    rpgPixelatedRender: boolean;
  }): void;
  /**
   * Switch between smooth gradient and sharp cylinder topography shadow modes
   * (dev mode only).  When enabled, shadows are hard-edged and directional;
   * when disabled, the original smooth gradient mode is used.
   */
  setSharpTopographyShadows(enabled: boolean): void;
  /** Dev-mode only: spawn one Aliven group of the given variantId at the canvas edge. */
  devSpawnAliven(variantId: string): void;
  /** Dev-mode only: remove all active Aliven groups instantly. */
  devClearAliven(): void;
  /**
   * Dev-mode only: apply a status combo preset to the nearest enemy.
   * Preset IDs: 'steamBurst' | 'shatter' | 'toxicRupture' | 'gravityCollapse' | 'riftDetonation'
   */
  devApplyStatusCombo(preset: string): void;
  /** Returns the current number of active AlivenParticleGroups (dev use). */
  getAlivenGroupCount(): number;
}

/** Options passed to createRpgRender. */
export interface RpgRenderOptions {
  /**
   * Called when the player collects a lucky mote drop.
   * @param tierId  The mote tier that was collected.
   * @param bonusPct  The percentage bonus to apply to that tier's mote total (e.g. 0.5 = +0.5%).
   */
  onLuckyMoteCollected?: (tierId: TierId, bonusPct: number) => void;
  /**
   * Returns the flat base ATK bonus from claimed achievements.
   * Called inside applyEquipmentStats each time stats are refreshed.
   */
  getAchievementAtkBonus?: () => number;
  /**
   * Called when the player triggers an error interaction (e.g. attempting
   * to add a 4th XP wire).  Callers should play the error SFX.
   */
  onError?: () => void;
  /** Called when an enemy type is added to the codex for the first time. */
  onNewCodexEntry?: () => void;
  /**
   * Action dispatcher for the weapon inventory picker popup.
   * When provided, tapping the WEAP column header or any WEAP slot cell opens
   * the inventory picker, which dispatches equip/swap actions through this handler.
   */
  dispatch?: ActionHandler;
}
