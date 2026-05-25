# Equatoria RPG Zone Plan

This document summarizes the current design direction for zones/worlds in the Equatoria Idle RPG tab. It is intended as a planning document for future implementation prompts and code changes.

## Implementation Status

As of build #141:

- **Zone data structure**: ✅ Implemented — `RpgZoneDefinition` with `id`, `displayName`, `shortDescription`, `enemyIds`, `terrainProfile`, `visualProfile`, and optional `subzones`.
- **Zone-aware enemy spawning**: ✅ Implemented — `getZoneWaveDefinition(waveNumber, zoneId)` in `wave-definitions.ts`. Euhedral uses the full hand-authored roster. Other zones generate waves from their zone-specific `enemyIds` pool with progressive type introduction.
- **Per-zone current wave persistence**: ✅ Implemented — `currentWaveByZone` is saved in `RpgSimState` and persisted to save data (v27+). Switching zones saves/restores each zone's wave. Reloading resumes from the last active wave.
- **Per-zone highest wave tracking**: ✅ Implemented — `highestWaveReachedByZone` in `RpgSimState`, persisted since v26.
- **Zone selection UI**: ✅ Implemented — `rpg-zone-select.ts` overlay; shows highest wave per zone.
- **Terrain/visual profile hooks**: ✅ Implemented — `terrainProfile` and `visualProfile` fields on each `RpgZoneDefinition`; `getRpgZoneTerrainProfile(zoneId)` helper for future zone-rendering dispatch.
- **Eye Stalk**: ✅ Assigned to Verdure (`proc_eyestalk`).
- **Stardust**: ✅ Assigned to Euhedral.
- **Horizon safe fallback**: ✅ Implemented — empty-pool zones return no spawns and log a one-time warning.
- **Caustics first visual pass**: ✅ Implemented — underwater background tint, animated caustic floor light, shimmer bands (high-graphics), and rising bubble particles. Active only when `activeZoneId === 'caustics'`. Implemented in `src/render/rpg/terrain/caustics-overlay.ts`.
- **Verdure first visual pass**: ✅ Implemented — dark forest-green/bioluminescent atmosphere tint, procedural floor plants (grass tufts, sprouts, moss patches, tiny flowers), procedural vines (tapered segment chains from arena edges with sway animation and spring-damped player disturbance), and drifting pollen particles (high-graphics). Active only when `activeZoneId === 'verdure'`. Implemented in `src/render/rpg/terrain/verdure-overlay.ts`.

**Not yet implemented** (future work):
- Zone-specific terrain generation (terrain currently does not vary by zone).
- Caustics seafloor terrain routing (elongated ridges, `cyanTactical` palette override).
- Stronger caustic pattern quality (offscreen additive blending).
- Optional water-distortion postprocess for Caustics.
- Horizon enemies and special mechanics.
- Impetus gravity fields.
- Verdure vine destruction, enemy disturbance, hazard plants, vine collision — see `nextSteps.md`.

## Core Concept

The RPG tab should have named zones/worlds that define the tactical, visual, and enemy identity of waves. Each zone should feel meaningfully different rather than simply changing the background.

Each zone should define:

1. Enemy pool
2. Elite enemy pool, if applicable
3. Terrain pool
4. Background and visual effects
5. Environmental mechanics
6. Encounter pacing and wave weighting

The UI should show the current zone name in the top right along with the wave number inside that zone.

Example display:

```text
Euhedral - x42
```

Recommended internal tracking:

```ts
globalWave: number;
zoneId: string;
zoneWave: number;
zoneCycle?: number;
subzoneId?: string;
terrainProfile: string;
enemyPool: string[];
```

The displayed wave should be the zone-local wave, while the game can still keep a hidden global wave for scaling, unlocks, and long-term progression.

## Zone Overview

| Zone | Former concept | Core identity |
|---|---|---|
| **Euhedral** | Ridges | Crystalline, mineral, geometric terrain |
| **Impetus** | Astral Drift / space zone | Momentum, gravity, asteroids, living particles |
| **Caustics** | Underwater zone | Seafloor ridges, fish, jellyfish, water-light effects |
| **Verdure** | Plant zone | Procedural plants, vines, insects, living growth |
| **Horizon** | Special fifth zone | Three subzones with rule-shifting mechanics and high spectacle |

## Zone 1: Euhedral

### Identity

Euhedral is the baseline crystalline world. It should feel like a mineral wilderness made of ridges, plates, crystal formations, fractured slabs, and geometric terrain.

