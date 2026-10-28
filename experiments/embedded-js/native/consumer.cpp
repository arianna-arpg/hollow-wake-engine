#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include "hwe_embedded.h"
#include <chrono>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <future>
#include <iostream>
#include <iterator>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

static void require(bool condition, const char *message) {
    if (!condition) throw std::runtime_error(message);
}
static std::string read(const std::filesystem::path &path) {
    std::ifstream stream(path, std::ios::binary);
    require(stream.good(), "Open fixture");
    return {std::istreambuf_iterator<char>(stream), std::istreambuf_iterator<char>()};
}
struct Api {
    HMODULE module;
    template<class T> T load(const char *name) {
        FARPROC address = GetProcAddress(module, name);
        require(address != nullptr, name);
        T pointer;
        static_assert(sizeof(pointer) == sizeof(address));
        std::memcpy(&pointer, &address, sizeof(pointer));
        return pointer;
    }
    decltype(&hwe_js_layout_v1) layout;
    decltype(&hwe_js_create_v1) create;
    decltype(&hwe_js_submit_v1) submit;
    decltype(&hwe_js_copy_response_v1) copy;
    decltype(&hwe_js_release_response_v1) release;
    decltype(&hwe_js_metrics_v1) metrics;
    decltype(&hwe_js_cancel_v1) cancel;
    decltype(&hwe_js_destroy_v1) destroy;
    explicit Api(const wchar_t *path) : module(LoadLibraryW(path)) {
        require(module != nullptr, "Load library");
        try {
            layout = load<decltype(layout)>("hwe_js_layout_v1");
            create = load<decltype(create)>("hwe_js_create_v1");
            submit = load<decltype(submit)>("hwe_js_submit_v1");
            copy = load<decltype(copy)>("hwe_js_copy_response_v1");
            release = load<decltype(release)>("hwe_js_release_response_v1");
            metrics = load<decltype(metrics)>("hwe_js_metrics_v1");
            cancel = load<decltype(cancel)>("hwe_js_cancel_v1");
            destroy = load<decltype(destroy)>("hwe_js_destroy_v1");
        } catch (...) { FreeLibrary(module); throw; }
    }
    Api(const Api &) = delete;
    Api &operator=(const Api &) = delete;
    ~Api() { FreeLibrary(module); }
};
static const char *probe = R"JS(var HollowWakeSession={
create(input){return {n:input.n||0};},
dispatch(root,r){
 if(r.op==='hang')while(true){}
 if(r.op==='throw'){root.n++;throw Error('execution');}
 if(r.op==='bigint'){root.n++;return 1n;}
 if(r.op==='promise')return Promise.resolve(1);
 if(r.op==='queued'){Promise.resolve().then(()=>root.n++);return {n:root.n};}
 if(r.op==='rejected'){Promise.reject(Error('unhandled'));return {n:root.n};}
 if(r.op==='toJSON')return {toJSON(){throw Error('serialization');}};
 if(r.op==='asyncJSON')return {toJSON(){Promise.resolve().then(()=>root.n++);return 1;}};
 if(r.op==='large'){root.n++;return 'x'.repeat(1024);}
 if(r.op==='oom'){const a=[];while(true)a.push(new Array(10000).fill(1));}
 if(r.op==='recursive')return(function f(){return f();})();
 root.n+=(r.inc||0);return {n:root.n,text:r.text||''};
}};)JS";
static const uint8_t *bytes(const std::string &value) {
    return reinterpret_cast<const uint8_t *>(value.data());
}
static hwe_js_options defaults() {
    return {HWE_JS_ABI_VERSION, 0, UINT64_C(256) * 1024 * 1024, 1024 * 1024, 4 * 1024 * 1024, 1000000, 0};
}
struct Host {
    Api &api;
    hwe_js_host *value = nullptr;
    Host(Api &owner, const std::string &bundle, const std::string &content, const hwe_js_options *options = nullptr) : api(owner) {
        require(api.create(options, bytes(bundle), bundle.size(), bytes(content), content.size(), &value) == HWE_JS_OK, "Create host");
    }
    Host(const Host &) = delete;
    Host &operator=(const Host &) = delete;
    ~Host() { if (value && api.destroy(&value, nullptr) != HWE_JS_OK) std::terminate(); }
    int32_t submit(const std::string &request, uint64_t &length) {
        return api.submit(value, bytes(request), request.size(), &length);
    }
    hwe_js_metrics metrics() {
        hwe_js_metrics result{};
        require(api.metrics(value, &result) == HWE_JS_OK, "Read metrics");
        return result;
    }
    std::string request(const std::string &request) {
        uint64_t length = 0, written = 0;
        require(submit(request, length) == HWE_JS_OK, "Submit request");
        std::string response(static_cast<size_t>(length), '\0');
        require(api.copy(value, reinterpret_cast<uint8_t *>(response.data()), length, &written) == HWE_JS_OK && written == length, "Copy result");
        require(api.release(value) == HWE_JS_OK, "Release result");
        return response;
    }
    hwe_js_metrics close() {
        hwe_js_metrics result{};
        require(api.destroy(&value, &result) == HWE_JS_OK && !value, "Dispose host");
        require(result.live_bytes == 0 && result.live_blocks == 0, "No tracked allocations survive disposal");
        return result;
    }
};

