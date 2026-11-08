#ifndef HWE_TEST_GROUP_C_H
#define HWE_TEST_GROUP_C_H
static void group_c_tests(const char *root) {
    char file[8192];
    hwe_save_store *store = NULL;
    hwe_save_group_info info;
    hwe_save_record_view rows[3];
    uint32_t ids[] = {20,99,10};
    uint8_t owned[] = {'a',0,'b',0xe2,0x82,0xac};
    const uint8_t expected[] = {'a',0,'b',0xe2,0x82,0xac};
    const uint8_t inventory[] = "inventory";
    const uint8_t stash[] = "{}";
    const uint8_t invalid[] = {0xff};
    hwe_save_record_write records[] = {
        {10,0,0,{owned,sizeof(owned),stash,2}},
        {20,0,0,{inventory,sizeof(inventory)-1,stash,2}}
    };
    CHECK(hwe_save_group_info_v1(NULL,sizeof(info)).status == HWE_SAVE_INVALID_ARGUMENT);
    CHECK(hwe_save_group_info_v1(&info,sizeof(info)-1).status == HWE_SAVE_ABI_MISMATCH);
    CHECK(hwe_save_group_info_v1(&info,sizeof(info)).status == HWE_SAVE_OK);
    CHECK(info.version == 1 && info.read_size == sizeof(rows[0]) && info.write_size == sizeof(records[0]));
    CHECK(info.record_limit == 8 && info.byte_limit == 4194304);
    CHECK(hwe_save_create(1,&store).status == HWE_SAVE_OK);
    CHECK(snprintf(file,sizeof(file),"%s/group-c.db",root) > 0);
    CHECK(hwe_save_open(store,(const uint8_t *)file,(uint32_t)strlen(file),HWE_SAVE_WAL).status == HWE_SAVE_OK);
    CHECK(hwe_save_read_group_v1(store,ids,3,rows).status == HWE_SAVE_OK);
    CHECK(rows[0].revision == 0 && rows[2].documents.crafting == NULL);
    CHECK(hwe_save_stage_group_v1(store,NULL,2).status == HWE_SAVE_INVALID_ARGUMENT);
    CHECK(hwe_save_stage_group_v1(store,records,0).status == HWE_SAVE_INVALID_ARGUMENT);
    CHECK(hwe_save_stage_group_v1(store,records,9).status == HWE_SAVE_INVALID_ARGUMENT);
    records[1].reserved = 1;
    CHECK(hwe_save_stage_group_v1(store,records,2).status == HWE_SAVE_INVALID_ARGUMENT);
    records[1].reserved = 0; records[1].slot = 10;
    CHECK(hwe_save_stage_group_v1(store,records,2).status == HWE_SAVE_INVALID_ARGUMENT);
    records[1].slot = 20; records[1].revision = UINT64_MAX;
    CHECK(hwe_save_stage_group_v1(store,records,2).status == HWE_SAVE_INVALID_REVISION_OR_SLOT);
    records[1].revision = 0; records[1].documents.crafting = invalid; records[1].documents.crafting_length = 1;
    CHECK(hwe_save_submit_group_v1(store,records,2).status == HWE_SAVE_INVALID_UTF8);
    CHECK(hwe_save_read_group_v1(store,ids,3,rows).status == HWE_SAVE_OK && rows[2].revision == 0);
    records[1].documents.crafting = inventory; records[1].documents.crafting_length = sizeof(inventory)-1;
    {
        hwe_save_result submitted = hwe_save_submit_group_v1(store,records,2);
        CHECK(submitted.status == HWE_SAVE_OK && submitted.value > 0);
        memset(owned,'X',sizeof(owned));
        records[1].documents.crafting = invalid; records[1].documents.crafting_length = 1;
        CHECK(hwe_save_submit_group_v1(store,records,2).status == HWE_SAVE_UNAVAILABLE);
        CHECK(finish(store,submitted.value).status == HWE_SAVE_OK);
    }
    CHECK(hwe_save_read_group_v1(store,ids,3,rows).status == HWE_SAVE_OK);
    CHECK(rows[0].revision == 1 && rows[0].documents.crafting_length == sizeof(inventory)-1);
    CHECK(memcmp(rows[0].documents.crafting,inventory,sizeof(inventory)-1) == 0);
    CHECK(rows[1].revision == 0 && rows[1].documents.crafting == NULL && rows[1].documents.stash == NULL);
    CHECK(rows[2].revision == 1 && rows[2].documents.crafting_length == sizeof(expected));
    CHECK(memcmp(rows[2].documents.crafting,expected,sizeof(expected)) == 0);
    {
        union { uint32_t slots[3]; hwe_save_record_view values[3]; } overlap;
        overlap.slots[0] = 20; overlap.slots[1] = 99; overlap.slots[2] = 10;
        CHECK(hwe_save_read_group_v1(store,overlap.slots,3,overlap.values).status == HWE_SAVE_OK);
        CHECK(overlap.values[0].revision == 1 && overlap.values[1].revision == 0 && overlap.values[2].revision == 1);
    }
    records[0].revision = 1;
    records[1].documents.crafting = inventory; records[1].documents.crafting_length = sizeof(inventory)-1;
    CHECK(hwe_save_stage_group_v1(store,records,2).status == HWE_SAVE_STALE_REVISION);
    CHECK(hwe_save_read_group_v1(store,ids,3,rows).status == HWE_SAVE_OK && rows[2].revision == 1 &&
        memcmp(rows[2].documents.crafting,expected,sizeof(expected)) == 0);
    {
        uint32_t duplicate[] = {10,10};
        memset(rows,0xff,sizeof(rows));
        CHECK(hwe_save_read_group_v1(store,duplicate,2,rows).status == HWE_SAVE_INVALID_ARGUMENT);
        CHECK(rows[0].revision == 0 && rows[1].documents.crafting == NULL);
        rows[0].revision = 77;
        CHECK(hwe_save_read_group_v1(store,ids,9,rows).status == HWE_SAVE_INVALID_ARGUMENT && rows[0].revision == 77);
        CHECK(hwe_save_read_group_v1(NULL,ids,3,rows).status == HWE_SAVE_INVALID_ARGUMENT && rows[0].revision == 0);
    }
    CHECK(hwe_save_close(store).status == HWE_SAVE_OK);
    CHECK(snprintf(file,sizeof(file),"%s/corrupt-utf8.db",root) > 0);
    CHECK(hwe_save_open(store,(const uint8_t *)file,(uint32_t)strlen(file),HWE_SAVE_PRESERVE).status == HWE_SAVE_OK);
    ids[0] = 0; ids[1] = 1;
    CHECK(hwe_save_read_group_v1(store,ids,2,rows).status == HWE_SAVE_INVALID_RECORD);
    CHECK(rows[0].revision == 0 && rows[1].revision == 0 && rows[1].documents.crafting == NULL);
    hwe_save_destroy(store);
}
#endif