Its tactical identity should be:

- Hard obstacles
- Line-of-sight management
- Projectile dodging
- Crystalline enemy formations
- Grounded, readable combat

### Enemy Pool

All initial standard enemies and elite enemies should belong to Euhedral.

Standard enemies:

- Laser Striker
- Quartz Orbiter
- Sapphire Guard
- Emerald Blinker
- Ruby Patroller
- Amber Gunner
- Void Bruiser
- Sunstone Orbiter
- Citrine Chaser
- Iolite Colossus
- Amethyst Shielder
- Diamond Phase-Shifter
- Nullstone Gravity Well
- Fracteryl Manifestation
- Eigenstein Entity

Elite enemies:

- Elite Quartz Orbiter
- Elite Ruby Patroller
- Elite Sunstone Orbiter
- Elite Citrine Chaser
- Elite Iolite Colossus
- Elite Amethyst Shielder
- Elite Diamond Phase-Shifter
- Elite Nullstone Gravity Well

### Terrain

Euhedral should use the current square and hexagonal terrain ideas.

Recommended terrain weighting:

| Terrain type | Recommended role |
|---|---|
| Square fractured plates | Common, main terrain identity |
| Hexagonal/basalt formations | Rare or uncommon, special mineral formation |

A starting weighting could be:

- 70 to 80 percent square terrain
- 20 to 30 percent hex/basalt terrain

Hex formations should feel special and should not appear so often that Euhedral loses its square/fractured identity.

### Encounter Pacing

Avoid spawning the full roster immediately. Euhedral should introduce the enemy language gradually.

Suggested pacing:

| Euhedral wave range | Encounter feel |
|---|---|
| x1 to x10 | Simple enemies, low density, early crystal roster |
| x11 to x20 | Add orbiters, chasers, gunners, blinkers |
| x21 to x30 | Add heavier enemies like Void Bruiser, Iolite, Amethyst |
| x31 to x40 | Add Diamond, Nullstone, Fracteryl, Eigenstein |
| x41 to x50 | Begin elite variants |
| x51+ | Full mixed pool with higher elite chance |

## Zone 2: Impetus

### Identity

Impetus is the space-themed zone. It should focus on momentum, gravitational fields, asteroids, magnetism, drifting dust, living motes, and orbital movement.

Its tactical identity should be:

- Movement distortion
- Orbiting formations
- Swarms
- Curved trajectories
- Asteroids and sparse cover
- Force-field readability

Impetus should not just be a dark space background. Its mechanics should express motion, pull, drift, and force.

### Enemy Pool

The Aliven enemies should be the primary enemy family of Impetus.

Aliven enemies:

- Aliven Spark Cluster
- Aliven Shard Bloom
- Aliven Pulse Swarm
- Aliven Ember Ring
- Aliven Void Splinters
- Aliven Healer Nodes
- Aliven Orbit Bloom
- Aliven Quartz Ghost
- Aliven Iolite Prism
- Aliven Fracteryl Storm

Additional enemies assigned to Impetus:

- Dust Wisp
- Magnetic Swarm
- Shadow Hand

Design notes:

- Dust Wisp fits as living cosmic dust or drifting particulate matter.
- Magnetic Swarm fits the magnetism, orbit, and force-field identity of the zone.
- Shadow Hand should likely be rare or ominous, tied to the dark/void side of the zone.

### Terrain and Background

Impetus should use:

- Faint star background
- Parallax stars
- Asteroids
- Subtle nebula haze
- Drifting particles/motes
- Gravity wells and orbital fields

Asteroids should initially be static during each wave for readability and collision stability. They can visually drift or rotate subtly without changing their collision every frame.

### Gravity Fields

Gravity should be visible and predictable. The player should never feel randomly robbed of control.

Useful field types:

| Field type | Effect |
|---|---|
| Attractor well | Pulls entities inward |
| Repulsor well | Pushes entities outward |
| Orbital field | Adds tangential force, creating swirl/orbit motion |
| Current field | Pushes gently in one direction |
| Dead zone | Dampens velocity |

First implementation should probably start with:

1. Attractor wells
2. Orbital swirl fields

Recommended first-pass gravity effect targets:

- Background particles: strong visual response
- Enemy movement: moderate response
- Enemy projectiles: moderate response
- Player movement: subtle, capped response

Gravity can later affect player shots, dropped motes, debris, and boss attacks.

### Encounter Pacing

Suggested pacing:

