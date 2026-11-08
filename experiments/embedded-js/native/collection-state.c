/* Deterministic boundary injection, supplementary to the separate-DLL tests.
 * Hooks are test-only and do not change the pinned runtime or shipping host. */
#ifndef HWE_JS_BUILD_SHARED
#define HWE_JS_BUILD_SHARED
#endif
#include "hwe_embedded.h"
#include "quickjs.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static hwe_js_host *fault_host;
static JSContext *fault_context;
static unsigned fault_mode, passes;
static void collect_with_fault(JSRuntime *runtime) {
    JS_RunGC(runtime); ++passes;
    if (fault_mode == 1) JS_ThrowOutOfMemory(fault_context);
    if (fault_mode == 2) hwe_js_cancel_v1(fault_host);
}
static void account_with_fault(JSRuntime *runtime, JSMemoryUsage *usage) {
    JS_ComputeMemoryUsage(runtime, usage);
    if (fault_mode == 3) hwe_js_cancel_v1(fault_host);
}
#define JS_RunGC collect_with_fault
#define JS_ComputeMemoryUsage account_with_fault
#include "hwe_embedded.c"
#undef JS_RunGC
#undef JS_ComputeMemoryUsage

static void need(int good, const char *message) {
    if (!good) {fprintf(stderr, "%s\n", message); exit(1);}
}
static hwe_js_host *fresh(void) {
    static const char *bundle = "var HollowWakeSession={create(){return {};},dispatch(){return 1;}};";
    hwe_js_host *host = NULL;
    need(hwe_js_create_v1(NULL, (const uint8_t *)bundle, strlen(bundle), (const uint8_t *)"{}", 2, &host)
        == HWE_JS_OK, "Create injection host");
    fault_mode = passes = 0; fault_host = host; fault_context = host->context;
    return host;
}
static void close_host(hwe_js_host **host) {
    hwe_js_metrics closed;
    need(hwe_js_destroy_v1(host, &closed) == HWE_JS_OK && !*host && !closed.live_bytes && !closed.live_blocks,
        "Injection teardown");
    fault_context = NULL; fault_host = NULL;
}
int main(void) {
    hwe_js_metrics state;
    hwe_js_host *host = fresh();
    JS_ThrowOutOfMemory(host->context);
    need(!JS_IsJobPending(host->runtime), "Exception fixture has no queued job");
    need(hwe_js_collect_v1(host, &state) == HWE_JS_SCRIPT_ERROR && state.poisoned && passes == 0,
        "Reject pending exception before collection");
    close_host(&host);
    host = fresh(); host->async_violation = 1;
    need(hwe_js_collect_v1(host, &state) == HWE_JS_SCRIPT_ERROR && state.poisoned && passes == 0,
        "Reject asynchronous marker before collection");
    close_host(&host);
    host = fresh(); atomic_store_explicit(&host->busy, 1, memory_order_relaxed);
    state.live_bytes = 99;
    need(hwe_js_collect_v1(host, &state) == HWE_JS_BUSY && !state.live_bytes && passes == 0,
        "Busy collection never enters GC");
    atomic_store_explicit(&host->busy, 0, memory_order_relaxed); close_host(&host);
    for (unsigned mode = 1; mode <= 3; ++mode) {
        host = fresh(); fault_mode = mode;
        const int32_t expected = mode == 1 ? HWE_JS_SCRIPT_ERROR : HWE_JS_INTERRUPTED;
        need(hwe_js_collect_v1(host, &state) == expected && state.poisoned && passes == 1,
            mode == 1 ? "Reject post-collection exception without job" :
            mode == 2 ? "Observe cancellation during collection" : "Observe cancellation during accounting");
        need(!JS_IsJobPending(host->runtime), "Injected failure has no queued job");
        need(hwe_js_collect_v1(host, NULL) == HWE_JS_POISONED && passes == 1, "No repeat collection after failure");
        close_host(&host);
    }
    puts("{\"passed\":true,\"cases\":6,\"closedBytes\":0,\"closedBlocks\":0}");
    return 0;
}
