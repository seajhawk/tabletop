extends Node2D
## Glue: owns the match, fixed 60 Hz stepping and raw input dispatch.
## Game rules live in sim.gd; drawing lives in game_view.gd.

const DataLoader = preload("res://scripts/data_loader.gd")
const SimScript = preload("res://scripts/sim.gd")
const RouterScript = preload("res://scripts/touch_router.gd")
const Layout = preload("res://scripts/layout.gd")
const ViewScript = preload("res://scripts/game_view.gd")

const MAX_STEPS_PER_FRAME: int = 6

var bundle: Dictionary = {}
var sim: SimScript = null
var router: RouterScript = null
var docks: Array = []
var layout_index: int = 0
var accumulator: float = 0.0
var toast_time: float = 0.0
var fps_smooth: float = 60.0
var hud: Dictionary = {
	"fps": 60.0, "enemies": 0, "pointers": 0, "toast": "", "toast_alpha": 0.0,
	"layout": "", "data_source": "", "error": "", "fullscreen": false,
}
@onready var view: ViewScript = $GameView


func _ready() -> void:
	bundle = DataLoader.load_bundle()
	hud["data_source"] = String(bundle.get("source", ""))
	if not bool(bundle.get("ok", false)):
		hud["error"] = String(bundle.get("error", "data load failed"))
		push_error(String(hud["error"]))
		view.hud = hud
		return
	get_window().focus_exited.connect(_on_focus_lost)
	_new_match(0)


func _new_match(layout: int) -> void:
	if router != null:
		router.cancel_all()
	layout_index = layout
	docks = Layout.build_docks(layout)
	sim = SimScript.new()
	sim.setup(bundle, Layout.player_count(layout))
	router = RouterScript.new()
	router.setup(sim, docks, Layout.hud_top(layout))
	hud["hud_top"] = Layout.hud_top(layout)
	router.action.connect(_on_action)
	router.notice.connect(_toast)
	accumulator = 0.0
	hud["layout"] = String(Layout.LAYOUT_NAMES[layout])
	view.bind(sim, router, docks, hud)
	_toast("Layout: %s - match reset" % String(Layout.LAYOUT_NAMES[layout]))


func _toast(text: String) -> void:
	hud["toast"] = text
	toast_time = 2.6


func _on_focus_lost() -> void:
	if router == null or sim == null:
		return
	router.cancel_all()
	sim.paused = true
	_toast("Focus lost: drags cancelled, paused")


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_WM_WINDOW_FOCUS_OUT:
		_on_focus_lost()


func _on_action(action_name: String) -> void:
	match action_name:
		"start":
			sim.paused = false
			var err: String = sim.start_next_wave()
			match err:
				"":
					_toast("Wave %d launched" % sim.wave_index)
				"wave_spawning":
					_toast("Wave still spawning")
				"no_more_waves":
					_toast("No more waves - Reset or Stress")
				_:
					_toast("Cannot start: %s" % err)
		"pause":
			sim.paused = not sim.paused
			_toast("Paused" if sim.paused else "Resumed")
		"reset":
			_new_match(layout_index)
		"layout":
			_new_match((layout_index + 1) % Layout.LAYOUT_NAMES.size())
		"stress":
			_new_match(layout_index)
			sim.start_stress()
			_toast("Stress: %d ships, %d turrets (local observation only)" % [sim.enemies.size(), sim.turrets.size()])
		"fullscreen":
			var w: Window = get_window()
			var full: bool = w.mode == Window.MODE_FULLSCREEN or w.mode == Window.MODE_EXCLUSIVE_FULLSCREEN
			w.mode = Window.MODE_WINDOWED if full else Window.MODE_FULLSCREEN


func _input(event: InputEvent) -> void:
	if router == null:
		return
	if event is InputEventScreenTouch:
		var st: InputEventScreenTouch = event
		if st.canceled:
			router.cancel(st.index)
		elif st.pressed:
			router.begin(st.index, st.position)
		else:
			router.end(st.index, st.position)
	elif event is InputEventScreenDrag:
		var sd: InputEventScreenDrag = event
		router.move(sd.index, sd.position)
	elif event is InputEventMouseButton:
		var mb: InputEventMouseButton = event
		if mb.button_index == MOUSE_BUTTON_LEFT:
			if mb.pressed:
				router.begin(RouterScript.MOUSE_ID, mb.position)
			else:
				router.end(RouterScript.MOUSE_ID, mb.position)
		elif mb.button_index == MOUSE_BUTTON_RIGHT and mb.pressed:
			router.secondary(mb.position)
	elif event is InputEventMouseMotion:
		var mm: InputEventMouseMotion = event
		router.move(RouterScript.MOUSE_ID, mm.position)
	elif event is InputEventKey:
		var k: InputEventKey = event
		if k.pressed and not k.echo:
			match k.keycode:
				KEY_SPACE, KEY_P:
					_on_action("pause")
				KEY_ENTER:
					_on_action("start")
				KEY_F11:
					_on_action("fullscreen")
				KEY_ESCAPE:
					router.cancel_all()


func _process(delta: float) -> void:
	if sim == null:
		view.queue_redraw()
		return
	if sim.paused:
		accumulator = 0.0
	else:
		accumulator += delta
		var steps: int = 0
		while accumulator >= SimScript.STEP and steps < MAX_STEPS_PER_FRAME:
			sim.step(SimScript.STEP)
			accumulator -= SimScript.STEP
			steps += 1
		if steps == MAX_STEPS_PER_FRAME:
			accumulator = 0.0  # fell behind: drop the backlog instead of spiralling
	router.refresh()
	fps_smooth = lerpf(fps_smooth, Engine.get_frames_per_second(), 0.1)
	toast_time = maxf(0.0, toast_time - delta)
	hud["fps"] = fps_smooth
	hud["enemies"] = sim.enemies.size()
	hud["pointers"] = router.count()
	hud["toast_alpha"] = clampf(toast_time / 0.5, 0.0, 1.0)
	view.queue_redraw()
