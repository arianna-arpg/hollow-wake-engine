extends Control

const Profile = preload("res://profile.gd")
const INK := Color("#e5e8dd")
const MUTED := Color("#aebfb5")
const GOLD := Color("#e8c58a")
const PANEL := Color("#20302e")
const RARITIES := {"common":INK, "magic":Color("#a6c9ee"), "rare":GOLD, "unique":Color("#e9a281")}

var profile := Profile.new()
var tabs := TabBar.new()
var list := ItemList.new()
var name_label := Label.new()
var properties := Label.new()
var detail_scroll := ScrollContainer.new()
var resources := Label.new()
var status := Label.new()
var primary := Button.new()
var recover := Button.new()
var equip_button := Button.new()
var learn_controls := HBoxContainer.new()
var learn_button := Button.new()
var seat_choice := OptionButton.new()
var compare_button := CheckButton.new()
var forge := Button.new()
var refresh_button := Button.new()
var selected_uid := 0
var displayed_revision := 0
var sample_cargo := false
var save_path := "user://inventory.sqlite3"
var sale_confirmation := VBoxContainer.new()
var sale_question := Label.new()
var keep_stack := Button.new()
var sell_stack := Button.new()
var _pending_sale := {}
var _sale_quote := {}

func _box(color: Color, inset: int) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = color
	box.set_corner_radius_all(6)
	box.set_content_margin_all(inset)
	return box

func _label(node: Label, size: int, color: Color) -> void:
	node.add_theme_font_size_override("font_size",size)
	node.add_theme_color_override("font_color",color)

func _button(node: Button, caption: String, callback: Callable) -> void:
	node.text = caption
	node.custom_minimum_size.y = 44
	node.pressed.connect(callback)

func _ready() -> void:
	if OS.get_cmdline_user_args().has("--cargo-sample"):
		sample_cargo = true
		save_path = "user://inventory-cargo-sample.sqlite3"
	var t := Theme.new()
	t.default_font_size = 18
	t.set_stylebox("normal","Button",_box(Color("#344a43"),12))
	t.set_stylebox("hover","Button",_box(Color("#435e51"),12))
	t.set_stylebox("pressed","Button",_box(Color("#557060"),12))
	t.set_stylebox("disabled","Button",_box(Color("#273430"),12))
	t.set_stylebox("tab_selected","TabBar",_box(Color("#425b4b"),12))
	t.set_stylebox("tab_unselected","TabBar",_box(Color("#243532"),12))
	t.set_stylebox("panel","ItemList",_box(Color("#172421"),10))
	t.set_stylebox("selected","ItemList",_box(Color("#374e42"),6))
	t.set_stylebox("selected_focus","ItemList",_box(Color("#415d4d"),6))
	t.set_constant("v_separation","ItemList",12)
	theme = t
	var margin := MarginContainer.new()
	add_child(margin)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for edge in ["top","bottom","left","right"]: margin.add_theme_constant_override("margin_"+edge,24)
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation",14)
	margin.add_child(stack)
	var header := HBoxContainer.new()
	stack.add_child(header)
	var heading := Label.new()
	heading.text = "Inventory"
	_label(heading,36,INK)
	heading.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(heading)
	_button(forge,"Forge ring",func(): perform("forge"))
	header.add_child(forge)
	tabs.name = "Locations"
	tabs.focus_mode = Control.FOCUS_ALL
	for caption in ["Pack","Overflow","Stash","Equipped","Skills"]: tabs.add_tab(caption)
	stack.add_child(tabs)
	var columns := HBoxContainer.new()
	columns.size_flags_vertical = Control.SIZE_EXPAND_FILL
	columns.add_theme_constant_override("separation",16)
	stack.add_child(columns)
	list.name = "Items"
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.size_flags_stretch_ratio = 1.2
	list.allow_reselect = true
	columns.add_child(list)
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel",_box(PANEL,18))
	columns.add_child(panel)
	var detail := VBoxContainer.new()
	detail.add_theme_constant_override("separation",12)
	panel.add_child(detail)
	_label(name_label,25,GOLD)
	name_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	detail.add_child(name_label)
	_label(properties,17,MUTED)
	properties.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	properties.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	detail_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	detail_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	detail_scroll.focus_mode = Control.FOCUS_ALL
	detail_scroll.gui_input.connect(_scroll_card)
	detail.add_child(detail_scroll)
	detail_scroll.add_child(properties)
	_button(primary,"",func(): perform(["sell","store","withdraw","unequip","unlearn"][tabs.current_tab]))
	detail.add_child(primary)
	seat_choice.add_item("Automatic seat")
	for seat in 8: seat_choice.add_item("Seat %d" % (seat+1))
	learn_controls.add_child(seat_choice)
	_button(learn_button,"Learn skill",func(): perform("learn"))
	learn_controls.add_child(learn_button)
	detail.add_child(learn_controls)
	_button(equip_button,"Equip item",func(): perform("equip"))
	detail.add_child(equip_button)
	compare_button.text = "Compare with equipped"
	compare_button.toggled.connect(func(_on: bool): details())
	detail.add_child(compare_button)
	sale_question.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_label(sale_question,17,GOLD)
	sale_confirmation.add_child(sale_question)
	var choices := HBoxContainer.new()
	sale_confirmation.add_child(choices)
	_button(keep_stack,"Keep stack",_cancel_sale)
	_button(sell_stack,"Sell stack",_confirm_sale)
	choices.add_child(keep_stack)
	choices.add_child(sell_stack)
	detail.add_child(sale_confirmation)
	sale_confirmation.hide()
	_button(recover,"Recover to pack",func(): perform("recover"))
	detail.add_child(recover)
	_label(resources,16,MUTED)
	resources.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	stack.add_child(resources)
	var footer := HBoxContainer.new()
	stack.add_child(footer)
	_label(status,16,INK)
	status.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	footer.add_child(status)
	_button(refresh_button,"Reload",_restart)
	footer.add_child(refresh_button)
	tabs.tab_changed.connect(func(_tab): selected_uid = 0; render(true))
	list.item_selected.connect(func(index): selected_uid = int(list.get_item_metadata(index)); details())
	_restart()
	tabs.grab_focus()

