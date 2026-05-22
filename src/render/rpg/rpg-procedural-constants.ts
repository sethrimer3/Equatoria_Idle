/**
 * rpg-procedural-constants.ts — Combat stats, visual constants, and movement
 * parameters for the procedural creature types.
 *
 * All HP/ATK/DEF values are base values (wave 1). The `getWaveStatScale(wave)`
 * helper in rpg-state.ts scales them at spawn time.
 */

// ── Shared movement / contact damage ──────────────────────────────────────────
/** px/frame drift speed used as the base patrol speed for all proc enemies. */
export const PROC_PATROL_SPEED   = 0.40;
/** ms between random direction changes during patrol. */
export const PROC_PATROL_TURN_MS = 2500;
/** Velocity damping per frame for proc enemies. */
export const PROC_PATROL_DAMPING = 0.97;
/** px radius at which contact damage is applied. */
export const PROC_CONTACT_RADIUS = 8;
/** ms cooldown between contact damage ticks. */
export const PROC_CONTACT_CD_MS  = 600;
/** ms the white hit-flash overlay stays visible after a hit. */
export const PROC_HIT_FLASH_MS   = 80;

// ── Dust Wisp ──────────────────────────────────────────────────────────────────
export const DUSTWISP_HP_INIT   =  60;
export const DUSTWISP_ATK_INIT  =   8;
export const DUSTWISP_DEF_INIT  =   2;
export const DUSTWISP_SIZE      =   5;
export const DUSTWISP_XP_MULT   = 1.2;
export const DUSTWISP_COLOR     = '#b4d4e8';
export const DUSTWISP_GLOW      = '#d0e8f8';

// ── Ribbon Worm ────────────────────────────────────────────────────────────────
export const RIBBONWORM_HP_INIT   =  90;
export const RIBBONWORM_ATK_INIT  =  12;
export const RIBBONWORM_DEF_INIT  =   3;
export const RIBBONWORM_SIZE      =   6;
export const RIBBONWORM_XP_MULT   = 1.8;
export const RIBBONWORM_SEG_COUNT =   7;
export const RIBBONWORM_SEG_DIST  =   5;
export const RIBBONWORM_COLOR     = '#78c878';
export const RIBBONWORM_GLOW      = '#a0e8a0';

// ── Lantern Moth ───────────────────────────────────────────────────────────────
export const LANTERNMOTH_HP_INIT   =  75;
export const LANTERNMOTH_ATK_INIT  =  10;
export const LANTERNMOTH_DEF_INIT  =   2;
export const LANTERNMOTH_SIZE      =   5;
export const LANTERNMOTH_XP_MULT   = 1.5;
export const LANTERNMOTH_COLOR     = '#f0d088';
export const LANTERNMOTH_GLOW      = '#ffe8b0';

// ── Eye Stalk ──────────────────────────────────────────────────────────────────
export const EYESTALK_HP_INIT    = 110;
export const EYESTALK_ATK_INIT   =  14;
export const EYESTALK_DEF_INIT   =   4;
export const EYESTALK_SIZE       =   7;
export const EYESTALK_XP_MULT    = 2.2;
export const EYESTALK_COLOR      = '#d0b870';
export const EYESTALK_GLOW       = '#f0d890';

// ── Floating Jellyfish ─────────────────────────────────────────────────────────
export const JELLYFISH_HP_INIT   = 130;
export const JELLYFISH_ATK_INIT  =  15;
export const JELLYFISH_DEF_INIT  =   5;
export const JELLYFISH_SIZE      =   8;
export const JELLYFISH_XP_MULT   = 2.5;
export const JELLYFISH_COLOR     = '#96d8f0';
export const JELLYFISH_GLOW      = '#c0e8ff';

// ── Cloth Ghost ────────────────────────────────────────────────────────────────
export const CLOTHGHOST_HP_INIT   = 100;
export const CLOTHGHOST_ATK_INIT  =  12;
export const CLOTHGHOST_DEF_INIT  =   3;
export const CLOTHGHOST_SIZE      =   6;
export const CLOTHGHOST_XP_MULT   = 2.0;
export const CLOTHGHOST_COLOR     = '#c8c8e8';
export const CLOTHGHOST_GLOW      = '#e0e0ff';

// ── Plant Turret ───────────────────────────────────────────────────────────────
export const PLANTTURRET_HP_INIT        = 160;
export const PLANTTURRET_ATK_INIT       =  18;
export const PLANTTURRET_DEF_INIT       =   6;
export const PLANTTURRET_SIZE           =   7;
export const PLANTTURRET_XP_MULT        = 3.0;
export const PLANTTURRET_FIRE_CD_MS     = 2200;
export const PLANTTURRET_FIRE_JITTER    =  400;
export const PLANTTURRET_COLOR          = '#50b850';
export const PLANTTURRET_GLOW           = '#78d878';
export const PLANT_PROJ_HP_INIT         =  30;
export const PLANT_PROJ_ATK_INIT        =  14;
export const PLANT_PROJ_SPEED           =   1.6;
export const PLANT_PROJ_LIFE_MS         = 2500;
export const PLANT_PROJ_SIZE            =   3;
export const PLANT_PROJ_COLOR           = '#78d848';
export const PLANT_PROJ_GLOW            = '#a0f060';

