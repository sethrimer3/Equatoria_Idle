/**
 * rpg-enemy-constants.ts — Per-enemy-type constants for all non-starter enemies.
 *
 * Covers: Emerald, Amber, Void, Quartz, Ruby, Sunstone, Citrine,
 *         Iolite, Amethyst, Diamond, Nullstone, Fracteryl, Eigenstein.
 *
 * Extracted from rpg-constants.ts to keep that file under ~600 lines.
 * Starter enemies (Laser, Sapphire) remain in rpg-constants.ts.
 */

// ── Emerald enemy constants ────────────────────────────────────
export const EMERALD_ENEMY_SIZE     =   5;
export const EMERALD_ENEMY_COLOR    = '#22dd66';
export const EMERALD_ENEMY_GLOW     = '#55ff99';
export const EMERALD_HP_INIT        =  90;
export const EMERALD_ATK_INIT       =  14;
export const EMERALD_DEF_INIT       =   4;
export const EMERALD_PATROL_SPEED   =   0.55;
export const EMERALD_PATROL_TURN_MS = 2200;
export const EMERALD_ATTACK_RADIUS  = 110;    // px — detect range that triggers blink
export const EMERALD_CHARGE_MS      = 380;    // ms charging before blink
export const EMERALD_BLINK_OFFSET   =   8;   // px offset from player center after blink
export const EMERALD_COOLDOWN_MS    = 2500;  // ms cooldown after a blink attack
export const EMERALD_GHOST_FADE_MS  = 420;   // ms for ghost afterimage to fade out
export const EMERALD_PATROL_DAMPING = 0.97;

// ── Amber enemy constants ──────────────────────────────────────
export const AMBER_ENEMY_SIZE       =   7;
export const AMBER_ENEMY_COLOR      = '#ffaa22';
export const AMBER_ENEMY_GLOW       = '#ffcc66';
export const AMBER_HP_INIT          = 380;
export const AMBER_ATK_INIT         =  20;
export const AMBER_DEF_INIT         =   8;
export const AMBER_PATROL_SPEED     =   0.35;
export const AMBER_PATROL_TURN_MS   = 3500;
export const AMBER_PATROL_DAMPING   =   0.97;
export const AMBER_MISSILE_CD_MS    = 3800;  // ms between fan bursts
export const AMBER_MISSILE_JITTER   =  700;  // ±random offset to burst CD
export const AMBER_SHARD_SPREAD_RAD =   0.38; // ±spread angle (radians) for fan
export const AMBER_SHARD_COUNT      =   3;

// ── Amber shard (projectile) constants ────────────────────────
export const AMBER_SHARD_SPEED      =   1.4;
export const AMBER_SHARD_MAX_SPEED  =   2.0;
export const AMBER_SHARD_SEEK_STR   =   0.018;
export const AMBER_SHARD_SIZE       =   3;
export const AMBER_SHARD_HP_INIT    =  25;
export const AMBER_SHARD_ATK_INIT   =  22;
export const AMBER_SHARD_TRAIL_CAP  =  35;
export const AMBER_SHARD_COLOR      = '#ff8833';
export const AMBER_SHARD_GLOW       = '#ffaa55';

// ── Void enemy constants ───────────────────────────────────────
export const VOID_ENEMY_SIZE        =   8;
export const VOID_ENEMY_COLOR       = '#9933ff';
export const VOID_ENEMY_GLOW        = '#bb66ff';
export const VOID_HP_INIT           = 750;
export const VOID_ATK_INIT          =  28;
export const VOID_DEF_INIT          =  14;
export const VOID_PURSUE_SPEED      =   0.60; // constant homing speed (px/frame)
export const VOID_CONTACT_RADIUS    =   9;   // px — contact damage distance
export const VOID_CONTACT_CD_MS     = 1200;  // ms between contact damage ticks
export const VOID_AURA_PULSE_MS     = 1400;  // ms for one full aura pulse cycle
export const VOID_AURA_RADIUS       =  14;   // px — aura ring radius

