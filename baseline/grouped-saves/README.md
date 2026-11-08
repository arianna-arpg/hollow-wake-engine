# Pre-extension save source

This capsule preserves nine raw source files from SDK commit
67fa07a50a58380af22fc52e354f0091a9009b55 before grouped transactions were added.
Each captured file was byte-compared with that Git object before capture.
manifest.json records lengths, SHA-256 hashes and the compressed capsule hash.
The capsule contains UTF-8 source keyed by repository path.

The portable save verifier reconstructs the old C consumer and native library
from these bytes in an owned temporary directory and removes that directory
on success or failure. The original consumer must work with the current library;
the current C# binding must work with the original library for single-record
operations and explicitly refuse unsupported group operations.

This is SDK storage provenance, separate from the original game's authored
content and behavioral fixtures. No game checkout or player save was captured.
