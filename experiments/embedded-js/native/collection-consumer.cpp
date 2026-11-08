/* Public-ABI probe: the host implementation is loaded as a separate library. */
#define HWE_JS_CONSUMER_NO_MAIN
#include "consumer.cpp"

struct CollectionApi : Api {
    decltype(&hwe_js_collect_v1) collect;
    explicit CollectionApi(const std::filesystem::path &path) : Api(path),
        collect(load<decltype(collect)>("hwe_js_collect_v1")) {}
};
static const char *collectionProbe = R"JS(var HollowWakeSession={
 create(){const keep={id:7};keep.self=keep;return {keep,map:new WeakMap([[keep,19]]),n:0};},
 dispatch(root,r){
  if(r.op==='allocate'){
   const waste={values:new Array(20000).fill(42)};waste.self=waste;
   root.waste=waste;root.weak=new WeakRef(waste);root.n++;return root.n;
  }
  if(r.op==='drop'){delete root.waste;return 'dropped';}
  return {id:root.keep.id,self:root.keep.self===root.keep,map:root.map.get(root.keep),
   weak:root.weak?.deref()!==undefined,n:root.n};
 }
};)JS";

static void collectionContracts(CollectionApi &api) {
    hwe_js_metrics state{}; state.live_bytes = 99;
    require(api.collect(nullptr, &state) == HWE_JS_INVALID_ARGUMENT &&
        !state.live_bytes && !state.live_blocks, "Null collection clears metrics");
    require(api.collect(nullptr, nullptr) == HWE_JS_INVALID_ARGUMENT, "Null collection without metrics");
    Host host(api, collectionProbe, "{}"), other(api, probe, "{\"n\":31}");
    require(api.collect(host.value, nullptr) == HWE_JS_OK, "Optional collection metrics");
    for (int cycle = 1; cycle <= 8; ++cycle) {
        require(host.request("{\"op\":\"allocate\"}") == std::to_string(cycle), "Build collectible cycle");
        require(api.collect(host.value, &state) == HWE_JS_OK, "Collect with strong reference");
        const auto held = host.metrics();
        require(host.request("{}") == "{\"id\":7,\"self\":true,\"map\":19,\"weak\":true,\"n\":" +
            std::to_string(cycle) + "}", "Reachable cycles and weak keys survive");
        uint64_t length = 0, written = 0;
        require(host.submit("{\"op\":\"drop\"}", length) == HWE_JS_OK, "Drop strong ownership");
        const auto pending = host.metrics();
        require(api.collect(host.value, &state) == HWE_JS_RESPONSE_PENDING &&
            state.response_pending == 1 && !state.poisoned && state.live_bytes == pending.live_bytes,
            "Pending response collection refuses without mutation");
        std::string response(static_cast<size_t>(length), '\0');
        require(api.copy(host.value, reinterpret_cast<uint8_t *>(response.data()), length, &written) == HWE_JS_OK &&
            written == length && response == "\"dropped\"", "Refused collection preserves exact response");
        require(api.release(host.value) == HWE_JS_OK, "Release before collection");
        const auto before = host.metrics();
        require(api.collect(host.value, &state) == HWE_JS_OK &&
            state.live_bytes + 200000 < before.live_bytes && state.live_bytes < held.live_bytes &&
            state.allocations == before.allocations && !state.poisoned && !state.response_pending,
            "Explicit collection reclaims unreachable cycle without allocations");
        require(host.request("{}") == "{\"id\":7,\"self\":true,\"map\":19,\"weak\":false,\"n\":" +
            std::to_string(cycle) + "}", "Collection preserves live state and clears dead weak target");
    }
    std::exception_ptr movedError;
    std::thread worker([&] {
        try { require(api.collect(host.value, &state) == HWE_JS_OK, "Collection after thread migration"); }
        catch (...) { movedError = std::current_exception(); }
    });
    worker.join(); if (movedError) std::rethrow_exception(movedError);
    require(other.request("{}") == "{\"n\":31,\"text\":\"\"}", "Collection isolates runtimes");
    host.close(); other.close();
    Host cancelled(api, probe, "{}");
    require(api.cancel(cancelled.value) == HWE_JS_OK &&
        api.collect(cancelled.value, &state) == HWE_JS_INTERRUPTED && state.poisoned && state.cancellation_requested,
        "Idle collection respects sticky cancellation");
    require(api.collect(cancelled.value, &state) == HWE_JS_POISONED && state.poisoned, "Poisoned collection refuses");
    cancelled.close();
    // A synchronous return can acquire a finalization job during submit cleanup,
    // after serialization. A cycle instead acquires the job during explicit GC.
    for (const bool cyclic : {false, true}) {
        const std::string source = std::string(R"JS(var HollowWakeSession={
         create(){const root={};root.registry=new FinalizationRegistry(()=>{while(true){}});
          return root;},
         dispatch(root,r){const target={};)JS") +
            (cyclic ? "target.self=target;" : "") +
            R"JS(root.registry.register(target,1);return target;}
        };)JS";
        // A cycle cannot be JSON encoded. Return a primitive while retaining
        // the cyclic target only inside the registry's weak registration.
        const auto bundle = cyclic ? source.substr(0, source.find("return target;")) +
            "return 1;}};" : source;
        Host finalizers(api, bundle, "{}");
        require(finalizers.request("{}") == (cyclic ? "1" : "{}"), "Prepare queued finalization");
        require(api.collect(finalizers.value, &state) == HWE_JS_SCRIPT_ERROR && state.poisoned &&
            !state.response_pending, cyclic ? "Collection rejects newly queued cleanup" : "Collection rejects existing cleanup");
        uint64_t ignored = 0;
        require(finalizers.submit("{}", ignored) == HWE_JS_POISONED, "Finalization failure forbids reuse");
        finalizers.close();
    }
    Host concurrent(api, probe, "{}");
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(10);
    std::promise<int32_t> finished; auto future = finished.get_future();
    std::thread active([&] {
        uint64_t ignored = 0;
        finished.set_value(submitAfterContention([&] { return concurrent.submit("{\"op\":\"hang\"}", ignored); }, deadline));
    });
    int32_t observed = HWE_JS_OK;
    while (observed != HWE_JS_BUSY && std::chrono::steady_clock::now() < deadline &&
        future.wait_for(std::chrono::seconds(0)) != std::future_status::ready) {
        observed = api.metrics(concurrent.value, &state); std::this_thread::yield();
    }
    state.live_bytes = 99;
    const auto overlap = observed == HWE_JS_BUSY ? api.collect(concurrent.value, &state) : HWE_JS_OK;
    api.cancel(concurrent.value); active.join();
    require(observed == HWE_JS_BUSY && overlap == HWE_JS_BUSY && !state.live_bytes &&
        future.get() == HWE_JS_INTERRUPTED, "Collection refuses concurrent execution and clears output");
    concurrent.close();
}

