#include "hwe_embedded.h"
#include "../tracked-allocator.h"
#include <stdatomic.h>

struct hwe_js_host {
    Heap heap;
    JSRuntime *runtime;
    JSContext *context;
    JSValue controller, dispatch, encoded;
    const char *response;
    size_t response_length;
    hwe_js_options options;
    atomic_uint busy, cancellation;
    uint32_t remaining_polls, interrupted, poisoned, async_violation;
};

static int valid_utf8(const uint8_t *bytes, size_t length) {
    size_t i = 0;
    while (i < length) {
        uint32_t c = bytes[i++], value, minimum;
        size_t continuation;
        if (c < 0x80) { if (!c) return 0; continue; }
        if (c >= 0xc2 && c <= 0xdf) { value = c & 31; minimum = 0x80; continuation = 1; }
        else if (c >= 0xe0 && c <= 0xef) { value = c & 15; minimum = 0x800; continuation = 2; }
        else if (c >= 0xf0 && c <= 0xf4) { value = c & 7; minimum = 0x10000; continuation = 3; }
        else return 0;
        if (continuation > length - i) return 0;
        while (continuation--) {
            c = bytes[i++];
            if ((c & 0xc0) != 0x80) return 0;
            value = (value << 6) | (c & 63);
        }
        if (value < minimum || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) return 0;
    }
    return 1;
}

static int interrupt_vm(JSRuntime *runtime, void *opaque) {
    hwe_js_host *host = opaque;
    (void)runtime;
    if (atomic_load_explicit(&host->cancellation, memory_order_relaxed) || !host->remaining_polls) {
        host->interrupted = 1;
        return 1;
    }
    host->remaining_polls--;
    return 0;
}

static void reject_async(JSContext *context, JSValueConst promise, JSValueConst reason,
        bool handled, void *opaque) {
    (void)context; (void)promise; (void)reason;
    if (!handled) ((hwe_js_host *)opaque)->async_violation = 1;
}

static int enter(hwe_js_host *host) {
    unsigned expected = 0;
    if (!atomic_compare_exchange_strong_explicit(&host->busy, &expected, 1,
            memory_order_acquire, memory_order_relaxed)) return 0;
    JS_UpdateStackTop(host->runtime);
    return 1;
}

static void leave(hwe_js_host *host) {
    atomic_store_explicit(&host->busy, 0, memory_order_release);
}

static void metrics(const hwe_js_host *host, hwe_js_metrics *output) {
    if (!output) return;
    *output = (hwe_js_metrics){host->heap.live, host->heap.peak, host->heap.blocks,
        host->heap.allocations, host->response != NULL, host->poisoned,
        atomic_load_explicit(&host->cancellation, memory_order_relaxed), 0};
}

static void release_response(hwe_js_host *host) {
    if (host->response) JS_FreeCString(host->context, host->response);
    JS_FreeValue(host->context, host->encoded);
    host->response = NULL;
    host->encoded = JS_UNDEFINED;
    host->response_length = 0;
}

static int32_t dispose(hwe_js_host *host, hwe_js_metrics *output) {
    if (host->runtime) JS_SetInterruptHandler(host->runtime, NULL, NULL);
    if (host->context) {
        release_response(host);
        JS_FreeValue(host->context, host->dispatch);
        JS_FreeValue(host->context, host->controller);
        JS_FreeContext(host->context);
    }
    if (host->runtime) JS_FreeRuntime(host->runtime);
    metrics(host, output);
    int32_t status = host->heap.live || host->heap.blocks ? HWE_JS_LEAK : HWE_JS_OK;
    free(host);
    return status;
}

/* QuickJS requires a trailing NUL outside the supplied text length. Copies are
 * owned and charged to this host's requested-byte limit, then released. */
static char *copy_text(hwe_js_host *host, const uint8_t *bytes, size_t length) {
    char *text = tracked_malloc(&host->heap, length + 1);
    if (text) { memcpy(text, bytes, length); text[length] = 0; }
    return text;
}

static int32_t failure(hwe_js_host *host) {
    host->poisoned = 1;
    return host->interrupted || atomic_load_explicit(&host->cancellation, memory_order_relaxed)
        ? HWE_JS_INTERRUPTED : HWE_JS_SCRIPT_ERROR;
}

int32_t HWE_JS_CALL hwe_js_layout_v1(hwe_js_layout *output) {
    if (!output) return HWE_JS_INVALID_ARGUMENT;
    *output = (hwe_js_layout){HWE_JS_ABI_VERSION, sizeof(hwe_js_options), sizeof(hwe_js_metrics), sizeof(void *)};
    return HWE_JS_OK;
}

