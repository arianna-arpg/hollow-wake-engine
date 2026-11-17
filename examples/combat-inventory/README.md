# Hollow Wake combat and Inventory SDK

Engineering release `0.2.0-preview.1`. This download contains the five matching
runtime/content packages, a Node/Godot reference scene, executable adoption
examples, original-behavior comparisons and a portable performance runner.
No original game checkout, build tools, quest book, account or database is needed.

## First run

Install Node 22 or 24, extract this ZIP into a new folder, then run there:

```sh
npm install --offline --ignore-scripts --no-audit --no-fund
npm run example
npm run verify
```

The example creates a character, grants and equips an item, previews without
publishing, casts into a real contact, and reconstructs detached character data.
Verification replays the accepted build/combat and adapter courses. It creates
temporary fixtures inside this folder and removes them even on failure.
The packages are local archives; these commands do not fetch registry packages.
Keep all five versions together. `sdk-release.json` records their identities,
content baseline and file hashes; `verify.mjs` rejects changed release files.

## Play the reference scene

Run `npm start`, then open `client/project.godot` in Godot **4.7.2** and run it.
Alternatively run `godot --path client` in a second terminal. Windows can run
`./Play.ps1 -Godot <path-to-Godot.exe>` after installing the packages.
Use WASD, mouse aim, and 1–8 or left click. The Inventory panel demonstrates
equipment, support and passive preview/publication. Other required build families
are available through the public API and exercised by the included comparisons.

The host listens on localhost port 47120. It is a reference bridge, not a
multiplayer server. **Save character** uses memory by default. The optional
`node host/serve.mjs --save-file <your-file>` example replaces that storage port;
it saves character investment, not an entire fight, campaign or account.

## Adopt the SDK

Read [adoption](docs/sdk-adoption.md), [host services](docs/sdk-host-services.md)
and [compatibility](docs/sdk-compatibility.md). `quickstart.mjs` is the minimal
public API example; `host/scene.mjs` demonstrates the larger training setup.
The API declarations ship inside each package. Do not copy private actor records
or internal diagnostic implementations into your game's authority boundary.

The [performance runner](performance/README.md) needs no npm installation and
can be copied separately to a target device. Files named `previous-release-*`
in `evidence/` describe the previous executable, not a measurement of this one.
Steam Deck and older mobile measurements, native Unity/Unreal packages and the
evolving 3D game's adoption remain separate qualifications.

Existing `LICENSE.md` and `NOTICE.md` travel with this release unchanged.
