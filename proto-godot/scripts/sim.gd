extends RefCounted
## Deterministic game state and rules. No input or rendering code lives here.
## Positions are in cell units; cell (x, y) has its centre at (x + 0.5, y + 0.5).

const GridNav = preload("res://scripts/grid_nav.gd")

const STEP: float = 1.0 / 60.0
const OWNER_SHARE: float = 0.7
const SELL_RATIO: float = 0.7
const STRESS_TURRETS: int = 20
const MAX_FX: int = 96


class Enemy:
	var id: int = 0
	var def_id: String = ""
	var hp: float = 0.0
	var max_hp: float = 0.0
	var speed: float = 1.0
	var bounty: float = 0.0
	var color: Color = Color.WHITE
	var pos: Vector2 = Vector2.ZERO
	var cell: Vector2i = Vector2i.ZERO
	var next: Vector2i = Vector2i.ZERO
	var slow_factor: float = 1.0
	var slow_time: float = 0.0
	var dead: bool = false


class Turret:
	var id: int = 0
	var def_id: String = ""
	var owner_id: int = 0
	var cell: Vector2i = Vector2i.ZERO
	var pos: Vector2 = Vector2.ZERO
	var cost: float = 0.0
	var range_cells: float = 1.0
	var fire_rate: float = 1.0
	var damage: float = 1.0
	var proj_speed: float = 0.0
	var splash: float = 0.0
	var slow_factor: float = 1.0
	var slow_duration: float = 0.0
	var color: Color = Color.WHITE
	var cooldown: float = 0.0
	var angle: float = 0.0


class Projectile:
	var pos: Vector2 = Vector2.ZERO
	var target: Enemy = null
	var target_pos: Vector2 = Vector2.ZERO
	var speed: float = 7.0
	var damage: float = 0.0
	var splash: float = 0.0
	var owner_id: int = 0
	var color: Color = Color.WHITE
	var dead: bool = false


class Beam:
	var from_pos: Vector2 = Vector2.ZERO
	var to_pos: Vector2 = Vector2.ZERO
	var color: Color = Color.WHITE
	var ttl: float = 0.0


class Ring:
	var pos: Vector2 = Vector2.ZERO
	var radius: float = 1.0
	var color: Color = Color.WHITE
	var ttl: float = 0.0
	var ttl_max: float = 0.3


class WaveRun:
	var enemy_id: String = ""
	var remaining: int = 0
	var interval: float = 0.0
	var timer: float = 0.0
	var spawn: Vector2i = Vector2i.ZERO


var turret_defs: Dictionary = {}
var enemy_defs: Dictionary = {}
var turret_order: Array[String] = []
var map: Dictionary = {}
var ordinary_waves: Array[Dictionary] = []
var stress_wave: Dictionary = {}

var width: int = 0
var height: int = 0
var spawns: Array[Vector2i] = []
var exits: Array[Vector2i] = []
var rock: PackedByteArray = PackedByteArray()
var blocked: PackedByteArray = PackedByteArray()
var turret_at: PackedInt32Array = PackedInt32Array()
var dist: PackedInt32Array = PackedInt32Array()

var player_count: int = 2
var wallets: PackedFloat64Array = PackedFloat64Array()
var lives: int = 0
var enemies: Array[Enemy] = []
var turrets: Array[Turret] = []
var projectiles: Array[Projectile] = []
var beams: Array[Beam] = []
var rings: Array[Ring] = []
var wave_runs: Array[WaveRun] = []
var wave_index: int = 0
var state: String = "planning"  # planning | running | won | lost
var paused: bool = false
var time_s: float = 0.0
var kills: int = 0
var leaks: int = 0
var total_awarded: float = 0.0
var next_id: int = 1


func setup(bundle: Dictionary, players: int) -> void:
	turret_defs = bundle["turrets"]
	enemy_defs = bundle["enemies"]
	map = bundle["map"]
	player_count = players
	turret_order = []
	var order: Array = bundle["turret_order"]
	for k in order:
		turret_order.append(String(k))
	ordinary_waves = []
	stress_wave = {}
	var wlist: Array = bundle["waves"]
	for w in wlist:
		var wd: Dictionary = w
		if bool(wd.get("stress", false)):
			stress_wave = wd
		else:
			ordinary_waves.append(wd)
	ordinary_waves.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return int(a["index"]) < int(b["index"]))
	reset()


func _cells(v: Variant) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	var arr: Array = v
	for item in arr:
		var p: Array = item
		out.append(Vector2i(int(p[0]), int(p[1])))
	return out


