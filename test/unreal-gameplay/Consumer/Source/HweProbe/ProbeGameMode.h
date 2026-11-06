#pragma once
#include "GameFramework/GameModeBase.h"
#include "ProbeGameMode.generated.h"

UCLASS()
class AProbeGameMode : public AGameModeBase
{
    GENERATED_BODY()
    virtual void StartPlay() override;
};
