# Crafting and progression in a Godot project

The combined desktop archive contains one native extension, crafting and
progression wrappers, their authored definitions and licenses. It is a control
API for the inventory or account screen. It doesn't create UI, grant station
access or write to the game's save directory on its own.

1. Copy the archive's `addons/hollow_wake` directory into a fresh Godot 4.7.2
   project for the platform on the archive. Back up an existing installation
   before replacing it. The automated installer refuses to merge folders.
2. In the export preset's non-resource filter include `*.json,*.txt,*.md`.
3. Preload `res://addons/hollow_wake/crafting/crafting.gd`, instantiate it
   and call `start()`. Open a profile with an explicit seed and starting
   inventory, or restore a matching save. The archive includes a complete
   startup and forge example in `crafting/README.md`.
4. Use the session's commands for item creation, affix work, socket changes,
   lock state, salvage or overflow. Read the returned events, including
   gameplay refusals. The game decides station access and owns the destination
   of a transferred item. Persist both sides of a transfer as one transaction.
5. For account purchases, class claims or memory rewards, instantiate
   `res://addons/hollow_wake/progression/progression.gd`. Each started
   capability owns a separate VM. Profile numbers may repeat between them;
   that does not share a wallet, authorize actions or synchronize saves.
   Close sessions when the screen or game no longer needs them.

## Saves

```gdscript
var snapshot := crafting.snapshot(1)
if snapshot.ok:
    var durable := crafting.to_portable_json(snapshot.save)
    if durable.ok:
        # Give durable.text to the game's atomic save facility.
        pass

# On a started host with a free profile handle:
var decoded := crafting.from_portable_json(saved_text)
if decoded.ok:
    var restored := crafting.restore_profile(1, decoded.value)
```

The portable representation is standard JSON. The generic Godot JSON converter
changed a real item roll from `0.011704753153026104` to `0.0117047531530261`
in the initial Windows replay, even with full precision enabled. The wrapper
now exchanges a bounded class of small integers directly and other finite
numbers as their binary64 bits internally. Text resembling an internal marker
roundtrips as text. The public helpers use the embedded runtime's JSON reader
and writer; they do not modify a profile. Keep the returned text intact. The
Godot API still exposes numeric fields as floats, including safe integer IDs.
See also [Godot's JSON parsing notes](https://docs.godotengine.org/en/stable/classes/class_json.html).

Neither JSON nor this adapter authenticates a save. Supply trusted station
flags on each gated command, enforce the game's authority policy, and restore
only compatible content. An interrupted native response does not establish
that a payment or transfer failed. Recover from the game's durable checkpoint;
do not automatically repeat the action.

## Reproduction and scope

Start with the native-library, base-addon and tool receipts created together by
the Godot workflow. The platform-specific extension and native library must
match their receipts. On a checkout with dependencies and reference inputs:

```text
node scripts/build-godot-progression.mjs --base <verified-godot-dir> --library-proof <matching-library-dir> --tools <tools.json>
node scripts/test-godot-progression.mjs --package <progression-package.json> --tools <tools.json>
node scripts/test-progression-session-faults.mjs --package <progression-package.json>
node scripts/build-godot-crafting.mjs --progression <progression-package.json> --tools <tools.json>
node scripts/test-godot-crafting.mjs --package <combined-package.json> --tools <tools.json>
node scripts/test-godot-crafting-faults.mjs --package <combined-package.json> --tools <tools.json>
node scripts/record-godot-crafting.mjs --out <new-evidence-directory>
```

The builder installs the same SDK archive in a fresh consumer, checks the item,
crafting and skill content against the accepted hashes, and replays all 56
reference commands before assembling the addon. It builds the complete vestige
entry point, including the learned-skill rack, supports, inlays, versioned views
and station quotes. A packaged-bundle contract exercises these capabilities and
save continuation. Substituting the older support-only entry point or disabling
the inlay preview must fail that contract. The builder removes the installed
consumer on success and failure; archives, receipts and build logs remain.
The archive preserves every
member of the progression package. The verifier imports in a fresh project,
plays the course in the editor, exports a release, moves the original project
and export away, then plays the relocated executable. An independent reader
compares every returned value and array position against the retained reference;
the executable doesn't contain the expected replies. The course exercises 128
bag items, 3,929 lore entries, two loaded profiles, payments, recovery, save files
and continued random draws and item IDs. It also runs both capabilities at once.
The [Windows evidence](../evidence/godot-crafting/windows.json) records the
archive digest, engine metrics and observed replies. Three additional runs
break numeric precision, automatic salvage selection and overflow custody in
an isolated installed copy; the clean copy passes before and after the faults.

The 32 MiB default bounds tracked embedded allocations **per started host**. It
is not the game's memory footprint or a guarantee for arbitrary workloads.
The combined addon has Windows x64 editor/export evidence and Linux x86_64
editor/export and Valve Platform evidence. Physical Steam Deck and older mobile
hardware, rendered UI, Unity and Unreal remain separate acceptance work.
See the [Steam Runtime results](steam-runtime.md) and [device test instructions](steamrt-device-run.md).

The [fresh package checkpoint](../evidence/fresh-godot-package/README.md) fixes
the canonical builder's missing vestige entry and incomplete bundle selection.
That checkpoint is Windows-only; previous Linux workshop evidence used the
recorded overlay workflow and does not qualify the revised fresh build path.
