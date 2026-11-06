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
import time
course=json.loads((directory/'course.json').read_text(encoding='utf-8'));rows=[]
for variant in cfg['variants']:
    bundle=(directory/variant['bundle']).read_bytes();content=(directory/variant['content']).read_bytes()
    for mib in variant['heaps']:
        options=Options(0x10000,0,mib*1024*1024,1024*1024,4*1024*1024,1000000,0);host=c.c_void_p();started=time.perf_counter()
        status=dll.hwe_js_create_v1(c.byref(options),bundle,len(bundle),content,len(content),c.byref(host))
        row={'variant':variant['name'],'heapMiB':mib,'createStatus':status,'created':bool(host.value),'initializeMs':(time.perf_counter()-started)*1000,'commands':0};rows.append(row)
        if status!=0:
            assert not host.value;continue
        metrics=Metrics();assert dll.hwe_js_metrics_v1(host,c.byref(metrics))==0
        row['afterCreate']={name:getattr(metrics,name) for name,_ in Metrics._fields_};command_ms=[]
        try:
            for index,step in enumerate(course['rows']):
                encoded=json.dumps(step['request'],separators=(',',':'),ensure_ascii=False).encode('utf-8');length=c.c_uint64();started=time.perf_counter()
                status=dll.hwe_js_submit_v1(host,encoded,len(encoded),c.byref(length));assert status==0,('submit',index,step['request']['op'],status)
                output=c.create_string_buffer(length.value);written=c.c_uint64();assert dll.hwe_js_copy_response_v1(host,output,len(output),c.byref(written))==0
                assert dll.hwe_js_release_response_v1(host)==0;command_ms.append((time.perf_counter()-started)*1000)
                assert json.loads(output.raw[:written.value])==step['expected'],('answer',index,step['request']['op'])
                row['commands']+=1
            row['passed']=True
        except BaseException as error:
            row['error']=repr(error)
        finally:
            metrics=Metrics();assert dll.hwe_js_metrics_v1(host,c.byref(metrics))==0
            row['tracked']={name:getattr(metrics,name) for name,_ in Metrics._fields_}
            row['commandMs']=command_ms
            final=Metrics();row['destroyStatus']=dll.hwe_js_destroy_v1(c.byref(host),c.byref(final));row['remainingBytes']=final.live_bytes
(directory/'native-result.json').write_text(json.dumps({'rows':rows},indent=2)+'\n',encoding='utf-8')
print(json.dumps([{k:v for k,v in row.items() if k!='commandMs'} for row in rows]))
