# Building and qualifying the bounded release

Use a prepared SDK checkout (`npm ci`, `npm run reference:prepare`,
`npm run reference:install`) and Python 3.9 or later. Runtime consumers need only
Node and, for the reference client, Godot; Python and source preparation are
maintainer build tools.

```sh
npm run build
python scripts/test-combat-inventory-archive.py .artifacts
node scripts/build-combat-inventory-release.mjs --out .artifacts/sdk-release
node scripts/test-combat-inventory-release.mjs --release .artifacts/sdk-release
```

Output/report destinations must be new. Pass `--python <executable>` to either
release script if necessary. To verify the exact archived client with Godot:

```sh
node scripts/prepare-node-godot-tools.mjs --python python
node scripts/test-combat-inventory-release.mjs --release .artifacts/sdk-release --godot-tools .artifacts/m4-godot-tools.json --report .artifacts/sdk-release-player-proof.json
```

The consumer test accepts `--node <executable>` for a second Node runtime. It
does not download runtimes or dependencies. The dedicated GitHub workflow builds
one archive, then tests those identical bytes on Windows/Linux and Node 22/24.
Node 24 jobs also perform the Godot editor/exported-player check. Full `verify`
and `reference:verify` remain the regression gates; performance claims retain
the frozen milestone-five measurements and executable hash.

Keep draft builds private to the local artifact directory until acceptance.
The manifest marks a dirty checkout; only a clean committed source may become
a public release. Do not overwrite a release directory, tag or published asset.
Publish the ZIP, `sdk-release.json`, `SHA256SUMS` and the final verification
sidecar together to the configured public GitHub prerelease. The sidecar records
the exact archive hash and source commit, local full gates and hosted results.

Update `combat-inventory.json` deliberately for a new package set. Keep original
accepted observations unchanged. Any changed performance bundle requires its own
measurement qualification. Do not turn an unrelated optional extension or new
game feature into a hidden release requirement.
