# Milestone six: bounded SDK release

The deliverable is `combat-inventory-v0.1.0-preview.1`: one independently
installable combat and Inventory SDK bundle with the five matched archives,
Node/Godot reference scene, executable adoption example, host-service contract,
compatibility table, accepted comparison courses and portable measurement kit.
Existing packages, previews, optional extensions and historical evidence remain
preserved. There is no npm registry publication or licensing change.

The runtime is the measured milestone-five implementation. The release builder
requires its portable executable to match the accepted workload SHA-256 exactly.
Packaging therefore does not replace the recorded timing results with a new,
unmeasured runtime. Steam Deck and older mobile hardware remain unqualified.

## Consumer and integration acceptance

The clean-project example uses only public installed APIs to create a character,
mint/grant/equip an item, preview without mutation, execute a real cast/contact,
and reconstruct detached character investment. The separate host-service guide
explains clock/input, collision/layers, contacts/projectiles, world-effect
providers, external entitlement/Reliquary projections and publication ownership.

The release verifier extracts the ZIP into an owned temporary folder, installs
all five local archives offline with a fresh npm cache, removes 66 optional
quest/account/persistence runtime/declaration files, and runs:

- 128 composed combat courses with 10,679 observations and 19 ownership contracts;
- 107 adapter/locomotion courses with 4,483 observations, three character courses
  with 30 observations, and 32 adapter contracts;
- the standalone adoption example and explicit refusal of five unprovided
  world-effect services.

Corrupt executable/fixture bytes and a mixed package version must fail before
acceptance. Restored files must pass again. Archive extraction rejects traversal,
absolute paths, case collisions and symlinks before creating output. These are
integrity checks, not a claim of cryptographic publisher authentication.

Godot qualification copies only the included archives and host/client files,
installs them into a fresh consumer, runs the editor, exports the player and
repeats movement/contact/preview/publication with the source scene unavailable.
It never copies a pre-existing dependency tree, game project or editor cache.

## Reproduction and publication

The [maintainer recipe](../release/README.md) builds the archive twice with fixed
ZIP ordering, permissions and timestamps and requires equal hashes on that
toolchain. `sdk-release.json` records the source commit, dirty-source flag, exact
package set, content baseline, optional boundaries and every included file hash.
Published artifacts must have `sourceDirty: false`.

CI assembles one ZIP and downloads those same bytes into Windows/Linux consumers
on Node 22/24. Its Node 24 consumers also verify Godot editor/exported players.
The ordinary repository and original-reference gates remain in place. Release
verification is distributed beside the ZIP and checksums; it is deliberately
outside the ZIP to avoid an archive hashing its own acceptance report.

The small reference UI demonstrates equipment/support/passive actions. It does
not replace the consuming game's full Inventory UI. The public character and
combat APIs, required capability matrix and original comparisons carry the wider
theorycrafting systems, including Vocations, Reliquary and awakenings.

Actual installation into `D:/Games/Hollow-Wake`, new campaigns, account/save
overhauls and complete Unity/Unreal integrations remain separate projects.
Quests and persistence remain optional. This closes the bounded packaging
deliverable without expanding those projects into new SDK completion conditions.
