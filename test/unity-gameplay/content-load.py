"""Same shipping DLL and rules, alternating the plain and table transports."""
import ctypes as c
import hashlib
import json
from pathlib import Path
import sys
import tarfile


class Options(c.Structure):
    _fields_=[("abi",c.c_uint32),("reserved",c.c_uint32),("heap",c.c_uint64),
              ("request",c.c_uint32),("response",c.c_uint32),("polls",c.c_uint32),("reserved2",c.c_uint32)]


class Metrics(c.Structure):
    _fields_=[(n,c.c_uint64) for n in ("live","peak","blocks","allocations")]+[(n,c.c_uint32) for n in ("pending","poisoned","cancelled","reserved")]


class Layout(c.Structure):
    _fields_=[(n,c.c_uint32) for n in ("abi","options","metrics","pointer")]


def checked(status):
    if status: raise RuntimeError("native SDK status "+str(status))


if __name__=="__main__":
    archive,library,work=map(Path,sys.argv[1:])
    dll=c.CDLL(str(library))
    def bind(name,types):
        f=getattr(dll,"hwe_js_"+name+"_v1")
        f.argtypes=types
        f.restype=c.c_int
        return f
    ptr=c.c_void_p
    size=c.c_uint64
    layout=Layout()
    checked(bind("layout",[c.POINTER(Layout)])(c.byref(layout)))
    assert [layout.abi,layout.options,layout.metrics,layout.pointer]==[65536,c.sizeof(Options),c.sizeof(Metrics),c.sizeof(ptr)]
    create=bind("create",[c.POINTER(Options),c.c_char_p,size,c.c_char_p,size,c.POINTER(ptr)])
    submit=bind("submit",[ptr,c.c_char_p,size,c.POINTER(size)])
    copy=bind("copy_response",[ptr,ptr,size,c.POINTER(size)])
    release=bind("release_response",[ptr])
    destroy=bind("destroy",[c.POINTER(ptr),c.POINTER(Metrics)])
    with tarfile.open(archive) as pkg:
        prefix="package/Runtime/Resources/HollowWake/"
        program=pkg.extractfile(prefix+"CombatRules.bytes").read()
        table=pkg.extractfile(prefix+"CombatContent.bytes").read()
    plain=(work/"plain-combat.json").read_bytes()
    course=(work/"combat.requests").read_bytes().splitlines()
    expected=[json.loads(s) for s in (work/"combat.expected").read_bytes().splitlines()]
    assert len(course)==len(expected)==60
    peaks={"plain":[],"table":[]}
    options=Options(65536,0,96<<20,1<<20,4<<20,1000000,0)
    for name in ("plain","table","table","plain"):
        content=table if name=="table" else plain
        host=ptr()
        checked(create(c.byref(options),program,len(program),content,len(content),c.byref(host)))
        try:
            for req,want in zip(course,expected):
                n=size()
                checked(submit(host,req,len(req),c.byref(n)))
                try:
                    buf=c.create_string_buffer(n.value)
                    written=size()
                    checked(copy(host,buf,n,c.byref(written)))
                    assert written.value==n.value and json.loads(buf.raw)==want
                finally: checked(release(host))
        finally:
            metrics=Metrics()
            checked(destroy(c.byref(host),c.byref(metrics)))
            assert metrics.live==metrics.blocks==0
        peaks[name].append(metrics.peak)
    assert max(peaks["table"])<min(peaks["plain"]),peaks
    print(json.dumps({"requestsPerRun":len(course),"sourceBytes":{"table":len(table),"plain":len(plain)},
                      "peakEmbeddedBytes":peaks,"releasedBytes":0,"rulesSha256":hashlib.sha256(program).hexdigest()}))
