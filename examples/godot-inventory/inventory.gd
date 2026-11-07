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
var socket_controls := HBoxContainer.new()
var socket_choice := OptionButton.new()
var socket_button := Button.new()
var recall_button := Button.new()
var recall_dialog := ConfirmationDialog.new()
var recall_group := OptionButton.new()
var recall_facet := OptionButton.new()
var recall_odds := Label.new()
var _recall_view := {}
var _recall_revision := 0
var compare_button := CheckButton.new()
var forge := Button.new()
var sample_button := Button.new()
var vestige_sample_button := Button.new()
var sample_vestiges := false
var inlay_button := Button.new()
var inlay_dialog := ConfirmationDialog.new()
var inlay_material := OptionButton.new()
var inlay_socket := OptionButton.new()
var inlay_preview := Label.new()
var _inlay_item := {}
var _inlay_revision := 0
var heading := Label.new()
var refresh_button := Button.new()
var selected_uid := 0
var displayed_revision := 0
var sample_cargo := false
var sample_supports := false
var save_path := "user://inventory.sqlite3"
var sale_confirmation := VBoxContainer.new()
var sale_question := Label.new()
var keep_stack := Button.new()
var sell_stack := Button.new()
var _pending_sale := {}
var _sale_quote := {}
var _pending_ui: Dictionary = {}
var _save_focus: WeakRef
var _save_elapsed := 0.0
var _closing := false
signal save_finished(reply: Dictionary)

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
	get_tree().auto_accept_quit=false
	if OS.get_cmdline_user_args().has("--cargo-sample"):
		sample_cargo = true
		save_path = "user://inventory-cargo-sample.sqlite3"
	if OS.get_cmdline_user_args().has("--support-sample"):
		sample_supports=true
		save_path="user://inventory-support-sample.sqlite3"
	if OS.get_cmdline_user_args().has("--vestige-sample"):
		sample_vestiges=true
		sample_supports=false
		sample_cargo=false
		save_path="user://inventory-vestiges.sqlite3"
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
	heading.text = "Inventory"
	_label(heading,36,INK)
	heading.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(heading)
	_button(sample_button,"Support sample",_switch_sample)
	header.add_child(sample_button)
	_button(vestige_sample_button,"Vestige sample",_switch_vestiges)
	header.add_child(vestige_sample_button)
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
	socket_choice.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	socket_controls.add_child(socket_choice)
	_button(socket_button,"",_edit_socket)
	socket_controls.add_child(socket_button)
	detail.add_child(socket_controls)
	_button(inlay_button,"Inlay a vestige",_open_inlay)
	detail.add_child(inlay_button)
	inlay_dialog.title="Inlay a vestige"
	inlay_dialog.ok_button_text="Inlay"
	inlay_dialog.min_size=Vector2i(400,245)
	add_child(inlay_dialog)
	var inlay_fields:=VBoxContainer.new()
	inlay_dialog.add_child(inlay_fields)
	for field in [inlay_material,inlay_socket]:
		field.custom_minimum_size.y=44
		field.fit_to_longest_item=false
		inlay_fields.add_child(field)
		field.item_selected.connect(func(_at): _show_inlay_preview())
	inlay_preview.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	inlay_fields.add_child(inlay_preview)
	inlay_dialog.confirmed.connect(_confirm_inlay)
	_button(recall_button,"Recall memory",_open_recall)
	detail.add_child(recall_button)
	recall_dialog.title="Recall memory"
	recall_dialog.ok_button_text="Recall"
	recall_dialog.min_size=Vector2i(400,240)
	add_child(recall_dialog)
	var selectors:=VBoxContainer.new()
	recall_dialog.add_child(selectors)
	for selector in [recall_group,recall_facet]:
		selector.custom_minimum_size.y=44
		selector.fit_to_longest_item=false
		selectors.add_child(selector)
		selector.item_selected.connect(func(_at): _recall_details())
	recall_odds.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	selectors.add_child(recall_odds)
	recall_dialog.confirmed.connect(_confirm_recall)
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

func _switch_sample() -> void:
	if profile.is_saving(): return
	sample_vestiges=false
	sample_supports=not sample_supports
	save_path="user://inventory-support-sample.sqlite3" if sample_supports else ("user://inventory-cargo-sample.sqlite3" if sample_cargo else "user://inventory.sqlite3")
	tabs.current_tab=0
	_restart()

