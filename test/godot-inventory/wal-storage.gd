extends SceneTree

func _initialize() -> void:
	call_deferred("_run")

func require(value: bool, note: String) -> bool:
	if not value:
		printerr("HWE_WAL_FAILED ",note)
		quit(1)
	return value

func write(store: Variant, revision: int) -> Dictionary:
	var staged: Dictionary=store.stage_slot(1,revision,str(revision+1),"[]")
	if not staged.ok:return staged
	return store.commit_slot(staged.token)

func _run() -> void:
	var file:=OS.get_environment("HWE_DB")
	var root:=OS.get_environment("HWE_WAL_ROOT")
	if not require(root!="" and file.begins_with(root+"/") and FileAccess.file_exists(root+"/.owner"),"owned fixture"):return
	var mode:=OS.get_environment("HWE_WAL_CASE")
	var policy:=OS.get_environment("HWE_WAL_POLICY")
	var store:=HollowWakeSlotStore.new()
	var opened:Dictionary=store.open_file(file) if policy=="" else store.open_file(file,policy)
	if mode=="open":
		print("HWE_WAL_OK ",JSON.stringify(opened))
		store.close_file()
		quit()
		return
	if not require(opened.ok,"open "+str(opened)):return
	var reply:Dictionary={"opened":opened}
	if mode=="contracts":
		if not require(opened.journal=="wal" and store.read_slot(1).revision==0,"default WAL and fresh slot"):return
		var peer:=HollowWakeSlotStore.new()
		if not require(peer.open_file(file).ok,"peer open"):return
		var staged:=store.stage_slot(1,0,"1","[]")
		if not require(staged.ok,"stage"):return
		if not require(not store.read_slot(1).ok and not store.checkpoint().ok,"pending ownership"):return
		if not require(peer.read_slot(1).revision==0 and peer.stage_slot(1,0,"2","[]").get("reason")=="busy","reader and writer isolation"):return
		if not require(store.commit_slot(staged.token+1).get("reason")=="invalid-token","wrong token"):return
		if not require(store.commit_slot(staged.token).ok and peer.read_slot(1).crafting=="1","commit owners"):return
		if not require(peer.stage_slot(1,0,"2","[]").get("reason")=="stale-revision","stale writer"):return
		staged=store.stage_slot(1,1,"discard","[]")
		if not require(staged.ok and store.cancel_slot(staged.token).ok and peer.read_slot(1).revision==1,"cancel"):return
		if not require(store.stage_slot(1,1,"é".repeat(262145),"[]").get("reason")=="payload-size","UTF-8 limit"):return
		staged=store.stage_slot(1,1,"discard","[]")
		if not require(staged.ok,"staged close"):return
		store.close_file()
		if not require(store.open_file(file).ok and store.read_slot(1).crafting=="1","closed write rolled back"):return
		if not require(store.commit_slot(staged.token).get("reason")=="invalid-token","token after reopen"):return
		var converter:=HollowWakeSlotStore.new()
		if not require(converter.open_file(file,"rollback").get("reason")=="busy","live peer prevents journal conversion"):return
		peer.close_file()
		reply.checkpoint=store.checkpoint()
		if not require(reply.checkpoint.ok and reply.checkpoint.complete,"checkpoint"):return
		store.close_file()
		if not require(store.open_file(file,"rollback").journal=="delete" and store.read_slot(1).revision==1,"explicit rollback mode"):return
		store.close_file()
		if not require(store.open_file(file,"preserve").journal=="delete","preserve mode"):return
		store.close_file()
		if not require(store.open_file(file).journal=="wal" and store.read_slot(1).crafting=="1","legacy conversion"):return
		reply.contracts=16
	elif mode=="writes":
		var count:=int(OS.get_environment("HWE_WAL_COUNT"))
		if not require(count>0 and count<=1500,"bounded writes"):return
		var revision:int=store.read_slot(1).revision
		var samples:Array[int]=[]
		for i in count:
			var started:=Time.get_ticks_usec()
			if not require(write(store,revision+i).ok,"write "+str(i)):return
			samples.append(Time.get_ticks_usec()-started)
		reply.revision=store.read_slot(1).revision
		reply.samplesUs=samples
		reply.checkpoint=store.checkpoint()
		reply.walBytes=FileAccess.get_file_as_bytes(file+"-wal").size()
		if not require(reply.revision==revision+count and reply.checkpoint.ok,"write continuation"):return
	elif mode=="checkpoint":
		reply.checkpoint=store.checkpoint()
		if not require(reply.checkpoint.ok,"checkpoint"):return
	else:
		require(false,"unknown case")
		return
	store.close_file()
	print("HWE_WAL_OK ",JSON.stringify(reply))
	quit()
