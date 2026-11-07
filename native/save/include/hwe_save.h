#ifndef HWE_SAVE_H
#define HWE_SAVE_H
#include <stdint.h>

#if defined(_WIN32) && defined(HWE_SAVE_SHARED)
# if defined(HWE_SAVE_BUILD)
#  define HWE_SAVE_API __declspec(dllexport)
# else
#  define HWE_SAVE_API __declspec(dllimport)
# endif
#elif defined(HWE_SAVE_SHARED) && defined(__GNUC__)
# define HWE_SAVE_API __attribute__((visibility("default")))
#else
# define HWE_SAVE_API
#endif
#ifdef __cplusplus
extern "C" {
#endif

#define HWE_SAVE_ABI_VERSION 1u
#define HWE_SAVE_DOCUMENT_LIMIT 524288u
#define HWE_SAVE_PATH_LIMIT 131072u
typedef struct hwe_save_store hwe_save_store;
typedef enum hwe_save_status {
    HWE_SAVE_OK = 0, HWE_SAVE_PENDING = 1,
    HWE_SAVE_UNAVAILABLE = 2, HWE_SAVE_BUSY = 3, HWE_SAVE_STORAGE = 4,
    HWE_SAVE_INVALID_PATH = 5, HWE_SAVE_INVALID_JOURNAL = 6,
    HWE_SAVE_JOURNAL_UNAVAILABLE = 7, HWE_SAVE_INCOMPATIBLE_DATABASE = 8,
    HWE_SAVE_INVALID_RECORD = 9, HWE_SAVE_INVALID_REVISION_OR_SLOT = 10,
    HWE_SAVE_PAYLOAD_SIZE = 11, HWE_SAVE_STALE_REVISION = 12,
    HWE_SAVE_INVALID_TOKEN = 13, HWE_SAVE_INVALID_TICKET = 14,
    HWE_SAVE_CANCELLED = 15, HWE_SAVE_TOO_LATE = 16,
    HWE_SAVE_WORKER_UNAVAILABLE = 17, HWE_SAVE_INVALID_ARGUMENT = 18,
    HWE_SAVE_INVALID_UTF8 = 19, HWE_SAVE_ABI_MISMATCH = 20,
    HWE_SAVE_OUT_OF_MEMORY = 21, HWE_SAVE_INTERNAL = 22
} hwe_save_status;
typedef enum hwe_save_journal {
    HWE_SAVE_PRESERVE = 0, HWE_SAVE_WAL = 1, HWE_SAVE_ROLLBACK = 2,
    HWE_SAVE_OTHER_JOURNAL = 3
} hwe_save_journal;
typedef struct hwe_save_result {
    int32_t status;
    int32_t sqlite_code;
    uint64_t value;
} hwe_save_result;
typedef struct hwe_save_view {
    const uint8_t *crafting;
    uint32_t crafting_length;
    const uint8_t *stash;
    uint32_t stash_length;
} hwe_save_view;

/* One host owner serializes calls on each live handle. Independent handles may
 * be used concurrently. The internal writer never calls host code. Pointer
 * arguments must identify readable/writable buffers of the declared length.
 * Input bytes are consumed or copied before return; no input pointer is retained.
 * Only destroy accepts NULL as a successful no-op. Destroyed handles cannot be
 * used again. Close is repeatable and preserves monotonically increasing IDs. */
HWE_SAVE_API uint32_t hwe_save_abi_version(void);
HWE_SAVE_API uint32_t hwe_save_view_size(void);
HWE_SAVE_API const char *hwe_save_sqlite_version(void);
HWE_SAVE_API const char *hwe_save_status_name(int32_t status);
HWE_SAVE_API hwe_save_result hwe_save_create(uint32_t abi, hwe_save_store **out);
HWE_SAVE_API void hwe_save_destroy(hwe_save_store *store);
/* Success value is the actual journal enum. UTF-8 path must be absolute,
 * contain no NUL, and identify local storage. URI paths are refused. */
HWE_SAVE_API hwe_save_result hwe_save_open(hwe_save_store *, const uint8_t *path, uint32_t length, int32_t journal);
HWE_SAVE_API hwe_save_result hwe_save_close(hwe_save_store *);
/* Success value is the revision. Empty slots return zero and empty views.
 * Views remain owned by the handle until its next read, close or destruction,
 * including a failed read. Copy them before another call by the host owner. */
HWE_SAVE_API hwe_save_result hwe_save_read(hwe_save_store *, uint32_t slot, hwe_save_view *out);
/* Documents are opaque UTF-8. The host validates their gameplay/JSON meaning.
 * Success value is the staged transaction token or asynchronous ticket. */
HWE_SAVE_API hwe_save_result hwe_save_stage(hwe_save_store *, uint32_t slot, uint64_t revision,
    const uint8_t *crafting, uint32_t crafting_length, const uint8_t *stash, uint32_t stash_length);
HWE_SAVE_API hwe_save_result hwe_save_commit(hwe_save_store *, uint64_t token);
HWE_SAVE_API hwe_save_result hwe_save_cancel(hwe_save_store *, uint64_t token);
HWE_SAVE_API hwe_save_result hwe_save_submit(hwe_save_store *, uint32_t slot, uint64_t revision,
    const uint8_t *crafting, uint32_t crafting_length, const uint8_t *stash, uint32_t stash_length);
HWE_SAVE_API hwe_save_result hwe_save_poll(hwe_save_store *, uint64_t ticket);
HWE_SAVE_API hwe_save_result hwe_save_cancel_async(hwe_save_store *, uint64_t ticket);
/* Success value is one only when the checkpoint reports complete. */
HWE_SAVE_API hwe_save_result hwe_save_checkpoint(hwe_save_store *, int32_t *frames, int32_t *copied);

#ifdef __cplusplus
}
#endif
#endif
