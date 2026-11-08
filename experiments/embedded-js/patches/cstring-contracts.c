/* Isolated regression candidate. No engine-package adoption is implied. */
#include "tracked-allocator.h"

typedef struct FaultHeap { Heap heap; size_t after, attempts, refused; int armed; } FaultHeap;
static int deny(FaultHeap *heap) {
    if (!heap->armed) return 0;
    if (heap->attempts++ < heap->after) return 0;
    heap->refused++; return 1;
}
static void *fault_malloc(void *opaque, size_t size) {
    return deny(opaque) ? NULL : tracked_malloc(opaque, size);
}
static void *fault_calloc(void *opaque, size_t count, size_t size) {
    return deny(opaque) ? NULL : tracked_calloc(opaque, count, size);
}
static void *fault_realloc(void *opaque, void *pointer, size_t size) {
    return size && deny(opaque) ? NULL : tracked_realloc(opaque, pointer, size);
}
static const JSMallocFunctions faults = {
    fault_calloc, fault_malloc, tracked_free, fault_realloc, tracked_size
};
typedef struct Case {
    const char *name, *expression;
    int cesu8, throws;
    const char *unit; size_t width, count;
    const char *prefix; size_t prefix_width, prefix_count;
} Case;
static const Case cases[] = {
    {"empty", "''", 0, 0, "", 0, 0, NULL, 0, 0},
    {"ascii", "'a'.repeat(4096)", 0, 0, "a", 1, 4096, NULL, 0, 0},
    {"latin1", "'\\u00c9'.repeat(4096)", 0, 0, "\xc3\x89", 2, 4096, NULL, 0, 0},
    {"wide", "'\\u03a9'.repeat(4096)", 0, 0, "\xce\xa9", 2, 4096, NULL, 0, 0},
    {"astral-utf8", "'\\ud83d\\ude42'.repeat(2048)", 0, 0, "\xf0\x9f\x99\x82", 4, 2048, NULL, 0, 0},
    {"astral-cesu8", "'\\ud83d\\ude42'.repeat(2048)", 1, 0, "\xed\xa0\xbd\xed\xb9\x82", 6, 2048, NULL, 0, 0},
    {"lone-high", "'\\ud83d'.repeat(4096)", 0, 0, "\xed\xa0\xbd", 3, 4096, NULL, 0, 0},
    {"lone-low", "'\\ude42'.repeat(4096)", 0, 0, "\xed\xb9\x82", 3, 4096, NULL, 0, 0},
    {"embedded-nul", "'A\\0\\u03a9'.repeat(1024)", 0, 0, "A\0\xce\xa9", 4, 1024, NULL, 0, 0},
    {"ascii-slice", "'a'.repeat(8192).slice(1024,7168)", 0, 0, "a", 1, 6144, NULL, 0, 0},
    {"wide-rope", "'a'.repeat(8192)+'\\u03a9'.repeat(8192)", 0, 0, "\xce\xa9", 2, 8192, "a", 1, 8192},
    {"number", "123456789", 0, 0, "123456789", 9, 1, NULL, 0, 0},
    {"object", "({toString(){return '\\u03a9'.repeat(4096)}})", 0, 0, "\xce\xa9", 2, 4096, NULL, 0, 0},
    {"coercion-throws", "({[Symbol.toPrimitive](){throw new TypeError('refused')}})", 0, 1, "", 0, 0, NULL, 0, 0},
    {"error-object", "new Error('\\u03a9'.repeat(4096))", 0, 0, "\xce\xa9", 2, 4096, "Error: ", 7, 1}
};
static void clear_exception(JSContext *ctx) { JS_FreeValue(ctx, JS_GetException(ctx)); }
static int run(const Case *test, size_t after, int null_length) {
    FaultHeap heap = {0}; heap.heap.limit = 16 * 1024 * 1024;
    JSRuntime *rt = JS_NewRuntime2(&faults, &heap); assert(rt);
    JSContext *ctx = JS_NewContext(rt); assert(ctx);
    /* Literal encoding vectors are independent of the conversion under test. */
    size_t reference_length = test->width * test->count + test->prefix_width * test->prefix_count;
    unsigned char *expected = malloc(reference_length + 1); assert(expected);
    size_t offset = 0;
    for (size_t i = 0; i < test->prefix_count; i++, offset += test->prefix_width)
        memcpy(expected + offset, test->prefix, test->prefix_width);
    for (size_t i = 0; i < test->count; i++, offset += test->width)
        memcpy(expected + offset, test->unit, test->width);
    expected[offset] = 0;
    JSValue value = JS_Eval(ctx, test->expression, strlen(test->expression), "contract", JS_EVAL_TYPE_GLOBAL);
    assert(!JS_IsException(value));
    heap.after = after; heap.armed = 1;
    size_t length = SIZE_MAX;
    const char *converted = JS_ToCStringLen2(ctx, null_length ? NULL : &length, value, test->cesu8 != 0);
    heap.armed = 0;
    int passed = 1;
    if (!converted) {
        if (!null_length && length != 0) passed = 0;
        if (!test->throws && !heap.refused) passed = 0;
        clear_exception(ctx);
    } else {
        if (test->throws || (!null_length && length != reference_length) ||
            memcmp(converted, expected, reference_length + 1) != 0) passed = 0;
        JS_FreeCString(ctx, converted);
    }
    /* Failure must retain the caller's reference and permit a safe retry. */
    size_t retry_length = 0;
    const char *retry = JS_ToCStringLen2(ctx, &retry_length, value, test->cesu8 != 0);
    if (test->throws) { if (retry) passed = 0; clear_exception(ctx); }
    else if (!retry || retry_length != reference_length || memcmp(retry, expected, reference_length + 1) != 0) passed = 0;
    if (retry) JS_FreeCString(ctx, retry);
    free(expected); JS_FreeValue(ctx, value); JS_FreeContext(ctx); JS_FreeRuntime(rt);
    int content_passed = passed;
    if (heap.heap.live || heap.heap.blocks) passed = 0;
    printf("{\"case\":\"%s\",\"after\":%zu,\"nullLength\":%d,\"refused\":%zu,\"conversionFailed\":%d,\"liveBytes\":%zu,\"liveBlocks\":%zu,\"contentPassed\":%d,\"passed\":%d}\n",
        test->name, after, null_length, heap.refused, converted == NULL, heap.heap.live, heap.heap.blocks, content_passed, passed);
    return passed;
}
int main(void) {
    /* Keep the ordinary allocator declaration checked by both compiler families. */
    assert(allocator.js_malloc == tracked_malloc);
    int passed = 1;
    for (size_t i = 0; i < sizeof(cases) / sizeof(cases[0]); i++)
        for (size_t after = 0; after <= 6; after++)
            for (int null_length = 0; null_length <= 1; null_length++)
                passed &= run(&cases[i], after, null_length);
    return passed ? 0 : 1;
}
