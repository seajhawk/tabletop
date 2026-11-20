extends SceneTree
## Headless checks:
##   godot --headless --path proto-godot --script tests/test_runner.gd
## Exit code 0 = all passed, 1 = at least one failure.

const DataLoader = preload("res://scripts/data_loader.gd")
const SimScript = preload("res://scripts/sim.gd")
const GridNav = preload("res://scripts/grid_nav.gd")
const Layout = preload("res://scripts/layout.gd")
const RouterScript = preload("res://scripts/touch_router.gd")

var passed: int = 0
var failed: int = 0
var bundle: Dictionary = {}


func _init() -> void:
	bundle = DataLoader.load_bundle()
	_ok(bool(bundle.get("ok", false)), "shared data loads (%s)" % String(bundle.get("error", "")))
	if not bool(bundle.get("ok", false)):
		_finish()
		return
	test_data()
	test_data_parity()
	test_bfs_field()
	test_bfs_traps_spawn()
	test_bfs_traps_live_enemy()
	test_valid_placement()
	test_atomic_rejection()
	test_sell_refund()
	test_bounty_conservation()
	test_kill_bounty_flow()
	test_stress()
	test_determinism()
	test_layout_hit_tests()
	test_corner_docks()
	test_four_rotated_drags()
	test_touch_lift_rotated_docks()
	test_router_independent_pointers()
	_finish()


func _ok(cond: bool, msg: String) -> void:
	if cond:
		passed += 1
		print("PASS  ", msg)
	else:
		failed += 1
		print("FAIL  ", msg)


func _finish() -> void:
	print("--- %d passed, %d failed" % [passed, failed])
	quit(1 if failed > 0 else 0)


func _custom_sim(map: Dictionary, players: int = 2) -> SimScript:
	var b: Dictionary = bundle.duplicate()
	b["map"] = map
	var s: SimScript = SimScript.new()
	s.setup(b, players)
	return s


func _small_map(w: int, h: int, spawns: Array, exits: Array, rocks: Array) -> Dictionary:
	return {
		"width": w, "height": h, "spawns": spawns, "exits": exits, "asteroids": rocks,
		"startingCredits": 250, "startingLives": 10,
	}


func _full_sim(players: int = 2) -> SimScript:
	var s: SimScript = SimScript.new()
	s.setup(bundle, players)
	return s


# ---------------------------------------------------------------- tests

func test_data() -> void:
	var s: SimScript = _full_sim()
	_ok(s.width == 28 and s.height == 16, "map is 28x16")
	_ok(s.turret_defs.size() == 3 and s.enemy_defs.size() == 3, "3 turrets and 3 enemies")
	_ok(s.ordinary_waves.size() == 3 and not s.stress_wave.is_empty(), "3 ordinary waves + separate stress wave")
	_ok(",".join(s.turret_order) == "pulse,plasma,stasis", "turret order pulse/plasma/stasis")


func test_data_parity() -> void:
	var src: String = ProjectSettings.globalize_path("res://").path_join("../shared-data/")
	var checked: int = 0
	var same: bool = true
	for n: String in DataLoader.FILES:
		var a: String = src + n + ".json"
		var b: String = "res://data/" + n + ".json"
		if not FileAccess.file_exists(a) or not FileAccess.file_exists(b):
			continue
		checked += 1
		var ta: String = FileAccess.get_file_as_string(a).replace("\r\n", "\n")
		var tb: String = FileAccess.get_file_as_string(b).replace("\r\n", "\n")
		if ta != tb:
			same = false
			print("      differs: ", n)
	_ok(checked == 0 or same, "res://data matches ../shared-data (%d files compared)" % checked)


func test_bfs_field() -> void:
	var s: SimScript = _full_sim()
	for e: Vector2i in s.exits:
		_ok(s.dist[e.y * s.width + e.x] == 0, "exit %s has distance 0" % str(e))
	for sp: Vector2i in s.spawns:
		_ok(GridNav.reachable(s.dist, s.width, sp), "spawn %s reaches exit" % str(sp))
	# Asteroids are listed as [x, y]; index is y * width + x.
	var rocks: Array = s.map["asteroids"]
	var all_blocked: bool = rocks.size() > 0
	for a in rocks:
		var ac: Array = a
		if s.dist[int(ac[1]) * s.width + int(ac[0])] != GridNav.INF_DIST:
			all_blocked = false
	_ok(all_blocked, "all %d asteroid cells are unreachable/blocked" % rocks.size())
	_ok(s.dist[2 * s.width + 6] == GridNav.INF_DIST, "asteroid (6,2) is blocked")


