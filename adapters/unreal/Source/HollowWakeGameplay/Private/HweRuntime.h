#pragma once

#include "CoreMinimal.h"
#include "hwe_embedded.h"

// One game-thread owner per world and capability. A failed submit is never replayed.
class FHweRuntime final
{
public:
    FHweRuntime() = default;
    FHweRuntime(const FHweRuntime&) = delete;
    FHweRuntime& operator=(const FHweRuntime&) = delete;
    ~FHweRuntime();
    bool Open(bool bPouches, FString& Error);
    bool Execute(const FString& Request, FString& Reply, FString& Error);
    static bool LoadSample(FString& Json, FString& Error);
    bool ReadMetrics(struct FHollowWakeRuntimeMetrics& Out) const;
    bool Close();

private:
    void* Library = nullptr;
    hwe_js_host* Host = nullptr;
    decltype(&hwe_js_submit_v1) Submit = nullptr;
    decltype(&hwe_js_copy_response_v1) Copy = nullptr;
    decltype(&hwe_js_release_response_v1) Release = nullptr;
    decltype(&hwe_js_destroy_v1) Destroy = nullptr;
    decltype(&hwe_js_metrics_v1) Metrics = nullptr;
    int64 Delivered = 0;
    int64 WireBytes = 0;
    TArray<uint8> Scratch;
};
