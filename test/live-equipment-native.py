"""Child-process DLL consumer; process exit releases the DLL before parent cleanup."""
import ctypes as c
import json,runpy,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
common=runpy.run_path(str(root/"test/unity-gameplay/content-load.py"))
Options,Metrics,Layout,checked=(common[name] for name in ("Options","Metrics","Layout","checked"))
work=Path(sys.argv[1])
dll=c.CDLL(str(work/"hwe_embedded.dll"))
def bind(name,types):
 function=getattr(dll,"hwe_js_"+name+"_v1")
 function.argtypes=types;function.restype=c.c_int
 return function
ptr,size=c.c_void_p,c.c_uint64
layout=Layout();checked(bind("layout",[c.POINTER(Layout)])(c.byref(layout)))
assert [layout.abi,layout.options,layout.metrics,layout.pointer]==[65536,c.sizeof(Options),c.sizeof(Metrics),c.sizeof(ptr)]
create=bind("create",[c.POINTER(Options),c.c_char_p,size,c.c_char_p,size,c.POINTER(ptr)])
submit=bind("submit",[ptr,c.c_char_p,size,c.POINTER(size)])
copy=bind("copy_response",[ptr,ptr,size,c.POINTER(size)])
release=bind("release_response",[ptr])
destroy=bind("destroy",[c.POINTER(ptr),c.POINTER(Metrics)])
program=(work/"bundle.js").read_bytes();content=(work/"input.json").read_bytes()
requests=(work/"requests.jsonl").read_bytes().splitlines()
expected=[json.loads(line) for line in (work/"expected.jsonl").read_bytes().splitlines()]
assert len(requests)==len(expected)>30
options=Options(65536,0,64<<20,1<<20,4<<20,1000000,0)
host=ptr();actual=[]
checked(create(c.byref(options),program,len(program),content,len(content),c.byref(host)))
try:
 for index,(request,want) in enumerate(zip(requests,expected)):
  length=size();checked(submit(host,request,len(request),c.byref(length)))
  try:
   output=c.create_string_buffer(length.value);written=size()
   checked(copy(host,output,length,c.byref(written)));assert written.value==length.value
   reply=json.loads(output.raw);assert reply==want,(index,request.decode(),reply,want)
   actual.append(output.raw.decode())
  finally: checked(release(host))
finally:
 metrics=Metrics();checked(destroy(c.byref(host),c.byref(metrics)))
 assert metrics.live==metrics.blocks==0
(work/"native-replies.jsonl").write_text("\n".join(actual)+"\n",encoding="utf-8",newline="\n")
print(json.dumps(dict(passed=True,requests=len(actual),peakTrackedBytes=metrics.peak,liveBytesAfterDispose=metrics.live,
 liveBlocksAfterDispose=metrics.blocks,scope="Windows x64 native runtime, not Unity or device acceptance")))
