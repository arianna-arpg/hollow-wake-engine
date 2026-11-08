#pragma once
#include <array>
#include <atomic>

// Uses the same raw SQLite build as the established core consumer.
int group_process(const std::filesystem::path &root, const std::string &operation,
                  const std::string &journal, const std::string &boundary) {
    CHECK(journal == "wal" || journal == "rollback");
    CHECK(boundary == "staged" || boundary == "committed" || boundary == "refused");
    const auto file = (root / ("group-crash-" + journal + "-" + boundary + ".db")).u8string();
    SlotStore store;
    OpenInfo info;
    CHECK(store.open_file(file,journal,info).ok());
    const int64_t ids[] = {10,20};
    std::vector<Slot> rows;
    if (operation == "--group-recover") {
        CHECK(store.read_group(ids,2,rows).ok());
        const bool committed = boundary == "committed";
        CHECK(rows.size() == 2);
        for (const auto &row : rows) {
            CHECK(row.revision == (committed ? 2 : 1));
            CHECK(row.crafting == (committed ? "new" : "old"));
            CHECK(row.stash == (committed ? "new-stash" : "old-stash"));
        }
        std::cout << "{\"passed\":true,\"recovered\":true}\n";
        return 0;
    }
    CHECK(operation == "--group-crash");
    const SlotWrite initial[] = {{10,0,"old","old-stash"},{20,0,"old","old-stash"}};
    auto staged = store.stage_group(initial,2);
    CHECK(staged.ok() && store.commit_slot(staged.token).ok());
    const SlotWrite next[] = {{10,1,"new","new-stash"},{20,boundary == "refused" ? 0 : 1,"new","new-stash"}};
    staged = store.stage_group(next,2);
    if (boundary == "refused") CHECK(reason(staged,"stale-revision"));
    else {
        CHECK(staged.ok());
        if (boundary == "committed") CHECK(store.commit_slot(staged.token).ok());
    }
    // Deliberately skip store destruction/SQLite shutdown. A fresh process must
    // recover the exact complete prior or committed group in either journal.
    std::_Exit(0);
}

