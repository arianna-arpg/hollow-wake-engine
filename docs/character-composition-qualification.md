# Maintained character composition checks

The complete character integration remains internal. The repository now contains
the assembled behavior course, its test hosts and the original-game observation
archives. Reproducing it does not depend on a previous agent session or on files
left in `.artifacts`.

`test:character-composition` builds the authored character content and exercises
the current compiled SDK modules together. The course covers 343 named groups,
six account ownership checks, 22 malformed entry cases and automatic item-counter
admission. Two fresh controls and a restored control must agree. Six deliberate
faults cover entry shape, identity allocation, journal retention and stale
continuations, plus stale account associations and build reuse during activation.
SQLite version is environment metadata; gameplay observations
must still agree exactly within the run.

Three appended account-build reuse checks cover commit, abort and late failure.
They require account-only storage writes, no invented build transitions and no
redundant sibling normalization on the next inventory command. Reuse is an
explicit kernel-host opt-in. Existing hosts retain account-triggered rebuild
callbacks and their original callback-visible ordering. The run owner opts in
and publishes account changes through its account journal. An activation check
requires all three attached characters to rebuild even with reuse enabled.

The helper constructors under `test/character-composition` are test hosts. They
select legacy, complete or rule-kernel construction explicitly, inject the pinned
trigger query and make ownership assertions. Earlier admission and delivery
helpers are retained as course scaffolding. They are not packaged SDK APIs or
the production implementation authority. The complete account router and shared
account core in the course are the maintained compiled implementations.

`reference:character-composition` runs eleven archived original-only generators
twice each against the source-locked game. Their 107 observations must reproduce
the frozen fixture bytes exactly. Normal testing never replaces those fixtures.
The generator archive and fixture archive remain byte-identical to the accepted
private qualification inputs. Relocation changed only SDK import paths in the
assembled test course; acceptance records both course hashes.

`test:passive-actions-faults` checks 9,699 original passive commands and seven
focused ordering cases, including repeated graft binding, service refusal,
captured summon lifetimes, support refresh snapshots and exception recovery.
`test:passive-actions-world` adds a typed, in-memory overlay over six original
World methods and compares 42 real-game transitions. Four ordering faults must
fail. The original game checkout and frozen reference sources are never edited.

These checks establish behavior and integration evidence. They do not publish
a complete save format, make every live effect durable, qualify every native
engine or measure Steam Deck/mobile performance. The remaining live-state and
native package boundaries must pass their own installed and device checks.
