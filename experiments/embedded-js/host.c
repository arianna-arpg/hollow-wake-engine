/* Development probe only. This executable is not the SDK's native ABI. */
#define _CRT_SECURE_NO_WARNINGS
#include "quickjs.h"
#include <assert.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#if defined(_MSC_VER) && defined(_M_X64)
/* Preserve the Windows x64 CRT's 16-byte malloc alignment. */
typedef __declspec(align(16)) union Prefix {
    unsigned char alignment[16];
    size_t size;
} Prefix;
#else
typedef union Prefix { max_align_t alignment; size_t size; } Prefix;
#endif

typedef struct Heap {
    size_t live, peak, blocks, limit, allocations, reallocations;
} Heap;

/* Counters exclude prefixes, CRT overhead, C input buffers and process memory. */
static void *tracked_malloc(void *opaque, size_t size) {
    Heap *heap = opaque;
    if (!size) size = 1;
    if (size > SIZE_MAX - sizeof(Prefix) || size > heap->limit - heap->live) return NULL;
    Prefix *prefix = malloc(sizeof(*prefix) + size);
    if (!prefix) return NULL;
    prefix->size = size;
    heap->live += size;
    heap->blocks++;
    heap->allocations++;
    if (heap->live > heap->peak) heap->peak = heap->live;
    return prefix + 1;
}

static void tracked_free(void *opaque, void *pointer) {
    if (!pointer) return;
    Heap *heap = opaque;
    Prefix *prefix = (Prefix *)pointer - 1;
    assert(heap->blocks && heap->live >= prefix->size);
    heap->live -= prefix->size;
    heap->blocks--;
    free(prefix);
}

static void *tracked_calloc(void *opaque, size_t count, size_t size) {
    if (size && count > SIZE_MAX / size) return NULL;
    size_t bytes = count * size;
    void *pointer = tracked_malloc(opaque, bytes);
    if (pointer) memset(pointer, 0, bytes);
    return pointer;
}

static void *tracked_realloc(void *opaque, void *pointer, size_t size) {
    if (!pointer) return tracked_malloc(opaque, size);
    if (!size) {
        tracked_free(opaque, pointer);
        return NULL;
    }
    Heap *heap = opaque;
    Prefix *old = (Prefix *)pointer - 1;
    size_t previous = old->size;
    if (size > SIZE_MAX - sizeof(Prefix) ||
        (size > previous && size - previous > heap->limit - heap->live)) return NULL;
    Prefix *prefix = realloc(old, sizeof(*old) + size);
    if (!prefix) return NULL;
    prefix->size = size;
    heap->live = heap->live - previous + size;
    heap->reallocations++;
    if (heap->live > heap->peak) heap->peak = heap->live;
    return prefix + 1;
}

static size_t tracked_size(const void *pointer) {
    return pointer ? ((const Prefix *)pointer - 1)->size : 0;
}

static const JSMallocFunctions allocator = {
    tracked_calloc, tracked_malloc, tracked_free, tracked_realloc, tracked_size
};

static void test_allocator(void) {
    Heap heap = {0};
    heap.limit = 64;
    unsigned char *pointer = tracked_malloc(&heap, 16);
    assert(pointer && (uintptr_t)pointer % _Alignof(Prefix) == 0);
    memset(pointer, 0x5a, 16);
    assert(!tracked_calloc(&heap, SIZE_MAX, 2));
    assert(!tracked_malloc(&heap, SIZE_MAX));
    assert(!tracked_malloc(&heap, 49));
    assert(!tracked_realloc(&heap, pointer, SIZE_MAX));
    assert(!tracked_realloc(&heap, pointer, 65));
    assert(heap.live == 16 && heap.blocks == 1 && tracked_size(pointer) == 16);
    for (size_t i = 0; i < 16; ++i) assert(pointer[i] == 0x5a);
    pointer = tracked_realloc(&heap, pointer, 32);
    assert(pointer && (uintptr_t)pointer % _Alignof(Prefix) == 0);
    for (size_t i = 0; i < 16; ++i) assert(pointer[i] == 0x5a);
    pointer = tracked_realloc(&heap, pointer, 8);
    assert(pointer && heap.live == 8 && tracked_size(pointer) == 8);
    for (size_t i = 0; i < 8; ++i) assert(pointer[i] == 0x5a);
    assert(!tracked_realloc(&heap, pointer, 0));
    pointer = tracked_realloc(&heap, NULL, 8);
    assert(pointer && heap.live == 8);
    tracked_free(&heap, pointer);
    pointer = tracked_calloc(&heap, 4, 4);
    assert(pointer);
    for (size_t i = 0; i < 16; ++i) assert(pointer[i] == 0);
    tracked_free(&heap, pointer);
    pointer = tracked_malloc(&heap, 0);
    assert(pointer && heap.live == 1);
    tracked_free(&heap, pointer);
    tracked_free(&heap, NULL);
    assert(tracked_size(NULL) == 0 && heap.live == 0 && heap.blocks == 0);
    puts("{\"allocatorChecksPassed\":true}");
}

