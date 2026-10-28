#pragma once
#include "tracked-allocator.h"

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
