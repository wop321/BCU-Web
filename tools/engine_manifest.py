"""Create TeaVM's virtual file bootstrap without embedding image/audio payloads."""
from __future__ import annotations

import argparse
import json
import struct
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


def build_manifest(web: Path) -> dict:
    entries = []
    root = web / "assets" / "org"
    if not root.is_dir():
        raise SystemExit(f"Original exported assets are missing: {root}")
    resource_manifest = json.loads((web / "data" / "resources.json").read_text(encoding="utf-8"))

    def read_entry(resource: dict) -> dict:
        relative = resource["path"].removeprefix("assets/")
        file = web / resource["path"]
        entry = {"path": "./" + relative, "url": resource["path"], "size": resource["size"]}
        with file.open("rb") as stream:
            header = stream.read(24)
            if header.startswith(b"\x89PNG\r\n\x1a\n") and len(header) >= 24:
                entry["width"], entry["height"] = struct.unpack(">II", header[16:24])
            elif file.suffix.lower() not in {".ogg", ".wav", ".mp3", ".otf", ".ttf", ".jpg", ".jpeg", ".gif", ".zip"}:
                data = header + stream.read()
                if b"\0" not in data:
                    try:
                        entry["text"] = data.decode("utf-8-sig")
                    except UnicodeDecodeError:
                        pass
        return entry

    original_resources = [r for r in resource_manifest["files"] if r["path"].startswith("assets/org/")]
    with ThreadPoolExecutor(max_workers=16) as executor:
        for entry in executor.map(read_entry, original_resources):
            entries.append(entry)
            if len(entries) % 5000 == 0:
                print(f"Read {len(entries):,} original asset headers", flush=True)
    result = {"schemaVersion": 1, "root": ".", "entries": entries}
    destination = web / "data" / "engine-assets.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"TeaVM file manifest: {len(entries):,} entries, {sum('text' in e for e in entries):,} text files, "
          f"{sum('width' in e for e in entries):,} PNG headers; {destination.stat().st_size:,} bytes")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("web", nargs="?", type=Path, default=Path(__file__).resolve().parents[1] / "web")
    arguments = parser.parse_args()
    build_manifest(arguments.web.resolve())
