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
	return true

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
	print("HWE_SUPPORT ",JSON.stringify({"db":db,"revision":revision,"uid":first+3,"nextUid":first+4,"cases":evidence.size(),"metrics":metrics}))
	ui.free()
	get_tree().quit()
