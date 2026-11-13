# Character command consolidation

The published `ddf5364` integration consolidates bar, rack, support, merge, progression,
pickup and account commands into maintained TypeScript modules. Complete
character operations remain internal. They do not establish a stable save
format, a complete game adapter or native-engine compatibility.

The public account facade and the internal complete facade share one account
implementation. Public constructor extras cannot select the complete protocol.
The complete facade requires an admitted kernel and uses the exact option value
it validated. Learned-skill merging also uses one execution function across
the existing action service and complete character commands.

## Size allowance

The installed legacy relic/workshop consumer at foundation commit `47d1777`
measured 184,555 minified bytes. At `ddf5364`, the shared account core measures
187,231 bytes, or 58,815 gzip bytes: 2,676 additional minified bytes. An isolated
combined-composition comparison avoids 16,334 minified bytes, or 2,886 gzip
bytes, by sharing the owner instead of retaining both implementations. That
combined comparison is a development bundle, not a public package entry.

The raw account implementation grows from 38,009 bytes to 44,516 across its
facade and shared core. Its declaration-only runtime marker adds 67 bytes,
giving a complete shipped account group of 44,583 bytes at `ddf5364`. All three modules
must count toward the same allowance; measuring the facade alone would hide
the implementation.

The explicit account-group allowance changes from 40 to 44 KiB. The combined
legacy relic/workshop browser allowance changes from 181 to 184 KiB. The same
shared core also changes the equipment-preparation browser allowance from 176
to 179 KiB. The relic-items consumer measures 175,634 bytes and retains its
existing 180 KiB limit. Other module,
predecessor and default-core budgets retain their existing limits.
Installed fault tests must target the shared core and continue detecting each
previous behavior fault. Runtime-byte integrity remains source-derived.

These measurements establish a code-size tradeoff. They do not measure command
latency, allocation rate, peak memory or performance on Steam Deck or phones.
That consolidation passed the full local verification and reference courses
before publication. Hosted validation is recorded separately against its commit.

The subsequent [passive command boundary](character-passive-commands.md) moves
complete-character admission into an excluded internal module. With the
[per-command account journal](character-account-journal.md), its installed
legacy account group measures 44,518 raw bytes, and the relic/workshop browser
consumer measures 187,049 minified bytes. Both retain the same limits above.
These are package-size measurements, not device-performance results.
