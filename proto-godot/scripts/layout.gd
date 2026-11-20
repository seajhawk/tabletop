extends RefCounted
## Screen geometry: playfield, rotated player docks and shared control buttons.
## Pure data/hit-testing. Dock hit tests inverse-rotate the pointer into dock-local space.

const SCREEN: Vector2 = Vector2(1280, 800)
const CELL: float = 32.0
const BOARD_ORIGIN: Vector2 = Vector2(192, 144)
const GRID_W: int = 28
const GRID_H: int = 16
const LAYOUT_NAMES: Array = ["2P opposing", "4P corners", "4P edges"]
const PLAYER_COLORS: Array = [
	Color(0.298, 0.851, 0.937), Color(1.0, 0.757, 0.431), Color(1.0, 0.498, 0.529), Color(0.510, 0.890, 0.706)
]
const BUTTONS: Array = ["start", "pause", "reset", "layout", "stress", "fullscreen"]


## Corner docks are physically scaled (logical 480x120 at 0.56 = ~269x67 screen px) and sit on the diagonals.
const CORNER_SCALE: float = 0.56
const CORNER_SIZE: Vector2 = Vector2(480, 120)
const HUD_TOP: float = 130.0
const CORNER_HUD_TOP: float = 258.0


class Dock:
	const WALLET_W: float = 120.0
	const PAD: float = 8.0
	var player: int = 0
	var center: Vector2 = Vector2.ZERO
	var rot: float = 0.0
	var size: Vector2 = Vector2(360, 120)  # logical (dock-local) size
	var dock_scale: float = 1.0  # physical scale applied on top of rotation

	## Screen point -> dock-local (logical) space: inverse rotation AND inverse scale.
	func to_local(p: Vector2) -> Vector2:
		return (p - center).rotated(-rot) / dock_scale

	func to_screen(l: Vector2) -> Vector2:
		return center + (l * dock_scale).rotated(rot)

	## The oriented footprint as 4 screen-space corners.
	func corners() -> PackedVector2Array:
		var h: Vector2 = size * 0.5
		return PackedVector2Array([
			to_screen(Vector2(-h.x, -h.y)), to_screen(Vector2(h.x, -h.y)),
			to_screen(Vector2(h.x, h.y)), to_screen(Vector2(-h.x, h.y)),
		])

	## Screen-space direction of the dock's local "up" (toward the board).
	func up() -> Vector2:
		return Vector2(0, -1).rotated(rot)

	func slot_rect(i: int) -> Rect2:
		var slot_w: float = (size.x - WALLET_W - PAD * 4.0) / 3.0
		var x: float = -size.x * 0.5 + WALLET_W + PAD + float(i) * (slot_w + PAD)
		return Rect2(Vector2(x, -size.y * 0.5 + PAD), Vector2(slot_w, size.y - PAD * 2.0))


static func _mk(player: int, center: Vector2, rot: float, size: Vector2, p_scale: float = 1.0) -> Dock:
	var d: Dock = Dock.new()
	d.player = player
	d.center = center
	d.rot = rot
	d.size = size
	d.dock_scale = p_scale
	return d


## Separating-axis test for two convex polygons; touching edges do not count as overlap.
static func polys_overlap(a: PackedVector2Array, b: PackedVector2Array) -> bool:
	for poly: PackedVector2Array in [a, b]:
		for i in range(poly.size()):
			var e: Vector2 = poly[(i + 1) % poly.size()] - poly[i]
			var n: Vector2 = Vector2(-e.y, e.x)
			var a_min: float = INF
			var a_max: float = -INF
			var b_min: float = INF
			var b_max: float = -INF
			for v in a:
				var t: float = v.dot(n)
				a_min = minf(a_min, t)
				a_max = maxf(a_max, t)
			for v in b:
				var t: float = v.dot(n)
				b_min = minf(b_min, t)
				b_max = maxf(b_max, t)
			if a_max <= b_min + 1e-6 or b_max <= a_min + 1e-6:
				return false
	return true