func test_bfs_traps_spawn() -> void:
	# Column x=2 is a wall except the gate (2,1).
	var m: Dictionary = _small_map(5, 3, [[0, 1]], [[4, 1]], [[2, 0], [2, 2]])
	var s: SimScript = _custom_sim(m)
	_ok(s.check_placement(0, "pulse", Vector2i(3, 0)) == "", "off-path cell is allowed")
	_ok(s.check_placement(0, "pulse", Vector2i(2, 1)) == "blocked_path", "gate cell rejected: would trap spawn")
	_ok(s.check_placement(0, "pulse", Vector2i(3, 1)) == "blocked_path", "downstream gate cell rejected")
	var before: PackedInt32Array = s.dist.duplicate()
	var r: String = s.place_turret(0, "pulse", Vector2i(2, 1))
	_ok(r == "blocked_path" and s.turrets.is_empty() and s.dist == before, "rejected wall placement leaves state unchanged")


func test_bfs_traps_live_enemy() -> void:
	# Row y=1 is rock except x=5; bottom corridor y=2 leads to exit (5,2). Spawn (0,0) uses the top row.
	var m: Dictionary = _small_map(6, 3, [[0, 0]], [[5, 2]], [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1]])
	var plain: SimScript = _custom_sim(m)
	_ok(plain.check_placement(0, "pulse", Vector2i(3, 2)) == "", "without a ship, corridor cell is legal (spawn still reaches exit)")
	var s: SimScript = _custom_sim(m)
	var e: SimScript.Enemy = s.add_enemy_at("scout", Vector2i(1, 2))
	_ok(e.next == Vector2i(2, 2), "enemy heads for the next safe cell")
	_ok(s.check_placement(0, "pulse", Vector2i(3, 2)) == "blocked_path", "placement that strands a live ground enemy is rejected")
	_ok(s.check_placement(0, "pulse", Vector2i(1, 2)) == "enemy", "enemy-occupied cell rejected")
	_ok(s.check_placement(0, "pulse", Vector2i(2, 2)) == "enemy", "enemy's next cell rejected")
	_ok(s.turrets.is_empty() and s.wallets[0] == 250.0, "no state change from the rejections")


func test_valid_placement() -> void:
	var s: SimScript = _full_sim()
	var r: String = s.place_turret(0, "pulse", Vector2i(4, 6))
	_ok(r == "", "valid placement accepted")
	_ok(s.turrets.size() == 1 and s.wallets[0] == 215.0, "turret added and 35 credits spent")
	_ok(s.place_turret(1, "pulse", Vector2i(4, 6)) == "occupied", "occupied cell rejected")
	_ok(s.place_turret(1, "pulse", Vector2i(6, 3)) == "asteroid", "asteroid rejected")
	_ok(s.place_turret(1, "pulse", Vector2i(0, 4)) == "reserved", "spawn cell reserved")
	_ok(s.place_turret(1, "pulse", Vector2i(27, 7)) == "reserved", "exit cell reserved")
	_ok(s.place_turret(1, "pulse", Vector2i(28, 7)) == "outside", "outside rejected")


func test_atomic_rejection() -> void:
	var s: SimScript = _full_sim()
	s.wallets[0] = 60.0
	var d0: PackedInt32Array = s.dist.duplicate()
	_ok(s.place_turret(0, "plasma", Vector2i(8, 5)) == "funds", "unaffordable placement rejected")
	_ok(s.wallets[0] == 60.0 and s.turrets.is_empty() and s.dist == d0 and s.turret_at[5 * 28 + 8] == -1, "rejection is atomic (no spend, no turret, field intact)")
	# Two drops released in the same frame competing for one balance: only one may succeed.
	_ok(s.place_turret(0, "pulse", Vector2i(8, 5)) == "", "first concurrent drop succeeds")
	_ok(s.place_turret(0, "pulse", Vector2i(9, 5)) == "funds", "second concurrent drop revalidated and rejected")
	_ok(absf(s.wallets[0] - 25.0) < 1e-9 and s.turrets.size() == 1, "never overspends")


