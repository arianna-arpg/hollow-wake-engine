extends SceneTree

const Profile = preload("res://profile.gd")
const Screen = preload("res://inventory.tscn")

func _initialize() -> void:
	call_deferred("_run")

func check(value: bool, label: String) -> bool:
	if not value:
		printerr("Rack check failed: ",label)
		quit(1)
	return value

func _run() -> void:
	var legacy = Profile.Crafting.new()
	if not check(legacy.start()==0,"start native replay"): return
	var course := FileAccess.open("res://legacy-course.txt",FileAccess.READ)
	var observed := FileAccess.open("user://rack-replies.jsonl",FileAccess.WRITE)
	var rows := 0
	while course.get_position() < course.get_length():
		var request: Dictionary = legacy.from_portable_json(course.get_line())
		var expected: Dictionary = legacy.from_portable_json(course.get_line())
		if not check(request.ok and expected.ok,"decode row %d" % rows): return
		var actual: Dictionary = legacy.request(request.value)
		if not check(actual==expected.value,"legacy row %d (%s)" % [rows,request.value.op]):
			printerr("Received: ",str(actual).left(320))
			return
		var encoded: Dictionary = legacy.to_portable_json(actual)
		if not check(encoded.ok,"encode legacy reply"): return
		observed.store_line(encoded.text)
		rows += 1
	course.close()
	observed.close()
	if not check(rows==56,"complete legacy replay"): return
	var loadouts: Dictionary = legacy.from_portable_json(FileAccess.get_file_as_string("res://gear-cases.json"))
	if not check(loadouts.ok,"decode gear corpus"): return
	observed = FileAccess.open("user://gear-replies.jsonl",FileAccess.WRITE)
	for input in loadouts.value:
		var card: Dictionary = legacy.inspect_loadout(input.item,input.equipped,int(input.heroLevel),"full")
		if not check(card.ok,"inspect equipped gear"): return
		var result: Dictionary = legacy.to_portable_json({"title":card.title,"color":card.description.color,"targets":card.targets,
			"requirement":card.requirement,"levelMet":card.levelMet,"rarityLabel":card.rarityLabel})
		if not check(result.ok,"encode gear card"): return
		observed.store_line(result.text)
	observed.close()
	legacy.close()
	var peak := int(legacy.metrics().peak_bytes)
	if not check(legacy.metrics().live_bytes==0,"release legacy replay"): return
	var ui = Screen.instantiate()
	root.add_child(ui)
	var p = ui.profile
	if not check(p.available and p.saved.schemaVersion == 1,"legacy sample"): return
	var fire: Dictionary = p.saved.state.items[1]
	var initial_uid := int(p.saved.nextUid)
	var denied: Dictionary = p.api.skill_requirements(fire,{})
	if not check(denied.ok and not denied.meets,"original attribute gate"): return
	ui.list.select(1)
	ui.list.item_selected.emit(1)
	if not check(ui.learn_controls.visible,"learn control"): return
	ui.seat_choice.select(5)
	ui.learn_button.pressed.emit()
	if not check(p.saved.schemaVersion == 2 and p.saved.state.rack[4].gem == fire.gem,"learn with UI"): return
	ui.tabs.current_tab = 4
	ui.list.select(4)
	ui.list.item_selected.emit(4)
	if not check(ui.list.item_count == 8 and not ui.primary.disabled and ui.name_label.text.contains("Firebolt"),"inspect seat"): return
	if not check(p.act("forge",0,p.revision).ok,"fill the pack"): return
	var before := int(p.revision)
	var refused: Dictionary = p.act("unlearn",0,before,4,"firebolt")
	if not check(not refused.ok and refused.reason=="no room in the bag" and p.revision==before+1 and p.saved.nextUid==initial_uid+2,"commit refused UID"): return
	var peer := Profile.new()
	if not check(peer.start(ui.save_path).ok,"second connection"): return
	if not check(peer.saved==p.saved and peer.revision==p.revision,"reopen full bag"): return
	if not check(peer.act("sell",initial_uid,peer.revision).ok,"peer frees one cell"): return
	var stale: Dictionary = p.act("unlearn",0,p.revision,4,"firebolt")
	if not check(not stale.ok and stale.reason=="stale-revision" and p.saved==peer.saved,"stale write reloads winner"): return
	peer.close()
	peak = maxi(peak,int(peer.api.metrics().peak_bytes))
	if not check(peer.api.metrics().live_bytes==0,"release peer"): return
	ui.render(true)
	ui.list.select(4)
	ui.list.item_selected.emit(4)
	ui.primary.pressed.emit()
	if not check(p.saved.state.rack[4] == null and p.saved.state.items.back().gem == fire.gem,"return through UI"): return
	if not check(p.saved.state.items.back().uid==initial_uid+2 and p.saved.nextUid==initial_uid+3,"identity continuation"): return
	var accepted: Dictionary = p.saved
	var rev := int(p.revision)
	ui.refresh_button.pressed.emit()
	peak = maxi(peak,int(p.api.metrics().peak_bytes))
	if not check(ui.profile.revision==rev and ui.profile.saved==accepted and ui.profile.stash.is_empty(),"durable reload"): return
	var db := ProjectSettings.globalize_path(ui.save_path)
	var metrics: Dictionary = ui.profile.api.metrics()
	ui.profile.close()
	var released: Dictionary = ui.profile.api.metrics()
	if not check(metrics.peak_bytes<=32*1024*1024 and released.live_bytes==0 and released.live_blocks==0,"native heap"): return
	print("HWE_RACK ",JSON.stringify({"db":db,"revision":rev,"nextUid":initial_uid+3,"minted":initial_uid+2,"peak":maxi(peak,int(metrics.peak_bytes))}))
	ui.free()
	quit()
