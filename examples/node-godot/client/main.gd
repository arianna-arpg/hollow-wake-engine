extends Node3D

const Wire = preload("res://network.gd")
var wire := Wire.new()
var camera := Camera3D.new()
var actors: Dictionary = {}
var shots: Dictionary = {}
var zone_nodes: Dictionary = {}
var inventory: Dictionary = {}
var state: Dictionary = {}
var bar: Array = []
var actions: Array = []
var sequence := 0
var hero_id := 1
var queued: Array = []
var status_label := Label.new()
var stats_label := Label.new()
var result_label := Label.new()
var action_list := OptionButton.new()
var skills_box := HBoxContainer.new()
var verify := false
var proof_frames := 0
var proof_started := 0.0
var proof_preview := false
var proof_kinds: Array = []
var proof_pending := false
var proof_command: Dictionary = {}
var proof_moved := false
var proof_hit := false
var proof_cast := false
var capture := ""

func _ready() -> void:
	var port := 47120
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--port="):
			port = int(arg.split("=")[1])
		if arg == "--verify":
			verify = true
		if arg.begins_with("--capture="):
			capture = arg.substr(10)
	proof_started = Time.get_ticks_msec() / 1000.0
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 48
	camera.position = Vector3(25, 34, 40)
	add_child(camera)
	camera.look_at(Vector3(25, 0, 18))
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-65, -25, 0)
	light.light_energy = 1.8
	add_child(light)
	var environment := WorldEnvironment.new()
	environment.environment = Environment.new()
	environment.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.environment.ambient_light_color = Color(0.45, 0.55, 0.7)
	environment.environment.ambient_light_energy = 0.7
	add_child(environment)
	_make_ui()
	wire.connect_to(port)
	status_label.text = "Connecting to the local combat host…"