func test_sell_refund() -> void:
	var s: SimScript = _full_sim()
	var d0: PackedInt32Array = s.dist.duplicate()
	s.place_turret(1, "plasma", Vector2i(9, 5))
	_ok(absf(s.wallets[1] - 180.0) < 1e-9, "plasma costs 70")
	_ok(s.sell_at(Vector2i(9, 5)) == "", "sell succeeds")
	_ok(absf(s.wallets[1] - 229.0) < 1e-9, "owner refunded 70% (49)")
	_ok(s.turrets.is_empty() and s.dist == d0, "field rebuilt after sale")
	_ok(s.sell_at(Vector2i(9, 5)) == "no_turret", "selling empty cell is a no-op")


func test_bounty_conservation() -> void:
	for players in [2, 3, 4]:
		var s: SimScript = _full_sim(players)
		var before: float = s.total_credits()
		var w0: float = s.wallets[1]
		s.award_bounty(25.0, 1)
		var delta: float = s.total_credits() - before
		_ok(absf(delta - 25.0) < 1e-9, "bounty conserved with %d players (delta %.12f)" % [players, delta])
		var expect_owner: float = 25.0 * 0.7 + 25.0 * 0.3 / float(players)
		_ok(absf(s.wallets[1] - w0 - expect_owner) < 1e-9, "owner gets 70%% plus equal 30%% share (%d players)" % players)
		var other: int = 0
		_ok(absf(s.wallets[other] - 250.0 - 25.0 * 0.3 / float(players)) < 1e-9, "non-owner gets only the shared slice (%d players)" % players)
	# Fractions are kept, not rounded per payout.
	var f: SimScript = _full_sim(3)
	f.award_bounty(4.0, 0)
	_ok(absf(f.wallets[1] - 250.0 - 0.4) < 1e-9, "fractional balance retained (0.4, not rounded)")


func test_kill_bounty_flow() -> void:
	var s: SimScript = _full_sim(2)
	_ok(s.place_turret(1, "pulse", Vector2i(4, 7)) == "", "owner turret placed")
	var credits_after_buy: float = s.total_credits()
	s.add_enemy_at("swarmer", Vector2i(3, 5))
	for _i in range(180):
		s.step(SimScript.STEP)
	_ok(s.kills == 1, "pulse turret killed the swarmer")
	_ok(absf(s.total_credits() - credits_after_buy - 4.0) < 1e-9, "kill paid exactly the 4 credit bounty in total")
	_ok(absf(s.wallets[1] - 215.0 - 3.4) < 1e-9 and absf(s.wallets[0] - 250.0 - 0.6) < 1e-9, "owner got 70% + half of 30% (3.4); other got 0.6")


func test_stress() -> void:
	var s: SimScript = _full_sim(4)
	s.start_stress()
	_ok(s.turrets.size() == 20, "stress places 20 legal turrets (got %d)" % s.turrets.size())
	_ok(s.enemies.size() == 150, "stress spawns 150 enemies (got %d)" % s.enemies.size())
	var legal: bool = true
	for t in s.turrets:
		if s.rock[t.cell.y * s.width + t.cell.x] != 0 or s.is_reserved(t.cell):
			legal = false
	_ok(legal, "stress turrets avoid asteroids and reserved cells")
	# Exactly the canonical fixture: positions, roles, owners = index % players, wallets intact.
	var fixture: Array = s.map["stressTurrets"]
	_ok(fixture.size() == 20, "map has a 20-entry stressTurrets fixture")
	var same_fixture: bool = s.turrets.size() == fixture.size()
	if same_fixture:
		for i in range(fixture.size()):
			var f: Array = fixture[i]
			var t: SimScript.Turret = s.turrets[i]
			if t.cell != Vector2i(int(f[0]), int(f[1])) or t.def_id != String(f[2]) or t.owner_id != i % 4:
				same_fixture = false
				print("      fixture mismatch at ", i)
	_ok(same_fixture, "stress turrets match maps.json stressTurrets (cells, roles, owners i%4)")
	var wallets_ok: bool = true
	for w in range(4):
		if absf(s.wallets[w] - 250.0) > 1e-9:
			wallets_ok = false
	_ok(wallets_ok, "stress placements are free: every wallet still 250")
	for sp: Vector2i in s.spawns:
		_ok(GridNav.reachable(s.dist, s.width, sp), "stress leaves spawn %s connected" % str(sp))
	for _i in range(300):
		s.step(SimScript.STEP)
	_ok(s.enemies.size() <= 150 and s.lives >= 0, "stress runs 300 ticks (live %d, kills %d, leaks %d)" % [s.enemies.size(), s.kills, s.leaks])


