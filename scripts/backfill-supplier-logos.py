#!/usr/bin/env python3
"""
Backfill solution_providers.website + logo_url for suppliers missing logos.

Strategy:
  1) Known brand map (same domains as src/lib/supplier-logos.ts)
  2) Guess domains from slug/name and probe logo CDN endpoints
  3) Download a usable image and upload to Supabase Storage (app/supplier-logos/)

Usage:
  python3 scripts/backfill-supplier-logos.py            # dry-ish: print plan, then apply
  python3 scripts/backfill-supplier-logos.py --limit 50
  python3 scripts/backfill-supplier-logos.py --apply
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV = ROOT / ".env.local"

BRANDS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"worldpay|fiserv|vantiv|card\s*connect|cardpointe", re.I), "worldpay.com"),
    (re.compile(r"ringcentral", re.I), "ringcentral.com"),
    (re.compile(r"comcast|xfinity", re.I), "business.comcast.com"),
    (re.compile(r"square(?!space|enix)", re.I), "squareup.com"),
    (re.compile(r"dialpad", re.I), "dialpad.com"),
    (re.compile(r"nextiva", re.I), "nextiva.com"),
    (re.compile(r"goto|logmein", re.I), "goto.com"),
    (re.compile(r"microsoft|office\s*365|m365", re.I), "microsoft.com"),
    (re.compile(r"google\s*workspace|g\s*suite|\bgoogle\b", re.I), "google.com"),
    (re.compile(r"vonage", re.I), "vonage.com"),
    (re.compile(r"stripe", re.I), "stripe.com"),
    (re.compile(r"clover", re.I), "clover.com"),
    (re.compile(r"elavon", re.I), "elavon.com"),
    (re.compile(r"heartland", re.I), "heartland.us"),
    (re.compile(r"at&t|\batt\b", re.I), "att.com"),
    (re.compile(r"verizon", re.I), "verizon.com"),
    (re.compile(r"spectrum|charter", re.I), "spectrum.com"),
    (re.compile(r"\bcox\b", re.I), "cox.com"),
    (re.compile(r"8\s*x\s*8|8x8", re.I), "8x8.com"),
    (re.compile(r"zoom", re.I), "zoom.us"),
    (re.compile(r"3\s*cx|3cx", re.I), "3cx.com"),
    (re.compile(r"payment\s*cloud|paymentcloud", re.I), "paymentcloud.com"),
    (re.compile(r"nuvei", re.I), "nuvei.com"),
    (re.compile(r"check\s*commerce|checkcommerce", re.I), "checkcommerce.com"),
    (re.compile(r"linked\s*2\s*pay|linked2pay|candid\s*pay", re.I), "linked2pay.com"),
    (re.compile(r"authorize\.?net", re.I), "authorize.net"),
    (re.compile(r"global\s*payments", re.I), "globalpayments.com"),
    (re.compile(r"aws|amazon\s*web|\bamazon\b", re.I), "aws.amazon.com"),
    (re.compile(r"adobe", re.I), "adobe.com"),
    (re.compile(r"lumen|centurylink", re.I), "lumen.com"),
    (re.compile(r"t[\s-]?mobile", re.I), "t-mobile.com"),
    (re.compile(r"frontier", re.I), "frontier.com"),
    (re.compile(r"windstream", re.I), "windstreamenterprise.com"),
    (re.compile(r"airespring", re.I), "airespring.com"),
    (re.compile(r"app\s*direct", re.I), "appdirect.com"),
    (re.compile(r"mettel", re.I), "mettel.net"),
    (re.compile(r"metronet", re.I), "metronet.com"),
    (re.compile(r"granite", re.I), "granitenet.com"),
    (re.compile(r"\bnitel\b", re.I), "nitelusa.com"),
    (re.compile(r"net2phone", re.I), "net2phone.com"),
    (re.compile(r"momentum\s*telecom", re.I), "momentumtelecom.com"),
    (re.compile(r"spectrotel", re.I), "spectrotel.com"),
    (re.compile(r"bulls?\s*eye", re.I), "bullseyetelecom.com"),
    (re.compile(r"twilio", re.I), "twilio.com"),
    (re.compile(r"\bcisco\b|meraki", re.I), "cisco.com"),
    (re.compile(r"paypal", re.I), "paypal.com"),
    (re.compile(r"watchguard", re.I), "watchguard.com"),
    (re.compile(r"telarus", re.I), "telarus.com"),
    (re.compile(r"intelisys|intelysys", re.I), "intelisys.com"),
    (re.compile(r"sandler", re.I), "sandlerpartners.com"),
]


def load_env() -> None:
    for line in ENV.read_text().splitlines():
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
        if not m:
            continue
        k, v = m.group(1), m.group(2)
        if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
            v = v[1:-1]
        os.environ.setdefault(k, v)


def rest(method: str, path: str, body=None, prefer: str | None = None, extra_headers: dict | None = None):
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/" + path
    headers = {
        "apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        "Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_ROLE_KEY']}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    if extra_headers:
        headers.update(extra_headers)
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read()
        return json.loads(raw.decode()) if raw else None


def storage_upload(path: str, content: bytes, content_type: str) -> str:
    base = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    url = f"{base}/storage/v1/object/app/{path}"
    req = urllib.request.Request(
        url,
        data=content,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": content_type,
            "x-upsert": "true",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        resp.read()
    return f"{base}/storage/v1/object/public/app/{path}"


def brand_domain(name: str) -> str | None:
    for pattern, domain in BRANDS:
        if pattern.search(name):
            return domain
    return None


def guess_domains(name: str, slug: str) -> list[str]:
    out: list[str] = []
    cleaned = re.sub(r"\([^)]*\)", " ", name)
    cleaned = re.sub(
        r"\b(llc|inc|ltd|corp|co|the|company|communications|telecom|technologies|solutions|systems|services|group|usa)\b",
        " ",
        cleaned,
        flags=re.I,
    )
    cleaned = re.sub(r"[^a-zA-Z0-9\s.-]", " ", cleaned)
    words = [w for w in cleaned.lower().split() if len(w) > 1]
    compact = re.sub(r"[^a-z0-9]", "", slug.lower())
    hyphenless = slug.replace("-", "")

    candidates = [
        f"{slug}.com",
        f"{hyphenless}.com",
        f"{compact}.com",
    ]
    if words:
        candidates.append(f"{words[0]}.com")
        if len(words) >= 2:
            candidates.append(f"{words[0]}{words[1]}.com")
            candidates.append(f"{words[0]}-{words[1]}.com")
    # de-dupe preserve order
    seen = set()
    for c in candidates:
        c = c.strip(".-")
        if c and c not in seen and "." in c:
            seen.add(c)
            out.append(c)
    return out[:6]


def fetch_bytes(url: str, timeout: float = 12) -> tuple[bytes, str] | None:
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "CandidPortalLogoBackfill/1.0"},
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            ctype = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            data = resp.read()
            if not data or len(data) < 400:
                return None
            if ctype and not ctype.startswith("image/") and "octet-stream" not in ctype:
                # some CDNs omit type
                if not any(url.lower().endswith(ext) for ext in (".png", ".jpg", ".jpeg", ".webp", ".ico", ".svg")):
                    if "image" not in ctype and ctype not in ("", "application/octet-stream"):
                        return None
            return data, ctype or "image/png"
    except Exception:
        return None


def probe_logo(domain: str) -> tuple[bytes, str, str] | None:
    """Return (bytes, content_type, source_url) for best logo hit."""
    urls = [
        f"https://logo.clearbit.com/{domain}",
        f"https://icons.duckduckgo.com/ip3/{domain}.ico",
        f"https://www.google.com/s2/favicons?domain={urllib.parse.quote(domain)}&sz=128",
    ]
    for url in urls:
        hit = fetch_bytes(url)
        if not hit:
            continue
        data, ctype = hit
        # Google's generic globe is typically very small at sz=128 when domain unknown;
        # require a bit more for google endpoint.
        if "google.com/s2/favicons" in url and len(data) < 800:
            continue
        if "duckduckgo" in url and len(data) < 200:
            continue
        return data, ctype, url
    return None


def ext_for(ctype: str, source: str) -> str:
    if "png" in ctype or source.endswith(".png"):
        return ".png"
    if "webp" in ctype:
        return ".webp"
    if "svg" in ctype:
        return ".svg"
    if "ico" in ctype or source.endswith(".ico"):
        return ".ico"
    return ".jpg"


def list_targets(limit: int | None) -> list[dict]:
    # PostgREST max rows — page
    rows: list[dict] = []
    offset = 0
    page = 500
    while True:
        chunk = rest(
            "GET",
            f"solution_providers?select=id,slug,name,website,logo_url&logo_url=is.null&order=name&limit={page}&offset={offset}",
        )
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < page:
            break
        offset += page
        if limit and len(rows) >= limit:
            break
    if limit:
        rows = rows[:limit]
    return rows


def process_one(row: dict, apply: bool) -> dict:
    name = row["name"]
    slug = row["slug"]
    domain = brand_domain(name)
    source = "brand"
    if not domain:
        source = "guess"
        for cand in guess_domains(name, slug):
            hit = probe_logo(cand)
            if hit:
                domain = cand
                data, ctype, src_url = hit
                break
        else:
            return {"id": row["id"], "name": name, "ok": False, "reason": "no_domain"}
    else:
        hit = probe_logo(domain)
        if not hit:
            # still set website so UI can try favicon live
            if apply and not row.get("website"):
                rest(
                    "PATCH",
                    f"solution_providers?id=eq.{row['id']}",
                    {"website": f"https://{domain}", "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
                )
            return {"id": row["id"], "name": name, "ok": False, "reason": "brand_no_image", "domain": domain}
        data, ctype, src_url = hit

    if not apply:
        return {"id": row["id"], "name": name, "ok": True, "dry": True, "domain": domain, "source": source}

    website = row.get("website") or f"https://{domain}"
    # Storage bucket rejects some MIME types (e.g. image/x-icon) — normalize to png/jpeg/webp.
    upload_ctype = ctype if ctype in ("image/png", "image/jpeg", "image/webp", "image/svg+xml") else "image/png"
    if upload_ctype == "image/png" and not ctype.startswith("image/"):
        upload_ctype = "image/png"
    path = f"supplier-logos/{slug}-{int(time.time() * 1000)}{ext_for(upload_ctype, src_url)}"
    try:
        public_url = storage_upload(path, data, upload_ctype)
    except Exception as e:
        # Fall back to website-only so client favicon works
        rest(
            "PATCH",
            f"solution_providers?id=eq.{row['id']}",
            {"website": website, "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
        )
        return {"id": row["id"], "name": name, "ok": False, "reason": f"upload:{e}", "domain": domain}

    rest(
        "PATCH",
        f"solution_providers?id=eq.{row['id']}",
        {
            "website": website,
            "logo_url": public_url,
            "logo_storage_path": path,
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
    )
    return {"id": row["id"], "name": name, "ok": True, "domain": domain, "source": source, "logo": public_url}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="Write website/logo_url (default is dry-run)")
    ap.add_argument("--limit", type=int, default=0, help="Max suppliers to process (0 = all)")
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()
    load_env()

    targets = list_targets(args.limit or None)
    print(f"Targets missing logo_url: {len(targets)}  apply={args.apply}")

    ok = 0
    fail = 0
    website_only = 0
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as ex:
        futures = [ex.submit(process_one, row, args.apply) for row in targets]
        for i, fut in enumerate(as_completed(futures), 1):
            res = fut.result()
            if res.get("ok"):
                ok += 1
                if i <= 20 or i % 50 == 0:
                    print(f"  ✓ {res['name']} → {res.get('domain')} ({res.get('source')})")
            else:
                fail += 1
                if res.get("reason") == "brand_no_image":
                    website_only += 1
                if fail <= 15:
                    print(f"  ✗ {res['name']}: {res.get('reason')}")
            if i % 100 == 0:
                print(f"… {i}/{len(targets)} (ok={ok} fail={fail})")

    print(f"Done. ok={ok} fail={fail} brand_website_fallback≈{website_only}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
