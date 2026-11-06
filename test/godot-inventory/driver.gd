extends Node
const Profile = preload("res://profile.gd")

# Only the acceptance project contains this decorator. It suspends the actual
# writer at a known boundary until its parent kills the entire game process.
class PausedStore:
	extends RefCounted
	var inner := HollowWakeSlotStore.new()
	var phase := ""
	var did_stage := false
	var commit_reason := ""
	func barrier(at: String) -> void:
		if phase != at: return
		var marker := FileAccess.open(OS.get_environment("HWE_MARKER"), FileAccess.WRITE)
		marker.store_string(at)
		marker.close()
		var release := OS.get_environment("HWE_RESUME")
		while release == "" or not FileAccess.file_exists(release): OS.delay_msec(20)
	func open_file(filename: String) -> Dictionary: return inner.open_file(filename)
	func read_slot(slot: int) -> Dictionary: return inner.read_slot(slot)
	func stage_slot(slot: int,rev: int,source: String,stash: String) -> Dictionary:
		barrier("before-stage")
		var reply := inner.stage_slot(slot,rev,source,stash)
		did_stage = reply.ok
		if reply.ok: barrier("after-stage")
		return reply
	func commit_slot(token: int) -> Dictionary:
		var reply := inner.commit_slot(token)
		commit_reason = reply.get("reason","")
		if reply.ok: barrier("after-commit")
		return reply
	func close_file() -> void: inner.close_file()

func check(ok: bool, note: String) -> bool:
	if not ok:
		push_error(note)
		get_tree().quit(1)
	return ok

func _ready() -> void:
	var mode := OS.get_environment("HWE_CASE")
	var db := OS.get_environment("HWE_DB")
	if mode == "ui":
		await play_ui()
		return
	if mode == "seed":
		var store := HollowWakeSlotStore.new()
		if not check(store.open_file(db).ok,"open seed database"): return
		var staged := store.stage_slot(1,0,FileAccess.get_file_as_string("res://fixture.json"),"[]")
		if not check(staged.ok and store.commit_slot(staged.token).ok,"seed complete original checkpoint"): return
		store.close_file()
	elif mode == "locks":
		var a := HollowWakeSlotStore.new()
		var b := HollowWakeSlotStore.new()
		if not check(a.open_file(db).ok and b.open_file(db).ok,"two connections"): return
		var original := a.read_slot(1)
		var staged := a.stage_slot(1,original.revision,original.crafting,original.stash)
		if not check(staged.ok and b.read_slot(1) == original,"reader sees committed owners"): return
		if not check(b.stage_slot(1,original.revision,original.crafting,original.stash).get("reason") == "busy","contending writer refused"): return
		if not check(a.commit_slot(staged.token + 1).get("reason") == "invalid-token","wrong token refused"): return
		if not check(a.cancel_slot(staged.token).ok and a.read_slot(1) == original,"cancel releases write lock"): return
		if not check(a.stage_slot(1,original.revision,"x".repeat(524289),"[]").get("reason") == "payload-size","oversize refused"): return
		a.close_file()
		b.close_file()
	else:
		var profile := Profile.new()
		var backend := PausedStore.new()
		var opened := profile.start(db,backend)
		if mode in ["invalid-custody","incompatible-database"]:
			if not check(not opened.ok and opened.reason == mode and not profile.available,"bad save refused without initialization"): return
		else:
			if not check(opened.ok,"restore "+str(opened)): return
			match mode:
				"inspect":
					var source := profile.api.to_portable_json(profile.saved)
					var stash := profile.api.to_portable_json(profile.stash)
					if not check(source.ok and stash.ok,"encode observed owners"): return
					var file := FileAccess.open(OS.get_environment("HWE_RESULT"),FileAccess.WRITE)
					file.store_string('{"revision":%d,"source":%s,"stash":%s}' % [profile.revision,source.text,stash.text])
					file.close()
				"transfer":
					backend.phase = OS.get_environment("HWE_PHASE")
					var moved := profile.act("store",13,profile.revision)
					if not check(moved.ok,"transfer "+str(moved)): return
				"commit-busy":
					var initial := profile.revision
					var refused := profile.act("store",13,initial)
					if not check(backend.did_stage and backend.commit_reason == "busy" and not refused.ok and refused.reason == "busy","commit refused after staging"): return
					if not check(profile.available and profile.revision == initial and profile.stash.is_empty(),"busy commit reloaded durable owners"): return
				"race":
					backend.phase = "before-stage"
					var initial := profile.revision
					var refused := profile.act("store",13,initial)
					if not check(not refused.ok and refused.reason == "stale-revision" and profile.revision == initial+1 and profile.stash.size() == 1,"another process won the revision"): return
				"stale":
					var other := Profile.new()
					if not check(other.start(db).ok,"second profile"): return
					var rev := profile.revision
					if not check(profile.act("store",13,rev).ok,"first writer"): return
					if not check(other.act("store",13,rev).get("reason") == "stale-revision" and other.revision == rev+1,"stale writer reloaded"): return
					if not check(other.stash == profile.stash and other.saved == profile.saved,"same owners after conflict"): return
					other.close()
				"withdraw":
					var rev := profile.revision
					if not check(profile.act("store",13,rev).get("reason") == "missing-item","duplicate delivery refused"): return
					if not check(profile.act("withdraw",13,rev).get("reason") == "pack-full" and profile.revision == rev,"full bag retains stash"): return
					if not check(profile.act("sell",11,rev).get("reason") == "protected-item" and profile.revision == rev,"protected sale preserved"): return
					if not check(profile.act("sell",12,rev).ok and profile.act("withdraw",13,rev+1).ok,"return to freed cell"): return
				"full-stash":
					var rev := profile.revision
					if not check(profile.stash.size() == Profile.STASH_LIMIT and profile.act("store",13,rev).get("reason") == "stash-full","destination capacity checked"): return
					if not check(profile.revision == rev and profile.saved.state.overflow[0].uid == 13,"full destination preserves source"): return
				_: if not check(false,"unknown mode"): return
		profile.close()
	print("HWE_PASS "+mode)
	get_tree().quit()

