using System;
using System.Globalization;
using UnityEngine;

namespace HollowWake.Gameplay
{
    /// <summary>Share a world between actors to share immutable combat content.
    /// Unity owns targeting, projectile travel, effect application and the simulation clock.</summary>
    public sealed class CombatWorld : IDisposable
    {
        readonly GameplayHost host = GameplayHost.OpenCombat();
        bool closed;
        [Serializable] class Reply { public bool ok; public int handle; public string error, message, text; }
        [Serializable] class TextRequest { public int version = 1; public int handle; public string op, text; }
        static T Require<T>(string json) where T : Reply
        {
            var reply = JsonUtility.FromJson<T>(json);
            if (reply == null || !reply.ok) throw new InvalidOperationException("Hollow Wake combat refused: " + (reply?.message ?? reply?.error));
            return reply;
        }
        public Actor CreateActor(string configurationJson) => Open("createText", configurationJson);
        public Actor RestoreActor(string snapshotJson) => Open("restoreText", snapshotJson);
        Actor Open(string op, string body)
        {
            if (String.IsNullOrEmpty(body)) throw new ArgumentException("A complete SDK object is required", nameof(body));
            var reply = Require<Reply>(host.Execute(JsonUtility.ToJson(new TextRequest { op = op, text = body })));
            return new Actor(this, reply.handle);
        }
        public GameplayHost.Metrics ReadMetrics() => host.ReadMetrics();
        public GameplayHost.Traffic ReadTraffic() => host.ReadTraffic();
        public void Dispose() { host.Dispose(); closed = true; }

        [Serializable] public class Cast { public string kind, skillId, reason; public long token; }
        [Serializable] public class Frame { public Cast cast; public double raw, damage, targetLife; }
        [Serializable] public class Steps : Frame { public int steps; }
        [Serializable] public class Hit { public double damage, life; public bool crit; public int randomDraws; }
        [Serializable] class CastReply : Reply { public Cast value; }
        [Serializable] class FrameReply : Reply { public Frame value; }
        [Serializable] class StepsReply : Reply { public Steps value; }
        [Serializable] class HitReply : Reply { public Hit value; }
        [Serializable] class TextReply : Reply { public string value; }

        public sealed class Actor : IDisposable
        {
            readonly CombatWorld world;
            readonly int handle;
            readonly string prefix;
            bool closed;
            internal Actor(CombatWorld world, int handle)
            {
                this.world = world;
                this.handle = handle;
                prefix = "{\"version\":1,\"handle\":" + handle.ToString(CultureInfo.InvariantCulture);
            }
            string Send(string tail)
            {
                if (closed || world.closed || world.host.IsClosed) throw new ObjectDisposedException(nameof(Actor));
                return world.host.Execute(prefix + tail);
            }
            string Single(string command) => Send(",\"op\":\"command\",\"command\":" + command + "}");
            static string Number(double n)
            {
                if (Double.IsNaN(n) || Double.IsInfinity(n) || n < 0) throw new ArgumentOutOfRangeException(nameof(n));
                return n.ToString("R", CultureInfo.InvariantCulture);
            }
            public Cast Press() => Require<CastReply>(Single("{\"op\":\"press\"}")).value;
            static T ReadFrame<T>(T frame) where T : Frame
            {
                // Unity's field deserializer can instantiate an empty nested
                // object for a null JSON field. Preserve the SDK event boundary.
                if (frame.cast != null && String.IsNullOrEmpty(frame.cast.kind)) frame.cast = null;
                return frame;
            }
            public Frame Advance(double seconds) => ReadFrame(Require<FrameReply>(Single("{\"op\":\"advance\",\"dt\":" + Number(seconds) + "}")).value);
            /// <summary>Advance up to 64 known, input-free simulation ticks.
            /// Stops on cast completion or target death so the caller can act.</summary>
            public Steps AdvanceSteps(double stepSeconds, int steps)
            {
                if (steps < 1 || steps > 64) throw new ArgumentOutOfRangeException(nameof(steps));
                return ReadFrame(Require<StepsReply>(Send(",\"op\":\"advanceSteps\",\"dt\":" + Number(stepSeconds)
                    + ",\"steps\":" + steps.ToString(CultureInfo.InvariantCulture) + "}")).value);
            }
            public Hit ResolveContact() => Require<HitReply>(Single("{\"op\":\"hit\"}")).value;
            public string ApplyTimedDamage(double damagePerSecond) => Require<TextReply>(Single("{\"op\":\"applyDot\",\"dps\":" + Number(damagePerSecond) + "}")).value;
            public string ExecuteBatch(string commandsJson)
            {
                if (closed || world.closed) throw new ObjectDisposedException(nameof(Actor));
                return world.host.Execute(JsonUtility.ToJson(new TextRequest { op = "batchText", handle = handle, text = commandsJson }));
            }
            public string Save() => Require<Reply>(Send(",\"op\":\"snapshotText\"}")).text;
            public void Dispose()
            {
                if (closed) return;
                if (!world.closed && !world.host.IsClosed) Require<Reply>(Send(",\"op\":\"destroy\"}"));
                closed = true;
            }
        }
    }
}
