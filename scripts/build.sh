#!/bin/bash
# Packaging script: bundle Python backend with PyInstaller, then build Tauri app.
set -e
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TAURI_BINARIES_DIR="$PROJECT_ROOT/ui-react/src-tauri/binaries"
PREPARE_ONLY=false
TARGET_PLATFORM="auto"

while [ $# -gt 0 ]; do
    case "$1" in
        --prepare-only)
            PREPARE_ONLY=true
            ;;
        --platform)
            if [ $# -lt 2 ]; then
                echo "❌ Missing value for --platform (expected: mac or win)"
                exit 1
            fi
            TARGET_PLATFORM="$2"
            shift
            ;;
        --platform=*)
            TARGET_PLATFORM="${1#*=}"
            ;;
        *)
            echo "❌ Unknown argument: $1"
            echo "Usage: bash scripts/build.sh [--prepare-only] [--platform mac|win]"
            exit 1
            ;;
    esac
    shift
done

TARGET_PLATFORM="$(echo "$TARGET_PLATFORM" | tr '[:upper:]' '[:lower:]')"

if [ "${SKIP_TAURI_BUILD:-0}" = "1" ]; then
    PREPARE_ONLY=true
fi

echo "=== Glanceus Build Script ==="

# Detect current platform Tauri target triple.
ARCH=$(uname -m)
OS=$(uname -s)
BINARY_EXT=""
HOST_PLATFORM=""

case "$OS" in
    Darwin)
        HOST_PLATFORM="mac"
        case "$ARCH" in
            arm64) TARGET_TRIPLE="aarch64-apple-darwin" ;;
            x86_64) TARGET_TRIPLE="x86_64-apple-darwin" ;;
        esac
        ;;
    Linux)
        HOST_PLATFORM="linux"
        case "$ARCH" in
            x86_64) TARGET_TRIPLE="x86_64-unknown-linux-gnu" ;;
            aarch64) TARGET_TRIPLE="aarch64-unknown-linux-gnu" ;;
        esac
        ;;
    MINGW*|MSYS*|CYGWIN*)
        HOST_PLATFORM="win"
        case "$ARCH" in
            x86_64|amd64) TARGET_TRIPLE="x86_64-pc-windows-msvc"; BINARY_EXT=".exe" ;;
            aarch64|arm64) TARGET_TRIPLE="aarch64-pc-windows-msvc"; BINARY_EXT=".exe" ;;
        esac
        ;;
esac

if [ -z "${TARGET_TRIPLE:-}" ]; then
    echo "❌ Unsupported platform: os=${OS}, arch=${ARCH}"
    exit 1
fi

echo "📦 Platform: $TARGET_TRIPLE"

# Step 1: Package Python backend with PyInstaller (onedir).
echo ""
echo "=== Step 1: Package Python backend ==="
cd "$PROJECT_ROOT"

pyinstaller \
    -y \
    --onedir \
    --name "glanceus-server" \
    --add-data "config:config" \
    --hidden-import keyring \
    --hidden-import keyring.backends \
    --hidden-import keyring.backends.macOS \
    --hidden-import keyring.backends.Windows \
    --hidden-import keyring.backends.SecretService \
    --hidden-import keyring.backends.kwallet \
    --hidden-import uvicorn.logging \
    --hidden-import uvicorn.loops.auto \
    --hidden-import uvicorn.protocols.http.auto \
    --hidden-import uvicorn.protocols.websockets.auto \
    --hidden-import uvicorn.lifespan.on \
    main.py

echo "✅ Python backend packaging complete"

# Step 2: Archive backend directory and copy to Tauri binaries (target-triple suffix).
echo ""
echo "=== Step 2: Archive to Tauri binaries ==="
mkdir -p "$TAURI_BINARIES_DIR"
rm -rf "$TAURI_BINARIES_DIR"/glanceus-server-*

SIDECAR_DIR_NAME="glanceus-server-$TARGET_TRIPLE"
SOURCE_SIDECAR_DIR="$PROJECT_ROOT/dist/glanceus-server"
SOURCE_ENTRY="$SOURCE_SIDECAR_DIR/glanceus-server$BINARY_EXT"
TARGET_ARCHIVE="$TAURI_BINARIES_DIR/$SIDECAR_DIR_NAME.tar.gz"

if [ ! -d "$SOURCE_SIDECAR_DIR" ]; then
    echo "❌ Missing sidecar directory: $SOURCE_SIDECAR_DIR"
    exit 1
fi

if [ ! -f "$SOURCE_ENTRY" ]; then
    echo "❌ Missing sidecar entry executable: $SOURCE_ENTRY"
    exit 1
fi

COPYFILE_DISABLE=1 tar -C "$PROJECT_ROOT/dist" -czf "$TARGET_ARCHIVE" "glanceus-server"

echo "✅ Archive generated: binaries/$(basename "$TARGET_ARCHIVE")"

if [ "$PREPARE_ONLY" = true ]; then
    echo ""
    echo "=== ✅ Prepare-only completed (Tauri build skipped) ==="
    exit 0
fi

if [ "$TARGET_PLATFORM" = "auto" ]; then
    TARGET_PLATFORM="$HOST_PLATFORM"
fi

case "$TARGET_PLATFORM" in
    mac)
        if [ "$HOST_PLATFORM" != "mac" ]; then
            echo "❌ build target 'mac' must run on macOS host"
            exit 1
        fi
        if [ "$TARGET_TRIPLE" != "aarch64-apple-darwin" ]; then
            echo "❌ build target 'mac' requires Apple Silicon host (arm64)"
            exit 1
        fi
        TAURI_BUNDLES="dmg updater"
        TAURI_TARGET="aarch64-apple-darwin"
        ;;
    win)
        if [ "$HOST_PLATFORM" != "win" ]; then
            echo "❌ build target 'win' must run on Windows host (Git Bash/MSYS)"
            exit 1
        fi
        if [ "$TARGET_TRIPLE" != "x86_64-pc-windows-msvc" ]; then
            echo "❌ build target 'win' currently supports x86_64 Windows host only"
            exit 1
        fi
        TAURI_BUNDLES="nsis"
        TAURI_TARGET="x86_64-pc-windows-msvc"
        ;;
    *)
        echo "❌ Unsupported --platform '$TARGET_PLATFORM' (expected: mac or win)"
        exit 1
        ;;
esac

# Step 3: Build Tauri app.
echo ""
echo "=== Step 3: Build Tauri app ($TARGET_PLATFORM) ==="
cd "$PROJECT_ROOT/ui-react"

source "$HOME/.cargo/env" 2>/dev/null || true

# Load signing env from project .env when not provided by shell/CI.
if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ] || [ -z "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" ]; then
    ENV_FILE="$PROJECT_ROOT/.env"
    if [ -f "$ENV_FILE" ]; then
        set -a
        # shellcheck disable=SC1090
        . "$ENV_FILE"
        set +a
        echo "ℹ️ Loaded Tauri signing variables from .env"
    fi
fi

# Execute build.
npx tauri build --bundles "$TAURI_BUNDLES" --target "$TAURI_TARGET"

echo ""
echo "=== ✅ Build complete! ==="
echo "Artifacts: ui-react/src-tauri/target/release/bundle/"
