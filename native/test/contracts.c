#include "hwe_lifecycle.h"
#include <assert.h>
#include <float.h>
#include <math.h>
#include <stdio.h>
#include <string.h>

int main(void) {
    hwe_layout layout;
    hwe_resources resources = {6, 5}, cost = {6, 5}, saved_resources;
    hwe_cast casts[2] = {{0, .2}, {1, 2}}, saved_casts[2];
    hwe_dot dots[2] = {{.01, 10, 1}, {1, 20, 2}}, saved_dots[2];
    uint32_t complete[2] = {73, 74}, result = 99;
    double damage[2] = {71, 72}, remaining[2] = {1, 2}, rates[2] = {1, 2};
    double duration = 99;
    assert(hwe_get_layout_v1(&layout) == HWE_OK && layout.version == HWE_ABI_VERSION);
    assert(layout.resources_size == sizeof(resources) && layout.dot_size == sizeof(dots[0]));
    assert(hwe_get_layout_v1(NULL) == HWE_INVALID_ARGUMENT);
    assert(hwe_can_pay_v1(&resources, &cost, &result) == HWE_OK && result == 0);
    saved_resources = resources;
    assert(hwe_pay_v1(&resources, &cost) == HWE_INSUFFICIENT_RESOURCES);
    assert(memcmp(&resources, &saved_resources, sizeof(resources)) == 0);
    resources.life = 6;
    assert(hwe_pay_v1(&resources, &cost) == HWE_OK && resources.mana == 0 && resources.life == 1);
    cost.mana = NAN; saved_resources = resources;
    assert(hwe_pay_v1(&resources, &cost) == HWE_INVALID_ARGUMENT);
    assert(memcmp(&resources, &saved_resources, sizeof(resources)) == 0);
    assert(hwe_pay_v1(&resources, &resources) == HWE_INVALID_ARGUMENT);
    assert(hwe_can_pay_v1(NULL, &cost, &result) == HWE_INVALID_ARGUMENT);
    assert(hwe_cast_duration_v1(.001, &duration) == HWE_OK && duration == 0);
    assert(hwe_cast_duration_v1(nextafter(.001, 1), &duration) == HWE_OK && duration == .2);
    assert(hwe_cast_duration_v1(-1, &duration) == HWE_INVALID_ARGUMENT && duration == .2);
    assert(hwe_cast_duration_v1(INFINITY, &duration) == HWE_INVALID_ARGUMENT && duration == .2);
    assert(hwe_advance_casts_v1(NULL, 0, 0, NULL) == HWE_OK);
    assert(hwe_advance_cooldowns_v1(NULL, NULL, 0, 0) == HWE_OK);
    assert(hwe_advance_dots_v1(NULL, 0, 0, NULL) == HWE_OK);
    assert(hwe_advance_dots_v1(NULL, 1, 0, damage) == HWE_INVALID_ARGUMENT);
    assert(hwe_advance_casts_v1(NULL, 0, NAN, NULL) == HWE_INVALID_ARGUMENT);
    assert(hwe_advance_casts_v1(casts, 2, .2, complete) == HWE_OK);
    assert(casts[0].elapsed == .2 && complete[0] == 1 && complete[1] == 0);
    casts[1].total = NAN; memcpy(saved_casts, casts, sizeof(casts));
    complete[0] = 73; complete[1] = 74;
    assert(hwe_advance_casts_v1(casts, 2, 1, complete) == HWE_INVALID_ARGUMENT);
    assert(memcmp(saved_casts, casts, sizeof(casts)) == 0 && complete[0] == 73 && complete[1] == 74);
    casts[1].total = 2; casts[1].elapsed = DBL_MAX; memcpy(saved_casts, casts, sizeof(casts));
    assert(hwe_advance_casts_v1(casts, 2, DBL_MAX, complete) == HWE_RANGE_ERROR);
    assert(memcmp(saved_casts, casts, sizeof(casts)) == 0 && complete[0] == 73 && complete[1] == 74);
    assert(hwe_advance_cooldowns_v1(remaining, rates, 2, 2) == HWE_OK);
    assert(remaining[0] == -1 && remaining[1] == -2);
    rates[1] = NAN;
    assert(hwe_advance_cooldowns_v1(remaining, rates, 2, .1) == HWE_INVALID_ARGUMENT);
    assert(remaining[0] == -1 && remaining[1] == -2);
    rates[1] = DBL_MAX;
    assert(hwe_advance_cooldowns_v1(remaining, rates, 2, 2) == HWE_RANGE_ERROR);
    assert(remaining[0] == -1 && remaining[1] == -2);
    assert(hwe_advance_cooldowns_v1(remaining, remaining, 2, 0) == HWE_INVALID_ARGUMENT);
    assert(hwe_replace_dot_v1(&dots[0], 10, 30, &result) == HWE_OK && result == 0 && dots[0].remaining == .01);
    assert(hwe_replace_dot_v1(&dots[0], 11, .01, &result) == HWE_OK && result == 1);
    assert(hwe_advance_dots_v1(dots, 2, .1, damage) == HWE_OK);
    assert(damage[0] == 1.1 && damage[1] == 4 && dots[0].remaining < 0);
    dots[1].dps = DBL_MAX; dots[1].stacks = 2; memcpy(saved_dots, dots, sizeof(dots));
    damage[0] = 71; damage[1] = 72;
    assert(hwe_advance_dots_v1(dots, 2, 1, damage) == HWE_RANGE_ERROR);
    assert(memcmp(saved_dots, dots, sizeof(dots)) == 0 && damage[0] == 71 && damage[1] == 72);
    dots[1].dps = NAN; memcpy(saved_dots, dots, sizeof(dots));
    assert(hwe_advance_dots_v1(dots, 2, 1, damage) == HWE_INVALID_ARGUMENT);
    assert(memcmp(saved_dots, dots, sizeof(dots)) == 0 && damage[0] == 71 && damage[1] == 72);
    assert(hwe_advance_dots_v1(dots, 2, 0, &dots[0].remaining) == HWE_INVALID_ARGUMENT);
    dots[0].dps = DBL_TRUE_MIN; dots[0].stacks = 1;
    assert(hwe_advance_dots_v1(dots, 1, 1, damage) == HWE_OK && damage[0] == DBL_TRUE_MIN);
    puts("Native ABI contracts: layout, payments, bounds, atomic batches, aliases, overflow, subnormals and expiry passed");
    return 0;
}
