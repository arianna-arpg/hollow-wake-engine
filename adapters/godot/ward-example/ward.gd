extends RefCounted

signal ward_gained(actor: int, ward: float, cue: Dictionary)

const DATA := "res://addons/hollow_wake/ward/"
var _host := HollowWakeHost.new()

func start(heap_limit_bytes: int = 4 * 1024 * 1024) -> int:
	var bundle := FileAccess.get_file_as_bytes(DATA + "bundle.txt")
	var content := FileAccess.get_file_as_bytes(DATA + "content.json")
	return _host.initialize(bundle, content, heap_limit_bytes)

func equip(actor: int, seed_value: int) -> Dictionary:
	return _request({"op": "equip", "actor": actor, "seed": seed_value})

func low_life(actor: int, simulation_seconds: float) -> Dictionary:
	var result := _request({"op": "low_life", "actor": actor, "time": simulation_seconds})
	if result.get("ok", false) and result.get("cue") != null:
		ward_gained.emit(actor, result.ward, result.cue)
	return result

func remove_actor(actor: int) -> Dictionary:
	return _request({"op": "remove", "actor": actor})

func close() -> int:
	return _host.close()

func metrics() -> Dictionary:
	return _host.get_metrics()

func _request(command: Dictionary) -> Dictionary:
	var reply := _host.submit_json(JSON.stringify(command))
	if reply.status != 0:
		return {"ok": false, "reason": "native-host", "status": reply.status}
	return JSON.parse_string(reply.response)
