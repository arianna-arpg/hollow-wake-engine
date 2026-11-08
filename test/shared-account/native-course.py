"""Replay a frozen complete course through the public DLL with explicit GC boundaries."""
import atexit,ctypes as c,hashlib,json,pathlib,sys
directory=pathlib.Path(sys.argv[1]).resolve();cfg=json.loads((directory/'input.json').read_text(encoding='utf-8'))
library=pathlib.Path(cfg['library']);assert hashlib.sha256(library.read_bytes()).hexdigest()==cfg['nativeSha256']
dll=c.CDLL(str(library))
class Options(c.Structure):
    _fields_=[('version',c.c_uint32),('reserved',c.c_uint32),('heap',c.c_uint64),('request',c.c_uint32),('response',c.c_uint32),('polls',c.c_uint32),('reserved2',c.c_uint32)]
class Metrics(c.Structure):
    _fields_=[('live_bytes',c.c_uint64),('peak_bytes',c.c_uint64),('live_blocks',c.c_uint64),('allocations',c.c_uint64),('pending',c.c_uint32),('poisoned',c.c_uint32),('cancelled',c.c_uint32),('reserved',c.c_uint32)]
for name,args in {
    'create':[c.POINTER(Options),c.c_char_p,c.c_uint64,c.c_char_p,c.c_uint64,c.POINTER(c.c_void_p)],
    'submit':[c.c_void_p,c.c_char_p,c.c_uint64,c.POINTER(c.c_uint64)],
    'copy_response':[c.c_void_p,c.c_void_p,c.c_uint64,c.POINTER(c.c_uint64)],
    'release_response':[c.c_void_p],'collect':[c.c_void_p,c.POINTER(Metrics)],
    'metrics':[c.c_void_p,c.POINTER(Metrics)],'destroy':[c.POINTER(c.c_void_p),c.POINTER(Metrics)]
}.items():
    fn=getattr(dll,'hwe_js_'+name+'_v1');fn.argtypes=args;fn.restype=c.c_int32
def metrics(host):
    state=Metrics();assert dll.hwe_js_metrics_v1(host,c.byref(state))==0
    return {key:getattr(state,key) for key,_ in Metrics._fields_}
def submit(host,encoded):
    length=c.c_uint64();status=dll.hwe_js_submit_v1(host,encoded,len(encoded),c.byref(length))
    if status:return status,None
    try:
        assert 0<length.value<=4*1024*1024
        output=c.create_string_buffer(length.value);written=c.c_uint64()
        assert dll.hwe_js_copy_response_v1(host,output,len(output),c.byref(written))==0 and written.value==length.value
        return 0,output.raw[:written.value]
    finally:assert dll.hwe_js_release_response_v1(host)==0
bundle=(directory/'bundle.js').read_bytes();content=(directory/'content.json').read_bytes()
courses=json.loads((directory/'courses.json').read_text(encoding='utf-8'))
steps=[(course['name'],row) for course in courses for row in course['rows']]
prepared=json.loads((directory/'prepared.json').read_text(encoding='utf-8'))
prepared_steps=[(course['name'],row) for course in prepared for row in course['rows']]
rows=[]
outcome=dict(exploratory=True,completed=False,steps=len(steps),preparedSteps=len(prepared_steps),rows=rows)
atexit.register(lambda:(directory/'native-result.json').write_text(json.dumps(outcome,indent=2)+'\n',encoding='utf-8'))
for mib,policy,loops in [(32,'none',1),(48,'none',1),(32,'startup',1),(32,'startup',10)]:
    host=c.c_void_p();options=Options(0x10000,0,mib*1024*1024,1024*1024,4*1024*1024,1000000,0)
    status=dll.hwe_js_create_v1(c.byref(options),bundle,len(bundle),content,len(content),c.byref(host))
    row=dict(heapMiB=mib,policy=policy,loops=loops,createStatus=status,created=bool(host.value),commands=0,collections=[]);rows.append(row)
    if status:assert not host.value;continue
    digest=hashlib.sha256();prepared_digest=hashlib.sha256();row['preparedCommands']=0
    try:
        row['opened']=metrics(host)
        if policy=='startup':
            state=Metrics();status=dll.hwe_js_collect_v1(host,c.byref(state));assert status==0
            row['collections'].append(dict(status=status,before=row['opened'],after=metrics(host)))
        failed=False
        for iteration in range(loops):
            for index,(course,step) in enumerate(steps):
                encoded=json.dumps(step['request'],separators=(',',':'),ensure_ascii=False).encode()
                status,reply=submit(host,encoded)
                if status:
                    row.update(failedStatus=status,iteration=iteration,course=course,index=index,request=step['request'],failedMetrics=metrics(host))
                    length=c.c_uint64(99);written=c.c_uint64(99)
                    row['retryStatus']=dll.hwe_js_submit_v1(host,b'{}',2,c.byref(length));row['retryLength']=length.value
                    row['copyStatus']=dll.hwe_js_copy_response_v1(host,None,0,c.byref(written));row['copyWritten']=written.value
                    row['afterRejectedRetry']=metrics(host);failed=True;break
                assert json.loads(reply)==step['reply'],(iteration,course,index,'complete reply mismatch')
                digest.update(reply+b'\n');row['commands']+=1
            if failed:break
        row['coursePassed']=not failed and row['commands']==len(steps)*loops
        row['replySha256']=digest.hexdigest();row['tracked']=metrics(host)
        if not failed:
            for index,(course,step) in enumerate(prepared_steps):
                encoded=json.dumps(step['request'],separators=(',',':'),ensure_ascii=False).encode()
                status,reply=submit(host,encoded)
                if status:
                    row.update(preparedFailedStatus=status,preparedCourse=course,preparedIndex=index,preparedRequest=step['request'],preparedFailedMetrics=metrics(host))
                    failed=True;break
                if json.loads(reply)!=step['reply']:
                    row['mismatch']=dict(course=course,index=index,expected=step['reply'],actual=json.loads(reply))
                    raise AssertionError((course,index,'prepared complete reply mismatch'))
                prepared_digest.update(reply+b'\n');row['preparedCommands']+=1
            row['preparedPassed']=not failed and row['preparedCommands']==len(prepared_steps)
            row['preparedReplySha256']=prepared_digest.hexdigest();row['tracked']=metrics(host)
    finally:
        final=Metrics();row['destroyStatus']=dll.hwe_js_destroy_v1(c.byref(host),c.byref(final))
        row['remainingBytes']=final.live_bytes;row['remainingBlocks']=final.live_blocks
        row['disposed']=not host.value and row['destroyStatus']==0 and final.live_bytes==0 and final.live_blocks==0
    print(json.dumps({key:row.get(key) for key in ['heapMiB','policy','loops','coursePassed','commands','failedStatus','remainingBytes']}),flush=True)
outcome['completed']=True
