/**
 * app-types.ts — Shared type definitions for the app orchestrator.
 */

import type { GameState } from '../sim';
import type { TabId } from '../input';
import type { ForgeCrunchState } from '../sim/forge';
import type { GeneratorState } from '../sim/particles';
import type { ParticleDragState } from '../input/particle-drag';
import type { TabBar } from '../ui/tabs';
import type { UpgradePanel } from '../ui/panels/upgrade-panel';
import type { ResourcePanel } from '../ui/panels/resource-panel';
import type { SettingsPanel } from '../ui/panels/settings-panel';
import type { LoomPanel } from '../ui/panels/loom-panel';
import type { EquationPanel } from '../ui/panels/equation-panel';
import type { AchievementsPanel } from '../ui/panels/achievements-panel';
import type { RpgRender } from '../render/rpg/rpg-render';
import type { RpgMenuPanel } from '../ui/panels/rpg-menu-panel';

/** Mutable application-level state. */
export interface AppState {
  game: GameState;
  activeTab: TabId;
  tapFlashAlpha: number;
  animPulse: number;
  forge: ForgeCrunchState;
  generatorState: GeneratorState;
  particleDrag: ParticleDragState;
  lastTapCanvasX: number;
  lastTapCanvasY: number;
  lastTapTimeMs: number;
  /**
   * Timestamp (ms) when the most recent forge sacrifice crunch completed.
   * Used to drive the brief post-crunch shockwave flash visual.
   * 0 means no flash has occurred yet.
   */
  forgeSacrificeFlashMs: number;
  /**
   * Refined crystals gained during the most recent forge crunch, by tier ID.
   * Displayed as an overlay alongside the sacrifice flash. Cleared on the next crunch.
   */
  lastRefinedCrystalsGained: Map<string, number>;
}

/** Configuration object grouping all UI panels for tab switching. */
export interface UIPanels {
  tabBar: TabBar;
  upgradePanel: UpgradePanel;
  resourcePanel: ResourcePanel;
  settingsPanel: SettingsPanel;
  loomPanel: LoomPanel;
  equationPanel: EquationPanel;
  achievementsPanel: AchievementsPanel;
  panelsContainer: HTMLElement;
  /** The main game canvas container — hidden while the RPG tab is active. */
  mainCanvasContainer: HTMLElement;
  /** The RPG render system and its canvas container. */
  rpgRender: RpgRender;
  /** Container that wraps the RPG canvas — shown only on the RPG tab. */
  rpgContainer: HTMLElement;
  /** Tabbed RPG menu (Menu / Weapons / Upgrades). */
  rpgMenuPanel: RpgMenuPanel;
}
