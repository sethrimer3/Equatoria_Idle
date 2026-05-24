# Equatoria Idle — Manual Test Checklist

## Tap Responsiveness
- [ ] Tapping the canvas area generates motes (score increases)
- [ ] Tap produces visible particle burst at pointer location
- [ ] Tap flash overlay fades smoothly
- [ ] Rapid tapping does not cause lag or missed inputs
- [ ] Touch input works on mobile devices

## Equation Rendering
- [ ] Equation displays "E = 1" initially (one red tier)
- [ ] Equation values update when tier upgrades are purchased
- [ ] All unlocked tier segments display with correct colours
- [ ] Equation remains readable as more tiers unlock
- [ ] Multi-line wrap works when equation gets long

## Portrait and Landscape Layout
- [ ] Portrait: canvas on top, panels below, tabs at bottom
- [ ] Landscape: canvas on left, panels on right, tabs at bottom
- [ ] No layout breakage when rotating device
- [ ] Tab bar remains accessible in both orientations

## Tab Switching
- [ ] Tapping "Equation" tab shows upgrade panel
- [ ] Tapping "Upgrades" tab shows resource panel
- [ ] Tapping "Settings" tab shows settings panel
- [ ] Active tab is visually highlighted
- [ ] Tab state persists across panel scrolling

## Settings Persistence
- [ ] SFX and Music volume sliders move and save
- [ ] Reduced Particles toggle saves
- [ ] Screen Shake toggle saves
- [ ] Number Format dropdown changes and saves (Letters / Scientific / Engineering)
- [ ] Settings survive page reload

## Particle Performance
- [ ] Particles render smoothly at 60fps on desktop
- [ ] Particles render acceptably on mobile
- [ ] Particle trails display correctly
- [ ] Particles wrap around canvas edges (toroidal)
- [ ] Particles fade out over their lifetime
- [ ] Reduced Particles setting decreases particle count

## Particle Life Behaviour
- [ ] Different mote types visibly behave differently (some chase, some repel)
- [ ] 1×1 motes drift inertly without interacting
- [ ] 2×2+ motes interact normally with visible emergent motion
- [ ] Short-range collapse prevention works (motes don't collapse into singularities)
- [ ] Mote swarms, streams, and orbiting structures form naturally
- [ ] Size-force bias makes larger motes feel stronger (when enabled)
- [ ] Disabling size-force bias makes all sizes behave identically
- [ ] Debug toggles work when activated (interaction radius, grid, inert highlights)

## Upgrade Purchasing
- [ ] Cold Equation Forge sprites are visible when the forge is idle, spin very slowly, and fade into fiery sprites after tapping the forge
- [ ] Five rotating ring sprites remain centered on the Equation Forge and do not block taps, equation text, upgrades, or tab controls
- [ ] Upgrade buttons show correct cost and level
- [ ] Clicking an affordable upgrade purchases it (cost deducted, level incremented)
- [ ] Clicking an unaffordable upgrade does nothing (button appears disabled)
- [ ] Per-tier upgrade buttons appear only for unlocked tiers
- [ ] Auto-Tap upgrade enables automatic tapping
- [ ] Global Multiplier upgrade increases mote income
- [ ] Maxed upgrades show "MAX" label

## Tier Unlocking
- [ ] "Unlock <Next Tier>" button appears with correct cost
- [ ] Purchasing unlock reveals new tier colour in equation
- [ ] Corresponding tier upgrade buttons appear
- [ ] Secret tiers (prismatic, void) are not shown in normal unlock flow

## Late-Game Scaling
- [ ] Numbers display correctly in Letters mode (K/M/B/T suffixes)
- [ ] Numbers display correctly in Scientific mode (1.23e9)
- [ ] Numbers display correctly in Engineering mode (1.23×10⁹)
- [ ] Number format setting applies to all panels: Looms, Resources, Tiers, Achievements, Equation
- [ ] Canvas Equivalence and on-screen mote count respect the format setting
- [ ] Number formatting is consistent across UI
- [ ] No NaN or Infinity displayed

## Save/Load
- [ ] Game auto-saves periodically
- [ ] Manual save via Settings works
- [ ] Progress survives page reload
- [ ] Reset game clears all progress
- [ ] Reset game starts fresh state

## Desktop Mouse Support
- [ ] Mouse click on canvas triggers tap
- [ ] Mouse click on buttons triggers actions
- [ ] No hover-only interactions required

## Mobile Touch Support
- [ ] Touch on canvas triggers tap
- [ ] Touch on buttons triggers actions
- [ ] Buttons are large enough to tap comfortably (44px+ touch targets)
- [ ] No accidental zoom or scroll on double-tap

## RPG Combat
- [ ] Low graphics mode removes visible RPG weapon, projectile, enemy, player-movement, and boss glows/trails while preserving readable bodies and bars
- [ ] Sapphire Ships persist while equipped, one ship per weapon tier
- [ ] Sapphire Ships move toward the nearest enemy, orbit it, and fire small curving blue lasers
- [ ] Sapphire Ships shoot enemies in range while moving toward their orbit target
- [ ] Amethyst Ships persist while equipped, one ship per weapon tier
- [ ] Amethyst Ships choose the furthest enemies from the player, spread across targets first, and share targets evenly when ships outnumber enemies
- [ ] Amethyst lasers fire slowly, spiral inward, pierce non-target enemies, and end on the intended target
- [ ] The RPG stats panel no longer shows the old `WEAPON:` text
- [ ] The right-side RPG stats widget shows one DPS row per equipped weapon with three-letter color abbreviations and colored bars
- [ ] The DPS widget shows low/high axis labels that move with the sampled 10 second DPS range
- [ ] DPS bars update smoothly over a rolling 10 second damage window

## Achievements Tab UX
- [ ] Three filter checkboxes appear at the top: "Show earned", "Show unearned", "Show hidden"
- [ ] Default state: earned=checked, unearned=checked, hidden=unchecked
- [ ] Unchecking "Show earned" hides all claimed/unlocked achievement cards
- [ ] Unchecking "Show unearned" hides visible unearned achievements
- [ ] Checking "Show hidden" reveals isSecret and isHiddenCriteria achievements
- [ ] When both earned and unearned are unchecked, a "No achievements match..." message shows
- [ ] Filter changes do not reset the open category accordion state
- [ ] Clicking a filter checkbox does not accidentally toggle a category accordion
- [ ] All achievement groups show correct claimed/total counts (e.g. "3/12")
- [ ] Only one main category accordion can be open at a time
- [ ] Opening a different main category closes the previously open one
- [ ] Within RPG group, subcategory accordions are shown (Wave Progression, Bosses, XP & Stats, etc.)
- [ ] Only one subcategory can be open at a time within RPG
- [ ] Opening a different subcategory closes the previously open one
- [ ] Opening a different main category resets the open subcategory state
- [ ] RPG subcategories with 100+ achievements can be scrolled to the bottom
- [ ] No content is clipped or cut off when RPG category is open with many achievements
- [ ] Scroll works on desktop and mobile
- [ ] isSecret achievements (not earned) show scrambled glyph text for name, desc, bonus, progress
- [ ] isHiddenCriteria achievements (not earned) show scrambled glyph text only for the progress field
- [ ] Glyph text changes one character at a time (not all at once)
- [ ] Individual characters flicker independently at different rates
- [ ] Earned achievements always show real name/description regardless of hidden filter
- [ ] Claiming an achievement still works (tap earned-unclaimed card → reward shown)
- [ ] Existing save data loads correctly and previously claimed achievements still appear as claimed
- [ ] Build number shows 127 in Settings tab