func click_control(control: Control) -> void:
	var pos := control.get_global_rect().get_center()
	await click_point(pos)

func click_point(pos: Vector2) -> void:
	var motion := InputEventMouseMotion.new()
	motion.position = pos
	get_viewport().push_input(motion,true)
	for down in [true,false]:
		var event := InputEventMouseButton.new()
		event.position = pos
		event.button_index = MOUSE_BUTTON_LEFT
		event.pressed = down
		get_viewport().push_input(event,true)
		await get_tree().process_frame

func press_key(code: Key) -> void:
	for down in [true,false]:
		var event := InputEventKey.new()
		event.keycode = code
		event.pressed = down
		get_viewport().push_input(event,true)
		await get_tree().process_frame

func play_ui() -> void:
	var screen = preload("res://inventory.tscn").instantiate()
	add_child(screen)
	await get_tree().process_frame
	await get_tree().process_frame
	if not check(screen.profile.available and screen.list.item_count == 4,"first-run pack"): return
	if not check(screen.profile.saved.state.items.is_read_only() and screen.profile.saved.state.items[0].is_read_only(),"detached immutable view"): return
	await press_key(KEY_RIGHT)
	if not check(screen.tabs.current_tab == 1 and screen.list.item_count == 1,"directional overflow tab input"): return
	var uid: int = screen.selected_uid
	await click_control(screen.primary)
	if not check(screen.profile.stash.size() == 1 and screen.profile.stash[0].uid == uid and screen.primary.disabled,"store button input"): return
	await click_point(screen.tabs.global_position+screen.tabs.get_tab_rect(2).get_center())
	await click_control(screen.primary)
	if not check(screen.profile.stash.size() == 1 and screen.status.text.contains("full"),"visible full-pack refusal"): return
	await click_point(screen.tabs.global_position+screen.tabs.get_tab_rect(0).get_center())
	await click_control(screen.primary)
	if not check(screen.list.item_count == 3,"sell selected item"): return
	await click_point(screen.tabs.global_position+screen.tabs.get_tab_rect(2).get_center())
	await click_control(screen.primary)
	if not check(screen.profile.stash.is_empty() and screen.profile.saved.state.items.size() == 4,"withdraw button input"): return
	screen.forge.grab_focus()
	await press_key(KEY_ENTER)
	await click_point(screen.tabs.global_position+screen.tabs.get_tab_rect(1).get_center())
	if not check(screen.list.item_count == 1 and screen.name_label.text == screen.profile.saved.state.overflow[0].name,"actual minted name in view"): return
	var screenshot := OS.get_environment("HWE_SCREENSHOT")
	if screenshot != "":
		await RenderingServer.frame_post_draw
		var pixels := get_viewport().get_texture().get_image()
		if not check(pixels != null and pixels.get_width() >= 800 and pixels.save_png(screenshot) == OK,"rendered viewport saved"): return
	print("HWE_PASS ui")
	screen.profile.close()
	get_tree().quit()