int32_t HWE_JS_CALL hwe_js_create_v1(const hwe_js_options *options,
        const uint8_t *bundle, uint64_t bundle_length,
        const uint8_t *content, uint64_t content_length, hwe_js_host **output) {
    if (!output) return HWE_JS_INVALID_ARGUMENT;
    *output = NULL;
    hwe_js_options settings = {HWE_JS_ABI_VERSION, 0, UINT64_C(256) * 1024 * 1024,
        1024 * 1024, 4 * 1024 * 1024, 1000000, 0};
    if (options) settings = *options;
    if (settings.abi_version != HWE_JS_ABI_VERSION || settings.reserved || settings.reserved2 ||
        settings.heap_limit_bytes < 32768 || settings.heap_limit_bytes > UINT64_C(1024) * 1024 * 1024 ||
        !settings.max_request_bytes || settings.max_request_bytes > 16 * 1024 * 1024 ||
        !settings.max_response_bytes || settings.max_response_bytes > 16 * 1024 * 1024 ||
        !settings.interrupt_polls || settings.interrupt_polls > 1000000 ||
        !bundle || !content || !bundle_length || !content_length) return HWE_JS_INVALID_ARGUMENT;
    if (bundle_length > 16 * 1024 * 1024 || content_length > 32 * 1024 * 1024) return HWE_JS_LIMIT;
    if (!valid_utf8(bundle, (size_t)bundle_length) || !valid_utf8(content, (size_t)content_length)) return HWE_JS_INVALID_UTF8;
    hwe_js_host *host = calloc(1, sizeof(*host));
    if (!host) return HWE_JS_OUT_OF_MEMORY;
    host->options = settings;
    host->heap.limit = (size_t)settings.heap_limit_bytes;
    host->remaining_polls = settings.interrupt_polls;
    host->controller = host->dispatch = host->encoded = JS_UNDEFINED;
    atomic_init(&host->busy, 0); atomic_init(&host->cancellation, 0);
    JSValue evaluated = JS_UNDEFINED, global = JS_UNDEFINED, exports = JS_UNDEFINED;
    JSValue factory = JS_UNDEFINED, input = JS_UNDEFINED;
    char *text = NULL;
    int32_t status = HWE_JS_OUT_OF_MEMORY;
    host->runtime = JS_NewRuntime2(&allocator, &host->heap);
    if (!host->runtime) goto cleanup;
    JS_SetMemoryLimit(host->runtime, host->heap.limit);
    JS_SetMaxStackSize(host->runtime, 256 * 1024);
    JS_SetInterruptHandler(host->runtime, interrupt_vm, host);
    JS_SetHostPromiseRejectionTracker(host->runtime, reject_async, host);
    host->context = JS_NewContext(host->runtime);
    if (!host->context) goto cleanup;
    text = copy_text(host, bundle, (size_t)bundle_length);
    if (!text) goto cleanup;
    evaluated = JS_Eval(host->context, text, (size_t)bundle_length, "session-bundle.js", JS_EVAL_TYPE_GLOBAL);
    tracked_free(&host->heap, text); text = NULL;
    status = HWE_JS_SCRIPT_ERROR;
    if (JS_IsException(evaluated)) goto cleanup;
    global = JS_GetGlobalObject(host->context);
    exports = JS_GetPropertyStr(host->context, global, "HollowWakeSession");
    if (JS_IsException(exports)) goto cleanup;
    factory = JS_GetPropertyStr(host->context, exports, "create");
    if (JS_IsException(factory)) goto cleanup;
    host->dispatch = JS_GetPropertyStr(host->context, exports, "dispatch");
    if (!JS_IsFunction(host->context, factory) || !JS_IsFunction(host->context, host->dispatch)) goto cleanup;
    text = copy_text(host, content, (size_t)content_length);
    if (!text) { status = HWE_JS_OUT_OF_MEMORY; goto cleanup; }
    input = JS_ParseJSON(host->context, text, (size_t)content_length, "content.json");
    tracked_free(&host->heap, text); text = NULL;
    if (JS_IsException(input)) goto cleanup;
    host->controller = JS_Call(host->context, factory, JS_UNDEFINED, 1, &input);
    if (JS_IsException(host->controller) || !JS_IsObject(host->controller) || JS_IsPromise(host->controller) ||
        host->async_violation || JS_IsJobPending(host->runtime)) goto cleanup;
    status = HWE_JS_OK;
cleanup:
    if (text) tracked_free(&host->heap, text);
    if (host->context) {
        JS_FreeValue(host->context, input); JS_FreeValue(host->context, factory);
        JS_FreeValue(host->context, exports); JS_FreeValue(host->context, global);
        JS_FreeValue(host->context, evaluated);
    }
    if (status != HWE_JS_OK) {
        if (host->interrupted) status = HWE_JS_INTERRUPTED;
        if (dispose(host, NULL) != HWE_JS_OK) return HWE_JS_LEAK;
        return status;
    }
    *output = host;
    return HWE_JS_OK;
}

