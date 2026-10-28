#include "hwe_embedded.h"
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/godot.hpp>
#include <godot_cpp/variant/dictionary.hpp>
#include <godot_cpp/variant/packed_byte_array.hpp>
#include <mutex>

using namespace godot;

// Development bridge: the native library owns gameplay and its heap. Godot
// owns boundary strings/dictionaries; those allocations are outside VM metrics.
class HollowWakeHost final : public RefCounted {
    GDCLASS(HollowWakeHost, RefCounted)
    hwe_js_host *host = nullptr;
    hwe_js_metrics final_metrics{};
    std::mutex lifetime;
    std::mutex operations;
    bool delivery_failed = false;

    static Dictionary status_result(int32_t status) {
        Dictionary result; result["status"] = status; return result;
    }
    static void add_metrics(Dictionary &result, const hwe_js_metrics &metrics) {
        result["live_bytes"] = int64_t(metrics.live_bytes);
        result["peak_bytes"] = int64_t(metrics.peak_bytes);
        result["live_blocks"] = int64_t(metrics.live_blocks);
        result["allocations"] = int64_t(metrics.allocations);
        result["response_pending"] = bool(metrics.response_pending);
        result["poisoned"] = bool(metrics.poisoned);
        result["cancellation_requested"] = bool(metrics.cancellation_requested);
    }
protected:
    static void _bind_methods() {
        ClassDB::bind_method(D_METHOD("initialize", "bundle", "content", "heap_limit_bytes"), &HollowWakeHost::initialize, DEFVAL(int64_t(256 * 1024 * 1024)));
        ClassDB::bind_method(D_METHOD("submit_json", "request"), &HollowWakeHost::submit_json);
        ClassDB::bind_method(D_METHOD("get_metrics"), &HollowWakeHost::get_metrics);
        ClassDB::bind_method(D_METHOD("cancel"), &HollowWakeHost::cancel);
        ClassDB::bind_method(D_METHOD("close"), &HollowWakeHost::close);
    }
public:
    ~HollowWakeHost() override {
        close();
    }
    int64_t initialize(const PackedByteArray &bundle, const PackedByteArray &content, int64_t heap_limit_bytes) {
        std::lock_guard<std::mutex> operation(operations);
        std::lock_guard<std::mutex> lock(lifetime);
        if (host || heap_limit_bytes < 0) return HWE_JS_INVALID_ARGUMENT;
        hwe_js_layout layout{};
        const auto checked = hwe_js_layout_v1(&layout);
        if (checked != HWE_JS_OK) return checked;
        if (layout.abi_version != HWE_JS_ABI_VERSION || layout.options_size != sizeof(hwe_js_options) ||
            layout.metrics_size != sizeof(hwe_js_metrics) || layout.pointer_size != sizeof(void *)) return HWE_JS_INVALID_ARGUMENT;
        const hwe_js_options options{HWE_JS_ABI_VERSION, 0, uint64_t(heap_limit_bytes), 1024 * 1024, 4 * 1024 * 1024, 1000000, 0};
        const auto status = hwe_js_create_v1(&options, bundle.ptr(), uint64_t(bundle.size()), content.ptr(), uint64_t(content.size()), &host);
        if (status == HWE_JS_OK) { final_metrics = {}; delivery_failed = false; }
        return status;
    }
    Dictionary submit_json(const String &request) {
        std::lock_guard<std::mutex> lock(operations);
        if (!host) return status_result(HWE_JS_INVALID_ARGUMENT);
        if (delivery_failed) return status_result(HWE_JS_POISONED);
        if (request.length() > 1024 * 1024) return status_result(HWE_JS_LIMIT);
        const auto input = request.utf8();
        uint64_t required = 0, written = 0;
        auto status = hwe_js_submit_v1(host, reinterpret_cast<const uint8_t *>(input.get_data()), uint64_t(input.length()), &required);
        if (status != HWE_JS_OK) return status_result(status);
        PackedByteArray output;
        if (required > 4 * 1024 * 1024 || output.resize(int64_t(required)) != OK) status = HWE_JS_OUT_OF_MEMORY;
        else {
            status = hwe_js_copy_response_v1(host, output.ptrw(), required, &written);
            if (status == HWE_JS_OK && written != required) status = HWE_JS_BUFFER_TOO_SMALL;
        }
        const auto released = hwe_js_release_response_v1(host);
        if (status == HWE_JS_OK) status = released;
        if (status != HWE_JS_OK) {
            // Execution already happened. Never silently permit a retry when
            // this adapter could not deliver the response it owns.
            delivery_failed = true;
            return status_result(status);
        }
        auto result = status_result(HWE_JS_OK);
        result["response"] = String::utf8(reinterpret_cast<const char *>(output.ptr()), int64_t(written));
        return result;
    }
    Dictionary get_metrics() {
        std::unique_lock<std::mutex> lock(operations, std::try_to_lock);
        if (!lock.owns_lock()) return status_result(HWE_JS_BUSY);
        auto result = status_result(HWE_JS_OK);
        hwe_js_metrics metrics = final_metrics;
        if (host) result["status"] = hwe_js_metrics_v1(host, &metrics);
        add_metrics(result, metrics);
        result["closed"] = host == nullptr;
        result["delivery_failed"] = delivery_failed;
        return result;
    }
    int64_t cancel() {
        // Cancellation can overlap execution but cannot race destruction.
        std::lock_guard<std::mutex> lease(lifetime);
        return host ? hwe_js_cancel_v1(host) : HWE_JS_INVALID_ARGUMENT;
    }
    int64_t close() {
        // Wait for execution without holding the lifetime gate, so cancellation
        // can still reach the running call while this close is queued.
        std::lock_guard<std::mutex> operation(operations);
        std::lock_guard<std::mutex> lock(lifetime);
        if (!host) return HWE_JS_OK;
        return hwe_js_destroy_v1(&host, &final_metrics);
    }
};

static void initialize_hwe(ModuleInitializationLevel level) {
    if (level == MODULE_INITIALIZATION_LEVEL_SCENE) GDREGISTER_CLASS(HollowWakeHost);
}
extern "C" GDExtensionBool GDE_EXPORT hollow_wake_library_init(
    GDExtensionInterfaceGetProcAddress get_proc_address,
    GDExtensionClassLibraryPtr library, GDExtensionInitialization *initialization) {
    GDExtensionBinding::InitObject init(get_proc_address, library, initialization);
    init.register_initializer(initialize_hwe);
    init.set_minimum_library_initialization_level(MODULE_INITIALIZATION_LEVEL_SCENE);
    return init.init();
}