func test_determinism() -> void:
	var a: SimScript = _full_sim(4)
	var b: SimScript = _full_sim(4)
	a.start_stress()
	b.start_stress()
	for _i in range(240):
		a.step(SimScript.STEP)
		b.step(SimScript.STEP)
	_ok(a.enemies.size() == b.enemies.size() and a.kills == b.kills and a.leaks == b.leaks, "two stress runs agree on counts")
	_ok(absf(a.total_credits() - b.total_credits()) < 1e-9, "two stress runs agree on credits")


func test_layout_hit_tests() -> void:
	for layout in range(3):
		var docks: Array = Layout.build_docks(layout)
		_ok(docks.size() == Layout.player_count(layout), "layout %d has %d docks" % [layout, docks.size()])
		var all_ok: bool = true
		for d in docks:
			var dock: Layout.Dock = d
			for slot in range(3):
				var centre_local: Vector2 = dock.slot_rect(slot).get_center()
				var screen: Vector2 = dock.to_screen(centre_local)
				var hit: Vector2i = Layout.hit_slot(docks, screen)
				if hit != Vector2i(dock.player, slot):
					all_ok = false
					print("      miss layout %d player %d slot %d -> %s" % [layout, dock.player, slot, str(hit)])
		_ok(all_ok, "layout %d: inverse-rotated dock hit tests land on the right slot" % layout)
		_ok(Layout.hit_slot(docks, Layout.cell_center(Vector2i(14, 8))) == Vector2i(-1, -1), "layout %d: board centre is not a dock" % layout)
		var top: float = Layout.hud_top(layout)
		var earth_rect: Rect2 = Rect2(Vector2(1078, 370), Vector2(60, 88))
		_ok(not Layout.polys_overlap(Layout.rect_poly(Layout.stats_rect(top)), Layout.rect_poly(earth_rect)), "layout %d: stats/hint rect clears Earth" % layout)
		var others: Array = [Layout.controls_rect(top), Layout.stats_rect(top)]
		for i in range(docks.size()):
			var dock: Layout.Dock = docks[i]
			var poly: PackedVector2Array = dock.corners()
			var inside: bool = true
			for p in poly:
				if p.x < 0 or p.y < 0 or p.x > Layout.SCREEN.x or p.y > Layout.SCREEN.y:
					inside = false
			_ok(inside, "layout %d player %d dock is fully on screen" % [layout, dock.player])
			_ok(not Layout.polys_overlap(poly, Layout.rect_poly(Layout.board_rect())), "layout %d player %d oriented dock is outside the grid" % [layout, dock.player])
			var clear: bool = true
			for o in others:
				if Layout.polys_overlap(poly, Layout.rect_poly(o)):
					clear = false
			for j in range(i + 1, docks.size()):
				var other: Layout.Dock = docks[j]
				if Layout.polys_overlap(poly, other.corners()):
					clear = false
			_ok(clear, "layout %d player %d dock clears controls, stats and other docks" % [layout, dock.player])


