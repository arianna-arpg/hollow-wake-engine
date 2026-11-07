extends ConfirmationDialog

signal submitted(reply: Dictionary, success: String)
const PAGE := 32
const ACTIONS := ["craft-affix","craft-socket","reroll-affix","break-down"]
var action_choice := OptionButton.new()
var choices := OptionButton.new()
var previous := Button.new()
var next := Button.new()
var page_label := Label.new()
var preview := Label.new()
var _profile: RefCounted
var _item: Dictionary = {}
var _quote: Dictionary = {}
var _revision := 0
var _offset := 0
var _error: Callable

func _ready() -> void:
	title="Crafting workshop"
	ok_button_text="Craft"
	min_size=Vector2i(540,340)
	var body:=VBoxContainer.new()
	body.add_theme_constant_override("separation",14)
	add_child(body)
	for caption in ["Craft an affix","Add a socket","Reroll an affix","Break down item"]:
		action_choice.add_item(caption)
	body.add_child(action_choice)
	body.add_child(choices)
	var paging:=HBoxContainer.new()
	previous.text="Previous"
	next.text="Next"
	page_label.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	page_label.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	for control in [previous,page_label,next]:paging.add_child(control)
	body.add_child(paging)
	preview.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	preview.custom_minimum_size=Vector2(500,115)
	body.add_child(preview)
	for control in [action_choice,choices,previous,next]:control.custom_minimum_size.y=44
	action_choice.item_selected.connect(func(_index):_offset=0;_load())
	choices.item_selected.connect(func(_index):_preview())
	previous.pressed.connect(func():_page(-PAGE))
	next.pressed.connect(func():_page(PAGE))
	confirmed.connect(_confirm)

func open_for(profile: RefCounted, item: Dictionary, revision: int, error: Callable) -> Dictionary:
	_profile=profile
	_item=item
	_revision=revision
	_error=error
	_offset=0
	action_choice.select(0)
	var reply:=_load()
	if reply.ok:popup_centered()
	return reply

func _page(amount: int) -> void:
	_offset=maxi(0,_offset+amount)
	_load()

func _load() -> Dictionary:
	_quote=_profile.station_view(int(_item.uid),_revision,_offset)
	choices.clear()
	if not _quote.ok:
		preview.text=_error.call(_quote.reason)
		get_ok_button().disabled=true
		previous.disabled=true
		next.disabled=true
		return _quote
	var craft:=action_choice.selected==0
	choices.visible=craft or action_choice.selected==2
	previous.visible=craft
	next.visible=craft
	page_label.visible=craft
	previous.disabled=_offset==0
	next.disabled=_offset+PAGE>=int(_quote.total)
	page_label.text="%d–%d of %d" % [mini(_offset+1,int(_quote.total)),mini(_offset+PAGE,int(_quote.total)),int(_quote.total)]
	var rows:Array=_quote.rows if craft else _quote.reroll.affixes if action_choice.selected==2 else []
	var first:=-1
	for row in rows:
		var locked:bool=not craft and (row.locked or row.crafted)
		var label:String=row.name+(" · protected" if locked else "")
		choices.add_item(label)
		var at:=choices.item_count-1
		choices.set_item_metadata(at,row)
		choices.set_item_disabled(at,locked)
		if not locked and first<0:first=at
	if first>=0:choices.select(first)
	_preview()
	return _quote

func _cost(amount: Dictionary) -> String:
	return "%d %s" % [int(amount.count),String(amount.essence).capitalize()]

func _preview() -> void:
	get_ok_button().disabled=true
	if not _quote.get("ok",false):return
	var action:String=ACTIONS[action_choice.selected]
	var cost:Dictionary={}
	var text:="%d of %d crafting slots used.\n" % [int(_quote.crafted),int(_quote.slots)]
	var allowed:=true
	if action=="craft-affix":
		ok_button_text="Craft"
		if choices.item_count==0:
			preview.text="No learned affix is available for this item. Break down gear to learn its affix families."
			return
		var choice:Dictionary=choices.get_item_metadata(choices.selected)
		cost=choice.cost
		allowed=_quote.crafted<_quote.slots
		text+="Craft "+choice.name+". Standard roll; no crafting challenge bonus."
	elif action=="craft-socket":
		ok_button_text="Add socket"
		cost=_quote.socket.cost
		allowed=_quote.crafted<_quote.slots and _quote.socket.count<_quote.socket.cap
		text+="%d of %d sockets used." % [int(_quote.socket.count),int(_quote.socket.cap)]
	elif action=="reroll-affix":
		ok_button_text="Reroll"
		cost=_quote.reroll.cost
		allowed=choices.item_count>0 and choices.selected>=0 and not choices.is_item_disabled(choices.selected)
		text="Replaces the selected natural affix's roll and protects the result from further rerolls. Crafted and protected affixes cannot be rerolled.\nStandard roll; no challenge bonus."
	else:
		ok_button_text="Break down"
		allowed=_profile.saved.state.items.any(func(row):return row.uid==_item.uid) and not _item.get("locked",false) and not _item.has("questId") and not _item.has("relicKey") and not _item.has("mem")
		text="Destroys "+String(_item.name)+" for materials and studies its natural affixes."
	var station:String="oracle" if action=="reroll-affix" else "salvage"
	if not _profile.station_access.get(station,false):
		allowed=false
		text+="\nThis station is not available."
	if not cost.is_empty():
		text+="\nCost: "+_cost(cost)+"."
		if _profile.saved.state.essences.get(cost.essence,0)<cost.count:
			allowed=false
			text+=" Not enough materials."
	if not allowed:text+="\nThis action is unavailable."
	preview.text=text
	get_ok_button().disabled=not allowed

func _confirm() -> void:
	if get_ok_button().disabled or _quote.is_empty():return
	var action:String=ACTIONS[action_choice.selected]
	var choice:Dictionary=choices.get_item_metadata(choices.selected) if choices.visible and choices.selected>=0 else {}
	var reply:Dictionary=_profile.begin_station(action,int(_item.uid),_revision,choice.get("id",""),int(choice.get("index",-1)))
	var message:String={"craft-affix":"Affix crafted.","craft-socket":"Socket added.","reroll-affix":"Affix rerolled.","break-down":"Item broken down."}[action]
	_quote={}
	submitted.emit(reply,message)
