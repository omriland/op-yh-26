#!/usr/bin/env python3
"""Convert Gov.il MILE_POST shapefile (EPSG:2039) to WGS84 JSON for the ops map.

Uses SHP geometry (not rounded DBF X/Y) and `cs2cs EPSG:2039 → EPSG:4326`
so the Israel 1993 → WGS 84 datum shift is applied (~80 m vs bare TM inverse).
Requires PROJ (`cs2cs` on PATH).
"""

from __future__ import annotations

import json
import math
import struct
import subprocess
import sys
import zipfile
from pathlib import Path

# Shapefile point types we accept from this dataset.
POINT = 1
POINT_Z = 11
POINT_M = 21


def decode_cell(raw: bytes) -> str:
    for encoding in ("utf-8", "cp1255"):
        try:
            return raw.decode(encoding).strip()
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1", "replace").strip()


def is_numbered_road_type(type_road: str) -> bool:
    value = type_road.strip()
    if "רמפה" in value:
        return False
    return "כביש" in value


def read_dbf_rows(dbf: bytes) -> list[dict[str, str]]:
    nrec = struct.unpack_from("<I", dbf, 4)[0]
    hlen = struct.unpack_from("<H", dbf, 8)[0]
    rlen = struct.unpack_from("<H", dbf, 10)[0]
    fields: list[tuple[str, int]] = []
    off = 32
    while dbf[off] != 0x0D:
        name = dbf[off : off + 11].split(b"\x00")[0].decode("ascii")
        length = dbf[off + 16]
        fields.append((name, length))
        off += 32
    rows = []
    for i in range(nrec):
        rec = dbf[hlen + i * rlen : hlen + (i + 1) * rlen]
        pos = 1
        row: dict[str, str] = {}
        for name, length in fields:
            row[name] = decode_cell(rec[pos : pos + length])
            pos += length
        rows.append(row)
    return rows


def read_shp_xy(shp: bytes, count: int) -> list[tuple[float, float]]:
    """Return (easting, northing) for each shapefile record, in DBF order."""
    off = 100
    points: list[tuple[float, float]] = []
    for _ in range(count):
        off += 8  # record number + content length
        stype = struct.unpack_from("<i", shp, off)[0]
        off += 4
        if stype not in (POINT, POINT_Z, POINT_M):
            raise SystemExit(f"unsupported shapefile type {stype}")
        easting, northing = struct.unpack_from("<2d", shp, off)
        off += 16
        if stype == POINT_M:
            off += 8
        elif stype == POINT_Z:
            off += 16
        points.append((easting, northing))
    return points


def israel_tm_to_wgs84_batch(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """EPSG:2039 → EPSG:4326 via PROJ (includes Israel 1993 → WGS 84)."""
    if not points:
        return []
    payload = "\n".join(f"{e} {n}" for e, n in points) + "\n"
    try:
        result = subprocess.run(
            ["cs2cs", "EPSG:2039", "EPSG:4326", "-f", "%.10f"],
            input=payload,
            capture_output=True,
            text=True,
            check=True,
        )
    except FileNotFoundError as exc:
        raise SystemExit("cs2cs not found — install PROJ (e.g. brew install proj)") from exc
    except subprocess.CalledProcessError as exc:
        raise SystemExit(f"cs2cs failed: {exc.stderr.strip()}") from exc

    out: list[tuple[float, float]] = []
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) < 2:
            continue
        # cs2cs EPSG:4326 prints lat lng
        lat = float(parts[0])
        lng = float(parts[1])
        out.append((lat, lng))
    if len(out) != len(points):
        raise SystemExit(f"cs2cs returned {len(out)} rows for {len(points)} inputs")
    return out


def convert_zip(zip_path: Path) -> list[dict[str, float | str | int]]:
    with zipfile.ZipFile(zip_path) as archive:
        names = {Path(name).name.upper(): name for name in archive.namelist()}
        dbf_name = names.get("MILE_POST.DBF")
        shp_name = names.get("MILE_POST.SHP")
        if not dbf_name or not shp_name:
            raise SystemExit(f"MILE_POST.dbf/.shp not in {zip_path}")
        rows = read_dbf_rows(archive.read(dbf_name))
        xy = read_shp_xy(archive.read(shp_name), len(rows))

    keep_idx = [i for i, row in enumerate(rows) if is_numbered_road_type(row.get("TYPE_ROAD", ""))]
    wgs = israel_tm_to_wgs84_batch([xy[i] for i in keep_idx])

    posts: list[dict[str, float | str | int]] = []
    for i, (lat, lng) in zip(keep_idx, wgs):
        row = rows[i]
        road = row.get("ROAD", "").strip()
        km = int(float(row["KM"]))
        if not road or km < 1 or not math.isfinite(lat) or not math.isfinite(lng):
            continue
        posts.append(
            {
                "road": road,
                "km": km,
                "lat": round(lat, 6),
                "lng": round(lng, 6),
            }
        )
    return posts


def main() -> None:
    zip_path = Path(sys.argv[1] if len(sys.argv) > 1 else "/Users/omrilandman/Downloads/mile_post.zip")
    out_path = Path(sys.argv[2] if len(sys.argv) > 2 else "public/data/mile-posts.json")
    posts = convert_zip(zip_path)
    lats = [float(p["lat"]) for p in posts]
    lngs = [float(p["lng"]) for p in posts]
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(posts, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        f"wrote {len(posts)} posts to {out_path} "
        f"lat {min(lats):.4f}..{max(lats):.4f} lng {min(lngs):.4f}..{max(lngs):.4f}"
    )


if __name__ == "__main__":
    main()
