extends Node
const Profile = preload("res://profile.gd")
var _screen: Variant

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
	func open_file(filename: String) -> Dictionary:
		if (OS.get_environment("HWE_CASE") == "commit-busy" or OS.get_environment("HWE_PRESERVE_JOURNAL") == "1") and inner.has_method("checkpoint"):
			return inner.open_file(filename,"preserve")
		return inner.open_file(filename)
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
	if mode == "loadout":
		await play_loadout(db)
		return
	if mode == "cargo-ui":
		await play_cargo(db)
		return
	if mode == "cargo-corrupt":
		var cargo_profile := Profile.new()
		if not check(cargo_profile.start(db,null,true).ok,"open sample with damaged display page"): return
		var original: Dictionary = cargo_profile.store.read_slot(1)
		var bad := cargo_profile.api.inspect_cargo(cargo_profile.saved.state.items[1])
		if not check(not bad.ok and bad.reason == "invalid-cargo-page","reject corrupt Firebolt page"): return
		var good := cargo_profile.api.inspect_cargo(cargo_profile.saved.state.items[3])
		if not check(good.ok and good.card.kind == "memory" and original == cargo_profile.store.read_slot(1),"other pages and save survive damage"): return
		cargo_profile.close()
		print("HWE_PASS cargo-corrupt")
		get_tree().quit()
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
	await settle()

func press_key(code: Key) -> void:
	for down in [true,false]:
		var event := InputEventKey.new()
		event.keycode = code
		event.pressed = down
		get_viewport().push_input(event,true)
		await get_tree().process_frame
	await settle()

func settle() -> void:
	var deadline:=Time.get_ticks_msec()+10000
	while is_instance_valid(_screen) and _screen.profile.is_saving() and Time.get_ticks_msec()<deadline:
		await get_tree().process_frame
	check(not is_instance_valid(_screen) or not _screen.profile.is_saving(),"UI save completion")

func play_loadout(filename: String) -> void:
	var screen = preload("res://inventory.tscn").instantiate()
	_screen=screen
	screen.save_path = filename
	add_child(screen)
	await get_tree().process_frame
	if not check(screen.profile.available and screen.equip_button.visible,"new workshop offers equip"): return
	var api = screen.profile.api
	var original: Dictionary = screen.profile.store.read_slot(1)
	var fixture: Dictionary = api.from_portable_json(FileAccess.get_file_as_string("res://loadout-cases.json"))
	if not check(fixture.ok,"decode original loadout observations"): return
	var output := FileAccess.open(OS.get_environment("HWE_RESULT"),FileAccess.WRITE)
	for row in fixture.value:
		var input: Dictionary = row.input
		var card: Dictionary = api.inspect_loadout(input.item,input.equipped,int(input.heroLevel),"full")
		if not check(card.ok,"loadout card "+row.label): return
		var compact: Dictionary = api.inspect_loadout(input.item,input.equipped,int(input.heroLevel),"compact")
		if not check(compact.ok and compact.targets.is_empty() and compact.hasComparison == card.hasComparison,"compact mode "+row.label): return
		var result: Dictionary = api.to_portable_json({"label":row.label,"targets":card.targets,"title":card.title,
			"requirement":card.requirement,"levelMet":card.levelMet,"rarityLabel":card.rarityLabel})
		if not check(result.ok,"encode loadout card"): return
		output.store_line(result.text)
	output.close()
	if not check(original == screen.profile.store.read_slot(1),"viewing gear never writes storage"): return
	var start: Dictionary = screen.profile.saved
	await click_control(screen.equip_button)
	if not check(screen.profile.saved.state.equipped.has("ring1"),"equip first ring by pointer"): return
	screen.render(true)
	if not check(screen.compare_button.visible,"left ring comparison offered"): return
	await click_control(screen.compare_button)
	if not check(screen.properties.text.contains("vs Left Ring:"),"expanded left ring comparison"): return
	await click_control(screen.equip_button)
	screen.render(true)
	if not check(screen.profile.saved.state.equipped.has("ring2"),"second ring prefers empty right hand"): return
	if not check(screen.properties.text.find("vs Left Ring:") >= 0 and screen.properties.text.find("vs Right Ring:") > screen.properties.text.find("vs Left Ring:"),"two ordered ring sections"): return
	var prior_rev: int = screen.profile.revision
	var uid: int = screen.selected_uid
	var stale: Dictionary = screen.profile.act("equip",uid,prior_rev-1)
	if not check(stale.get("reason") == "stale-revision" and screen.profile.revision == prior_rev,"refuse stale equip"): return
	screen.tabs.current_tab = 3
	screen.render(true)
	if not check(not screen.compare_button.visible and screen.primary.text == "Unequip to pack","worn card actions"): return
	await click_control(screen.primary)
	if not check(screen.profile.revision == prior_rev+1 and screen.profile.saved.state.equipped.size() == 1,"unequip stores bag ownership"): return
	var final: Dictionary = screen.profile.saved
	if not check(start.random == final.random and start.nextUid == final.nextUid and screen.profile.reload().ok and final == screen.profile.saved,"reload preserves custody and continuation"): return
	screen.profile.close()
	var metrics := FileAccess.open(OS.get_environment("HWE_RESULT")+".metrics",FileAccess.WRITE)
	metrics.store_string(JSON.stringify(api.metrics()))
	metrics.close()
	print("HWE_PASS loadout")
	get_tree().quit()

