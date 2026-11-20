extends Node2D
## Presentation only. Reads sim/router/dock state and draws procedurally with the
## standard 2D canvas (Compatibility renderer). Layered translucent strokes imitate glow;
## no HDR/bloom is used or claimed (deferred).

const SimScript = preload("res://scripts/sim.gd")
const RouterScript = preload("res://scripts/touch_router.gd")
const Layout = preload("res://scripts/layout.gd")

const C_SPACE: Color = Color(0.031, 0.075, 0.129)
const C_PANEL: Color = Color(0.045, 0.098, 0.165)
const C_GRID: Color = Color(0.125, 0.208, 0.294)
const C_ICE: Color = Color(0.773, 0.894, 0.929)
const C_CYAN: Color = Color(0.298, 0.851, 0.937)
const C_AMBER: Color = Color(1.0, 0.757, 0.431)
const C_CORAL: Color = Color(1.0, 0.498, 0.529)
const C_MINT: Color = Color(0.510, 0.890, 0.706)

var sim: SimScript = null
var router: RouterScript = null
var docks: Array = []
var hud: Dictionary = {}
var font: Font = null


func _ready() -> void:
	var sf: SystemFont = SystemFont.new()
	sf.font_names = PackedStringArray(["Segoe UI", "Noto Sans", "Arial", "sans-serif"])
	font = sf


func bind(p_sim: SimScript, p_router: RouterScript, p_docks: Array, p_hud: Dictionary) -> void:
	sim = p_sim
	router = p_router
	docks = p_docks
	hud = p_hud


func _t(text: String, pos: Vector2, size: int, color: Color, align: HorizontalAlignment = HORIZONTAL_ALIGNMENT_LEFT, width: float = -1.0) -> void:
	draw_string(font, pos, text, align, width, size, color)


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, Layout.SCREEN), C_SPACE)
	if sim == null:
		_t(String(hud.get("error", "Loading...")), Vector2(40, 400), 22, C_CORAL)
		return
	_draw_board()
	_draw_route()
	_draw_turrets()
	_draw_enemies()
	_draw_fx()
	_draw_ghosts()
	_draw_docks()
	_draw_buttons()
	_draw_hud()
	_draw_overlay()


# ------------------------------------------------------------------ board

func _draw_board() -> void:
	var br: Rect2 = Layout.board_rect()
	draw_rect(br, C_PANEL)
	var o: Vector2 = Layout.BOARD_ORIGIN
	var cs: float = Layout.CELL
	var gc: Color = Color(C_GRID, 0.8)
	for x in range(Layout.GRID_W + 1):
		draw_line(o + Vector2(x * cs, 0), o + Vector2(x * cs, Layout.GRID_H * cs), gc, 1.0)
	for y in range(Layout.GRID_H + 1):
		draw_line(o + Vector2(0, y * cs), o + Vector2(Layout.GRID_W * cs, y * cs), gc, 1.0)
	draw_rect(br, C_GRID, false, 2.0)
	# Exits (Earth side) and spawn portals.
	for e: Vector2i in sim.exits:
		draw_rect(Rect2(o + Vector2(e) * cs, Vector2(cs, cs)), Color(C_MINT, 0.22))
	for s: Vector2i in sim.spawns:
		var c: Vector2 = Layout.cell_center(s)
		draw_circle(c, cs * 0.46, Color(C_CORAL, 0.12))
		draw_arc(c, cs * 0.42, 0.0, TAU, 28, Color(C_CORAL, 0.9), 2.0)
		draw_arc(c, cs * 0.26, 0.0, TAU, 24, Color(C_CORAL, 0.6), 1.5)
	# Asteroids: deterministic jagged silhouettes.
	for y in range(sim.height):
		for x in range(sim.width):
			if sim.rock[y * sim.width + x] != 0:
				_draw_asteroid(Vector2i(x, y))
	# Earth, parked just beyond the exit edge.
	var ec: Vector2 = Vector2(o.x + Layout.GRID_W * cs + 20.0, o.y + Layout.GRID_H * cs * 0.5)
	draw_circle(ec, 30.0, Color(C_CYAN, 0.12))
	draw_circle(ec, 25.0, Color(0.16, 0.42, 0.78))
	draw_circle(ec + Vector2(-6, -5), 9.0, Color(0.30, 0.62, 0.42))
	draw_circle(ec + Vector2(8, 9), 6.0, Color(0.30, 0.62, 0.42))
	draw_arc(ec, 26.0, 0.0, TAU, 32, Color(C_ICE, 0.7), 1.5)
	_t("Earth", ec + Vector2(-20, 46), 13, C_ICE)


