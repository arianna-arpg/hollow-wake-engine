# Godot crafting stations checkpoint

This local candidate completes durable gear affix crafting, socket addition,
natural-affix rerolls and pack salvage in the inventory dialog. It preserves the
original rules and authored content. The SDK as a whole remains incomplete.

Accepted evidence:

- `verification.json`: 1,578 SDK tests, 18 Node and browser session contracts,
  14 SDK faults, source hashes and compressed logs. The interrupted full
  verification resumed at the first unfinished command; all 18 remaining
  commands passed. The final package reran its installation contracts after
  documentation updates. All 450 runtime/content members match the package
  challenged by the full verification.
- `delivery-windows.json` and `delivery-linux.json`: normal cold editor
  import, 79 station assertions in both editor and relocated exported player,
  exact save reopening, and retained background-save/inlay courses. Both native
  extensions were discovered without a supplied editor cache.
- `faults-windows.json` and `faults-linux.json`: five faults rejected on each
  platform, followed by a restored passing course. They drop unpaid RNG
  persistence, ignore stale revisions, bypass revoked access, skip runtime
  rollback and enable protected choices. `station-dialog.png` is the accepted
  Windows 960×600 render.
- `workflows-windows.json` and `workflows-linux.json`: the unchanged 56 original
  command replies, 95 gear cards, 42 support cases, 15 recall cases and 21
  readonly-view assertions, including three view-cache faults.
- `station-cases.json` derives input, prices, rewards and expertise expectations
  from hashed original-game fixtures through `prepare-station-course.mjs`.
  `archive-tests.json` verifies both legacy archive refresh paths, including
  missing-dialog rejection and duplicate-member prevention.
- `benchmark.log.gz`: the required original/extracted contact benchmark retains
  equal checksums in all seven rounds. It does not measure the new station UI or
  establish a target-device frame budget.

The final SDK archive SHA-256 is
`92212dc55038e364516fdaa568c5cdd384437b69b4503978dbe291ed045cb1ed`.
The overlay's minified base is 103,658 bytes, an explicit 406-byte feature cost;
its ceiling is 102 KiB. The full workshop bundle is 113,812 bytes. The native heap
cap remains 32 MiB; no new native build or dependency was needed.

Use the retained `stations-sdk`, `stations-windows` and `stations-linux`
folders under `.artifacts/downloads/0.59.0-candidate.0`. The project ZIP includes
both native addons and the content. The player ZIP is the exact relocated
archive tested here. Scratch paths in receipts are historical test locations;
their consumers and expanded projects are removed after acceptance.

Reproduce using the pinned tools and accepted donor archives from
`evidence/profile-views`: extract each save library, check its recorded hash and
point the native proof's library path at that extraction. Run the installed SDK
session contracts, prepare the station fixture and overlay, then run
`verify-background-workshop.py`, `check-station-faults.py` and
`check-background-workflows.py --profile-views`. See
[the boundary](../../docs/workshop-stations.md) for arguments and ownership.
The Linux run uses the existing pinned Steam Runtime 4 image without networking.

Development logs retain the corrected script-name and test-fixture failures.
In particular, the original reroll protects its result; attempting a second
reroll was a test mistake. Numeric Godot dictionary type differences were handled
by checking exact portable text and the restored durable view. Windows emitted
its existing root-certificate-store warning; no network operation was tested.

Physical Steam Deck/mobile performance, power-loss durability, hosted Godot
import, crafting challenge input and other engine integrations remain open.
This milestone is a local candidate, not a newly published full-gameplay release.
