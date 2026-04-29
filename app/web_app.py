import json
import logging
import os
import requests
from flask import Flask, jsonify, render_template, request
from ical_parsing import parse_ical_feed
from tustena_api import (
    tustena_get_company_id, tustena_get_contract_id, tustena_get_service_id,
    tustena_create_voucher, tustena_get_existing_voucher_subjects,
    tustena_get_activity_template, tustena_get_current_user_fullname,
    tustena_search_companies, tustena_search_services,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _friendly_error(e: Exception) -> tuple[str, int]:
    if isinstance(e, requests.HTTPError) and e.response is not None:
        status = e.response.status_code
        if status == 401:
            return "API key non valida o scaduta.", 401
        if status == 403:
            return "Accesso non autorizzato.", 403
        if status == 404:
            return "Risorsa non trovata.", 404
        if status >= 500:
            return "Errore del server remoto. Riprova più tardi.", 502
        return f"Errore di comunicazione con il server ({status}).", status
    return str(e), 500


def _get_tustena_context(api_key: str) -> tuple[str, str]:
    template = tustena_get_activity_template(api_key)
    return template["createdById"], tustena_get_current_user_fullname(api_key)


def _resolve_tustena_ids(task: dict, api_key: str, cache: dict, company_mapping: dict = None, service_mapping: dict = None) -> dict:
    if "error" in task:
        return task
    contract_code       = task.get("contract_code", "")
    service_description = task.get("service_description", "")
    name = task.get("client_name", "")

    try:
        if name not in cache["companies"]:
            cache["companies"][name] = tustena_get_company_id(name, api_key, overrides=company_mapping)
        company_id = cache["companies"][name]
    except Exception as e:
        msg, _ = _friendly_error(e)
        return {**task, "error": msg, "error_type": "company", "error_query": name}

    try:
        key_c = (company_id, contract_code)
        if key_c not in cache["contracts"]:
            cache["contracts"][key_c] = tustena_get_contract_id(company_id, contract_code, api_key)
        contract_id = cache["contracts"][key_c]
    except Exception as e:
        msg, _ = _friendly_error(e)
        return {**task, "error": msg, "error_type": "contract", "error_query": contract_code, "company_name": name}

    try:
        key_s = (contract_id, service_description)
        if key_s not in cache["services"]:
            cache["services"][key_s] = tustena_get_service_id(contract_id, service_description, api_key, overrides=service_mapping)
        service_id = cache["services"][key_s]
    except Exception as e:
        msg, _ = _friendly_error(e)
        return {**task, "error": msg, "error_type": "service", "error_query": service_description, "company_name": name, "contract_code": contract_code}

    return {**task, "company_id": company_id, "contract_id": contract_id, "service_id": service_id}


def _enrich_and_check(tasks: list, api_key: str, tustena_user_id: str, company_mapping: dict = None, service_mapping: dict = None) -> list:
    cache    = {"companies": {}, "contracts": {}, "services": {}}
    resolved = [_resolve_tustena_ids(task, api_key, cache, company_mapping, service_mapping) for task in tasks]
    ok_tasks = [task for task in resolved if "error" not in task]

    company_dates: dict[int, tuple] = {}
    for task in ok_tasks:
        company_id, start_date = task["company_id"], task["start_date"]
        date_from, date_to = company_dates.get(company_id, (start_date, start_date))
        company_dates[company_id] = (min(date_from, start_date), max(date_to, start_date))

    subjects: dict = {}
    for company_id, (date_from, date_to) in company_dates.items():
        try:
            subjects |= {(company_id, day): s for day, s in tustena_get_existing_voucher_subjects(date_from, date_to, company_id, api_key, tustena_user_id).items()}
        except Exception as e:
            logger.error("Failed to fetch existing subjects for company %s: %s", company_id, e)

    for task in ok_tasks:
        task["exists"] = f"{task['client_name']} / {task['contract_code']} / {task['service_description']}" in subjects.get((task["company_id"], task["start_date"]), set())

    return sorted(resolved, key=lambda t: t["start_date"])


# ── Routes ───────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template(
        "index.html",
        tustena_api_key=os.environ.get("TUSTENA_API_KEY", ""),
        float_ical_url=os.environ.get("FLOAT_ICAL_URL", ""),
    )


