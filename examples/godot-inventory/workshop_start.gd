extends Node

func _ready() -> void:
	if not OS.get_cmdline_user_args().has("--measure-supports"):
		get_tree().call_deferred("change_scene_to_file","res://inventory.tscn")
		return
	var result:=preload("res://measure_supports.gd").new().measure()
	print("HWE_SUPPORT_MEASURE ",JSON.stringify(result))
	get_tree().quit(0 if result.ok else 1)