func _draw_asteroid(c: Vector2i) -> void:
	var h: int = (c.x * 73856093) ^ (c.y * 19349663)
	var ctr: Vector2 = Layout.cell_center(c)
	var pts: PackedVector2Array = PackedVector2Array()
	var n: int = 9
	for i in range(n):
		var r: float = Layout.CELL * 0.46 * (0.72 + 0.28 * float((h >> (i * 3)) & 7) / 7.0)
		pts.append(ctr + Vector2.RIGHT.rotated(TAU * float(i) / float(n)) * r)
	draw_colored_polygon(pts, Color(0.20, 0.25, 0.32))
	pts.append(pts[0])
	draw_polyline(pts, Color(0.42, 0.50, 0.58), 1.5)
	draw_circle(ctr + Vector2(-5, -3), 3.0, Color(0.14, 0.18, 0.24))
	draw_circle(ctr + Vector2(5, 5), 2.0, Color(0.14, 0.18, 0.24))


func _draw_route() -> void:
	for s: Vector2i in sim.spawns:
		var cells: PackedVector2Array = sim.route_from(s)
		if cells.size() < 2:
			continue
		var pts: PackedVector2Array = PackedVector2Array()
		for p in cells:
			pts.append(Layout.to_screen(p))
		draw_polyline(pts, Color(C_CYAN, 0.28), 2.0)


# ------------------------------------------------------------------ units

func _turret_icon(pos: Vector2, role: String, color: Color, radius: float, ring: Color, angle: float, alpha: float) -> void:
	draw_circle(pos, radius, Color(0.03, 0.07, 0.12, alpha))
	draw_arc(pos, radius, 0.0, TAU, 28, Color(ring, ring.a * alpha), 2.0)
	var col: Color = Color(color, alpha)
	match role:
		"pulse":
			draw_circle(pos, radius * 0.42, col)
			draw_line(pos, pos + Vector2.RIGHT.rotated(angle) * radius * 1.05, col, 3.0)
		"plasma":
			draw_circle(pos, radius * 0.62, col)
			draw_circle(pos, radius * 0.30, Color(0.03, 0.07, 0.12, alpha))
			draw_line(pos, pos + Vector2.RIGHT.rotated(angle) * radius * 0.95, col, 4.0)
		_:
			draw_arc(pos, radius * 0.6, 0.0, TAU, 24, col, 3.0)
			draw_circle(pos, radius * 0.2, col)


func _draw_turrets() -> void:
	for t in sim.turrets:
		var pc: Color = Layout.PLAYER_COLORS[t.owner_id]
		_turret_icon(Layout.to_screen(t.pos), t.def_id, t.color, 13.0, pc, t.angle, 1.0)


func _draw_enemies() -> void:
	for e in sim.enemies:
		var c: Vector2 = Layout.to_screen(e.pos)
		var heading: float = (Vector2(e.next) + Vector2(0.5, 0.5) - e.pos).angle()
		if e.slow_time > 0.0:
			draw_arc(c, 11.0, 0.0, TAU, 16, Color(C_MINT, 0.8), 1.5)
		match e.def_id:
			"swarmer":
				draw_circle(c, 5.0, e.color)
			"cruiser":
				var pts: PackedVector2Array = PackedVector2Array()
				for i in range(6):
					pts.append(c + Vector2.RIGHT.rotated(heading + TAU * float(i) / 6.0) * 11.0)
				draw_colored_polygon(pts, e.color)
			_:
				var tri: PackedVector2Array = PackedVector2Array([
					c + Vector2.RIGHT.rotated(heading) * 9.0,
					c + Vector2.RIGHT.rotated(heading + 2.5) * 7.0,
					c + Vector2.RIGHT.rotated(heading - 2.5) * 7.0,
				])
				draw_colored_polygon(tri, e.color)
		if e.hp < e.max_hp:
			var w: float = 18.0
			draw_rect(Rect2(c + Vector2(-w * 0.5, -15), Vector2(w, 3)), Color(0, 0, 0, 0.6))
			draw_rect(Rect2(c + Vector2(-w * 0.5, -15), Vector2(w * clampf(e.hp / e.max_hp, 0.0, 1.0), 3)), C_MINT)


