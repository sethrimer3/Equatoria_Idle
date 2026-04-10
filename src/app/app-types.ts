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

/** Mutable application-level state. */
export interface AppState {
  game: GameState;
  activeTab: TabId;
  tapFlashAlpha: number;
  animPulse: number;
  forge: ForgeCrunchState;
  generatorState: GeneratorState;
  particleDrag: ParticleDragState;
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
}
