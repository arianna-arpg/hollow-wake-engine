#pragma once
/* Instance-owned allocation tracking shared by the development hosts. */
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

/* Counts only allocations routed through these functions. Excludes prefixes,
 * CRT overhead, unrelated caller buffers and other process memory. */
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
