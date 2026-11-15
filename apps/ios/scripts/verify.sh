#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Override for a particular iPhone, iPad or Duo simulator UUID.
if [ -z "${SYTIME_SIMULATOR_ID:-}" ]; then
  SYTIME_SIMULATOR_ID=$(xcrun simctl list devices available -j | /usr/bin/python3 -c 'import json,sys; d=json.load(sys.stdin); phones=[p for runtime,ps in d["devices"].items() if "iOS" in runtime for p in ps if p.get("isAvailable") and "iPhone" in p["name"]]; print(next((p["udid"] for p in phones if p["state"] == "Booted"), phones[0]["udid"] if phones else ""))')
fi
if [ -z "$SYTIME_SIMULATOR_ID" ]; then
  echo 'Install an iOS 26+ simulator runtime in Xcode first.' >&2
  exit 1
fi
SYTIME_BUILD_PATH=${SYTIME_BUILD_PATH:-/tmp/sytime-ios-verification}
xcodebuild -project Sytime.xcodeproj -scheme Sytime \
  -destination "platform=iOS Simulator,id=$SYTIME_SIMULATOR_ID" \
  -derivedDataPath "$SYTIME_BUILD_PATH" test
xcodebuild -project Sytime.xcodeproj -scheme Sytime -configuration Release \
  -destination 'generic/platform=iOS' -derivedDataPath "$SYTIME_BUILD_PATH" \
  CODE_SIGNING_ALLOWED=NO build
