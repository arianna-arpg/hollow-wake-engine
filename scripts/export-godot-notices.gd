extends SceneTree

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1:
		quit(1)
		return
	var output := FileAccess.open(args[0], FileAccess.WRITE)
	if output == null:
		quit(1)
		return
	var version := Engine.get_version_info()
	output.store_string(JSON.stringify({
		"version": version.string, "commit": version.hash,
		"engine": Engine.get_license_text(),
		"components": Engine.get_copyright_info(),
		"licenses": Engine.get_license_info()
	}, "\t") + "\n")
	output.close()
	quit(0)
