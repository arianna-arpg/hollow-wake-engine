#include "hwe_lifecycle.h"
#include <float.h>
#include <math.h>
#include <stddef.h>

#ifdef __FAST_MATH__
#error Fast math violates the lifecycle numeric contract
#endif
_Static_assert(sizeof(double) == 8 && DBL_MANT_DIG == 53 && DBL_MAX_EXP == 1024,
    "IEEE binary64 required");
_Static_assert(sizeof(hwe_resources) == 16 && offsetof(hwe_resources, life) == 8,
    "Resource ABI layout");
_Static_assert(sizeof(hwe_cast) == 16 && offsetof(hwe_cast, total) == 8, "Cast ABI layout");
_Static_assert(sizeof(hwe_dot) == 24 && offsetof(hwe_dot, dps) == 8 &&
    offsetof(hwe_dot, stacks) == 16, "Dot ABI layout");
_Static_assert(sizeof(hwe_layout) == 16, "Layout ABI");

static int nonnegative(double value) { return isfinite(value) && value >= 0; }
static int valid_dot(const hwe_dot *state) {
    return isfinite(state->remaining) && nonnegative(state->dps) && nonnegative(state->stacks);
}
static int valid_payment(const hwe_resources *resources, const hwe_resources *cost) {
    return resources && cost && nonnegative(resources->mana) && isfinite(resources->life)
        && nonnegative(cost->mana) && nonnegative(cost->life);
}
static int can_pay(const hwe_resources *resources, const hwe_resources *cost) {
    return resources->mana >= cost->mana && resources->life > cost->life;
}
/* Validate address arithmetic, not the allocation itself: that remains a C caller obligation. */
static int buffer(const void *ptr, uint32_t count, size_t stride) {
    return count == 0 || (ptr && (size_t)count <= SIZE_MAX / stride &&
        (uintptr_t)ptr <= UINTPTR_MAX - (size_t)count * stride);
}
static int disjoint(const void *a, size_t an, const void *b, size_t bn) {
    return an == 0 || bn == 0 || (uintptr_t)a + an <= (uintptr_t)b ||
        (uintptr_t)b + bn <= (uintptr_t)a;
}

int32_t HWE_CALL hwe_get_layout_v1(hwe_layout *output) {
    if (!output) return HWE_INVALID_ARGUMENT;
    output->version = HWE_ABI_VERSION;
    output->resources_size = (uint32_t)sizeof(hwe_resources);
    output->cast_size = (uint32_t)sizeof(hwe_cast);
    output->dot_size = (uint32_t)sizeof(hwe_dot);
    return HWE_OK;
}
int32_t HWE_CALL hwe_can_pay_v1(const hwe_resources *resources,
    const hwe_resources *cost, uint32_t *result) {
    if (!result || !valid_payment(resources, cost) ||
        !disjoint(resources, sizeof(*resources), result, sizeof(*result)) ||
        !disjoint(cost, sizeof(*cost), result, sizeof(*result))) return HWE_INVALID_ARGUMENT;
    *result = (uint32_t)can_pay(resources, cost);
    return HWE_OK;
}
int32_t HWE_CALL hwe_pay_v1(hwe_resources *resources, const hwe_resources *cost) {
    if (!valid_payment(resources, cost) ||
        !disjoint(resources, sizeof(*resources), cost, sizeof(*cost))) return HWE_INVALID_ARGUMENT;
    if (!can_pay(resources, cost)) return HWE_INSUFFICIENT_RESOURCES;
    resources->mana -= cost->mana;
    resources->life -= cost->life;
    return HWE_OK;
}
int32_t HWE_CALL hwe_cast_duration_v1(double use_time, double *duration) {
    if (!duration || !nonnegative(use_time)) return HWE_INVALID_ARGUMENT;
    *duration = use_time <= 0.001 ? 0 : (use_time < 0.2 ? 0.2 : use_time);
    return HWE_OK;
}
int32_t HWE_CALL hwe_advance_casts_v1(hwe_cast *states, uint32_t count,
    double dt, uint32_t *completed) {
    uint32_t i;
    if (!nonnegative(dt) || !buffer(states, count, sizeof(*states)) ||
        !buffer(completed, count, sizeof(*completed)) ||
        !disjoint(states, (size_t)count * sizeof(*states), completed,
            (size_t)count * sizeof(*completed))) return HWE_INVALID_ARGUMENT;
    /* Two passes make a failed batch atomic without a scratch allocation. */
    for (i = 0; i < count; ++i) {
        if (!nonnegative(states[i].elapsed) || !nonnegative(states[i].total)) return HWE_INVALID_ARGUMENT;
        if (!isfinite(states[i].elapsed + dt)) return HWE_RANGE_ERROR;
    }
    for (i = 0; i < count; ++i) {
        states[i].elapsed += dt;
        completed[i] = (uint32_t)(states[i].elapsed >= states[i].total);
    }
    return HWE_OK;
}
int32_t HWE_CALL hwe_advance_cooldowns_v1(double *remaining,
    const double *rates, uint32_t count, double dt) {
    uint32_t i;
    if (!nonnegative(dt) || !buffer(remaining, count, sizeof(*remaining)) ||
        !buffer(rates, count, sizeof(*rates)) ||
        !disjoint(remaining, (size_t)count * sizeof(*remaining), rates,
            (size_t)count * sizeof(*rates))) return HWE_INVALID_ARGUMENT;
    for (i = 0; i < count; ++i) {
        if (!isfinite(remaining[i]) || !nonnegative(rates[i])) return HWE_INVALID_ARGUMENT;
        if (!isfinite(remaining[i] - dt * rates[i])) return HWE_RANGE_ERROR;
    }
    for (i = 0; i < count; ++i) remaining[i] -= dt * rates[i];
    return HWE_OK;
}
int32_t HWE_CALL hwe_replace_dot_v1(hwe_dot *state, double dps,
    double duration, uint32_t *replaced) {
    if (!state || !replaced || !valid_dot(state) || !nonnegative(dps) ||
        !nonnegative(duration) || !disjoint(state, sizeof(*state), replaced,
            sizeof(*replaced))) return HWE_INVALID_ARGUMENT;
    *replaced = (uint32_t)(dps > state->dps);
    if (*replaced) { state->dps = dps; state->remaining = duration; }
    return HWE_OK;
}
int32_t HWE_CALL hwe_advance_dots_v1(hwe_dot *states, uint32_t count,
    double dt, double *damage) {
    uint32_t i;
    if (!nonnegative(dt) || !buffer(states, count, sizeof(*states)) ||
        !buffer(damage, count, sizeof(*damage)) ||
        !disjoint(states, (size_t)count * sizeof(*states), damage,
            (size_t)count * sizeof(*damage))) return HWE_INVALID_ARGUMENT;
    for (i = 0; i < count; ++i) {
        if (!valid_dot(&states[i])) return HWE_INVALID_ARGUMENT;
        if (!isfinite(states[i].dps * states[i].stacks * dt) ||
            !isfinite(states[i].remaining - dt)) return HWE_RANGE_ERROR;
    }
    for (i = 0; i < count; ++i) {
        damage[i] = states[i].dps * states[i].stacks * dt;
        states[i].remaining -= dt;
    }
    return HWE_OK;
}