int32_t HWE_JS_CALL hwe_js_submit_v1(hwe_js_host *host, const uint8_t *request,
        uint64_t request_length, uint64_t *response_length) {
    if (response_length) *response_length = 0;
    if (!host || !request || !request_length || !response_length) return HWE_JS_INVALID_ARGUMENT;
    if (request_length > host->options.max_request_bytes) return HWE_JS_LIMIT;
    if (!valid_utf8(request, (size_t)request_length)) return HWE_JS_INVALID_UTF8;
    if (!enter(host)) return HWE_JS_BUSY;
    int32_t status = HWE_JS_OK;
    JSValue value = JS_UNDEFINED, result = JS_UNDEFINED;
    char *text = NULL;
    if (host->poisoned) { status = HWE_JS_POISONED; goto cleanup; }
    if (host->response) { status = HWE_JS_RESPONSE_PENDING; goto cleanup; }
    if (atomic_load_explicit(&host->cancellation, memory_order_relaxed)) { status = failure(host); goto cleanup; }
    host->remaining_polls = host->options.interrupt_polls;
    host->interrupted = 0;
    text = copy_text(host, request, (size_t)request_length);
    if (!text) { status = HWE_JS_OUT_OF_MEMORY; host->poisoned = 1; goto cleanup; }
    value = JS_ParseJSON(host->context, text, (size_t)request_length, "request.json");
    tracked_free(&host->heap, text); text = NULL;
    if (JS_IsException(value)) { status = failure(host); goto cleanup; }
    JSValue arguments[2] = {host->controller, value};
    result = JS_Call(host->context, host->dispatch, JS_UNDEFINED, 2, arguments);
    if (JS_IsException(result) || JS_IsPromise(result) || host->async_violation ||
        JS_IsJobPending(host->runtime)) { status = failure(host); goto cleanup; }
    host->encoded = JS_JSONStringify(host->context, result, JS_UNDEFINED, JS_UNDEFINED);
    if (!JS_IsString(host->encoded)) { status = failure(host); goto cleanup; }
    host->response = JS_ToCStringLen(host->context, &host->response_length, host->encoded);
    if (!host->response || host->async_violation || JS_IsJobPending(host->runtime) ||
        atomic_load_explicit(&host->cancellation, memory_order_relaxed)) { status = failure(host); goto cleanup; }
    if (host->response_length > host->options.max_response_bytes) {
        status = HWE_JS_LIMIT; host->poisoned = 1; goto cleanup;
    }
    *response_length = host->response_length;
cleanup:
    if (text) tracked_free(&host->heap, text);
    JS_FreeValue(host->context, result); JS_FreeValue(host->context, value);
    if (host->poisoned) release_response(host);
    leave(host);
    return status;
}

int32_t HWE_JS_CALL hwe_js_copy_response_v1(hwe_js_host *host, uint8_t *output,
        uint64_t capacity, uint64_t *written) {
    if (written) *written = 0;
    if (!host || !written || (!output && capacity)) return HWE_JS_INVALID_ARGUMENT;
    if (!enter(host)) return HWE_JS_BUSY;
    int32_t status = HWE_JS_OK;
    if (!host->response) status = HWE_JS_NO_RESPONSE;
    else {
        *written = host->response_length;
        if (capacity < host->response_length) status = HWE_JS_BUFFER_TOO_SMALL;
        else memcpy(output, host->response, host->response_length);
    }
    leave(host);
    return status;
}

int32_t HWE_JS_CALL hwe_js_release_response_v1(hwe_js_host *host) {
    if (!host) return HWE_JS_INVALID_ARGUMENT;
    if (!enter(host)) return HWE_JS_BUSY;
    int32_t status = host->response ? HWE_JS_OK : HWE_JS_NO_RESPONSE;
    release_response(host);
    leave(host);
    return status;
}

int32_t HWE_JS_CALL hwe_js_metrics_v1(hwe_js_host *host, hwe_js_metrics *output) {
    if (!host || !output) return HWE_JS_INVALID_ARGUMENT;
    if (!enter(host)) return HWE_JS_BUSY;
    metrics(host, output);
    leave(host);
    return HWE_JS_OK;
}

int32_t HWE_JS_CALL hwe_js_cancel_v1(hwe_js_host *host) {
    if (!host) return HWE_JS_INVALID_ARGUMENT;
    atomic_store_explicit(&host->cancellation, 1, memory_order_relaxed);
    return HWE_JS_OK;
}

int32_t HWE_JS_CALL hwe_js_destroy_v1(hwe_js_host **host, hwe_js_metrics *final_metrics) {
    if (final_metrics) memset(final_metrics, 0, sizeof(*final_metrics));
    if (!host) return HWE_JS_INVALID_ARGUMENT;
    if (!*host) return HWE_JS_OK;
    if (!enter(*host)) return HWE_JS_BUSY;
    hwe_js_host *owned = *host;
    *host = NULL;
    return dispose(owned, final_metrics);
}