| Impetus wave range | Encounter feel |
|---|---|
| x1 to x10 | Basic Aliven swarms and sparse asteroid cover |
| x11 to x20 | Orbiting enemies and pulse enemies |
| x21 to x30 | First visible gravity wells |
| x31 to x40 | Splitting enemies and healer nodes |
| x41 to x50 | Stronger asteroid fields and mixed gravity |
| x51+ | Ghosts, prisms, fractal storms, rare Shadow Hand pressure |

## Zone 3: Caustics

### Identity

Caustics is the underwater/seafloor zone. It should feel like a submerged battlefield with fish enemies, floating jellyfish, ridged seafloor terrain, water caustics, and subtle ripple distortion.

Its tactical identity should be:

- Fluid enemy motion
- Curving paths
- Seafloor ridges and channels
- Beautiful but readable water-light effects
- Enemies that glide, dart, circle, and skim around terrain

### Enemy Pool

Fish enemies:

- Sand Fish
- Quartz Fish
- Ruby Fish
- Sunstone Fish
- Emerald Fish
- Sapphire Fish
- Amethyst Fish
- Diamond Fish

Additional enemy assigned to Caustics:

- Floating Jellyfish

The Floating Jellyfish is important because it gives the zone a non-fish silhouette and makes the zone feel more like an ecosystem.

### Terrain

Caustics should use topography mountain/ridge terrain, but interpreted as seafloor elevation rather than land mountains.

The terrain should lean toward:

- Seafloor ridges
- Coral-rock shelves
- Underwater dunes
- Submerged shelf formations
- Longer ridgelines
- Basin-and-ridge patterns
- Narrow underwater channels
- Soft contour flow

This may reuse the existing topography system with a zone-specific generation profile that favors elongated, flowing forms.

### Water Caustics

Water caustics should be a signature visual feature.

The caustics should be:

- Simple but beautiful
- Floor/background focused
- Slow moving
- Subtle enough to preserve bullet readability
- Strongest over flat floor regions
- Broken or interrupted by ridges where appropriate

Avoid caustics that are too bright, too fast, or too high contrast.

### Water Distortion

A subtle water/pool distortion could help sell the zone.

First-pass recommendation:

- Distort the floor and background subtly
- Make distortion most visible on terrain edges and floor patterns
- Do not strongly distort UI, text, player sprite, enemy bullets, or hit clarity

The goal is to feel underwater without making precision dodging frustrating.

### Fish Movement

Fish should not move like generic enemies. They should:

- Glide in arcs
- Turn smoothly
- Prefer flowing paths
- Use terrain contours where possible
- Dart or circle based on species
- Feel procedurally animated and top-down

## Zone 4: Verdure

### Identity

Verdure is the plant/living-growth zone. It should feel organic, reactive, dense, and alive. Its defining feature should be procedurally growing plants and vines that can be disturbed, moved, and destroyed.

Its tactical identity should be:

- Living environmental clutter
- Reactive vines
- Procedural growth
- Destructible plants
- Insects and crawling enemies
- Soft biological obstacles rather than hard mineral terrain

### Enemy Pool

Enemies assigned to Verdure:

- Ribbon Worm
- Lantern Moth
- Plant Turret
- Gear Insect
- Spider Crawler
- Cloth Ghost
- Eye Stalk

Design notes:

- Ribbon Worm fits slithering organic pressure.
- Lantern Moth fits light/bioluminescent plant themes.
- Plant Turret should feel rooted or plant-linked.
- Gear Insect can provide a hard chitin/biomechanical contrast.
- Spider Crawler can use terrain, vines, or web-like routes.
- Cloth Ghost gives the zone an eerie magical note and prevents it from feeling only like normal plants/insects.
- Eye Stalk fits Verdure as an organic watcher that tracks the player from living growth.

### Plant System

Verdure should have multiple plant categories.

#### Decorative growth

Mostly visual, cheap, and reactive:

- Grass wisps
- Moss patches
- Sprouts
- Small tendrils
- Flowers
- Fungal bulbs
- Pollen motes

These can sway when the player or enemies pass near them, but they do not need collision.

#### Soft vines

Signature feature of the zone.

Vines should:

- Grow from seed/root nodes
- Curve with noise
- Branch occasionally
- Sway when disturbed
- Be pushed or flicked by nearby movement/projectiles
- Be cut or destroyed by attacks
- Spawn leaf/spore particles when damaged
- Regrow mainly between waves at first

#### Hazard plants

Possible later additions:

