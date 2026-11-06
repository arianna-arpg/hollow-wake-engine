# Unreal gameplay verification

The Win64 test uses Epic's installed Unreal Engine 5.0.3 (changelist 20979098). The plugin uses the same native library, combat rules, memory pouch rules and four content/rule digests as the accepted Unity preview. The test supplies the clock and inputs from outside the plugin.

The verification builds a C++ game and an editor module. A second project with no C++ game module installs the ZIP, creates a Blueprint subclass of the training target and saves it. The C++ consumer then loads that asset in the editor executable's game mode and the relocated, cooked Windows game.

Each process replays 60 frozen combat requests and 2,334 pouch requests. The external checker compares the combat replies, pouch views, generated gems, proposed inventory order, ledgers, memory and refusal reasons to original-game observations. Further checks create a configured Magician, refuse a duplicate cast, save during wind-up, restore the actor, stop precisely at the cast event, resolve contact, apply timed damage and retire the handle. A typed pouch recall checks an item UID above 32 bits.

`windows.json` records the archive digest, engine build, Blueprint class paths and per-process results. The wire counters measure UTF-8 requests and replies crossing the native boundary. Memory counters cover the embedded runtime's tracked allocator. The game and editor processes also allocate memory outside that allocator.

The cooked player uses offscreen Direct3D 11. With Unreal's null renderer, that same executable completed the course and wrote the correct results, then faulted in `Nanite::FGlobalResources::ReleaseRHI → GPUMessage::FSocket::Reset` during static destruction. Acceptance requires the player's actual process exit code to be zero. The editor and cook use their headless modes.

Both hosts stopped on the same cast event after 16 fixed steps. The single-step path transferred 2,630 bytes across 16 calls. The batched path transferred 232 bytes in one call, with identical saved state and hit damage. Peak tracked memory for the replay was 25,485,411 bytes for combat and 4,577,702 bytes for pouches. A separate cooked launch changed one byte of pouch content. The plugin refused the pouch runtime and successfully opened, used and released combat. The driver restored the original bytes before the full player replay.

The full SDK verification passed 1,557 tests and its additional mutation and package checks. Source reference verification passed. The standalone 20,000-contact benchmark produced matching checksums in seven rounds. Reassembling the ZIP from the same compiled editor module produced the same SHA-256 digest.

Run `scripts/verify-unreal-gameplay.py --help` from the SDK checkout for reproduction inputs. Use Unreal's Win64 C++ prerequisites, including the native .NET Framework SDK expected by this engine version. The verifier creates its disposable projects inside the checkout's ignored artifact directory and removes them on exit. Measurements on a physical Steam Deck or mobile device require a build and execution on that target.
