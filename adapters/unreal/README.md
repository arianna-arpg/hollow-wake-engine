# Hollow Wake Gameplay for Unreal

The Win64 preview exposes Hollow Wake character builds, ordinary casts, hit resolution, timed damage, combat snapshots and memory pouch inspection and recall. The package includes the rules, content, native runtime and a C++ module with Blueprint nodes.

## Try it in an Unreal 5.0.3 project

1. Close the editor. Extract the ZIP into your project's `Plugins` directory so it contains `Plugins/HollowWakeGameplay/HollowWakeGameplay.uplugin`.
2. Open the project. Enable **Hollow Wake Gameplay** under **Edit → Plugins** and restart if prompted.
3. In **Place Actors**, search for **Hollow Wake Training Target**, drag one into a level and press **Play**. Select the running actor to inspect **Last Cast** and **Last Hit**. The included Magician uses Ruin, a support, a passive and a ring. The training target assumes confirmed contact as soon as the cast completes.

The archive with `Binaries/Win64/UnrealEditor-HollowWakeGameplay.dll` includes the editor module for Epic's Win64 5.0.3 build (module build ID 19505902). Windows game builds use the included source and require a working Unreal C++ build environment.

## Use the rules from your game

Get the **Hollow Wake Gameplay Subsystem** for the current world. Call **Create Actor** with a build document, or **Load Magician Configuration** to use the included example. Keep the returned actor handle within that world.

- Send **Press** on input. **Advance** accepts a fixed step duration in seconds and 1–64 steps. Inspect **Steps** to know how much time was consumed. A cast event or target death can stop the batch early. Each world opens its combat runtime on first use and shares immutable definitions across its actors.
- Use **Resolve Contact** when your targeting or collision system confirms a hit. Use **Apply Timed Damage** to apply the configured effect. Subsequent advances report the damage and remaining target life.
- Store the complete string from **Save Actor**. **Restore Actor** resumes the cast, timers and random stream from that snapshot. **Release Actor** retires an individual handle. World teardown disposes the runtimes.
- **Inspect Pouch** reads an inventory and optional memory-state JSON document. **Recall Pouch** returns a proposed replacement with `itemsJson`, `ledgerJson`, `memoryJson` and `nextUid`. Compare the current inventory revision with the one used for the preview, then persist all four fields in a single transaction. Keep UIDs as integers up to the SDK's JSON-safe range.

Blueprint nodes return success and an error message. A busy cast is a delivered cast result with its own reason. Game-thread C++ consumers can use `ExecuteCombat` and `ExecutePouches` for the complete versioned request/reply surface of these two capabilities, including inventory and build operations.

## Packaging and verification

Use the standard Unreal packaging workflow for Windows. The plugin's build rules stage its native library and content as loose runtime dependencies. Keep the plugin directory intact when distributing the packaged game. The runtime verifies the library and content before opening each capability.

In the SDK checkout, `scripts/package-unreal-gameplay.py` rebuilds the plugin from the pinned portable runtime, authored content and current Unreal source. `scripts/verify-unreal-gameplay.py --help` describes the disposable consumer build and replay. Windows x64 is the supported target for this preview.
