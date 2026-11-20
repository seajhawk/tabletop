# Galactic Defense — Game Blueprint

> User design brief, preserved as the product reference. Implementation status and prototype scope live in [STATUS.md](../STATUS.md); proposed architecture below is not a claim of completed work. Source supplied 2026-11-19.

## 1. Core Game Design: The *Galactic Defense* Blueprint

To capture the feel of Vectorform's tabletop classic while modernizing it for a 16" 2-in-1 (and eventually a 32"+ touch table), the design centers on **open-field mazing** and **simultaneous multi-touch co-op**.

### Playfield & Open-Field Mazing

* **Logical Grid:** A 28x16 cell grid (16:9 aspect ratio) floating over a deep-space starfield. Everything scales cleanly from a 16" display up to a 4K touch table.
* **Objectives:** Alien waves warp in from 1 to 3 entry portals and navigate toward Earth or an exit warp gate.
* **Obstacles & Mazing:** Floating asteroids occupy fixed cells, blocking both turret placement and alien flight paths. Every turret placed by a player also acts as a physical wall, forcing enemies to dynamically reroute around player-built mazes.
* **Anti-Walling Rule:** Players cannot completely seal off the path from any spawn gate (or any live enemy) to the exit. Attempting to drop a turret on a blocking cell highlights the ghost preview in red and rejects the drop.

### 4-Player Tabletop UX & Adaptive Layouts

Because elbow room on a 16" screen is tight, the HUD must be built as four independent, rotatable dock modules (`PlayerDock`) supporting three layout presets:

