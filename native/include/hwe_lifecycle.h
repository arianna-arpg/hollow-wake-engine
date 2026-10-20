#ifndef HWE_LIFECYCLE_H
#define HWE_LIFECYCLE_H

#include <stdint.h>

#if defined(_WIN32) && defined(HWE_BUILD_SHARED)
#define HWE_API __declspec(dllexport)
#elif defined(_WIN32) && !defined(HWE_STATIC)
#define HWE_API __declspec(dllimport)
#elif defined(__GNUC__)
#define HWE_API __attribute__((visibility("default")))
#else
#define HWE_API
#endif
#if defined(_WIN32)
#define HWE_CALL __cdecl
#else
#define HWE_CALL
#endif

#ifdef __cplusplus
extern "C" {
#endif

/* Experimental leaf ABI. No retained pointers, allocation, callbacks or global state.
 * Callers supply valid, correctly aligned, nonoverlapping buffers of count elements.
 * Empty batches permit null buffers. All errors preserve every output/state byte.
 * See docs/native-lifecycle.md for numeric, lifetime and capability requirements. */
#define HWE_ABI_VERSION UINT32_C(0x00010000)
#define HWE_OK INT32_C(0)
#define HWE_INVALID_ARGUMENT INT32_C(1)
#define HWE_RANGE_ERROR INT32_C(2)
#define HWE_INSUFFICIENT_RESOURCES INT32_C(3)

typedef struct hwe_resources { double mana; double life; } hwe_resources;
typedef struct hwe_cast { double elapsed; double total; } hwe_cast;
typedef struct hwe_dot { double remaining; double dps; double stacks; } hwe_dot;
typedef struct hwe_layout {
    uint32_t version, resources_size, cast_size, dot_size;
} hwe_layout;

HWE_API int32_t HWE_CALL hwe_get_layout_v1(hwe_layout *output);
HWE_API int32_t HWE_CALL hwe_can_pay_v1(const hwe_resources *resources,
    const hwe_resources *cost, uint32_t *result);
HWE_API int32_t HWE_CALL hwe_pay_v1(hwe_resources *resources, const hwe_resources *cost);
HWE_API int32_t HWE_CALL hwe_cast_duration_v1(double use_time, double *duration);
HWE_API int32_t HWE_CALL hwe_advance_casts_v1(hwe_cast *states, uint32_t count,
    double dt, uint32_t *completed);
HWE_API int32_t HWE_CALL hwe_advance_cooldowns_v1(double *remaining,
    const double *rates, uint32_t count, double dt);
HWE_API int32_t HWE_CALL hwe_replace_dot_v1(hwe_dot *state, double dps,
    double duration, uint32_t *replaced);
HWE_API int32_t HWE_CALL hwe_advance_dots_v1(hwe_dot *states, uint32_t count,
    double dt, double *damage);

#ifdef __cplusplus
}
#endif
#endif
