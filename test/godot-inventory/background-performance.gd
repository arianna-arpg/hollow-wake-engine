extends SceneTree

var failed:=false

func check(value: bool, message: String) -> bool:
	if not value:
		failed=true
		push_error(message)
	return value

func _initialize() -> void:
	Engine.max_fps=120
	_run.call_deferred()

func sample(store: Object, slot: int, revision: int, body: String, background: bool) -> Dictionary:
	var started:=Time.get_ticks_usec()
	var main_us:=0
	var max_call_us:=0
	var polls:=0
	var frames:=0
	var reply: Dictionary
	if background:
		reply=store.save_slot_async(slot,revision,body,body)
		main_us=Time.get_ticks_usec()-started
		max_call_us=main_us
		if not check(reply.ok,"submit"):return {}
		var ticket:int=reply.ticket
		while true:
			var before:=Time.get_ticks_usec()
			reply=store.poll_save(ticket)
			var elapsed:=Time.get_ticks_usec()-before
			main_us+=elapsed
			max_call_us=maxi(max_call_us,elapsed)
			polls+=1
			if not reply.get("pending",false):break
			if not check(Time.get_ticks_usec()-started<10000000,"completion deadline"):return {}
			frames+=1
			await process_frame
	else:
		reply=store.stage_slot(slot,revision,body,body)
		if not check(reply.ok,"stage"):return {}
		reply=store.commit_slot(reply.token)
		main_us=Time.get_ticks_usec()-started
		max_call_us=main_us
	var total:=Time.get_ticks_usec()-started
	if not check(reply.ok,"commit"):return {}
	# Verification is deliberately outside the measured section.
	var saved: Dictionary=store.read_slot(slot)
	if not check(saved.ok and saved.revision==revision+1 and saved.crafting==body and saved.stash==body,"durable paired bytes"):return {}
	return {"mainUs":main_us,"maxBlockingUs":max_call_us,"completionUs":total,"polls":polls,"frames":frames}

func _run() -> void:
	var store:Object=ClassDB.instantiate("HollowWakeSlotStore")
	if not check(store.open_file(OS.get_environment("HWE_BACKGROUND_DB")).ok,"open"):quit(1);return
	var rows:Array=[]
	var warmup:Array=[]
	var slot:=0
	for size in [2048,65536,524288]:
		for repeat in 4:
			slot+=1
			var revision:=0
			for iteration in 40:
				# Alternate order within and between repeats. Both modes write the
				# same documents; no serialization or read-back is timed.
				var body:=str(iteration%10).repeat(size)
				var order:=[false,true] if (iteration+repeat)%2==0 else [true,false]
				for background in order:
					var result:=await sample(store,slot,revision,body,background)
					if failed:store.close_file();quit(1);return
					revision+=1
					result.merge({"documentBytes":size,"repeat":repeat,"iteration":iteration-8,"background":background})
					if iteration>=8:rows.append(result)
					else:warmup.append(result)
	store.close_file()
	print("HWE_BACKGROUND_MEASURE "+JSON.stringify({"passed":not failed,"rows":rows,"warmup":warmup,"slots":slot,"revision":80,"lastByte":"9"}))
	quit(1 if failed else 0)