- Thorn vines that hurt on contact
- Bulb pods that burst into spores
- Root mats that slow movement
- Snapping tendrils that lash outward
- Pollen clouds that obscure or slow projectiles

These should be introduced cautiously to preserve readability.

#### Enemy-linked plants

Possible interactions:

- Plant Turrets root into nearby vines
- Spider Crawlers move faster along vine/web paths
- Lantern Moths cause flowers or bulbs to glow
- Ribbon Worms disturb grass and leave flattened trails
- Gear Insects chew, cut, or reshape vines

### Procedural Vine Model

Avoid full biological simulation. Use a controllable, performant segment-chain model.

Each vine can grow from a seed/root node. Each segment can store:

```ts
position: Vec2;
angle: number;
length: number;
thickness: number;
health: number;
growthProgress: number; // 0 to 1
parentId?: string;
childIds: string[];
displacement: Vec2; // temporary bend/disturbance
```

Growth rules:

- Grow outward from seeds
- Curve using noise
- Branch occasionally
- Avoid excessive overlap
- Sometimes crawl toward terrain edges
- Stop on blocked terrain or max length
- Taper at the ends

Performance recommendation:

Use three layers:

1. Visual-only plants: many, cheap, reactive
2. Gameplay plants: fewer, with health and collision/effects
3. Enemy-attached plants: special plants created or used by enemies

## Zone 5: Horizon

### Identity

Horizon is a special fifth zone, not a normal biome. It should have a strong wow factor and special mechanics. It should feel like the game is revealing a deeper layer of reality.

The first four zones are material/ecological:

- Crystal/stone
- Space/force
- Water/light
- Plants/life

Horizon should feel metaphysical, mathematical, threshold-like, and rule-shifting.

Core design sentence:

> Horizon is the zone where the rules of the battlefield split, invert, and reconcile.

### Subzones

Horizon has three subzones:

1. **Zenith**
2. **Nadir**
3. **True**

Recommended UI formats:

```text
Horizon: Zenith - x4
Horizon: Nadir - x6
Horizon: True - x1
```

### Horizon: Zenith

Zenith should feel high, bright, clean, dangerous, radiant, and exposed.

Visual identity:

- Pale gold, white, cyan, ultraviolet light
- Long upward beams
- Clean horizon-line geometry
- Particles drifting upward
- Thin circular arcs like celestial instruments
- Enemies silhouetted against radiant geometry

Mechanical identity:

- Upward/outward forces
- Expanding rings
- Radiant beams
- Attacks that grow outward from a center
- Enemies that ascend, phase, or become briefly untouchable

### Horizon: Nadir

Nadir should feel deep, heavy, inverted, dark, and gravitational.

Visual identity:

- Dark violet, black, deep blue, dim red
- Downward streaks
- Heavy particulate darkness
- Inverted light beams
- Collapsing circles
- Event-horizon-like floor distortions

Mechanical identity:

- Inward pull
- Compression fields
- Collapsing rings
- Strong, ritualized gravity mechanics
- Enemies that drag projectiles into singularities
- Attacks that become more dangerous near the center

Nadir should not merely repeat Impetus. Impetus is space/motion. Nadir is descent, weight, collapse, and compression.

### Horizon: True

True should be the strongest wow moment. It should combine Zenith and Nadir as equilibrium, symmetry, and revelation rather than chaos.

Visual identity:

- A visible horizon line across the arena
- Upper/lower rule regions
- Light above and shadow below
- Mirrored or phase-shifted objects
- Attacks that transform when crossing the horizon
- Clean mathematical beauty, like a living equation

Mechanical identity:

- Crossing the horizon changes rules
- Projectiles transform when passing through the horizon line
- Enemies switch Zenith/Nadir behavior when crossing
- Attacks mirror across the horizon
- Gravity above and below behaves differently
- The battlefield may rotate, fold, or split during special waves

### Signature Horizon Mechanic

Horizon should have one unmistakable signature mechanic:

> A visible horizon boundary that transforms entities, attacks, and forces when they cross it.

Possible crossing effects:

| Object crossing the horizon | Effect |
|---|---|
| Enemy bullet | Becomes a different pattern |
| Player shot | Splits, refracts, or changes damage type |
| Enemy | Switches between Zenith and Nadir behavior |
| Dust/motes | Invert color, velocity, or orbit direction |
| Gravity field | Converts from attractor to repulsor |
| Terrain | Becomes solid/ghostly depending on side |

### Additional Horizon Mechanics

#### Dual-state enemies

