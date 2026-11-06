extends RefCounted

const Crafting = preload("res://addons/hollow_wake/crafting/crafting.gd")
const SLOT := 1
const STASH_LIMIT := 64
const COUNTER := {"salvage":false,"bench":false,"oracle":false,"counter":true}
var api := Crafting.new()
var store: Variant
var revision := 0
var saved: Dictionary = {}
var stash: Array = []
var available := false
var _open_profile := false
var _starter_cargo := false

func start(filename: String, backend: Variant = null, starter_cargo := false) -> Dictionary:
	_starter_cargo = starter_cargo
	store = backend if backend != null else HollowWakeSlotStore.new()
	var opened: Dictionary = store.open_file(ProjectSettings.globalize_path(filename))
	if not opened.ok: return opened
	if api.start() != 0: return {"ok":false,"reason":"native-host"}
	return reload()

func close() -> void:
	available = false
	api.close()
	_open_profile = false
	if store != null: store.close_file()

func _close_profile() -> void:
	if _open_profile:
		api.close_profile(1)
		_open_profile = false

func _empty_state() -> Dictionary:
	return {"board":{"w":2,"h":2},"items":[],"equipped":{},"overflow":[],"essences":{},
		"account":{"craftLore":{},"ledger":{},"features":[],"progression":true}}

func reload() -> Dictionary:
	available = false
	_close_profile()
	saved = {}
	stash = []
	var row: Dictionary = store.read_slot(SLOT)
	if not row.ok: return row
	revision = row.revision
	if revision == 0:
		var initial := _empty_state()
		if _starter_cargo:
			var sample := api.from_portable_json(FileAccess.get_file_as_string("res://cargo-sample.json"))
			if not sample.ok or not sample.value is Array: return {"ok":false,"reason":"invalid-record"}
			initial.items = sample.value
		var opened := api.open_profile(1, 17, initial)
		if not opened.ok: return opened
		_open_profile = true
		if _starter_cargo: return _save([])
		# Seed the standalone example through the actual mint and placement rules.
		for rarity in ["common","magic","rare","magic","rare"]:
			var minted := api.forge(1, {"baseId":"ring_lapis","ilvl":10,"rarity":rarity,"fillRandom":true})
			if not minted.ok: return minted
		return _save([])
	var source := api.from_portable_json(row.crafting)
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

func _save(destination: Array, sold_uid: int = 0) -> Dictionary:
	var snapshot := api.snapshot(1)
	if not snapshot.ok: return snapshot
	if sold_uid and _find(snapshot.save.state.items,sold_uid) >= 0:
		return {"ok":false,"reason":"protected-item"}
	var source_json := api.to_portable_json(snapshot.save)
	if not source_json.ok: return source_json
	var stash_json := api.to_portable_json(destination)
	if not stash_json.ok: return stash_json
	var staged: Dictionary = store.stage_slot(SLOT,revision,source_json.text,stash_json.text)
	if not staged.ok: return staged
	var committed: Dictionary = store.commit_slot(staged.token)
	if not committed.ok: return committed
	revision += 1
	saved = snapshot.save
	stash = destination
	_freeze(saved)
	_freeze(stash)
	available = true
	return {"ok":true}

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

# A UI action carries the UID and revision the player actually saw. On a failed
# write, re-read the durable owners before allowing another action.
func act(action: String, uid: int, seen_revision: int) -> Dictionary:
	if not available: return {"ok":false,"reason":"unavailable"}
	if seen_revision != revision: return {"ok":false,"reason":"stale-revision"}
	var next := stash.duplicate()
	var change: Dictionary
	match action:
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
	return change
