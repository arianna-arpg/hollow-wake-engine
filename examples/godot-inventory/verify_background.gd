extends Node

const Profile=preload("res://profile.gd")
const Screen=preload("res://inventory.tscn")
var frames:=0
var last_result: Dictionary={}

func _ready() -> void:
	Engine.max_fps=120
	_run.call_deferred()

func check(value: bool, note: String) -> bool:
	if not value:
		printerr("HWE_BACKGROUND_FAILED ",note)
		get_tree().quit(1)
	return value

func settle(ui: Variant) -> bool:
	var deadline:=Time.get_ticks_msec()+10000
	while ui.profile.is_saving() and Time.get_ticks_msec()<deadline:
		frames+=1
		await get_tree().process_frame
	return check(not ui.profile.is_saving(),"UI save completed")

func finish_profile(p: Variant) -> Dictionary:
	var deadline:=Time.get_ticks_msec()+10000
	while Time.get_ticks_msec()<deadline:
		var result: Dictionary=p.poll_save()
		if not result.get("pending",false): return result
		await get_tree().process_frame
	return {"ok":false,"reason":"test-timeout"}

func choose(ui: Variant, id: String, socket: int) -> bool:
	ui.inlay_button.pressed.emit()
	for i in ui.inlay_material.item_count:
		if ui.inlay_material.get_item_metadata(i)==id:
			ui.inlay_material.select(i)
			ui.inlay_socket.select(socket+1)
			ui.inlay_socket.item_selected.emit(socket+1)
			if not check(not ui.inlay_dialog.get_ok_button().disabled,"enabled inlay"):return false
			ui.inlay_dialog.get_ok_button().pressed.emit()
			return true
	return check(false,"material available: "+id)

func _run() -> void:
	var root:=OS.get_environment("HWE_BACKGROUND_TEST_ROOT").replace("\\","/").trim_suffix("/")+"/"
	var user:=ProjectSettings.globalize_path("user://").replace("\\","/")
	if not check(root!="/" and user.begins_with(root) and FileAccess.file_exists(root+".background-save-owner"),"isolated saves"):return
	var ui: Variant=Screen.instantiate()
	ui.sample_vestiges=true
	ui.save_path="user://background-inventory.sqlite3"
	get_tree().root.add_child(ui)
	ui.save_finished.connect(func(reply: Dictionary): last_result=reply)
	await get_tree().process_frame
	var p: Variant=ui.profile
	if not check(p.available,"profile loaded: "+ui.status.text):return
	if OS.get_cmdline_user_args().has("--resume-background"):
		var row:Dictionary=p.store.read_slot(1)
		if not check(row.crafting.sha256_text()==OS.get_environment("HWE_BACKGROUND_EXPECTED_SHA"),"restored document"):return
		if not check(p.saved.state.items.size()==2 and p.saved.state.items.back().baseId=="ring_lapis","restored item owners"):return
		print("HWE_BACKGROUND_PLAYER ",JSON.stringify({"resumed":true,"revision":p.revision,"saveSha256":row.crafting.sha256_text()}))
		ui.queue_free()
		await get_tree().process_frame
		get_tree().quit()
		return
	var before:Dictionary=p.saved
	if not check(p.revision==1 and before.state.items.size()==1,"initial state"):return
	var uid:int=before.state.items[0].uid
	if not choose(ui,"morren",-1):return
	if not check(p.is_saving() and not p.available and p.revision==1 and p.saved==before,"submission retains durable view"):return
	if not check(ui.status.text.begins_with("Saving") and ui.refresh_button.disabled and ui.sample_button.disabled,"pending controls and status"):return
	if not check(p.begin_inlay(uid,1,"thal").reason=="save-pending" and p.reload().reason=="save-pending","bounded profile admission"):return
	if not await settle(ui):return
	if not check(last_result.ok and p.revision==2 and p.saved.state.items[0].sockets==["morren",null] and p.saved.state.vestiges.morren==1,"committed inlay"):return
	if not check(ui.status.text=="Vestige inlaid." and not ui.refresh_button.disabled,"success only after commit"):return
	var other:Variant=HollowWakeSlotStore.new()
	if not check(other.open_file(ProjectSettings.globalize_path(ui.save_path)).ok,"competing handle"):return
	var durable:Dictionary=p.store.read_slot(1)
	var held:Dictionary=other.stage_slot(1,p.revision,durable.crafting,durable.stash)
	if not check(held.ok,"hold competing writer"):return
	before=p.saved
	if not choose(ui,"sylph",-1) or not await settle(ui):return
	if not check(not last_result.ok and last_result.reason=="busy" and p.available and p.saved==before and p.revision==2,"failed write reloads both owners"):return
	if not check(other.cancel_slot(held.token).ok,"release competing writer"):return
	other.close_file()
	if not choose(ui,"sylph",-1) or not await settle(ui):return
	if not check(last_result.ok and p.revision==3 and ui.name_label.text.contains("Held Breath"),"retry awakens item"):return
	var peer:Variant=Profile.new()
	if not check(peer.start(ui.save_path).ok,"stale profile opened"):return
	if not choose(ui,"thal",0) or not await settle(ui):return
	if not check(last_result.ok and p.revision==4,"overwrite committed"):return
	var stale:Dictionary=peer.begin_inlay(uid,peer.revision,"morren",0)
	if not check(stale.get("pending",false),"stale profile queued"):return
	stale=await finish_profile(peer)
	if not check(not stale.ok and stale.reason=="stale-revision" and peer.saved==p.saved and peer.revision==p.revision,"stale completion restores winner"):return
	peer.close()
	before=p.saved
	if not choose(ui,"morren",0):return
	var cancellation:Dictionary=p.cancel_save()
	if not await settle(ui):return
	if cancellation.ok:
		if not check(not last_result.ok and last_result.reason=="cancelled" and p.saved==before,"cancelled proposal discarded"):return
	else:
		if not check(cancellation.reason=="too-late" and last_result.ok,"late cancellation observes commit"):return
	ui.forge.pressed.emit()
	if not check(p.is_saving(),"closing save submitted"):return
	ui._notification(NOTIFICATION_WM_CLOSE_REQUEST)
	if not check(ui._closing and p.is_saving(),"close defers while pending"):return
	var closing:Dictionary=await ui.save_finished
	if not check(closing.ok and p.saved.state.items.size()==2,"closing write committed"):return
	var final:Dictionary=p.store.read_slot(1)
	print("HWE_BACKGROUND_PLAYER ",JSON.stringify({"resumed":false,"revision":p.revision,"frames":frames,
		"cancelAccepted":cancellation.ok,"saveSha256":final.crafting.sha256_text(),"database":ProjectSettings.globalize_path(ui.save_path),
		"queuedViewUnchanged":true,"busyRecovered":true,"staleRecovered":true,"closeWaited":true}))
