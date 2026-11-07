extends Node

const Profile = preload("res://profile.gd")
const Screen = preload("res://inventory.tscn")
func _ready() -> void:
	call_deferred("_run")

func check(value: bool,note: String) -> bool:
	if not value:
		printerr("HWE_VESTIGE_FAILED ",note)
		get_tree().quit(1)
	return value

func wallet_matches(actual: Dictionary,wanted: Dictionary) -> bool:
	if actual.size()!=wanted.size():return false
	for id in wanted:
		if not actual.has(id) or actual[id]!=wanted[id]:return false
	return true

func choose(ui: Variant,id: String,socket: int) -> bool:
	ui.inlay_button.pressed.emit()
	if not check(ui.inlay_dialog.visible,"visible dialog"):return false
	var choice:OptionButton=ui.inlay_material
	for i in choice.item_count:
		if choice.get_item_metadata(i)==id:
			choice.select(i)
			ui.inlay_socket.select(socket+1)
			ui.inlay_socket.item_selected.emit(socket+1)
			return true
	return check(false,"missing material "+id)

func confirm(ui: Variant) -> bool:
	if not check(not ui.inlay_dialog.get_ok_button().disabled,"enabled confirmation"):return false
	ui.inlay_dialog.get_ok_button().pressed.emit()
	await get_tree().process_frame
	return await settle(ui)

func settle(ui: Variant) -> bool:
	var deadline:=Time.get_ticks_msec()+10000
	while ui.profile.is_saving() and Time.get_ticks_msec()<deadline:
		await get_tree().process_frame
	return check(not ui.profile.is_saving(),"save completion")

func _run() -> void:
	var save_root:=OS.get_environment("HWE_VESTIGE_TEST_ROOT").replace("\\","/").trim_suffix("/")+"/"
	var user_dir:=ProjectSettings.globalize_path("user://").replace("\\","/")
	if not check(save_root!="/" and user_dir.begins_with(save_root) and FileAccess.file_exists(save_root+".vestige-test-owner"),"isolated user-data directory: "+user_dir):return
	var ui=Screen.instantiate()
	get_tree().root.add_child(ui)
	await get_tree().process_frame
	if not check(ui.profile.available,"starting profile "+ui.status.text):return
	if not ui.sample_vestiges:ui.vestige_sample_button.pressed.emit()
	await get_tree().process_frame
	var p=ui.profile
	if not check(p.available and p.saved.schemaVersion==3,"v3 sample: "+ui.status.text):return
	var resumed:=OS.get_cmdline_user_args().has("--resume-inlay")
	var uid:int
	if resumed:
		if not check(p.revision==5 and wallet_matches(p.saved.state.vestiges,{"morren":1,"sylph":1,"thal":1}),"reopened satchel"):return
		var it:Dictionary=p.saved.state.equipped.values()[0]
		if not check(it.sockets==["thal","sylph"],"reopened overwrite"):return
		uid=it.uid
	else:
		if not check(p.revision==1 and wallet_matches(p.saved.state.vestiges,{"morren":2,"sylph":2,"thal":2}),"initial satchel "+str([p.revision,p.saved.state.vestiges])):return
		var it:Dictionary=p.saved.state.items[0]
		uid=it.uid
		if not check(it.sockets==[null,null] and ui.inlay_button.is_visible_in_tree(),"socketed pack item"):return
		var random_before:Dictionary=p.saved.random
		var next_before:int=p.saved.nextUid
		var other:=Profile.new()
		if not check(other.start(ui.save_path).ok,"second SQLite reader"):return
		if not choose(ui,"morren",-1):return
		if not check(p.revision==1 and p.saved.state.items[0].sockets==[null,null],"preview is read-only"):return
		if not await confirm(ui):return
		if not check(p.revision==2 and p.saved.state.items[0].sockets==["morren",null],"first empty"):return
		var stale:=other.inlay(uid,1,"thal")
		if not check(not stale.ok and other.revision==2 and other.saved.state.vestiges==p.saved.state.vestiges,"stale writer reloaded both owners"):return
		other.close()
		ui.equip_button.pressed.emit()
		await get_tree().process_frame
		if not await settle(ui):return
		if not check(p.revision==3 and not p.saved.state.equipped.is_empty(),"equip"):return
		ui.tabs.current_tab=3
		ui.render(true)
		if not choose(ui,"sylph",-1):return
		if not check(ui.inlay_preview.text.contains("Held Breath"),"word preview"):return
		if not await confirm(ui):return
		if not check(p.revision==4 and ui.name_label.text.contains("Held Breath"),"awakened worn gear"):return
		if not choose(ui,"thal",-1):return
		if not check(ui.inlay_dialog.get_ok_button().disabled and not p.inlay(uid,4,"thal").ok and p.revision==4,"full refusal"):return
		ui.inlay_socket.select(1)
		ui.inlay_socket.item_selected.emit(1)
		if not check(ui.inlay_preview.text.contains("destroyed"),"explicit overwrite warning"):return
		if not await confirm(ui):return
		if not check(p.revision==5 and wallet_matches(p.saved.state.vestiges,{"morren":1,"sylph":1,"thal":1}) and not ui.name_label.text.contains("Held Breath"),"word lost"):return
		if not check(p.saved.random==random_before and p.saved.nextUid==next_before,"random and identity continuation"):return
		var legacy:=Profile.new()
		if not check(legacy.start("user://vestige-legacy.sqlite3").ok and legacy.saved.schemaVersion==1,"legacy save"):return
		if not check(legacy.grant_vestige("dur",2,legacy.revision).ok and legacy.saved.schemaVersion==3,"upgrade on first grant"):return
		legacy.close()
		if not check(legacy.start("user://vestige-legacy.sqlite3").ok and wallet_matches(legacy.saved.state.vestiges,{"dur":2}),"upgrade reopened"):return
		legacy.close()
	print("HWE_VESTIGE_OK ",JSON.stringify({"resumed":resumed,"revision":p.revision,"uid":uid,"wallet":p.saved.state.vestiges,
		"sockets":p.saved.state.equipped.values()[0].sockets,"database":ProjectSettings.globalize_path(ui.save_path)}))
	ui.queue_free()
	await get_tree().process_frame
	get_tree().quit()
