#include "../native/save/include/slot-store.hpp"
#include "sqlite3.h"
#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <string>
#include <thread>

using namespace hwe_save;
using namespace std::chrono_literals;
#define CHECK(x) do { if (!(x)) { std::cerr << "Failed: " << #x << " at " << __LINE__ << "\n"; std::exit(1); } } while (false)
bool reason(WriteResult r, const char *expected) { return r.reason && std::string(r.reason) == expected; }
void sql(sqlite3 *db, const char *text) { CHECK(sqlite3_exec(db,text,nullptr,nullptr,nullptr) == SQLITE_OK); }
WriteResult finish(SlotStore &store, int64_t ticket) {
    const auto deadline = std::chrono::steady_clock::now() + 5s;
    for (;;) {
        const auto reply = store.poll_save(ticket);
        CHECK(reply.valid);
        if (!reply.pending) return reply.result;
        CHECK(std::chrono::steady_clock::now() < deadline);
        std::this_thread::yield();
    }
}
int main(int argc, char **argv) {
    CHECK(argc == 2);
    const auto root = std::filesystem::absolute(std::filesystem::u8path(argv[1]));
    CHECK(std::filesystem::is_directory(root));
    OpenInfo info;
    Slot value;
    Checkpoint progress;
    SlotStore owner, peer;
    CHECK(reason(owner.open_file("relative.db","wal",info),"invalid-path-or-open"));
    const auto file = (root / std::filesystem::u8path("save-é.db")).u8string();
    CHECK(reason(owner.open_file(file + std::string("\0ignored",8),"wal",info),"invalid-path-or-open"));
    CHECK(reason(owner.open_file(file,"unknown",info),"invalid-journal-policy"));
    CHECK(!std::filesystem::exists(std::filesystem::u8path(file)));
    CHECK(owner.open_file(file,"wal",info).ok() && info.journal == "wal");
    CHECK(std::string(info.sqlite_version) == SQLITE_VERSION);
    CHECK(reason(owner.open_file(file,"wal",info),"invalid-path-or-open"));
    CHECK(owner.read_slot(1,value).ok() && value.revision == 0);
    CHECK(peer.open_file(file,"wal",info).ok());
    const std::string body = R"({"__proto__":{"x":1},"uid":9007199254740991,"fraction":0.125,"text":"é"})";
    const std::string stash = R"({"items":[{"uid":4294967296}],"rng":12345})";
    auto staged = owner.stage_slot(1,0,body,stash);
    CHECK(staged.ok() && staged.token > 0);
    CHECK(reason(owner.read_slot(1,value),"unavailable"));
    CHECK(reason(owner.checkpoint(progress),"unavailable"));
    CHECK(peer.read_slot(1,value).ok() && value.revision == 0);
    CHECK(reason(peer.stage_slot(1,0,"wrong","wrong"),"busy"));
    CHECK(reason(owner.commit_slot(staged.token + 1),"invalid-token"));
    CHECK(owner.commit_slot(staged.token).ok());
    CHECK(peer.read_slot(1,value).ok() && value.revision == 1 && value.crafting == body && value.stash == stash);
    CHECK(reason(peer.stage_slot(1,0,"wrong","wrong"),"stale-revision"));
    staged = owner.stage_slot(1,1,"discard","discard");
    CHECK(staged.ok() && owner.cancel_slot(staged.token).ok());
    CHECK(owner.read_slot(1,value).ok() && value.revision == 1 && value.crafting == body);
    CHECK(peer.read_slot(1,value).ok() && value.revision == 1 && value.crafting == body);
    CHECK(reason(owner.stage_slot(-1,1,"x","y"),"invalid-revision-or-slot"));
    CHECK(reason(owner.stage_slot(65536,1,"x","y"),"invalid-revision-or-slot"));
    CHECK(reason(owner.stage_slot(1,SlotStore::max_revision,"x","y"),"invalid-revision-or-slot"));
    CHECK(reason(owner.stage_slot(1,1,"","y"),"payload-size"));
    CHECK(reason(owner.stage_slot(1,1,std::string(SlotStore::max_bytes+1,'x'),"y"),"payload-size"));
    staged = owner.stage_slot(65535,0,std::string(SlotStore::max_bytes,'x'),"y");
    CHECK(staged.ok() && owner.commit_slot(staged.token).ok());
    CHECK(owner.read_slot(65535,value).ok() && value.crafting.size() == SlotStore::max_bytes);
    staged = owner.stage_slot(1,1,"uncommitted","uncommitted");
    CHECK(staged.ok());
    const auto old_token = staged.token;
    owner.close_file();
    CHECK(owner.open_file(file,"wal",info).ok());
    CHECK(owner.read_slot(1,value).ok() && value.revision == 1 && value.crafting == body && value.stash == stash);
    CHECK(reason(owner.commit_slot(old_token),"invalid-token"));
    staged = owner.stage_slot(1,1,"cancel","cancel");
    CHECK(staged.ok() && staged.token > old_token && owner.cancel_slot(staged.token).ok());
    {
        SlotStore converter;
        CHECK(reason(converter.open_file(file,"rollback",info),"busy"));
    }
    peer.close_file();
    CHECK(owner.checkpoint(progress).ok() && progress.complete);
    owner.close_file();
    CHECK(owner.open_file(file,"rollback",info).ok() && info.journal == "delete");
    CHECK(owner.checkpoint(progress).ok() && progress.frames == -1 && progress.copied == -1);
    owner.close_file();
    CHECK(owner.open_file(file,"preserve",info).ok() && info.journal == "delete");
    // A held reader permits staging but makes COMMIT busy in rollback mode.
    sqlite3 *reader = nullptr;
    CHECK(sqlite3_open(file.c_str(),&reader) == SQLITE_OK);
    sql(reader,"BEGIN; SELECT * FROM slots");
    staged = owner.stage_slot(1,1,"failed-commit","failed-commit");
    CHECK(staged.ok());
    CHECK(reason(owner.commit_slot(staged.token),"busy"));
    sql(reader,"COMMIT");
    CHECK(sqlite3_close(reader) == SQLITE_OK);
    CHECK(owner.read_slot(1,value).ok() && value.revision == 1 && value.crafting == body && value.stash == stash);
    CHECK(reason(owner.commit_slot(staged.token),"invalid-token"));
    owner.close_file();
    CHECK(owner.open_file(file,"wal",info).ok() && info.journal == "wal");
    auto queued = owner.save_slot_async(1,1,body + " ",stash + " ");
    CHECK(queued.ok());
    CHECK(reason(owner.save_slot_async(1,1,"wrong","wrong"),"unavailable"));
    CHECK(reason(owner.read_slot(1,value),"unavailable"));
    CHECK(!owner.poll_save(queued.token + 1).valid);
    CHECK(finish(owner,queued.token).ok());
    CHECK(!owner.poll_save(queued.token).valid);
    CHECK(owner.read_slot(1,value).ok() && value.revision == 2 && value.crafting == body + " " && value.stash == stash + " ");
    CHECK(reason(owner.stage_slot(1,1,"stale","stale"),"stale-revision"));
    CHECK(reason(owner.cancel_save(queued.token),"invalid-ticket"));
    const auto old_ticket = queued.token;
    owner.close_file();
    CHECK(owner.open_file(file,"wal",info).ok());
    queued = owner.save_slot_async(1,2,"cancel-or-commit","paired");
    CHECK(queued.ok() && queued.token > old_ticket && !owner.poll_save(old_ticket).valid);
    const auto cancellation = owner.cancel_save(queued.token);
    const auto completion = finish(owner,queued.token);
    CHECK(owner.read_slot(1,value).ok());
    if (cancellation.ok()) {
        CHECK(reason(completion,"cancelled") && value.revision == 2 && value.crafting == body + " ");
    } else {
        CHECK(reason(cancellation,"too-late") && completion.ok() && value.revision == 3 &&
            value.crafting == "cancel-or-commit" && value.stash == "paired");
    }
    owner.close_file();
    // Foreign files must not acquire our schema or a journal conversion.
    const auto foreign = (root / "foreign.db").u8string();
    CHECK(sqlite3_open(foreign.c_str(),&reader) == SQLITE_OK);
    sql(reader,"CREATE TABLE unrelated(value TEXT); PRAGMA application_id=42");
    CHECK(sqlite3_close(reader) == SQLITE_OK);
    CHECK(reason(owner.open_file(foreign,"wal",info),"incompatible-database"));
    CHECK(sqlite3_open(foreign.c_str(),&reader) == SQLITE_OK);
    sql(reader,"INSERT INTO unrelated VALUES('retained')");
    CHECK(sqlite3_close(reader) == SQLITE_OK);
    CHECK(owner.open_file(file,"preserve",info).ok());
    CHECK(owner.read_slot(1,value).ok());
    owner.close_file();
    // Prepare an intentionally malformed stored document for the independent C
    // consumer process; never link two SQLite copies into the same process.
    const auto corrupt = (root / "corrupt-utf8.db").u8string();
    CHECK(owner.open_file(corrupt,"rollback",info).ok());
    owner.close_file();
    CHECK(sqlite3_open(corrupt.c_str(),&reader) == SQLITE_OK);
    sql(reader,"INSERT INTO slots VALUES(1,1,CAST(x'ff' AS TEXT),'{}')");
    CHECK(sqlite3_close(reader) == SQLITE_OK);
    std::cout << "{\"passed\":true,\"courses\":[\"identity\",\"paired-documents\",\"competing-writers\","
        "\"revision-and-size-limits\",\"rollback\",\"closed-token\",\"journal-conversion\","
        "\"failed-commit\",\"async-owner\",\"cancellation\",\"reopened-ticket\",\"foreign-database\"]}\n";
}