static func rect_poly(r: Rect2) -> PackedVector2Array:
	return PackedVector2Array([
		r.position, r.position + Vector2(r.size.x, 0), r.position + r.size, r.position + Vector2(0, r.size.y)
	])


## Top of the shared control column and right-hand stats: corner docks need it lowered.
static func hud_top(layout: int) -> float:
	return CORNER_HUD_TOP if layout == 1 else HUD_TOP


static func player_count(layout: int) -> int:
	return 2 if layout == 0 else 4


static func build_docks(layout: int) -> Array:
	var docks: Array = []
	match layout:
		0:
			var s: Vector2 = Vector2(480, 120)
			docks.append(_mk(0, Vector2(640, 732), 0.0, s))
			docks.append(_mk(1, Vector2(640, 68), PI, s))
		1:
			# Diagonal corners: 0 = SW 45deg, 1 = NE 225deg, 2 = SE 315deg, 3 = NW 135deg; "up" faces the board.
			docks.append(_mk(0, Vector2(122, 678), deg_to_rad(45.0), CORNER_SIZE, CORNER_SCALE))
			docks.append(_mk(1, Vector2(1158, 122), deg_to_rad(225.0), CORNER_SIZE, CORNER_SCALE))
			docks.append(_mk(2, Vector2(1158, 678), deg_to_rad(315.0), CORNER_SIZE, CORNER_SCALE))
			docks.append(_mk(3, Vector2(122, 122), deg_to_rad(135.0), CORNER_SIZE, CORNER_SCALE))
		_:
			var s: Vector2 = Vector2(360, 120)
			docks.append(_mk(0, Vector2(640, 732), 0.0, s))
			docks.append(_mk(1, Vector2(640, 68), PI, s))
			docks.append(_mk(2, Vector2(96, 610), PI * 0.5, s))
			docks.append(_mk(3, Vector2(1184, 610), -PI * 0.5, s))
	return docks


## Returns Vector2i(player, slot) or (-1, -1).
static func hit_slot(docks: Array, p: Vector2) -> Vector2i:
	for d in docks:
		var dock: Dock = d
		var l: Vector2 = dock.to_local(p)
		for s in range(3):
			if dock.slot_rect(s).has_point(l):
				return Vector2i(dock.player, s)
	return Vector2i(-1, -1)


static func button_rect(i: int, top: float = HUD_TOP) -> Rect2:
	return Rect2(Vector2(12, top + i * 46), Vector2(168, 40))


static func controls_rect(top: float = HUD_TOP) -> Rect2:
	return Rect2(Vector2(12, top), Vector2(168, 5 * 46 + 40))


static func stats_rect(top: float = HUD_TOP) -> Rect2:
	return Rect2(Vector2(1144, top), Vector2(132, 270))


static func hit_button(p: Vector2, top: float = HUD_TOP) -> String:
	for i in range(BUTTONS.size()):
		if button_rect(i, top).has_point(p):
			return String(BUTTONS[i])
	return ""


static func board_rect() -> Rect2:
	return Rect2(BOARD_ORIGIN, Vector2(GRID_W, GRID_H) * CELL)


## Cell under a screen point, or (-1, -1) off the board.
static func pos_to_cell(p: Vector2) -> Vector2i:
	var l: Vector2 = (p - BOARD_ORIGIN) / CELL
	var c: Vector2i = Vector2i(floori(l.x), floori(l.y))
	if c.x < 0 or c.y < 0 or c.x >= GRID_W or c.y >= GRID_H:
		return Vector2i(-1, -1)
	return c


static func cell_center(c: Vector2i) -> Vector2:
	return BOARD_ORIGIN + (Vector2(c) + Vector2(0.5, 0.5)) * CELL


## Simulation-space position (cell units) to screen.
static func to_screen(p: Vector2) -> Vector2:
	return BOARD_ORIGIN + p * CELL
