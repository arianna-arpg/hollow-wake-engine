#include "hwe_save.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#ifdef _WIN32
#include <windows.h>
#else
#include <sched.h>
#endif
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"Failed C ABI: %s at %d\n",#x,__LINE__); exit(1); } } while (0)
static hwe_save_result finish(hwe_save_store *store, uint64_t ticket) {
    const clock_t start = clock();
    for (;;) {
        const hwe_save_result reply = hwe_save_poll(store,ticket);
        if (reply.status != HWE_SAVE_PENDING) return reply;
        CHECK(clock()-start < CLOCKS_PER_SEC*5);
#ifdef _WIN32
        SwitchToThread();
#else
        sched_yield();
#endif
    }
}
int main(int argc, char **argv) {
    char file[8192];
    hwe_save_store *store = NULL;
    hwe_save_view view;
    hwe_save_result reply;
    int32_t frames, copied;
    uint64_t ticket;
    const uint8_t body[] = {'A',0,'B',0xe2,0x82,0xac};
    const uint8_t stash[] = "{}";
    const struct { uint8_t bytes[4]; uint32_t size; } invalid[] = {
        {{0xff},1},{{0xc0,0x80},2},{{0xed,0xa0,0x80},3},
        {{0xf4,0x90,0x80,0x80},4},{{0xe2,0x82},2},{{0x80},1},{{0xc2,'A'},2}
    };
    CHECK(argc == 2);
    CHECK(snprintf(file,sizeof(file),"%s/native-é.db",argv[1]) > 0);
    CHECK(hwe_save_abi_version() == HWE_SAVE_ABI_VERSION);
    CHECK(hwe_save_view_size() == sizeof(view) && sizeof(reply) == 16);
    CHECK(strlen(hwe_save_sqlite_version()) > 0);
    CHECK(strcmp(hwe_save_status_name(HWE_SAVE_STALE_REVISION),"stale-revision") == 0);
    CHECK(strcmp(hwe_save_status_name(-1),"unknown-status") == 0);
    CHECK(hwe_save_create(999,&store).status == HWE_SAVE_ABI_MISMATCH && store == NULL);
    CHECK(hwe_save_create(1,NULL).status == HWE_SAVE_INVALID_ARGUMENT);
    CHECK(hwe_save_create(1,&store).status == HWE_SAVE_OK && store != NULL);
    CHECK(hwe_save_read(NULL,1,&view).status == HWE_SAVE_INVALID_ARGUMENT && view.crafting == NULL);
    CHECK(hwe_save_open(store,NULL,5,HWE_SAVE_WAL).status == HWE_SAVE_INVALID_ARGUMENT);
    CHECK(hwe_save_open(store,(const uint8_t *)file,HWE_SAVE_PATH_LIMIT+1,HWE_SAVE_WAL).status == HWE_SAVE_INVALID_PATH);
    CHECK(hwe_save_open(store,(const uint8_t *)file,(uint32_t)strlen(file),99).status == HWE_SAVE_INVALID_JOURNAL);
    reply = hwe_save_open(store,(const uint8_t *)file,(uint32_t)strlen(file),HWE_SAVE_WAL);
    CHECK(reply.status == HWE_SAVE_OK && reply.value == HWE_SAVE_WAL);
    reply = hwe_save_read(store,1,&view);
    CHECK(reply.status == HWE_SAVE_OK && reply.value == 0 && view.crafting == NULL && view.stash == NULL);
    CHECK(hwe_save_stage(store,1,UINT64_MAX,body,sizeof(body),stash,2).status == HWE_SAVE_INVALID_REVISION_OR_SLOT);
    CHECK(hwe_save_stage(store,1,0,NULL,2,stash,2).status == HWE_SAVE_INVALID_ARGUMENT);
    CHECK(hwe_save_stage(store,1,0,NULL,0,stash,2).status == HWE_SAVE_PAYLOAD_SIZE);
    CHECK(hwe_save_stage(store,1,0,body,HWE_SAVE_DOCUMENT_LIMIT+1,stash,2).status == HWE_SAVE_PAYLOAD_SIZE);
    for (size_t i = 0; i < sizeof(invalid)/sizeof(invalid[0]); ++i) {
        CHECK(hwe_save_stage(store,1,0,invalid[i].bytes,invalid[i].size,stash,2).status == HWE_SAVE_INVALID_UTF8);
    }
    reply = hwe_save_stage(store,1,0,body,sizeof(body),stash,2);
    CHECK(reply.status == HWE_SAVE_OK && reply.value > 0);
    CHECK(hwe_save_commit(store,UINT64_MAX).status == HWE_SAVE_INVALID_TOKEN);
    CHECK(hwe_save_commit(store,reply.value).status == HWE_SAVE_OK);
    reply = hwe_save_read(store,1,&view);
    CHECK(reply.status == HWE_SAVE_OK && reply.value == 1 && view.crafting_length == sizeof(body));
    CHECK(memcmp(view.crafting,body,sizeof(body)) == 0 && view.stash_length == 2 && memcmp(view.stash,stash,2) == 0);
    CHECK(hwe_save_stage(store,1,0,body,sizeof(body),stash,2).status == HWE_SAVE_STALE_REVISION);
    {
        uint8_t owned[] = {0xf0,0x90,0x80,0x80,0xf4,0x8f,0xbf,0xbf};
        const uint8_t expected[] = {0xf0,0x90,0x80,0x80,0xf4,0x8f,0xbf,0xbf};
        reply = hwe_save_submit(store,1,1,owned,sizeof(owned),stash,2);
        CHECK(reply.status == HWE_SAVE_OK);
        ticket = reply.value;
        memset(owned,'X',sizeof(owned));
        CHECK(hwe_save_submit(store,1,1,invalid[0].bytes,1,stash,2).status == HWE_SAVE_UNAVAILABLE);
        CHECK(hwe_save_poll(store,ticket+1).status == HWE_SAVE_INVALID_TICKET);
        CHECK(finish(store,ticket).status == HWE_SAVE_OK);
        CHECK(hwe_save_poll(store,ticket).status == HWE_SAVE_INVALID_TICKET);
        reply = hwe_save_read(store,1,&view);
        CHECK(reply.status == HWE_SAVE_OK && reply.value == 2 && view.crafting_length == sizeof(expected));
        CHECK(memcmp(view.crafting,expected,sizeof(expected)) == 0);
    }
    CHECK(hwe_save_cancel_async(store,UINT64_MAX).status == HWE_SAVE_INVALID_TICKET);
    CHECK(hwe_save_checkpoint(store,NULL,&copied).status == HWE_SAVE_INVALID_ARGUMENT && copied == -1);
    reply = hwe_save_checkpoint(store,&frames,&copied);
    CHECK(reply.status == HWE_SAVE_OK && reply.value == 1 && frames == copied);
    CHECK(hwe_save_close(store).status == HWE_SAVE_OK);
    CHECK(hwe_save_close(store).status == HWE_SAVE_OK);
    CHECK(hwe_save_open(store,(const uint8_t *)file,(uint32_t)strlen(file),HWE_SAVE_PRESERVE).status == HWE_SAVE_OK);
    reply = hwe_save_submit(store,1,2,body,sizeof(body),stash,2);
    CHECK(reply.status == HWE_SAVE_OK && reply.value > ticket);
    CHECK(finish(store,reply.value).status == HWE_SAVE_OK);
    CHECK(hwe_save_read(store,1,NULL).status == HWE_SAVE_INVALID_ARGUMENT);
    CHECK(hwe_save_close(store).status == HWE_SAVE_OK);
    CHECK(snprintf(file,sizeof(file),"%s/corrupt-utf8.db",argv[1]) > 0);
    CHECK(hwe_save_open(store,(const uint8_t *)file,(uint32_t)strlen(file),HWE_SAVE_PRESERVE).status == HWE_SAVE_OK);
    CHECK(hwe_save_read(store,1,&view).status == HWE_SAVE_INVALID_RECORD && view.crafting == NULL && view.stash == NULL);
    hwe_save_destroy(store);
    hwe_save_destroy(NULL);
    puts("{\"passed\":true,\"abi\":1,\"courses\":[\"C-linkage\",\"layout\",\"input-bounds\",\"UTF-8\",\"embedded-NUL-document\",\"opaque-bytes\",\"owned-async-input\",\"occupied-admission\",\"ticket-continuation\",\"malformed-stored-document\"]}");
    return 0;
}
