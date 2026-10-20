#include "hwe_lifecycle.h"
#include <type_traits>
static_assert(std::is_standard_layout<hwe_dot>::value, "C++ consumer requires a plain layout");
int main() {
    hwe_resources state{10, 10}, cost{2, 1};
    return hwe_pay_v1(&state, &cost) == HWE_OK && state.mana == 8 && state.life == 9 ? 0 : 1;
}
