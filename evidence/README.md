# Accepted milestone-one observations

These records describe one verified extraction candidate and its frozen game
reference. They are not generated during ordinary verification.
The initial candidate is commit `a078b76`. Subsequent reproducibility-tool repairs
are recorded in Git history and CI; these initial source hashes are historical.

- `verification.json`: checks, coverage and source hashes for this candidate.
- `package-verification.json`: independent installed-consumer and package-size receipt.
- `contact-benchmark.json`: raw timing samples, machine details, matching checksums
  and limitations. Read `docs/performance.md` before interpreting the comparison.
- `game-smoke-report.json`: original smoke results across five scenarios and five seeds.
- The `.log` files retain the final package, original type-check and reference-export
  outputs. Existing content warnings remain visible.

Source hashes in `verification.json` normalize CRLF to LF for portable checkouts.
The baseline's source and overlay hashes instead describe exact original bytes.
Subsequent changes should produce separately reviewed evidence, not silently
overwrite these observations.