static char *read_file(const char *file, size_t *length) {
    FILE *stream = fopen(file, "rb");
    if (!stream) return NULL;
    if (fseek(stream, 0, SEEK_END)) { fclose(stream); return NULL; }
    long end = ftell(stream);
    if (end < 0 || end > 32 * 1024 * 1024 || fseek(stream, 0, SEEK_SET)) {
        fclose(stream);
        return NULL;
    }
    char *bytes = malloc((size_t)end + 1);
    if (!bytes) { fclose(stream); return NULL; }
    size_t got = fread(bytes, 1, (size_t)end, stream);
    int failed = ferror(stream);
    fclose(stream);
    if (failed || got != (size_t)end) { free(bytes); return NULL; }
    bytes[got] = 0;
    *length = got;
    return bytes;
}

typedef struct Interrupt { unsigned remaining, calls; } Interrupt;
static int interrupt(JSRuntime *runtime, void *opaque) {
    (void)runtime;
    Interrupt *state = opaque;
    state->calls++;
    if (!state->remaining) return 1;
    --state->remaining;
    return 0;
}

static void print_exception(JSContext *context) {
    JSValue error = JS_GetException(context);
    const char *message = JS_ToCString(context, error);
    fprintf(stderr, "exception: %s\n", message ? message : "unavailable");
    if (message) JS_FreeCString(context, message);
    JS_FreeValue(context, error);
}

static int run_once(const char *bundle, size_t bundle_size, const char *input,
                    size_t input_size, const char *mode, unsigned iteration) {
    int code = 0;
    size_t json_size = 0;
    Heap heap = {0};
    heap.limit = 256 * 1024 * 1024;
    if (!strcmp(mode, "memory")) heap.limit = 1024 * 1024;
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
    context = JS_NewContext(runtime);
    if (!context) { code = 3; goto cleanup; }
    evaluated = JS_Eval(context, bundle, bundle_size, "sdk-bundle.js", JS_EVAL_TYPE_GLOBAL);
    if (JS_IsException(evaluated)) { code = 2; goto cleanup; }
    if (!strcmp(mode, "interrupt")) {
        JS_SetInterruptHandler(runtime, interrupt, &polling);
        result = JS_Eval(context, "for (;;) {}", 11, "interrupt-test.js", JS_EVAL_TYPE_GLOBAL);
        code = JS_IsException(result) ? 2 : 4;
        goto cleanup;
    }
    if (!strcmp(mode, "stack")) {
        const char *recursive = "function recurse() { return 1 + recurse(); } recurse();";
        result = JS_Eval(context, recursive, strlen(recursive), "stack-test.js", JS_EVAL_TYPE_GLOBAL);
        code = JS_IsException(result) ? 2 : 4;
        goto cleanup;
    }
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
    result = JS_Call(context, function, JS_UNDEFINED, 1, &value);
    if (JS_IsException(result)) { code = 2; goto cleanup; }
    /* This probe has a synchronous contract; silently discarding jobs is invalid. */
    if (JS_IsJobPending(runtime)) { code = 4; goto cleanup; }
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
        "\"peakRequestedBytes\":%zu,\"liveRequestedBytesAfterDispose\":%zu,"
        "\"liveBlocksAfterDispose\":%zu,\"allocationRequests\":%zu,"
        "\"reallocationRequests\":%zu,\"interruptCalls\":%u}\n",
        mode, iteration, code, heap.peak, heap.live, heap.blocks,
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
        strcmp(mode, "memory") && strcmp(mode, "startup-memory") && strcmp(mode, "stack")) return 5;
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
