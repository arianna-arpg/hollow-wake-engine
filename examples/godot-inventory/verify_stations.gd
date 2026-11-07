extends Node

const Profile=preload("res://profile.gd")
const Crafting=preload("res://addons/hollow_wake/crafting/crafting.gd")
const Screen=preload("res://inventory.tscn")
var assertions:=0
var last_result:Dictionary={}

func _ready() -> void:
	Engine.max_fps=120
	get_tree().create_timer(30.0).timeout.connect(func():check(false,"course watchdog"))
	_run.call_deferred()

func check(value: bool, note: String) -> bool:
	assertions+=1
	if not value:
		printerr("HWE_STATIONS_FAILED ",note)
		get_tree().quit(1)
	return value

func settle(ui: Variant) -> bool:
	var deadline:=Time.get_ticks_msec()+10000
	while ui.profile.is_saving() and Time.get_ticks_msec()<deadline:
		await get_tree().process_frame
	return check(not ui.profile.is_saving(),"save completed")

func finish(p: Variant) -> Dictionary:
	var deadline:=Time.get_ticks_msec()+10000
	while Time.get_ticks_msec()<deadline:
		var reply:Dictionary=p.poll_save()
		if not reply.get("pending",false):return reply
		await get_tree().process_frame
	return {"ok":false,"reason":"test-timeout"}

func seed_slot(filename: String, source: String) -> bool:
	var store:Variant=HollowWakeSlotStore.new()
	if not check(store.open_file(ProjectSettings.globalize_path(filename)).ok,"fixture store open"):return false
	var staged:Dictionary=store.stage_slot(1,0,source,"[]")
	if not check(staged.ok,"fixture staged once"):return false
	var committed:Dictionary=store.commit_slot(staged.token)
	store.close_file()
	return check(committed.ok,"fixture committed")

func open_station(ui: Variant, uid: int, action: int) -> bool:
	ui.selected_uid=uid
	ui.tabs.current_tab=0
	ui.render()
	if not check(ui.station_button.visible,"station entry visible"):return false
	ui.station_button.pressed.emit()
	if not check(ui.station_dialog._item.get("uid",0)==uid,"station selected item: "+JSON.stringify({"wanted":uid,"actual":ui.station_dialog._item,"available":ui.profile.available,"revision":ui.displayed_revision})):return false
	ui.station_dialog.action_choice.select(action)
	ui.station_dialog.action_choice.item_selected.emit(action)
	return check(ui.station_dialog.visible,"station dialog open")

func submit(ui: Variant) -> bool:
	if not check(not ui.station_dialog.get_ok_button().disabled,"station action enabled: "+ui.station_dialog.preview.text+" "+JSON.stringify({"uid":ui.selected_uid,"quote":ui.station_dialog._quote,"selected":ui.station_dialog.choices.selected,"access":ui.profile.station_access,"item":ui.station_dialog._item,"fresh":ui.profile.station_view(ui.selected_uid,ui.profile.revision)})):return false
	ui.station_dialog.get_ok_button().pressed.emit()
	return check(ui.profile.is_saving(),"station action queued")

