#include "slot-store.hpp"
#include "sqlite3.h"
#include <filesystem>
#include <array>
#include <utility>

namespace hwe_save {
namespace {
constexpr int application_id = 0x48575331;
WriteResult failure(int rc) noexcept {
    const int base = rc & 255;
    return {base == SQLITE_BUSY || base == SQLITE_LOCKED ? "busy" : "storage", rc};
}
struct Statement {
    sqlite3_stmt *value = nullptr;
    ~Statement() { sqlite3_finalize(value); }
};
int scalar(sqlite3 *db, const char *sql, int &out) {
    Statement q;
    int rc = sqlite3_prepare_v2(db, sql, -1, &q.value, nullptr);
    if (rc == SQLITE_OK) {
        rc = sqlite3_step(q.value);
        if (rc == SQLITE_ROW) { out = sqlite3_column_int(q.value, 0); return SQLITE_OK; }
    }
    return rc;
}
bool absolute_file(const std::string &path) {
    if (path.empty() || path.find('\0') != std::string::npos ||
        path.find("://") != std::string::npos) return false;
    return std::filesystem::u8path(path).is_absolute();
}
bool valid_payload(std::string_view body, std::string_view stash) noexcept {
    return !body.empty() && !stash.empty() &&
        body.size() <= SlotStore::max_bytes && stash.size() <= SlotStore::max_bytes;
}
WriteResult valid_group(const SlotWrite *records, size_t count) noexcept {
    if (!records || !count || count > SlotStore::max_group_records) return {"invalid-argument"};
    size_t bytes = 0;
    for (size_t i = 0; i < count; ++i) {
        const auto &record = records[i];
        if (record.slot < 0 || record.slot > 65535 || record.revision < 0 || record.revision >= SlotStore::max_revision)
            return {"invalid-revision-or-slot"};
        for (size_t j = 0; j < i; ++j) if (record.slot == records[j].slot) return {"invalid-argument"};
        if (!valid_payload(record.body, record.stash)) return {"payload-size"};
        bytes += record.body.size() + record.stash.size();
        if (bytes > SlotStore::max_group_bytes) return {"payload-size"};
    }
    return {};
}
}
int SlotStore::execute(const char *sql) noexcept {
    return sqlite3_exec(db, sql, nullptr, nullptr, nullptr);
}
void SlotStore::close_locked() noexcept {
    if (db) sqlite3_close_v2(db);
    db = nullptr;
    pending = 0;
}
void SlotStore::rollback() noexcept {
    if (!sqlite3_get_autocommit(db) && execute("ROLLBACK") != SQLITE_OK) close_locked();
    pending = 0;
}
SlotStore::~SlotStore() { close_file(); }
WriteResult SlotStore::finish_open(const std::string &policy, OpenInfo &out) {
    const char *sql = policy == "wal" ? "PRAGMA journal_mode=WAL" :
        policy == "rollback" ? "PRAGMA journal_mode=DELETE" : "PRAGMA journal_mode";
    Statement query;
    int rc = sqlite3_prepare_v2(db, sql, -1, &query.value, nullptr);
    if (rc == SQLITE_OK) rc = sqlite3_step(query.value);
    if (rc != SQLITE_ROW) { close_locked(); return failure(rc); }
    const auto *text = sqlite3_column_text(query.value, 0);
    if (!text) { close_locked(); return failure(SQLITE_NOMEM); }
    const std::string mode(reinterpret_cast<const char *>(text));
    if ((policy == "wal" && mode != "wal") || (policy == "rollback" && mode != "delete")) {
        close_locked(); return {"journal-unavailable"};
    }
    out = {mode, sqlite3_libversion()};
    worker.reopen();
    return {};
}
WriteResult SlotStore::open_file(const std::string &path, const std::string &policy, OpenInfo &out) {
    std::unique_lock<std::mutex> owner(lifecycle, std::try_to_lock);
    std::unique_lock<std::mutex> lock(gate, std::try_to_lock);
    if (!owner.owns_lock() || !lock.owns_lock()) return {"unavailable"};
    if (db || worker.has_request() || !absolute_file(path)) return {"invalid-path-or-open"};
    if (policy != "wal" && policy != "rollback" && policy != "preserve") return {"invalid-journal-policy"};
    try {
    int rc = sqlite3_open_v2(path.c_str(), &db, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE |
        SQLITE_OPEN_FULLMUTEX | SQLITE_OPEN_NOFOLLOW, nullptr);
    if (rc != SQLITE_OK) { close_locked(); return failure(rc); }
    sqlite3_extended_result_codes(db, 1);
    sqlite3_limit(db, SQLITE_LIMIT_LENGTH, 2 * max_bytes + 4096);
    rc = execute("PRAGMA trusted_schema=OFF; PRAGMA synchronous=EXTRA; PRAGMA cache_size=-256");
    int app = 0, version = 0, tables = 0;
    if (rc == SQLITE_OK) rc = scalar(db, "PRAGMA application_id", app);
    if (rc == SQLITE_OK && app == application_id) {
        rc = scalar(db, "PRAGMA user_version", version);
        if (rc == SQLITE_OK && version == 1) return finish_open(policy, out);
        close_locked(); return rc == SQLITE_OK ? WriteResult{"incompatible-database"} : failure(rc);
    }
    if (rc == SQLITE_OK && app != 0) { close_locked(); return {"incompatible-database"}; }
    if (rc == SQLITE_OK) rc = execute("BEGIN IMMEDIATE");
    if (rc == SQLITE_OK) rc = scalar(db, "PRAGMA application_id", app);
    if (rc == SQLITE_OK) rc = scalar(db, "PRAGMA user_version", version);
    if (rc == SQLITE_OK && app == 0 && version == 0) {
        rc = scalar(db, "SELECT count(*) FROM sqlite_schema", tables);
        if (rc == SQLITE_OK && tables == 0) {
            rc = execute("CREATE TABLE slots(slot INTEGER PRIMARY KEY,revision INTEGER NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),"
                         "crafting TEXT NOT NULL,stash TEXT NOT NULL) STRICT; PRAGMA application_id=0x48575331; PRAGMA user_version=1");
        } else if (rc == SQLITE_OK) { close_locked(); return {"incompatible-database"}; }
    } else if (rc == SQLITE_OK && (app != application_id || version != 1)) {
        close_locked(); return {"incompatible-database"};
    }
    if (rc == SQLITE_OK) rc = execute("COMMIT");
    if (rc != SQLITE_OK) { close_locked(); return failure(rc); }
    return finish_open(policy, out);
    } catch (...) { close_locked(); throw; }
}
WriteResult SlotStore::read_slot(int64_t slot, Slot &out) {
    std::unique_lock<std::mutex> lock(gate, std::try_to_lock);
    if (!lock.owns_lock() || worker.busy()) return {"unavailable"};
    if (!db || pending || slot < 0 || slot > 65535) return {"unavailable"};
    Statement q;
    int rc = sqlite3_prepare_v2(db, "SELECT revision,crafting,stash FROM slots WHERE slot=?1", -1, &q.value, nullptr);
    if (rc == SQLITE_OK) rc = sqlite3_bind_int64(q.value, 1, slot);
    if (rc == SQLITE_OK) rc = sqlite3_step(q.value);
    if (rc == SQLITE_DONE) { out = {}; return {}; }
    if (rc != SQLITE_ROW) return failure(rc);
    Slot read;
    read.revision = sqlite3_column_int64(q.value, 0);
    if (read.revision < 1 || read.revision > max_revision) return {"invalid-record"};
    for (int i = 1; i <= 2; ++i) {
        const auto *data = sqlite3_column_text(q.value, i);
        const int bytes = sqlite3_column_bytes(q.value, i);
        if (!data || bytes < 1 || bytes > max_bytes) return {"invalid-record"};
        (i == 1 ? read.crafting : read.stash).assign(reinterpret_cast<const char *>(data), static_cast<size_t>(bytes));
    }
    out = std::move(read);
    return {};
}
WriteResult SlotStore::write_status(int64_t slot, int64_t expected) {
    if (worker.busy() || !db || pending) return {"unavailable"};
    if (slot < 0 || slot > 65535 || expected < 0 || expected >= max_revision || sequence >= max_revision)
        return {"invalid-revision-or-slot"};
    return {};
}
WriteResult SlotStore::read_group(const int64_t *slots, size_t count, std::vector<Slot> &out) {
    std::unique_lock<std::mutex> lock(gate, std::try_to_lock);
    if (!lock.owns_lock() || worker.busy() || !db || pending) return {"unavailable"};
    if (!slots || !count || count > max_group_records) return {"invalid-argument"};
    for (size_t i = 0; i < count; ++i) {
        if (slots[i] < 0 || slots[i] > 65535) return {"invalid-revision-or-slot"};
        for (size_t j = 0; j < i; ++j) if (slots[i] == slots[j]) return {"invalid-argument"};
    }
    // One SELECT owns one SQLite read snapshot across every returned record.
    // Missing rows keep their requested position and return revision zero.
    std::string sql = "WITH requested(ord,slot) AS (VALUES";
    for (size_t i = 0; i < count; ++i)
        sql += (i ? ",(" : "(") + std::to_string(i) + ",?" + std::to_string(i + 1) + ")";
    // Carry ordinals instead of sorting document payloads in SQLite. Output
    // ordering is explicit even if the query planner changes traversal order.
    sql += ") SELECT r.ord,s.revision,s.crafting,s.stash,s.slot FROM requested r LEFT JOIN slots s ON s.slot=r.slot";
    Statement q;
    int rc = sqlite3_prepare_v2(db, sql.c_str(), -1, &q.value, nullptr);
    for (size_t i = 0; rc == SQLITE_OK && i < count; ++i)
        rc = sqlite3_bind_int64(q.value, static_cast<int>(i + 1), slots[i]);
    if (rc != SQLITE_OK) return failure(rc);
    std::vector<Slot> read(count);
    size_t bytes = 0;
    uint32_t seen = 0;
    for (size_t i = 0; i < count; ++i) {
        rc = sqlite3_step(q.value);
        if (rc != SQLITE_ROW) return rc == SQLITE_DONE ? WriteResult{"invalid-record"} : failure(rc);
        const auto ordinal = static_cast<size_t>(sqlite3_column_int64(q.value, 0));
        if (ordinal >= count || (seen & (1u << ordinal))) return {"invalid-record"};
        seen |= 1u << ordinal;
        auto &record = read[ordinal];
        if (sqlite3_column_type(q.value, 4) == SQLITE_NULL) continue;
        record.revision = sqlite3_column_int64(q.value, 1);
        if (record.revision < 1 || record.revision > max_revision) return {"invalid-record"};
        for (int column = 2; column <= 3; ++column) {
            const auto *data = sqlite3_column_text(q.value, column);
            const int size = sqlite3_column_bytes(q.value, column);
            if (!data || size < 1 || size > max_bytes) return {"invalid-record"};
            bytes += static_cast<size_t>(size);
            if (bytes > max_group_bytes) return {"payload-size"};
            (column == 2 ? record.crafting : record.stash).assign(reinterpret_cast<const char *>(data), static_cast<size_t>(size));
        }
    }
    rc = sqlite3_step(q.value);
    if (rc != SQLITE_DONE) return rc == SQLITE_ROW ? WriteResult{"invalid-record"} : failure(rc);
    out = std::move(read);
    return {};
}
WriteResult SlotStore::check_write(int64_t slot, int64_t expected) {
    std::unique_lock<std::mutex> lock(gate, std::try_to_lock);
    return lock.owns_lock() ? write_status(slot, expected) : WriteResult{"unavailable"};
}
WriteResult SlotStore::stage_slot(int64_t slot, int64_t expected, std::string_view body, std::string_view stash) {
    std::unique_lock<std::mutex> lock(gate, std::try_to_lock);
    if (!lock.owns_lock()) return {"unavailable"};
    const auto ready = write_status(slot, expected);
    if (!ready.ok()) return ready;
    if (!valid_payload(body, stash)) return {"payload-size"};
    return stage_bytes(slot, expected, body.data(), static_cast<int>(body.size()), stash.data(), static_cast<int>(stash.size()));
}
WriteResult SlotStore::stage_bytes(int64_t slot, int64_t expected, const char *body, int body_size,
                                  const char *stash, int stash_size) noexcept {
    const SlotWrite record{slot, expected, {body, static_cast<size_t>(body_size)}, {stash, static_cast<size_t>(stash_size)}};
    return stage_group_bytes(&record, 1);
}
WriteResult SlotStore::write_record(int64_t slot, int64_t expected, const char *body, int body_size,
                                   const char *stash, int stash_size) noexcept {
    int rc;
    {
        Statement q;
        const char *sql = expected == 0 ?
            "INSERT INTO slots(slot,crafting,stash,revision) VALUES(?1,?2,?3,1) ON CONFLICT(slot) DO NOTHING" :
            "UPDATE slots SET crafting=?2,stash=?3,revision=revision+1 WHERE slot=?1 AND revision=?4";
        rc = sqlite3_prepare_v2(db, sql, -1, &q.value, nullptr);
        if (rc == SQLITE_OK) rc = sqlite3_bind_int64(q.value, 1, slot);
        if (rc == SQLITE_OK) rc = sqlite3_bind_text(q.value, 2, body, body_size, SQLITE_TRANSIENT);
        if (rc == SQLITE_OK) rc = sqlite3_bind_text(q.value, 3, stash, stash_size, SQLITE_TRANSIENT);
        if (rc == SQLITE_OK && expected != 0) rc = sqlite3_bind_int64(q.value, 4, expected);
        if (rc == SQLITE_OK) rc = sqlite3_step(q.value);
    }
    if (rc != SQLITE_DONE) return failure(rc);
    if (sqlite3_changes(db) != 1) return {"stale-revision"};
    return {};
}
WriteResult SlotStore::stage_group_bytes(const SlotWrite *records, size_t count) noexcept {
    const int rc = execute("BEGIN IMMEDIATE");
    if (rc != SQLITE_OK) return failure(rc);
    for (size_t i = 0; i < count; ++i) {
        const auto &record = records[i];
        const auto written = write_record(record.slot, record.revision, record.body.data(), static_cast<int>(record.body.size()),
                                          record.stash.data(), static_cast<int>(record.stash.size()));
        if (!written.ok()) { rollback(); return written; }
    }
    pending = ++sequence;
    return {nullptr, 0, pending};
}
WriteResult SlotStore::stage(const WriteRequest &input) noexcept {
    std::lock_guard<std::mutex> lock(gate);
    if (!input.group.empty()) {
        if (input.group.size() > max_group_records) return {"invalid-argument"};
        std::array<SlotWrite, max_group_records> records{};
        for (size_t i = 0; i < input.group.size(); ++i) {
            const auto &record = input.group[i];
            records[i] = {record.slot, record.revision, record.body, record.stash};
        }
        return stage_group_bytes(records.data(), input.group.size());
    }
    return stage_bytes(input.slot, input.revision, input.body.data(), static_cast<int>(input.body.size()),
                       input.stash.data(), static_cast<int>(input.stash.size()));
}
WriteResult SlotStore::commit_bytes(int64_t token) noexcept {
    if (!db || !pending || pending != token) return {"invalid-token"};
    const int rc = execute("COMMIT");
    if (rc != SQLITE_OK) { rollback(); return failure(rc); }
    pending = 0;
    return {};
}
WriteResult SlotStore::cancel_bytes(int64_t token) noexcept {
    if (!db || !pending || pending != token) return {"invalid-token"};
    rollback();
    return db ? WriteResult{} : WriteResult{"storage"};
}
WriteResult SlotStore::commit(int64_t token) noexcept {
    std::lock_guard<std::mutex> lock(gate);
    return commit_bytes(token);
}
WriteResult SlotStore::cancel(int64_t token) noexcept {
    std::lock_guard<std::mutex> lock(gate);
    return cancel_bytes(token);
}
WriteResult SlotStore::save_slot_async(int64_t slot, int64_t expected, std::string_view body, std::string_view stash) {
    std::unique_lock<std::mutex> lock(gate, std::try_to_lock);
    if (!lock.owns_lock()) return {"unavailable"};
    const auto ready = write_status(slot, expected);
    if (!ready.ok()) return ready;
    if (!valid_payload(body, stash)) return {"payload-size"};
    return worker.submit({slot, expected, std::string(body), std::string(stash)});
}
WriteResult SlotStore::stage_group(const SlotWrite *records, size_t count) {
    std::unique_lock<std::mutex> lock(gate, std::try_to_lock);
    if (!lock.owns_lock()) return {"unavailable"};
    const auto ready = write_status(0, 0);
    if (!ready.ok()) return ready;
    const auto valid = valid_group(records, count);
    return valid.ok() ? stage_group_bytes(records, count) : valid;
}
WriteResult SlotStore::save_group_async(const SlotWrite *records, size_t count) {
    std::unique_lock<std::mutex> lock(gate, std::try_to_lock);
    if (!lock.owns_lock()) return {"unavailable"};
    const auto ready = write_status(0, 0);
    if (!ready.ok()) return ready;
    const auto valid = valid_group(records, count);
    if (!valid.ok()) return valid;
    WriteRequest request;
    request.group.reserve(count);
    for (size_t i = 0; i < count; ++i) {
        const auto &record = records[i];
        request.group.push_back({record.slot, record.revision, std::string(record.body), std::string(record.stash)});
    }
    return worker.submit(std::move(request));
}
WriteResult SlotStore::commit_slot(int64_t token) {
    std::unique_lock<std::mutex> lock(gate, std::try_to_lock);
    if (!lock.owns_lock() || worker.busy()) return {"unavailable"};
    return commit_bytes(token);
}
WriteResult SlotStore::cancel_slot(int64_t token) {
    std::unique_lock<std::mutex> lock(gate, std::try_to_lock);
    if (!lock.owns_lock() || worker.busy()) return {"unavailable"};
    return cancel_bytes(token);
}
WriteResult SlotStore::checkpoint(Checkpoint &out) {
    std::unique_lock<std::mutex> lock(gate, std::try_to_lock);
    if (!lock.owns_lock() || worker.busy() || !db || pending) return {"unavailable"};
    Checkpoint result;
    const int rc = sqlite3_wal_checkpoint_v2(db, "main", SQLITE_CHECKPOINT_PASSIVE, &result.frames, &result.copied);
    if (rc != SQLITE_OK) return failure(rc);
    result.complete = result.frames == result.copied;
    out = result;
    return {};
}
void SlotStore::close_file() {
    std::lock_guard<std::mutex> owner(lifecycle);
    worker.shutdown();
    std::lock_guard<std::mutex> lock(gate);
    close_locked();
}
}
