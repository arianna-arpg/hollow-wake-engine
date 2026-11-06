#include "HweRuntime.h"
#include "HweDigests.h"
#include "HollowWakeGameplaySubsystem.h"
#include "Interfaces/IPluginManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "HAL/PlatformFileManager.h"
THIRD_PARTY_INCLUDES_START
#include <openssl/sha.h>
THIRD_PARTY_INCLUDES_END

namespace
{
constexpr int32 MaxRequest = 1 << 20;
constexpr int32 MaxResponse = 4 << 20;

FString PluginFile(const TCHAR* Relative)
{
    const auto Plugin = IPluginManager::Get().FindPlugin(TEXT("HollowWakeGameplay"));
    return Plugin.IsValid() ? FPaths::ConvertRelativePathToFull(Plugin->GetBaseDir() / Relative) : FString();
}

bool ReadVerified(const FString& Path, const TCHAR* Expected, int64 MaxBytes, TArray<uint8>& Out, FString& Error)
{
    const int64 Size = IFileManager::Get().FileSize(*Path);
    if (Size > 0 && Size <= MaxBytes && FFileHelper::LoadFileToArray(Out, *Path) && Out.Num() == Size)
    {
        uint8 Hash[SHA256_DIGEST_LENGTH];
        SHA256(Out.GetData(), Out.Num(), Hash);
        if (BytesToHex(Hash, sizeof(Hash)).Equals(Expected, ESearchCase::IgnoreCase)) return true;
    }
    Error = TEXT("Missing, oversized or mismatched SDK file: ") + FPaths::GetCleanFilename(Path);
    return false;
}

FString Decode(const TArray<uint8>& Bytes)
{
    FUTF8ToTCHAR Converted(reinterpret_cast<const ANSICHAR*>(Bytes.GetData()), Bytes.Num());
    return FString(Converted.Length(), Converted.Get());
}

template<typename T>
T Export(void* Library, const TCHAR* Name)
{
    return reinterpret_cast<T>(FPlatformProcess::GetDllExport(Library, Name));
}
}

bool FHweRuntime::Open(bool bPouches, FString& Error)
{
    check(IsInGameThread() && !Library && !Host);
    const FString Dll = PluginFile(TEXT("ThirdParty/Win64/hwe_embedded.dll"));
    TArray<uint8> Bytes;
    if (!ReadVerified(Dll, HweDigests::Native, 16 << 20, Bytes, Error)) return false;
    Library = FPlatformProcess::GetDllHandle(*Dll);
    if (!Library) { Error = TEXT("Could not load the Hollow Wake runtime"); return false; }
    auto Layout = Export<decltype(&hwe_js_layout_v1)>(Library, TEXT("hwe_js_layout_v1"));
    auto Create = Export<decltype(&hwe_js_create_v1)>(Library, TEXT("hwe_js_create_v1"));
    Submit = Export<decltype(Submit)>(Library, TEXT("hwe_js_submit_v1"));
    Copy = Export<decltype(Copy)>(Library, TEXT("hwe_js_copy_response_v1"));
    Release = Export<decltype(Release)>(Library, TEXT("hwe_js_release_response_v1"));
    Destroy = Export<decltype(Destroy)>(Library, TEXT("hwe_js_destroy_v1"));
    Metrics = Export<decltype(Metrics)>(Library, TEXT("hwe_js_metrics_v1"));
    hwe_js_layout Abi{};
    if (!Layout || !Create || !Submit || !Copy || !Release || !Destroy || !Metrics || Layout(&Abi) != HWE_JS_OK ||
        Abi.abi_version != HWE_JS_ABI_VERSION || Abi.pointer_size != sizeof(void*) ||
        Abi.options_size != sizeof(hwe_js_options) || Abi.metrics_size != sizeof(hwe_js_metrics))
    {
        Error = TEXT("Incompatible Hollow Wake native ABI");
        return false;
    }
    TArray<uint8> Content;
    if (!ReadVerified(PluginFile(bPouches ? TEXT("Resources/SDK/PouchesRules.bin") : TEXT("Resources/SDK/CombatRules.bin")),
        bPouches ? HweDigests::PouchesRules : HweDigests::CombatRules, 16 << 20, Bytes, Error) ||
        !ReadVerified(PluginFile(bPouches ? TEXT("Resources/SDK/PouchesContent.bin") : TEXT("Resources/SDK/CombatContent.bin")),
        bPouches ? HweDigests::PouchesContent : HweDigests::CombatContent, 32 << 20, Content, Error)) return false;
    hwe_js_options Options{};
    Options.abi_version = HWE_JS_ABI_VERSION;
    Options.heap_limit_bytes = (bPouches ? 12ULL : 64ULL) << 20;
    Options.max_request_bytes = MaxRequest;
    Options.max_response_bytes = MaxResponse;
    Options.interrupt_polls = 1000000;
    int32 Status = Create(&Options, Bytes.GetData(), Bytes.Num(), Content.GetData(), Content.Num(), &Host);
    if (Status == HWE_JS_OK) return true;
    Error = FString::Printf(TEXT("Could not open Hollow Wake runtime (%d)"), Status);
    return false;
}