func _switch_vestiges() -> void:
	if profile.is_saving(): return
	sample_supports=false
	sample_vestiges=not sample_vestiges
	save_path="user://inventory-vestiges.sqlite3" if sample_vestiges else ("user://inventory-cargo-sample.sqlite3" if sample_cargo else "user://inventory.sqlite3")
	tabs.current_tab=0
	_restart()

func _restart() -> void:
	if profile.is_saving(): return
	inlay_dialog.hide()
	_inlay_item={}
	recall_dialog.hide()
	profile.close()
	profile = Profile.new()
	var reply := profile.start(save_path,null,sample_cargo and not sample_vestiges,sample_supports,sample_vestiges)
	heading.text="Vestige workshop" if sample_vestiges else ("Support workshop" if sample_supports else "Inventory")
	vestige_sample_button.text="Back to inventory" if sample_vestiges else "Vestige sample"
	sample_button.text=("Back to cargo sample" if sample_cargo else "Back to inventory") if sample_supports else "Support sample"
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
	if profile.is_saving(): return
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
	if profile.is_saving(): return
	_pending_sale = {}
	sale_confirmation.hide()
	primary.show()
	_sale_quote = {}
	var item: Dictionary = {}
	for candidate in rows():
		if candidate.uid == selected_uid: item = candidate; break
	equip_button.hide()
	learn_controls.hide()
	socket_controls.hide()
	recall_button.hide()
	inlay_button.hide()
	socket_choice.clear()
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
		var fit: Variant = null
		var fit_failed := false
		if item.get("gem",{}).get("kind")=="support":
			var gate := profile.compatible_seats(int(item.uid)) if selling else profile.api.support_fit(profile.saved.state.get("rack",[]),item.gem)
			if gate.ok: fit=gate.rows
			else: fit_failed=true
		var edit_skill: bool=item.get("gem",{}).get("kind")=="skill" and (selling or tabs.current_tab==4)
		var reply := profile.api.inspect_cargo(item,{"inBag":selling,"lane":"sell" if selling else null,"confirmMemorySale":true,"attributes":Profile.HERO_ATTRIBUTES},fit,edit_skill)
		if not reply.ok:
			properties.text = "Item details unavailable."
			if selling: primary.disabled = true
			return
		var cargo: Dictionary = reply.card
		recall_button.visible = selling and cargo.kind=="memory"
		learn_controls.visible = selling and cargo.kind == "skill"
		name_label.text = cargo.title
		name_label.add_theme_color_override("font_color",Color.from_string(cargo.color,INK))
		var lines := PackedStringArray(cargo.lines)
		if fit_failed: lines.append("Support compatibility unavailable.")
		if edit_skill:
			socket_button.text="Remove support"
			for at in item.gem.sockets.size():
				var seated: Variant = item.gem.sockets[at]
				if seated==null: continue
				socket_choice.add_item("%d · %s L%d" % [at+1,reply.socketNames[socket_choice.item_count],seated.level])
				socket_choice.set_item_metadata(socket_choice.item_count-1,{"act":"unsocket","uid":selected_uid if selling else 0,
					"slot":-1 if selling else selected_uid-1,"skill":item.gem.skillId,"index":at,"supportId":seated.supportId})
		elif cargo.kind=="support" and selling and cargo.compatibility is Array:
			socket_button.text="Socket support"
			for row in cargo.compatibility:
				if row.fits and row.occupied<row.sockets:
					socket_choice.add_item("Seat %d · %s" % [row.slot+1,row.name])
					socket_choice.set_item_metadata(socket_choice.item_count-1,{"act":"socket","uid":selected_uid,"slot":int(row.slot),"skill":row.skillId})
				else:
					lines.append("%s · %s" % [row.name,"sockets full" if row.fits else "incompatible"])
		socket_controls.visible=socket_choice.item_count>0
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
		inlay_button.visible=tabs.current_tab in [0,3] and not item.get("sockets",[]).is_empty() and not profile.saved.state.get("vestiges",{}).is_empty()
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
	if profile.is_saving(): return
	if action == "sell" and _sale_quote.get("confirm",false):
		_pending_sale = {"uid":selected_uid,"revision":displayed_revision}
		sale_question.text = "Sell the entire stack for %d %s?" % [int(_sale_quote.amount.count),_sale_quote.material.label]
		primary.hide()
		sale_confirmation.show()
		keep_stack.grab_focus()
		return
	_apply_action(action,selected_uid,displayed_revision)

