#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "HollowWakeGameplaySubsystem.generated.h"

class FHweRuntime;
class UHollowWakeGameplaySubsystem;

// Native allocator and UTF-8 transport counters for game-thread profiling.
struct HOLLOWWAKEGAMEPLAY_API FHollowWakeRuntimeMetrics
{
    int64 Delivered = 0;
    int64 WireBytes = 0;
    int64 LiveBytes = 0;
    int64 PeakBytes = 0;
    int64 Allocations = 0;
};

USTRUCT(BlueprintType)
struct HOLLOWWAKEGAMEPLAY_API FHollowWakeActor
{
    GENERATED_BODY()
private:
    friend class UHollowWakeGameplaySubsystem;
    UPROPERTY(Transient) TWeakObjectPtr<UHollowWakeGameplaySubsystem> World;
    UPROPERTY(Transient) int64 Id = 0;
};

USTRUCT(BlueprintType)
struct HOLLOWWAKEGAMEPLAY_API FHollowWakeCast
{
    GENERATED_BODY()
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Hollow Wake") FString Kind;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Hollow Wake") FString SkillId;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Hollow Wake") FString Reason;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Hollow Wake") int64 Token = 0;
};

USTRUCT(BlueprintType)
struct HOLLOWWAKEGAMEPLAY_API FHollowWakeFrame
{
    GENERATED_BODY()
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Hollow Wake") int32 Steps = 0;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Hollow Wake") double Damage = 0;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Hollow Wake") double TargetLife = 0;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Hollow Wake") bool bHasCast = false;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Hollow Wake") FHollowWakeCast Cast;
};

USTRUCT(BlueprintType)
struct HOLLOWWAKEGAMEPLAY_API FHollowWakeHit
{
    GENERATED_BODY()
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Hollow Wake") double Damage = 0;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Hollow Wake") double Life = 0;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category="Hollow Wake") bool bCritical = false;
};

USTRUCT(BlueprintType)
struct HOLLOWWAKEGAMEPLAY_API FHollowWakePouch
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Hollow Wake") FString InventoryJson;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Hollow Wake") FString MemoryJson;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Hollow Wake") int64 ItemUid = 0;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Hollow Wake") int32 Level = 1;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="Hollow Wake") bool bSealed = false;
};

/** World-local gameplay rules. The game supplies simulation time, input and confirmed contact. */
UCLASS(BlueprintType)
class HOLLOWWAKEGAMEPLAY_API UHollowWakeGameplaySubsystem : public UWorldSubsystem
{
    GENERATED_BODY()
public:
    UFUNCTION(BlueprintCallable, Category="Hollow Wake|Combat")
    bool CreateActor(const FString& ConfigurationJson, FHollowWakeActor& Actor, FString& Error);
    UFUNCTION(BlueprintCallable, Category="Hollow Wake|Combat")
    bool RestoreActor(const FString& SnapshotJson, FHollowWakeActor& Actor, FString& Error);
    UFUNCTION(BlueprintCallable, Category="Hollow Wake|Combat")
    bool SaveActor(FHollowWakeActor Actor, FString& SnapshotJson, FString& Error);
    UFUNCTION(BlueprintCallable, Category="Hollow Wake|Combat")
    bool ReleaseActor(FHollowWakeActor Actor, FString& Error);
    UFUNCTION(BlueprintCallable, Category="Hollow Wake|Combat")
    bool Press(FHollowWakeActor Actor, FHollowWakeCast& Cast, FString& Error);
    /** Advance one to 64 input-free fixed steps. Stops on a cast event or target death. */
    UFUNCTION(BlueprintCallable, Category="Hollow Wake|Combat")
    bool Advance(FHollowWakeActor Actor, double StepSeconds, int32 Steps, FHollowWakeFrame& Frame, FString& Error);
    UFUNCTION(BlueprintCallable, Category="Hollow Wake|Combat")
    bool ResolveContact(FHollowWakeActor Actor, FHollowWakeHit& Hit, FString& Error);
    UFUNCTION(BlueprintCallable, Category="Hollow Wake|Combat")
    bool ApplyTimedDamage(FHollowWakeActor Actor, double DamagePerSecond, FString& Result, FString& Error);
    UFUNCTION(BlueprintCallable, Category="Hollow Wake|Inventory")
    bool InspectPouch(const FHollowWakePouch& Context, FString& PreviewJson, FString& Error);
    /** Returns proposed inventory, ledger and memory. The game commits these together after checking its inventory revision. */
    UFUNCTION(BlueprintCallable, Category="Hollow Wake|Inventory")
    bool RecallPouch(const FHollowWakePouch& Context, const FString& Group, const FString& Facet, int64 NextUid, FString& ProposalJson, FString& Error);
    UFUNCTION(BlueprintCallable, Category="Hollow Wake|Sample")
    bool LoadMagicianConfiguration(FString& ConfigurationJson, FString& Error);

    // Trusted C++ protocol entry points. Success means a delivered reply, including SDK refusals.
    bool ExecuteCombat(const FString& RequestJson, FString& ReplyJson, FString& Error);
    bool ExecutePouches(const FString& RequestJson, FString& ReplyJson, FString& Error);
    bool ReadRuntimeMetrics(bool bPouches, FHollowWakeRuntimeMetrics& Out) const;
    virtual void Deinitialize() override;

private:
    bool OpenActor(const TCHAR* Op, const FString& Text, FHollowWakeActor& Actor, FString& Error);
    bool ActorReply(FHollowWakeActor Actor, const FString& Tail, TSharedPtr<class FJsonObject>& Reply, FString& Error);
    bool Execute(bool bPouches, const FString& Request, FString& Reply, FString& Error);
    TSharedPtr<FHweRuntime> CombatRuntime;
    TSharedPtr<FHweRuntime> PouchRuntime;
    bool bClosed = false;
};
