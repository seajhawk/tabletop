extends RefCounted
## Loads the canonical shared JSON (copied into res://data by tools/sync-data.ps1).
## Falls back to ../shared-data next to the project when res://data is absent.

const FILES: Array[String] = ["turrets", "enemies", "maps", "waves"]


static func data_dir() -> String:
	if FileAccess.file_exists("res://data/turrets.json"):
		return "res://data/"
	return ProjectSettings.globalize_path("res://").path_join("../shared-data/")


static func read_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var f: FileAccess = FileAccess.open(path, FileAccess.READ)
	if f == null:
		return {}
	var text: String = f.get_as_text()
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	return parsed as Dictionary


## Returns {ok, error, source, turrets{id:def}, turret_order[], enemies{id:def}, map{}, waves[]}.
static func load_bundle() -> Dictionary:
	var dir: String = data_dir()
	var out: Dictionary = {"ok": false, "error": "", "source": dir}
	var raw: Dictionary = {}
	for name: String in FILES:
		var d: Dictionary = read_json(dir + name + ".json")
		if d.is_empty() or int(d.get("schemaVersion", 0)) != 1 or not d.has(name):
			out["error"] = "Missing or invalid %s.json in %s" % [name, dir]
			return out
		raw[name] = d[name]
	var turrets: Dictionary = {}
	var order: Array[String] = []
	var tlist: Array = raw["turrets"]
	for t in tlist:
		var td: Dictionary = t
		turrets[String(td["id"])] = td
		order.append(String(td["id"]))
	var enemies: Dictionary = {}
	var elist: Array = raw["enemies"]
	for e in elist:
		var ed: Dictionary = e
		enemies[String(ed["id"])] = ed
	var maps: Array = raw["maps"]
	if maps.is_empty():
		out["error"] = "maps.json has no maps"
		return out
	out["turrets"] = turrets
	out["turret_order"] = order
	out["enemies"] = enemies
	out["map"] = maps[0]
	out["waves"] = raw["waves"]
	out["ok"] = true
	return out