// ── Quartz enemy constants ─────────────────────────────────────
export const QUARTZ_ENEMY_SIZE        =   5;
export const QUARTZ_ENEMY_COLOR       = '#f5f0eb';
export const QUARTZ_ENEMY_GLOW        = '#faf8f5';
export const QUARTZ_HP_INIT           =  35;
export const QUARTZ_ATK_INIT          =   8;
export const QUARTZ_DEF_INIT          =   3;
export const QUARTZ_PREFERRED_DIST    =  90;
export const QUARTZ_APPROACH_SPEED    =   0.6;
export const QUARTZ_STRAFE_SPEED      =   0.5;
export const QUARTZ_SPIKE_CD_MS       = 2200;
export const QUARTZ_SPIKE_JITTER      =  400;
// ── Quartz spike (projectile) constants ────────────────────────
export const QUARTZ_SPIKE_SPEED       =   1.0;
export const QUARTZ_SPIKE_SIZE        =   3;
export const QUARTZ_SPIKE_HP_INIT     =  20;
export const QUARTZ_SPIKE_ATK_INIT    =  12;
export const QUARTZ_SPIKE_LIFE_MS     = 3000;
export const QUARTZ_SPIKE_COLOR       = '#f0e8d8';
export const QUARTZ_SPIKE_GLOW        = '#faf8f5';

// ── Ruby enemy constants ───────────────────────────────────────
export const RUBY_ENEMY_SIZE          =   5;
export const RUBY_ENEMY_COLOR         = '#dc3232';
export const RUBY_ENEMY_GLOW          = '#ff6b6b';
export const RUBY_HP_INIT             = 120;
export const RUBY_ATK_INIT            =  18;
export const RUBY_DEF_INIT            =   5;
export const RUBY_PATROL_SPEED        =   0.8;
export const RUBY_BOLT_CD_MS          = 1200;
export const RUBY_BOLT_JITTER         =  300;
export const RUBY_PREFERRED_DIST      =  60;
// ── Ruby bolt (projectile) constants ──────────────────────────
export const RUBY_BOLT_SPEED          =   2.8;
export const RUBY_BOLT_SIZE           =   2;
export const RUBY_BOLT_HP_INIT        =  15;
export const RUBY_BOLT_ATK_INIT       =  15;
export const RUBY_BOLT_LIFE_MS        = 1500;
export const RUBY_BOLT_COLOR          = '#ff4444';
export const RUBY_BOLT_GLOW           = '#ff8888';

// ── Sunstone enemy constants ───────────────────────────────────
export const SUNSTONE_ENEMY_SIZE      =   7;
export const SUNSTONE_ENEMY_COLOR     = '#ff8c3c';
export const SUNSTONE_ENEMY_GLOW      = '#ffb366';
export const SUNSTONE_HP_INIT         = 200;
export const SUNSTONE_ATK_INIT        =  16;
export const SUNSTONE_DEF_INIT        =   6;
export const SUNSTONE_PREFERRED_DIST  = 120;
export const SUNSTONE_ORBIT_SPEED     =   0.4;
export const SUNSTONE_PULSE_CD_MS     = 3500;
export const SUNSTONE_PULSE_JITTER    =  600;

// ── Citrine enemy constants ────────────────────────────────────
export const CITRINE_ENEMY_SIZE       =   5;
export const CITRINE_ENEMY_COLOR      = '#e6c850';
export const CITRINE_ENEMY_GLOW       = '#f0d870';
export const CITRINE_HP_INIT          = 150;
export const CITRINE_ATK_INIT         =  22;
export const CITRINE_DEF_INIT         =   4;
export const CITRINE_PATROL_SPEED     =   0.9;
export const CITRINE_PATROL_TURN_MS   = 1800;
export const CITRINE_BOLT_CD_MS       = 2800;
export const CITRINE_BOLT_JITTER      =  400;
// ── Citrine bolt (homing) constants ───────────────────────────
export const CITRINE_BOLT_SPEED       =   1.5;
export const CITRINE_BOLT_MAX_SPEED   =   2.4;
export const CITRINE_BOLT_SEEK        =   0.035;
export const CITRINE_BOLT_SIZE        =   3;
export const CITRINE_BOLT_HP_INIT     =  20;
export const CITRINE_BOLT_ATK_INIT    =  20;
export const CITRINE_BOLT_TRAIL_CAP   =  30;
export const CITRINE_BOLT_COLOR       = '#e6c850';
export const CITRINE_BOLT_GLOW        = '#ffe080';