func _edit_socket() -> void:
	if profile.is_saving(): return
	if socket_choice.selected<0: return
	var target: Dictionary = socket_choice.get_item_metadata(socket_choice.selected)
	var reply := profile.begin_action(target.act,target.uid,displayed_revision,target.slot,target.skill,target)
	_accept_result(reply,{"first":true,"success":"Support socketed." if target.act=="socket" else "Support returned to pack."})

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
	if profile.is_saving(): return
	var slot := seat_choice.selected-1 if action == "learn" else uid-1
	var row: Variant = _seat(uid) if action == "unlearn" else null
	var reply := profile.begin_action(action,uid,revision,slot,row.gem.skillId if row != null else "")
	var message: String={"forge":"Ring forged.","store":"Item moved to stash.","withdraw":"Item returned to pack.",
		"recover":"Item recovered.","sell":"Item sold.","equip":"Item equipped.","unequip":"Item returned to pack.",
		"learn":"Skill learned.","unlearn":"Skill returned to pack."}.get(action,"Action completed.")
	_accept_result(reply,{"success":message})

func _accept_result(reply: Dictionary, context: Dictionary) -> void:
	if reply.get("pending",false):
		_pending_ui=context
		_save_elapsed=0.0
		_set_saving(true)
		status.text="Saving…"
		return
	_complete_action(reply,context)

func _complete_action(reply: Dictionary, context: Dictionary) -> void:
	var message: String=context.get("success","Saved.")
	if reply.ok and context.get("recall",false):
		selected_uid=int(reply.result.itemUid)
		message="Recalled "+reply.result.name+"."
	render(context.get("first",false))
	status.text=message if reply.ok else error_text(reply.reason)

func _set_saving(saving: bool) -> void:
	if saving:
		var focused:=get_viewport().gui_get_focus_owner()
		_save_focus=weakref(focused) if focused!=null else null
		status.focus_mode=Control.FOCUS_ALL
		status.grab_focus()
	for button in [forge,primary,recover,equip_button,learn_button,socket_button,recall_button,inlay_button,
			 sample_button,vestige_sample_button,refresh_button,sell_stack,keep_stack,compare_button,seat_choice,socket_choice]:
		button.disabled=saving
	for i in tabs.tab_count: tabs.set_tab_disabled(i,saving)
	list.mouse_filter=Control.MOUSE_FILTER_IGNORE if saving else Control.MOUSE_FILTER_STOP
	list.focus_mode=Control.FOCUS_NONE if saving else Control.FOCUS_ALL
	if not saving: status.focus_mode=Control.FOCUS_NONE

func _process(delta: float) -> void:
	if not profile.is_saving(): return
	var reply:=profile.poll_save()
	if reply.get("pending",false):
		_save_elapsed+=delta
		status.text=("Finishing save" if _closing else "Saving")+".".repeat(1+int(_save_elapsed*4.0)%3)
		return
	var context:=_pending_ui
	_pending_ui={}
	_set_saving(false)
	_complete_action(reply,context)
	var focused: Object=_save_focus.get_ref() if _save_focus!=null else null
	if focused is Control and focused.is_visible_in_tree() and (not focused is BaseButton or not focused.disabled): focused.grab_focus()
	else: tabs.grab_focus()
	_save_focus=null
	save_finished.emit(reply)
	if _closing:
		_closing=false
		if reply.ok: get_tree().quit()

func _notification(what: int) -> void:
	if what==NOTIFICATION_WM_CLOSE_REQUEST:
		if profile.is_saving(): _closing=true;status.text="Finishing save…"
		else: get_tree().quit()

func error_text(reason: String) -> String:
	if reason=="background-save-unavailable": return "The save component needs an update."
	if reason=="save-pending": return "Please wait for the current save."
	if reason=="cancelled": return "Save cancelled. The previous inventory has been restored."
	if reason=="inventory full": return "Make room in the pack before removing a support."
	if reason=="stale-socket": return "That socket has changed. Review the current skill."
	if reason=="cannot-socket": return "This support needs a compatible skill with a free socket."
	if reason=="support-data" or reason=="invalid-support-page": return "The support rules could not be read."
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

