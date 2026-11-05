import ctypes as c,json,pathlib,sys
cfg=json.loads(pathlib.Path(sys.argv[1]).read_text());directory=pathlib.Path(cfg['directory']);dll=c.CDLL(cfg['dll'])
class Options(c.Structure):
    _fields_=[('version',c.c_uint32),('reserved',c.c_uint32),('heap',c.c_uint64),('request',c.c_uint32),('response',c.c_uint32),('polls',c.c_uint32),('reserved2',c.c_uint32)]
class Metrics(c.Structure):
    _fields_=[('live_bytes',c.c_uint64),('peak_bytes',c.c_uint64),('live_blocks',c.c_uint64),('allocations',c.c_uint64),('pending',c.c_uint32),('poisoned',c.c_uint32),('cancelled',c.c_uint32),('reserved',c.c_uint32)]
dll.hwe_js_create_v1.argtypes=[c.POINTER(Options),c.c_char_p,c.c_uint64,c.c_char_p,c.c_uint64,c.POINTER(c.c_void_p)];dll.hwe_js_create_v1.restype=c.c_int32
dll.hwe_js_submit_v1.argtypes=[c.c_void_p,c.c_char_p,c.c_uint64,c.POINTER(c.c_uint64)];dll.hwe_js_submit_v1.restype=c.c_int32
dll.hwe_js_copy_response_v1.argtypes=[c.c_void_p,c.c_void_p,c.c_uint64,c.POINTER(c.c_uint64)];dll.hwe_js_copy_response_v1.restype=c.c_int32
dll.hwe_js_release_response_v1.argtypes=[c.c_void_p];dll.hwe_js_release_response_v1.restype=c.c_int32
dll.hwe_js_metrics_v1.argtypes=[c.c_void_p,c.POINTER(Metrics)];dll.hwe_js_metrics_v1.restype=c.c_int32
dll.hwe_js_destroy_v1.argtypes=[c.POINTER(c.c_void_p),c.POINTER(Metrics)];dll.hwe_js_destroy_v1.restype=c.c_int32
bundle=(directory/'bundle.js').read_bytes();content=(directory/'content.json').read_bytes();rows=[]
def submit(host,request):
    encoded=json.dumps(request,separators=(',',':')).encode();length=c.c_uint64();status=dll.hwe_js_submit_v1(host,encoded,len(encoded),c.byref(length));assert status==0,('submit',status)
    output=c.create_string_buffer(length.value);written=c.c_uint64();assert dll.hwe_js_copy_response_v1(host,output,len(output),c.byref(written))==0
    assert dll.hwe_js_release_response_v1(host)==0
    return json.loads(output.raw[:written.value])
for mib in [32,64,128]:
    options=Options(0x10000,0,mib*1024*1024,1024*1024,4*1024*1024,1000000,0);host=c.c_void_p()
    status=dll.hwe_js_create_v1(c.byref(options),bundle,len(bundle),content,len(content),c.byref(host))
    row={'heapMiB':mib,'createStatus':status,'created':bool(host.value)};rows.append(row)
    if status!=0:
        assert not host.value;continue
    try:
        state={'board':{'w':8,'h':8},'items':[],'equipped':{},'overflow':[],'essences':{},'account':{'craftLore':{},'ledger':{},'features':[],'progression':True}}
        assert submit(host,{'op':'open','profile':1,'seed':17,'state':state})['ok']
        mint={'op':'mint','profile':1,'kind':'forge','options':{'baseId':'ring_lapis','ilvl':10,'rarity':'rare'}}
        first=submit(host,mint);assert first['ok']
        saved=submit(host,{'op':'save','profile':1});assert saved['ok']
        assert submit(host,{'op':'restore','profile':2,'save':saved['save']})['ok']
        one=submit(host,mint);mint['profile']=2;two=submit(host,mint);assert one==two and one['ok']
        assert submit(host,{'op':'save','profile':1})==submit(host,{'op':'save','profile':2})
        metrics=Metrics();assert dll.hwe_js_metrics_v1(host,c.byref(metrics))==0
        row.update(coursePassed=True,tracked={name:getattr(metrics,name) for name,_ in Metrics._fields_})
    except BaseException as error:
        row['error']=repr(error)
    finally:
        final=Metrics();row['destroyStatus']=dll.hwe_js_destroy_v1(c.byref(host),c.byref(final));row['remainingBytes']=final.live_bytes
    if row.get('coursePassed'):break
(directory/'result.json').write_text(json.dumps({'exploratory':True,'bundleBytes':len(bundle),'contentBytes':len(content),'rows':rows},indent=2)+'\n')
print(json.dumps(rows))
