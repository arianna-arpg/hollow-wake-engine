extends Node

const Profile = preload("res://profile.gd")
const Screen = preload("res://inventory.tscn")

func _ready() -> void:
	call_deferred("_run")

func check(ok: bool, note: String) -> bool:
	if not ok:
		printerr("Socket check failed: ",note)
		get_tree().quit(1)
	return ok

func select(ui: Variant, tab: int, id: int) -> bool:
	ui.tabs.current_tab=tab
	ui.render()
	for at in ui.list.item_count:
		if ui.list.get_item_metadata(at)==id:
			ui.list.select(at)
			ui.list.item_selected.emit(at)
			return true
	return check(false,"missing selection "+str(id))

func click(button: Button) -> bool:
	await get_tree().process_frame
	var rect:=button.get_global_rect()
	if not check(button.is_visible_in_tree() and not button.disabled and rect.size.y>=44 and get_viewport().get_visible_rect().encloses(rect),"reachable control "+button.text): return false
	var motion:=InputEventMouseMotion.new()
	motion.position=rect.get_center()
	get_viewport().push_input(motion,true)
	for down in [true,false]:
		var event:=InputEventMouseButton.new()
		event.position=motion.position
		event.button_index=MOUSE_BUTTON_LEFT
		event.pressed=down
		get_viewport().push_input(event,true)
		await get_tree().process_frame
	var ui: Node=button
	while ui!=null and ui.get_script()!=preload("res://inventory.gd"): ui=ui.get_parent()
	if ui!=null: return await settle(ui)
	return true

func settle(ui: Variant) -> bool:
	var deadline:=Time.get_ticks_msec()+10000
	while ui.profile.is_saving() and Time.get_ticks_msec()<deadline:
		await get_tree().process_frame
	return check(not ui.profile.is_saving(),"save completion")

func _run() -> void:
	if OS.get_cmdline_user_args().has("--corrupt-page"):
		var isolated:=Profile.new()
		if not check(isolated.start("user://support-corrupt.sqlite3",null,true,true).ok,"new corruption fixture"): return
		var gem: Dictionary=isolated.saved.state.items[2]
		if not check(isolated.act("learn",int(isolated.saved.state.items[1].uid),isolated.revision,3).ok,"prepare target"): return
		var prior: Dictionary=isolated.saved
		var revision:=isolated.revision
		var broken: Dictionary=isolated.act("socket",int(gem.uid),revision,3,"firebolt")
		if not check(not broken.ok and broken.reason=="support-data" and isolated.saved==prior and isolated.revision==revision,"corrupt page preserves save"): return
		isolated.close()
		print("HWE_SUPPORT_CORRUPT")
		get_tree().quit()
		return
	var ui=Screen.instantiate()
	get_tree().root.add_child(ui)
	var old_save: Dictionary=ui.profile.saved
	var old_revision:=int(ui.profile.revision)
	if not await click(ui.sample_button): return
	var p=ui.profile
	if not check(p.available and p.api.support_metrics().pageReads==0,"lazy start"): return
	var fire: Dictionary=p.saved.state.items[1]
	var loose: Dictionary=p.saved.state.items[2]
	var id:=int(loose.uid)
	var first:=int(p.saved.nextUid)
	if not select(ui,0,int(fire.uid)): return
	if not await click(ui.socket_button): return
	if not check(p.saved.nextUid==first+1 and p.saved.state.items[1].gem==fire.gem,"full stored removal consumes only ID"): return
	ui.seat_choice.select(4)
	if not await click(ui.learn_button): return
	if not check(p.saved.state.rack[3].gem==fire.gem and p.saved.state.items.size()==3,"learn sample"): return
	if not select(ui,0,id): return
	if not check(ui.socket_controls.visible and ui.socket_choice.item_count==1,"compatible learned seat"): return
	var queried:=int(p.api.support_metrics().queries)
	if not check(queried>0 and p.compatible_seats(id).rows.is_read_only(),"immutable authoritative fit"): return
	if not await click(ui.socket_button): return
	if not check(p.api.support_metrics().queries==queried,"reuse same-revision fit"): return
	var copy: Dictionary={"supportId":loose.gem.supportId,"level":loose.gem.level,"rolled":loose.gem.rolled,"locked":true}
	if not check(p.saved.state.rack[3].gem.sockets[1]==copy and p.saved.state.items.size()==2,"rolled locked socket"): return
	if not select(ui,4,4): return
	ui.socket_choice.select(1)
	if not await click(ui.socket_button): return
	if not check(p.saved.state.rack[3].gem.sockets[1]==null and p.saved.state.items.back().gem==loose.gem and p.saved.state.items.back().locked,"learned removal"): return
	if not select(ui,0,int(p.saved.state.items.back().uid)): return
	if not await click(ui.socket_button): return
	if not select(ui,4,4): return
	if not await click(ui.primary): return
	var wrapper: Dictionary=p.saved.state.items.back()
	if not check(wrapper.gem.sockets[1]==copy and p.saved.state.rack[3]==null,"support moves with skill"): return
	var peer:=Profile.new()
	if not check(peer.start(ui.save_path).ok,"second writer"): return
	if not select(ui,0,int(wrapper.uid)): return
	ui.socket_choice.select(1)
	if not await click(ui.socket_button): return
	if not check(p.saved.state.items.back().gem==loose.gem and p.saved.state.items.back().locked,"stored removal"): return
	var stale:=peer.act("unsocket",int(wrapper.uid),peer.revision,-1,"firebolt",{"index":1,"supportId":loose.gem.supportId})
	if not check(not stale.ok and stale.reason=="stale-revision" and peer.saved==p.saved,"stale return cannot duplicate support"): return
	peer.close()
	var final_save: Dictionary=p.saved
	if not check(p.reload().ok and p.saved==final_save,"reopen"): return
	var evidence: Variant=JSON.parse_string(FileAccess.get_file_as_string("res://support-cases.json"))
	if not check(evidence is Array,"reference cases"): return
	for course in evidence:
		var rack: Array=[]
		for g in course.bar: rack.append({"gem":g} if g!=null else null)
		var result: Dictionary=p.api.support_fit(rack,course.support)
		if not check(result.ok and result.rows==course.expected,"reference fit "+str(course.support.supportId)): return
	var gate=p.api._fit
	var metrics: Dictionary=p.api.support_metrics()
	var db:=ProjectSettings.globalize_path(ui.save_path)
	var revision:=int(p.revision)
	if not await click(ui.sample_button): return
	if not check(ui.profile.saved==old_save and ui.profile.revision==old_revision,"return to original inventory unchanged"): return
	if not check(metrics.heap.peak_bytes<=8*1024*1024 and gate.metrics().live_bytes==0 and gate.metrics().live_blocks==0,"release support VM"): return
	var pouch: Dictionary=await verify_pouches(ui)
	if pouch.is_empty(): return
	print("HWE_SUPPORT ",JSON.stringify({"db":db,"revision":revision,"uid":first+3,"nextUid":first+4,"cases":evidence.size(),"metrics":metrics,"pouch":pouch}))
	ui.free()
	get_tree().quit()

