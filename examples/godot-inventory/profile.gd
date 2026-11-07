extends RefCounted

const Crafting = preload("res://addons/hollow_wake/crafting/crafting.gd")
const SLOT := 1
const STASH_LIMIT := 64
# The standalone workshop has one level-ten hero who occupies their own body.
# A game with possession supplies the viewing hero and acting body independently.
const HERO_LEVEL := 10
const ACTOR_LEVEL := 10
# This standalone hero can learn Firebolt. The workshop has no active debt or discipline.
const HERO_ATTRIBUTES := {"intelligence":12}
const COUNTER := {"salvage":false,"bench":false,"oracle":false,"counter":true}
var api := Crafting.new()
var store: Variant
var revision := 0
var saved: Dictionary = {}
var stash: Array = []
var available := false
var _open_profile := false
var _starter_cargo := false
var _starter_supports := false
var _starter_vestiges := false
var _fit_revision := -1
var _fit_uid := 0
var _fit_reply: Dictionary = {}
var _memory: Variant = null
var _background := false
var _pending_ticket := 0
var _pending_save: Dictionary = {}
var _pending_result: Dictionary = {}
const RECALL_SAVE := "inventory-workshop/recall-v1"

func start(filename: String, backend: Variant = null, starter_cargo := false, starter_supports := false, starter_vestiges := false) -> Dictionary:
	if is_saving(): return {"ok":false,"reason":"save-pending"}
	_starter_vestiges=starter_vestiges
	_starter_cargo = starter_cargo or starter_supports
	_starter_supports = starter_supports
	store = backend if backend != null else HollowWakeSlotStore.new()
	var opened: Dictionary = store.open_file(ProjectSettings.globalize_path(filename))
	if not opened.ok: return opened
	if api.start() != 0: return {"ok":false,"reason":"native-host"}
	return reload()

func close() -> void:
	available = false
	_fit_reply={}
	_fit_revision=-1
	api.close()
	_open_profile = false
	if store != null: store.close_file()
	_pending_ticket=0
	_pending_save={}
	_pending_result={}
	_background=false

func _close_profile() -> void:
	if _open_profile:
		api.close_profile(1)
		_open_profile = false

func _empty_state() -> Dictionary:
	return {"board":{"w":2,"h":2},"items":[],"equipped":{},"overflow":[],"essences":{},
		"account":{"craftLore":{},"ledger":{},"features":[],"progression":true}}

func reload() -> Dictionary:
	if is_saving(): return {"ok":false,"reason":"save-pending"}
	available = false
	_memory=null
	_fit_revision=-1
	_fit_reply={}
	_close_profile()
	saved = {}
	stash = []
	var row: Dictionary = store.read_slot(SLOT)
	if not row.ok: return row
	revision = row.revision
	if revision == 0:
		var initial := _empty_state()
		if _starter_vestiges: initial.board={"w":4,"h":4}
		if _starter_cargo:
			var sample := api.from_portable_json(FileAccess.get_file_as_string("res://cargo-sample.json"))
			if not sample.ok or not sample.value is Array: return {"ok":false,"reason":"invalid-record"}
			initial.items = sample.value
			if _starter_supports:
				for item in initial.items:
					if item.get("gem",{}).get("kind")=="support":
						item.name="Teeming Vein"
						item.locked=true
						item.gem={"kind":"support","supportId":"teeming_vein","level":2,"rolled":{"trigger":"chance","brood":"grubs","clutch":"brood4"}}
		var opened := api.open_profile(1, 17, initial)
		if not opened.ok: return opened
		_open_profile = true
		if _starter_vestiges:
			var minted:=api.forge(1,{"baseId":"helmet_armor","ilvl":1,"rarity":"common","sockets":2,"quality":0.5,"superior":false})
			if not minted.ok: return minted
			for material in [["morren",2],["sylph",2],["thal",2]]:
				var grant:=api.grant_vestige(1,material[0],material[1])
				if not grant.ok or not grant.result.changed:return {"ok":false,"reason":"sample-grant"}
			return _save([])
		if _starter_cargo: return _save([])
		# Seed the standalone example through the actual mint and placement rules.
		for rarity in ["common","magic","rare","magic","rare"]:
			var minted := api.forge(1, {"baseId":"ring_lapis","ilvl":10,"rarity":rarity,"fillRandom":true})
			if not minted.ok: return minted
		return _save([])
	var source := api.from_portable_json(row.crafting)
	if source.ok and source.value is Array:
		var envelope: Array=source.value
		if envelope.size()!=3 or envelope[0]!=RECALL_SAVE or not envelope[1] is Dictionary or not envelope[2] is Dictionary:
			return {"ok":false,"reason":"invalid-record"}
		var valid:=api.pouch_request({"op":"validate","memory":envelope[2]})
		if not valid.ok: return valid
		_memory=envelope[2]
		_freeze(_memory)
		source={"ok":true,"value":envelope[1]}
	var destination := api.from_portable_json(row.stash)
	if not source.ok or not source.value is Dictionary or not destination.ok or not destination.value is Array:
		return {"ok":false,"reason":"invalid-record"}
	var restored := api.restore_profile(1,source.value)
	if not restored.ok: return restored
	_open_profile = true
	if not _valid_stash(source.value,destination.value):
		_close_profile()
		return {"ok":false,"reason":"invalid-custody"}
	saved = source.value
	stash = destination.value
	_freeze(saved)
	_freeze(stash)
	available = true
	return {"ok":true}

