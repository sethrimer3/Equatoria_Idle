/**
 * rpg-procedural-constants.ts — Combat stats, visual constants, and movement
 * parameters for the 11 procedural creature types.
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
export const RIBBONWORM_SEG_DIST  =   5;  // px between segment centres
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
// Plant Turret projectile
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
export const MOTESWARM_ORBIT_DIST  =  14;  // px radius of mote orbit
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