// ── Iolite enemy constants ─────────────────────────────────────
export const IOLITE_ENEMY_SIZE        =   8;
export const IOLITE_ENEMY_COLOR       = '#6464b4';
export const IOLITE_ENEMY_GLOW        = '#8888cc';
export const IOLITE_HP_INIT           = 500;
export const IOLITE_ATK_INIT          =  24;
export const IOLITE_DEF_INIT          =  12;
export const IOLITE_PATROL_SPEED      =   0.3;
export const IOLITE_PATROL_TURN_MS    = 4000;
export const IOLITE_BEAM_CD_MS        = 4000;
export const IOLITE_BEAM_JITTER       =  800;
export const IOLITE_BEAM_RANGE        = 120;
export const IOLITE_BEAM_COUNT        =   5;
export const IOLITE_BEAM_SPREAD_RAD   =   1.047; // ~60 degrees each side

// ── Amethyst enemy constants ───────────────────────────────────
export const AMETHYST_ENEMY_SIZE      =   7;
export const AMETHYST_ENEMY_COLOR     = '#b464c8';
export const AMETHYST_ENEMY_GLOW      = '#d088e0';
export const AMETHYST_HP_INIT         = 800;
export const AMETHYST_ATK_INIT        =  28;
export const AMETHYST_DEF_INIT        =  15;
export const AMETHYST_SHIELD_HP_INIT  = 400;
export const AMETHYST_PATROL_SPEED    =   0.4;
export const AMETHYST_PATROL_TURN_MS  = 3500;
export const AMETHYST_BURST_CD_MS     = 3200;
export const AMETHYST_BURST_JITTER    =  500;
export const AMETHYST_BURST_COUNT     =   8;
// ── Amethyst shard constants ───────────────────────────────────
export const AMETHYST_SHARD_SPEED     =   1.8;
export const AMETHYST_SHARD_SIZE      =   3;
export const AMETHYST_SHARD_HP_INIT   =  25;
export const AMETHYST_SHARD_ATK_INIT  =  24;
export const AMETHYST_SHARD_LIFE_MS   = 1800;
export const AMETHYST_SHARD_COLOR     = '#c87ae0';
export const AMETHYST_SHARD_GLOW      = '#d88af0';

// ── Diamond enemy constants ────────────────────────────────────
export const DIAMOND_ENEMY_SIZE       =   9;
export const DIAMOND_ENEMY_COLOR      = '#e8f0fa';
export const DIAMOND_ENEMY_GLOW       = '#ffffff';
export const DIAMOND_HP_INIT          = 1500;
export const DIAMOND_ATK_INIT         =  35;
export const DIAMOND_DEF_INIT         =  20;
export const DIAMOND_PHASE_INVULN_MS  = 2000;
export const DIAMOND_PHASE_VULN_MS    = 4000;
export const DIAMOND_PATROL_SPEED     =   0.5;
export const DIAMOND_ORBIT_SPEED      =   0.3;
export const DIAMOND_SHARD_CD_MS      = 2500;
export const DIAMOND_SHARD_COUNT      =   6;
export const DIAMOND_SHARD_COLOR      = '#c0e0ff';
export const DIAMOND_SHARD_GLOW       = '#ffffff';
// ── Diamond shard constants ────────────────────────────────────
export const DIAMOND_SHARD_SPEED      =   2.2;
export const DIAMOND_SHARD_SIZE       =   3;
export const DIAMOND_SHARD_HP_INIT    =  30;
export const DIAMOND_SHARD_ATK_INIT   =  30;
export const DIAMOND_SHARD_LIFE_MS    = 1400;