func _valid_stash(source: Dictionary, items: Array) -> bool:
	if items.size() > STASH_LIMIT: return false
	if items.is_empty(): return true
	# Reuse the SDK's complete item, placement, duplicate-ID and UID-floor validation.
	var scratch := _empty_state()
	scratch.overflow = items
	var checked := api.open_profile(2,1,scratch,source.nextUid)
	if not checked.ok: return false
	api.close_profile(2)
	var ids := {}
	for item in items: ids[int(item.uid)] = true
	for location in [source.state.items,source.state.equipped.values(),source.state.overflow]:
		for item in location:
			if ids.has(int(item.uid)): return false
	return true

func _save(destination: Array, sold_uid: int = 0, new_memory: Variant = null) -> Dictionary:
	var snapshot := api.snapshot_view(1)
	if not snapshot.ok: return snapshot
	if sold_uid and _find(snapshot.save.state.items,sold_uid) >= 0:
		return {"ok":false,"reason":"protected-item"}
	var source_json := api.snapshot_text(1)
	if not source_json.ok: return source_json
	var stash_json := api.to_portable_json(destination)
	if not stash_json.ok: return stash_json
	var crafting_text: String = source_json.text
	var memory: Variant = new_memory if new_memory!=null else _memory
	if memory!=null:
		var metadata:=api.to_portable_json(memory)
		if not metadata.ok: return metadata
		# Keep the SDK's exact numeric encodings; avoid escaping a save inside
		# a string. The SQLite size guard covers the entire atomic envelope.
		crafting_text="["+JSON.stringify(RECALL_SAVE)+","+crafting_text+","+metadata.text+"]"
	if _background:
		var queued: Dictionary=store.save_slot_async(SLOT,revision,crafting_text,stash_json.text)
		if not queued.ok: return queued
		_pending_ticket=int(queued.ticket)
		_pending_save={"revision":revision,"snapshot":snapshot.save,"stash":destination,"memory":memory}
		_freeze(_pending_save)
		available=false
		return {"ok":true}
	var staged: Dictionary = store.stage_slot(SLOT,revision,crafting_text,stash_json.text)
	if not staged.ok: return staged
	var committed: Dictionary = store.commit_slot(staged.token)
	if not committed.ok: return committed
	_publish_save({"revision":revision,"snapshot":snapshot.save,"stash":destination,"memory":memory})
	return {"ok":true}

func _publish_save(proposal: Dictionary) -> void:
	revision = int(proposal.revision)+1
	saved = proposal.snapshot
	stash = proposal.stash
	_memory=proposal.memory
	_freeze(_memory)
	_freeze(saved)
	_freeze(stash)
	available = true

func is_saving() -> bool:
	return _pending_ticket!=0

func _begin(command: Callable) -> Dictionary:
	if is_saving(): return {"ok":false,"reason":"save-pending"}
	if not available: return {"ok":false,"reason":"unavailable"}
	if not store.has_method("save_slot_async"): return {"ok":false,"reason":"background-save-unavailable"}
	_background=true
	var reply: Dictionary=command.call()
	_background=false
	if not is_saving(): return reply
	_pending_result=reply
	return {"ok":true,"pending":true}

func begin_action(action: String, uid: int, seen_revision: int, slot := -1, expected_skill := "", socket: Dictionary = {}) -> Dictionary:
	return _begin(act.bind(action,uid,seen_revision,slot,expected_skill,socket))

func begin_inlay(uid: int, seen_revision: int, id: String, socket := -1) -> Dictionary:
	return _begin(inlay.bind(uid,seen_revision,id,socket))

