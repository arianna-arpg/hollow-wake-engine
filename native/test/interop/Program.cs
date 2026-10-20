using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.Json;
using HollowWake.Experimental;

internal static class Program
{
    private static int comparisons, numeric, bitExact;
    private static double D(JsonElement node, string name) => node.GetProperty(name).GetDouble();
    private static string S(JsonElement node, string name) => node.GetProperty(name).GetString();
    private static void Assert(bool value, string message) { if (!value) throw new Exception(message); }
    private static void Equal(JsonElement actual, JsonElement expected, string at)
    {
        Assert(actual.ValueKind == expected.ValueKind, "Kind mismatch: " + at);
        if (actual.ValueKind == JsonValueKind.Number)
        {
            double a = actual.GetDouble(), e = expected.GetDouble(); numeric++;
            if (BitConverter.DoubleToInt64Bits(a) == BitConverter.DoubleToInt64Bits(e)) bitExact++;
            Assert(double.IsFinite(a) && Math.Abs(a - e) <= 1e-12 * Math.Max(1, Math.Max(Math.Abs(a), Math.Abs(e))), "Numeric mismatch: " + at);
        }
        else if (actual.ValueKind == JsonValueKind.Object)
        {
            Assert(actual.EnumerateObject().Count() == expected.EnumerateObject().Count(), "Field count: " + at);
            foreach (var p in expected.EnumerateObject()) Equal(actual.GetProperty(p.Name), p.Value, at + "." + p.Name);
        }
        else if (actual.ValueKind == JsonValueKind.Array)
        {
            Assert(actual.GetArrayLength() == expected.GetArrayLength(), "Length: " + at);
            for (int i = 0; i < expected.GetArrayLength(); i++) Equal(actual[i], expected[i], at + "[" + i + "]");
        }
        else Assert(actual.GetRawText() == expected.GetRawText(), "Value mismatch: " + at);
    }
    private static void Compare(object actual, JsonElement expected, string at)
    {
        Equal(JsonSerializer.SerializeToElement(actual), expected, at); comparisons++;
    }
    private static object CastValue(CastState s) => new { elapsed = s.Elapsed, total = s.Total };
    private static object DotValue(DotState s) => new { remaining = s.Remaining, dps = s.Dps, stacks = s.Stacks };
    private static void Original(JsonElement fixture)
    {
        foreach (var scenario in fixture.GetProperty("casting").EnumerateArray())
        {
            var initial = scenario.GetProperty("initial");
            var resources = new Resources { Mana = D(initial, "mana"), Life = D(initial, "life") };
            double recovery = 0, rate = 1;
            int executed = 0;
            bool active = false;
            JsonElement profile = default;
            var clocks = new Dictionary<string, double>();
            var cast = new CastState[1]; var completed = new uint[1];
            foreach (var step in scenario.GetProperty("steps").EnumerateArray())
            {
                var command = step.GetProperty("command"); string type = S(command, "type");
                if (type == "press")
                {
                    var next = step.GetProperty("profile"); var c = next.GetProperty("cost");
                    var cost = new Resources { Mana = D(c, "mana"), Life = D(c, "life") };
                    bool accepted = resources.Life > 0 && !step.GetProperty("stunned").GetBoolean() && !active &&
                        recovery <= 0 && !clocks.ContainsKey(S(next, "skillId")) && Lifecycle.CanPay(resources, cost);
                    Assert(accepted == step.GetProperty("accepted").GetBoolean(), "Original press acceptance");
                    if (accepted)
                    {
                        Assert(Lifecycle.TryPay(ref resources, cost), "Payment after valid quote");
                        profile = next; cast[0] = new CastState { Total = Lifecycle.CastDuration(D(profile, "useTime")) };
                        if (S(profile, "cooldownAt") == "press" && D(profile, "cooldown") > 0) clocks[S(profile, "skillId")] = D(profile, "cooldown");
                        active = cast[0].Total > 0;
                        if (!active)
                        {
                            executed++; recovery = .12;
                            if (S(profile, "cooldownAt") == "completion" && D(profile, "cooldown") > 0) clocks[S(profile, "skillId")] = D(profile, "cooldown");
                        }
                    }
                }
                else if (type == "tick")
                {
                    double dt = D(command, "dt");
                    var keys = clocks.Keys.ToArray(); var remaining = keys.Select(k => clocks[k]).ToArray();
                    Lifecycle.AdvanceCooldowns(remaining, Enumerable.Repeat(rate, keys.Length).ToArray(), dt, keys.Length);
                    for (int i = 0; i < keys.Length; i++) { if (remaining[i] <= 0) clocks.Remove(keys[i]); else clocks[keys[i]] = remaining[i]; }
                    if (recovery > 0) recovery -= dt;
                    if (resources.Life <= 0 || step.GetProperty("stunned").GetBoolean()) active = false;
                    if (active)
                    {
                        Lifecycle.AdvanceCasts(cast, dt, completed, 1);
                        if (completed[0] != 0)
                        {
                            active = false; executed++; recovery = .1;
                            if (S(profile, "cooldownAt") == "completion" && D(step, "completionCooldown") > 0) clocks[S(profile, "skillId")] = D(step, "completionCooldown");
                        }
                    }
                }
                else if (type == "resources") resources = new Resources { Mana = D(command, "mana"), Life = D(command, "life") };
                else if (type == "rate") rate = D(command, "value");
                else if (type == "cancel") active = false;
                Compare(new { mana = resources.Mana, life = resources.Life, recovery, active = active ? CastValue(cast[0]) : null,
                    cooldowns = clocks.Select(p => new object[] { p.Key, p.Value }).ToArray(), executed, projectiles = executed },
                    step.GetProperty("expected"), S(scenario, "name") + "/" + type);
            }
        }
        foreach (var scenario in fixture.GetProperty("dots").EnumerateArray())
        {
            double life = 1000, expiry = 1; bool active = false; string source = null;
            var dot = new DotState[1]; var damage = new double[1];
            foreach (var step in scenario.GetProperty("steps").EnumerateArray())
            {
                var command = step.GetProperty("command"); string type = S(command, "type"); double raw = 0;
                if (type == "apply")
                {
                    double duration = 4 * (command.TryGetProperty("scale", out var scale) ? scale.GetDouble() : 1) / expiry;
                    string incoming = command.TryGetProperty("sourceId", out var id) ? id.GetString() : null;
                    if (!active) { dot[0] = new DotState { Remaining = duration, Dps = D(command, "dps"), Stacks = 1 }; active = true; source = incoming; }
                    else { Lifecycle.ReplaceStrongerDot(ref dot[0], D(command, "dps"), duration); source = source ?? incoming; }
                }
                else if (type == "expiry") expiry = D(command, "value");
                else if (active) { Lifecycle.AdvanceDots(dot, D(command, "dt"), damage, 1); raw = damage[0]; if (dot[0].Remaining <= 0) active = false; }
                double taken = raw * D(scenario, "taken"); life -= taken;
                Compare(new { raw, damage = taken, life, active = active ? new { remaining = dot[0].Remaining, dps = dot[0].Dps, sourceId = source } : null },
                    step.GetProperty("expected"), "Original Burning/" + type);
            }
        }
    }
    private static void Vectors(JsonElement vectors)
    {
        foreach (var v in vectors.EnumerateArray())
        {
            object result;
            switch (S(v, "op"))
            {
                case "payment":
                    var resource = new Resources { Mana = D(v, "mana"), Life = D(v, "life") };
                    var cost = new Resources { Mana = D(v, "manaCost"), Life = D(v, "lifeCost") };
                    bool can = Lifecycle.CanPay(resource, cost), paid = Lifecycle.TryPay(ref resource, cost);
                    result = new { can, paid, mana = resource.Mana, life = resource.Life }; break;
                case "duration": result = Lifecycle.CastDuration(D(v, "useTime")); break;
                case "cast":
                    var states = v.GetProperty("states").EnumerateArray().Select(s => new CastState { Elapsed = D(s, "elapsed"), Total = D(s, "total") }).ToArray();
                    var completed = new uint[states.Length]; Lifecycle.AdvanceCasts(states, D(v, "dt"), completed, states.Length);
                    result = new { states = states.Select(CastValue).ToArray(), completed = completed.Select(c => c != 0).ToArray() }; break;
                case "cooldown":
                    var left = v.GetProperty("remaining").EnumerateArray().Select(n => n.GetDouble()).ToArray();
                    var rates = v.GetProperty("rates").EnumerateArray().Select(n => n.GetDouble()).ToArray();
                    Lifecycle.AdvanceCooldowns(left, rates, D(v, "dt"), left.Length); result = left; break;
                case "replace":
                    var s = v.GetProperty("state"); var dot = new DotState { Remaining = D(s, "remaining"), Dps = D(s, "dps"), Stacks = D(s, "stacks") };
                    bool replaced = Lifecycle.ReplaceStrongerDot(ref dot, D(v, "dps"), D(v, "duration"));
                    result = new { state = DotValue(dot), replaced }; break;
                case "dot":
                    var dots = v.GetProperty("states").EnumerateArray().Select(s => new DotState { Remaining = D(s, "remaining"), Dps = D(s, "dps"), Stacks = D(s, "stacks") }).ToArray();
                    var damage = new double[dots.Length]; Lifecycle.AdvanceDots(dots, D(v, "dt"), damage, dots.Length);
                    result = new { states = dots.Select(DotValue).ToArray(), damage }; break;
                default: throw new Exception("Unknown vector operation");
            }
            Compare(result, v.GetProperty("expected"), "Vector/" + S(v, "op"));
        }
    }
    private static void ManagedContracts()
    {
        var cast = new CastState[2]; var complete = new uint[] { 73, 74 };
        cast[1].Total = double.NaN;
        bool failed = false;
        try { Lifecycle.AdvanceCasts(cast, .1, complete, 2); } catch (InvalidOperationException) { failed = true; }
        Assert(failed && cast[0].Elapsed == 0 && complete[0] == 73 && complete[1] == 74, "Managed invalid batch must be atomic");
        failed = false;
        try { Lifecycle.AdvanceCasts(cast, .1, complete, 3); } catch (ArgumentOutOfRangeException) { failed = true; }
        Assert(failed && cast[0].Elapsed == 0, "Managed bounds must precede native call");
        cast[1].Total = 1;
        var dots = new DotState[256]; var damage = new double[256]; var left = new double[256]; var rates = new double[256];
        for (int i = 0; i < dots.Length; i++) { dots[i] = new DotState { Dps = 10, Stacks = 1, Remaining = 1 }; rates[i] = 1; }
        for (int i = 0; i < 1000; i++) { Lifecycle.AdvanceDots(dots, .01, damage, 256); Lifecycle.AdvanceCooldowns(left, rates, .01, 256); Lifecycle.AdvanceCasts(cast, .01, complete, 2); }
        long before = GC.GetAllocatedBytesForCurrentThread();
        for (int i = 0; i < 10000; i++) { Lifecycle.AdvanceDots(dots, .01, damage, 256); Lifecycle.AdvanceCooldowns(left, rates, .01, 256); Lifecycle.AdvanceCasts(cast, .01, complete, 2); }
        long allocated = GC.GetAllocatedBytesForCurrentThread() - before;
        Assert(allocated == 0, "Warmed managed batch loop allocated " + allocated + " bytes");
    }
    private static void Execute(string[] args)
    {
        NativeLibrary.SetDllImportResolver(typeof(Lifecycle).Assembly, (name, assembly, paths) => name == "hwe_lifecycle" ? NativeLibrary.Load(Path.GetFullPath(args[0])) : IntPtr.Zero);
        using var fixture = JsonDocument.Parse(File.ReadAllText(args[1]));
        using var vectors = JsonDocument.Parse(File.ReadAllText(args[2]));
        Original(fixture.RootElement); Vectors(vectors.RootElement); ManagedContracts();
        Console.WriteLine(JsonSerializer.Serialize(new { comparisons, numeric, bitExact, warmedManagedAllocationBytes = 0,
            scope = "Seven native lifecycle leaves; caller orchestrates casting, expiry, routing and attribution" }));
    }
    private static void Main(string[] args)
    {
        try { Execute(args); }
        catch (Exception error) { Console.Error.WriteLine(error.Message); Environment.ExitCode = 1; }
    }
}