bool FHweRuntime::Execute(const FString& Request, FString& Reply, FString& Error)
{
    check(IsInGameThread() && Host);
    Reply.Reset();
    if (Request.IsEmpty() || Request.Len() > MaxRequest) { Error = TEXT("Invalid request size"); return false; }
    FTCHARToUTF8 Input(*Request, Request.Len());
    if (Input.Length() > MaxRequest) { Error = TEXT("Request exceeds the UTF-8 byte limit"); return false; }
    uint64_t Size = 0;
    int32 Status = Submit(Host, reinterpret_cast<const uint8*>(Input.Get()), Input.Length(), &Size);
    if (Status == HWE_JS_OK)
    {
        uint64_t Written = 0;
        Status = HWE_JS_LIMIT;
        if (Size > 0 && Size <= MaxResponse)
        {
            Scratch.SetNumUninitialized(static_cast<int32>(Size), false);
            Status = Copy(Host, Scratch.GetData(), Size, &Written);
        }
        const int32 Released = Release(Host);
        if (Status == HWE_JS_OK && Released == HWE_JS_OK && Written == Size)
        {
            Reply = Decode(Scratch);
            ++Delivered;
            WireBytes += Input.Length() + static_cast<int64>(Written);
            return true;
        }
        if (Status == HWE_JS_OK) Status = Released == HWE_JS_OK ? HWE_JS_INVALID_ARGUMENT : Released;
    }
    Error = FString::Printf(TEXT("Hollow Wake runtime refused the request (%d)"), Status);
    return false;
}

bool FHweRuntime::LoadSample(FString& Json, FString& Error)
{
    TArray<uint8> Bytes;
    if (!ReadVerified(PluginFile(TEXT("Resources/SDK/Magician.bin")), HweDigests::Magician, MaxRequest, Bytes, Error)) return false;
    Json = Decode(Bytes);
    return true;
}

bool FHweRuntime::ReadMetrics(FHollowWakeRuntimeMetrics& Out) const
{
    hwe_js_metrics Current{};
    if (!Host || Metrics(Host, &Current) != HWE_JS_OK) return false;
    Out.Delivered = Delivered;
    Out.WireBytes = WireBytes;
    Out.LiveBytes = Current.live_bytes;
    Out.PeakBytes = Current.peak_bytes;
    Out.Allocations = Current.allocations;
    return true;
}

bool FHweRuntime::Close()
{
    hwe_js_metrics Final{};
    const bool bClean = !Host || (Destroy(&Host, &Final) == HWE_JS_OK && !Final.live_bytes && !Final.live_blocks);
    if (Library) { FPlatformProcess::FreeDllHandle(Library); Library = nullptr; }
    return bClean;
}

FHweRuntime::~FHweRuntime()
{
    if (!Close()) UE_LOG(LogTemp, Error, TEXT("Hollow Wake runtime did not release all tracked memory"));
}