func _restart() -> void:
	profile.close()
	profile = Profile.new()
	var reply := profile.start(save_path,null,sample_cargo)
	selected_uid = 0
	render(true)
	status.text = "Inventory ready." if reply.ok else error_text(reply.reason)

func rows() -> Array:
	if not profile.available: return []
	match tabs.current_tab:
		0: return profile.saved.state.items
		1: return profile.saved.state.overflow
		2: return profile.stash
		3: return profile.saved.state.equipped.values()
		_: return []

func _seat(number: int) -> Variant:
	if not profile.available: return null
	var rack: Array = profile.saved.state.get("rack",[])
	return rack[number-1] if number >= 1 and number <= rack.size() else null

func render(select_first := false) -> void:
	displayed_revision = profile.revision
	list.clear()
	forge.disabled = not profile.available
	if profile.available:
		var state: Dictionary = profile.saved.state
		tabs.set_tab_title(0,"Pack  %d" % state.items.size())
		tabs.set_tab_title(1,"Overflow  %d" % state.overflow.size())
		tabs.set_tab_title(2,"Stash  %d" % profile.stash.size())
		tabs.set_tab_title(3,"Equipped  %d" % state.equipped.size())
		var wallet := PackedStringArray()
		for key in state.essences:
			wallet.append("%s × %d" % [String(key).capitalize(),int(state.essences[key])])
		resources.text = "Essences   " + (",  ".join(wallet) if not wallet.is_empty() else "None")
	else:
		resources.text = ""
	var selected := -1
	if tabs.current_tab == 4 and profile.available:
		for number in range(1,9):
			var row: Variant = _seat(number)
			var index := list.add_item("%d   %s" % [number,"Empty" if row == null else String(row.gem.skillId).capitalize()])
			list.set_item_metadata(index,number)
			if number == selected_uid: selected = index
	for item in rows():
		var index := list.add_item(item.name)
		list.set_item_metadata(index,int(item.uid))
		list.set_item_custom_fg_color(index,RARITIES.get(item.rarity,INK))
		if item.uid == selected_uid: selected = index
	if selected < 0 and select_first and list.item_count > 0: selected = 0
	selected_uid = 0
	if selected >= 0:
		list.select(selected)
		selected_uid = int(list.get_item_metadata(selected))
	details()

