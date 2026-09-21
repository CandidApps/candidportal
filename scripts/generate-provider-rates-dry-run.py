#!/usr/bin/env python3
"""Generate local dry-run SQL/CSV from Suppliers_Final.xlsx Provider Rates.

Writes docs/earnings-import-dry-run/* — does NOT touch production.
"""

from __future__ import annotations

import csv
import json
import re
from collections import Counter
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "Suppliers_Final.xlsx"
OUT = ROOT / "docs" / "earnings-import-dry-run"


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").strip().lower())
    return s.strip("-") or "unknown"


def yesno(v):
    if v is None:
        return None
    s = str(v).strip().lower()
    if s == "yes":
        return True
    if s == "no":
        return False
    return None


def num(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace("%", "")
    try:
        return float(s)
    except ValueError:
        return None


def sql_str(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def sql_bool(v):
    if v is None:
        return "NULL"
    return "TRUE" if v else "FALSE"


def sql_num(v):
    if v is None:
        return "NULL"
    return repr(float(v))


def norm_payment_basis(sandler_method, intelisys_payment):
    sm = (sandler_method or "").strip().lower()
    if sm == "collected":
        return "collected"
    if sm == "billed":
        return "billed"
    ip = (intelisys_payment or "").lower()
    if "after collections" in ip or "collection" in ip:
        return "collected"
    if "after activation" in ip:
        return "billed"
    if sandler_method or intelisys_payment:
        return "other"
    return None


def norm_paid_on(telarus_paid_on, sandler_upfront):
    t = (telarus_paid_on or "").strip()
    tl = t.lower()
    mapping = {
        "overall": "overall_mrc",
        "loop & port": "loop_and_port",
        "port only": "port_only",
        "install": "install",
        "cpe mrc": "cpe_mrc",
        "one-time commission upfront": "one_time_upfront",
        "one-time fixed commission": "one_time_fixed",
        "monthly fixed commission": "monthly_fixed",
        "sd-wan": "sd_wan",
        "ldu only/plus": "ldu",
        "ld all": "ld_all",
        "quarterly": "quarterly",
    }
    if tl in mapping:
        return mapping[tl]
    if t:
        return "other"
    if sandler_upfront and str(sandler_upfront).strip():
        return "has_upfront_schedule"
    return None


def norm_renewal(sandler_renewals, note, telarus_term):
    sr = (sandler_renewals or "").strip()
    n = (note or "").lower()
    pays = None
    scope = None
    if "not applicable for renewal" in n or "only applicable for initial" in n:
        scope = "initial_term_only"
        pays = False
    elif "initial" in n and "renewal" in n:
        scope = "initial_and_renewal"
        pays = True
    elif "new logo" in n:
        scope = "new_logo_and_follow_on"
    srl = sr.lower()
    if srl.startswith("yes") and "100%" in srl:
        pays = True
        scope = scope or "renewals_at_standard_rate"
    elif srl.startswith("no"):
        pays = False
        scope = scope or "no_renewal_pay"
    elif "special renewal" in srl:
        pays = True
        scope = "renewals_special_rate"
    elif sr:
        scope = scope or "renewals_see_notes"
    term = (telarus_term or "").strip() or None
    return pays, scope, term


def norm_evergreen(v):
    if not v:
        return None
    sl = str(v).strip().lower()
    if "strong evergreen" in sl:
        return "strong"
    if "medium evergreen" in sl:
        return "medium"
    if "with risk" in sl:
        return "with_risk"
    if "no evergreen" in sl:
        return "none"
    return "other"


def main() -> None:
    if not PATH.exists():
        raise SystemExit(f"Missing {PATH}")

    OUT.mkdir(parents=True, exist_ok=True)
    wb = openpyxl.load_workbook(PATH, read_only=True, data_only=True)
    ws = wb["Provider Rates"]
    it = ws.iter_rows(values_only=True)
    next(it)  # header

    providers: dict[str, dict] = {}
    products: list[dict] = []

    for sheet_row, row in enumerate(it, start=2):
        if all(v is None or str(v).strip() == "" for v in (row[0], row[1], row[2])):
            continue
        category = (str(row[0]).strip() if row[0] is not None else "") or None
        provider = str(row[1]).strip() if row[1] is not None else ""
        product = str(row[2]).strip() if row[2] is not None else ""
        if not provider or not product:
            continue
        slug = slugify(provider)
        if slug not in providers:
            providers[slug] = {"name": provider, "categories": set()}
        if category:
            providers[slug]["categories"].add(category)

        note = str(row[15]).strip() if row[15] is not None and str(row[15]).strip() else None
        sandler_evergreen, sandler_upfront, sandler_notes = row[16], row[17], row[18]
        sandler_renewals, sandler_method, sandler_first = row[19], row[20], row[21]
        telarus_paid_on, telarus_term, telarus_network, telarus_notes = (
            row[22],
            row[23],
            row[24],
            row[25],
        )
        intelisys_earning, intelisys_payment, intelisys_not_paid = row[26], row[27], row[28]

        pays_renewals, renewal_scope, term_length = norm_renewal(
            sandler_renewals, note, telarus_term
        )
        partner_terms_raw: dict = {}
        if any(
            v is not None and str(v).strip()
            for v in (
                sandler_evergreen,
                sandler_upfront,
                sandler_notes,
                sandler_renewals,
                sandler_method,
                sandler_first,
            )
        ):
            partner_terms_raw["sandler"] = {
                "evergreen_strength": None if sandler_evergreen is None else str(sandler_evergreen),
                "upfront_commissions": None if sandler_upfront is None else str(sandler_upfront),
                "notes": None if sandler_notes is None else str(sandler_notes),
                "pay_on_renewals": None if sandler_renewals is None else str(sandler_renewals),
                "commission_method": None if sandler_method is None else str(sandler_method),
                "estimated_first_commission": None if sandler_first is None else str(sandler_first),
            }
        if any(
            v is not None and str(v).strip()
            for v in (telarus_paid_on, telarus_term, telarus_network, telarus_notes)
        ):
            partner_terms_raw["telarus"] = {
                "paid_on": None if telarus_paid_on is None else str(telarus_paid_on),
                "term": None if telarus_term is None else str(telarus_term),
                "network": None if telarus_network is None else str(telarus_network),
                "notes": None if telarus_notes is None else str(telarus_notes),
            }
        if any(
            v is not None and str(v).strip()
            for v in (intelisys_earning, intelisys_payment, intelisys_not_paid)
        ):
            partner_terms_raw["intelisys"] = {
                "earning_commissions": None if intelisys_earning is None else str(intelisys_earning),
                "payment_of_commissions": None
                if intelisys_payment is None
                else str(intelisys_payment),
                "commissions_not_paid_on": None
                if intelisys_not_paid is None
                else str(intelisys_not_paid),
            }

        products.append(
            {
                "sheet_row": sheet_row,
                "provider_slug": slug,
                "category": category,
                "product_name": product,
                "gross_rate_pct": num(row[3]),
                "note": note,
                "intelisys_supported": yesno(row[4]),
                "sandler_supported": yesno(row[5]),
                "telarus_supported": yesno(row[6]),
                "appdirect_supported": yesno(row[7]),
                "appdirect_saas_supported": yesno(row[8]),
                "candid_net_intelisys": num(row[9]),
                "candid_net_sandler": num(row[10]),
                "candid_net_telarus": num(row[11]),
                "candid_net_appdirect_telco": num(row[12]),
                "candid_net_appdirect_saas": num(row[13]),
                "customer_preview_pct": num(row[14]),
                "renewal_scope": renewal_scope,
                "pays_on_renewals": pays_renewals,
                "payment_basis": norm_payment_basis(sandler_method, intelisys_payment),
                "paid_on_basis": norm_paid_on(telarus_paid_on, sandler_upfront),
                "evergreen_strength": norm_evergreen(sandler_evergreen),
                "first_commission_timing": (
                    None if sandler_first is None or not str(sandler_first).strip() else str(sandler_first).strip()
                ),
                "upfront_summary": (
                    None
                    if sandler_upfront is None or not str(sandler_upfront).strip()
                    else str(sandler_upfront).strip()
                ),
                "exclusions_summary": (
                    None
                    if intelisys_not_paid is None or not str(intelisys_not_paid).strip()
                    else str(intelisys_not_paid).strip()
                ),
                "partner_network": (
                    None
                    if telarus_network is None or not str(telarus_network).strip()
                    else str(telarus_network).strip()
                ),
                "term_length": term_length,
                "partner_terms_raw": partner_terms_raw,
            }
        )

    wb.close()

    # schema is maintained in docs; rewrite providers + csv + copy sql each run
    lines = ["-- DRY RUN ONLY — providers from Provider Rates\nbegin;\n"]
    for slug, meta in sorted(providers.items(), key=lambda x: x[1]["name"].lower()):
        cats = sorted(meta["categories"])
        cat_sql = (
            "ARRAY[" + ",".join(sql_str(c) for c in cats) + "]::text[]"
            if cats
            else "'{}'::text[]"
        )
        lines.append(
            "insert into earnings_dry_run.providers (slug, name, categories) values "
            f"({sql_str(slug)}, {sql_str(meta['name'])}, {cat_sql});"
        )
    lines.append("\ncommit;\n")
    (OUT / "01_providers.sql").write_text("\n".join(lines))

    fieldnames = [
        "sheet_row",
        "provider_slug",
        "category",
        "product_name",
        "gross_rate_pct",
        "intelisys_supported",
        "sandler_supported",
        "telarus_supported",
        "appdirect_supported",
        "appdirect_saas_supported",
        "candid_net_intelisys",
        "candid_net_sandler",
        "candid_net_telarus",
        "candid_net_appdirect_telco",
        "candid_net_appdirect_saas",
        "customer_preview_pct",
        "note",
        "renewal_scope",
        "pays_on_renewals",
        "payment_basis",
        "paid_on_basis",
        "evergreen_strength",
        "first_commission_timing",
        "upfront_summary",
        "exclusions_summary",
        "partner_network",
        "term_length",
        "partner_terms_raw",
    ]
    with (OUT / "02_commission_products.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for p in products:
            row = dict(p)
            row["partner_terms_raw"] = json.dumps(p["partner_terms_raw"], ensure_ascii=False)
            for k in (
                "intelisys_supported",
                "sandler_supported",
                "telarus_supported",
                "appdirect_supported",
                "appdirect_saas_supported",
                "pays_on_renewals",
            ):
                v = row[k]
                row[k] = "" if v is None else ("true" if v else "false")
            for k in (
                "gross_rate_pct",
                "candid_net_intelisys",
                "candid_net_sandler",
                "candid_net_telarus",
                "candid_net_appdirect_telco",
                "candid_net_appdirect_saas",
                "customer_preview_pct",
            ):
                if row[k] is None:
                    row[k] = ""
            w.writerow(row)

    print(
        f"providers={len(providers)} products={len(products)} "
        f"payment_basis={Counter(p['payment_basis'] for p in products if p['payment_basis'])}"
    )
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