@app.route("/search_company")
def search_company():
    try:
        tustena_api_key = request.args.get("tustena_api_key", "").strip()
        query           = request.args.get("q", "").strip()
        if not tustena_api_key:
            return jsonify({"error": "API key mancante"}), 400
        if not query:
            return jsonify({"companies": []})
        companies = tustena_search_companies(query, tustena_api_key)
        return jsonify({"companies": companies})
    except Exception as e:
        msg, status = _friendly_error(e)
        return jsonify({"error": msg}), status


@app.route("/search_services")
def search_services():
    try:
        tustena_api_key = request.args.get("tustena_api_key", "").strip()
        company_name    = request.args.get("company", "").strip()
        contract_code   = request.args.get("contract", "").strip()
        if not tustena_api_key:
            return jsonify({"error": "API key mancante"}), 400
        if not company_name or not contract_code:
            return jsonify({"services": []})
        raw_cm = request.args.get("company_mapping", "")
        company_overrides = {}
        if raw_cm:
            try:
                company_overrides = json.loads(raw_cm)
            except (ValueError, TypeError):
                pass
        services = tustena_search_services(company_name, contract_code, tustena_api_key, company_overrides=company_overrides)
        return jsonify({"services": services})
    except Exception as e:
        msg, status = _friendly_error(e)
        return jsonify({"error": msg}), status


@app.route("/preview_ical", methods=["POST"])
def preview_ical():
    try:
        data            = request.get_json(force=True)
        tustena_api_key = data.get("tustena_api_key", "").strip()
        ical_url        = data.get("ical_url", "").strip() or os.environ.get("FLOAT_ICAL_URL", "").strip()
        if not tustena_api_key:
            return jsonify({"error": "API key Tustena mancante."}), 400
        if not ical_url:
            return jsonify({"error": "URL iCal mancante."}), 400

        resp = requests.get(ical_url, timeout=30)
        resp.raise_for_status()
        resp.encoding = 'utf-8'

        skip_holidays = data.get("skip_holidays", True)
        date_from     = data.get("date_from", "").strip()
        date_to       = data.get("date_to", "").strip()
        tasks = parse_ical_feed(resp.text, skip_holidays=skip_holidays)
        if date_from:
            tasks = [t for t in tasks if t["start_date"] >= date_from]
        if date_to:
            tasks = [t for t in tasks if t["start_date"] <= date_to]

        if not tasks:
            return jsonify({"error": "Nessuna allocazione trovata nel feed iCal per il periodo selezionato."}), 400

        tustena_user_id, _ = _get_tustena_context(tustena_api_key)
        cm = json.loads(data.get("company_mapping") or "{}")
        sm = json.loads(data.get("service_mapping") or "{}")

        enriched = _enrich_and_check(tasks, tustena_api_key, tustena_user_id, cm, sm)
        return jsonify({"allocations": enriched})
    except Exception as e:
        logger.exception("Unhandled error in /preview_ical")
        msg, status = _friendly_error(e)
        return jsonify({"error": msg}), status


@app.route("/run", methods=["POST"])
def run():
    try:
        data            = request.get_json(force=True)
        tustena_api_key = data["tustena_api_key"]
        tasks           = data["tasks"]
        template        = tustena_get_activity_template(tustena_api_key)
        results         = []
        for task in tasks:
            try:
                voucher_id = tustena_create_voucher(task, tustena_api_key, template)
                results.append({"date": task["start_date"], "id": voucher_id, "ok": True})
            except Exception as e:
                err_msg, _ = _friendly_error(e)
                results.append({"date": task["start_date"], "error": err_msg, "ok": False})
        return jsonify({"results": results})
    except Exception as e:
        logger.exception("Unhandled error in /run")
        msg, status = _friendly_error(e)
        return jsonify({"error": msg}), status


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False)