func _open_recall() -> void:
	var reply:=profile.recall_view(selected_uid)
	if not reply.ok:
		status.text=error_text(reply.reason)
		return
	_recall_view=reply.view
	_recall_revision=displayed_revision
	recall_group.clear()
	recall_facet.clear()
	for row in _recall_view.groups:
		var title: String=row.name+" ×"+str(int(row.count))
		if row.has("pin"): title+=" · "+row.pin.name
		recall_group.add_item(title)
	recall_facet.visible=not reply.facets.is_empty()
	if recall_facet.visible:
		recall_facet.add_item("Choose a facet")
		for facet in reply.facets:
			var attrs:=PackedStringArray()
			for attr in facet.attrs: attrs.append(attr.short)
			recall_facet.add_item(facet.label+" · "+" / ".join(attrs))
			recall_facet.set_item_metadata(recall_facet.item_count-1,facet.id)
	_recall_details()
	recall_dialog.popup_centered()

func _recall_details() -> void:
	var row: Dictionary=_recall_view.groups[recall_group.selected]
	var line: String=""
	match row.rung:
		"kit":
			var names:=PackedStringArray()
			for chip in row.kit: names.append(chip.name+" ×"+str(chip.mult))
			line=", ".join(names)
		"bias": line="Favors "+", ".join(PackedStringArray(row.tags))
		"pinned": line="Sealed to "+row.pin.name
	recall_odds.text=_recall_view.refusal if _recall_view.refusal!=null else line
	recall_dialog.get_ok_button().disabled=_recall_view.refusal!=null or (recall_facet.visible and recall_facet.selected<=0)

func _confirm_recall() -> void:
	if profile.is_saving(): return
	if _recall_view.is_empty() or recall_dialog.get_ok_button().disabled: return
	var row: Dictionary=_recall_view.groups[recall_group.selected]
	var facet: String=recall_facet.get_item_metadata(recall_facet.selected) if recall_facet.visible else ""
	var reply:=profile.begin_recall(int(_recall_view.uid),_recall_revision,row.key,facet)
	_accept_result(reply,{"recall":true})
	_recall_view={}

func _open_inlay() -> void:
	_inlay_item={}
	for item in rows():
		if item.uid==selected_uid: _inlay_item=item;break
	if _inlay_item.is_empty():return
	_inlay_revision=displayed_revision
	var view:=profile.api.view_inlay(_inlay_item,profile.saved.state.get("vestiges",{}))
	if not view.ok:status.text=error_text(view.reason);return
	inlay_material.clear()
	for row in view.materials:
		inlay_material.add_item("%s ×%d" % [row.name,row.count])
		inlay_material.set_item_metadata(inlay_material.item_count-1,row.id)
	inlay_socket.clear()
	inlay_socket.add_item("First empty socket")
	for i in view.sockets.size():
		inlay_socket.add_item("Socket %d · %s" % [i+1,view.sockets[i]])
	_show_inlay_preview()
	inlay_dialog.popup_centered()

func _show_inlay_preview() -> void:
	inlay_dialog.get_ok_button().disabled=true
	if inlay_material.selected<0:inlay_preview.text="Your satchel has no vestiges.";return
	var id:String=inlay_material.get_item_metadata(inlay_material.selected)
	var view:=profile.api.view_inlay(_inlay_item,profile.saved.state.get("vestiges",{}),id,inlay_socket.selected-1)
	if not view.ok:inlay_preview.text=error_text(view.reason);return
	var plan:Dictionary=view.preview
	if not plan.changed:
		inlay_preview.text="All sockets are full. Choose the socket to replace." if plan.reason=="sockets-full" else error_text(plan.reason)
		return
	inlay_preview.text="Consumes one vestige in socket %d." % (int(plan.index)+1)
	if plan.replacedName!=null:inlay_preview.text+=" "+str(plan.replacedName)+" will be destroyed."
	if plan.epitaphName!=null:inlay_preview.text+=" Awakens "+str(plan.epitaphName)+"."
	inlay_dialog.get_ok_button().disabled=false

func _confirm_inlay() -> void:
	if profile.is_saving(): return
	if _inlay_item.is_empty() or inlay_dialog.get_ok_button().disabled:return
	var id:String=inlay_material.get_item_metadata(inlay_material.selected)
	var reply:=profile.begin_inlay(_inlay_item.uid,_inlay_revision,id,inlay_socket.selected-1)
	_inlay_item={}
	_accept_result(reply,{"success":"Vestige inlaid."})

func _exit_tree() -> void:
	profile.close()