Enemies can have Zenith and Nadir states.

- Zenith aspect: fast, radiant, expansive, beam/ring attacks
- Nadir aspect: slow, heavy, pulling, compressive attacks
- True aspect: alternates or combines both

#### Mirrored battlefield events

Examples:

- A projectile fired above the horizon creates a delayed shadow projectile below.
- A beam in Zenith creates a gravity seam in Nadir.
- Killing a Zenith node weakens a paired Nadir node.
- Enemies can be paired across the horizon and share health.

#### Rule-shift waves

Some Horizon waves could display a minimal rule label:

- Zenith Rule: Expansion
- Nadir Rule: Collapse
- True Rule: Reflection
- True Rule: Inversion
- True Rule: Equilibrium

The battlefield then follows that rule for the wave.

### Horizon Progression Options

Longer version:

| Segment | Waves | Feel |
|---|---:|---|
| Horizon: Zenith | x1 to x10 | Radiant, upward, expansion |
| Horizon: Nadir | x11 to x20 | Dark, inward, compression |
| Horizon: True | x21 to x30 | Split-field, inversion, synthesis |
| Horizon boss | x31 | Uses all three rule sets |

Shorter special-zone version:

| Segment | Length |
|---|---:|
| Zenith | 5 waves |
| Nadir | 5 waves |
| True | 3 waves plus boss |

The shorter version may help Horizon feel sacred and special rather than just another long biome.

## Suggested Overall Progression

One possible ordering:

1. **Euhedral**: Foundation, crystal terrain, full initial roster
2. **Verdure**: Living terrain and destructible vines
3. **Caustics**: Fluid movement, fish, jellyfish, water caustics
4. **Impetus**: Gravity, asteroids, Aliven swarms, force fields
5. **Horizon**: Special capstone zone with subzones and rule-shifting mechanics

Another possible ordering:

1. **Euhedral**
2. **Impetus**
3. **Caustics**
4. **Verdure**
5. **Horizon**

Recommendation: keep the implementation data-driven so the order can be adjusted later without rewriting spawn logic.

## Implementation Direction

The zone system should be data-driven rather than hardcoded into wave logic.

A possible structure:

```ts
type ZoneDefinition = {
  id: string;
  displayName: string;
  subzones?: SubzoneDefinition[];
  enemyPools: {
    standard: string[];
    elite?: string[];
    deprecated?: string[];
  };
  terrainWeights: TerrainWeight[];
  backgroundProfile: string;
  visualEffects: string[];
  mechanics: string[];
  waveBands: ZoneWaveBand[];
};
```

Example terrain weighting:

```ts
type TerrainWeight = {
  terrainId: string;
  weight: number;
  minZoneWave?: number;
  maxZoneWave?: number;
};
```

Example wave band:

```ts
type ZoneWaveBand = {
  minZoneWave: number;
  maxZoneWave?: number;
  enemyPoolAdditions?: string[];
  eliteChance?: number;
  terrainWeightOverrides?: TerrainWeight[];
  mechanicIntensity?: Record<string, number>;
};
```

## Readability and Performance Notes

General rules for all zones:

- Zone visuals should support gameplay readability, not overpower it.
- Bullets, player position, enemy silhouettes, and hit feedback must remain clear.
- Heavy visual effects should be optional or scalable through graphics settings.
- Expensive environment updates should happen between waves when possible.
- Dynamic collision should be introduced cautiously.
- Background effects should be visually rich but cheap.
- Prefer data tables and profiles over one-off hardcoded conditionals.

Specific cautions:

- Do not make Impetus gravity too strong on the player at first.
- Do not make Caustics distortion affect UI or bullet clarity.
- Do not make Verdure plants full physics objects unless absolutely necessary.
- Do not make Horizon chaotic. Its special mechanics should be spectacular but readable and rule-based.

## Summary

The zone system should transform Equatoria RPG from a single escalating enemy list into a set of worlds with distinct identities:

- **Euhedral**: Crystalline, geometric, tactical foundation
- **Impetus**: Space, momentum, gravity, swarms, asteroids
- **Caustics**: Underwater ridges, fish, jellyfish, caustic light
- **Verdure**: Living plants, vines, insects, destroyable growth
- **Horizon**: Special capstone with Zenith, Nadir, and True subzones, centered on a horizon boundary that changes the rules of combat

The most important implementation goal is to make zones data-driven so enemies, terrain, mechanics, visuals, and wave pacing can be adjusted independently as the RPG expands.
