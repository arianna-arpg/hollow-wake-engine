# Desperate Ward for Godot

This example runs Hollow Wake’s Desperate Ward talent through the SDK's trigger,
cooldown and effect services. The addon includes the native host and the assets
for the talent. Extract the ZIP into a Godot project so that the extension lives
at `res://addons/hollow_wake/hollow_wake.gdextension`.

```gdscript
extends Node

const Ward = preload("res://addons/hollow_wake/ward/ward.gd")
var ward := Ward.new()

func _ready() -> void:
    if ward.start() != 0:
        push_error("Could not start the Hollow Wake host")
        return
    ward.ward_gained.connect(_on_ward_gained)
    ward.equip(0, 1)
    ward.low_life(0, 0.0)

func _on_ward_gained(actor: int, value: float, cue: Dictionary) -> void:
    print(actor, " gained ward. Total ", value, " color ", cue.color)

func _exit_tree() -> void:
    ward.close()
```

Create one host for the scene and call `equip(actor_id, seed)` once per actor.
Send a low-life event with nondecreasing simulation time in seconds. The effect
returns the current ward total, a cue when a grant succeeds, and the number of
random draws. Calls at 0, 1 and 20 seconds for actor 0 with seed 1 return 30,
30 and 60 ward. Remove an actor when it leaves. The example accepts up to 64
active actors. Each actor has its own random stream, ward and cooldown. The
precompiled definitions are shared. Actor IDs are unsigned 32-bit integers.
`start()` gives this example a 4 MiB embedded heap budget. `metrics()` reports
the host's tracked live and peak bytes. These counters cover the embedded
runtime, while Godot's renderer and other process allocations have separate costs.

For a release export include the addon’s `*.txt` and `*.json` assets in the
export preset. The native bridge requires the two platform libraries included
in the addon. This build targets Godot 4.7.2 and the architecture named on its
ZIP. Its ward sample accepts simulation events from a host game. Physics,
health-threshold detection, rendering and input belong to that game.
