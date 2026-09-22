#!/usr/bin/env bash
# Launches the app on a connected Android device/emulator without going
# through `expo start --android`'s automatic device-select + Expo Go
# auto-install path. That path silently downloads the Expo Go APK over
# adb with no visible progress when Expo Go isn't already on the device,
# which looks exactly like a hang on a slow connection or a freshly
# created AVD (no Play Store, nothing pre-installed).
#
# Mirrors scripts/run-expo-emulator.ps1 (the Windows equivalent).
set -euo pipefail

SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
ADB="$SDK_ROOT/platform-tools/adb"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPO_PORT=8082

if [ ! -x "$ADB" ]; then
  echo "Android adb was not found under $SDK_ROOT. Set ANDROID_HOME and try again." >&2
  exit 1
fi

SERIAL="${1:-}"
if [ -z "$SERIAL" ]; then
  DEVICES=()
  while IFS= read -r line; do
    [ -n "$line" ] && DEVICES+=("$line")
  done < <("$ADB" devices | tail -n +2 | awk '$2=="device"{print $1}')
  if [ "${#DEVICES[@]}" -eq 0 ]; then
    echo "No Android device/emulator is connected. Boot one first (e.g. \`emulator -avd <name>\`) and try again." >&2
    exit 1
  fi
  if [ "${#DEVICES[@]}" -gt 1 ]; then
    echo "Multiple Android targets are connected. Pass a serial: ${DEVICES[*]}" >&2
    exit 1
  fi
  SERIAL="${DEVICES[0]}"
fi

echo "Waiting for $SERIAL to finish booting..."
"$ADB" -s "$SERIAL" wait-for-device
DEADLINE=$((SECONDS + 180))
BOOTED=""
while [ "$SECONDS" -lt "$DEADLINE" ]; do
  BOOTED="$("$ADB" -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r\n')"
  [ "$BOOTED" = "1" ] && break
  sleep 2
done
if [ "$BOOTED" != "1" ]; then
  echo "$SERIAL did not finish booting within three minutes." >&2
  exit 1
fi

EXPO_GO_INSTALLED="$("$ADB" -s "$SERIAL" shell pm path host.exp.exponent 2>/dev/null || true)"
CACHED_APK="$(ls -t "$HOME"/.expo/android-apk-cache/Expo-Go-*.apk 2>/dev/null | head -n 1 || true)"

if [ -z "$EXPO_GO_INSTALLED" ]; then
  if [ -z "$CACHED_APK" ]; then
    cat >&2 <<'EOF'
Expo Go is not installed on this device/emulator, and no cached Expo Go
APK was found under ~/.expo/android-apk-cache/.

This is almost certainly why `expo start --android` looked like it hung:
on first use it silently downloads the Expo Go APK over adb with no
visible progress, and that download can take a very long time on a
throttled connection.

To fix this without an opaque hang, download it explicitly and visibly
first, then re-run this script:
  npx expo install --check  # harmless network sanity check, optional
  curl -L -o /tmp/expo-go.apk "https://d1ahtucjixef4r.cloudfront.net/Exponent-2.33.20.apk"
  adb -s SERIAL install -r /tmp/expo-go.apk
(Match the Expo Go version to this project's SDK 57 - check
https://expo.dev/go for the exact current download link.)
EOF
    exit 1
  fi
  echo "Installing Expo Go from cache ($CACHED_APK) on $SERIAL..."
  "$ADB" -s "$SERIAL" install -r "$CACHED_APK"
fi

if ! nc -z 127.0.0.1 "$EXPO_PORT" 2>/dev/null; then
  echo "Starting Expo (Metro only, no device auto-launch) on port $EXPO_PORT..."
  (
    cd "$PROJECT_ROOT"
    nohup npx expo start --host localhost --port "$EXPO_PORT" --clear \
      > "$PROJECT_ROOT/.expo-debug.log" 2> "$PROJECT_ROOT/.expo-debug-error.log" &
  )

  DEADLINE=$((SECONDS + 120))
  while [ "$SECONDS" -lt "$DEADLINE" ] && ! nc -z 127.0.0.1 "$EXPO_PORT" 2>/dev/null; do
    sleep 1
  done
  if ! nc -z 127.0.0.1 "$EXPO_PORT" 2>/dev/null; then
    echo "Expo did not start. Check $PROJECT_ROOT/.expo-debug-error.log for details." >&2
    exit 1
  fi
fi

"$ADB" -s "$SERIAL" reverse "tcp:$EXPO_PORT" "tcp:$EXPO_PORT"
"$ADB" -s "$SERIAL" shell am start \
  -a android.intent.action.VIEW \
  -d "exp://127.0.0.1:$EXPO_PORT" \
  host.exp.exponent

echo "Project ScaleUp is running in Expo Go on $SERIAL."
