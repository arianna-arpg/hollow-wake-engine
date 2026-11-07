extends SceneTree

const Crafting=preload("res://addons/hollow_wake/crafting/crafting.gd")
var checks:=0

func check(ok:bool,note:String)->bool:
	checks+=1
	if not ok:
		printerr("HWE_VIEW_FAILED ",note)
		quit(1)
	return ok

func frozen(value:Variant)->bool:
	if value is Dictionary:
		if not value.is_read_only():return false
		for key in value:
			if not frozen(value[key]):return false
	elif value is Array:
		if not value.is_read_only():return false
		for child in value:
			if not frozen(child):return false
	return true

func _init()->void:
	var api:=Crafting.new()
	if not check(api.start()==0,"VM initialized"):return
	var state:={"account":{"craftLore":{},"ledger":{"~opaque雪😀":9007199254740991.0},"features":[],"progression":true},
		"board":{"w":8,"h":8},"items":[],"equipped":{},"overflow":[],"essences":{}}
	if not check(api.open_profile(1,7,state,9007199254740991).ok,"profile admitted"):return
	var full:=api.snapshot(1)
	var view:=api.snapshot_view(1)
	if not check(view.ok and view.save==full.save and frozen(view.save) and view.save.state.keys()==full.save.state.keys(),"complete readonly view with exact numbers"):return
	var second:=api.snapshot_view(1)
	if not check(second.save==view.save and is_same(second.save.state.account,view.save.state.account),"unchanged account shared"):return
	full.save.state.account.ledger["~opaque雪😀"]=0
	if not check(api.snapshot(1).save.state.account.ledger["~opaque雪😀"]==9007199254740991.0,"mutable snapshot detached"):return
	var source:=api.snapshot_text(1)
	if not check(source.ok and api.from_portable_json(source.text).value==view.save,"portable save complete"):return
	if not check(api.to_portable_json(second.save).text==source.text,"reused view preserves exact portable text"):return
	var invalid:Dictionary=api.snapshot(1).save
	invalid.state.board.w=0
	if not check(not api.restore_profile(2,invalid).ok,"invalid restore refused"):return
	if not check(is_same(api.snapshot_view(1).save.state.account,view.save.state.account),"refusal keeps account"):return
	var changed:Dictionary=api.snapshot(1).save
	# JSON numbers return as Godot floats; Dictionary equality distinguishes int.
	changed.state.account.ledger["~opaque雪😀"]=13.0
	if not check(api.close_profile(1).ok and api.restore_profile(1,changed).ok,"same ID reopened"):return
	var reopened:=api.snapshot_view(1)
	if not check(reopened.save==changed and reopened.save.state.account.ledger["~opaque雪😀"]==13,"reopened account refreshed"):return
	if not check(view.save.state.account.ledger["~opaque雪😀"]==9007199254740991.0,"older view unchanged"):return
	if not check(api.open_profile(2,8,state,9007199254740991).ok,"second profile"):return
	if not check(api.snapshot_view(2).save.state.account.ledger["~opaque雪😀"]==9007199254740991.0,"profile switch refreshes"):return
	if not check(api.snapshot_view(1).save==changed,"switch back refreshes"):return
	if not check(api.close()==0 and api.start()==0 and api.open_profile(1,7,state,9007199254740991).ok,"VM restarted"):return
	if not check(api.snapshot_view(1).save.state.account.ledger["~opaque雪😀"]==9007199254740991.0,"VM restart resets cursor"):return
	# Both VMs now issue token one. A stale cache must not hide changed data.
	if not check(api.close()==0 and api.start()==0 and api.restore_profile(1,changed).ok,"restart with changed account"):return
	if not check(api.snapshot_view(1).save==changed,"colliding token across VM lifetimes refreshed"):return
	if not check(api.close()==0,"VM closed"):return
	var metrics:=api.metrics()
	if not check(metrics.live_bytes==0 and metrics.live_blocks==0 and metrics.peak_bytes<=32*1024*1024,"released native heap"):return
	print("HWE_VIEW_OK ",JSON.stringify({"assertions":checks,"metrics":metrics}))
	quit()
