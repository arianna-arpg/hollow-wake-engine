# Background save boundary

The Godot host keeps gameplay mutation, RNG, serialization and scene updates on
the main thread. The native store can accept one owned pair of UTF-8 save
documents and a revision for background persistence. An unconsumed completion
occupies that same slot. Extra submissions are refused; there is no growing queue.

A persistent worker sleeps between requests. It runs the same stage/commit or
stage/cancel operations as the synchronous API. It receives no Godot objects,
scene references, gameplay state or callbacks. Cancellation is accepted until
the worker admits COMMIT; after that point the actual commit result is authoritative.
Closing the store cancels earlier work when possible and joins an admitted
commit before destroying the connection. Hosts should poll completion before
ordinary scene departure to keep that wait off active frames.

The profile retains the last durable snapshot while a write is pending and
refuses a second gameplay action. A successful completion publishes the proposed
snapshot and advances its revision once. Failure reloads the durable owners
before admitting another command. No success message is shown on submission.
The existing synchronous profile interface remains available for deterministic
batch processing and existing hosts.

The worker scheduler has an independent C++ test backend so tests can hold
staging and committing at explicit barriers without timing assumptions. Native
Godot checks must additionally cover real SQLite records, competing writers,
cancel/close/reopen, stale completions and durable recovery. Packaged player
checks must verify frame progress, full action outcomes and a second-process
restore. The qualified Windows and Linux paths and remaining limits are recorded
in [the acceptance evidence](../evidence/background-saves/README.md).

The queue holds at most two 512 KiB documents, plus its small request/result
records. Submission still validates and copies UTF-8 on the calling thread.
Use a shared store for the host's save coordinator; every active store has its
own lazily started worker. An idle worker sleeps, and consuming a completion
clears its document values. The standard library may retain string capacity;
the document-size limit still bounds it. This is bounded admission, not a memory budget
for the whole game or a measurement of thread stack residency.

Slot creation, loading, failed-write recovery, gameplay commands and serialization remain synchronous.
The example disables further mutations while saving, keeps the previous durable
view visible, restores focus after completion and waits asynchronously on an
ordinary window-close request. Forced scene destruction joins the worker for
safety and can therefore wait for an admitted disk commit.

Reproduce the independent scheduler and its eight deliberate fault checks:

```text
node scripts/test-save-worker.mjs OUTPUT_JSON --mutations
```

The native build receipt binds the library to its source. The empty-project
checker takes that receipt and an existing addon archive, substitutes the
verified library and imports it through the normal editor path:

```text
python -I -B scripts/check-background-store.py EDITOR BUILD_RECEIPT ADDON_ZIP SCRATCH OUTPUT_JSON
python -I -B scripts/verify-background-workshop.py TOOLS_JSON BUILD_RECEIPT DONOR_DIRECTORY SCRATCH DELIVERY_DIRECTORY
python -I -B scripts/check-background-workflows.py EDITOR DELIVERY_DIRECTORY SCRATCH OUTPUT_JSON
python -I -B scripts/measure-background-store.py EDITOR ADDON_ZIP SCRATCH OUTPUT_JSON
```

Use absolute paths and fresh outputs. The full Linux workshop fixture currently
needs the explicit --direct-registration option; this is not proof of a normal
Linux workshop editor import. The standalone addon passes normal imports on both
platforms. The performance runner alternates synchronous/background order,
retains individual samples and checks committed bytes independently; it measures
native store calls only. Stop other heavy work before collecting accepted timings.

SQLite's existing serialized connection mode is retained. Godot's active scene
tree is not a worker-thread API. [SQLite threading](https://www.sqlite.org/threadsafe.html),
[Godot thread safety](https://docs.godotengine.org/en/stable/tutorials/performance/thread_safe_apis.html).
