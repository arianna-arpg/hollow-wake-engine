extends RefCounted

const ROOT := "res://addons/hollow_wake/crafting/"
const INDEX_LIMIT := 16384
const PAGE_LIMIT := 32768
var _index: Dictionary = {}
var _cached_page := -1
var _cached_rows: Dictionary = {}
var _pages := {}
var _recent: Array[int] = []
var _capacity := 4
var _page_reads := 0

func cache_info() -> Dictionary:
	var source_bytes := 0
	for page in _recent: source_bytes += int(_index.pages[page].length)
	return {"capacity":_capacity,"retainedPages":_recent.size(),"sourceBytes":source_bytes,"pageReads":_page_reads}

func set_page_limit(pages: int) -> bool:
	if pages < 1 or pages > 4: return false
	_capacity = pages
	while _recent.size() > _capacity: _pages.erase(_recent.pop_front())
	return true

func _configure(api: RefCounted) -> Dictionary:
	if not _index.is_empty(): return {"ok":true}
	var file := FileAccess.open(ROOT+"cargo-index.json",FileAccess.READ)
	if file == null or file.get_length() > INDEX_LIMIT: return {"ok":false,"reason":"invalid-cargo-index"}
	var index: Variant = JSON.parse_string(file.get_as_text())
	if not index is Dictionary or index.get("format") != "cargo-display-pages/v1" or not index.get("pages") is Array or index.pages.size() != 32 or not index.get("config") is Dictionary:
		return {"ok":false,"reason":"invalid-cargo-index"}
	var offset := 0
	for r in index.pages:
		if not r is Dictionary or r.get("offset") != offset or not r.get("length") is float or r.length < 1 or r.length > PAGE_LIMIT or r.length != floor(r.length) or not r.get("sha256") is String or r.sha256.length() != 64:
			return {"ok":false,"reason":"invalid-cargo-range"}
		offset += int(r.length)
	if index.get("bytes") != offset: return {"ok":false,"reason":"invalid-cargo-index"}
	var reply: Dictionary = api.request({"op":"configure-cargo","config":index.config})
	if not reply.ok and reply.get("reason") != "already-configured": return reply
	_index = index
	return {"ok":true}

func _load_page(page: int) -> bool:
	if page == _cached_page: return true
	if page < 0 or page >= _index.pages.size(): return false
	if _pages.has(page):
		_recent.erase(page)
		_recent.append(page)
		_cached_page = page
		_cached_rows = _pages[page]
		return true
	var r: Dictionary = _index.pages[page]
	var file := FileAccess.open(ROOT+"cargo-pages.txt",FileAccess.READ)
	if file == null or file.get_length() != int(_index.bytes): return false
	file.seek(int(r.offset))
	var bytes := file.get_buffer(int(r.length))
	if bytes.size() != int(r.length): return false
	var hash := HashingContext.new()
	if hash.start(HashingContext.HASH_SHA256) != OK or hash.update(bytes) != OK or hash.finish().hex_encode() != r.sha256: return false
	var rows: Variant = JSON.parse_string(bytes.get_string_from_utf8())
	if not rows is Dictionary: return false
	for table in ["skills","supports","monsters"]:
		if not rows.get(table) is Dictionary: return false
	if _recent.size() == _capacity: _pages.erase(_recent.pop_front())
	_pages[page] = rows
	_recent.append(page)
	_page_reads += 1
	_cached_page = page
	_cached_rows = rows
	return true

# Admission reads the numeric requirements on the skill's verified data page.
func meets(api: RefCounted, item: Dictionary, attributes: Dictionary) -> Dictionary:
	var ready := _configure(api)
	if not ready.ok: return ready
	var plan: Dictionary = api.request({"op":"cargo-references","item":item})
	if not plan.ok: return plan
	if plan.references.size() != 1: return {"ok":false,"reason":"invalid-skill"}
	var ref: Dictionary = plan.references[0]
	if ref.table != "skills" or not _load_page(int(ref.page)): return {"ok":false,"reason":"invalid-cargo-page"}
	var face: Variant = _cached_rows.skills.get(ref.id)
	if not face is Dictionary: return {"ok":false,"reason":"unknown-skill"}
	var requirements: Variant = face.get("requirements",{})
	if not requirements is Dictionary: return {"ok":false,"reason":"invalid-requirements"}
	for key in requirements:
		if not requirements[key] is float or requirements[key] < 0 or floor(requirements[key]) != requirements[key]:
			return {"ok":false,"reason":"invalid-requirements"}
		if attributes.get(key,0) < requirements[key]: return {"ok":true,"meets":false}
	return {"ok":true,"meets":true}

func inspect(api: RefCounted, item: Dictionary, view: Dictionary, fit: Variant) -> Dictionary:
	var ready := _configure(api)
	if not ready.ok: return ready
	var plan: Dictionary = api.request({"op":"cargo-references","item":item})
	if not plan.ok: return plan
	var pages := {}
	var records := {"skills":{},"supports":{},"monsters":{}}
	for ref in plan.references:
		var page := int(ref.page)
		if not pages.has(page): pages[page] = []
		pages[page].append(ref)
	for page in pages:
		if not _load_page(page): return {"ok":false,"reason":"invalid-cargo-page"}
		for ref in pages[page]:
			records[ref.table][ref.id] = _cached_rows[ref.table].get(ref.id)
	var command := {"op":"inspect-cargo","item":item,"view":view,"records":records}
	if fit != null: command.fit = fit
	return api.request(command)