* **2P Opposing (Best for 16" 2-in-1):** Two docks centered on the top (180 deg) and bottom (0 deg) long edges.
* **4P Corner (16" 4-player mode):** Four compact docks tucked into the corners, rotated at 45, 135, 225, and 315 degrees so four people can play comfortably without hands colliding.
* **4P Edge (32"+ Touch Table):** Four full docks along the North, South, East, and West edges (0, 90, 180, 270 degrees).

**Co-op Economy:**

* **Personal Credits + Shared Assist Pool:** Every player starts with their own credit balance. When a turret destroys an enemy, the turret's owner gets 70% of the bounty and the remaining 30% splits evenly among all active players. This rewards building synergies (like one player running slow fields while another runs railguns).
* **Flick-to-Share Gesture:** A signature tabletop NUI touch: players can drag a credit chip out of their dock and flick it toward another player's dock to transfer funds mid-wave.
* **Radial Context Menus:** Tapping an existing turret opens a compact radial ring (Upgrade, Sell, Target Priority) oriented toward the edge of the player who tapped it.

### Starter Roster (Data-Driven)

| Turret | Role | Special Mechanic | Upgrade Path |
| --- | --- | --- | --- |
| **Pulse Laser** | Cheap maze-builder | Fast hitscan/bolt, low cost | Twin barrels -> Overcharged beam |
| **Plasma Mortar** | Area splash | Slow projectile with AoE blast radius | Larger radius -> Napalm burn DoT |
| **Stasis Projector** | Crowd control | Radial pulse that slows ships by 40% | Stronger slow -> Shield strip |
| **Railgun** | Armor piercer | High-velocity piercing line shot, slow reload | Faster charge -> Multi-target pierce |
| **Swarm Pod** | Anti-air / Chaser | Fires homing micro-missiles | More missiles -> Splash warheads |

**Enemy Archetypes:** *Scout* (fast, low HP), *Cruiser* (slow, heavy armor), *Swarmers* (high count, weak to splash), *Shielded Frigate* (regenerating energy shield, weak to Stasis/Laser), *Phase Fighter* (flies straight over turrets and asteroids on later waves, forcing anti-air coverage), and *Dreadnought* (boss wave with high HP and multi-stage destruction).

---

## 2. What to Borrow from the Open-Source Projects

Rather than copying code verbatim, extract the proven architectural patterns and math from the three reference repositories:

### From `beardgame/td` (Bearded.TD)

* **Flow-Field Pathfinding:** Borrow its multi-goal Dijkstra/breadth-first integration field approach so hundreds of enemies navigate dynamic mazes smoothly without per-unit A* overhead.
* **Damage & Status Pipeline:** Use a clean modifier stack for armor reduction, shield absorption, slow percentages, and damage-over-time ticks.
* **Co-op Wave Scaling:** Reference how enemy HP and bounty scale dynamically when 1, 2, 3, or 4 players are active.


### From `Anuken/Mindustry`

* **Predictive Aiming (Lead Calculation):** Port the quadratic intercept formula so projectile turrets (Plasma, Railgun) aim where a moving ship *will be* rather than where it currently is.
* **Fixed-Timestep Simulation:** Run combat, movement, and cooldowns at a locked 60 Hz tick rate, completely decoupled from rendering frame rate.
* **Object Pooling:** Pre-allocate projectiles, particles, and damage numbers to eliminate garbage collection stutters during heavy waves.


### From `Shik3i/KoalaTower`

* **Procedural Sci-Fi Visuals:** Use vector shapes, crisp stroke outlines, and additive glow shaders instead of waiting on custom sprite art. This lets both prototypes look sharp on day one.
* **Decoupled State Container:** Keep the game simulation in plain data structures so the renderer simply reads state each frame.

---

## 3. Shared Architecture (Used by Both Prototypes)

To make comparing the two stacks fair and fast, build a **shared JSON data pack** (`shared-data/`) that both prototypes load at startup:

* `turrets.json`: Cost, range, fire rate, projectile speed, damage, splash radius, upgrade tiers.
* `enemies.json`: HP, shield, speed, bounty, flags (`flying`, `armored`).
* `maps.json`: Grid dimensions, spawn coordinates, exit coordinates, asteroid cell lists.
* `waves.json`: Wave index, spawn groups, intervals, and boss triggers.

### Core Systems to Implement in Both

1. **Flow-Field Pathfinding Engine:**
   * Maintain a 2D array of `cost` and `direction` vectors.
   * Whenever a turret is placed or sold, run a reverse BFS from all exit cells (cost 0) outward through unblocked cells. Each cell stores the vector pointing to its lowest-cost neighbor.
   * Enemies simply sample the vector of their current cell (with bilinear smoothing so they curve naturally around corners instead of snapping to grid centers).
   * **Placement Validator:** Before committing a turret drop, mark the cell temporarily blocked and verify that every spawn cell and every active ground enemy still has a finite path cost to an exit.


2. **Multi-Touch Pointer Router (`PointerRouter`):**
   * Never use global mouse/drag variables. Maintain a dictionary keyed by finger ID (`Map<pointerId, ActiveTouch>`).
   * Each `ActiveTouch` tracks: `ownerPlayerId` (determined by which dock the touch started in), `state` (`DRAGGING_NEW_TURRET`, `RADIAL_MENU`, `FLICK_CREDITS`), `turretType`, and `currentGridCell`.
   * Result: Player 1 can drag a Laser from the bottom dock while Player 2 upgrades a Railgun on the top edge and Player 3 drops a Stasis field on the left, all in the exact same frame.

---

## 4. Prototype A: Web Stack (TypeScript + Vite + PixiJS v8)

**Best for:** Rapid iteration, instant scaling to any resolution or browser-based kiosk, and painless multi-touch via the Pointer Events API.

### Project Structure

```text
proto-web/
├── public/data/          # Symlink or copy of shared-data JSON files
├── src/
│   ├── main.ts           # PixiJS v8 app init, fullscreen & Wake Lock
│   ├── sim/
│   │   ├── Simulation.ts # Fixed 60Hz tick loop, state owner
│   │   ├── FlowField.ts  # BFS pathfinding + anti-blocking validator
│   │   ├── Combat.ts     # Lead targeting, projectiles, splash, slows
│   │   └── Economy.ts    # Per-player wallets, shared bounties
│   ├── input/
│   │   └── PointerRouter.ts # Map<pointerId, ActiveTouch> state machine
│   ├── render/
│   │   ├── PlayfieldView.ts # Grid, asteroids, glowing paths, entities
│   │   └── EffectsLayer.ts  # Additive lasers, explosions, floating text
│   └── ui/
│       └── PlayerDock.ts    # Pure PixiJS rotatable dock + radial menu

```

### Critical Web Multi-Touch Implementation Details

* **Disable Browser Gestures:** Apply `touch-action: none; user-select: none; overflow: hidden;` to `html`, `body`, and the `<canvas>` element. Call `event.preventDefault()` on `contextmenu` and `pointerdown`.
* **Unified Canvas UI:** Build `PlayerDock` and radial menus inside PixiJS rather than HTML/CSS overlays. Mixing DOM buttons with Canvas dragging causes messy pointer-capture conflicts when multiple fingers touch the screen at once.
* **Pointer Capture:** On `pointerdown`, bind `canvas.setPointerCapture(e.pointerId)` so fast drags off the edge of a dock never drop the touch state.
* **Screen Wake Lock:** Call `navigator.wakeLock.request('screen')` so the 2-in-1 does not dim while players plan between waves.

### Prototype A Sprint Plan (4 Milestones)

1. **Milestone 1 (Input & Grid):** Render the 28x16 grid with 4 rotated corner/edge docks. Implement `PointerRouter` and verify 4 simultaneous fingers can drag ghost turrets onto the grid independently with color-coded player indicators.
2. **Milestone 2 (Flow Field & Mazing):** Load `maps.json`, render asteroids, implement reverse BFS flow-field pathfinding, and draw subtle animated dotted flight paths. Enforce anti-walling validation during drag hover.
3. **Milestone 3 (Combat Loop):** Spawn waves from `waves.json`. Implement Pulse Laser, Plasma Mortar, and Stasis Projector with predictive aiming and pooled projectiles.
4. **Milestone 4 (Co-op Economy & Polish):** Wire up per-player credits, shared kill assists, radial upgrade/sell menus, and additive glow effects. Test fullscreen in Edge/Chrome on the 16" 2-in-1.

---

## 5. Prototype B: Native Stack (Godot 4 + GDScript or C#)

**Best for:** Native desktop performance, built-in HDR glow and GPU particles, zero browser chrome, and easy offline executables for Windows and Linux. *(Use GDScript for the fastest prototype; use C# if you plan to port larger systems directly from Bearded.TD.)*

### Scene Tree & Project Structure

```text
proto-godot/
├── data/                 # Symlink or copy of shared-data JSON files
├── autoload/
│   └── TouchManager.gd   # Central Map<finger_index, ActiveTouch>
├── scripts/sim/
│   ├── Simulation.gd     # _physics_process(delta) locked at 60Hz
│   ├── FlowField.gd      # PackedInt32Array / PackedVector2Array grid
│   └── CombatMath.gd     # Lead targeting + damage modifiers
└── scenes/
    ├── Main.tscn         # WorldEnvironment (Glow) + Playfield + 4 Docks
    ├── Playfield.tscn    # Grid renderer, asteroids, path preview line
    ├── PlayerDock.tscn   # Instanced 4x, rotated per layout preset
    ├── Turret.tscn       # Procedural Polygon2D + barrel + range ring
    └── Enemy.tscn        # Ship Polygon2D + HP/shield bars

```

### Critical Godot 4 Multi-Touch Gotcha

Godot's standard UI `Control` nodes (`Button`, `Panel`) assume a single mouse focus and can break when two players tap buttons simultaneously. To avoid this:

* In **Project Settings > Input Devices > Pointing**, disable **Emulate Mouse from Touch**.
* Build `PlayerDock` buttons and radial menu slices as `Node2D` / `Area2D` hitboxes (or simple rect bounds checks) managed directly by `TouchManager.gd` via `_unhandled_input(event)`.
* Track every finger strictly through `InputEventScreenTouch` and `InputEventScreenDrag` using `event.index`.
* Enable **Glow** in a `WorldEnvironment` node (`Canvas` mode) and set laser/engine colors to HDR values (e.g., `Color(0.2, 1.8, 2.5)`) for an instant arcade-tabletop bloom look.

### Prototype B Sprint Plan (4 Milestones)

1. **Milestone 1 (Multi-Touch Harness):** Configure touch settings, build `TouchManager.gd`, instance 4 `PlayerDock` scenes with layout toggle (`2P Opposing`, `4P Corner`, `4P Edge`), and verify 4 simultaneous drags.
2. **Milestone 2 (Flow Field & Mazing):** Implement `FlowField.gd` using `PackedInt32Array` for fast grid lookups, render asteroids and dynamic path lines, and enforce anti-blocking validation.
3. **Milestone 3 (Combat & HDR Visuals):** Implement the same 3 starter turrets and wave spawner from the shared JSON data. Add `GPUParticles2D` for plasma explosions and HDR glow beams.
4. **Milestone 4 (Co-op Economy & Export):** Add personal/shared credits, radial upgrade rings oriented to the player's edge, and export a standalone Windows `.exe` to test directly on the 16" 2-in-1.

---

## 6. Head-to-Head Evaluation Rubric

Once both prototypes hit Milestone 4, run both side-by-side on your 16" 2-in-1 (with Windows 3- and 4-finger touch gestures disabled in Settings) and score them on five concrete tests:

| Test Criteria | What to Measure |
| --- | --- |
| **4-Hand Stress Test** | Have 2 to 4 people drag turrets, tap upgrades, and cross paths simultaneously. Watch for dropped touches, stuck ghosts, or accidental focus stealing. |
| **Input Latency** | Drag a turret rapidly across the grid. Does the ghost stay locked under the fingertip, or does it visibly lag behind? |
| **Wave Load (150+ Ships)** | Spawn a stress-test wave of 150 Swarmers + 20 active turrets firing splash/beams. Check for 60 FPS stability and GC frame spikes. |
| **Scaling & DPI Sharpness** | Test at 100%, 150%, and 200% Windows display scaling (and connect an external 4K monitor if handy) to verify crisp text and hitboxes. |
| **Iteration Speed** | Which codebase felt faster to tweak balance, add a new turret type, and debug multi-touch edge cases? |


