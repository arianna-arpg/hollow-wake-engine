#define _CRT_SECURE_NO_WARNINGS
#if defined(_WIN32)
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#else
#include <time.h>
#endif
#include <stdio.h>
#include <inttypes.h>
#include <stdlib.h>
/* Measurement executable only. No new shipping entry point or automatic GC. */
#define HWE_JS_BUILD_SHARED
#include "../native/hwe_embedded.c"

static void need(int good, const char *message) {
    if (!good) { fprintf(stderr, "%s\n", message); exit(1); }
}
static uint8_t *read_bytes(const char *name, size_t *length) {
    FILE *file = fopen(name, "rb"); need(file != NULL, "Open input");
    need(fseek(file, 0, SEEK_END) == 0, "Seek input");
    long size = ftell(file); need(size >= 0, "Size input");
    rewind(file); *length = (size_t)size;
    uint8_t *data = malloc(*length + 1); need(data != NULL, "Allocate input");
    need(fread(data, 1, *length, file) == *length, "Read input");
    data[*length] = 0; need(fclose(file) == 0, "Close input"); return data;
}
static double now_ms(void) {
#if defined(_WIN32)
    LARGE_INTEGER count, frequency;
    QueryPerformanceCounter(&count); QueryPerformanceFrequency(&frequency);
    return (double)count.QuadPart * 1000.0 / (double)frequency.QuadPart;
#else
    struct timespec count;need(clock_gettime(CLOCK_MONOTONIC,&count)==0,"Monotonic clock");
    return (double)count.tv_sec*1000.0+(double)count.tv_nsec/1000000.0;
#endif
}
int main(int argc, char **argv) {
    need(argc == 6, "bundle content requests output mode");
    size_t nb, nc, nr;
    uint8_t *bundle = read_bytes(argv[1], &nb), *content = read_bytes(argv[2], &nc);
    uint8_t *requests = read_bytes(argv[3], &nr);
    int mode = atoi(argv[5]); need(mode >= 0 && mode <= 4, "Mode");
    hwe_js_options options = {HWE_JS_ABI_VERSION,0,UINT64_C(32)*1024*1024,1024*1024,4*1024*1024,1000000,0};
    hwe_js_host *host = NULL;
    double begin = now_ms();
    need(hwe_js_create_v1(&options,bundle,nb,content,nc,&host)==HWE_JS_OK,"Create");
    double create_ms = now_ms()-begin, collect_ms = 0;
    hwe_js_metrics before, after, end, closed;
    need(hwe_js_metrics_v1(host,&before)==HWE_JS_OK,"Before");
    if (mode == 1 || mode == 3) {
        begin=now_ms();JS_RunGC(host->runtime);
        if(mode==3) {
            JSMemoryUsage usage;JS_ComputeMemoryUsage(host->runtime,&usage);
            JS_SetGCThreshold(host->runtime,(size_t)(usage.malloc_size+(usage.malloc_size>>1)));
        }
        collect_ms=now_ms()-begin;
    }
    need(hwe_js_metrics_v1(host,&after)==HWE_JS_OK,"After");
    FILE *output=fopen(argv[4],"wb");need(output!=NULL,"Open output");
    uint8_t *line=requests,*limit=requests+nr;
    unsigned count=0;
    begin=now_ms();
    while(line<limit) {
        uint8_t *newline=memchr(line,'\n',(size_t)(limit-line));
        uint8_t *stop=newline?newline:limit;
        if(stop>line && stop[-1]=='\r')--stop;
        if(stop>line) {
            uint64_t length=0,written=0;
            int32_t status=hwe_js_submit_v1(host,line,(uint64_t)(stop-line),&length);
            if(status)fprintf(stderr,"Request %u status %d\n",count,status);
            need(status==HWE_JS_OK,"Submit");
            uint8_t *reply=malloc((size_t)length);need(reply!=NULL,"Reply buffer");
            need(hwe_js_copy_response_v1(host,reply,length,&written)==HWE_JS_OK && written==length,"Reply copy");
            need(fwrite(reply,1,(size_t)length,output)==length && fputc('\n',output)!=EOF,"Write reply");
            free(reply);need(hwe_js_release_response_v1(host)==HWE_JS_OK,"Release");
            ++count;
            if((mode==2 || mode==4) && count==2) {
                need(hwe_js_metrics_v1(host,&before)==HWE_JS_OK,"Before configured");
                double gc_begin=now_ms();JS_RunGC(host->runtime);
                if(mode==4) {
                    JSMemoryUsage usage;JS_ComputeMemoryUsage(host->runtime,&usage);
                    JS_SetGCThreshold(host->runtime,(size_t)(usage.malloc_size+(usage.malloc_size>>1)));
                }
                collect_ms=now_ms()-gc_begin;
                need(hwe_js_metrics_v1(host,&after)==HWE_JS_OK,"After configured");
            }
        }
        line=newline?newline+1:limit;
    }
    double replay_ms=now_ms()-begin;
    need(fclose(output)==0,"Close output");
    need(hwe_js_metrics_v1(host,&end)==HWE_JS_OK,"End");
    need(hwe_js_destroy_v1(&host,&closed)==HWE_JS_OK && !host && !closed.live_bytes && !closed.live_blocks,"Dispose");
    printf("{\"mode\":%d,\"createMs\":%.6f,\"collectMs\":%.6f,\"replayMs\":%.6f,\"requests\":%u,"
        "\"beforeBytes\":%" PRIu64 ",\"afterBytes\":%" PRIu64 ",\"endBytes\":%" PRIu64 ","
        "\"peakBytes\":%" PRIu64 ",\"closedBytes\":%" PRIu64 "}\n",
        mode,create_ms,collect_ms,replay_ms,count,before.live_bytes,after.live_bytes,end.live_bytes,end.peak_bytes,closed.live_bytes);
    free(bundle);free(content);free(requests);return 0;
}