// ── Gear Insect ────────────────────────────────────────────────────────────────
export const GEARINSECT_HP_INIT   = 200;
export const GEARINSECT_ATK_INIT  =  20;
export const GEARINSECT_DEF_INIT  =   8;
export const GEARINSECT_SIZE      =   7;
export const GEARINSECT_XP_MULT   = 3.5;
export const GEARINSECT_COLOR     = '#a0a0b0';
export const GEARINSECT_GLOW      = '#c0c0d0';

// ── Spider Crawler ─────────────────────────────────────────────────────────────
export const SPIDERCRAWLER_HP_INIT   = 180;
export const SPIDERCRAWLER_ATK_INIT  =  22;
export const SPIDERCRAWLER_DEF_INIT  =   7;
export const SPIDERCRAWLER_SIZE      =   7;
export const SPIDERCRAWLER_XP_MULT   = 3.0;
export const SPIDERCRAWLER_COLOR     = '#a06850';
export const SPIDERCRAWLER_GLOW      = '#c88868';

// ── Magnetic Mote Swarm ────────────────────────────────────────────────────────
export const MOTESWARM_HP_INIT     = 140;
export const MOTESWARM_ATK_INIT    =  16;
export const MOTESWARM_DEF_INIT    =   5;
export const MOTESWARM_SIZE        =   6;
export const MOTESWARM_XP_MULT     = 2.8;
export const MOTESWARM_MOTE_COUNT  =   5;
export const MOTESWARM_ORBIT_DIST  =  14;
export const MOTESWARM_COLOR       = '#f0d860';
export const MOTESWARM_GLOW        = '#ffe880';

// ── Shadow Hand ────────────────────────────────────────────────────────────────
export const SHADOWHAND_HP_INIT    = 250;
export const SHADOWHAND_ATK_INIT   =  28;
export const SHADOWHAND_DEF_INIT   =  10;
export const SHADOWHAND_SIZE       =   8;
export const SHADOWHAND_XP_MULT    = 4.5;
export const SHADOWHAND_COLOR      = '#484868';
export const SHADOWHAND_GLOW       = '#7070a0';

// ── Fish enemies ───────────────────────────────────────────────────────────────
export const SANDFISH_HP_INIT = 70;
export const SANDFISH_ATK_INIT = 9;
export const SANDFISH_DEF_INIT = 2;
export const SANDFISH_SIZE = 6;
export const SANDFISH_XP_MULT = 1.4;
export const SANDFISH_COLOR = '#d4aa60';
export const SANDFISH_GLOW = '#e8cc88';

export const QUARTZFISH_HP_INIT = 140;
export const QUARTZFISH_ATK_INIT = 13;
export const QUARTZFISH_DEF_INIT = 5;
export const QUARTZFISH_SIZE = 7;
export const QUARTZFISH_XP_MULT = 2.8;
export const QUARTZFISH_SHIELD_HP = 50;
export const QUARTZFISH_COLOR = '#dde8f0';
export const QUARTZFISH_GLOW = '#ffffff';

export const RUBYFISH_HP_INIT = 120;
export const RUBYFISH_ATK_INIT = 18;
export const RUBYFISH_DEF_INIT = 4;
export const RUBYFISH_SIZE = 7;
export const RUBYFISH_XP_MULT = 2.5;
export const RUBYFISH_COLOR = '#e83030';
export const RUBYFISH_GLOW = '#ff7060';

export const SUNSTONEFISH_HP_INIT = 130;
export const SUNSTONEFISH_ATK_INIT = 15;
export const SUNSTONEFISH_DEF_INIT = 4;
export const SUNSTONEFISH_SIZE = 7;
export const SUNSTONEFISH_XP_MULT = 2.6;
export const SUNSTONEFISH_COLOR = '#e87820';
export const SUNSTONEFISH_GLOW = '#ffaa40';

export const EMERALDFISH_HP_INIT = 100;
export const EMERALDFISH_ATK_INIT = 12;
export const EMERALDFISH_DEF_INIT = 3;
export const EMERALDFISH_SIZE = 6;
export const EMERALDFISH_XP_MULT = 2.0;
export const EMERALDFISH_MINI_HP_INIT = 40;
export const EMERALDFISH_MINI_ATK_INIT = 8;
export const EMERALDFISH_MINI_SIZE = 4;
export const EMERALDFISH_COLOR = '#30c050';
export const EMERALDFISH_GLOW = '#60ff80';

export const SAPPHIREFISH_HP_INIT = 120;
export const SAPPHIREFISH_ATK_INIT = 14;
export const SAPPHIREFISH_DEF_INIT = 4;
export const SAPPHIREFISH_SIZE = 7;
export const SAPPHIREFISH_XP_MULT = 2.4;
export const SAPPHIREFISH_COLOR = '#4060e8';
export const SAPPHIREFISH_GLOW = '#80a0ff';

