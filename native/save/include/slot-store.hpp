#pragma once

#include "write-worker.hpp"
#include <cstdint>
#include <mutex>
#include <string>
#include <string_view>
#include <cstddef>
#include <vector>

struct sqlite3;
namespace hwe_save {
struct OpenInfo { std::string journal; const char *sqlite_version = nullptr; };
struct Slot { int64_t revision = 0; std::string crafting, stash; };
struct SlotWrite { int64_t slot, revision; std::string_view body, stash; };
struct Checkpoint { int frames = -1, copied = -1; bool complete = false; };

// Optional persistence, independent of gameplay and engine-owned objects.
// Lifecycle has one host owner. Documents are opaque, bounded UTF-8 bytes.
class SlotStore final : private WriteBackend {
    sqlite3 *db = nullptr;
    std::mutex gate, lifecycle;
    int64_t sequence = 0, pending = 0;
    WriteWorker worker{*this};
    int execute(const char *sql) noexcept;
    void close_locked() noexcept;
    void rollback() noexcept;
    WriteResult finish_open(const std::string &, OpenInfo &);
    WriteResult stage_bytes(int64_t, int64_t, const char *, int, const char *, int) noexcept;
    WriteResult write_record(int64_t, int64_t, const char *, int, const char *, int) noexcept;
    WriteResult stage_group_bytes(const SlotWrite *, size_t) noexcept;
    WriteResult commit_bytes(int64_t) noexcept;
    WriteResult cancel_bytes(int64_t) noexcept;
    WriteResult stage(const WriteRequest &) noexcept override;
    WriteResult commit(int64_t) noexcept override;
    WriteResult cancel(int64_t) noexcept override;
    WriteResult write_status(int64_t, int64_t);
public:
    static constexpr int max_bytes = 512 * 1024;
    static constexpr size_t max_group_records = 8, max_group_bytes = 4 * 1024 * 1024;
    static constexpr int64_t max_revision = 9007199254740991LL;
    SlotStore() = default;
    ~SlotStore();
    SlotStore(const SlotStore &) = delete;
    SlotStore &operator=(const SlotStore &) = delete;
    WriteResult open_file(const std::string &absolute_path, const std::string &journal_policy, OpenInfo &);
    WriteResult read_slot(int64_t, Slot &);
    WriteResult read_group(const int64_t *, size_t, std::vector<Slot> &);
    // Current eligibility only; stage/submit always repeat admission.
    WriteResult check_write(int64_t, int64_t);
    WriteResult stage_slot(int64_t, int64_t, std::string_view, std::string_view);
    WriteResult commit_slot(int64_t);
    WriteResult cancel_slot(int64_t);
    WriteResult save_slot_async(int64_t, int64_t, std::string_view, std::string_view);
    WriteResult stage_group(const SlotWrite *, size_t);
    WriteResult save_group_async(const SlotWrite *, size_t);
    WriteWorker::Poll poll_save(int64_t ticket) { return worker.poll(ticket); }
    WriteResult cancel_save(int64_t ticket) { return worker.cancel(ticket); }
    WriteResult checkpoint(Checkpoint &);
    void close_file();
};
}