func details() -> void:
	_pending_sale = {}
	sale_confirmation.hide()
	primary.show()
	_sale_quote = {}
	var item: Dictionary = {}
	for candidate in rows():
		if candidate.uid == selected_uid: item = candidate; break
	equip_button.hide()
	learn_controls.hide()
	compare_button.hide()
	primary.text = ["Sell item","Move to stash","Return to pack","Unequip to pack","Return skill to pack"][tabs.current_tab]
	primary.disabled = item.is_empty() or (tabs.current_tab == 0 and item.get("locked",false))
	recover.visible = tabs.current_tab == 1
	recover.disabled = item.is_empty()
	detail_scroll.scroll_vertical = 0
	if tabs.current_tab == 4:
		var row: Variant = _seat(selected_uid)
		primary.disabled = row == null
		if row == null:
			name_label.text = "Empty skill seat"
			properties.text = ""
		else:
			show_item({"baseId":"skill_gem","gem":row.gem,"locked":row.get("locked",false)})
		return
	if item.is_empty():
		name_label.text = "Select an item" if list.item_count else ["Pack is empty","Overflow is empty","Stash is empty","No equipment worn"][tabs.current_tab]
		properties.text = ""
	else:
		show_item(item)

func show_item(item: Dictionary) -> void:
	name_label.text = item.get("name","")
	if item.has("gem") or item.has("mem"):
		var selling := tabs.current_tab == 0
		var fit: Variant = [] if not profile.saved.state.get("rack",[]).any(func(row): return row != null) else null
		var reply := profile.api.inspect_cargo(item,{"inBag":selling,"lane":"sell" if selling else null,"confirmMemorySale":true,"attributes":Profile.HERO_ATTRIBUTES},fit)
		if not reply.ok:
			properties.text = "Item details unavailable."
			if selling: primary.disabled = true
			return
		var cargo: Dictionary = reply.card
		learn_controls.visible = selling and cargo.kind == "skill"
		name_label.text = cargo.title
		name_label.add_theme_color_override("font_color",Color.from_string(cargo.color,INK))
		var lines := PackedStringArray(cargo.lines)
		if cargo.locked: lines.insert(0,"Locked")
		if cargo.kind == "support" and cargo.compatibility is Array and cargo.compatibility.is_empty():
			lines.append("No equipped skills.")
		if cargo.quote is Dictionary:
			_sale_quote = cargo.quote
			if cargo.quote.amount is Dictionary:
				lines.append("Sell for %d %s" % [int(cargo.quote.amount.count),cargo.quote.material.label])
			elif cargo.quote.get("reason") == "granted":
				lines.append("Selling removes this granted gem for no essence.")
		properties.text = "\n".join(lines)
		return
	var mode := "full" if compare_button.button_pressed else "compact"
	var card := profile.api.inspect_loadout(item,profile.saved.state.equipped,Profile.HERO_LEVEL,mode)
	if card.ok:
		name_label.text = card.title
		properties.text = card_text(card)
		compare_button.visible = card.hasComparison
		equip_button.visible = tabs.current_tab == 0 and card.wearable
		equip_button.disabled = Profile.ACTOR_LEVEL < card.requiredLevel
	else:
		properties.text = "Item details unavailable."
	name_label.add_theme_color_override("font_color",RARITIES.get(item.rarity,INK))

