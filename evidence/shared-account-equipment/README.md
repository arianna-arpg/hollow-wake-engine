# Shared account equipment checkpoint

Runtime and course source: `5d138fb0b0f8f3271172f002a6e317abb8df9cf9`.
This qualifies a **development path**, not a new public package release or the
entire SDK. The public installation checkpoint remains gameplay 0.5 and storage
0.4. Candidate archives are gameplay 0.6.0-candidate.0 and storage 0.5.0-candidate.0.

- Full SDK verification passed 1,666 tests and its package/fault checks.
  The installed shared-account/browser course passed 33 contracts and 26 faults;
  its 159,687-byte bundle fits the unchanged 180 KiB limit. The complete original
  reference verifier also passed. Frozen expectations were never regenerated.
- Both portable and compiled-text shared owners matched 12 original equipment
  courses: 74 observations and 17 equipment publications per route.
- Actual Unity 2021.3.6f1 Windows x64 Editor and relocated Mono player runs
  exercised two bound actors during casting, elapsed time, contact randomness
  and timed damage. Independent comparisons preserve complete live state across
  equipment publication, while SQLite reads verify complete durable groups.
- Five lifecycle paths cover repeated Play Mode entry/exit without domain
  reload and script reload. Bound actors retire; the host-owned combat world
  remains the caller's responsibility. All tracked native allocations reach
  zero when their owners dispose.
- Eight broken equipment coordinators and six retained shared-save faults
  failed their intended Unity assertions. A separate injected failure after
  the first actor publishes closes every bound actor and preserves the complete
  acknowledged save for recovery.
- Candidate storage also passed alone and with the exact public gameplay 0.5
  archive, whose source was checked at its original commit. Standalone storage
  retains its process-interruption/reopen and independent SQLite checks.

Account-only changes make zero combat requests. The measured complete equipment
course peaks are 30,720,846 shared-account and 25,507,426 combat tracked native
bytes. These are desktop observations, not total memory, speedups or Steam Deck
and older-mobile acceptance. The admitted gear remains common unsocketed
Lapis/Coral rings and Opal amulets; broader effects need their own boundary.

`reports.json.gz` preserves structured receipts. `observations.json.gz` contains
complete JSON observations and fault outcomes. Unity workstation/licensing logs
remain local. SDK logs replace workspace directory names with `<workspace>`;
the manifest records both original and published hashes. Earlier failed test
attempts remain local, including the corrected actor-versus-world ownership
assumption and Windows long-path cleanup recovery.

After fetching the runtime source above, run:

```text
node adapters/unity-shared-account/qualification/check-equipment-evidence.mjs --source-ref 5d138fb0b0f8f3271172f002a6e317abb8df9cf9
```

The checker validates actual source blobs, frozen fixtures, complete actor/save
observations, failure assertions, package preservation, compatibility and SDK
receipts. It validates retained evidence; it does not run Unity itself.

For fresh engine reproduction, use the builders and courses in
`adapters/unity-shared-account/qualification`. `equipment-package.py` takes the
exact public gameplay 0.5 and storage 0.4 tarballs and creates a fresh candidate
directory. `equipment-faults.py` takes that directory and a Unity 2021.3.6f1
editor. `equipment-reference.mjs` writes a fresh original-comparison report
after building the SDK. Every verifier owns and removes its temporary project.

`prepare-public-parent.py --archive PUBLIC_GAMEPLAY_TARBALL --output
.artifacts/PARENT_FOLDER` materializes the public receipt and frozen 579/84-step
inputs from the repository's accepted evidence. This supplies the gameplay
folder for `equipment-compatibility.py`; its `qualification-inputs.json.gz`
also supplies `storage-faults.py --fixtures`. No private prior run or newly
generated expected result is required.

Broader retained-feature/package distribution checks, release guides and archive
controls remain prerequisites for publishing these candidates. Other engine
bindings, Unity Linux/ARM/IL2CPP and physical-device performance remain open.

The [retained-feature follow-up](retained/README.md) now records the completed
gameplay, shared-account, progression, separate-equipment, paired-save and
archive courses for these exact candidates. Final release preparation and
versioned package installation remain separate.
