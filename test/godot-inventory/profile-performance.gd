extends Node

const Screen=preload("res://inventory.tscn")
var active:=false
var frames:Array[int]=[]
var previous_frame:=0

class TimedStore:
	extends RefCounted
	var inner:Object
	var call_us:=0
	func _init(value:Object)->void:inner=value
	func open_file(file:String)->Dictionary:return inner.open_file(file)
	func close_file()->void:inner.close_file()
	func read_slot(slot:int)->Dictionary:return inner.read_slot(slot)
	func stage_slot(slot:int,revision:int,body:String,stash:String)->Dictionary:
		var start:=Time.get_ticks_usec()
		var reply:Dictionary=inner.stage_slot(slot,revision,body,stash)
		call_us+=Time.get_ticks_usec()-start
		return reply
	func commit_slot(token:int)->Dictionary:
		var start:=Time.get_ticks_usec()
		var reply:Dictionary=inner.commit_slot(token)
		call_us+=Time.get_ticks_usec()-start
		return reply
	func save_slot_async(slot:int,revision:int,body:String,stash:String)->Dictionary:
		var start:=Time.get_ticks_usec()
		var reply:Dictionary=inner.save_slot_async(slot,revision,body,stash)
		call_us+=Time.get_ticks_usec()-start
		return reply
	func poll_save(ticket:int)->Dictionary:
		var start:=Time.get_ticks_usec()
		var reply:Dictionary=inner.poll_save(ticket)
		call_us+=Time.get_ticks_usec()-start
		return reply
	func cancel_save(ticket:int)->Dictionary:return inner.cancel_save(ticket)

func _ready()->void:
	Engine.max_fps=120
	get_tree().process_frame.connect(func():
		var now:=Time.get_ticks_usec()
		if active and previous_frame!=0:frames.append(now-previous_frame)
		previous_frame=now)
	_run.call_deferred()

func check(value:bool,note:String)->bool:
	if not value:
		printerr("HWE_PROFILE_FAILED ",note)
		get_tree().quit(1)
	return value

func select(ui:Variant,tab:int,uid:int)->bool:
	ui.tabs.current_tab=tab
	ui.render()
	for index in ui.list.item_count:
		if int(ui.list.get_item_metadata(index))==uid:
			ui.list.select(index)
			ui.list.item_selected.emit(index)
			return true
	return check(false,"selected item")

func course(loaded:bool,pairs:int)->Dictionary:
	var ui:Variant=Screen.instantiate()
	var size:="loaded" if loaded else "small"
	ui.sample_cargo=true
	ui.save_path="user://profile-"+size+".sqlite3"
	get_tree().root.add_child(ui)
	await get_tree().process_frame
	var p:Variant=ui.profile
	if not check(p.available,"ready"):return {}
	var store:=TimedStore.new(p.store)
	p.store=store
	var uid:=int(p.saved.state.items[1].uid)
	if loaded:
		var body:=FileAccess.get_file_as_string("res://benchmark-loaded.json")
		var staged:Dictionary=store.stage_slot(1,p.revision,body,"[]")
		if not check(staged.ok and store.commit_slot(staged.token).ok and p.reload().ok,"loaded profile"):return {}
		if not check(p.saved.state.items.size()==128 and p.saved.state.account.craftLore.size()==3929,"loaded shape"):return {}
	var initial_revision:int=p.revision
	var initial_random:Dictionary=p.saved.random
	var rows:Array=[]
	var warmup:Array=[]
	for pair in pairs:
		for action in ["learn","unlearn"]:
			if not select(ui,0 if action=="learn" else 4,uid if action=="learn" else 5):return {}
			ui.seat_choice.select(5)
			await get_tree().process_frame
			ui.slices=[]
			ui.render_us=0
			ui.finished_us=0
			p.api.times={}
			p.api.wire_times={}
			store.call_us=0
			frames=[]
			active=true
			ui.measuring=true
			var begin:=Time.get_ticks_usec()
			ui.perform(action)
			var submit_us:=Time.get_ticks_usec()-begin
			var sync_finished:=Time.get_ticks_usec()
			while p.is_saving():
				if not check(Time.get_ticks_usec()-begin<10000000,"completion deadline"):return {}
				await get_tree().process_frame
			var completion:int=ui.finished_us-begin if ui.finished_us>0 else sync_finished-begin
			await get_tree().process_frame
			ui.measuring=false
			active=false
			var poll_cpu:=0
			var blocking:=submit_us
			for elapsed in ui.slices:
				poll_cpu+=int(elapsed)
				blocking=maxi(blocking,int(elapsed))
			var sample:={"action":action,"submitUs":submit_us,"pollCpuUs":poll_cpu,"mainUs":submit_us+poll_cpu,
				"maxBlockingUs":blocking,"completionUs":completion,"storageCallUs":store.call_us,"renderUs":ui.render_us,
				"apiUs":p.api.times.duplicate(),"wireUs":p.api.wire_times.duplicate(),
				"pollSlicesUs":ui.slices.duplicate(),"frameIntervalsUs":frames.duplicate()}
			if not check(p.available and p.saved.random==initial_random,"committed state and RNG"):return {}
			if action=="learn":
				if not check(p.saved.state.rack[4].gem.skillId=="firebolt","learned owner"):return {}
			else:
				uid=int(p.saved.nextUid)-1
				if not check(p.saved.state.rack[4]==null and p.saved.state.items.back().uid==uid,"returned owner"):return {}
			if pair<2:warmup.append(sample)
			else:rows.append(sample)
	var durable:Dictionary=store.read_slot(1)
	var revision:int=p.revision
	if not check(durable.ok and revision==initial_revision+pairs*2 and p.reload().ok and p.saved.nextUid==uid+1,"durable restore"):return {}
	var result:={"rows":rows,"warmup":warmup,"revision":revision,"uid":uid,"saveSha256":String(durable.crafting).sha256_text(),
		"saveBytes":String(durable.crafting).to_utf8_buffer().size(),"database":ProjectSettings.globalize_path(ui.save_path)}
	p.close()
	var metrics:Dictionary=p.api.metrics()
	if not check(metrics.live_bytes==0 and metrics.live_blocks==0 and metrics.peak_bytes<=32*1024*1024,"closed VM budget"):return {}
	result.metrics=metrics
	ui.queue_free()
	await get_tree().process_frame
	return result

func _run()->void:
	var pairs:=int(OS.get_environment("HWE_PROFILE_PAIRS"))
	if not check(pairs>=3 and pairs<=18,"bounded workload"):return
	var small:=await course(false,pairs)
	if small.is_empty():return
	var loaded:=await course(true,pairs)
	if loaded.is_empty():return
	print("HWE_PROFILE_MEASURE ",JSON.stringify({"small":small,"loaded":loaded,"engine":Engine.get_version_info().string,
		"cpu":OS.get_processor_name(),"platform":OS.get_name()}))
	get_tree().quit()