func _run() -> void:
	var root:=OS.get_environment("HWE_BACKGROUND_TEST_ROOT").replace("\\","/").trim_suffix("/")+"/"
	var user:=ProjectSettings.globalize_path("user://").replace("\\","/")
	if not check(root!="/" and user.begins_with(root) and FileAccess.file_exists(root+".background-save-owner"),"isolated saves"):return
	var path:="user://station-course.sqlite3"
	var fixture:Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://station-cases.json"))
	var expected:Dictionary=fixture.expected
	var resumed:=OS.get_cmdline_user_args().has("--resume-stations")
	if not resumed:
		var api:=Crafting.new()
		if not check(api.start()==0,"native session started"):return
		var opened:=api.open_profile(1,17,fixture.input)
		if not check(opened.ok,"original fixture admitted: "+JSON.stringify(opened)):return
		var source:=api.snapshot_text(1)
		api.close()
		if not check(source.ok,"fixture encoded") or not seed_slot(path,source.text):return
	var ui:Variant=Screen.instantiate()
	ui.save_path=path
	get_tree().root.add_child(ui)
	ui.save_finished.connect(func(reply:Dictionary):last_result=reply)
	await get_tree().process_frame
	var p:Variant=ui.profile
	if not check(p.available,"profile loaded: "+ui.status.text):return
	if resumed:
		var row:Dictionary=p.store.read_slot(1)
		if not check(row.crafting.sha256_text()==OS.get_environment("HWE_STATION_EXPECTED_SHA"),"exact continuation reopened"):return
		print("HWE_STATIONS ",JSON.stringify({"resumed":true,"revision":p.revision,"assertions":assertions,"saveSha256":row.crafting.sha256_text()}))
		ui.queue_free()
		await get_tree().process_frame
		get_tree().quit()
		return
	# Original salvage fixture teaches life rank one and pays exactly five glimmering.
	if not open_station(ui,37,3) or not submit(ui):return
	var before:Dictionary=p.saved
	if not check(p.revision==1 and p.saved.state.items.size()==5 and ui.station_button.disabled,"durable view retained while queued"):return
	ui.station_dialog._confirm()
	if not await settle(ui):return
	if not check(last_result.ok and p.revision==2 and p.saved.state.items.size()==4,"one salvage commit despite duplicate confirm"):return
	if not check(p.saved.state.essences==expected.salvageWallet and p.saved.state.account.craftLore==expected.salvageLore and p.saved.state.account.ledger==expected.ledger,"original salvage payment and expertise"):return
	if not open_station(ui,1,0):return
	if not check(ui.station_dialog.choices.item_count==1 and ui.station_dialog.choices.get_item_metadata(0).id==expected.affixId and ui.station_dialog.choices.get_item_metadata(0).cost==expected.craftCost,"learned craft and original quote"):return
	if not check(ui.station_dialog.previous.disabled and ui.station_dialog.next.disabled,"bounded single option page"):return
	var capture:=OS.get_environment("HWE_STATION_SCREENSHOT")
	if not capture.is_empty():
		if not check(capture.replace("\\","/").begins_with(root),"owned screenshot"):return
		await RenderingServer.frame_post_draw
		if not check(get_viewport().get_texture().get_image().save_png(capture)==OK,"station screenshot"):return
	before=p.saved
	if not submit(ui) or not await settle(ui):return
	if not check(last_result.ok and p.saved.state.items[0].affixes[0].crafted and p.saved.state.items[0].affixes[0].id==expected.affixId and p.saved.state.essences.glimmering==before.state.essences.glimmering-expected.craftCost.count,"paid crafted affix"):return
	if not open_station(ui,1,2):return
	if not check(ui.station_dialog.choices.is_item_disabled(0) and ui.station_dialog.get_ok_button().disabled,"crafted affix protected in dialog"):return
	ui.station_dialog.hide()
	var refused:Dictionary=p.begin_station("reroll-affix",1,p.revision,"",0)
	if not check(not refused.ok and refused.reason=="reroll-crafted" and not p.is_saving(),"crafted affix protected by authority"):return
	if not open_station(ui,1,1):return
	if not check(ui.station_dialog.get_ok_button().disabled,"crafting capacity shared with sockets"):return
	ui.station_dialog.hide()
	if not open_station(ui,2,1):return
	if not check(ui.station_dialog._quote.socket.cost==expected.socketCost,"original socket quote"):return
	before=p.saved
	if not submit(ui) or not await settle(ui):return
	if not check(last_result.ok and p.saved.state.items[1].sockets==[null] and p.saved.state.items[1].craftedSockets==1 and p.saved.state.essences.brilliant==before.state.essences.brilliant-expected.socketCost.count,"paid socket"):return
	if not open_station(ui,39,2):return
	if not check(ui.station_dialog.get_ok_button().disabled,"locked affix protected"):return
	ui.station_dialog.hide()
	if not open_station(ui,38,2):return
	if not check(ui.station_dialog._quote.reroll.cost==expected.rerollCost,"original reroll quote"):return
	# Access is authoritative at confirmation, even after an enabled quote.
	p.station_access.oracle=false
	ui.station_dialog.get_ok_button().pressed.emit()
	if not check(not p.is_saving() and ui.status.text==ui.error_text("station-unavailable"),"revoked access refused"):return
	p.station_access.oracle=true
	refused=p.begin_station("reroll-affix",38,p.revision-1,"",0)
	if not check(not refused.ok and refused.reason=="stale-revision","stale displayed revision refused"):return
	# A blocked durable write restores the exact RNG and wallet; retry is explicit.
	var other:Variant=HollowWakeSlotStore.new()
	if not check(other.open_file(ProjectSettings.globalize_path(path)).ok,"competing handle"):return
	var durable:Dictionary=p.store.read_slot(1)
	var held:Dictionary=other.stage_slot(1,p.revision,durable.crafting,durable.stash)
	if not check(held.ok,"hold competing writer"):return
	before=p.saved
	if not open_station(ui,38,2) or not submit(ui) or not await settle(ui):return
	if not check(not last_result.ok and last_result.reason=="busy" and p.saved==before and p.store.read_slot(1).crafting==durable.crafting and p.api.snapshot_text(1).text==durable.crafting,"failed save restores exact continuation"):return
	if not check(other.cancel_slot(held.token).ok,"release writer"):return
	other.close_file()
	if not open_station(ui,38,2) or not submit(ui) or not await settle(ui):return
	if not check(last_result.ok and p.saved.state.items[2].affixes[0].locked and p.saved.state.items[2].affixes!=before.state.items[2].affixes and p.saved.state.essences.glimmering==before.state.essences.glimmering-expected.rerollCost.count and p.saved.random.draws>before.random.draws,"paid natural reroll becomes protected"):return
	# Insufficient payment still consumes the original pre-payment random roll.
	var poor:Dictionary=before.duplicate(true)
	for key in poor.state.essences:poor.state.essences[key]=0
	var encoded:Dictionary=p.api.to_portable_json(poor)
	var poor_path:="user://station-poor.sqlite3"
	if not check(encoded.ok,"poor fixture encoded") or not seed_slot(poor_path,encoded.text):return
	var unpaid:Variant=Profile.new()
	if not check(unpaid.start(poor_path).ok,"unpaid profile loaded"):return
	var unpaid_before:Dictionary=unpaid.saved
	if not check(unpaid.api.snapshot_text(1).text==encoded.text,"unpaid fixture restored exactly"):return
	var pending:Dictionary=unpaid.begin_station("reroll-affix",38,unpaid.revision,"",0)
	if not check(pending.get("pending",false) and unpaid.saved==unpaid_before,"unpaid random continuation queued"):return
	var done:Dictionary=await finish(unpaid)
	if not check(not done.ok and done.reason=="insufficient-materials" and unpaid.revision==2 and unpaid.saved.state==unpaid_before.state and unpaid.saved.random.draws>unpaid_before.random.draws,"unpaid refusal persisted without item or wallet mutation"):return
	var poor_text:String=unpaid.store.read_slot(1).crafting
	unpaid.close()
	if not check(unpaid.start(poor_path).ok and unpaid.store.read_slot(1).crafting==poor_text and unpaid.api.snapshot_text(1).text==poor_text,"unpaid continuation reopened exactly"):return
	unpaid.close()
	var final:Dictionary=p.store.read_slot(1)
	print("HWE_STATIONS ",JSON.stringify({"resumed":false,"revision":p.revision,"assertions":assertions,"saveSha256":final.crafting.sha256_text(),"database":ProjectSettings.globalize_path(path),"unpaidSha256":poor_text.sha256_text(),"unpaidPersisted":true,"busyRestored":true,"originalPrices":true}))
	ui.queue_free()
	await get_tree().process_frame
	get_tree().quit()
