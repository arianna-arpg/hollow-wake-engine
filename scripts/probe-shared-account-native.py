import ctypes as c,hashlib,json,pathlib,sys,tarfile
directory=pathlib.Path(sys.argv[1]);cfg=json.loads((directory/'input.json').read_text(encoding='utf-8'))
with tarfile.open(cfg['archive'],'r:gz') as archive:
    members=[m for m in archive.getmembers() if m.name.endswith('/hwe_embedded.dll')]
    assert len(members)==1
    library=archive.extractfile(members[0]).read()
    assert hashlib.sha256(library).hexdigest()==cfg['nativeSha256']
    (directory/'hwe_embedded.dll').write_bytes(library)
dll=c.CDLL(str(directory/'hwe_embedded.dll'))
class Options(c.Structure):
    _fields_=[('version',c.c_uint32),('reserved',c.c_uint32),('heap',c.c_uint64),('request',c.c_uint32),('response',c.c_uint32),('polls',c.c_uint32),('reserved2',c.c_uint32)]
class Metrics(c.Structure):
    _fields_=[('live_bytes',c.c_uint64),('peak_bytes',c.c_uint64),('live_blocks',c.c_uint64),('allocations',c.c_uint64),('pending',c.c_uint32),('poisoned',c.c_uint32),('cancelled',c.c_uint32),('reserved',c.c_uint32)]
for name,args in {
    'create':[c.POINTER(Options),c.c_char_p,c.c_uint64,c.c_char_p,c.c_uint64,c.POINTER(c.c_void_p)],
    'submit':[c.c_void_p,c.c_char_p,c.c_uint64,c.POINTER(c.c_uint64)],
    'copy_response':[c.c_void_p,c.c_void_p,c.c_uint64,c.POINTER(c.c_uint64)],
    'release_response':[c.c_void_p],
    'metrics':[c.c_void_p,c.POINTER(Metrics)],
    'destroy':[c.POINTER(c.c_void_p),c.POINTER(Metrics)]
}.items():
    fn=getattr(dll,'hwe_js_'+name+'_v1');fn.argtypes=args;fn.restype=c.c_int32
bundle=(directory/'bundle.js').read_bytes();content=(directory/'content.json').read_bytes()
courses=json.loads((directory/'courses.json').read_text(encoding='utf-8'));rows=[]
def metrics(host):
    value=Metrics();assert dll.hwe_js_metrics_v1(host,c.byref(value))==0
    return {key:getattr(value,key) for key,_ in Metrics._fields_}
def submit(host,request):
    encoded=json.dumps(request,separators=(',',':')).encode();length=c.c_uint64()
    status=dll.hwe_js_submit_v1(host,encoded,len(encoded),c.byref(length));assert status==0,('submit',status)
    output=c.create_string_buffer(length.value);written=c.c_uint64()
    assert dll.hwe_js_copy_response_v1(host,output,len(output),c.byref(written))==0
    assert dll.hwe_js_release_response_v1(host)==0
    return json.loads(output.raw[:written.value])
for mib in [32,48,64]:
    options=Options(0x10000,0,mib*1024*1024,1024*1024,4*1024*1024,1000000,0);host=c.c_void_p()
    status=dll.hwe_js_create_v1(c.byref(options),bundle,len(bundle),content,len(content),c.byref(host))
    row={'heapMiB':mib,'createStatus':status,'created':bool(host.value)};rows.append(row)
    if status!=0:
        assert not host.value;continue
    try:
        row['opened']=metrics(host);count=0
        for course in courses:
            for index,step in enumerate(course['rows']):
                row['lastCommand']={'course':course['name'],'index':index,'request':step['request']}
                reply=submit(host,step['request'])
                assert reply==step['reply'],(course['name'],index,step['request'],reply,step['reply'])
                count+=1
        row.update(coursePassed=True,commands=count,tracked=metrics(host))
    except BaseException as error:
        row['error']=repr(error)
        row['failedMetrics']=metrics(host)
    finally:
        final=Metrics();row['destroyStatus']=dll.hwe_js_destroy_v1(c.byref(host),c.byref(final));row['remainingBytes']=final.live_bytes
        row['disposed']=row['destroyStatus']==0 and final.live_bytes==0
    if row.get('coursePassed'):break
(directory/'result.json').write_text(json.dumps({'exploratory':True,'rows':rows},indent=2)+'\n')
print(json.dumps(rows))