func _draw_fx() -> void:
	for b in sim.beams:
		var a: float = clampf(b.ttl / 0.08, 0.0, 1.0)
		var f: Vector2 = Layout.to_screen(b.from_pos)
		var t: Vector2 = Layout.to_screen(b.to_pos)
		draw_line(f, t, Color(b.color, 0.15 * a), 8.0)
		draw_line(f, t, Color(b.color, 0.4 * a), 4.0)
		draw_line(f, t, Color(C_ICE, a), 1.5)
	for p in sim.projectiles:
		var c: Vector2 = Layout.to_screen(p.pos)
		draw_circle(c, 11.0, Color(p.color, 0.12))
		draw_circle(c, 7.0, Color(p.color, 0.35))
		draw_circle(c, 4.0, Color(C_ICE, 0.95))
	for r in sim.rings:
		var prog: float = 1.0 - r.ttl / r.ttl_max
		var c: Vector2 = Layout.to_screen(r.pos)
		var rad: float = r.radius * Layout.CELL * prog
		draw_circle(c, rad, Color(r.color, 0.10 * (1.0 - prog)))
		draw_arc(c, rad, 0.0, TAU, 40, Color(r.color, 0.7 * (1.0 - prog)), 2.0)


func _draw_ghosts() -> void:
	for k in router.pointers:
		var p: RouterScript.Pointer = router.pointers[k]
		if p.kind != "drag":
			continue
		var pc: Color = Layout.PLAYER_COLORS[p.player]
		var def: Dictionary = sim.turret_defs[p.turret_id]
		var tcol: Color = Color(String(def["color"]))
		var state_col: Color = C_MINT if p.valid else C_CORAL
		var center: Vector2 = p.aim_pos
		if p.cell.x >= 0:
			center = Layout.cell_center(p.cell)
			draw_rect(Rect2(Layout.BOARD_ORIGIN + Vector2(p.cell) * Layout.CELL, Vector2(Layout.CELL, Layout.CELL)), Color(state_col, 0.25))
			draw_rect(Rect2(Layout.BOARD_ORIGIN + Vector2(p.cell) * Layout.CELL, Vector2(Layout.CELL, Layout.CELL)), state_col, false, 2.0)
		draw_arc(center, float(def["range"]) * Layout.CELL, 0.0, TAU, 48, Color(state_col, 0.45), 1.5)
		_turret_icon(center, p.turret_id, tcol, 13.0, pc, 0.0, 0.7)
		if p.lift_vec.length_squared() > 0.0:
			draw_line(p.pos, center, Color(pc, 0.45), 1.5)
		# Finger marker, so the owner can see which touch holds which turret.
		draw_arc(p.pos, 24.0, 0.0, TAU, 24, Color(pc, 0.9), 2.5)
		draw_circle(p.pos, 4.0, pc)


# ------------------------------------------------------------------ docks / controls

func _draw_docks() -> void:
	for d in docks:
		var dock: Layout.Dock = d
		var col: Color = Layout.PLAYER_COLORS[dock.player]
		draw_set_transform(dock.center, dock.rot, Vector2(dock.dock_scale, dock.dock_scale))
		# Compact (scaled) docks get larger logical type so text stays readable on screen.
		var m: float = 1.0 if dock.dock_scale >= 0.99 else 1.5
		var r: Rect2 = Rect2(-dock.size * 0.5, dock.size)
		draw_rect(r, Color(C_PANEL, 0.96))
		draw_rect(r, col, false, 2.0 * m)
		_t("P%d" % (dock.player + 1), r.position + Vector2(12, 38), int(26 * m), col)
		_t("%.1f" % sim.wallets[dock.player], r.position + Vector2(12, 74), int(22 * m), C_ICE)
		_t("credits", r.position + Vector2(12, 96), int(13 * m), Color(C_ICE, 0.7))
		for s in range(3):
			var sr: Rect2 = dock.slot_rect(s)
			var id: String = sim.turret_order[s]
			var def: Dictionary = sim.turret_defs[id]
			var cost: float = float(def["cost"])
			var ok: bool = sim.wallets[dock.player] + 1e-9 >= cost
			var a: float = 1.0 if ok else 0.4
			draw_rect(sr, Color(0.07, 0.14, 0.23, 0.95))
			draw_rect(sr, Color(col, 0.8 * a), false, 1.5 * m)
			var ic: Vector2 = sr.position + Vector2(sr.size.x * 0.5, 36.0 if m == 1.0 else 26.0)
			var ir: float = 16.0 if m == 1.0 else 18.4
			_turret_icon(ic, id, Color(String(def["color"])), ir, col, -0.8, a)
			var name_y: float = sr.size.y - 28.0 if m == 1.0 else sr.size.y - 34.0
			var name_sz: int = 13 if m == 1.0 else 18
			var cost_y: float = sr.size.y - 8.0 if m == 1.0 else sr.size.y - 6.0
			var cost_sz: int = 16 if m == 1.0 else 22
			_t(String(def["name"]).get_slice(" ", 0), sr.position + Vector2(0, name_y), name_sz, Color(C_ICE, a), HORIZONTAL_ALIGNMENT_CENTER, sr.size.x)
			_t("%d" % int(cost), sr.position + Vector2(0, cost_y), cost_sz, Color(C_AMBER, a), HORIZONTAL_ALIGNMENT_CENTER, sr.size.x)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _button_label(bname: String) -> String:
	match bname:
		"start":
			if sim.wave_index >= sim.ordinary_waves.size():
				return "No more waves"
			return "Start wave %d" % (sim.wave_index + 1)
		"pause":
			return "Resume" if sim.paused else "Pause"
		"reset":
			return "Reset"
		"layout":
			return "Layout: %s" % String(hud.get("layout", ""))
		"stress":
			return "Stress 150+20"
		"fullscreen":
			return "Fullscreen"
	return bname


