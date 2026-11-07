#include "hwe_save.h"
#include "slot-store.hpp"
#include "sqlite3.h"
#include <cstring>
#include <new>
#include <string_view>

static_assert(sizeof(hwe_save_result) == 16, "C result layout");
struct hwe_save_store { hwe_save::SlotStore core; hwe_save::Slot last_read; };
namespace {
struct NamedStatus { const char *name; int32_t status; };
constexpr NamedStatus names[] = {
    {"ok",HWE_SAVE_OK},{"pending",HWE_SAVE_PENDING},{"unavailable",HWE_SAVE_UNAVAILABLE},
    {"busy",HWE_SAVE_BUSY},{"storage",HWE_SAVE_STORAGE},{"invalid-path-or-open",HWE_SAVE_INVALID_PATH},
    {"invalid-journal-policy",HWE_SAVE_INVALID_JOURNAL},{"journal-unavailable",HWE_SAVE_JOURNAL_UNAVAILABLE},
    {"incompatible-database",HWE_SAVE_INCOMPATIBLE_DATABASE},{"invalid-record",HWE_SAVE_INVALID_RECORD},
    {"invalid-revision-or-slot",HWE_SAVE_INVALID_REVISION_OR_SLOT},{"payload-size",HWE_SAVE_PAYLOAD_SIZE},
    {"stale-revision",HWE_SAVE_STALE_REVISION},{"invalid-token",HWE_SAVE_INVALID_TOKEN},
    {"invalid-ticket",HWE_SAVE_INVALID_TICKET},{"cancelled",HWE_SAVE_CANCELLED},{"too-late",HWE_SAVE_TOO_LATE},
    {"worker-unavailable",HWE_SAVE_WORKER_UNAVAILABLE},{"invalid-argument",HWE_SAVE_INVALID_ARGUMENT},
    {"invalid-utf8",HWE_SAVE_INVALID_UTF8},{"abi-mismatch",HWE_SAVE_ABI_MISMATCH},
    {"out-of-memory",HWE_SAVE_OUT_OF_MEMORY},{"internal",HWE_SAVE_INTERNAL}
};
hwe_save_result result(int32_t status, uint64_t value = 0) { return {status,0,value}; }
hwe_save_result convert(hwe_save::WriteResult source) {
    if (!source.reason) return {HWE_SAVE_OK,source.code,static_cast<uint64_t>(source.token)};
    for (const auto &entry : names)
        if (std::strcmp(source.reason,entry.name) == 0) return {entry.status,source.code,static_cast<uint64_t>(source.token)};
    return {HWE_SAVE_INTERNAL,source.code,0};
}
template<class Action> hwe_save_result call(hwe_save_store *store, Action action) noexcept {
    if (!store) return result(HWE_SAVE_INVALID_ARGUMENT);
    try { return action(); }
    catch (const std::bad_alloc &) { return result(HWE_SAVE_OUT_OF_MEMORY); }
    catch (...) { return result(HWE_SAVE_INTERNAL); }
}
bool utf8(const uint8_t *text, uint32_t size) noexcept {
    uint32_t i = 0;
    while (i < size) {
        const auto c = text[i++];
        if (c < 0x80) continue;
        uint32_t rest;
        uint8_t low = 0x80, high = 0xbf;
        if (c >= 0xc2 && c <= 0xdf) rest = 1;
        else if (c >= 0xe0 && c <= 0xef) {
            rest = 2;
            if (c == 0xe0) low = 0xa0;
            if (c == 0xed) high = 0x9f;
        } else if (c >= 0xf0 && c <= 0xf4) {
            rest = 3;
            if (c == 0xf0) low = 0x90;
            if (c == 0xf4) high = 0x8f;
        } else return false;
        if (size-i < rest || text[i] < low || text[i] > high) return false;
        ++i;
        for (uint32_t n = 1; n < rest; ++n,++i)
            if (text[i] < 0x80 || text[i] > 0xbf) return false;
    }
    return true;
}
int32_t document(const uint8_t *bytes, uint32_t length) {
    if (length == 0 || length > HWE_SAVE_DOCUMENT_LIMIT) return HWE_SAVE_PAYLOAD_SIZE;
    if (!bytes) return HWE_SAVE_INVALID_ARGUMENT;
    return utf8(bytes,length) ? HWE_SAVE_OK : HWE_SAVE_INVALID_UTF8;
}
std::string_view view(const uint8_t *data, uint32_t size) {
    return {reinterpret_cast<const char *>(data),size};
}
hwe_save_result write(hwe_save_store *store, uint32_t slot, uint64_t revision,
    const uint8_t *body, uint32_t body_size, const uint8_t *stash, uint32_t stash_size, bool async) {
    return call(store,[&] {
        if (slot > 65535 || revision >= static_cast<uint64_t>(hwe_save::SlotStore::max_revision))
            return result(HWE_SAVE_INVALID_REVISION_OR_SLOT);
        const auto ready = store->core.check_write(slot,static_cast<int64_t>(revision));
        if (!ready.ok()) return convert(ready);
        const auto a = document(body,body_size);
        if (a != HWE_SAVE_OK) return result(a);
        const auto b = document(stash,stash_size);
        if (b != HWE_SAVE_OK) return result(b);
        return convert(async ? store->core.save_slot_async(slot,static_cast<int64_t>(revision),view(body,body_size),view(stash,stash_size))
            : store->core.stage_slot(slot,static_cast<int64_t>(revision),view(body,body_size),view(stash,stash_size)));
    });
}
bool valid_id(uint64_t id) { return id > 0 && id <= static_cast<uint64_t>(hwe_save::SlotStore::max_revision); }
}
extern "C" {
uint32_t hwe_save_abi_version(void) { return HWE_SAVE_ABI_VERSION; }
uint32_t hwe_save_view_size(void) { return static_cast<uint32_t>(sizeof(hwe_save_view)); }
const char *hwe_save_sqlite_version(void) { return sqlite3_libversion(); }
const char *hwe_save_status_name(int32_t status) {
    for (const auto &entry : names) if (entry.status == status) return entry.name;
    return "unknown-status";
}
hwe_save_result hwe_save_create(uint32_t abi, hwe_save_store **out) {
    if (!out) return result(HWE_SAVE_INVALID_ARGUMENT);
    *out = nullptr;
    if (abi != HWE_SAVE_ABI_VERSION) return result(HWE_SAVE_ABI_MISMATCH);
    try { *out = new hwe_save_store; return result(HWE_SAVE_OK); }
    catch (const std::bad_alloc &) { return result(HWE_SAVE_OUT_OF_MEMORY); }
    catch (...) { return result(HWE_SAVE_INTERNAL); }
}
void hwe_save_destroy(hwe_save_store *store) { delete store; }
hwe_save_result hwe_save_open(hwe_save_store *store, const uint8_t *path, uint32_t length, int32_t journal) {
    return call(store,[&] {
        if (length == 0 || length > HWE_SAVE_PATH_LIMIT) return result(HWE_SAVE_INVALID_PATH);
        if (!path) return result(HWE_SAVE_INVALID_ARGUMENT);
        if (!utf8(path,length)) return result(HWE_SAVE_INVALID_UTF8);
        const char *policy = journal == HWE_SAVE_PRESERVE ? "preserve" :
            journal == HWE_SAVE_WAL ? "wal" : journal == HWE_SAVE_ROLLBACK ? "rollback" : nullptr;
        if (!policy) return result(HWE_SAVE_INVALID_JOURNAL);
        hwe_save::OpenInfo info;
        const auto opened = store->core.open_file(std::string(view(path,length)),policy,info);
        if (!opened.ok()) return convert(opened);
        return result(HWE_SAVE_OK,info.journal == "wal" ? HWE_SAVE_WAL :
            info.journal == "delete" ? HWE_SAVE_ROLLBACK : HWE_SAVE_OTHER_JOURNAL);
    });
}
hwe_save_result hwe_save_close(hwe_save_store *store) {
    return call(store,[&] { store->core.close_file(); store->last_read = {}; return result(HWE_SAVE_OK); });
}
hwe_save_result hwe_save_read(hwe_save_store *store, uint32_t slot, hwe_save_view *out) {
    if (out) *out = {};
    return call(store,[&] {
        store->last_read = {};
        if (!out) return result(HWE_SAVE_INVALID_ARGUMENT);
        const auto read = store->core.read_slot(slot,store->last_read);
        if (!read.ok()) return convert(read);
        const auto &value = store->last_read;
        if (value.revision) {
            if (!utf8(reinterpret_cast<const uint8_t *>(value.crafting.data()),static_cast<uint32_t>(value.crafting.size())) ||
                !utf8(reinterpret_cast<const uint8_t *>(value.stash.data()),static_cast<uint32_t>(value.stash.size()))) {
                store->last_read = {};
                return result(HWE_SAVE_INVALID_RECORD);
            }
            out->crafting = reinterpret_cast<const uint8_t *>(value.crafting.data());
            out->crafting_length = static_cast<uint32_t>(value.crafting.size());
            out->stash = reinterpret_cast<const uint8_t *>(value.stash.data());
            out->stash_length = static_cast<uint32_t>(value.stash.size());
        }
        return result(HWE_SAVE_OK,static_cast<uint64_t>(value.revision));
    });
}
hwe_save_result hwe_save_stage(hwe_save_store *s, uint32_t slot, uint64_t revision,
    const uint8_t *body, uint32_t size, const uint8_t *stash, uint32_t stash_size) {
    return write(s,slot,revision,body,size,stash,stash_size,false);
}
hwe_save_result hwe_save_submit(hwe_save_store *s, uint32_t slot, uint64_t revision,
    const uint8_t *body, uint32_t size, const uint8_t *stash, uint32_t stash_size) {
    return write(s,slot,revision,body,size,stash,stash_size,true);
}
hwe_save_result hwe_save_commit(hwe_save_store *store, uint64_t token) {
    return call(store,[&] { return valid_id(token) ? convert(store->core.commit_slot(static_cast<int64_t>(token))) : result(HWE_SAVE_INVALID_TOKEN); });
}
hwe_save_result hwe_save_cancel(hwe_save_store *store, uint64_t token) {
    return call(store,[&] { return valid_id(token) ? convert(store->core.cancel_slot(static_cast<int64_t>(token))) : result(HWE_SAVE_INVALID_TOKEN); });
}
hwe_save_result hwe_save_poll(hwe_save_store *store, uint64_t ticket) {
    return call(store,[&] {
        if (!valid_id(ticket)) return result(HWE_SAVE_INVALID_TICKET);
        const auto reply = store->core.poll_save(static_cast<int64_t>(ticket));
        if (!reply.valid) return result(HWE_SAVE_INVALID_TICKET);
        return reply.pending ? result(HWE_SAVE_PENDING) : convert(reply.result);
    });
}
hwe_save_result hwe_save_cancel_async(hwe_save_store *store, uint64_t ticket) {
    return call(store,[&] { return valid_id(ticket) ? convert(store->core.cancel_save(static_cast<int64_t>(ticket))) : result(HWE_SAVE_INVALID_TICKET); });
}
hwe_save_result hwe_save_checkpoint(hwe_save_store *store, int32_t *frames, int32_t *copied) {
    if (frames) *frames = -1;
    if (copied) *copied = -1;
    return call(store,[&] {
        if (!frames || !copied) return result(HWE_SAVE_INVALID_ARGUMENT);
        hwe_save::Checkpoint progress;
        const auto checked = store->core.checkpoint(progress);
        if (!checked.ok()) return convert(checked);
        *frames = progress.frames; *copied = progress.copied;
        return result(HWE_SAVE_OK,progress.complete ? 1 : 0);
    });
}
}
