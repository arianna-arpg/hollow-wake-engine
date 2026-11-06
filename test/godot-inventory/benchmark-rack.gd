extends Node

const Profile = preload("res://profile.gd")

# Forward to the shipping SQLite extension. Time the two calls that hold and
# commit the write transaction while keeping the production save policy intact.
class TimedStore:
	extends RefCounted
	var inner := HollowWakeSlotStore.new()
	var write_us := 0
	func open_file(file: String) -> Dictionary: return inner.open_file(file)
	func read_slot(slot: int) -> Dictionary: return inner.read_slot(slot)
	func stage_slot(slot: int, revision: int, source: String, stash: String) -> Dictionary:
		var start := Time.get_ticks_usec()
		var result: Dictionary = inner.stage_slot(slot,revision,source,stash)
		write_us += Time.get_ticks_usec()-start
		return result
	func commit_slot(token: int) -> Dictionary:
		var start := Time.get_ticks_usec()
		var result: Dictionary = inner.commit_slot(token)
		write_us += Time.get_ticks_usec()-start
		return result
	func close_file() -> void: inner.close_file()

func _ready() -> void:
	call_deferred("_run")

func check(ok: bool, message: String) -> bool:
	if not ok:
		printerr("Workshop benchmark failed: ",message)
		get_tree().quit(1)
	return ok

func exercise(label: String, loaded: bool) -> Dictionary:
	var p := Profile.new()
	var file := "user://bench-"+label+("-loaded" if loaded else "-small")+".sqlite3"
	var store := TimedStore.new()
	if not check(not FileAccess.file_exists(file) and p.start(file,store,true).ok,"fresh profile"): return {}
	if not check(p.api.has_method("snapshot_text") != label.begins_with("previous"),"selected workshop version"): return {}
	var uid := int(p.saved.state.items[1].uid)
	if loaded:
		var raw := FileAccess.get_file_as_string("res://benchmark-loaded.json")
		var staged: Dictionary = p.store.stage_slot(1,p.revision,raw,"[]")
		if not check(staged.ok and p.store.commit_slot(staged.token).ok and p.reload().ok,"restore loaded profile"): return {}
		if not check(p.saved.state.items.size()==128 and p.saved.state.account.craftLore.size()==3929,"loaded workload"): return {}
	var initial := int(p.revision)
	var times: Array[int] = []
	var writes: Array[int] = []
	for pair in 18:
		var write_start := store.write_us
		var start := Time.get_ticks_usec()
		var learned := p.act("learn",uid,p.revision,4)
		var learned_us := Time.get_ticks_usec()-start
		var learn_write := store.write_us-write_start
		if not check(learned.ok and p.saved.state.rack[4].gem.skillId=="firebolt","learn and persist"): return {}
		write_start = store.write_us
		var before := Time.get_ticks_usec()
		var returned := p.act("unlearn",0,p.revision,4,"firebolt")
		var elapsed := Time.get_ticks_usec()-before
		if not check(returned.ok and p.saved.state.rack[4]==null,"return and persist"): return {}
		uid = int(p.saved.nextUid)-1
		if not check(p.saved.state.items.back().uid==uid,"returned gem identity"): return {}
		if pair>=2:
			times.append(learned_us)
			times.append(elapsed)
			writes.append(learn_write)
			writes.append(store.write_us-write_start)
	var durable: Dictionary = p.store.read_slot(1)
	var receipt := {"file":file.get_file(),"revision":p.revision,"uid":uid,"actionUs":times,"storageUs":writes}
	if not check(durable.ok and p.revision==initial+36 and p.reload().ok and p.saved.nextUid==uid+1,"reopen committed result"): return {}
	receipt.saveSha256=String(durable.crafting).sha256_text()
	receipt.saveBytes=String(durable.crafting).to_utf8_buffer().size()
	var ordered := times.duplicate()
	ordered.sort()
	receipt.p50Ms=ordered[15]/1000.0
	receipt.p95Ms=ordered[30]/1000.0
	p.close()
	var heap := p.api.metrics()
	if not check(heap.live_bytes==0 and heap.live_blocks==0 and heap.peak_bytes>0 and heap.peak_bytes<=32*1024*1024,"VM heap"): return {}
	receipt.peakBytes=heap.peak_bytes
	return receipt

func _run() -> void:
	if OS.get_cmdline_user_args().is_empty():
		printerr("Run measure.sh to use isolated test saves.")
		get_tree().quit(1)
		return
	var label := OS.get_cmdline_user_args()[0]
	if label=="device" and not check(not FileAccess.file_exists("res://legacy-course.txt") and not FileAccess.file_exists("res://gear-cases.json"),"exclude legacy test data"): return
	var small := exercise(label,false)
	if small.is_empty(): return
	var loaded := exercise(label,true)
	if loaded.is_empty(): return
	print("HWE_BENCH ",JSON.stringify({"small":small,"loaded":loaded}))
	if label=="device":
		print("Godot ",Engine.get_version_info().string," | ",OS.get_name()," | ",OS.get_processor_name())
		for record in [small,loaded]:
			print("%s: 32 saved actions, median %.2f ms, 95th percentile %.2f ms, VM peak %.2f MiB" % [record.file,record.p50Ms,record.p95Ms,record.peakBytes/1048576.0])
	get_tree().quit()