func begin_recall(uid: int, seen_revision: int, group: String, facet: String) -> Dictionary:
	return _begin(recall.bind(uid,seen_revision,group,facet))

func begin_grant_vestige(id: String, count: int, seen_revision: int) -> Dictionary:
	return _begin(grant_vestige.bind(id,count,seen_revision))

func poll_save() -> Dictionary:
	if not is_saving(): return {"ok":false,"reason":"invalid-ticket"}
	var reply: Dictionary=store.poll_save(_pending_ticket)
	if reply.get("pending",false): return reply
	var proposal:=_pending_save
	var completed:=_pending_result
	_pending_ticket=0
	_pending_save={}
	_pending_result={}
	if reply.ok:
		_publish_save(proposal)
		reply=completed
	else:
		var recovered:=reload()
		if not recovered.ok: reply=recovered
	reply["pending"]=false
	return reply

func cancel_save() -> Dictionary:
	if not is_saving(): return {"ok":false,"reason":"invalid-ticket"}
	return store.cancel_save(_pending_ticket)

func _find(items: Array, uid: int) -> int:
	for index in items.size():
		if items[index].uid == uid: return index
	return -1

func _freeze(value: Variant) -> void:
	if value is Array and not value.is_read_only():
		for child in value: _freeze(child)
		value.make_read_only()
	elif value is Dictionary and not value.is_read_only():
		for key in value: _freeze(value[key])
		value.make_read_only()

func compatible_seats(uid: int) -> Dictionary:
	if not available: return {"ok":false,"reason":"unavailable"}
	if revision==_fit_revision and uid==_fit_uid: return _fit_reply
	var at:=_find(saved.state.items,uid)
	if at<0 or saved.state.items[at].get("gem",{}).get("kind")!="support": return {"ok":false,"reason":"missing-item"}
	var reply:=api.support_fit(saved.state.get("rack",[]),saved.state.items[at].gem)
	if reply.ok:
		_freeze(reply)
		_fit_revision=revision
		_fit_uid=uid
		_fit_reply=reply
	return reply

func _pouch_command(op: String, uid: int) -> Dictionary:
	var state: Dictionary=saved.state
	return {"op":op,"uid":uid,"nextUid":saved.nextUid,"state":{"items":state.items,"board":state.board,"account":{
		"ledger":state.account.ledger,"features":state.account.features,"progression":state.account.progression}},
		"memory":_memory,"level":HERO_LEVEL,"sealed":false}

func recall_view(uid: int) -> Dictionary:
	if not available: return {"ok":false,"reason":"unavailable"}
	return api.pouch_request(_pouch_command("view",uid))

func recall(uid: int, seen_revision: int, group: String, facet: String) -> Dictionary:
	if not available: return {"ok":false,"reason":"unavailable"}
	if seen_revision!=revision: return {"ok":false,"reason":"stale-revision"}
	var command:=_pouch_command("recall",uid)
	command.group=group
	if not facet.is_empty(): command.facet=facet
	var move:=api.pouch_request(command)
	if not move.ok: return move
	var proposed:=saved.duplicate(true)
	proposed.state.items=move.items
	proposed.state.account.ledger=move.ledger
	proposed.nextUid=move.nextUid
	_close_profile()
	var change:=api.restore_profile(1,proposed)
	_open_profile=change.ok
	if change.ok: change=_save(stash,0,move.memory)
	if change.ok: return {"ok":true,"result":move.result}
	var recovered:=reload()
	return change if recovered.ok else recovered

# A UI action carries the UID and revision the player actually saw. On a failed
# write, re-read the durable owners before allowing another action.
func inlay(uid: int, seen_revision: int, id: String, socket := -1) -> Dictionary:
	if not available:return {"ok":false,"reason":"unavailable"}
	if seen_revision!=revision:return {"ok":false,"reason":"stale-revision"}
	return _commit_vestiges(api.inlay_vestige(1,uid,id,socket))

func grant_vestige(id: String, count: int, seen_revision: int) -> Dictionary:
	if not available:return {"ok":false,"reason":"unavailable"}
	if seen_revision!=revision:return {"ok":false,"reason":"stale-revision"}
	return _commit_vestiges(api.grant_vestige(1,id,count))

func _commit_vestiges(change: Dictionary) -> Dictionary:
	if not change.ok:return change
	if not change.result.changed:return {"ok":false,"reason":change.result.reason}
	var stored:=_save(stash)
	if not stored.ok:
		var restored:=reload()
		return stored if restored.ok else restored
	return change