func test_corner_docks() -> void:
	var docks: Array = Layout.build_docks(1)
	var want_deg: Array = [45.0, 225.0, 315.0, 135.0]
	var want_pos: Array = [Vector2(122, 678), Vector2(1158, 122), Vector2(1158, 678), Vector2(122, 122)]
	var exact: bool = docks.size() == 4
	for i in range(docks.size()):
		var d: Layout.Dock = docks[i]
		var deg: float = fposmod(rad_to_deg(d.rot), 360.0)
		if absf(deg - float(want_deg[i])) > 1e-6 or d.center != want_pos[i] or absf(d.dock_scale - Layout.CORNER_SCALE) > 1e-9:
			exact = false
		# "up" must face the board centre.
		var to_board: Vector2 = Layout.board_rect().get_center() - d.center
		_ok(d.up().dot(to_board) > 0.0, "corner dock %d faces the board" % i)
		# Scale-correct: world distance across the dock is size * scale (Vector2 is 32-bit float).
		var a: Vector2 = d.to_screen(Vector2(-d.size.x * 0.5, 0))
		var b: Vector2 = d.to_screen(Vector2(d.size.x * 0.5, 0))
		_ok(absf(a.distance_to(b) - d.size.x * Layout.CORNER_SCALE) < 1e-3, "corner dock %d to_screen applies scale" % i)
		var back: Vector2 = d.to_local(d.to_screen(Vector2(37, -21)))
		_ok(back.distance_to(Vector2(37, -21)) < 1e-3, "corner dock %d inverse transform round-trips" % i)
		# Slots stay usable: >= 55 px each way on screen.
		var sr: Rect2 = d.slot_rect(1)
		_ok(sr.size.x * d.dock_scale >= 55.0 and sr.size.y * d.dock_scale >= 55.0, "corner dock %d slots are %.0fx%.0f px on screen" % [i, sr.size.x * d.dock_scale, sr.size.y * d.dock_scale])
		# Scaled edge vs gap: just inside slot 0 hits, the PAD gap between slots 0 and 1 misses.
		var s0: Rect2 = d.slot_rect(0)
		var inside_pt: Vector2 = d.to_screen(Vector2(s0.end.x - 2.0, s0.get_center().y))
		var gap_pt: Vector2 = d.to_screen(Vector2(s0.end.x + Layout.Dock.PAD * 0.5, s0.get_center().y))
		_ok(Layout.hit_slot(docks, inside_pt) == Vector2i(d.player, 0), "corner dock %d: scaled slot edge hits" % i)
		_ok(Layout.hit_slot(docks, gap_pt) == Vector2i(-1, -1), "corner dock %d: gap between slots misses" % i)
	_ok(exact, "corner docks use exact 45/225/315/135 rotations, specified centres and 0.56 scale")
	_ok(Layout.hud_top(1) == 258.0 and Layout.hud_top(0) == 130.0 and Layout.hud_top(2) == 130.0, "only the corner layout lowers the controls (y258)")
	_ok(Layout.hit_button(Layout.button_rect(0, 258.0).get_center(), 258.0) == "start", "lowered start button hit-tests at y258")
	_ok(Layout.hit_button(Layout.button_rect(0, 130.0).get_center(), 258.0) == "", "old button position is empty in the corner layout")
	_ok(Layout.button_rect(5, 258.0).end.y == 528.0, "corner controls end at y528")


func test_four_rotated_drags() -> void:
	var s: SimScript = _full_sim(4)
	var docks: Array = Layout.build_docks(1)
	var r: RouterScript = RouterScript.new()
	r.setup(s, docks, Layout.hud_top(1))
	var targets: Array = [Vector2i(8, 4), Vector2i(20, 4), Vector2i(20, 11), Vector2i(8, 11)]
	for i in range(4):
		var d: Layout.Dock = docks[i]
		r.begin(i, d.to_screen(d.slot_rect(i % 3).get_center()))
	_ok(r.count() == 4, "four simultaneous corner-dock touches tracked")
	var owners_ok: bool = true
	for i in range(4):
		var p: RouterScript.Pointer = r.pointers[i]
		var d: Layout.Dock = docks[i]
		if p.player != d.player or p.turret_id != s.turret_order[i % 3]:
			owners_ok = false
	_ok(owners_ok, "each diagonal dock captures its own player and turret type")
	for i in range(4):
		var dk: Layout.Dock = docks[i]
		r.move(i, Layout.cell_center(targets[i]) - dk.up() * RouterScript.TOUCH_LIFT)
	r.cancel(2)
	for i in [3, 1, 0]:
		var dk: Layout.Dock = docks[i]
		r.end(i, Layout.cell_center(targets[i]) - dk.up() * RouterScript.TOUCH_LIFT)
	_ok(s.turrets.size() == 3, "three released drags placed, the cancelled one did not")
	var placed_ok: bool = true
	for i in [0, 1, 3]:
		var t: SimScript.Turret = s.turret_at_cell(targets[i])
		var dk: Layout.Dock = docks[i]
		if t == null or t.owner_id != dk.player or t.def_id != s.turret_order[i % 3]:
			placed_ok = false
	_ok(placed_ok, "turrets belong to the owning dock's player")
	_ok(absf(s.wallets[2] - 250.0) < 1e-9, "cancelled drag charged nothing")


