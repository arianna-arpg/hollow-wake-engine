extends SceneTree

var failures: Array[String]=[]
var polls:=0
var frames:=0
var max_poll_us:=0

func check(ok: bool, message: String) -> bool:
	if not ok: failures.append(message)
	return ok

func _initialize() -> void:
	_run.call_deferred()

func wait_save(store: Object, ticket: int) -> Dictionary:
	var deadline:=Time.get_ticks_msec()+10000
	while Time.get_ticks_msec()<deadline:
		var start:=Time.get_ticks_usec()
		var reply: Dictionary=store.poll_save(ticket)
		max_poll_us=maxi(max_poll_us,Time.get_ticks_usec()-start)
		polls+=1
		if not reply.get("pending",false): return reply
		frames+=1
		await process_frame
	return {"ok":false,"reason":"test-timeout"}

func _run() -> void:
	var store: Object=ClassDB.instantiate("HollowWakeSlotStore")
	var file:=OS.get_environment("HWE_BACKGROUND_DB")
	var mode:=OS.get_environment("HWE_BACKGROUND_CASE")
	var opened: Dictionary=store.open_file(file,"preserve" if mode=="reader" else "wal")
	if not check(opened.ok,"open"): _finish({});return
	if mode=="reader":
		var queued:Dictionary=store.save_slot_async(1,7,"new","[]")
		if not check(queued.ok,"held-reader submission"): _finish({});return
		var outcome:=await wait_save(store,queued.ticket)
		check(not outcome.ok and outcome.reason=="busy","held reader causes rollback commit failure")
		check(store.read_slot(1).revision==7,"failed commit retains old revision")
		store.close_file()
		_finish({"readerFailure":outcome})
		return
	check(not store.save_slot_async(-1,0,"a","[]").ok,"invalid slot")
	check(not store.save_slot_async(1,-1,"a","[]").ok,"invalid revision")
	check(store.save_slot_async(1,0,"","[]").reason=="payload-size","empty payload")
	check(store.save_slot_async(1,0,"界".repeat(200000),"[]").reason=="payload-size","UTF-8 size")
	check(not store.poll_save(99).ok and not store.cancel_save(99).ok,"unknown ticket")
	var queued:Dictionary=store.save_slot_async(1,0,"first","[]")
	if not check(queued.ok,"first submission"): _finish({});return
	check(not store.save_slot_async(2,0,"second","[]").ok,"one pending write")
	check(not store.read_slot(1).ok and not store.checkpoint().ok,"synchronous operations excluded")
	check(not store.stage_slot(2,0,"second","[]").ok,"staging excluded")
	check(not store.poll_save(queued.ticket+1).ok,"wrong ticket cannot consume")
	var outcome:=await wait_save(store,queued.ticket)
	check(outcome.ok,"first commit")
	check(not store.poll_save(queued.ticket).ok,"completion consumed once")
	check(store.read_slot(1).revision==1 and store.read_slot(1).crafting=="first","first durable bytes")
	queued=store.save_slot_async(1,0,"stale","[]")
	outcome=await wait_save(store,queued.ticket)
	check(not outcome.ok and outcome.reason=="stale-revision","stale writer refused")
	var other: Object=ClassDB.instantiate("HollowWakeSlotStore")
	check(other.open_file(file).ok,"competing handle")
	var held:Dictionary=other.stage_slot(1,1,"held","[]")
	check(held.ok,"competing transaction")
	queued=store.save_slot_async(1,1,"busy","[]")
	outcome=await wait_save(store,queued.ticket)
	check(not outcome.ok and outcome.reason=="busy","busy writer refused")
	check(other.cancel_slot(held.token).ok,"competing cancellation")
	other.close_file()
	held=store.stage_slot(1,1,"sync","[]")
	check(held.ok and not store.save_slot_async(1,1,"overlap","[]").ok,"manual transaction excluded")
	check(store.cancel_slot(held.token).ok,"manual cancellation")
	var revision:=1
	var cancelled:=0
	var committed:=0
	for i in 64:
		queued=store.save_slot_async(1,revision,str(i)+"x".repeat(32768),"[]")
		if not check(queued.ok,"cancel course submission"):break
		var cancellation:Dictionary=store.cancel_save(queued.ticket)
		outcome=await wait_save(store,queued.ticket)
		if cancellation.ok:
			cancelled+=1
			check(not outcome.ok and outcome.reason=="cancelled","accepted cancellation rolls back")
		else:
			committed+=1
			check(cancellation.reason=="too-late" and outcome.ok,"late cancellation settles commit")
			revision+=1
		check(store.read_slot(1).revision==revision,"cancel/commit revision")
	var large:="a".repeat(512*1024)
	queued=store.save_slot_async(2,0,large,large)
	outcome=await wait_save(store,queued.ticket)
	check(outcome.ok and store.read_slot(2).crafting==large,"bounded maximum documents")
	queued=store.save_slot_async(1,revision,"close","[]")
	var retired:int=queued.ticket
	store.close_file()
	check(store.open_file(file).ok,"reopen after active close")
	var row:Dictionary=store.read_slot(1)
	check(row.revision in [revision,revision+1],"close leaves atomic old or new revision")
	if row.revision==revision+1: check(row.crafting=="close","closed commit bytes")
	check(not store.poll_save(retired).ok,"closed completion invalidated")
	queued=store.save_slot_async(1,row.revision,"reopened","[]")
	check(queued.ok and queued.ticket>retired,"tickets never alias after reopen")
	outcome=await wait_save(store,queued.ticket)
	check(outcome.ok,"worker restarts")
	var final:Dictionary=store.read_slot(1)
	check(final.crafting=="reopened","reopened bytes")
	store.close_file()
	_finish({"cancelled":cancelled,"committedBeforeCancel":committed,"revision":final.revision})

func _finish(extra: Dictionary) -> void:
	extra.merge({"passed":failures.is_empty(),"failures":failures,"polls":polls,"yieldedFrames":frames,"diagnosticMaxPollUs":max_poll_us})
	print("HWE_BACKGROUND_OK ",JSON.stringify(extra))
	quit(0 if failures.is_empty() else 1)
