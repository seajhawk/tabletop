extends RefCounted
## Per-pointer interaction state. Every touch (InputEventScreenTouch/Drag `index`) or the
## mouse fallback id owns an independent Pointer record. Ownership (player, turret type,
## button) is captured at press time and never re-derived while dragging.

const Layout = preload("res://scripts/layout.gd")
const SimScript = preload("res://scripts/sim.gd")

const MOUSE_ID: int = -1
const TOUCH_LIFT: float = 60.0
const TAP_MAX_MS: int = 700
const TAP_MAX_PX: float = 28.0

signal action(name: String)
signal notice(text: String)


class Pointer:
	var id: int = 0
	var kind: String = ""  # drag | tap | button
	var is_touch: bool = false
	var pos: Vector2 = Vector2.ZERO
	var aim_pos: Vector2 = Vector2.ZERO
	var lift_vec: Vector2 = Vector2.ZERO
	var start_pos: Vector2 = Vector2.ZERO
	var start_ms: int = 0
	var player: int = -1
	var turret_id: String = ""
	var button: String = ""
	var cell: Vector2i = Vector2i(-1, -1)
	var valid: bool = false
	var reason: String = ""


var pointers: Dictionary = {}
var sim: SimScript = null
var docks: Array = []
var hud_top: float = Layout.HUD_TOP


func setup(p_sim: SimScript, p_docks: Array, p_hud_top: float = Layout.HUD_TOP) -> void:
	sim = p_sim
	docks = p_docks
	hud_top = p_hud_top
	pointers.clear()


static func reason_text(code: String) -> String:
	match code:
		"funds":
			return "Not enough credits"
		"blocked_path":
			return "Blocked: would trap a spawn or ship"
		"enemy":
			return "A ship is in that cell"
		"occupied":
			return "Cell already has a turret"
		"asteroid":
			return "Asteroid in the way"
		"reserved":
			return "Portal / Earth cells are reserved"
		"outside":
			return "Drop on the grid"
		"match_over":
			return "Match is over - reset"
	return code


func count() -> int:
	return pointers.size()


func begin(id: int, pos: Vector2) -> void:
	if pointers.has(id):
		cancel(id)
	var p: Pointer = Pointer.new()
	p.id = id
	p.is_touch = id != MOUSE_ID
	p.pos = pos
	p.aim_pos = pos
	p.start_pos = pos
	p.start_ms = Time.get_ticks_msec()
	var btn: String = Layout.hit_button(pos, hud_top)
	if btn != "":
		p.kind = "button"
		p.button = btn
		pointers[id] = p
		return
	var slot: Vector2i = Layout.hit_slot(docks, pos)
	if slot.x >= 0 and slot.y < sim.turret_order.size():
		p.kind = "drag"
		p.player = slot.x
		p.turret_id = sim.turret_order[slot.y]
		if p.is_touch:
			for d in docks:
				var dock: Layout.Dock = d
				if dock.player == slot.x:
					p.lift_vec = dock.up() * TOUCH_LIFT
					break
		p.aim_pos = pos + p.lift_vec
		_refresh_drag(p)
		pointers[id] = p
		return
	var cell: Vector2i = Layout.pos_to_cell(pos)
	if cell.x >= 0 and sim.turret_at_cell(cell) != null:
		p.kind = "tap"
		p.cell = cell
		pointers[id] = p


func move(id: int, pos: Vector2) -> void:
	if not pointers.has(id):
		return
	var p: Pointer = pointers[id]
	p.pos = pos
	p.aim_pos = pos + p.lift_vec
	if p.kind == "drag":
		_refresh_drag(p)


func end(id: int, pos: Vector2) -> void:
	if not pointers.has(id):
		return
	var p: Pointer = pointers[id]
	p.pos = pos
	p.aim_pos = pos + p.lift_vec
	pointers.erase(id)
	match p.kind:
		"button":
			if Layout.hit_button(pos, hud_top) == p.button:
				action.emit(p.button)
		"drag":
			var cell: Vector2i = Layout.pos_to_cell(p.aim_pos)
			if cell.x < 0:
				return  # released off-board: cancel quietly
			# Revalidate funds, cells and paths atomically at the moment of release.
			var err: String = sim.place_turret(p.player, p.turret_id, cell)
			if err != "":
				notice.emit(reason_text(err))
		"tap":
			var same: bool = Layout.pos_to_cell(pos) == p.cell
			var quick: bool = Time.get_ticks_msec() - p.start_ms <= TAP_MAX_MS
			var still: bool = pos.distance_to(p.start_pos) <= TAP_MAX_PX
			if same and quick and still and sim.turret_at_cell(p.cell) != null:
				_sell(p.cell)


## Right-click / secondary: sell immediately.
func secondary(pos: Vector2) -> void:
	var cell: Vector2i = Layout.pos_to_cell(pos)
	if cell.x >= 0 and sim.turret_at_cell(cell) != null:
		_sell(cell)


func _sell(cell: Vector2i) -> void:
	var t: SimScript.Turret = sim.turret_at_cell(cell)
	if t == null:
		return
	var refund: float = t.cost * SimScript.SELL_RATIO
	var owner_id: int = t.owner_id
	if sim.sell_at(cell) == "":
		notice.emit("Sold for %.1f to P%d" % [refund, owner_id + 1])


func cancel(id: int) -> void:
	pointers.erase(id)


func cancel_all() -> void:
	pointers.clear()


## Ghost validity depends on live world state, so refresh drags every frame.
func refresh() -> void:
	for k in pointers:
		var p: Pointer = pointers[k]
		if p.kind == "drag":
			_refresh_drag(p)


func _refresh_drag(p: Pointer) -> void:
	p.cell = Layout.pos_to_cell(p.aim_pos)
	if p.cell.x < 0:
		p.valid = false
		p.reason = "outside"
		return
	p.reason = sim.check_placement(p.player, p.turret_id, p.cell)
	p.valid = p.reason == ""