func play_cargo(filename: String) -> void:
	var screen = preload("res://inventory.tscn").instantiate()
	_screen=screen
	screen.save_path = filename
	screen.sample_cargo = true
	add_child(screen)
	await get_tree().process_frame
	await get_tree().process_frame
	if not check(screen.profile.available and screen.list.item_count == 4,"first-run cargo sample"): return
	if not check(screen.name_label.text == "Preformed Memory" and screen.properties.text.contains("×2 held"),"selected pouch card"): return
	var backend = screen.profile.api
	var before: Dictionary = backend.snapshot(1)
	var durable: Dictionary = screen.profile.store.read_slot(1)
	var cache_results := {}
	if not check(not backend.set_cargo_page_limit(0) and not backend.set_cargo_page_limit(5),"bounded display cache options"): return
	for limit in [1,4]:
		if not check(backend.set_cargo_page_limit(limit),"configure display cache"): return
		for item in screen.profile.saved.state.items:
			if not check(backend.inspect_cargo(item).ok,"warm sample pages"): return
		var warm: Dictionary = backend.cargo_cache_info()
		for item in screen.profile.saved.state.items:
			if not check(backend.inspect_cargo(item).ok,"repeat sample pages"): return
		var end: Dictionary = backend.cargo_cache_info()
		cache_results[str(limit)] = {"reads":int(end.pageReads)-int(warm.pageReads),"pages":end.retainedPages,"sourceBytes":end.sourceBytes}
		if not check(end.retainedPages <= limit and end.sourceBytes <= limit*32768,"cache bound"): return
	if not check(cache_results["1"].reads > 0 and cache_results["4"].reads == 0,"four sample pages reused without another read"): return
	var loaded: Dictionary = backend.from_portable_json(FileAccess.get_file_as_string("res://inspection-loaded.json"))
	if not check(loaded.ok and backend.restore_profile(2,loaded.value).ok,"loaded profile beside cargo cards"): return
	var parsed: Dictionary = backend.from_portable_json(FileAccess.get_file_as_string("res://cargo-cases.json"))
	if not check(parsed.ok,"original cargo fixtures"): return
	var output := FileAccess.open(OS.get_environment("HWE_RESULT"),FileAccess.WRITE)
	for sample in parsed.value:
		var reply: Dictionary = backend.inspect_cargo(sample.item,sample.view,sample.fit)
		var encoded: Dictionary = backend.to_portable_json({"label":sample.label,"reply":reply})
		if not check(encoded.ok,"encode native cargo card"): return
		output.store_line(encoded.text)
	output.close()
	if not check(before == backend.snapshot(1) and backend.snapshot(2).save == loaded.value and durable == screen.profile.store.read_slot(1),"cargo reads keep snapshots and SQL revision"): return
	if not check(backend.close_profile(2).ok,"release loaded profile"): return
	screen.list.grab_focus()
	await press_key(KEY_DOWN)
	if not check(screen.name_label.text == "Firebolt II Lv 20" and screen.properties.text.contains("Socketed: Multistrike L2"),"selected skill card attunement"): return
	await press_key(KEY_DOWN)
	if not check(screen.name_label.text.begins_with("Multistrike Lv") and screen.properties.text.contains("◈") and screen.properties.text.contains("No equipped skills."),"selected support card and cut"): return
	var screenshot := OS.get_environment("HWE_SCREENSHOT")
	if screenshot != "":
		await RenderingServer.frame_post_draw
		var pixels := get_viewport().get_texture().get_image()
		if not check(pixels != null and pixels.save_png(screenshot) == OK,"render cargo sample"): return
	await press_key(KEY_UP)
	await press_key(KEY_UP)
	await click_control(screen.primary)
	if not check(screen.sale_confirmation.visible and screen.sale_question.text.contains("entire stack") and screen.profile.revision == 1,"whole-stack confirmation precedes payment"): return
	await press_key(KEY_ENTER)
	if not check(not screen.sale_confirmation.visible and durable == screen.profile.store.read_slot(1),"cancel keeps exact owners"): return
	await click_control(screen.primary)
	var competitor := Profile.new()
	if not check(competitor.start(filename).ok and competitor.act("forge",0,1).ok,"competing revision"): return
	competitor.close()
	await click_control(screen.sell_stack)
	if not check(screen.profile.revision == 2 and screen.profile.saved.state.items.size() == 4 and screen.profile.saved.state.essences.is_empty(),"stale confirmation cannot sell"): return
	await click_control(screen.primary)
	if not check(screen.sale_confirmation.visible,"fresh quote after conflict"): return
	await click_control(screen.sell_stack)
	if not check(screen.profile.revision == 3 and screen.profile.saved.state.items.size() == 3,"single accepted sale"): return
	screen.profile.close()
	var released: Dictionary = backend.cargo_cache_info()
	if not check(released.retainedPages == 0 and released.sourceBytes == 0,"close releases Godot-owned display pages"): return
	var metrics := FileAccess.open(OS.get_environment("HWE_RESULT")+".metrics",FileAccess.WRITE)
	metrics.store_string(JSON.stringify({"heap":backend.metrics(),"cache":cache_results,"afterClose":released}))
	metrics.close()
	print("HWE_PASS cargo-ui")
	get_tree().quit()