func _material(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.85
	return material

func _box(at: Vector3, size: Vector3, color: Color) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	node.mesh = mesh
	node.material_override = _material(color)
	node.position = at
	add_child(node)
	return node

func _ground(facts: Dictionary) -> void:
	_box(Vector3(float(facts.width) / 60, -0.2, float(facts.height) / 60), Vector3(float(facts.width) / 30, 0.4, float(facts.height) / 30), Color("202d3b"))
	if facts.get("wall") is Dictionary:
		var wall: Dictionary = facts.wall
		_box(Vector3((wall.x + wall.w / 2) / 30, 1, (wall.y + wall.h / 2) / 30), Vector3(wall.w / 30, 2, wall.h / 30), Color("56697a"))
	if facts.get("platform", false):
		_box(Vector3(45, 0.9, 20), Vector3(16.66, 2, 40), Color("2d4652"))
		var ramp := _box(Vector3(35, 0.85, 25), Vector3(3.89, 0.2, 6.66), Color("6d7964"))
		ramp.rotation.z = atan(0.6)
	for x in range(0, int(facts.width / 30) + 1, 5):
		_box(Vector3(x, 0.02, float(facts.height) / 60), Vector3(0.025, 0.01, float(facts.height) / 30), Color("304353"))
	for z in range(0, int(facts.height / 30) + 1, 5):
		_box(Vector3(float(facts.width) / 60, 0.02, z), Vector3(float(facts.width) / 30, 0.01, 0.025), Color("304353"))

func _make_ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	var panel := PanelContainer.new()
	panel.position = Vector2(18, 18)
	panel.custom_minimum_size = Vector2(300, 0)
	layer.add_child(panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 12)
	panel.add_child(column)
	var title := Label.new()
	title.text = "HOLLOW WAKE\nCombat SDK · reference player"
	title.add_theme_font_size_override("font_size", 22)
	column.add_child(title)
	column.add_child(status_label)
	column.add_child(stats_label)
	column.add_child(action_list)
	var buttons := HBoxContainer.new()
	column.add_child(buttons)
	_button(buttons, "Preview", func(): _build(true))
	_button(buttons, "Apply", func(): _build(false))
	_button(column, "Save character", func(): wire.send({"t":"save"}))
	result_label.custom_minimum_size = Vector2(280, 110)
	result_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(result_label)
	var help := Label.new()
	help.text = "WASD · walk\nMouse · aim\n1–8 · cast    Left click · first skill\nHold to maintain a channel or guard\n\nBlue · your character\nAmber · training targets\nRaised floor · use the marked ramp"
	column.add_child(help)
	skills_box.position = Vector2(350, 740)
	layer.add_child(skills_box)

func _button(parent: Node, text: String, callback: Callable) -> void:
	var button := Button.new()
	button.text = text
	button.pressed.connect(callback)
	parent.add_child(button)

func _inventory(data: Dictionary) -> void:
	inventory = data
	var stats: Dictionary = data.stats
	stats_label.text = "Max life %.0f    Max mana %.0f\nDamage %.2f    Move %.0f\nBuild revision %d" % [stats.life, stats.mana, stats.damage, stats.moveSpeed, data.revision]
	actions = data.get("actions", [])
	action_list.clear()
	for action in actions:
		action_list.add_item(action.label)
	bar = data.build.bar
	for child in skills_box.get_children():
		child.queue_free()
	for i in range(bar.size()):
		if bar[i] != null:
			var skill: String = bar[i].id
			_button(skills_box, "%d · %s" % [i + 1, skill.replace("_", " ")], func(): queued.append(skill))

func _build(preview: bool) -> void:
	if actions.is_empty():
		return
	wire.send({"t":"build", "preview":preview, "command":actions[action_list.selected].command})

func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		var index: int = event.keycode - KEY_1
		if index >= 0 and index < bar.size() and bar[index] != null:
			queued.append(bar[index].id)
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed and event.position.x > 330:
		if not bar.is_empty() and bar[0] != null:
			queued.append(bar[0].id)

func _physics_process(_dt: float) -> void:
	for message in wire.poll():
		_message(message)
	if not wire.failure.is_empty():
		status_label.text = wire.failure
	if verify and Time.get_ticks_msec() / 1000.0 - proof_started > 25:
		push_error("Reference player verification timed out")
		get_tree().quit(1)
	if not wire.connected or inventory.is_empty():
		return
	var move := Vector2(float(Input.is_physical_key_pressed(KEY_D)) - float(Input.is_physical_key_pressed(KEY_A)), float(Input.is_physical_key_pressed(KEY_S)) - float(Input.is_physical_key_pressed(KEY_W))).normalized()
	var mouse := get_viewport().get_mouse_position()
	var hit: Variant = Plane(Vector3.UP, 0).intersects_ray(camera.project_ray_origin(mouse), camera.project_ray_normal(mouse))
	var aim := Vector2(610, 410)
	if hit is Vector3:
		aim = Vector2(hit.x * 30, hit.z * 30)
	var held: Array = []
	for i in range(bar.size()):
		if bar[i] != null and (Input.is_physical_key_pressed(KEY_1 + i) or i == 0 and Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)):
			held.append(bar[i].id)
	if verify:
		move = Vector2(1, 0) if proof_frames < 25 else Vector2.ZERO
		aim = Vector2(610, 410)
		if proof_frames >= 30 and not proof_cast:
			queued.append("firebolt")
			proof_cast = true
		_proof_build()
	sequence += 1
	wire.send({"t":"input", "seq":sequence, "move":[move.x,move.y], "aim":[aim.x,aim.y], "press":queued.duplicate(), "held":held})
	queued.clear()