func reset() -> void:
	width = int(map["width"])
	height = int(map["height"])
	spawns = _cells(map["spawns"])
	exits = _cells(map["exits"])
	rock = PackedByteArray()
	rock.resize(width * height)
	rock.fill(0)
	for c: Vector2i in _cells(map["asteroids"]):
		rock[c.y * width + c.x] = 1
	turret_at = PackedInt32Array()
	turret_at.resize(width * height)
	turret_at.fill(-1)
	wallets = PackedFloat64Array()
	wallets.resize(player_count)
	wallets.fill(float(map["startingCredits"]))
	lives = int(map["startingLives"])
	enemies.clear()
	turrets.clear()
	projectiles.clear()
	beams.clear()
	rings.clear()
	wave_runs.clear()
	wave_index = 0
	state = "planning"
	paused = false
	time_s = 0.0
	kills = 0
	leaks = 0
	total_awarded = 0.0
	next_id = 1
	_rebuild_field()


func total_credits() -> float:
	var s: float = 0.0
	for i in range(wallets.size()):
		s += wallets[i]
	return s


# ---------------------------------------------------------------- field / placement

func _rebuild_field() -> void:
	blocked = rock.duplicate()
	for t in turrets:
		blocked[t.cell.y * width + t.cell.x] = 1
	dist = GridNav.compute_field(width, height, blocked, exits)


func is_reserved(c: Vector2i) -> bool:
	return spawns.has(c) or exits.has(c)


func turret_at_cell(c: Vector2i) -> Turret:
	if not GridNav.in_bounds(width, height, c):
		return null
	var id: int = turret_at[c.y * width + c.x]
	if id < 0:
		return null
	for t in turrets:
		if t.id == id:
			return t
	return null


## True when, with `extra` additionally blocked, every spawn and every live ground
## enemy (its current and next cell) can still reach an exit.
func path_ok_with(extra: Vector2i) -> bool:
	var tmp: PackedByteArray = blocked.duplicate()
	tmp[extra.y * width + extra.x] = 1
	var d: PackedInt32Array = GridNav.compute_field(width, height, tmp, exits)
	for s: Vector2i in spawns:
		if not GridNav.reachable(d, width, s):
			return false
	for e in enemies:
		if e.dead:
			continue
		if not GridNav.reachable(d, width, e.next) or not GridNav.reachable(d, width, e.cell):
			return false
	return true


## Empty string when legal, otherwise a reason code. Does not modify state.
func check_placement(player: int, turret_id: String, cell: Vector2i, charge: bool = true) -> String:
	if not turret_defs.has(turret_id):
		return "unknown_turret"
	if player < 0 or player >= player_count:
		return "bad_player"
	if state == "lost" or state == "won":
		return "match_over"
	if not GridNav.in_bounds(width, height, cell):
		return "outside"
	if is_reserved(cell):
		return "reserved"
	var i: int = cell.y * width + cell.x
	if rock[i] != 0:
		return "asteroid"
	if turret_at[i] >= 0:
		return "occupied"
	for e in enemies:
		if e.dead:
			continue
		if e.cell == cell or e.next == cell or Vector2i(e.pos.floor()) == cell:
			return "enemy"
	if charge:
		var def: Dictionary = turret_defs[turret_id]
		if wallets[player] + 1e-9 < float(def["cost"]):
			return "funds"
	if not path_ok_with(cell):
		return "blocked_path"
	return ""


## Atomic: either fully succeeds (funds spent, turret placed, field rebuilt) or changes nothing.
func place_turret(player: int, turret_id: String, cell: Vector2i, charge: bool = true) -> String:
	var err: String = check_placement(player, turret_id, cell, charge)
	if err != "":
		return err
	var def: Dictionary = turret_defs[turret_id]
	var t: Turret = Turret.new()
	t.id = next_id
	next_id += 1
	t.def_id = turret_id
	t.owner_id = player
	t.cell = cell
	t.pos = Vector2(cell) + Vector2(0.5, 0.5)
	t.cost = float(def["cost"])
	t.range_cells = float(def["range"])
	t.fire_rate = float(def["fireRate"])
	t.damage = float(def["damage"])
	t.proj_speed = float(def["projectileSpeed"])
	t.splash = float(def["splashRadius"])
	t.slow_factor = float(def["slowFactor"])
	t.slow_duration = float(def["slowDuration"])
	t.color = Color(String(def["color"]))
	if charge:
		wallets[player] -= t.cost
	turrets.append(t)
	turret_at[cell.y * width + cell.x] = t.id
	_rebuild_field()
	return ""


## Sell refunds 70% of cost to the turret's owner.
func sell_at(cell: Vector2i) -> String:
	var t: Turret = turret_at_cell(cell)
	if t == null:
		return "no_turret"
	wallets[t.owner_id] += t.cost * SELL_RATIO
	turret_at[cell.y * width + cell.x] = -1
	turrets.erase(t)
	_rebuild_field()
	return ""


