#ifndef HWE_EMBEDDED_H
#define HWE_EMBEDDED_H
#include <stdint.h>

#if defined(_WIN32) && defined(HWE_JS_BUILD_SHARED)
#define HWE_JS_API __declspec(dllexport)
#elif defined(_WIN32)
#define HWE_JS_API __declspec(dllimport)
#else
#define HWE_JS_API __attribute__((visibility("default")))
#endif
#if defined(_WIN32)
#define HWE_JS_CALL __cdecl
#else
#define HWE_JS_CALL
#endif
#ifdef __cplusplus
extern "C" {
#endif

/* Experimental ABI. All pointers must address valid caller-owned storage.
 * Input bytes are borrowed only for the call; no terminating NUL is required.
 * Calls on one host may move between threads but must not race destruction.
 * Overlapping operations return BUSY; cancel is the concurrent exception.
 * Threads entering this ABI need at least a 1 MiB native stack reservation,
 * with headroom for the 256 KiB VM stack limit and surrounding caller frames.
 * The library must remain loaded until every host is destroyed. */
#define HWE_JS_ABI_VERSION UINT32_C(0x00010000)
#define HWE_JS_OK INT32_C(0)
#define HWE_JS_INVALID_ARGUMENT INT32_C(1)
#define HWE_JS_LIMIT INT32_C(2)
#define HWE_JS_OUT_OF_MEMORY INT32_C(3)
#define HWE_JS_SCRIPT_ERROR INT32_C(4)
#define HWE_JS_POISONED INT32_C(5)
#define HWE_JS_BUSY INT32_C(6)
#define HWE_JS_RESPONSE_PENDING INT32_C(7)
#define HWE_JS_NO_RESPONSE INT32_C(8)
#define HWE_JS_BUFFER_TOO_SMALL INT32_C(9)
#define HWE_JS_INTERRUPTED INT32_C(10)
#define HWE_JS_LEAK INT32_C(11)
#define HWE_JS_INVALID_UTF8 INT32_C(12)

typedef struct hwe_js_host hwe_js_host;
/* Defaults: 256 MiB heap, 1 MiB request, 4 MiB response, 1,000,000 polls.
 * Valid ranges: heap 32 KiB..1 GiB; request/response 1 byte..16 MiB;
 * polls 1..1,000,000. Both reserved fields must be zero. */
typedef struct hwe_js_options {
    uint32_t abi_version, reserved;
    uint64_t heap_limit_bytes;
    uint32_t max_request_bytes, max_response_bytes, interrupt_polls, reserved2;
} hwe_js_options;
typedef struct hwe_js_metrics {
    uint64_t live_bytes, peak_bytes, live_blocks, allocations;
    uint32_t response_pending, poisoned, cancellation_requested, reserved;
} hwe_js_metrics;
typedef struct hwe_js_layout {
    uint32_t abi_version, options_size, metrics_size, pointer_size;
} hwe_js_layout;

HWE_JS_API int32_t HWE_JS_CALL hwe_js_layout_v1(hwe_js_layout *output);
/* Null options selects defaults. Bundle/content limits are 16/32 MiB.
 * On failure output is null and all partial construction is disposed. */
HWE_JS_API int32_t HWE_JS_CALL hwe_js_create_v1(const hwe_js_options *options,
    const uint8_t *bundle, uint64_t bundle_length,
    const uint8_t *content, uint64_t content_length, hwe_js_host **output);
/* Submit executes once. Success retains a response; another submit is refused
 * until release. Parsing, execution, serialization, interruption and response
 * limit failures poison the host: an operation may already have had effects.
 * Argument/UTF-8/request-length errors happen before execution and do not poison. */
HWE_JS_API int32_t HWE_JS_CALL hwe_js_submit_v1(hwe_js_host *host,
    const uint8_t *request, uint64_t request_length, uint64_t *response_length);
/* A short buffer writes no bytes and returns the required length. Retrying this
 * copy never executes the request again. Output need not reserve a NUL byte. */
HWE_JS_API int32_t HWE_JS_CALL hwe_js_copy_response_v1(hwe_js_host *host,
    uint8_t *output, uint64_t capacity, uint64_t *written);
HWE_JS_API int32_t HWE_JS_CALL hwe_js_release_response_v1(hwe_js_host *host);
HWE_JS_API int32_t HWE_JS_CALL hwe_js_metrics_v1(hwe_js_host *host, hwe_js_metrics *output);
/* Sticky cancellation: interrupt current or next VM work; no rollback. A late
 * cancellation may arrive after a response was completed. Lifetime exclusion
 * remains the caller's responsibility; cancel must not race destruction. */
HWE_JS_API int32_t HWE_JS_CALL hwe_js_cancel_v1(hwe_js_host *host);
/* Clears the caller's owning pointer. Null ownership is an idempotent no-op.
 * Final metrics are optional and describe tracked bytes after VM disposal. */
HWE_JS_API int32_t HWE_JS_CALL hwe_js_destroy_v1(hwe_js_host **host, hwe_js_metrics *final_metrics);

#ifdef __cplusplus
}
#endif
#endif
