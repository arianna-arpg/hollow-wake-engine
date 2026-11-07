extends SceneTree

const Profile=preload("res://profile.gd")
class TimedStore:
	extends RefCounted
	var store=HollowWakeSlotStore.new()
	var stage_us:=0
	var commit_us:=0
	var fault:=""
	var marker:=""
	func open_file(file:String)->Dictionary:return store.open_file(file)
	func close_file()->void:store.close_file()
	func read_slot(slot:int)->Dictionary:return store.read_slot(slot)
	func stage_slot(slot:int,revision:int,crafting:String,stash:String)->Dictionary:
		var begin:=Time.get_ticks_usec()
		var result:Dictionary=store.stage_slot(slot,revision,crafting,stash)
		stage_us=Time.get_ticks_usec()-begin
		return result
	func terminate(phase:String)->void:
		print("HWE_STORAGE_BOUNDARY ",phase," ",marker)
		var proof:=FileAccess.open(marker,FileAccess.WRITE)
		proof.store_string(phase)
		proof.close()
		# Keep the transaction at this exact boundary until the supervising process kills us.
		while true:
			OS.delay_msec(50)
	func commit_slot(token:int)->Dictionary:
		if fault=="before":terminate("before")
		var begin:=Time.get_ticks_usec()
		var result:Dictionary=store.commit_slot(token)
		commit_us=Time.get_ticks_usec()-begin
		if result.ok and fault=="after":terminate("after")
		return result

func _initialize()->void:call_deferred("_run")
func require(ok:bool,note:String)->bool:
	if not ok:
		printerr("HWE_STORAGE_FAILED ",note)
		quit(1)
	return ok
func _run()->void:
	var file:=OS.get_environment("HWE_INLAY_DB")
	var mode:=OS.get_environment("HWE_INLAY_CASE")
	print("HWE_STORAGE_START ",mode)
	if not require(file.is_absolute_path() and FileAccess.file_exists(file+".owner"),"owned disposable database"):return
	var backend:=TimedStore.new()
	var p:=Profile.new()
	if not require(p.start(file,backend,false,false,true).ok,"open"):return
	print("HWE_STORAGE_OPEN ",p.revision)
	var uid:int=p.saved.state.items[0].uid
	if mode in ["before","after"]:
		backend.fault=mode
		backend.marker=file+".point"
		p.inlay(uid,p.revision,"morren",0)
		require(false,"test process survived its interruption")
		return
	if not require(mode=="measure" and p.revision==1,"fresh sample"):return
	for stone in ["sylph","thal"]:
		if not require(p.grant_vestige(stone,40,p.revision).ok,"grant"):return
	var series:=[]
	for i in 40:
		var stone:="sylph" if i%2==0 else "thal"
		var start:=Time.get_ticks_usec()
		var result:=p.inlay(uid,p.revision,stone,0)
		var total:=Time.get_ticks_usec()-start
		if not require(result.ok and p.saved.state.items[0].sockets[0]==stone,"write"):return
		if i>=8:series.append([total,backend.stage_us,backend.commit_us,total-backend.stage_us-backend.commit_us])
	p.close()
	if not require(p.start(file,backend).ok and p.revision==43 and p.saved.state.vestiges.sylph==22 and p.saved.state.vestiges.thal==22,"reopen"):return
	p.close()
	print("HWE_STORAGE_OK ",JSON.stringify({"columns":["totalUs","stageUs","commitUs","restUs"],"samples":series}))
	quit()