func test_touch_lift_rotated_docks() -> void:
	var s: SimScript = _full_sim(4)
	var docks: Array = Layout.build_docks(1)
	var r: RouterScript = RouterScript.new()
	r.setup(s, docks, Layout.hud_top(1))
	for i in range(4):
		var d: Layout.Dock = docks[i]
		var start_pt: Vector2 = d.to_screen(d.slot_rect(0).get_center())
		r.begin(i, start_pt)
		var finger_pt: Vector2 = Layout.cell_center(Vector2i(14, 8))
		r.move(i, finger_pt)
		var p: RouterScript.Pointer = r.pointers[i]
		var expected_aim: Vector2 = finger_pt + d.up() * RouterScript.TOUCH_LIFT
		_ok(p.aim_pos.distance_to(expected_aim) < 1e-3, "touch drag %d lifts aim along rotated dock up()" % i)
		_ok(p.cell == Layout.pos_to_cell(expected_aim), "touch drag %d targets cell at lifted aim_pos" % i)
		r.cancel(i)
	# Mouse drag must remain unlifted.
	var d0: Layout.Dock = docks[0]
	r.begin(RouterScript.MOUSE_ID, d0.to_screen(d0.slot_rect(0).get_center()))
	var mouse_pt: Vector2 = Layout.cell_center(Vector2i(14, 8))
	r.move(RouterScript.MOUSE_ID, mouse_pt)
	var mp: RouterScript.Pointer = r.pointers[RouterScript.MOUSE_ID]
	_ok(mp.aim_pos.distance_to(mouse_pt) < 1e-3 and mp.cell == Vector2i(14, 8), "mouse drag remains unlifted")
	r.end(RouterScript.MOUSE_ID, mouse_pt)
	_ok(s.turret_at_cell(Vector2i(14, 8)) != null, "mouse drop places at exact cursor cell")


func test_router_independent_pointers() -> void:
	var s: SimScript = _full_sim(2)
	var docks: Array = Layout.build_docks(0)
	var r: RouterScript = RouterScript.new()
	r.setup(s, docks)
	var d0: Layout.Dock = docks[0]
	var d1: Layout.Dock = docks[1]
	var p0: Vector2 = d0.to_screen(d0.slot_rect(0).get_center())
	var p1: Vector2 = d1.to_screen(d1.slot_rect(2).get_center())
	r.begin(0, p0)
	r.begin(1, p1)
	_ok(r.count() == 2, "two simultaneous touches tracked independently")
	var rp0: RouterScript.Pointer = r.pointers[0]
	var rp1: RouterScript.Pointer = r.pointers[1]
	_ok(rp0.player == 0 and rp0.turret_id == "pulse" and rp1.player == 1 and rp1.turret_id == "stasis", "ownership captured at drag start")
	r.move(0, Layout.cell_center(Vector2i(8, 5)) - d0.up() * RouterScript.TOUCH_LIFT)
	r.move(1, Layout.cell_center(Vector2i(9, 9)) - d1.up() * RouterScript.TOUCH_LIFT)
	_ok(rp0.cell == Vector2i(8, 5) and rp1.cell == Vector2i(9, 9) and rp0.valid and rp1.valid, "each pointer keeps its own ghost cell")
	r.cancel(0)
	_ok(r.count() == 1 and r.pointers.has(1), "cancelling one touch leaves the other")
	r.end(1, Layout.cell_center(Vector2i(9, 9)) - d1.up() * RouterScript.TOUCH_LIFT)
	_ok(s.turrets.size() == 1 and s.turrets[0].owner_id == 1 and s.turrets[0].def_id == "stasis", "release places the turret for the pointer's owner")
	r.begin(RouterScript.MOUSE_ID, p0)
	_ok(r.count() == 1, "mouse fallback id coexists")
	r.cancel_all()
	_ok(r.count() == 0, "focus loss / cancel_all clears every pointer")
	r.end(0, p0)
	_ok(s.turrets.size() == 1, "stale release after cancel does nothing")