// ── Nullstone enemy constants ──────────────────────────────────
export const NULLSTONE_ENEMY_SIZE         =  10;
export const NULLSTONE_ENEMY_COLOR        = '#1e1e28';
export const NULLSTONE_ENEMY_GLOW         = '#9664c8';
export const NULLSTONE_HP_INIT            = 2500;
export const NULLSTONE_ATK_INIT           =   42;
export const NULLSTONE_DEF_INIT           =   25;
export const NULLSTONE_GRAVITY_STRENGTH   =   0.0015;
export const NULLSTONE_GRAVITY_RADIUS     =  200;
export const NULLSTONE_ABSORB_MS          = 2500;
export const NULLSTONE_ABSORB_CD_MS       = 5000;
export const NULLSTONE_PATROL_SPEED       =   0.25;
export const NULLSTONE_PATROL_TURN_MS     = 5000;
export const NULLSTONE_TENDRIL_CD_MS      = 3000;
export const NULLSTONE_TENDRIL_COUNT      =   3;
// ── Void tendril (nullstone projectile) constants ──────────────
export const VOID_TENDRIL_SPEED       =   1.8;
export const VOID_TENDRIL_SIZE        =   4;
export const VOID_TENDRIL_HP_INIT     =  40;
export const VOID_TENDRIL_ATK_INIT    =  35;
export const VOID_TENDRIL_LIFE_MS     = 2000;
export const VOID_TENDRIL_COLOR       = '#4d2280';
export const VOID_TENDRIL_GLOW        = '#9664c8';

// ── XP multipliers per enemy type ─────────────────────────────
export const LASER_XP_MULT     = 1;
export const SAPPHIRE_XP_MULT  = 3;
export const EMERALD_XP_MULT   = 2;
export const AMBER_XP_MULT     = 4;
export const VOID_XP_MULT      = 6;
export const QUARTZ_XP_MULT    = 1.5;
export const RUBY_XP_MULT      = 2.5;
export const SUNSTONE_XP_MULT  = 3;
export const CITRINE_XP_MULT   = 3.5;
export const IOLITE_XP_MULT    = 5;
export const AMETHYST_XP_MULT  = 6;
export const DIAMOND_XP_MULT   = 8;
export const NULLSTONE_XP_MULT = 10;
export const FRACTERYL_XP_MULT = 14;
export const EIGENSTEIN_XP_MULT = 18;

// ── Fracteryl enemy constants (tier 11) ───────────────────────────
export const FRACTERYL_HP_INIT           = 3200;
export const FRACTERYL_ATK_INIT          = 65;
export const FRACTERYL_DEF_INIT          = 35;
export const FRACTERYL_ENEMY_SIZE        = 11;
export const FRACTERYL_BURST_CD_MS       = 2800;
export const FRACTERYL_BURST_JITTER      = 800;
export const FRACTERYL_PATROL_TURN_MS    = 2500;
export const FRACTERYL_SHARD_HP_INIT     = 30;
export const FRACTERYL_SHARD_ATK_INIT    = 22;
export const FRACTERYL_SHARD_LIFE_MS     = 1800;
export const FRACTERYL_ENEMY_COLOR       = '#cc44ff';
export const FRACTERYL_ENEMY_GLOW        = '#ee88ff';

// ── Eigenstein enemy constants (tier 12) ──────────────────────────
export const EIGENSTEIN_HP_INIT          = 4500;
export const EIGENSTEIN_ATK_INIT         = 80;
export const EIGENSTEIN_DEF_INIT         = 45;
export const EIGENSTEIN_ENEMY_SIZE       = 12;
export const EIGENSTEIN_BEAM_CD_MS       = 3500;
export const EIGENSTEIN_BEAM_JITTER      = 1000;
export const EIGENSTEIN_BEAM_CHARGE_MS   = 900;
export const EIGENSTEIN_BEAM_FIRE_MS     = 300;
export const EIGENSTEIN_PATROL_TURN_MS   = 3000;
export const EIGENSTEIN_ENEMY_COLOR      = '#44ccff';
export const EIGENSTEIN_ENEMY_GLOW       = '#88eeff';