func _message(message: Dictionary) -> void:
	match message.get("t", ""):
		"hello":
			if message.get("profile") != "hollow-wake-sdk/1":
				wire.fail("Incompatible combat host")
				return
			hero_id = int(message.hero)
			_ground(message.ground)
			_inventory(message.inventory)
		"state":
			state = message
			hero_id = int(message.hero)
			_render_state()
			proof_frames += 1
			status_label.text = "Connected · tick %d\nLife %.0f    Mana %.0f" % [message.tick,message.hud.life,message.hud.mana]
			if verify and proof_frames > 120 and proof_moved and proof_hit and proof_preview and proof_kinds.size() == 3:
				_complete_proof()
		"build":
			result_label.text = "Build accepted" if message.get("accepted",false) else "Refused: " + str(message.get("reason","Unavailable"))
			if message.get("preview",false):
				result_label.text = "Preview · life %.0f, mana %.0f\nThe current build is unchanged." % [message.stats.life,message.stats.mana]
				if verify:
					proof_preview = true
					wire.send({"t":"build","command":proof_command})
			elif message.has("inventory"):
				_inventory(message.inventory)
				if verify:
					proof_kinds.append(proof_command.kind)
					proof_pending = false
		"inventory":
			_inventory(message.inventory)
		"saved":
			result_label.text = "Character stored by the host" if message.get("accepted",false) else "Storage unavailable"
		"refused", "fatal":
			result_label.text = str(message.get("reason",message.get("message","Refused")))

func _sphere(color: Color, radius: float) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radius = radius
	mesh.height = radius * 2
	mesh.radial_segments = 12
	mesh.rings = 6
	node.mesh = mesh
	node.material_override = _material(color)
	add_child(node)
	return node

func _render_state() -> void:
	var alive: Dictionary = {}
	for body in state.bodies:
		var id := int(body.id)
		alive[id] = true
		if not actors.has(id):
			actors[id] = _sphere(Color("67c9df") if body.team == "player" else Color("e3a969"), float(body.r) / 30)
		actors[id].position = Vector3(float(body.x) / 30, float(body.h) / 100 + float(body.r) / 30, float(body.y) / 30)
		actors[id].visible = not body.dead
		if id == hero_id and abs(float(body.x) - 400) > 20:
			proof_moved = true
		if id == 2 and body.life < 100000:
			proof_hit = true
	for id in actors.keys():
		if not alive.has(id):
			actors[id].queue_free()
			actors.erase(id)
	var shot_ids: Dictionary = {}
	for shot in state.shots:
		var id := int(shot.id)
		shot_ids[id] = true
		if not shots.has(id):
			shots[id] = _sphere(Color("ff865b"), 0.15)
		shots[id].position = Vector3(float(shot.x) / 30, float(shot.h) / 100, float(shot.y) / 30)
	for id in shots.keys():
		if not shot_ids.has(id):
			shots[id].queue_free()
			shots.erase(id)
	# Zones are host-owned lifetimes, rendered without a client effect clock.
	for i in range(state.zones.size()):
		if not zone_nodes.has(i):
			zone_nodes[i] = _sphere(Color("706aae"), 0.6)
		var zone: Dictionary = state.zones[i]
		zone_nodes[i].position = Vector3(float(zone.pos.x) / 30, 0.1, float(zone.pos.y) / 30)
	for id in zone_nodes.keys():
		if id >= state.zones.size():
			zone_nodes[id].queue_free()
			zone_nodes.erase(id)

func _proof_build() -> void:
	if proof_pending or proof_kinds.size() >= 3:
		return
	for action in actions:
		if not proof_kinds.has(action.command.kind):
			proof_pending = true
			proof_command = action.command
			wire.send({"t":"build","preview":true,"command":proof_command})
			return

func _complete_proof() -> void:
	verify = false
	if not capture.is_empty() and DisplayServer.get_name() != "headless":
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(capture)
	print("HWE_NODE_GODOT " + JSON.stringify({"passed":true,"states":proof_frames,"moved":proof_moved,"contact":proof_hit,"preview":proof_preview,"buildKinds":proof_kinds,"revision":inventory.revision}))
	get_tree().quit(0)
