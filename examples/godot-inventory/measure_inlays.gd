extends RefCounted

const Profile=preload("res://profile.gd")
func _course(p: Variant,file: String) -> Dictionary:
	var opened:Dictionary=p.start(file,null,false,false,true)
	if not opened.ok:return opened
	var item:Dictionary=p.saved.state.items[0]
	var uid:int=item.uid
	var random_before:Dictionary=p.saved.random
	var next_before:int=p.saved.nextUid
	for id in ["sylph","thal"]:
		var grant:Dictionary=p.grant_vestige(id,40,p.revision)
		if not grant.ok:return grant
	var first_revision:int=p.revision
	var commits:Array[int]=[]
	var previews:Array[int]=[]
	for i in 40:
		var id:="sylph" if i%2==0 else "thal"
		var start:=Time.get_ticks_usec()
		var view:Dictionary=p.api.view_inlay(p.saved.state.items[0],p.saved.state.vestiges,id,0)
		var preview_us:=Time.get_ticks_usec()-start
		if not view.ok or not view.preview.changed:return {"ok":false,"reason":"preview"}
		start=Time.get_ticks_usec()
		var committed:Dictionary=p.inlay(uid,p.revision,id,0)
		var commit_us:=Time.get_ticks_usec()-start
		if not committed.ok or p.saved.state.items[0].sockets[0]!=id:return {"ok":false,"reason":"inlay"}
		if i>=8:
			previews.append(preview_us)
			commits.append(commit_us)
	p.close()
	opened=p.start(file)
	if not opened.ok:return opened
	if p.revision!=first_revision+40 or p.saved.state.vestiges.sylph!=22 or p.saved.state.vestiges.thal!=22 or p.saved.state.items[0].sockets!=["thal",null] or p.saved.random!=random_before or p.saved.nextUid!=next_before:
		return {"ok":false,"reason":"reopen"}
	var preview_sorted=previews.duplicate();preview_sorted.sort()
	var commit_sorted=commits.duplicate();commit_sorted.sort()
	return {"ok":true,"engine":Engine.get_version_info().string,"platform":OS.get_name(),"cpu":OS.get_processor_name(),
		"warmup":8,"measured":32,"unit":"microseconds","previewUs":previews,"commitUs":commits,
		"previewMedianUs":(preview_sorted[15]+preview_sorted[16])/2.0,"previewP95Us":preview_sorted[30],
		"commitMedianUs":(commit_sorted[15]+commit_sorted[16])/2.0,"commitP95Us":commit_sorted[30],"reopened":true}

func measure() -> Dictionary:
	var directory:=ProjectSettings.globalize_path("user://inlay-measure-%d-%d" % [OS.get_process_id(),Time.get_ticks_usec()])
	if DirAccess.make_dir_absolute(directory)!=OK:return {"ok":false,"reason":"temporary-directory"}
	var file:=directory.path_join("profile.sqlite3")
	var profile:=Profile.new()
	var result:=_course(profile,file)
	profile.close()
	for suffix in ["","-wal","-shm","-journal"]:
		if FileAccess.file_exists(file+suffix) and DirAccess.remove_absolute(file+suffix)!=OK:return {"ok":false,"reason":"temporary-file-cleanup"}
	if DirAccess.remove_absolute(directory)!=OK:return {"ok":false,"reason":"temporary-directory-cleanup"}
	return result
