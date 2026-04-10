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
- [ ] Particles bounce off canvas edges
- [ ] Particles fade out over their lifetime
- [ ] Reduced Particles setting decreases particle count

## Upgrade Purchasing
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
