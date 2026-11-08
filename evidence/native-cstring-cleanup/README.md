# Native string cleanup candidate

The Windows x64 comparison runs 210 cases against each of the unchanged pinned
QuickJS-NG 0.17.0 source and the one-line cleanup candidate. All byte, length and
retry checks pass in both builds. The original retains allocations in 24 cases;
the candidate returns every tracked byte and block in all 210 cases. Six build
preparation controls refuse unsafe or mismatched input without writing a result.

The report binds the complete sources, exact patched output, compiler commands
and raw observations. Its temporary build trees were removed. Run
`node experiments/embedded-js/patches/check-cstring-evidence.mjs` to validate this
checkpoint, or use `--report <downloaded-report.json>` to check a hosted run and
its adjacent compressed observations against the current source.

This checkpoint does not replace a public engine archive or activate the patch
in existing build helpers. The Windows/Linux workflow also schedules a Linux
sanitizer course; configuration is not completed platform evidence. Native host
integration, engine-package qualification and collection timing remain required.
There is no physical-device or overall performance claim.

The [candidate guide](../../experiments/embedded-js/patches/README.md) records the
failure mechanism, patch boundary and reproduction command. The separately
observed shared-account memory-pressure failure remains preserved, including its
failed 32 MiB configuration; improved collection policy is a distinct experiment.