func route_from(cell: Vector2i) -> PackedVector2Array:
	var pts: PackedVector2Array = PackedVector2Array()
	var c: Vector2i = cell
	pts.append(Vector2(c) + Vector2(0.5, 0.5))
	for _i in range(width * height):
		var n: Vector2i = GridNav.best_neighbor(width, height, dist, c)
		if n == c:
			break
		pts.append(Vector2(n) + Vector2(0.5, 0.5))
		c = n
	return pts


# ---------------------------------------------------------------- waves

func start_next_wave() -> String:
	if state == "lost" or state == "won":
		return "match_over"
	if not wave_runs.is_empty():
		return "wave_spawning"
	if wave_index >= ordinary_waves.size():
		return "no_more_waves"
	_begin_wave(ordinary_waves[wave_index])
	wave_index += 1
	return ""


func _begin_wave(w: Dictionary) -> void:
	var groups: Array = w["groups"]
	for g in groups:
		var gd: Dictionary = g
		var run: WaveRun = WaveRun.new()
		run.enemy_id = String(gd["enemyId"])
		run.remaining = int(gd["count"])
		run.interval = float(gd["interval"])
		run.timer = 0.0
		run.spawn = spawns[int(gd["spawnIndex"]) % spawns.size()]
		wave_runs.append(run)
	state = "running"


func add_enemy_at(def_id: String, cell: Vector2i) -> Enemy:
	var def: Dictionary = enemy_defs[def_id]
	var e: Enemy = Enemy.new()
	e.id = next_id
	next_id += 1
	e.def_id = def_id
	e.hp = float(def["hp"])
	e.max_hp = e.hp
	e.speed = float(def["speed"])
	e.bounty = float(def["bounty"])
	e.color = Color(String(def["color"]))
	e.cell = cell
	e.next = GridNav.best_neighbor(width, height, dist, cell)
	e.pos = Vector2(cell) + Vector2(0.5, 0.5)
	enemies.append(e)
	return e


## Deterministic stress: fresh match, the canonical map "stressTurrets" fixture placed free in order
## (owner = index % players, wallets untouched), then 150 swarmers at once.
func start_stress() -> void:
	reset()
	var fixture: Array = map.get("stressTurrets", [])
	for i in range(fixture.size()):
		var entry: Array = fixture[i]
		var cell: Vector2i = Vector2i(int(entry[0]), int(entry[1]))
		place_turret(i % player_count, String(entry[2]), cell, false)
	_begin_wave(stress_wave)
	_spawn_step(0.0)


# ---------------------------------------------------------------- step

func step(dt: float) -> void:
	if paused or state == "lost" or state == "won":
		return
	time_s += dt
	_spawn_step(dt)
	_move_enemies(dt)
	_turret_step(dt)
	_projectile_step(dt)
	_fx_step(dt)
	_cleanup()
	_check_state()


func _spawn_step(dt: float) -> void:
	var keep: Array[WaveRun] = []
	for run in wave_runs:
		run.timer -= dt
		while run.remaining > 0 and run.timer <= 0.0:
			add_enemy_at(run.enemy_id, run.spawn)
			run.remaining -= 1
			run.timer += run.interval
			if run.interval <= 0.0:
				run.timer = 0.0
		if run.remaining > 0:
			keep.append(run)
	wave_runs = keep


func _move_enemies(dt: float) -> void:
	for e in enemies:
		if e.dead:
			continue
		if e.slow_time > 0.0:
			e.slow_time -= dt
			if e.slow_time <= 0.0:
				e.slow_factor = 1.0
		var budget: float = e.speed * e.slow_factor * dt
		var guard: int = 8
		while budget > 0.0 and guard > 0:
			guard -= 1
			if e.next == e.cell:
				if dist[e.cell.y * width + e.cell.x] == 0:
					e.dead = true
					lives -= 1
					leaks += 1
					break
				var n: Vector2i = GridNav.best_neighbor(width, height, dist, e.cell)
				if n == e.cell:
					break
				e.next = n
			var target: Vector2 = Vector2(e.next) + Vector2(0.5, 0.5)
			var to: Vector2 = target - e.pos
			var d: float = to.length()
			if d <= budget:
				e.pos = target
				budget -= d
				e.cell = e.next
			else:
				e.pos += to / d * budget
				budget = 0.0


