extends Node
const Ward = preload("res://addons/hollow_wake/ward/ward.gd")
var cues: Array = []
var failed := false

func check(value: bool, label: String) -> void:
	if not value:
		failed = true
		push_error(label)

func _ready() -> void:
	var host := Ward.new()
	host.ward_gained.connect(func(id: int, ward: float, cue: Dictionary): cues.append([id, ward, cue]))
	check(host.start() == 0, "start")
	check(host.equip(0, 1).get("ok", false), "zero handle")
	check(host.equip(3, 2).get("ok", false), "second actor")
	check(host.equip(0, 2).get("reason") == "already-equipped", "no implicit reset")
	var first := host.low_life(0, 0)
	var held := host.low_life(0, 1)
	var second := host.low_life(3, 0)
	var next := host.low_life(0, 20)
	check(first.get("ward") == 30 and first.get("draws") == 1, "authored grant")
	check(held.get("ward") == 30 and held.get("cue") == null, "cooldown")
	check(second.get("ward") == 30, "independent actor")
	check(next.get("ward") == 60 and next.get("draws") == 3, "authored recovery")
	check(cues.size() == 3 and cues[0][0] == 0 and cues[0][2].color == "#8ae0b8", "gain signal")
	check(host.low_life(0, 19).get("reason") == "invalid-time", "backward time")
	check(host.remove_actor(0).get("ok", false), "remove")
	check(host.low_life(0, 21).get("reason") == "not-equipped", "retired handle")
	check(host.equip(0, 1).get("ok", false) and host.low_life(0, 0).get("ward") == 30, "fresh actor")
	for id in range(4, 66):
		check(host.equip(id, 1).get("ok", false), "fill available actors")
		check(host.low_life(id, 0).get("ward") == 30, "bounded actor course")
	check(host.equip(66, 1).get("reason") == "actor-limit", "explicit capacity")
	check(host.equip(4294967296, 1).get("reason") == "invalid-actor", "ID limit")
	check(host.remove_actor(65).get("ok", false) and host.equip(66, 1).get("ok", false), "capacity recovery")
	check(host.close() == 0 and host.close() == 0, "idempotent close")
	var metrics := host.metrics()
	check(metrics.live_bytes == 0 and metrics.live_blocks == 0, "disposal")
	check(metrics.peak_bytes > 0 and metrics.peak_bytes <= 4194304, "heap budget")
	print(JSON.stringify({"passed": not failed, "first": first, "held": held, "second": second, "next": next, "cue_count": cues.size(), "metrics": metrics}))
	get_tree().quit(1 if failed else 0)
