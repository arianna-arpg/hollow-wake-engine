using UnrealBuildTool;

public class HweProbe : ModuleRules
{
    public HweProbe(ReadOnlyTargetRules target) : base(target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
        PrivateDependencyModuleNames.AddRange(new[] { "Core", "CoreUObject", "Engine", "Json", "HollowWakeGameplay" });
        if (target.bBuildEditor) PrivateDependencyModuleNames.Add("UnrealEd");
    }
}
