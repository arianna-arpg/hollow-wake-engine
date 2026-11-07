extends Node

func _ready() -> void:
	if OS.get_cmdline_user_args().has("--verify-stations"):
		add_child(preload("res://verify_stations.gd").new())
		return
	if OS.get_cmdline_user_args().has("--verify-background"):
		add_child(preload("res://verify_background.gd").new())
		return
	if OS.get_cmdline_user_args().has("--verify-inlays"):
		add_child(preload("res://verify_inlays.gd").new())
		return
	if OS.get_cmdline_user_args().has("--measure-vestiges"):
		var measurement:=preload("res://measure_inlays.gd").new().measure()
		print("HWE_INLAY_MEASURE ",JSON.stringify(measurement))
		get_tree().quit(0 if measurement.ok else 1)
		return
	if OS.get_cmdline_user_args().has("--measure-recall"):
		var measurement:=preload("res://measure_pouch.gd").new().measure()
		print("HWE_RECALL_MEASURE ",JSON.stringify(measurement))
		get_tree().quit(0 if measurement.ok else 1)
		return
	if not OS.get_cmdline_user_args().has("--measure-supports"):
		get_tree().call_deferred("change_scene_to_file","res://inventory.tscn")
		return
	var result:=preload("res://measure_supports.gd").new().measure()
	print("HWE_SUPPORT_MEASURE ",JSON.stringify(result))
	get_tree().quit(0 if result.ok else 1)
