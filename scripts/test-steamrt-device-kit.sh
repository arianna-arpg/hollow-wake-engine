#!/bin/sh
# The caller mounts only the completed archive, this script and a results folder.
set -eu
mkdir /tmp/good /tmp/damaged
archive="${HWE_KIT_ARCHIVE:-/kit.tar.gz}"
tar -xzf "$archive" -C /tmp/good
tar -xzf "$archive" -C /tmp/damaged
cd /tmp/damaged/hollow-wake-device
printf X >> crafting/crafting.pck
if python3 measure.py --bundle . --platform-proof platform.json --out /tmp/invalid --label damaged --warmups 0 --samples 1 > /results/rejected-corrupt.txt 2>&1; then exit 1; fi
grep -q 'changed export: crafting.pck' /results/rejected-corrupt.txt
test ! -e /tmp/invalid
cd /tmp/good/hollow-wake-device
test "$(stat -c %i crafting/crafting.x86_64)" = "$(stat -c %i progression/progression.x86_64)"
python3 -c 'import json; p=json.load(open("platform.json"));p["replays"]["crafting"]["observations"]["sha256"]="0"*64;json.dump(p,open("/tmp/incorrect-proof.json","w"))'
if python3 measure.py --bundle . --platform-proof /tmp/incorrect-proof.json --out /tmp/wrong --label wrong --warmups 0 --samples 1 > /results/rejected-replies.txt 2>&1; then exit 1; fi
grep -q 'crafting replies differ' /results/rejected-replies.txt
cp /tmp/wrong/measurement.json /results/rejected-replies.json
python3 measure.py --bundle . --platform-proof platform.json --out /tmp/observed \
  --label "${HWE_DEVICE_LABEL:-Steam Runtime package check}" \
  --conditions "${HWE_DEVICE_CONDITIONS:-Headless Platform container with temporary storage}" \
  --warmups "${HWE_DEVICE_WARMUPS:-0}" --samples "${HWE_DEVICE_SAMPLES:-1}"
cp /tmp/observed/measurement.json /results/measurement.json
for log in /tmp/observed/*/console.txt; do
  name=$(basename "$(dirname "$log")")
  cp "$log" "/results/$name.txt"
done
