"""Store device-local access preference, never authentication or credentials."""
import argparse
import json
import os
from pathlib import Path
import tempfile


def state_path():
    root = Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex")
    return root / "clarksons-sin" / "preferences.json"


def read_state(path):
    if not path.exists():
        return {"version": 1, "mode": None, "onboardingRequired": True}
    data = json.loads(path.read_text(encoding="utf-8"))
    if (not isinstance(data, dict) or set(data) != {"version", "mode"}
            or data["version"] != 1 or data["mode"] not in ("account", "public")):
        raise ValueError("Invalid preferences; inspect the file before explicitly resetting it.")
    return {**data, "onboardingRequired": False}


def choose(path, mode):
    if mode not in ("account", "public"):
        raise ValueError("Unsupported access mode")
    read_state(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    name = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8",
                                         dir=path.parent, delete=False) as stream:
            name = stream.name
            json.dump({"version": 1, "mode": mode}, stream)
            stream.write("\n")
        os.replace(name, path)
    finally:
        if name and os.path.exists(name):
            os.unlink(name)
    return read_state(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status")
    selection = sub.add_parser("choose")
    selection.add_argument("mode", choices=["account", "public"])
    sub.add_parser("reset")
    args = parser.parse_args()
    path = state_path()
    try:
        if args.command == "choose":
            result = choose(path, args.mode)
        elif args.command == "reset":
            path.unlink(missing_ok=True)
            result = read_state(path)
        else:
            result = read_state(path)
    except (OSError, ValueError) as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False))
        return 1
    print(json.dumps({"ok": True, **result}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