func _pick_target(t: Turret) -> Enemy:
	var best: Enemy = null
	var best_key: float = 1.0e30
	var r2: float = t.range_cells * t.range_cells
	for e in enemies:
		if e.dead or e.pos.distance_squared_to(t.pos) > r2:
			continue
		var nc: Vector2 = Vector2(e.next) + Vector2(0.5, 0.5)
		var key: float = float(dist[e.next.y * width + e.next.x]) + e.pos.distance_to(nc)
		if key < best_key:
			best_key = key
			best = e
	return best


func _turret_step(dt: float) -> void:
	for t in turrets:
		t.cooldown -= dt
		if t.cooldown > 0.0:
			continue
		if t.def_id == "stasis":
			var hit: bool = false
			var r2: float = t.range_cells * t.range_cells
			for e in enemies:
				if e.dead or e.pos.distance_squared_to(t.pos) > r2:
					continue
				hit = true
				e.slow_factor = t.slow_factor
				e.slow_time = t.slow_duration
				_damage(e, t.damage, t.owner_id)
			if hit:
				t.cooldown = 1.0 / t.fire_rate
				_add_ring(t.pos, t.range_cells, t.color, 0.45)
			else:
				t.cooldown = 0.0
			continue
		var target: Enemy = _pick_target(t)
		if target == null:
			t.cooldown = 0.0
			continue
		t.cooldown = 1.0 / t.fire_rate
		t.angle = (target.pos - t.pos).angle()
		if t.proj_speed <= 0.0:
			_add_beam(t.pos, target.pos, t.color)
			_damage(target, t.damage, t.owner_id)
		else:
			var p: Projectile = Projectile.new()
			p.pos = t.pos
			p.target = target
			p.target_pos = target.pos
			p.speed = t.proj_speed
			p.damage = t.damage
			p.splash = t.splash
			p.owner_id = t.owner_id
			p.color = t.color
			projectiles.append(p)


func _projectile_step(dt: float) -> void:
	for p in projectiles:
		if p.target != null and not p.target.dead:
			p.target_pos = p.target.pos
		var to: Vector2 = p.target_pos - p.pos
		var d: float = to.length()
		var move: float = p.speed * dt
		if d <= move:
			p.dead = true
			_add_ring(p.target_pos, p.splash, p.color, 0.3)
			var r2: float = p.splash * p.splash
			for e in enemies:
				if not e.dead and e.pos.distance_squared_to(p.target_pos) <= r2:
					_damage(e, p.damage, p.owner_id)
		else:
			p.pos += to / d * move
	var alive: Array[Projectile] = []
	for p in projectiles:
		if not p.dead:
			alive.append(p)
	projectiles = alive


func _fx_step(dt: float) -> void:
	var b2: Array[Beam] = []
	for b in beams:
		b.ttl -= dt
		if b.ttl > 0.0:
			b2.append(b)
	beams = b2
	var r2: Array[Ring] = []
	for r in rings:
		r.ttl -= dt
		if r.ttl > 0.0:
			r2.append(r)
	rings = r2


func _add_beam(from_pos: Vector2, to_pos: Vector2, color: Color) -> void:
	if beams.size() >= MAX_FX:
		return
	var b: Beam = Beam.new()
	b.from_pos = from_pos
	b.to_pos = to_pos
	b.color = color
	b.ttl = 0.08
	beams.append(b)


func _add_ring(pos: Vector2, radius: float, color: Color, ttl: float) -> void:
	if rings.size() >= MAX_FX:
		return
	var r: Ring = Ring.new()
	r.pos = pos
	r.radius = radius
	r.color = color
	r.ttl = ttl
	r.ttl_max = ttl
	rings.append(r)


func _damage(e: Enemy, amount: float, owner_id: int) -> void:
	if e.dead:
		return
	e.hp -= amount
	if e.hp <= 0.0:
		e.dead = true
		kills += 1
		award_bounty(e.bounty, owner_id)


## Owner gets 70%; every active player (owner included) splits the other 30%.
## Balances stay fractional; nothing is rounded.
func award_bounty(amount: float, owner_id: int) -> void:
	var share: float = amount * (1.0 - OWNER_SHARE) / float(player_count)
	wallets[owner_id] += amount * OWNER_SHARE
	for p in range(player_count):
		wallets[p] += share
	total_awarded += amount


func _cleanup() -> void:
	var alive: Array[Enemy] = []
	for e in enemies:
		if not e.dead:
			alive.append(e)
	enemies = alive


func _check_state() -> void:
	if lives <= 0:
		lives = 0
		state = "lost"
		return
	if state == "running" and wave_runs.is_empty() and enemies.is_empty():
		# Stress runs never advance wave_index, so they end in "planning".
		state = "won" if (wave_index > 0 and wave_index >= ordinary_waves.size()) else "planning"
