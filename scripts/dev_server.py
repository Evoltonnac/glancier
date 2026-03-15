"""
Development helper: watch Python file changes and auto-restart the backend.
Usage: python scripts/dev_server.py [port]
"""

import os
import signal
import subprocess
import sys
import time

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

# Project root.
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Watched directories.
WATCH_DIRS = [
    os.path.join(PROJECT_ROOT, "core"),
]
# Also watch main.py.
WATCH_FILES_EXTRA = [
    os.path.join(PROJECT_ROOT, "main.py"),
]

# Watched file extensions.
WATCH_EXTENSIONS = {".py", ".yaml", ".yml", ".json"}

# Restart cooldown (seconds) to prevent rapid repeated triggers.
COOLDOWN = 1.5


class BackendProcess:
    """Manage backend subprocess lifecycle."""

    def __init__(self, port: int):
        self.port = port
        self.process: subprocess.Popen | None = None

    def start(self):
        print(f"\n🚀 Starting Python backend (port={self.port})...")
        env = os.environ.copy()
        env["PYTHONPATH"] = PROJECT_ROOT

        # Ensure we use the pyenv-managed Python when available.
        python_path = self._get_pyenv_python()
        self.process = subprocess.Popen(
            [python_path, "main.py", str(self.port)],
            cwd=PROJECT_ROOT,
            env=env,
        )
        print(f"✅ Backend started (PID: {self.process.pid})")

    def _get_pyenv_python(self) -> str:
        """Get the pyenv-managed Python interpreter path."""
        import shutil
        # Prefer `pyenv which python`.
        try:
            result = subprocess.run(
                ["pyenv", "which", "python"],
                capture_output=True,
                text=True,
                check=True,
            )
            return result.stdout.strip()
        except (subprocess.CalledProcessError, FileNotFoundError):
            pass
        # Fallback to sys.executable.
        return sys.executable

    def stop(self):
        if self.process and self.process.poll() is None:
            print(f"🛑 Stopping backend (PID: {self.process.pid})...")
            # Send SIGTERM so uvicorn can exit gracefully.
            self.process.send_signal(signal.SIGTERM)
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                print("⚠️  Forcing termination...")
                self.process.kill()
                self.process.wait()
            print("✅ Backend stopped")

    def restart(self):
        self.stop()
        self.start()


class HotReloadHandler(FileSystemEventHandler):
    """Handle file change events and auto-restart backend."""

    def __init__(self, backend: BackendProcess):
        self.backend = backend
        self._last_trigger = 0

    def _should_trigger(self, path: str) -> bool:
        _, ext = os.path.splitext(path)
        if ext not in WATCH_EXTENSIONS:
            return False
        # Ignore __pycache__ changes.
        if "__pycache__" in path:
            return False
        return True

    def on_modified(self, event):
        if event.is_directory:
            return
        if not self._should_trigger(event.src_path):
            return

        now = time.time()
        if now - self._last_trigger < COOLDOWN:
            return
        self._last_trigger = now

        rel_path = os.path.relpath(event.src_path, PROJECT_ROOT)
        print(f"\n🔄 Change detected: {rel_path}")
        self.backend.restart()

    def on_created(self, event):
        self.on_modified(event)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8400

    backend = BackendProcess(port)
    backend.start()

    handler = HotReloadHandler(backend)
    observer = Observer()

    for watch_dir in WATCH_DIRS:
        if os.path.isdir(watch_dir):
            observer.schedule(handler, watch_dir, recursive=True)
            print(f"👁️  Watching directory: {os.path.relpath(watch_dir, PROJECT_ROOT)}/")

    # Watch specific root-level files (non-recursive).
    observer.schedule(handler, PROJECT_ROOT, recursive=False)
    print("👁️  Watching file: main.py")

    observer.start()
    print("\n🔥 Development mode started — backend auto-restarts on file changes")
    print(f"   Backend URL: http://localhost:{port}")
    print("   Press Ctrl+C to exit\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n👋 Exiting...")
        observer.stop()
        backend.stop()

    observer.join()
    print("✅ Dev service fully stopped")


if __name__ == "__main__":
    main()
