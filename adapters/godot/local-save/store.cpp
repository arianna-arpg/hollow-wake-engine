#include "sqlite3.h"
#include "write-worker.hpp"
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/godot.hpp>
#include <godot_cpp/variant/dictionary.hpp>
#include <mutex>

using namespace godot;

namespace {
constexpr int application_id = 0x48575331; // HWS1
constexpr int max_bytes = 512 * 1024;
constexpr int64_t max_revision = 9007199254740991LL;
Dictionary result(bool ok, const char *reason = "") {
    Dictionary reply;
    reply["ok"] = ok;
    if (!ok) reply["reason"] = reason;
    return reply;
}
Dictionary failure(int rc) {
    const int base = rc & 255;
    auto reply = result(false, base == SQLITE_BUSY || base == SQLITE_LOCKED ? "busy" : "storage");
    reply["sqlite_code"] = rc;
    return reply;
}
hwe_save::WriteResult storage_failure(int rc) {
    const int base = rc & 255;
    return {base == SQLITE_BUSY || base == SQLITE_LOCKED ? "busy" : "storage", rc};
}
Dictionary write_reply(hwe_save::WriteResult reply) {
    auto out = result(reply.ok(), reply.reason ? reply.reason : "");
    if (reply.code) out["sqlite_code"] = reply.code;
    if (reply.token) out["token"] = reply.token;
    return out;
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
}

class HollowWakeSlotStore final : public RefCounted, private hwe_save::WriteBackend {
    GDCLASS(HollowWakeSlotStore, RefCounted)
    sqlite3 *db = nullptr;
    std::mutex gate;
    std::mutex lifecycle;
    int64_t sequence = 0;
    int64_t pending = 0;
    hwe_save::WriteWorker worker{*this};
    int execute(const char *sql) { return sqlite3_exec(db, sql, nullptr, nullptr, nullptr); }
    void close_locked() {
        if (db) sqlite3_close_v2(db); // All statements are scoped; closing rolls back a staged write.
        db = nullptr;
        pending = 0;
    }
    void rollback() {
        if (!sqlite3_get_autocommit(db) && execute("ROLLBACK") != SQLITE_OK) close_locked();
        pending = 0;
    }
    Dictionary finish_open(const String &policy) {
        // Only call after identifying or creating our own schema, outside a transaction.
        const char *sql = policy == "wal" ? "PRAGMA journal_mode=WAL" :
            policy == "rollback" ? "PRAGMA journal_mode=DELETE" : "PRAGMA journal_mode";
        Statement query;
        int rc = sqlite3_prepare_v2(db, sql, -1, &query.value, nullptr);
        if (rc == SQLITE_OK) rc = sqlite3_step(query.value);
        if (rc != SQLITE_ROW) { close_locked(); return failure(rc); }
        const String mode = String::utf8(reinterpret_cast<const char *>(sqlite3_column_text(query.value, 0)));
        if ((policy == "wal" && mode != "wal") || (policy == "rollback" && mode != "delete")) {
            close_locked(); return result(false, "journal-unavailable");
        }
        auto reply = result(true);
        reply["journal"] = mode;
        reply["sqlite_version"] = String::utf8(sqlite3_libversion());
        worker.reopen();
        return reply;
    }
protected:
    static void _bind_methods() {
        ClassDB::bind_method(D_METHOD("open_file", "absolute_path", "journal_policy"), &HollowWakeSlotStore::open_file, DEFVAL(String("wal")));
        ClassDB::bind_method(D_METHOD("read_slot", "slot"), &HollowWakeSlotStore::read_slot);
        ClassDB::bind_method(D_METHOD("stage_slot", "slot", "expected_revision", "crafting_json", "stash_json"), &HollowWakeSlotStore::stage_slot);
        ClassDB::bind_method(D_METHOD("commit_slot", "token"), &HollowWakeSlotStore::commit_slot);
        ClassDB::bind_method(D_METHOD("cancel_slot", "token"), &HollowWakeSlotStore::cancel_slot);
        ClassDB::bind_method(D_METHOD("save_slot_async", "slot", "expected_revision", "crafting_json", "stash_json"), &HollowWakeSlotStore::save_slot_async);
        ClassDB::bind_method(D_METHOD("poll_save", "ticket"), &HollowWakeSlotStore::poll_save);
        ClassDB::bind_method(D_METHOD("cancel_save", "ticket"), &HollowWakeSlotStore::cancel_save);
        ClassDB::bind_method(D_METHOD("checkpoint"), &HollowWakeSlotStore::checkpoint);
        ClassDB::bind_method(D_METHOD("close_file"), &HollowWakeSlotStore::close_file);
    }
public:
    ~HollowWakeSlotStore() override { close_file(); }
    Dictionary open_file(const String &absolute_path, const String &journal_policy = "wal") {
        std::unique_lock<std::mutex> owner(lifecycle, std::try_to_lock);
        std::unique_lock<std::mutex> lock(gate, std::try_to_lock);
        if (!owner.owns_lock() || !lock.owns_lock()) return result(false, "unavailable");
        if (db || worker.has_request() || !absolute_path.is_absolute_path() || absolute_path.contains("://"))
            return result(false, "invalid-path-or-open");
        if (journal_policy != "wal" && journal_policy != "rollback" && journal_policy != "preserve") return result(false, "invalid-journal-policy");
        const auto name = absolute_path.utf8();
        int rc = sqlite3_open_v2(name.get_data(), &db, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX | SQLITE_OPEN_NOFOLLOW, nullptr);
        if (rc != SQLITE_OK) { close_locked(); return failure(rc); }
        sqlite3_extended_result_codes(db, 1);
        sqlite3_limit(db, SQLITE_LIMIT_LENGTH, 2 * max_bytes + 4096);
        rc = execute("PRAGMA trusted_schema=OFF; PRAGMA synchronous=EXTRA; PRAGMA cache_size=-256");
        int app = 0, version = 0, tables = 0;
        if (rc == SQLITE_OK) rc = scalar(db, "PRAGMA application_id", app);
        if (rc == SQLITE_OK && app == application_id) {
            rc = scalar(db, "PRAGMA user_version", version);
            if (rc == SQLITE_OK && version == 1) return finish_open(journal_policy);
            close_locked(); return rc == SQLITE_OK ? result(false, "incompatible-database") : failure(rc);
        }
        if (rc == SQLITE_OK && app != 0) { close_locked(); return result(false, "incompatible-database"); }
        // A first writer can initialize between inspection and acquiring this lock.
        if (rc == SQLITE_OK) rc = execute("BEGIN IMMEDIATE");
        if (rc == SQLITE_OK) rc = scalar(db, "PRAGMA application_id", app);
        if (rc == SQLITE_OK) rc = scalar(db, "PRAGMA user_version", version);
        if (rc == SQLITE_OK && app == 0 && version == 0) {
            rc = scalar(db, "SELECT count(*) FROM sqlite_schema", tables);
            if (rc == SQLITE_OK && tables == 0) {
                rc = execute("CREATE TABLE slots(slot INTEGER PRIMARY KEY,revision INTEGER NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),"
                             "crafting TEXT NOT NULL,stash TEXT NOT NULL) STRICT; PRAGMA application_id=0x48575331; PRAGMA user_version=1");
            } else if (rc == SQLITE_OK) { close_locked(); return result(false, "incompatible-database"); }
        } else if (rc == SQLITE_OK && (app != application_id || version != 1)) {
            close_locked(); return result(false, "incompatible-database");
        }
        if (rc == SQLITE_OK) rc = execute("COMMIT");
        if (rc != SQLITE_OK) { close_locked(); return failure(rc); }
        return finish_open(journal_policy);
    }
    Dictionary read_slot(int64_t slot) {
        std::unique_lock<std::mutex> lock(gate, std::try_to_lock);
        if (!lock.owns_lock() || worker.busy()) return result(false, "unavailable");
        if (!db || pending || slot < 0 || slot > 65535) return result(false, "unavailable");
        Statement q;
        int rc = sqlite3_prepare_v2(db, "SELECT revision,crafting,stash FROM slots WHERE slot=?1", -1, &q.value, nullptr);
        if (rc == SQLITE_OK) rc = sqlite3_bind_int64(q.value, 1, slot);
        if (rc == SQLITE_OK) rc = sqlite3_step(q.value);
        auto reply = result(true);
        if (rc == SQLITE_DONE) { reply["revision"] = int64_t(0); return reply; }
        if (rc != SQLITE_ROW) return failure(rc);
        const auto rev = sqlite3_column_int64(q.value, 0);
        if (rev < 1 || rev > max_revision) return result(false, "invalid-record");
        reply["revision"] = static_cast<int64_t>(rev);
        for (int i = 1; i <= 2; ++i) {
            const auto *data = sqlite3_column_text(q.value, i);
            const int bytes = sqlite3_column_bytes(q.value, i);
            if (!data || bytes < 1 || bytes > max_bytes) return result(false, "invalid-record");
            reply[i == 1 ? "crafting" : "stash"] = String::utf8(reinterpret_cast<const char *>(data), bytes);
        }
        return reply;
    }
    Dictionary stage_slot(int64_t slot, int64_t expected, const String &crafting, const String &stash) {
        std::unique_lock<std::mutex> lock(gate, std::try_to_lock);
        if (!lock.owns_lock() || worker.busy()) return result(false, "unavailable");
        if (!db || pending) return result(false, "unavailable");
        if (slot < 0 || slot > 65535 || expected < 0 || expected >= max_revision || sequence >= max_revision) return result(false, "invalid-revision-or-slot");
        if (crafting.is_empty() || stash.is_empty() || crafting.length() > max_bytes || stash.length() > max_bytes) return result(false, "payload-size");
        const auto body = crafting.utf8(), items = stash.utf8();
        if (body.length() > max_bytes || items.length() > max_bytes) return result(false, "payload-size");
        return write_reply(stage_bytes(slot, expected, body.get_data(), static_cast<int>(body.length()),
                                       items.get_data(), static_cast<int>(items.length())));
    }
private:
    hwe_save::WriteResult stage_bytes(int64_t slot, int64_t expected, const char *body, int body_size,
                                      const char *items, int items_size) noexcept {
        int rc = execute("BEGIN IMMEDIATE");
        if (rc != SQLITE_OK) return storage_failure(rc);
        {
            Statement q;
            const char *sql = expected == 0 ?
                "INSERT INTO slots(slot,crafting,stash,revision) VALUES(?1,?2,?3,1) ON CONFLICT(slot) DO NOTHING" :
                "UPDATE slots SET crafting=?2,stash=?3,revision=revision+1 WHERE slot=?1 AND revision=?4";
            rc = sqlite3_prepare_v2(db, sql, -1, &q.value, nullptr);
            if (rc == SQLITE_OK) rc = sqlite3_bind_int64(q.value, 1, slot);
            if (rc == SQLITE_OK) rc = sqlite3_bind_text(q.value, 2, body, body_size, SQLITE_TRANSIENT);
            if (rc == SQLITE_OK) rc = sqlite3_bind_text(q.value, 3, items, items_size, SQLITE_TRANSIENT);
            if (rc == SQLITE_OK && expected != 0) rc = sqlite3_bind_int64(q.value, 4, expected);
            if (rc == SQLITE_OK) rc = sqlite3_step(q.value);
        }
        if (rc != SQLITE_DONE) { rollback(); return storage_failure(rc); }
        if (sqlite3_changes(db) != 1) { rollback(); return {"stale-revision"}; }
        pending = ++sequence;
        return {nullptr, 0, pending};
    }
    hwe_save::WriteResult stage(const hwe_save::WriteRequest &input) noexcept override {
        std::lock_guard<std::mutex> lock(gate);
        return stage_bytes(input.slot, input.revision, input.body.data(), static_cast<int>(input.body.size()),
                           input.stash.data(), static_cast<int>(input.stash.size()));
    }
    hwe_save::WriteResult commit_bytes(int64_t token) noexcept {
        if (!db || !pending || pending != token) return {"invalid-token"};
        const int rc = execute("COMMIT");
        if (rc != SQLITE_OK) { rollback(); return storage_failure(rc); }
        pending = 0;
        return {};
    }
    hwe_save::WriteResult cancel_bytes(int64_t token) noexcept {
        if (!db || !pending || pending != token) return {"invalid-token"};
        rollback();
        return db ? hwe_save::WriteResult{} : hwe_save::WriteResult{"storage"};
    }
    hwe_save::WriteResult commit(int64_t token) noexcept override {
        std::lock_guard<std::mutex> lock(gate);
        return commit_bytes(token);
    }
    hwe_save::WriteResult cancel(int64_t token) noexcept override {
        std::lock_guard<std::mutex> lock(gate);
        return cancel_bytes(token);
    }
public:
    Dictionary save_slot_async(int64_t slot, int64_t expected, const String &crafting, const String &stash) {
        std::unique_lock<std::mutex> lock(gate, std::try_to_lock);
        if (!lock.owns_lock() || worker.busy() || !db || pending) return result(false, "unavailable");
        if (slot < 0 || slot > 65535 || expected < 0 || expected >= max_revision || sequence >= max_revision)
            return result(false, "invalid-revision-or-slot");
        if (crafting.is_empty() || stash.is_empty() || crafting.length() > max_bytes || stash.length() > max_bytes)
            return result(false, "payload-size");
        const auto body = crafting.utf8(), items = stash.utf8();
        if (body.length() > max_bytes || items.length() > max_bytes) return result(false, "payload-size");
        auto reply = worker.submit({slot, expected, std::string(body.get_data(), body.length()),
                                    std::string(items.get_data(), items.length())});
        auto out = write_reply(reply);
        if (reply.ok()) { out.erase("token"); out["ticket"] = reply.token; }
        return out;
    }
    Dictionary poll_save(int64_t ticket) {
        const auto reply = worker.poll(ticket);
        if (!reply.valid) return result(false, "invalid-ticket");
        if (!reply.pending) {
            auto out = write_reply(reply.result);
            out["pending"] = false;
            return out;
        }
        auto out = result(true);
        out["pending"] = true;
        return out;
    }
    Dictionary cancel_save(int64_t ticket) { return write_reply(worker.cancel(ticket)); }
    Dictionary commit_slot(int64_t token) {
        std::unique_lock<std::mutex> lock(gate, std::try_to_lock);
        if (!lock.owns_lock() || worker.busy()) return result(false, "unavailable");
        return write_reply(commit_bytes(token));
    }
    Dictionary cancel_slot(int64_t token) {
        std::unique_lock<std::mutex> lock(gate, std::try_to_lock);
        if (!lock.owns_lock() || worker.busy()) return result(false, "unavailable");
        return write_reply(cancel_bytes(token));
    }
    Dictionary checkpoint() {
        std::unique_lock<std::mutex> lock(gate, std::try_to_lock);
        if (!lock.owns_lock() || worker.busy()) return result(false, "unavailable");
        if (!db || pending) return result(false, "unavailable");
        int frames = -1, copied = -1;
        const int rc = sqlite3_wal_checkpoint_v2(db, "main", SQLITE_CHECKPOINT_PASSIVE, &frames, &copied);
        if (rc != SQLITE_OK) return failure(rc);
        auto reply = result(true);
        reply["frames"] = frames;
        reply["copied"] = copied;
        reply["complete"] = frames == copied;
        return reply;
    }
    void close_file() {
        std::lock_guard<std::mutex> owner(lifecycle);
        worker.shutdown();
        std::lock_guard<std::mutex> lock(gate);
        close_locked();
    }
};

static void initialize(ModuleInitializationLevel level) {
    if (level == MODULE_INITIALIZATION_LEVEL_SCENE) GDREGISTER_CLASS(HollowWakeSlotStore);
}
extern "C" GDExtensionBool GDE_EXPORT hwe_slot_store_init(GDExtensionInterfaceGetProcAddress get_proc_address,
        GDExtensionClassLibraryPtr library, GDExtensionInitialization *initialization) {
    GDExtensionBinding::InitObject init(get_proc_address, library, initialization);
    init.register_initializer(initialize);
    init.set_minimum_library_initialization_level(MODULE_INITIALIZATION_LEVEL_SCENE);
    return init.init();
}
