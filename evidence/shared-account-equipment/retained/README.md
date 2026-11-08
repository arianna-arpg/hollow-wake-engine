# Retained features in the equipment candidates

Course source: `4fb5c72b3bbccff87d748a6624e4594658c30975`.
The exact unpublished gameplay `0.6.0-candidate.0` and storage
`0.5.0-candidate.0` archives from the [development checkpoint](../README.md)
passed these additional Unity 2021.3.6f1 Windows x64 courses.

| Course | Observed result in the editor and relocated Mono player |
| --- | --- |
| Existing gameplay | 60 combat, 2,334 pouch and 56 crafting requests matched the frozen expectations; imported samples, content corruption and content-load checks passed |
| Shared account | All 84 typed operations, the documented example and foreign/retired-handle checks passed |
| Progression | All 104 operations and the imported sample passed |
| Separate equipment coordinator | Equip/remove publication preserved the complete live combat continuation; post-commit failure closed the owner |
| Paired account/inventory coordinator | Original save results, imported sample, five lifecycle paths and four deliberate fault detections passed |
| Archives | Both rebuilt byte for byte; 13 preservation, existing-output and altered-input controls passed |

All owned engine projects and caches were removed. The original candidate
archives and receipts remain unchanged. Older tools received supplementary
resource-hash metadata derived from every verified archive member; the manifest
retains both original and temporary receipt identities. The temporary Windows
metadata used CRLF, while the original builder receipt used explicit LF.

`reports.json.gz` contains the structured receipts. `observations.json.gz`
contains complete comparison data and the four intended fault assertions.
Workstation and licensing logs are excluded. Frozen expected values are checked
against the previously published evidence, not regenerated from the candidate.
The first local checker attempt rejected the temporary receipt's line endings;
the preserved draft remains local. The corrected checker compares the recorded
Windows bytes explicitly. No engine result or expected gameplay value changed.

After fetching the course source above, run:

```text
node adapters/unity-shared-account/qualification/check-equipment-retained.mjs --source-ref 4fb5c72b3bbccff87d748a6624e4594658c30975
```

Fresh-run instructions are in [the equipment contract](../../../docs/shared-account-equipment.md#retained-package-checks).
`seal-equipment-retained.py` takes `--inputs` (a JSON mapping of the six course
names to report files), `--source-ref` and a fresh `--output` directory. It checks
the report and raw hashes against actual committed source and excludes logs.
The checker independently compares the saved observations, package metadata,
frozen expectations, fault assertions and cleanup results.

This is additional candidate evidence. Final release guides, versioned package
installation and publication remain separate. No physical Steam Deck/mobile,
Unity Linux, ARM or IL2CPP qualification is implied. The complete SDK goal is
still open.
