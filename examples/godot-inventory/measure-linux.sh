#!/bin/sh
set -eu
program_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
data_dir=${XDG_DATA_HOME:-"$HOME/.local/share"}
mkdir -p -- "$data_dir"
data_dir=$(CDPATH= cd -- "$data_dir" && pwd)
trial_dir=$(mktemp -d "$data_dir/hollow-wake-bench.XXXXXX")
# Restrict cleanup to the directory this invocation allocated.
cleanup() {
    case "$trial_dir" in "$data_dir"/hollow-wake-bench.??????) rm -rf -- "$trial_dir";; esac
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if command -v sha256sum >/dev/null 2>&1; then sha256sum "$program_dir/Inventory.pck"; fi
XDG_DATA_HOME="$trial_dir/data" XDG_CONFIG_HOME="$trial_dir/config" XDG_CACHE_HOME="$trial_dir/cache" \
    "$program_dir/Inventory.x86_64" --headless --quit-after 360 -- device
