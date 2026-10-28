#pragma once
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
