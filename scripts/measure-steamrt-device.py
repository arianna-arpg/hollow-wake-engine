"""Measure the two verified headless Godot exports on a Linux x86_64 target."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import signal
import subprocess
import sys
import time


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def digest(file):
    sha = hashlib.sha256()
    with file.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            sha.update(block)
    return sha.hexdigest()


def gameplay(stats):
    return {k: v for k, v in stats.items() if not k.endswith("metrics")}


def check_export(bundle, name, expected):
    game = bundle / name
    names = {name + ".x86_64", name + ".pck", "libhwe_godot.so", "libhwe_embedded.so"}
    require(not game.is_symlink() and {f.name for f in game.iterdir()} == names, "unexpected game layout")
    require(set(expected) == names, "unexpected file inventory")
    for name, value in expected.items():
        file = game / name
        require(file.is_file() and not file.is_symlink() and digest(file) == value, f"changed export: {name}")


def timed_out(_signal, _frame):
    raise TimeoutError("export exceeded the five-minute sample limit")


def observe(name, bundle, directory, baseline):
    directory.mkdir()
    env = os.environ.copy()
    for key in ("LD_PRELOAD", "LD_AUDIT", "LD_DEBUG", "LD_DEBUG_OUTPUT", "HWE_GODOT_OBSERVATIONS"):
        env.pop(key, None)
    # Preserve the selected Steam runtime's own library search environment.
    # Each run owns its save/config/cache directories and its observation file.
    for key in ("HOME", "XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME"):
        env[key] = str(directory / key)
        (directory / key).mkdir()
    replies = directory / "replies.jsonl"
    if name == "crafting":
        env["HWE_GODOT_OBSERVATIONS"] = str(replies)
    game = bundle / name
    inherited_search = env.get("LD_LIBRARY_PATH", "")
    env["LD_LIBRARY_PATH"] = str(game) + (os.pathsep + inherited_search if inherited_search else "")
    command = [str(game / (name + ".x86_64")), "--headless", "--quit-after", "16",
               "--log-file", str(directory / "engine.log")]
    log = directory / "console.txt"
    with log.open("xb") as output:
        start = time.monotonic_ns()
        child = subprocess.Popen(command, cwd=game, env=env, stdin=subprocess.DEVNULL,
                                 stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        previous_handler = signal.signal(signal.SIGALRM, timed_out)
        try:
            signal.alarm(300)
            _, status, usage = os.wait4(child.pid, 0)
            elapsed = time.monotonic_ns() - start
            child.returncode = os.waitstatus_to_exitcode(status)
        except BaseException:
            if child.returncode is None:
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                child.wait()
            raise
        finally:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, previous_handler)
    require(child.returncode == 0, f"{name} exited with {child.returncode}; see {log}")
    text = log.read_text(encoding="utf-8")
    require(not re.search(r"ERROR:|SCRIPT ERROR|WARNING:.*(?:leak|ObjectDB)", text, re.I), "engine diagnostic")
    lines = [line for line in text.splitlines() if line.startswith("{")]
    require(len(lines) == 1, "expected one final game report")
    stats = json.loads(lines[0])
    require(gameplay(stats) == gameplay(baseline["stats"]), "gameplay differs from verified export")
    peaks = {}
    for key, value in stats.items():
        if key.endswith("metrics"):
            require(value["status"] == 0 and value["closed"] and not value["poisoned"]
                    and not value["delivery_failed"] and not value["response_pending"], "native host failed")
            require(value["live_bytes"] == value["live_blocks"] == 0, "tracked memory retained")
            require(0 < value["peak_bytes"] <= 32 * 1024 * 1024, "native heap cap exceeded")
            peaks[key] = value["peak_bytes"]
    require(set(peaks) == {k for k in baseline["stats"] if k.endswith("metrics")}, "missing native metrics")
    observation_hash = None
    if name == "crafting":
        observation_hash = digest(replies)
        require(observation_hash == baseline["observations"]["sha256"], "crafting replies differ")
    return {"workload": name, "wallNs": elapsed, "userCpuUs": round(usage.ru_utime * 1e6),
            "kernelCpuUs": round(usage.ru_stime * 1e6), "processPeakRssKiB": usage.ru_maxrss,
            "trackedPeakBytes": peaks, "assertions": stats["assertions"], "repliesSha256": observation_hash}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--platform-proof", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--label", required=True, help="Device or container name for this run")
    parser.add_argument("--conditions", default="", help="Power profile, launch environment and other test conditions")
    parser.add_argument("--warmups", type=int, choices=range(4), default=1)
    parser.add_argument("--samples", type=int, choices=range(1, 16), default=5)
    args = parser.parse_args()
    require(sys.platform == "linux" and platform.machine() == "x86_64", "Linux x86_64 required")
    require(0 < len(args.label.strip()) <= 120 and len(args.conditions) <= 512, "invalid measurement label")
    bundle = args.bundle.resolve(strict=True)
    sdk_file = bundle / "sdk.json"
    sdk = json.loads(sdk_file.read_bytes())
    proof = json.loads(args.platform_proof.read_bytes())
    require(sdk["passed"] and proof["passed"] and digest(sdk_file) == proof["sdkProofSha256"], "unmatched proofs")
    require(sdk["archiveSha256"] == proof["archiveSha256"], "package identity differs")
    names = ["crafting", "progression"]
    require(set(proof["replays"]) == set(names), "incomplete Platform proof")
    for name in names:
        require(sdk["exports"][name]["files"] == proof["replays"][name]["exportedFiles"], "export identity differs")
        check_export(bundle, name, sdk["exports"][name]["files"])
    out = args.out.resolve()
    require(not out.is_relative_to(bundle), "select an output directory outside the exports")
    out.mkdir()
    memory = re.search(r"^MemTotal:\s+(\d+) kB$", Path("/proc/meminfo").read_text(), re.M)
    report = {"schemaVersion": 1, "passed": False, "label": args.label, "conditions": args.conditions,
              "kernel": platform.release(), "machine": platform.machine(), "cpuAffinityCount": len(os.sched_getaffinity(0)),
              "visibleMemoryKiB": int(memory[1]) if memory else None, "dockerMarker": Path("/.dockerenv").exists(),
              "sdkProofSha256": digest(sdk_file), "platformProofSha256": digest(args.platform_proof),
              "archiveSha256": proof["archiveSha256"], "warmups": args.warmups, "samples": args.samples, "runs": []}

    def save():
        pending = out / "measurement.tmp"
        pending.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        pending.replace(out / "measurement.json")

    save()
    try:
        for phase, count in (("warmup", args.warmups), ("sample", args.samples)):
            for index in range(count):
                for name in (names if index % 2 == 0 else reversed(names)):
                    directory = out / f"{phase}-{index + 1:02d}-{name}"
                    row = observe(name, bundle, directory, proof["replays"][name])
                    report["runs"].append({"phase": phase, "pair": index + 1, **row})
                    save()
        for name in names:
            check_export(bundle, name, sdk["exports"][name]["files"])
        report["passed"] = True
    except BaseException as error:
        report["failure"] = str(error)
        raise
    finally:
        save()
    print(out / "measurement.json")


if __name__ == "__main__":
    main()