void group_tests(const std::filesystem::path &root) {
    const auto file = (root / "groups.db").u8string();
    SlotStore owner,peer;
    OpenInfo info;
    CHECK(owner.open_file(file,"wal",info).ok());
    CHECK(peer.open_file(file,"preserve",info).ok());
    const int64_t ids[] = {20,99,10};
    std::vector<Slot> rows;
    const SlotWrite initial[] = {{10,0,"account","account-stash"},{20,0,"inventory","inventory-stash"}};
    auto staged = owner.stage_group(initial,2);
    CHECK(staged.ok());
    CHECK(peer.read_group(ids,3,rows).ok() && rows.size() == 3 && rows[0].revision == 0 && rows[2].revision == 0);
    CHECK(owner.commit_slot(staged.token).ok());
    CHECK(peer.read_group(ids,3,rows).ok());
    CHECK(rows[0].revision == 1 && rows[0].crafting == "inventory" && rows[0].stash == "inventory-stash");
    CHECK(rows[1].revision == 0 && rows[1].crafting.empty() && rows[1].stash.empty());
    CHECK(rows[2].revision == 1 && rows[2].crafting == "account" && rows[2].stash == "account-stash");
    const SlotWrite late_stale[] = {{10,1,"lost-account","lost"},{20,0,"stale-inventory","lost"}};
    CHECK(reason(owner.stage_group(late_stale,2),"stale-revision"));
    CHECK(peer.read_group(ids,3,rows).ok() && rows[2].revision == 1 && rows[2].crafting == "account");
    const SlotWrite late_insert[] = {{30,0,"must-disappear","lost"},{20,0,"stale","lost"}};
    CHECK(reason(owner.stage_group(late_insert,2),"stale-revision"));
    Slot row;
    CHECK(peer.read_slot(30,row).ok() && row.revision == 0);
    const SlotWrite next[] = {{10,1,"next-account","next-a"},{20,1,"next-inventory","next-i"}};
    staged = owner.stage_group(next,2);
    CHECK(staged.ok() && owner.cancel_slot(staged.token).ok());
    CHECK(peer.read_group(ids,3,rows).ok() && rows[0].revision == 1 && rows[2].revision == 1);
    CHECK(reason(owner.stage_group(nullptr,2),"invalid-argument"));
    CHECK(reason(owner.stage_group(initial,0),"invalid-argument"));
    CHECK(reason(owner.stage_group(initial,9),"invalid-argument"));
    const SlotWrite duplicates[] = {{10,1,"a","b"},{10,2,"c","d"}};
    CHECK(reason(owner.stage_group(duplicates,2),"invalid-argument"));
    CHECK(reason(owner.save_group_async(duplicates,2),"invalid-argument"));
    const int64_t duplicated_ids[] = {10,10};
    CHECK(reason(owner.read_group(duplicated_ids,2,rows),"invalid-argument"));
    CHECK(rows[2].crafting == "account");
    const int64_t invalid_ids[] = {10,65536};
    CHECK(reason(owner.read_group(invalid_ids,2,rows),"invalid-revision-or-slot"));
    const SlotWrite invalid_revision[] = {{10,1,"a","b"},{20,SlotStore::max_revision,"c","d"}};
    CHECK(reason(owner.stage_group(invalid_revision,2),"invalid-revision-or-slot"));
    const SlotWrite invalid_document[] = {{10,1,"a","b"},{20,1,"","d"}};
    CHECK(reason(owner.stage_group(invalid_document,2),"payload-size"));
    std::string maximum(SlotStore::max_bytes,'x');
    std::array<SlotWrite,8> limits{};
    for (size_t i = 0; i < limits.size(); ++i) limits[i] = {100+static_cast<int64_t>(i),0,maximum,maximum};
    staged = owner.stage_group(limits.data(),4);
    CHECK(staged.ok() && owner.commit_slot(staged.token).ok());
    const int64_t four[] = {100,101,102,103};
    CHECK(owner.read_group(four,4,rows).ok() && rows.size() == 4 && rows[3].stash == maximum);
    limits[0].slot = 105; // Five full records exceed the aggregate, not per-document, limit.
    CHECK(reason(owner.save_group_async(limits.data(),5),"payload-size"));
    staged = owner.stage_slot(104,0,maximum,maximum);
    CHECK(staged.ok() && owner.commit_slot(staged.token).ok());
    const int64_t five[] = {100,101,102,103,104};
    CHECK(reason(owner.read_group(five,5,rows),"payload-size") && rows.size() == 4);
    for (size_t i = 0; i < limits.size(); ++i) limits[i] = {200+static_cast<int64_t>(i),0,"a","b"};
    staged = owner.stage_group(limits.data(),8);
    CHECK(staged.ok() && owner.commit_slot(staged.token).ok());
    const int64_t eight[] = {207,206,205,204,203,202,201,200};
    CHECK(owner.read_group(eight,8,rows).ok() && rows.size() == 8 && rows[7].revision == 1);
    // Async ownership and the single outstanding completion apply to whole groups.
    std::string owned = "owned";
    const SlotWrite async[] = {{10,1,owned,"a"},{20,1,owned,"b"}};
    auto submitted = owner.save_group_async(async,2);
    CHECK(submitted.ok());
    owned.assign("changed");
    CHECK(reason(owner.stage_group(next,2),"unavailable"));
    CHECK(reason(owner.save_slot_async(99,0,"a","b"),"unavailable"));
    CHECK(finish(owner,submitted.token).ok());
    CHECK(owner.read_group(ids,3,rows).ok() && rows[0].crafting == "owned" && rows[2].crafting == "owned");
    const SlotWrite stale_async[] = {{10,2,"lost","lost"},{20,1,"stale","lost"}};
    submitted = owner.save_group_async(stale_async,2);
    CHECK(submitted.ok() && reason(finish(owner,submitted.token),"stale-revision"));
    CHECK(peer.read_group(ids,3,rows).ok() && rows[2].revision == 2 && rows[2].crafting == "owned");
    const SlotWrite cancelled[] = {{10,2,"cancel-or-commit","a"},{20,2,"cancel-or-commit","b"}};
    submitted = owner.save_group_async(cancelled,2);
    CHECK(submitted.ok());
    const auto cancellation = owner.cancel_save(submitted.token);
    const auto completion = finish(owner,submitted.token);
    CHECK(owner.read_group(ids,3,rows).ok() && rows[0].revision == rows[2].revision);
    CHECK(cancellation.ok() ? reason(completion,"cancelled") && rows[0].revision == 2 :
        reason(cancellation,"too-late") && completion.ok() && rows[0].revision == 3);
    // Independent writer/read connections: every observed pair must belong to
    // one committed generation. The final generation must also be visible.
    const SlotWrite seed[] = {{400,0,"0","0"},{401,0,"0","0"}};
    staged = owner.stage_group(seed,2);
    CHECK(staged.ok() && owner.commit_slot(staged.token).ok());
    std::atomic<bool> started{false},done{false};
    std::thread writer([&] {
        while (!started.load()) std::this_thread::yield();
        for (int64_t i = 1; i <= 100; ++i) {
            const auto generation = std::to_string(i);
            const SlotWrite update[] = {{400,i,generation,generation},{401,i,generation,generation}};
            const auto transaction = owner.stage_group(update,2);
            CHECK(transaction.ok() && owner.commit_slot(transaction.token).ok());
        }
        done.store(true);
    });
    const int64_t snapshot_ids[] = {400,401};
    started.store(true);
    size_t snapshots = 0;
    do {
        CHECK(peer.read_group(snapshot_ids,2,rows).ok());
        CHECK(rows[0].revision == rows[1].revision && rows[0].crafting == rows[1].crafting &&
            rows[0].stash == rows[1].stash && rows[0].crafting == std::to_string(rows[0].revision-1));
        ++snapshots;
    } while (!done.load());
    writer.join();
    CHECK(snapshots > 0 && peer.read_group(snapshot_ids,2,rows).ok() && rows[0].revision == 101 && rows[1].revision == 101);
    peer.close_file();
    owner.close_file();
    // Commit failure must roll back every staged member, including an insert.
    CHECK(owner.open_file(file,"rollback",info).ok());
    sqlite3 *reader = nullptr;
    CHECK(sqlite3_open(file.c_str(),&reader) == SQLITE_OK);
    sql(reader,"BEGIN; SELECT * FROM slots");
    const SlotWrite busy[] = {{400,101,"lost","lost"},{500,0,"lost","lost"}};
    staged = owner.stage_group(busy,2);
    CHECK(staged.ok() && reason(owner.commit_slot(staged.token),"busy"));
    sql(reader,"COMMIT");
    CHECK(sqlite3_close(reader) == SQLITE_OK);
    CHECK(owner.read_slot(400,row).ok() && row.revision == 101 && row.crafting == "100");
    CHECK(owner.read_slot(500,row).ok() && row.revision == 0);
    owner.close_file();
    // A damaged record is not an empty slot, even if its revision is NULL.
    const auto corrupt = (root / "group-corrupt-schema.db").u8string();
    CHECK(sqlite3_open(corrupt.c_str(),&reader) == SQLITE_OK);
    sql(reader,"CREATE TABLE slots(slot INTEGER PRIMARY KEY,revision INTEGER,crafting TEXT,stash TEXT);"
        "PRAGMA application_id=0x48575331; PRAGMA user_version=1;"
        "INSERT INTO slots VALUES(10,NULL,'damaged','damaged')");
    CHECK(sqlite3_close(reader) == SQLITE_OK);
    CHECK(owner.open_file(corrupt,"preserve",info).ok());
    const int64_t corrupt_ids[] = {99,10};
    CHECK(reason(owner.read_group(corrupt_ids,2,rows),"invalid-record"));
}