static void contracts(Api &api) {
    hwe_js_layout layout{};
    require(api.layout(&layout) == HWE_JS_OK && layout.abi_version == HWE_JS_ABI_VERSION &&
        layout.options_size == sizeof(hwe_js_options) && layout.metrics_size == sizeof(hwe_js_metrics) &&
        layout.pointer_size == sizeof(void *), "ABI layouts");
    require(api.layout(nullptr) == HWE_JS_INVALID_ARGUMENT, "Null layout");
    std::string content = "{\"n\":0}";
    Host first(api, probe, content), second(api, probe, "{\"n\":10}");
    content.assign(content.size(), 'x');
    uint64_t length = 0, written = 0;
    std::string command = "{\"inc\":2}";
    require(first.submit(command, length) == HWE_JS_OK && length > 1, "Submit once");
    command.assign(command.size(), 'x');
    uint8_t small = 0xab;
    require(api.copy(first.value, &small, 1, &written) == HWE_JS_BUFFER_TOO_SMALL && written == length && small == 0xab, "Short buffer preserves bytes");
    uint64_t ignored = 42;
    require(first.submit("{\"inc\":99}", ignored) == HWE_JS_RESPONSE_PENDING && ignored == 0, "Pending response prevents execution");
    std::string copied(static_cast<size_t>(length), '\0'), repeated = copied;
    require(api.copy(first.value, reinterpret_cast<uint8_t *>(copied.data()), length, &written) == HWE_JS_OK, "Exact-sized buffer");
    require(api.copy(first.value, reinterpret_cast<uint8_t *>(repeated.data()), length, &written) == HWE_JS_OK && copied == repeated, "Copy retries are stable");
    require(copied == "{\"n\":2,\"text\":\"\"}" && first.metrics().response_pending == 1, "Inputs and response are owned");
    require(api.release(first.value) == HWE_JS_OK, "Release owned response");
    require(api.copy(first.value, nullptr, 0, &written) == HWE_JS_NO_RESPONSE && written == 0, "Released response inaccessible");
    require(api.release(first.value) == HWE_JS_NO_RESPONSE, "Duplicate release is safe");
    for (const auto &invalid : std::vector<std::string>{std::string("\0", 1), "\xc0\xaf", "\xed\xa0\x80", "\xf4\x90\x80\x80", "\xe2\x82", "\x80"}) {
        require(first.submit(invalid, ignored) == HWE_JS_INVALID_UTF8, "Malformed UTF-8 rejected");
    }
    require(first.submit("", ignored) == HWE_JS_INVALID_ARGUMENT, "Empty request rejected");
    require(api.submit(first.value, nullptr, 1, &ignored) == HWE_JS_INVALID_ARGUMENT, "Null request rejected");
    require(first.request(u8"{\"inc\":1,\"text\":\"é β 中 🎮\"}") == u8"{\"n\":3,\"text\":\"é β 中 🎮\"}", "Unicode roundtrip and atomic invalid-input rejection");
    require(second.request("{}") == "{\"n\":10,\"text\":\"\"}", "Runtime isolation");
    std::string moved;
    std::exception_ptr movedError;
    std::thread thread([&] { try { moved = first.request("{\"inc\":1}"); } catch (...) { movedError = std::current_exception(); } });
    thread.join(); if (movedError) std::rethrow_exception(movedError);
    require(moved == "{\"n\":4,\"text\":\"\"}" && first.request("{}") == moved, "Serialized thread migration");
    first.close();
    require(second.request("{\"inc\":1}") == "{\"n\":11,\"text\":\"\"}", "Other runtime survives disposal");
    second.close();
    require(api.destroy(&first.value, nullptr) == HWE_JS_OK, "Owning-slot disposal is idempotent");

    auto settings = defaults(); settings.max_request_bytes = 8;
    Host bounded(api, probe, "{}", &settings);
    require(bounded.submit("{\"inc\":1}", ignored) == HWE_JS_LIMIT && bounded.metrics().poisoned == 0 &&
        bounded.request("{}") == "{\"n\":0,\"text\":\"\"}", "Request limit is pre-execution");
    bounded.close();
    settings = defaults(); settings.max_response_bytes = 8;
    Host outputBound(api, probe, "{}", &settings);
    require(outputBound.submit("{}", ignored) == HWE_JS_LIMIT && outputBound.metrics().poisoned == 1 &&
        outputBound.metrics().response_pending == 0 && outputBound.submit("{}", ignored) == HWE_JS_POISONED, "Response-limit failure poisons");
    outputBound.close();
    for (const auto *operation : {"throw", "bigint", "promise", "queued", "rejected", "toJSON", "asyncJSON", "recursive", "oom"}) {
        settings = defaults(); settings.heap_limit_bytes = 2 * 1024 * 1024;
        Host failing(api, probe, "{}", &settings);
        require(failing.submit(std::string("{\"op\":\"") + operation + "\"}", ignored) == HWE_JS_SCRIPT_ERROR, operation);
        require(failing.metrics().poisoned == 1 && failing.submit("{}", ignored) == HWE_JS_POISONED, "Failure prevents reuse");
        failing.close();
    }
    Host malformed(api, probe, "{}");
    require(malformed.submit("{", ignored) == HWE_JS_SCRIPT_ERROR && malformed.metrics().poisoned == 1, "Malformed JSON poisons");
    malformed.close();
    settings = defaults(); settings.interrupt_polls = 100;
    Host interrupted(api, probe, "{}", &settings);
    require(interrupted.submit("{\"op\":\"hang\"}", ignored) == HWE_JS_INTERRUPTED, "Interrupt-poll budget");
    interrupted.close();
    Host sticky(api, probe, "{}");
    require(api.cancel(sticky.value) == HWE_JS_OK && sticky.submit("{}", ignored) == HWE_JS_INTERRUPTED, "Idle cancellation is sticky");
    sticky.close();

    Host concurrent(api, probe, "{}");
    auto *borrowed = concurrent.value;
    std::promise<int32_t> finished;
    auto result = finished.get_future();
    std::thread worker([&] {
        uint64_t response = 0;
        const std::string request = "{\"op\":\"hang\"}";
        finished.set_value(api.submit(borrowed, bytes(request), request.size(), &response));
    });
    int32_t observed = HWE_JS_OK;
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(10);
    hwe_js_metrics observedMetrics{};
    while (observed != HWE_JS_BUSY && std::chrono::steady_clock::now() < deadline &&
            result.wait_for(std::chrono::seconds(0)) != std::future_status::ready) {
        observed = api.metrics(concurrent.value, &observedMetrics);
        std::this_thread::yield();
    }
    const auto submitWhileBusy = concurrent.submit("{}", ignored);
    const auto destroyWhileBusy = api.destroy(&concurrent.value, nullptr);
    if (concurrent.value) api.cancel(concurrent.value);
    worker.join();
    require(observed == HWE_JS_BUSY && submitWhileBusy == HWE_JS_BUSY && destroyWhileBusy == HWE_JS_BUSY,
        "Overlapping VM work and destruction are rejected");
    require(result.get() == HWE_JS_INTERRUPTED && concurrent.metrics().poisoned == 1, "Concurrent cancellation interrupts VM work");
    concurrent.close();

    const std::string smallBundle = probe, input = "{}";
    auto rejectedCreate = [&](const std::string &source, const std::string &data, const hwe_js_options *options, int32_t expected) {
        hwe_js_host *host = nullptr;
        const auto status = api.create(options, bytes(source), source.size(), bytes(data), data.size(), &host);
        require(status == expected && host == nullptr, "Failed construction releases ownership");
    };
    settings = defaults(); settings.abi_version++;
    rejectedCreate(smallBundle, input, &settings, HWE_JS_INVALID_ARGUMENT);
    settings = defaults(); settings.reserved = 1;
    rejectedCreate(smallBundle, input, &settings, HWE_JS_INVALID_ARGUMENT);
    settings = defaults(); settings.heap_limit_bytes = 32768;
    rejectedCreate(smallBundle, input, &settings, HWE_JS_OUT_OF_MEMORY);
    rejectedCreate("{", input, nullptr, HWE_JS_SCRIPT_ERROR);
    rejectedCreate(smallBundle, "{", nullptr, HWE_JS_SCRIPT_ERROR);
    rejectedCreate("var HollowWakeSession={create(){return Promise.resolve({});},dispatch(){return 1;}}", input, nullptr, HWE_JS_SCRIPT_ERROR);
    rejectedCreate("var HollowWakeSession={create(){throw Error('creation');},dispatch(){return 1;}}", input, nullptr, HWE_JS_SCRIPT_ERROR);
    rejectedCreate("var HollowWakeSession={create(){return {};}}", input, nullptr, HWE_JS_SCRIPT_ERROR);
    rejectedCreate(std::string("\x80"), input, nullptr, HWE_JS_INVALID_UTF8);
    Host pending(api, probe, "{}");
    require(pending.submit("{}", ignored) == HWE_JS_OK, "Pending result before disposal");
    pending.close();
}