#if defined(_WIN32)
int wmain(int argc, wchar_t **argv) {
#else
int main(int argc, char **argv) {
#endif
    try {
        require(argc == 7, "Library, bundle, content, requests, output and collection mode required");
        const auto mode = std::filesystem::path(argv[6]).string();
        require(mode == "none" || mode == "configured" || mode == "every-release", "Collection mode");
        CollectionApi api(argv[1]); contracts(api); collectionContracts(api);
        auto settings = defaults(); settings.heap_limit_bytes = 32 * 1024 * 1024;
        Host host(api, read(argv[2]), read(argv[3]), &settings);
        std::ifstream input{std::filesystem::path(argv[4])};
        std::ofstream output{std::filesystem::path(argv[5]), std::ios::binary};
        require(input.good() && output.good(), "Open replay files");
        size_t requests = 0, collections = 0;
        hwe_js_metrics before{}, after{};
        std::string line;
        while (std::getline(input, line)) {
            if (!line.empty() && line.back() == '\r') line.pop_back();
            output << host.request(line) << '\n'; ++requests;
            if (requests == 2) { before = host.metrics(); after = before; }
            if ((mode == "configured" && requests == 2) || mode == "every-release") {
                require(api.collect(host.value, &after) == HWE_JS_OK, "Collect at released replay boundary");
                ++collections;
            }
        }
        output.flush(); require(input.eof() && output.good(), "Complete replay files");
        const auto end = host.metrics(), closed = host.close();
        std::cout << "{\"passed\":true,\"contracts\":true,\"requests\":" << requests <<
            ",\"collections\":" << collections << ",\"beforeBytes\":" << before.live_bytes <<
            ",\"afterBytes\":" << after.live_bytes << ",\"endBytes\":" << end.live_bytes <<
            ",\"peakBytes\":" << end.peak_bytes << ",\"closedBytes\":" << closed.live_bytes <<
            ",\"closedBlocks\":" << closed.live_blocks << "}" << std::endl;
        return 0;
    } catch (const std::exception &error) { std::cerr << error.what() << std::endl; return 1; }
}