func verify_pouches(ui: Variant) -> Dictionary:
	ui.save_path="user://recall-course.sqlite3"
	ui.sample_cargo=true
	ui.sample_supports=false
	ui._restart()
	var p=ui.profile
	var pouch: Dictionary=p.saved.state.items[0]
	var uid:=int(pouch.uid)
	var rev:=int(p.revision)
	if not select(ui,0,uid) or not await click(ui.recall_button): return {}
	if not check(ui.recall_dialog.visible and ui.recall_dialog.get_ok_button().disabled and ui.recall_odds.text=="no room to hold what returns","full pouch dialog"): return {}
	ui.recall_dialog.hide()
	if not check(p.revision==rev,"refusal unchanged"): return {}
	if not select(ui,0,int(p.saved.state.items[1].uid)) or not await click(ui.learn_button): return {}
	var peer:=Profile.new()
	if not check(peer.start(ui.save_path).ok,"recall peer"): return {}
	if not select(ui,0,uid) or not await click(ui.recall_button): return {}
	if not check(ui.recall_facet.item_count==4 and ui.recall_group.item_count==2 and ui.recall_dialog.get_ok_button().disabled,"facet requires explicit choice"): return {}
	ui.recall_facet.select(1)
	ui.recall_facet.item_selected.emit(1)
	var facet: String=ui.recall_facet.get_item_metadata(1)
	var group: String=ui._recall_view.groups[0].key
	var ok: Button=ui.recall_dialog.get_ok_button()
	if not check(not ok.disabled,"armed recall"): return {}
	# Submit the focused native dialog button through its usual keyboard path.
	ok.grab_focus()
	var press:=InputEventKey.new()
	press.keycode=KEY_ENTER
	press.pressed=true
	ui.recall_dialog.push_input(press,true)
	var release:=press.duplicate()
	release.pressed=false
	ui.recall_dialog.push_input(release,true)
	await get_tree().process_frame
	if not await settle(ui): return {}
	if not check(p.revision==rev+2 and p.saved.state.items.front().mem.size()==1 and p.saved.state.items.back().has("gem"),"atomic UI recall"): return {}
	var minted: Dictionary=p.saved.state.items.back()
	var stale:=peer.recall(uid,peer.revision,group,facet)
	if not check(not stale.ok and stale.reason=="stale-revision" and peer.saved==p.saved,"stale recall rolls back"): return {}
	peer.close()
	if not select(ui,0,uid) or not await click(ui.recall_button): return {}
	ui.recall_facet.select(2)
	ui.recall_facet.item_selected.emit(2)
	ui.recall_dialog.get_ok_button().pressed.emit()
	await get_tree().process_frame
	if not await settle(ui): return {}
	if not check(p.revision==rev+3 and p.saved.state.items.size()==4 and p._find(p.saved.state.items,uid)==-1,"last unit reuses pouch cell"): return {}
	var final_save: Dictionary=p.saved
	if not check(p.reload().ok and p.saved==final_save and p.saved.state.account.ledger.gemdrops_total==2,"reopened recall receipts"): return {}
	var native_cases: Variant=JSON.parse_string(FileAccess.get_file_as_string("res://pouch-cases.json"))
	for a in native_cases:
		var ledger: Dictionary=a.get("beforeLedger",{})
		var command: Dictionary={"op":"view","level":1,"memory":null,"uid":a.uid,"state":{"items":a.before,"board":{"w":12,"h":8},
			"account":{"ledger":ledger,"features":[],"progression":a.mode!="immortal"}},"sealed":a.mode=="sealed"}
		var view: Dictionary=p.api.pouch_request(command)
		if not check(view.get("view")==a.view,"original recall panel "+a.mode): return {}
		command.op="recall"
		command.group=a.group
		command.nextUid=a.item.uid if a.item!=null else 150000
		if a.has("facet"): command.facet=a.facet
		var move: Dictionary=p.api.pouch_request(command)
		if not check(move.ok==(a.result!=null),"original recall outcome "+a.mode): return {}
		if move.ok and not check(move.result==a.result and move.items.back()==a.item and move.ledger==a.ledger and move.memory.seatLedger==a.seatLedger and move.memory.secondary==a.secondary,"original native mint "+a.mode): return {}
	var runtime=p.api._pouch
	var peak: int=runtime.metrics().peak_bytes
	var old:=p.saved.duplicate(true) as Dictionary
	var retired: Dictionary=pouch.duplicate(true)
	retired.baseId="rough_memory"
	retired.name="Rough Memory"
	retired.mem=[{"d":"crypt_lich","s":22,"g":{"k":"support","id":"retired-cut","l":2}}]
	old.state.items=[retired]
	p.close()
	if not check(runtime.metrics().live_bytes==0 and runtime.metrics().live_blocks==0,"release recall runtime"): return {}
	var fixture:=Profile.new()
	if not check(fixture.start("user://retired-pouch.sqlite3").ok,"retired fixture"): return {}
	var legacy: Dictionary=fixture.store.stage_slot(1,fixture.revision,fixture.api.to_portable_json(old).text,"[]")
	if not check(legacy.ok and fixture.store.commit_slot(legacy.token).ok and fixture.reload().ok,"legacy retired pin is admitted"): return {}
	if not check(fixture.recall(uid,fixture.revision,"crypt_lich|support:retired-cut","").ok and fixture.saved.state.items.size()==1,"retired pin falls back and mints"): return {}
	fixture.close()
	var heaps:=compare_pouch_load(pouch)
	if heaps.is_empty(): return {}
	return {"cases":native_cases.size(),"first":minted.gem,"revision":rev+3,"peakBytes":peak,"closedBytes":0,"loadComparison":heaps}