func _draw_buttons() -> void:
	for i in range(Layout.BUTTONS.size()):
		var bname: String = String(Layout.BUTTONS[i])
		var r: Rect2 = Layout.button_rect(i, float(hud.get("hud_top", Layout.HUD_TOP)))
		var held: bool = false
		for k in router.pointers:
			var p: RouterScript.Pointer = router.pointers[k]
			if p.kind == "button" and p.button == bname:
				held = true
		draw_rect(r, Color(0.10, 0.20, 0.31) if held else Color(0.06, 0.13, 0.21))
		draw_rect(r, C_CYAN if held else C_GRID, false, 2.0)
		_t(_button_label(bname), r.position + Vector2(0, 26), 16, C_ICE, HORIZONTAL_ALIGNMENT_CENTER, r.size.x)


func _draw_hud() -> void:
	var sr: Rect2 = Layout.stats_rect(float(hud.get("hud_top", Layout.HUD_TOP)))
	var x: float = sr.position.x
	var y: float = sr.position.y + 16.0
	var lines: Array[String] = [
		"FPS %.0f" % float(hud.get("fps", 0.0)),
		"Enemies %d" % int(hud.get("enemies", 0)),
		"Pointers %d" % int(hud.get("pointers", 0)),
		"Wave %d/%d" % [sim.wave_index, sim.ordinary_waves.size()],
		"Lives %d" % sim.lives,
		"State: %s" % sim.state,
		"Kills %d  Leaks %d" % [sim.kills, sim.leaks],
	]
	for l in lines:
		_t(l, Vector2(x, y), 14, C_ICE)
		y += 18.0
	y += 6.0
	var hint: String = "Drag a turret from your dock onto a free cell. Tap a turret (or right-click) to sell for 70%."
	draw_multiline_string(font, Vector2(x, y), hint, HORIZONTAL_ALIGNMENT_LEFT, sr.size.x, 12, -1, Color(C_ICE, 0.75))
	var alpha: float = float(hud.get("toast_alpha", 0.0))
	var toast: String = String(hud.get("toast", ""))
	if alpha > 0.0 and toast != "":
		var br: Rect2 = Layout.board_rect()
		var box: Rect2 = Rect2(br.position + Vector2(br.size.x * 0.5 - 220, 8), Vector2(440, 30))
		draw_rect(box, Color(0.02, 0.05, 0.09, 0.85 * alpha))
		draw_rect(box, Color(C_AMBER, alpha), false, 1.5)
		_t(toast, box.position + Vector2(0, 21), 15, Color(C_ICE, alpha), HORIZONTAL_ALIGNMENT_CENTER, box.size.x)


func _draw_overlay() -> void:
	var br: Rect2 = Layout.board_rect()
	var msg: String = ""
	if sim.state == "won":
		msg = "EARTH HOLDS - victory"
	elif sim.state == "lost":
		msg = "DEFEAT"
	elif sim.paused:
		msg = "PAUSED"
	if msg == "":
		return
	draw_rect(br, Color(0.02, 0.05, 0.09, 0.55))
	_t(msg, br.position + Vector2(0, br.size.y * 0.5 + 12), 44, C_AMBER, HORIZONTAL_ALIGNMENT_CENTER, br.size.x)
