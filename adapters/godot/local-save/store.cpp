#include "slot-store.hpp"
#include <godot_cpp/classes/ref_counted.hpp>
#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/godot.hpp>
#include <godot_cpp/variant/dictionary.hpp>
#include <filesystem>
#include <string_view>

using namespace godot;
namespace {
Dictionary result(bool ok, const char *reason = "") {
    Dictionary reply;
    reply["ok"] = ok;
    if (!ok) reply["reason"] = reason;
    return reply;
}
Dictionary write_reply(hwe_save::WriteResult value) {
    auto reply = result(value.ok(), value.reason ? value.reason : "");
    if (value.code) reply["sqlite_code"] = value.code;
    if (value.token) reply["token"] = value.token;
    return reply;
}
std::string_view bytes(const CharString &value) {
    return {value.get_data(), static_cast<size_t>(value.length())};
}
}
class HollowWakeSlotStore final : public RefCounted {
    GDCLASS(HollowWakeSlotStore, RefCounted)
    hwe_save::SlotStore store;
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
    ~HollowWakeSlotStore() override { store.close_file(); }
    Dictionary open_file(const String &path, const String &policy = "wal") {
        if (!path.is_absolute_path() || path.contains("://")) return result(false, "invalid-path-or-open");
        if (policy != "wal" && policy != "rollback" && policy != "preserve") return result(false, "invalid-journal-policy");
        const auto encoded = path.utf8(), mode = policy.utf8();
        const std::string name(bytes(encoded));
        if (name.find('\0') != std::string::npos) return result(false, "invalid-path-or-open");
        hwe_save::OpenInfo info;
        hwe_save::WriteResult opened;
        try {
            // Godot accepts rooted paths that need the current native drive.
            // Resolve that existing host convention before entering the core.
            opened = store.open_file(std::filesystem::absolute(std::filesystem::u8path(name)).u8string(),
                                     std::string(bytes(mode)), info);
        } catch (const std::filesystem::filesystem_error &) {
            return result(false, "invalid-path-or-open");
        }
        if (!opened.ok()) return write_reply(opened);
        auto reply = result(true);
        reply["journal"] = String::utf8(info.journal.data(), static_cast<int64_t>(info.journal.size()));
        reply["sqlite_version"] = String::utf8(info.sqlite_version);
        return reply;
    }
    Dictionary read_slot(int64_t slot) {
        hwe_save::Slot value;
        const auto read = store.read_slot(slot, value);
        if (!read.ok()) return write_reply(read);
        auto reply = result(true);
        reply["revision"] = value.revision;
        if (value.revision) {
            reply["crafting"] = String::utf8(value.crafting.data(), static_cast<int64_t>(value.crafting.size()));
            reply["stash"] = String::utf8(value.stash.data(), static_cast<int64_t>(value.stash.size()));
        }
        return reply;
    }
    Dictionary stage_slot(int64_t slot, int64_t revision, const String &crafting, const String &stash) {
        return submit(slot, revision, crafting, stash, false);
    }
    Dictionary save_slot_async(int64_t slot, int64_t revision, const String &crafting, const String &stash) {
        return submit(slot, revision, crafting, stash, true);
    }
    Dictionary commit_slot(int64_t token) { return write_reply(store.commit_slot(token)); }
    Dictionary cancel_slot(int64_t token) { return write_reply(store.cancel_slot(token)); }
    Dictionary cancel_save(int64_t ticket) { return write_reply(store.cancel_save(ticket)); }
    Dictionary poll_save(int64_t ticket) {
        const auto polled = store.poll_save(ticket);
        if (!polled.valid) return result(false, "invalid-ticket");
        auto reply = polled.pending ? result(true) : write_reply(polled.result);
        reply["pending"] = polled.pending;
        return reply;
    }
    Dictionary checkpoint() {
        hwe_save::Checkpoint progress;
        const auto checked = store.checkpoint(progress);
        if (!checked.ok()) return write_reply(checked);
        auto reply = result(true);
        reply["frames"] = progress.frames;
        reply["copied"] = progress.copied;
        reply["complete"] = progress.complete;
        return reply;
    }
    void close_file() { store.close_file(); }
private:
    Dictionary submit(int64_t slot, int64_t revision, const String &crafting, const String &stash, bool async) {
        // This preview never reserves ownership. The core repeats admission
        // after encoding, under its own gate, before staging or queuing a write.
        const auto ready = store.check_write(slot, revision);
        if (!ready.ok()) return write_reply(ready);
        if (crafting.is_empty() || stash.is_empty() || crafting.length() > hwe_save::SlotStore::max_bytes ||
            stash.length() > hwe_save::SlotStore::max_bytes) return result(false, "payload-size");
        const auto body = crafting.utf8(), items = stash.utf8();
        const auto saved = async ? store.save_slot_async(slot, revision, bytes(body), bytes(items)) :
                                   store.stage_slot(slot, revision, bytes(body), bytes(items));
        auto reply = write_reply(saved);
        if (async && saved.ok()) { reply.erase("token"); reply["ticket"] = saved.token; }
        return reply;
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