func play_ui() -> void:
	var screen = preload("res://inventory.tscn").instantiate()
	_screen=screen
	add_child(screen)
	await get_tree().process_frame
	await get_tree().process_frame
	if not check(screen.profile.available and screen.list.item_count == 4,"first-run pack"): return
	if not check(screen.profile.saved.state.items.is_read_only() and screen.profile.saved.state.items[0].is_read_only(),"detached immutable view"): return
	var before: Dictionary = screen.profile.api.snapshot(1)
	var slot: Dictionary = screen.profile.store.read_slot(1)
	var source_text := FileAccess.get_file_as_string("res://inspection-fixtures.json")
	var loaded: Dictionary = screen.profile.api.from_portable_json(FileAccess.get_file_as_string("res://inspection-loaded.json"))
	if not check(loaded.ok and screen.profile.api.restore_profile(2,loaded.value).ok,"second loaded profile during card reads"): return
	var parsed: Dictionary = screen.profile.api.from_portable_json(source_text)
	if not check(parsed.ok,"decode original inspection cases"): return
	for sample in parsed.value:
		var observed: Dictionary = screen.profile.api.inspect_item(sample.item)
		if not check(observed.get("ok",false),"equipment inspection "+str(observed)): return
		observed.erase("ok")
		if not check(observed == sample.observation,"original card "+sample.label): return
		var comparison: Dictionary = screen.profile.api.compare_items(sample.item,sample.worn)
		if not check(comparison.get("rows") == sample.comparison,"original comparison "+sample.label): return
		screen.show_item(sample.item)
		for row in sample.observation.description.affix:
			if not check(screen.properties.text.contains(row.tag + "   " + row.text),"visible rolled affix"): return
		for proc in sample.observation.procReferences:
			if not check(screen.properties.text.contains(proc.text),"visible triggered effect"): return
	var bad: Dictionary = screen.profile.api.inspect_item({"name":"bad"})
	if not check(not bad.ok and before == screen.profile.api.snapshot(1) and slot == screen.profile.store.read_slot(1),"inspection preserves SQL revision, saved items, RNG and next UID"): return
	if not check(screen.profile.api.snapshot(2).save == loaded.value and screen.profile.api.close_profile(2).ok,"large profile unaffected"): return
	screen.details()
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
	var minted: Dictionary = screen.profile.api.inspect_item(screen.profile.saved.state.overflow[0])
	if not check(minted.ok and screen.properties.text.contains(minted.description.reqLine),"rendered selected ring level requirement"): return
	var scroll_verified := false
	# The dummy display can lay out the complete card with no scroll range.
	# A rendered run must exercise both directions. Record which path ran.
	var scrollbar: VScrollBar = screen.detail_scroll.get_v_scroll_bar()
	var has_overflow: bool = scrollbar.max_value > scrollbar.page
	if has_overflow or DisplayServer.get_name() != "headless":
		screen.detail_scroll.grab_focus()
		await press_key(KEY_PAGEDOWN)
		if not check(screen.detail_scroll.scroll_vertical > 0,"keyboard scroll (max=%s, page=%s, focus=%s)" % [scrollbar.max_value,scrollbar.page,screen.detail_scroll.has_focus()]): return
		await press_key(KEY_PAGEUP)
		if not check(screen.detail_scroll.scroll_vertical == 0,"keyboard returns to card header"): return
		scroll_verified = true
	var screenshot := OS.get_environment("HWE_SCREENSHOT")
	if screenshot != "":
		await RenderingServer.frame_post_draw
		var pixels := get_viewport().get_texture().get_image()
		if not check(pixels != null and pixels.get_width() >= 800 and pixels.save_png(screenshot) == OK,"rendered viewport saved"): return
	print("HWE_PASS ui")
	screen.profile.close()
	var metrics_file := FileAccess.open("user://inspection-metrics.json", FileAccess.WRITE)
	metrics_file.store_string(JSON.stringify({"heap":screen.profile.api.metrics(),"keyboardScroll":scroll_verified,"scrollMax":scrollbar.max_value,"scrollPage":scrollbar.page}))
	metrics_file.close()
	get_tree().quit()