func card_text(card: Dictionary) -> String:
	var d: Dictionary = card.description
	var lines := PackedStringArray([d.baseLine, card.get("requirement",d.reqLine)])
	for row in d.defense: lines.append(row.text)
	lines.append_array(PackedStringArray(d.implicit))
	for row in d.affix: lines.append(row.tag + "   " + row.text)
	lines.append_array(PackedStringArray(d.unique))
	var groups := PackedStringArray(["\n".join(lines)])
	for socket in d.get("sockets",[]):
		groups.append(socket.glyph + "  " + socket.name + "\n" + socket.line)
	if d.has("epitaph"):
		var word: Dictionary = d.epitaph
		groups.append(word.name + "\n" + "\n".join(PackedStringArray(word.lines)))
		if word.has("flavor"): groups.append(word.flavor)
	if d.has("flavor"): groups.append(d.flavor)
	for proc in card.procReferences: groups.append(proc.name + "\n" + proc.text)
	for target in card.get("targets",[]):
		var comparison := PackedStringArray(["vs %s: %s" % [target.label,target.name]])
		for row in target.rows:
			if row.kind == "delta": comparison.append(row.text + "   " + row.deltaText)
			else: comparison.append({"gain":"+ ","loss":"− ","same":"= "}[row.kind] + row.text)
		if target.rows.is_empty(): comparison.append("grants exactly the same lines")
		groups.append("\n".join(comparison))
	return "\n\n".join(groups)

func _scroll_card(event: InputEvent) -> void:
	var step := 0
	if event.is_action_pressed("ui_up",true): step = -28
	elif event.is_action_pressed("ui_down",true): step = 28
	elif event.is_action_pressed("ui_page_up",true): step = -int(detail_scroll.size.y)
	elif event.is_action_pressed("ui_page_down",true): step = int(detail_scroll.size.y)
	if step != 0:
		detail_scroll.scroll_vertical += step
		detail_scroll.accept_event()

func perform(action: String) -> void:
	if action == "sell" and _sale_quote.get("confirm",false):
		_pending_sale = {"uid":selected_uid,"revision":displayed_revision}
		sale_question.text = "Sell the entire stack for %d %s?" % [int(_sale_quote.amount.count),_sale_quote.material.label]
		primary.hide()
		sale_confirmation.show()
		keep_stack.grab_focus()
		return
	_apply_action(action,selected_uid,displayed_revision)

func _cancel_sale() -> void:
	_pending_sale = {}
	sale_confirmation.hide()
	primary.show()
	primary.grab_focus()

func _unhandled_key_input(event: InputEvent) -> void:
	if sale_confirmation.visible and event.is_action_pressed("ui_cancel"):
		_cancel_sale()
		get_viewport().set_input_as_handled()

func _confirm_sale() -> void:
	var pending := _pending_sale
	_pending_sale = {}
	if not pending.is_empty(): _apply_action("sell",pending.uid,pending.revision)

func _apply_action(action: String, uid: int, revision: int) -> void:
	var slot := seat_choice.selected-1 if action == "learn" else uid-1
	var row: Variant = _seat(uid) if action == "unlearn" else null
	var reply := profile.act(action,uid,revision,slot,row.gem.skillId if row != null else "")
	render()
	if reply.ok:
		status.text = {"forge":"Ring forged.","store":"Item moved to stash.","withdraw":"Item returned to pack.",
			"recover":"Item recovered.","sell":"Item sold.","equip":"Item equipped.","unequip":"Item returned to pack.",
			"learn":"Skill learned.","unlearn":"Skill returned to pack."}[action]
	else:
		status.text = error_text(reply.reason)

func error_text(reason: String) -> String:
	if reason == "requirements unmet": return "The hero does not meet this skill’s attribute requirements."
	if reason == "every seat is taken": return "Choose a seat to replace."
	if reason == "stale-skill": return "That seat has changed. Review the current skill bar."
	if reason == "no room in the bag": return "Make room in the pack before removing this item."
	if reason.begins_with("requires level "): return reason.capitalize() + "."
	return {"pack-full":"The pack is full. Sell an item to make room.","stash-full":"The stash is full.",
		"busy":"Another save is in progress. Reload to try again.","stale-revision":"Another window saved first. Review the latest inventory.",
		"missing-item":"That item has already moved.","protected-item":"This item is protected.",
		"storage":"Check the current inventory before trying again. The save could not be confirmed.",
		"payload-size":"This save slot has reached its size limit.",
		"invalid-record":"This save could not be read. Restore a backup.",
		"invalid-custody":"This save contains inconsistent item ownership. Restore a backup."}.get(reason,"Could not complete the action. Reload the inventory.")

func _exit_tree() -> void:
	profile.close()
