#!/bin/bash
# Packaging script: bundle Python backend with PyInstaller, then build Tauri app.
set -e
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TAURI_BINARIES_DIR="$PROJECT_ROOT/ui-react/src-tauri/binaries"
PREPARE_ONLY=false

if [ "${1:-}" = "--prepare-only" ]; then
    PREPARE_ONLY=true
fi

if [ "${SKIP_TAURI_BUILD:-0}" = "1" ]; then
    PREPARE_ONLY=true
fi

echo "=== Glancier Build Script ==="

# Detect current platform Tauri target triple.
ARCH=$(uname -m)
OS=$(uname -s)
BINARY_EXT=""

case "$OS" in
    Darwin)
        case "$ARCH" in
            arm64) TARGET_TRIPLE="aarch64-apple-darwin" ;;
            x86_64) TARGET_TRIPLE="x86_64-apple-darwin" ;;
        esac
        ;;
    Linux)
        case "$ARCH" in
            x86_64) TARGET_TRIPLE="x86_64-unknown-linux-gnu" ;;
            aarch64) TARGET_TRIPLE="aarch64-unknown-linux-gnu" ;;
        esac
        ;;
    MINGW*|MSYS*|CYGWIN*)
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
    --name "glancier-server" \
    --add-data "config:config" \
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
rm -rf "$TAURI_BINARIES_DIR"/glancier-server-*

SIDECAR_DIR_NAME="glancier-server-$TARGET_TRIPLE"
SOURCE_SIDECAR_DIR="$PROJECT_ROOT/dist/glancier-server"
SOURCE_ENTRY="$SOURCE_SIDECAR_DIR/glancier-server$BINARY_EXT"
TARGET_ARCHIVE="$TAURI_BINARIES_DIR/$SIDECAR_DIR_NAME.tar.gz"

if [ ! -d "$SOURCE_SIDECAR_DIR" ]; then
    echo "❌ Missing sidecar directory: $SOURCE_SIDECAR_DIR"
    exit 1
fi

if [ ! -f "$SOURCE_ENTRY" ]; then
    echo "❌ Missing sidecar entry executable: $SOURCE_ENTRY"
    exit 1
fi

COPYFILE_DISABLE=1 tar -C "$PROJECT_ROOT/dist" -czf "$TARGET_ARCHIVE" "glancier-server"

echo "✅ Archive generated: binaries/$(basename "$TARGET_ARCHIVE")"

if [ "$PREPARE_ONLY" = true ]; then
    echo ""
    echo "=== ✅ Prepare-only completed (Tauri build skipped) ==="
    exit 0
fi

# Step 3: Build Tauri app.
echo ""
echo "=== Step 3: Build Tauri app ==="
cd "$PROJECT_ROOT/ui-react"

source "$HOME/.cargo/env" 2>/dev/null || true

# Execute build.
npx tauri build --bundles dmg

echo ""
echo "=== ✅ Build complete! ==="
echo "Artifacts: ui-react/src-tauri/target/release/bundle/"