func act(action: String, uid: int, seen_revision: int, slot := -1, expected_skill := "", socket: Dictionary = {}) -> Dictionary:
	if not available: return {"ok":false,"reason":"unavailable"}
	if seen_revision != revision: return {"ok":false,"reason":"stale-revision"}
	var next := stash.duplicate()
	var change: Dictionary
	var refusal := ""
	match action:
		"socket", "unsocket":
			var rack: Array = saved.state.get("rack",[])
			if action=="socket" or uid==0:
				if slot<0 or slot>=rack.size() or rack[slot]==null or rack[slot].gem.skillId!=expected_skill:
					return {"ok":false,"reason":"stale-skill"}
			if action=="socket":
				var gate := compatible_seats(uid)
				if not gate.ok: return gate
				var fits := false
				for target in gate.rows:
					if target.slot==slot: fits=target.fits
				change=api.socket_support(1,uid,expected_skill,fits)
			else:
				if not socket.has("index") or not socket.has("supportId"): return {"ok":false,"reason":"stale-socket"}
				change=api.unsocket_support(1,expected_skill,socket.index,socket.supportId,uid)
			if change.ok and not change.result.changed:
				refusal=change.result.get("refusal","cannot-socket")
				if not change.result.needsSave: return {"ok":false,"reason":refusal}
		"learn", "unlearn":
			if action == "learn":
				var index := _find(saved.state.items,uid)
				if index < 0: return {"ok":false,"reason":"missing-item"}
				var gate := api.skill_requirements(saved.state.items[index],HERO_ATTRIBUTES)
				if not gate.ok: return gate
				change = api.learn_skill(1,uid,gate.meets,{},slot)
			else:
				var rack: Array = saved.state.get("rack",[])
				if slot < 0 or slot >= rack.size() or rack[slot] == null or rack[slot].gem.skillId != expected_skill:
					return {"ok":false,"reason":"stale-skill"}
				change = api.unlearn_skill(1,expected_skill,{})
			if change.ok and not change.result.changed:
				refusal = change.result.get("refusal","cannot-learn")
				if not change.result.needsSave: return {"ok":false,"reason":refusal}
		"equip", "unequip":
			if action == "equip":
				if _find(saved.state.items,uid) < 0: return {"ok":false,"reason":"missing-item"}
				change = api.equip(1,uid,ACTOR_LEVEL)
			else:
				var slot_id := ""
				for key in saved.state.equipped:
					if saved.state.equipped[key].uid == uid: slot_id = key; break
				if slot_id.is_empty(): return {"ok":false,"reason":"missing-item"}
				change = api.unequip(1,uid,slot_id)
			if change.ok and not change.result.changed:
				return {"ok":false,"reason":change.result.get("refusal",{}).get("reason","cannot-equip")}
		"forge":
			change = api.forge(1,{"baseId":"ring_lapis","ilvl":10,"rarity":"rare","fillRandom":true})
			if change.ok and change.result.uid == null: change = {"ok":false,"reason":"mint-refused"}
		"store", "recover":
			if _find(saved.state.overflow,uid) < 0: return {"ok":false,"reason":"missing-item"}
			if action == "store" and stash.size() >= STASH_LIMIT: return {"ok":false,"reason":"stash-full"}
			change = api.take_overflow(1,uid) if action == "store" else api.recover(1,uid)
			if change.ok:
				if not change.result.moved: return {"ok":false,"reason":"pack-full"}
				if action == "store": next.append(change.result.item)
		"sell":
			if _find(saved.state.items,uid) < 0: return {"ok":false,"reason":"missing-item"}
			change = api.salvage(1,uid,COUNTER)
		"withdraw":
			var index := _find(stash,uid)
			if index < 0: return {"ok":false,"reason":"missing-item"}
			var proposed := saved.duplicate(true)
			proposed.state.overflow.append(next.pop_at(index))
			_close_profile()
			change = api.restore_profile(1,proposed)
			_open_profile = change.ok
			if change.ok:
				change = api.recover(1,uid)
				if change.ok and not change.result.moved: change = {"ok":false,"reason":"pack-full"}
		_: return {"ok":false,"reason":"unknown-action"}
	if change.ok: change = _save(next,uid if action == "sell" else 0)
	if not change.ok:
		var recovered := reload()
		if not recovered.ok: return recovered
	if change.ok and not refusal.is_empty(): return {"ok":false,"reason":refusal}
	return change
