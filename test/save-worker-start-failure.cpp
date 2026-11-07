#include <chrono>
#include <cstdlib>
#include <iostream>
#include <new>
#include <system_error>
#include <thread>
#include <utility>

static int starts = 0;
// The harness replaces only the standard thread-construction expression in a
// disposable copy of the real header. No production failure hook is shipped.
template<class Action> std::thread hwe_test_start(Action action) {
    if (++starts == 1) throw std::bad_alloc();
    if (starts == 2) throw std::system_error(std::make_error_code(std::errc::resource_unavailable_try_again));
    return std::thread(std::move(action));
}
#include "write-worker-under-test.hpp"

#define CHECK(x) do { if (!(x)) { std::cerr << "Failed start recovery: " << #x << "\n"; return 1; } } while (false)
struct Backend final : hwe_save::WriteBackend {
    int stages = 0, commits = 0;
    hwe_save::WriteResult stage(const hwe_save::WriteRequest &) noexcept override { ++stages; return {nullptr,0,1}; }
    hwe_save::WriteResult commit(int64_t) noexcept override { ++commits; return {}; }
    hwe_save::WriteResult cancel(int64_t) noexcept override { return {}; }
};
int main() {
    Backend backend;
    hwe_save::WriteWorker worker(backend);
    for (int i = 0; i < 2; ++i) {
        hwe_save::WriteResult reply;
        try { reply = worker.submit({1,0,"body","stash"}); }
        catch (const std::bad_alloc &) { std::cerr << "allocation failure escaped\n"; return 2; }
        CHECK(reply.reason && std::string(reply.reason) == "worker-unavailable");
        CHECK(!worker.busy() && !worker.has_request());
        CHECK(!worker.poll(i+1).valid);
        CHECK(backend.stages == 0 && backend.commits == 0);
    }
    const auto queued = worker.submit({1,0,"body","stash"});
    CHECK(queued.ok() && queued.token > 2);
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(5);
    for (;;) {
        const auto reply = worker.poll(queued.token);
        CHECK(reply.valid);
        if (!reply.pending) { CHECK(reply.result.ok()); break; }
        CHECK(std::chrono::steady_clock::now() < deadline);
        std::this_thread::yield();
    }
    worker.shutdown();
    CHECK(backend.stages == 1 && backend.commits == 1);
    std::cout << "{\"passed\":true,\"allocationFailure\":true,\"threadResourceFailure\":true,\"retryCommittedOnce\":true}\n";
}
