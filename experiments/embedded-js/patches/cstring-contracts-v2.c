/* Revision 2: cold behavior comparison and initialized ownership.
 * Revision 1 and its failed Linux evidence remain unchanged. */
#include "tracked-allocator.h"

typedef struct FaultHeap { Heap heap; size_t after, attempts, refused; int armed; } FaultHeap;
static int deny(FaultHeap *heap) {
    if (!heap->armed) return 0;
    if (heap->attempts++ < heap->after) return 0;
    heap->refused++; return 1;
}
static void *fault_malloc(void *opaque, size_t size) { return deny(opaque) ? NULL : tracked_malloc(opaque, size); }
static void *fault_calloc(void *opaque, size_t count, size_t size) { return deny(opaque) ? NULL : tracked_calloc(opaque, count, size); }
static void *fault_realloc(void *opaque, void *pointer, size_t size) { return size && deny(opaque) ? NULL : tracked_realloc(opaque, pointer, size); }
static const JSMallocFunctions faults = { fault_calloc, fault_malloc, tracked_free, fault_realloc, tracked_size };
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
typedef struct Observation {
    int failed, error_tag, message_string, terminated;
    size_t length, bytes, message_length;
    unsigned char *data, *message;
} Observation;
static unsigned char *copy_bytes(const char *value, size_t length) {
    assert(length <= 128 * 1024);
    unsigned char *copy = malloc(length + 1); assert(copy);
    memcpy(copy, value, length); copy[length] = 0; return copy;
}
static Observation observe(JSContext *ctx, const char *value, size_t length, int null_length) {
    Observation result = {0}; result.failed = value == NULL;
    if (value) {
        /* NULL length exposes only the C prefix; the retry checks the entire
         * binary string, including bytes after an embedded NUL. */
        result.bytes = null_length ? strlen(value) : length;
        result.length = null_length ? 0 : length;
        result.terminated = value[result.bytes] == 0;
        result.data = copy_bytes(value, result.bytes);
    } else {
        result.length = null_length ? 0 : length;
        JSValue error = JS_GetException(ctx);
        result.error_tag = (int)JS_VALUE_GET_TAG(error);
        /* Read only the own message of these built-in error values. Calling
         * Error.toString would initialize more built-ins and change the probe. */
        JSValue message = JS_IsError(error) ? JS_GetPropertyStr(ctx, error, "message") : JS_UNDEFINED;
        result.message_string = JS_IsString(message);
        if (result.message_string) {
            const char *text = JS_ToCStringLen(ctx, &result.message_length, message); assert(text);
            result.message = copy_bytes(text, result.message_length);
            JS_FreeCString(ctx, text);
        }
        JS_FreeValue(ctx, message); JS_FreeValue(ctx, error);
        assert(!JS_HasException(ctx));
    }
    return result;
}
static int matches(const Observation *value, const unsigned char *expected, size_t length, int null_length) {
    if (value->failed) return 0;
    if (null_length) {
        const unsigned char *nul = memchr(expected, 0, length);
        if (nul) length = (size_t)(nul - expected);
    }
    return value->terminated && value->bytes == length && memcmp(value->data, expected, length) == 0;
}
static void hex(const unsigned char *bytes, size_t length) {
    for (size_t i = 0; i < length; i++) printf("%02x", bytes[i]);
}
static void print_observation(const Observation *value) {
    printf("{\"failed\":%d,\"length\":%zu,\"terminated\":%d,\"hex\":\"", value->failed, value->length, value->terminated);
    hex(value->data, value->bytes);
    printf("\",\"errorTag\":%d,\"messageString\":%d,\"messageHex\":\"", value->error_tag, value->message_string);
    hex(value->message, value->message_length); printf("\"}");
}
static void free_observation(Observation *value) { free(value->data); free(value->message); }
static int run(const Case *test, size_t after, int null_length, int warm) {
    FaultHeap heap = {0}; heap.heap.limit = 16 * 1024 * 1024;
    JSRuntime *rt = JS_NewRuntime2(&faults, &heap); assert(rt);
    JSContext *ctx = JS_NewContext(rt); assert(ctx);
    size_t reference_length = test->width * test->count + test->prefix_width * test->prefix_count;
    unsigned char *expected = malloc(reference_length + 1); assert(expected);
    size_t offset = 0;
    for (size_t i = 0; i < test->prefix_count; i++, offset += test->prefix_width) memcpy(expected + offset, test->prefix, test->prefix_width);
    for (size_t i = 0; i < test->count; i++, offset += test->width) memcpy(expected + offset, test->unit, test->width);
    expected[offset] = 0;
    JSValue value = JS_Eval(ctx, test->expression, strlen(test->expression), "contract", JS_EVAL_TYPE_GLOBAL);
    assert(!JS_IsException(value));
    if (warm) {
        size_t length = 0; const char *text = JS_ToCStringLen2(ctx, &length, value, test->cesu8 != 0);
        Observation observation = observe(ctx, text, length, 0);
        assert(test->throws ? observation.failed : matches(&observation, expected, reference_length, 0));
        if (text) JS_FreeCString(ctx, text);
        free_observation(&observation);
    }
    heap.after = after; heap.armed = 1;
    size_t length = SIZE_MAX;
    const char *converted = JS_ToCStringLen2(ctx, null_length ? NULL : &length, value, test->cesu8 != 0);
    heap.armed = 0;
    Observation first = observe(ctx, converted, length, null_length);
    int first_valid = converted ? !test->throws && matches(&first, expected, reference_length, null_length)
        : (null_length || length == 0) && (test->throws || heap.refused > 0);
    if (converted) JS_FreeCString(ctx, converted);
    size_t retry_length = SIZE_MAX;
    const char *retry = JS_ToCStringLen2(ctx, &retry_length, value, test->cesu8 != 0);
    Observation second = observe(ctx, retry, retry_length, 0);
    int retry_valid = test->throws ? second.failed && retry_length == 0 : matches(&second, expected, reference_length, 0);
    if (retry) JS_FreeCString(ctx, retry);
    free(expected); JS_FreeValue(ctx, value); JS_FreeContext(ctx); JS_FreeRuntime(rt);
    int passed = first_valid && (!warm || retry_valid) && heap.heap.live == 0 && heap.heap.blocks == 0;
    printf("{\"case\":\"%s\",\"after\":%zu,\"nullLength\":%d,\"warm\":%d,\"refused\":%zu,\"firstValid\":%d,\"retryValid\":%d,\"first\":",
        test->name, after, null_length, warm, heap.refused, first_valid, retry_valid);
    print_observation(&first); printf(",\"retry\":"); print_observation(&second);
    printf(",\"liveBytes\":%zu,\"liveBlocks\":%zu,\"prefixBytes\":%zu,\"passed\":%d}\n", heap.heap.live, heap.heap.blocks, sizeof(Prefix), passed);
    free_observation(&first); free_observation(&second);
    fflush(stdout); /* Preserve each complete row if LeakSanitizer terminates. */
    return passed;
}
int main(int argc, char **argv) {
    setvbuf(stdout, NULL, _IOFBF, 64 * 1024);
    assert(argc == 2 && (!strcmp(argv[1], "cold") || !strcmp(argv[1], "warm")));
    assert(allocator.js_malloc == tracked_malloc);
    int warm = !strcmp(argv[1], "warm"), passed = 1;
    for (size_t i = 0; i < sizeof(cases) / sizeof(cases[0]); i++)
        for (size_t after = 0; after <= 6; after++)
            for (int null_length = 0; null_length <= 1; null_length++)
                passed &= run(&cases[i], after, null_length, warm);
    return passed ? 0 : 1;
}
