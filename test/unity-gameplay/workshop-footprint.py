"""Compare shipped workshop programs using the same DLL, content and original requests."""
import ctypes as c
import hashlib
import json
from pathlib import Path
import runpy
import sys
import tarfile


def main():
    before, after, library, work, output = map(Path, sys.argv[1:])
    assert not output.exists()
    types = runpy.run_path(str(Path(__file__).with_name("content-load.py")))
    Options, Metrics, Layout, checked = [types[k] for k in ("Options", "Metrics", "Layout", "checked")]
    ptr, size = c.c_void_p, c.c_uint64
    dll = c.CDLL(str(library.resolve()))
    def bind(name, arguments):
        fn = getattr(dll, "hwe_js_" + name + "_v1")
        fn.argtypes, fn.restype = arguments, c.c_int
        return fn
    layout = Layout()
    checked(bind("layout", [c.POINTER(Layout)])(c.byref(layout)))
    assert [layout.abi, layout.options, layout.metrics, layout.pointer] == [65536, c.sizeof(Options), c.sizeof(Metrics), c.sizeof(ptr)]
    create = bind("create", [c.POINTER(Options), c.c_char_p, size, c.c_char_p, size, c.POINTER(ptr)])
    submit = bind("submit", [ptr, c.c_char_p, size, c.POINTER(size)])
    copy = bind("copy_response", [ptr, ptr, size, c.POINTER(size)])
    release = bind("release_response", [ptr])
    destroy = bind("destroy", [c.POINTER(ptr), c.POINTER(Metrics)])
    assets = {}
    for name, archive in (("before", before), ("after", after)):
        with tarfile.open(archive) as packed:
            prefix = "package/Runtime/Resources/HollowWake/"
            assets[name] = (packed.extractfile(prefix + "WorkshopRules.bytes").read(),
                            packed.extractfile(prefix + "WorkshopContent.bytes").read())
            native = packed.extractfile("package/Runtime/Native/Windows/hwe_embedded.dll").read()
            assert hashlib.sha256(native).digest() == hashlib.sha256(library.read_bytes()).digest()
    assert assets["before"][1] == assets["after"][1]
    course = (work / "workshop.requests").read_bytes().splitlines()
    expected = [json.loads(line) for line in (work / "workshop.expected").read_bytes().splitlines()]
    assert len(course) == len(expected) == 56
    runs = []
    for name in ("before", "after", "after", "before"):
        program, content = assets[name]
        options = Options(65536, 0, 32 << 20, 1 << 20, 4 << 20, 1000000, 0)
        host = ptr()
        checked(create(c.byref(options), program, len(program), content, len(content), c.byref(host)))
        try:
            for request, want in zip(course, expected):
                n = size()
                checked(submit(host, request, len(request), c.byref(n)))
                try:
                    buffer, written = c.create_string_buffer(n.value), size()
                    checked(copy(host, buffer, n, c.byref(written)))
                    assert written.value == n.value and json.loads(buffer.raw) == want
                finally:
                    checked(release(host))
        finally:
            metrics = Metrics()
            checked(destroy(c.byref(host), c.byref(metrics)))
            assert not host.value and metrics.live == metrics.blocks == 0 and not metrics.poisoned
        runs.append(dict(variant=name, peakBytes=metrics.peak, allocations=metrics.allocations))
    assert max(r["peakBytes"] for r in runs if r["variant"] == "after") < min(r["peakBytes"] for r in runs if r["variant"] == "before")
    digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    report = dict(passed=True, measure="tracked native allocations per host; no timing or device claim",
                  beforeSha256=digest(before), afterSha256=digest(after), librarySha256=digest(library),
                  requests=56, zeroLiveAllocationsAfterClose=True, runs=runs,
                  rulesBytes={k: len(v[0]) for k, v in assets.items()})
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
