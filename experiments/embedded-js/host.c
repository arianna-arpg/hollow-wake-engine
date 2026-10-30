/* Single-call compatibility and failure probe. */
#include "host-support.h"

static int run_once(const char *bundle, size_t bundle_size, const char *input,
                    size_t input_size, const char *mode, unsigned iteration) {
    int code = 0;
    size_t json_size = 0;
    size_t allocation_probe_bytes = 0;
    const char *phase = "runtime";
    Heap heap = {0};
    heap.limit = 256 * 1024 * 1024;
    if (!strcmp(mode, "memory") || !strcmp(mode, "load-memory")) heap.limit = 1024 * 1024;
    if (!strcmp(mode, "startup-memory")) heap.limit = 32768;
    JSRuntime *runtime = NULL;
    JSContext *context = NULL;
    const char *json = NULL;
    JSValue evaluated = JS_UNDEFINED, value = JS_UNDEFINED, global = JS_UNDEFINED;
    JSValue exports = JS_UNDEFINED, function = JS_UNDEFINED;
    JSValue result = JS_UNDEFINED, encoded = JS_UNDEFINED;
    Interrupt polling = {1, 0};

    runtime = JS_NewRuntime2(&allocator, &heap);
    if (!runtime) { code = 3; goto cleanup; }
    JS_SetMemoryLimit(runtime, heap.limit);
    /* Leave headroom below this probe executable's native thread stack. */
    JS_SetMaxStackSize(runtime, 256 * 1024);
    phase = "context";
    context = JS_NewContext(runtime);
    if (!context) { code = 3; goto cleanup; }
    if (!strcmp(mode, "memory")) {
        /* Exercise allocation failure directly, independently of where a
         * changing SDK bundle exhausts the parser's budget. js_malloc installs
         * the VM's out-of-memory exception; unexpected success must fail. */
        phase = "allocation";
        allocation_probe_bytes = 2 * 1024 * 1024;
        void *probe = js_malloc(context, allocation_probe_bytes);
        code = probe ? 4 : 2;
        if (probe) js_free(context, probe);
        goto cleanup;
    }
    phase = "bundle";
    evaluated = JS_Eval(context, bundle, bundle_size, "sdk-bundle.js", JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(evaluated)) { code = 2; goto cleanup; }
    if (!strcmp(mode, "interrupt")) {
        phase = "interrupt";
        JS_SetInterruptHandler(runtime, interrupt, &polling);
        result = JS_Eval(context, "for (;;) {}", 11, "interrupt-test.js", JS_EVAL_TYPE_GLOBAL);
        code = JS_IsException(result) ? 2 : 4;
        goto cleanup;
    }
    if (!strcmp(mode, "stack")) {
        phase = "stack";
        const char *recursive = "function recurse() { return 1 + recurse(); } recurse();";
        result = JS_Eval(context, recursive, strlen(recursive), "stack-test.js", JS_EVAL_TYPE_GLOBAL);
        code = JS_IsException(result) ? 2 : 4;
        goto cleanup;
    }
    phase = "input";
    value = !strcmp(mode, "invalid-json")
        ? JS_ParseJSON(context, "{", 1, "bad.json")
        : JS_ParseJSON(context, input, input_size, "input.json");
    if (JS_IsException(value)) { code = 2; goto cleanup; }
    if (!strcmp(mode, "sdk-error") && JS_SetPropertyStr(context, value, "core", JS_NULL) < 0) {
        code = 2;
        goto cleanup;
    }
    global = JS_GetGlobalObject(context);
    exports = JS_GetPropertyStr(context, global, "HollowWakeProbe");
    if (JS_IsException(exports)) { code = 2; goto cleanup; }
    function = JS_GetPropertyStr(context, exports, "observe");
    if (JS_IsException(function)) { code = 2; goto cleanup; }
    if (!JS_IsFunction(context, function)) { code = 4; goto cleanup; }
    phase = "observe";
    result = JS_Call(context, function, JS_UNDEFINED, 1, &value);
    if (JS_IsException(result)) { code = 2; goto cleanup; }
    /* This probe has a synchronous contract; silently discarding jobs is invalid. */
    if (JS_IsJobPending(runtime)) { code = 4; goto cleanup; }
    phase = "encode";
    encoded = JS_JSONStringify(context, result, JS_UNDEFINED, JS_UNDEFINED);
    if (JS_IsException(encoded)) { code = 2; goto cleanup; }
    json = JS_ToCStringLen(context, &json_size, encoded);
    if (!json) { code = 2; goto cleanup; }
    if (fwrite(json, 1, json_size, stdout) != json_size || fputc('\n', stdout) == EOF) code = 5;

cleanup:
    if (runtime) JS_SetInterruptHandler(runtime, NULL, NULL);
    if (context) {
        if (code == 2) print_exception(context);
        if (json) JS_FreeCString(context, json);
        JS_FreeValue(context, encoded);
        JS_FreeValue(context, result);
        JS_FreeValue(context, function);
        JS_FreeValue(context, exports);
        JS_FreeValue(context, global);
        JS_FreeValue(context, value);
        JS_FreeValue(context, evaluated);
        JS_FreeContext(context);
    }
    if (runtime) JS_FreeRuntime(runtime);
    if (heap.live || heap.blocks) code = 9;
    fprintf(stderr, "{\"mode\":\"%s\",\"iteration\":%u,\"code\":%d,"
        "\"phase\":\"%s\",\"heapLimitBytes\":%zu,\"allocationProbeBytes\":%zu,"
        "\"peakRequestedBytes\":%zu,\"liveRequestedBytesAfterDispose\":%zu,"
        "\"liveBlocksAfterDispose\":%zu,\"allocationRequests\":%zu,"
        "\"reallocationRequests\":%zu,\"interruptCalls\":%u}\n",
        mode, iteration, code, phase, heap.limit, allocation_probe_bytes, heap.peak, heap.live, heap.blocks,
        heap.allocations, heap.reallocations, polling.calls);
    return code;
}

int main(int argc, char **argv) {
    if (argc == 2 && !strcmp(argv[1], "--allocator-check")) {
        test_allocator();
        return 0;
    }
    if (argc != 4) { fputs("bundle input mode required\n", stderr); return 5; }
    const char *mode = argv[3];
    if (strcmp(mode, "success") && strcmp(mode, "invalid-json") &&
        strcmp(mode, "sdk-error") && strcmp(mode, "interrupt") &&
        strcmp(mode, "memory") && strcmp(mode, "load-memory") && strcmp(mode, "startup-memory") && strcmp(mode, "stack")) return 5;
    size_t bundle_size = 0, input_size = 0;
    char *bundle = read_file(argv[1], &bundle_size);
    char *input = read_file(argv[2], &input_size);
    if (!bundle || !input) { free(bundle); free(input); return 5; }
    int expected = !strcmp(mode, "success") ? 0 : !strcmp(mode, "startup-memory") ? 3 : 2;
    int code = 0;
    for (unsigned iteration = 0; iteration < 3; ++iteration) {
        code = run_once(bundle, bundle_size, input, input_size, mode, iteration);
        if (code != expected) break;
    }
    free(input);
    free(bundle);
    if (fflush(stdout) == EOF) code = 5;
    return code;
}
