#!/usr/bin/env python3
"""Load Provider Rates dry-run into public.earnings_dry_run_* via PostgREST."""

from __future__ import annotations

import csv
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV = ROOT / ".env.local"
CSV_PATH = ROOT / "docs" / "earnings-import-dry-run" / "02_commission_products.csv"
PROV_SQL = ROOT / "docs" / "earnings-import-dry-run" / "01_providers.sql"


def load_env() -> None:
    for line in ENV.read_text().splitlines():
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.strip())
        if not m:
            continue
        k, v = m.group(1), m.group(2)
        if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
            v = v[1:-1]
        os.environ.setdefault(k, v)


def rest(method: str, path: str, body=None, prefer: str | None = None):
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/" + path
    headers = {
        "apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        "Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_ROLE_KEY']}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path}: {e.code} {e.read().decode()}") from e


def parse_bool(v: str):
    if v == "" or v is None:
        return None
    if v == "true":
        return True
    if v == "false":
        return False
    return None


def parse_num(v: str):
    if v == "" or v is None:
        return None
    try:
        return float(v)
    except ValueError:
        return None


def main() -> None:
    load_env()
    # wipe
    rest("DELETE", "earnings_dry_run_commission_products?id=gt.0", prefer="return=minimal")
    rest("DELETE", "earnings_dry_run_providers?id=gt.0", prefer="return=minimal")

    prov_sql = PROV_SQL.read_text()
    providers = []
    for line in prov_sql.splitlines():
        if not line.startswith("insert into earnings_dry_run.providers"):
            continue
        m = re.match(
            r"insert into earnings_dry_run\.providers \(slug, name, categories\) values \('((?:[^']|'')*)', '((?:[^']|'')*)', (.+)\);$",
            line,
        )
        if not m:
            raise RuntimeError(f"Unparsed provider line: {line[:160]}")
        slug = m.group(1).replace("''", "'")
        name = m.group(2).replace("''", "'")
        cats: list[str] = []
        cat_expr = m.group(3)
        if cat_expr.startswith("ARRAY["):
            inner = cat_expr[len("ARRAY[") : cat_expr.index("]::text[]")]
            cats = [x.replace("''", "'") for x in re.findall(r"'((?:[^']|'')*)'", inner)]
        providers.append({"slug": slug, "name": name, "categories": cats})

    if not providers:
        raise RuntimeError("No providers parsed from 01_providers.sql")

    print(f"providers: {len(providers)}")
    for i in range(0, len(providers), 200):
        chunk = providers[i : i + 200]
        rest("POST", "earnings_dry_run_providers", chunk, prefer="return=minimal")
        print(f"  providers {min(i+200, len(providers))}/{len(providers)}")

    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    products = []
    for r in rows:
        raw = r.get("partner_terms_raw") or "{}"
        try:
            partner_terms_raw = json.loads(raw)
        except json.JSONDecodeError:
            partner_terms_raw = {}
        products.append(
            {
                "sheet_row": int(r["sheet_row"]),
                "provider_slug": r["provider_slug"],
                "category": r["category"] or None,
                "product_name": r["product_name"],
                "gross_rate_pct": parse_num(r["gross_rate_pct"]),
                "intelisys_supported": parse_bool(r["intelisys_supported"]),
                "sandler_supported": parse_bool(r["sandler_supported"]),
                "telarus_supported": parse_bool(r["telarus_supported"]),
                "appdirect_supported": parse_bool(r["appdirect_supported"]),
                "appdirect_saas_supported": parse_bool(r["appdirect_saas_supported"]),
                "candid_net_intelisys": parse_num(r["candid_net_intelisys"]),
                "candid_net_sandler": parse_num(r["candid_net_sandler"]),
                "candid_net_telarus": parse_num(r["candid_net_telarus"]),
                "candid_net_appdirect_telco": parse_num(r["candid_net_appdirect_telco"]),
                "candid_net_appdirect_saas": parse_num(r["candid_net_appdirect_saas"]),
                "customer_preview_pct": parse_num(r["customer_preview_pct"]),
                "note": r["note"] or None,
                "renewal_scope": r["renewal_scope"] or None,
                "pays_on_renewals": parse_bool(r["pays_on_renewals"]),
                "payment_basis": r["payment_basis"] or None,
                "paid_on_basis": r["paid_on_basis"] or None,
                "evergreen_strength": r["evergreen_strength"] or None,
                "first_commission_timing": r["first_commission_timing"] or None,
                "upfront_summary": r["upfront_summary"] or None,
                "exclusions_summary": r["exclusions_summary"] or None,
                "partner_network": r["partner_network"] or None,
                "term_length": r["term_length"] or None,
                "partner_terms_raw": partner_terms_raw,
            }
        )

    print(f"products: {len(products)}")
    for i in range(0, len(products), 100):
        chunk = products[i : i + 100]
        rest("POST", "earnings_dry_run_commission_products", chunk, prefer="return=minimal")
        print(f"  products {min(i+100, len(products))}/{len(products)}")

    print("done")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(e, file=sys.stderr)
        sys.exit(1)
