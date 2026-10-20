using System;
using System.Runtime.InteropServices;

namespace HollowWake.Experimental
{
    [StructLayout(LayoutKind.Sequential, Pack = 8)]
    public struct Resources { public double Mana, Life; }
    [StructLayout(LayoutKind.Sequential, Pack = 8)]
    public struct CastState { public double Elapsed, Total; }
    [StructLayout(LayoutKind.Sequential, Pack = 8)]
    public struct DotState { public double Remaining, Dps, Stacks; }

    // Reusable, pinned arrays; no marshalled arrays or per-element foreign calls.
    // The caller removes completed/expired entries before the next frame.
    public static unsafe class Lifecycle
    {
        [StructLayout(LayoutKind.Sequential)]
        private struct Layout { public uint Version, ResourcesSize, CastSize, DotSize; }
        private const string Library = "hwe_lifecycle";
        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)]
        private static extern int hwe_get_layout_v1(out Layout layout);
        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)]
        private static extern int hwe_can_pay_v1(ref Resources resources, ref Resources cost, out uint result);
        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)]
        private static extern int hwe_pay_v1(ref Resources resources, ref Resources cost);
        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)]
        private static extern int hwe_cast_duration_v1(double useTime, out double duration);
        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)]
        private static extern int hwe_advance_casts_v1(CastState* states, uint count, double dt, uint* completed);
        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)]
        private static extern int hwe_advance_cooldowns_v1(double* remaining, double* rates, uint count, double dt);
        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)]
        private static extern int hwe_replace_dot_v1(ref DotState state, double dps, double duration, out uint replaced);
        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)]
        private static extern int hwe_advance_dots_v1(DotState* states, uint count, double dt, double* damage);

        static Lifecycle()
        {
            Check(hwe_get_layout_v1(out Layout layout));
            if (layout.Version != 0x00010000 || layout.ResourcesSize != Marshal.SizeOf<Resources>() ||
                layout.CastSize != Marshal.SizeOf<CastState>() || layout.DotSize != Marshal.SizeOf<DotState>() ||
                Marshal.OffsetOf<Resources>(nameof(Resources.Life)).ToInt64() != 8 ||
                Marshal.OffsetOf<CastState>(nameof(CastState.Total)).ToInt64() != 8 ||
                Marshal.OffsetOf<DotState>(nameof(DotState.Stacks)).ToInt64() != 16)
                throw new InvalidOperationException("Incompatible native lifecycle ABI");
        }
        private static void Check(int status)
        {
            if (status != 0) throw new InvalidOperationException("Native lifecycle rejected operation: " + status);
        }
        private static void Count<T, U>(T[] a, U[] b, int count)
        {
            if (a == null || b == null) throw new ArgumentNullException();
            if (count < 0 || count > a.Length || count > b.Length) throw new ArgumentOutOfRangeException(nameof(count));
        }
        public static bool CanPay(Resources resources, Resources cost)
        {
            Check(hwe_can_pay_v1(ref resources, ref cost, out uint result)); return result != 0;
        }
        public static bool TryPay(ref Resources resources, Resources cost)
        {
            int status = hwe_pay_v1(ref resources, ref cost);
            if (status == 3) return false;
            Check(status); return true;
        }
        public static double CastDuration(double useTime)
        {
            Check(hwe_cast_duration_v1(useTime, out double result)); return result;
        }
        public static void AdvanceCasts(CastState[] states, double dt, uint[] completed, int count)
        {
            Count(states, completed, count);
            fixed (CastState* s = states) fixed (uint* c = completed) Check(hwe_advance_casts_v1(s, (uint)count, dt, c));
        }
        public static void AdvanceCooldowns(double[] remaining, double[] rates, double dt, int count)
        {
            Count(remaining, rates, count);
            fixed (double* r = remaining) fixed (double* c = rates) Check(hwe_advance_cooldowns_v1(r, c, (uint)count, dt));
        }
        public static bool ReplaceStrongerDot(ref DotState state, double dps, double duration)
        {
            Check(hwe_replace_dot_v1(ref state, dps, duration, out uint result)); return result != 0;
        }
        public static void AdvanceDots(DotState[] states, double dt, double[] damage, int count)
        {
            Count(states, damage, count);
            fixed (DotState* s = states) fixed (double* d = damage) Check(hwe_advance_dots_v1(s, (uint)count, dt, d));
        }
    }
}
