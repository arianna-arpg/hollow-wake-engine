#pragma once

#include <condition_variable>
#include <cstdint>
#include <mutex>
#include <string>
#include <system_error>
#include <thread>
#include <utility>

namespace hwe_save {
struct WriteRequest {
    int64_t slot = 0, revision = 0;
    std::string body, stash;
};
struct WriteResult {
    const char *reason = nullptr;
    int code = 0;
    int64_t token = 0;
    bool ok() const noexcept { return reason == nullptr; }
};
struct WriteBackend {
    virtual WriteResult stage(const WriteRequest &) noexcept = 0;
    virtual WriteResult commit(int64_t token) noexcept = 0;
    virtual WriteResult cancel(int64_t token) noexcept = 0;
    virtual ~WriteBackend() = default;
};

// One request or unconsumed result, one sleeping worker, no growing queue.
// The backend must outlive this object. It receives only owned bytes and numbers.
class WriteWorker final {
public:
    enum class Phase { idle, queued, staging, committing, done };
    struct Poll {
        bool valid = false, pending = false;
        Phase phase = Phase::idle;
        WriteResult result;
    };
private:
    WriteBackend &backend;
    std::mutex control;
    std::condition_variable wake;
    std::thread thread;
    Phase phase = Phase::idle;
    bool stopping = false, cancelled = false;
    int64_t sequence = 0, ticket = 0;
    WriteRequest request;
    WriteResult outcome;

    void run() noexcept {
        std::unique_lock<std::mutex> lock(control);
        for (;;) {
            wake.wait(lock, [this] { return stopping || phase == Phase::queued; });
            if (stopping && phase != Phase::queued) return;
            phase = Phase::staging;
            WriteResult reply{"cancelled"};
            if (!cancelled) {
                lock.unlock();
                reply = backend.stage(request);
                lock.lock();
                if (reply.ok()) {
                    const bool abort = cancelled;
                    // This is the cancellation boundary. Once admitted to COMMIT,
                    // cancellation and shutdown must allow its result to settle.
                    if (!abort) phase = Phase::committing;
                    lock.unlock();
                    if (abort) {
                        reply = backend.cancel(reply.token);
                        if (reply.ok()) reply = {"cancelled"};
                    } else {
                        reply = backend.commit(reply.token);
                    }
                    lock.lock();
                }
            }
            outcome = reply;
            phase = Phase::done;
            if (stopping) return;
        }
    }
public:
    explicit WriteWorker(WriteBackend &owner) : backend(owner) {}
    ~WriteWorker() { shutdown(); }
    WriteWorker(const WriteWorker &) = delete;
    WriteWorker &operator=(const WriteWorker &) = delete;

    bool busy() {
        std::lock_guard<std::mutex> lock(control);
        return stopping || phase != Phase::idle;
    }
    bool has_request() {
        std::lock_guard<std::mutex> lock(control);
        return phase != Phase::idle;
    }
    WriteResult submit(WriteRequest input) {
        std::lock_guard<std::mutex> lock(control);
        if (stopping || phase != Phase::idle) return {"unavailable"};
        if (sequence >= 9007199254740991LL) return {"invalid-ticket"};
        request = std::move(input);
        ticket = ++sequence;
        cancelled = false;
        phase = Phase::queued;
        if (!thread.joinable()) {
            try { thread = std::thread([this] { run(); }); }
            catch (const std::system_error &) {
                phase = Phase::idle;
                request = {};
                return {"worker-unavailable"};
            }
        }
        wake.notify_one();
        return {nullptr, 0, ticket};
    }
    Poll poll(int64_t expected) {
        std::lock_guard<std::mutex> lock(control);
        if (!expected || expected != ticket || phase == Phase::idle) return {};
        Poll reply{true, phase != Phase::done, phase, outcome};
        if (!reply.pending) {
            phase = Phase::idle;
            request = {};
        }
        return reply;
    }
    WriteResult cancel(int64_t expected) {
        std::lock_guard<std::mutex> lock(control);
        if (!expected || expected != ticket || phase == Phase::idle) return {"invalid-ticket"};
        if (phase == Phase::committing || phase == Phase::done) return {"too-late"};
        cancelled = true;
        return {};
    }
    // Lifecycle methods have one host owner. shutdown joins before the backend
    // can be destroyed; it never holds control while waiting for disk work.
    void shutdown() {
        {
            std::lock_guard<std::mutex> lock(control);
            stopping = true;
            cancelled = true;
            wake.notify_one();
        }
        if (thread.joinable()) thread.join();
        std::lock_guard<std::mutex> lock(control);
        phase = Phase::idle;
        request = {};
    }
    void reopen() {
        std::lock_guard<std::mutex> lock(control);
        // The host has excluded lifecycle overlap and outstanding requests.
        stopping = false;
    }
};
}