export const AMETHYSTFISH_HP_INIT = 115;
export const AMETHYSTFISH_ATK_INIT = 13;
export const AMETHYSTFISH_DEF_INIT = 4;
export const AMETHYSTFISH_SIZE = 7;
export const AMETHYSTFISH_XP_MULT = 2.3;
export const AMETHYSTFISH_COLOR = '#9040c8';
export const AMETHYSTFISH_GLOW = '#c080ff';

export const DIAMONDFISH_HP_INIT = 220;
export const DIAMONDFISH_ATK_INIT = 16;
export const DIAMONDFISH_DEF_INIT = 8;
export const DIAMONDFISH_SIZE = 8;
export const DIAMONDFISH_XP_MULT = 4.0;
export const DIAMONDFISH_COLOR = '#80eeff';
export const DIAMONDFISH_GLOW = '#c0ffff';

export const SANDFISH_LUNGE_CD_MS = 3500;
export const RUBYFISH_DASH_WINDUP_MS = 700;
export const RUBYFISH_DASH_MS = 350;
export const RUBYFISH_RECOVERY_MS = 800;
export const SUNSTONEFISH_MINE_CD_MS = 3000;
export const SUNSTONEFISH_MINE_COUNT = 4;
export const SUNSTONEFISH_MINE_ARM_MS = 1200;
export const SUNSTONEFISH_MINE_LIFE_MS = 5000;
export const SUNSTONEFISH_SPIKE_COUNT = 8;
export const SAPPHIREFISH_BOLT_CD_MS = 2000;
export const AMETHYSTFISH_TELEPORT_CD_MS = 3500;
export const DIAMONDFISH_ARMOR_ON_MS = 3000;
export const DIAMONDFISH_ARMOR_OFF_MS = 4000;

// ── Fluid explosion RGB colours per type ──────────────────────────────────────
export const FLUID_DUSTWISP_R      = 180, FLUID_DUSTWISP_G      = 210, FLUID_DUSTWISP_B      = 230;
export const FLUID_RIBBONWORM_R    = 120, FLUID_RIBBONWORM_G    = 200, FLUID_RIBBONWORM_B    = 100;
export const FLUID_LANTERNMOTH_R   = 255, FLUID_LANTERNMOTH_G   = 200, FLUID_LANTERNMOTH_B   =  80;
export const FLUID_EYESTALK_R      = 200, FLUID_EYESTALK_G      = 180, FLUID_EYESTALK_B      =  80;
export const FLUID_JELLYFISH_R     = 150, FLUID_JELLYFISH_G     = 230, FLUID_JELLYFISH_B     = 255;
export const FLUID_CLOTHGHOST_R    = 200, FLUID_CLOTHGHOST_G    = 200, FLUID_CLOTHGHOST_B    = 255;
export const FLUID_PLANTTURRET_R   =  80, FLUID_PLANTTURRET_G   = 200, FLUID_PLANTTURRET_B   =  60;
export const FLUID_GEARINSECT_R    = 150, FLUID_GEARINSECT_G    = 150, FLUID_GEARINSECT_B    = 160;
export const FLUID_SPIDERCRAWLER_R = 160, FLUID_SPIDERCRAWLER_G =  90, FLUID_SPIDERCRAWLER_B =  50;
export const FLUID_MOTESWARM_R     = 240, FLUID_MOTESWARM_G     = 210, FLUID_MOTESWARM_B     =  80;
export const FLUID_SHADOWHAND_R    =  48, FLUID_SHADOWHAND_G    =  48, FLUID_SHADOWHAND_B    =  80;
export const FLUID_SANDFISH_R = 210, FLUID_SANDFISH_G = 170, FLUID_SANDFISH_B = 90;
export const FLUID_QUARTZFISH_R = 210, FLUID_QUARTZFISH_G = 230, FLUID_QUARTZFISH_B = 240;
export const FLUID_RUBYFISH_R = 230, FLUID_RUBYFISH_G = 50, FLUID_RUBYFISH_B = 50;
export const FLUID_SUNSTONEFISH_R = 230, FLUID_SUNSTONEFISH_G = 120, FLUID_SUNSTONEFISH_B = 30;
export const FLUID_EMERALDFISH_R = 50, FLUID_EMERALDFISH_G = 190, FLUID_EMERALDFISH_B = 80;
export const FLUID_SAPPHIREFISH_R = 60, FLUID_SAPPHIREFISH_G = 90, FLUID_SAPPHIREFISH_B = 230;
export const FLUID_AMETHYSTFISH_R = 140, FLUID_AMETHYSTFISH_G = 60, FLUID_AMETHYSTFISH_B = 200;
export const FLUID_DIAMONDFISH_R = 120, FLUID_DIAMONDFISH_G = 230, FLUID_DIAMONDFISH_B = 255;
