# Original companion observations

`observations.json.gz` was captured from the pinned original implementation
before writing the companion SDK candidate. Two fresh processes produced the
same bytes. Promotion changed only the observer's draft header; `acceptance.json`
records both source hashes and retains the original compressed and uncompressed
hashes. No SDK output supplies expected values.

The 28 courses contain 83 lifecycle observations, including all ten authored
persistent summon definitions. They retain object/definition/body identity,
callback order and partial failure writes, spawn delivery shape, timers, warm
refreshes, missing bodies, downed/owner-death behavior and reservation-query
arguments. The baseline complements independent contract assertions.

Run `npm run reference:companion-grants` to type-check the original observer and
compare two fresh processes with the fixed baseline. This runner has no capture
mode. Qualification does not modify the shared original source tree.
