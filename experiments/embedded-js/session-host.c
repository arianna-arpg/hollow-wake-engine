#include "host-support.h"

/* A development driver with one VM and retained sessions across native calls. */
int main(int argc, char **argv) {
    if (argc == 2 && !strcmp(argv[1], "--allocator-check")) {
        test_allocator();
        return 0;
    }
    if (argc != 4) { fputs("bundle content requests required\n", stderr); return 5; }
    size_t bundle_size = 0, input_size = 0, requests_size = 0, json_size = 0;
    char *bundle = read_file(argv[1], &bundle_size);
    char *input = read_file(argv[2], &input_size);
    char *requests = read_file(argv[3], &requests_size);
    int code = 0;
    unsigned completed = 0;
    Heap heap = {0}; heap.limit = 256 * 1024 * 1024;
    Interrupt polling = {1000000, 0};
    JSRuntime *runtime = NULL;
    JSContext *context = NULL;
    const char *json = NULL;
    JSValue evaluated = JS_UNDEFINED, value = JS_UNDEFINED, global = JS_UNDEFINED;
    JSValue exports = JS_UNDEFINED, factory = JS_UNDEFINED, dispatch = JS_UNDEFINED;
    JSValue controller = JS_UNDEFINED, result = JS_UNDEFINED, encoded = JS_UNDEFINED;
    if (!bundle || !input || !requests) { code = 5; goto cleanup; }
    runtime = JS_NewRuntime2(&allocator, &heap);
    if (!runtime) { code = 3; goto cleanup; }
    JS_SetMemoryLimit(runtime, heap.limit);
    JS_SetMaxStackSize(runtime, 256 * 1024);
    JS_SetInterruptHandler(runtime, interrupt, &polling);
    context = JS_NewContext(runtime);
    if (!context) { code = 3; goto cleanup; }
    evaluated = JS_Eval(context, bundle, bundle_size, "session-bundle.js", JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(evaluated)) { code = 2; goto cleanup; }
    global = JS_GetGlobalObject(context);
    exports = JS_GetPropertyStr(context, global, "HollowWakeSession");
    if (JS_IsException(exports)) { code = 2; goto cleanup; }
    factory = JS_GetPropertyStr(context, exports, "create");
    if (JS_IsException(factory)) { code = 2; goto cleanup; }
    dispatch = JS_GetPropertyStr(context, exports, "dispatch");
    if (JS_IsException(dispatch)) { code = 2; goto cleanup; }
    if (!JS_IsFunction(context, factory) || !JS_IsFunction(context, dispatch)) { code = 4; goto cleanup; }
    value = JS_ParseJSON(context, input, input_size, "content.json");
    if (JS_IsException(value)) { code = 2; goto cleanup; }
    controller = JS_Call(context, factory, JS_UNDEFINED, 1, &value);
    if (JS_IsException(controller)) { code = 2; goto cleanup; }
    JS_FreeValue(context, value); value = JS_UNDEFINED;
    free(input); input = NULL;

    char *cursor = requests, *end = requests + requests_size;
    while (cursor < end) {
        char *next = memchr(cursor, '\n', (size_t)(end - cursor));
        size_t length = next ? (size_t)(next - cursor) : (size_t)(end - cursor);
        if (!length || length > 1024 * 1024 || completed >= 4096) { code = 5; goto cleanup; }
        char saved = cursor[length]; cursor[length] = 0;
        value = JS_ParseJSON(context, cursor, length, "request.json");
        cursor[length] = saved;
        if (JS_IsException(value)) { code = 2; goto cleanup; }
        polling.remaining = 1000000;
        JSValue arguments[2] = {controller, value};
        result = JS_Call(context, dispatch, JS_UNDEFINED, 2, arguments);
        if (JS_IsException(result)) { code = 2; goto cleanup; }
        if (JS_IsJobPending(runtime)) { code = 4; goto cleanup; }
        encoded = JS_JSONStringify(context, result, JS_UNDEFINED, JS_UNDEFINED);
        if (JS_IsException(encoded)) { code = 2; goto cleanup; }
        json = JS_ToCStringLen(context, &json_size, encoded);
        if (!json) { code = 2; goto cleanup; }
        if (fwrite(json, 1, json_size, stdout) != json_size || fputc('\n', stdout) == EOF) { code = 5; goto cleanup; }
        JS_FreeCString(context, json); json = NULL;
        JS_FreeValue(context, encoded); encoded = JS_UNDEFINED;
        JS_FreeValue(context, result); result = JS_UNDEFINED;
        JS_FreeValue(context, value); value = JS_UNDEFINED;
        completed++;
        cursor = next ? next + 1 : end;
    }

cleanup:
    if (runtime) JS_SetInterruptHandler(runtime, NULL, NULL);
    if (context) {
        if (code == 2) print_exception(context);
        if (json) JS_FreeCString(context, json);
        JS_FreeValue(context, encoded); JS_FreeValue(context, result); JS_FreeValue(context, value);
        JS_FreeValue(context, controller); JS_FreeValue(context, dispatch); JS_FreeValue(context, factory);
        JS_FreeValue(context, exports); JS_FreeValue(context, global); JS_FreeValue(context, evaluated);
        JS_FreeContext(context);
    }
    if (runtime) JS_FreeRuntime(runtime);
    free(requests); free(input); free(bundle);
    if (heap.live || heap.blocks) code = 9;
    if (fflush(stdout) == EOF) code = 5;
    fprintf(stderr, "{\"code\":%d,\"completedRequests\":%u,\"peakRequestedBytes\":%zu,"
        "\"liveRequestedBytesAfterDispose\":%zu,\"liveBlocksAfterDispose\":%zu,\"allocationRequests\":%zu}\n",
        code, completed, heap.peak, heap.live, heap.blocks, heap.allocations);
    return code;
}
