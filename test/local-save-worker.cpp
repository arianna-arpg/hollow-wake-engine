#include "../native/save/include/write-worker.hpp"
#include <atomic>
#include <chrono>
#include <cstdlib>
#include <iostream>

using namespace hwe_save;
using namespace std::chrono_literals;
#define CHECK(condition) do { if (!(condition)) { std::cerr << "Failed: " << #condition << " at " << __LINE__ << "\n"; std::exit(1); } } while (false)

struct Barrier {
    std::mutex mutex;
    std::condition_variable changed;
    bool entered = false, released;
    explicit Barrier(bool ready = true) : released(ready) {}
    void arrive() {
        std::unique_lock<std::mutex> lock(mutex);
        entered = true; changed.notify_all();
        CHECK(changed.wait_for(lock, 5s, [this] { return released; }));
    }
    void wait() {
        std::unique_lock<std::mutex> lock(mutex);
        CHECK(changed.wait_for(lock, 5s, [this] { return entered; }));
    }
    void release() {
        std::lock_guard<std::mutex> lock(mutex);
        released = true; changed.notify_all();
    }
};
struct Backend final : WriteBackend {
    Barrier stage_barrier, commit_barrier;
    std::atomic<int> stages{0}, commits{0}, cancels{0};
    WriteRequest observed;
    WriteResult stage_result{nullptr, 0, 73}, commit_result, cancel_result;
    Backend(bool stage_ready = true, bool commit_ready = true)
        : stage_barrier(stage_ready), commit_barrier(commit_ready) {}
    WriteResult stage(const WriteRequest &request) noexcept override {
        observed = request; ++stages; stage_barrier.arrive(); return stage_result;
    }
    WriteResult commit(int64_t token) noexcept override {
        CHECK(token == 73); ++commits; commit_barrier.arrive(); return commit_result;
    }
    WriteResult cancel(int64_t token) noexcept override {
        CHECK(token == 73); ++cancels; return cancel_result;
    }
};
WriteWorker::Poll finish(WriteWorker &worker, int64_t ticket) {
    const auto limit = std::chrono::steady_clock::now() + 5s;
    for (;;) {
        auto p = worker.poll(ticket);
        CHECK(p.valid);
        if (!p.pending) return p;
        CHECK(std::chrono::steady_clock::now() < limit);
        std::this_thread::yield();
    }
}
bool reason(const WriteResult &r, const char *text) {
    return r.reason && std::string(r.reason) == text;
}
int main() {
    {
        Backend backend(false);
        WriteWorker worker(backend);
        WriteRequest input{4, 19, "original", "[]"};
        auto queued = worker.submit(input);
        CHECK(queued.ok()); input.body = "caller mutation";
        backend.stage_barrier.wait();
        CHECK(backend.observed.slot == 4 && backend.observed.revision == 19 && backend.observed.body == "original");
        CHECK(reason(worker.submit({}), "unavailable"));
        CHECK(!worker.poll(queued.token + 1).valid);
        CHECK(reason(worker.cancel(queued.token + 1), "invalid-ticket"));
        // Staging cannot finish until this thread releases the barrier.
        // Polling and admission therefore prove they never wait for backend I/O.
        for (int i = 0; i < 10000; ++i) CHECK(worker.poll(queued.token).pending);
        CHECK(worker.cancel(queued.token).ok());
        backend.stage_barrier.release();
        CHECK(reason(finish(worker, queued.token).result, "cancelled"));
        CHECK(backend.stages == 1 && backend.cancels == 1 && backend.commits == 0);
        CHECK(!worker.poll(queued.token).valid);
        auto next = worker.submit({5, 20, "next", "[]"});
        CHECK(next.ok() && next.token > queued.token);
        CHECK(finish(worker, next.token).result.ok());
        CHECK(backend.commits == 1);
        worker.shutdown();
        CHECK(reason(worker.submit({}), "unavailable"));
        worker.reopen();
        auto reopened = worker.submit({6, 21, "reopened", "[]"});
        CHECK(reopened.ok() && reopened.token > next.token);
        CHECK(!worker.poll(next.token).valid);
        CHECK(finish(worker, reopened.token).result.ok());
    }
    {
        Backend backend(true, false);
        WriteWorker worker(backend);
        auto queued = worker.submit({1, 0, "commit", "[]"});
        backend.commit_barrier.wait();
        CHECK(reason(worker.cancel(queued.token), "too-late"));
        for (int i = 0; i < 10000; ++i) CHECK(worker.poll(queued.token).pending);
        CHECK(reason(worker.submit({}), "unavailable"));
        backend.commit_barrier.release();
        // A completed but unconsumed result must still occupy the only slot.
        CHECK(reason(worker.submit({}), "unavailable"));
        CHECK(finish(worker, queued.token).result.ok());
        CHECK(backend.commits == 1 && backend.cancels == 0);
    }
    for (bool stage_failure : {true, false}) {
        Backend backend;
        if (stage_failure) backend.stage_result = {"stale-revision"};
        else backend.commit_result = {"busy", 5};
        WriteWorker worker(backend);
        auto q = worker.submit({1, 7, "failed", "[]"});
        auto p = finish(worker, q.token);
        CHECK(reason(p.result, stage_failure ? "stale-revision" : "busy"));
        CHECK(backend.commits == (stage_failure ? 0 : 1));
        CHECK(!worker.busy());
    }
    {
        Backend backend(false);
        backend.cancel_result = {"storage", 10};
        WriteWorker worker(backend);
        auto q = worker.submit({});
        backend.stage_barrier.wait();
        CHECK(worker.cancel(q.token).ok());
        backend.stage_barrier.release();
        CHECK(reason(finish(worker, q.token).result, "storage"));
    }
    {
        Backend backend(true, false);
        auto worker = new WriteWorker(backend);
        auto q = worker->submit({1, 0, "closing", "[]"});
        CHECK(q.ok());
        backend.commit_barrier.wait();
        std::thread destroy([&] { delete worker; });
        backend.commit_barrier.release();
        destroy.join();
        CHECK(backend.commits == 1 && backend.cancels == 0);
    }
    std::cout << "{\"passed\":true,\"barrierPolls\":20000,\"boundedAdmission\":true,"
                 "\"cancelBoundary\":true,\"ownedInputs\":true,\"errorPropagation\":true,"
                 "\"singleConsumption\":true,\"reopenTickets\":true,\"destructorJoin\":true}\n";
}