func compare_pouch_load(pouch: Dictionary) -> Dictionary:
	var dir:="res://addons/hollow_wake/crafting/"
	var code:=FileAccess.get_file_as_bytes(dir+"pouch-rules.txt")
	var encoded:=FileAccess.get_file_as_bytes(dir+"pouch-data.json")
	var objects:=FileAccess.get_file_as_bytes("res://pouch-control.txt")
	var command:={"op":"view","level":10,"memory":null,"uid":pouch.uid,"sealed":false,
		"state":{"items":[pouch],"board":{"w":2,"h":2},"account":{"ledger":{},"features":[],"progression":true}}}
	var wire:=JSON.stringify(["command",command])
	var first_response:=""
	var peaks:={"objects":[],"text":[]}
	for use_text in [false,true,true,false]:
		var host:=HollowWakeHost.new()
		if not check(host.initialize(code,encoded if use_text else objects,12*1024*1024)==0,"matched content load"): return {}
		var reply:=host.submit_json(wire) as Dictionary
		if not check(reply.status==0 and JSON.parse_string(reply.response).get("ok")==true,"matched load query"): return {}
		if first_response.is_empty(): first_response=reply.response
		if not check(reply.response==first_response,"matched load panel"): return {}
		peaks["text" if use_text else "objects"].append(host.get_metrics().peak_bytes)
		host.close()
		if not check(host.get_metrics().live_bytes==0,"matched load cleanup"): return {}
	return peaks