int wmain(int argc, wchar_t **argv) {
    try {
        require(argc == 6, "Library, bundle, content, requests and output required");
        const auto bundle = read(argv[2]), content = read(argv[3]);
        size_t requests = 0;
        hwe_js_metrics finalMetrics{};
        {
            Api api(argv[1]); contracts(api);
            Host host(api, bundle, content);
            std::ifstream input{std::filesystem::path(argv[4])};
            std::ofstream output{std::filesystem::path(argv[5]), std::ios::binary};
            require(input.good() && output.good(), "Open replay files");
            std::string line;
            while (std::getline(input, line)) {
                if (!line.empty() && line.back() == '\r') line.pop_back();
                output << host.request(line) << '\n'; requests++;
            }
            output.flush(); require(input.eof() && output.good(), "Complete replay files");
            finalMetrics = host.close();
        }
        {
            Api reloaded(argv[1]); Host fresh(reloaded, probe, "{}");
            require(fresh.request("{}") == "{\"n\":0,\"text\":\"\"}", "Fresh state after unload/reload");
            fresh.close();
        }
        std::cout << "{\"passed\":true,\"requests\":" << requests << ",\"liveBytesAfterDispose\":" << finalMetrics.live_bytes
            << ",\"liveBlocksAfterDispose\":" << finalMetrics.live_blocks << ",\"peakTrackedBytes\":" << finalMetrics.peak_bytes
            << ",\"bufferOwnership\":true,\"threadMigration\":true,\"concurrentCancellation\":true,\"unloadReload\":true}" << std::endl;
        return 0;
    } catch (const std::exception &error) { std::cerr << error.what() << std::endl; return 1; }
}
