import glob
import logging
import os
import tempfile
import requests
from flask import Flask, jsonify, render_template, request, send_file
from csv_parsing import parse_float_people_csv
from float_api import float_get_allocations, float_get_person_id, float_mark_task_completed
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
    """Return (tustena_user_id, person_fullname) for the authenticated user."""
    template = tustena_get_activity_template(api_key)
    return template["createdById"], tustena_get_current_user_fullname(api_key)


def _resolve_tustena_ids(task: dict, api_key: str, cache: dict) -> dict:
    try:
        parts = task["project_name"].split(" / ", 1)
        contract_code       = parts[0].strip()
        service_description = parts[1].strip() if len(parts) > 1 else ""

        name = task["client_name"]
        if name not in cache["companies"]:
            cache["companies"][name] = tustena_get_company_id(name, api_key)
        company_id = cache["companies"][name]

        key_c = (company_id, contract_code)
        if key_c not in cache["contracts"]:
            cache["contracts"][key_c] = tustena_get_contract_id(company_id, contract_code, api_key)
        contract_id = cache["contracts"][key_c]

        key_s = (contract_id, service_description)
        if key_s not in cache["services"]:
            cache["services"][key_s] = tustena_get_service_id(contract_id, service_description, api_key)
        service_id = cache["services"][key_s]

        return {**task, "company_id": company_id, "contract_id": contract_id, "service_id": service_id}
    except Exception as e:
        logger.exception("Error enriching task %s", task.get("project_name"))
        msg, _ = _friendly_error(e)
        return {**task, "error": msg}


def _enrich_and_check(tasks: list, api_key: str, tustena_user_id: str) -> list:
    """Resolve Tustena IDs and flag duplicate vouchers."""
    cache    = {"companies": {}, "contracts": {}, "services": {}}
    resolved = [_resolve_tustena_ids(task, api_key, cache) for task in tasks]
    ok_tasks = [task for task in resolved if "error" not in task]

    # Build per-company date ranges
    company_dates: dict[int, tuple] = {}
    for task in ok_tasks:
        company_id, start_date = task["company_id"], task["start_date"]
        date_from, date_to = company_dates.get(company_id, (start_date, start_date))
        company_dates[company_id] = (min(date_from, start_date), max(date_to, start_date))

    # Fetch existing voucher subjects
    subjects: dict = {}
    for company_id, (date_from, date_to) in company_dates.items():
        try:
            subjects |= {(company_id, day): s for day, s in tustena_get_existing_voucher_subjects(date_from, date_to, company_id, api_key, tustena_user_id).items()}
        except Exception:
            logger.exception("Failed to fetch existing subjects for company %s (%s – %s)", company_id, date_from, date_to)

    for task in ok_tasks:
        task["exists"] = f"{task['client_name']} / {task['project_name']}" in subjects.get((task["company_id"], task["start_date"]), set())

    return resolved


def _filter_tasks_by_date(tasks: list, date: str, date_from: str, date_to: str) -> list:
    if date:
        return [task for task in tasks if task["start_date"] == date]
    filtered = tasks
    if date_from:
        filtered = [task for task in filtered if task["start_date"] >= date_from]
    if date_to:
        filtered = [task for task in filtered if task["start_date"] <= date_to]
    return filtered


# ── Routes ───────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template(
        "index.html",
        tustena_api_key=os.environ.get("TUSTENA_API_KEY", ""),
        float_api_key=os.environ.get("FLOAT_API_KEY", ""),
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
        services = tustena_search_services(company_name, contract_code, tustena_api_key)
        return jsonify({"services": services})
    except Exception as e:
        msg, status = _friendly_error(e)
        return jsonify({"error": msg}), status


@app.route("/latest_csv")
def latest_csv():
    downloads = os.path.join(os.path.expanduser("~"), "Downloads")
    files = glob.glob(os.path.join(downloads, "float-people-*.csv"))
    if not files:
        return jsonify({"error": "Nessun file float-people-*.csv trovato in ~/Downloads"}), 404
    latest = max(files, key=os.path.getmtime)
    return send_file(latest, mimetype="text/csv", as_attachment=True,
                     download_name=os.path.basename(latest))


@app.route("/preview", methods=["POST"])
def preview():
    try:
        data            = request.get_json(force=True)
        tustena_api_key = data["tustena_api_key"]
        float_api_key   = data["float_api_key"]
        start           = data.get("date") or data.get("date_from")
        end             = data.get("date") or data.get("date_to")

        tustena_user_id, person_name = _get_tustena_context(tustena_api_key)
        float_people_id = float_get_person_id(person_name, float_api_key)
        tasks    = float_get_allocations(float_people_id, start, end, float_api_key)
        enriched = _enrich_and_check(tasks, tustena_api_key, tustena_user_id)
        return jsonify({"allocations": enriched})
    except Exception as e:
        logger.exception("Unhandled error in /preview")
        msg, status = _friendly_error(e)
        return jsonify({"error": msg}), status


@app.route("/preview_csv", methods=["POST"])
def preview_csv():
    try:
        tustena_api_key = request.form.get("tustena_api_key", "").strip()
        csv_file        = request.files.get("csv_file")
        if not tustena_api_key:
            return jsonify({"error": "API key mancante"}), 400
        if not csv_file:
            return jsonify({"error": "File CSV mancante"}), 400

        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as tmp:
            csv_file.save(tmp.name)
            tmp_path = tmp.name
        try:
            tasks = parse_float_people_csv(tmp_path)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        finally:
            os.unlink(tmp_path)

        if not tasks:
            return jsonify({"error": "Nessuna allocazione billable trovata nel CSV."}), 400

        tustena_user_id, person_name = _get_tustena_context(tustena_api_key)
        csv_names = {t["name"] for t in tasks}
        if len(csv_names) > 1:
            return jsonify({"error": f"Il CSV contiene più persone: {sorted(csv_names)}. Esporta un CSV per singola persona."}), 400
        csv_name = next(iter(csv_names))
        if csv_name.lower() != person_name.lower():
            return jsonify({"error": f"Il CSV appartiene a '{csv_name}', non a '{person_name}'."}), 400

        tasks    = _filter_tasks_by_date(tasks,
                       request.form.get("date", "").strip(),
                       request.form.get("date_from", "").strip(),
                       request.form.get("date_to", "").strip())
        enriched = _enrich_and_check(tasks, tustena_api_key, tustena_user_id)
        return jsonify({"allocations": enriched})
    except Exception as e:
        logger.exception("Unhandled error in /preview_csv")
        msg, status = _friendly_error(e)
        return jsonify({"error": msg}), status


@app.route("/run", methods=["POST"])
def run():
    try:
        data            = request.get_json(force=True)
        tustena_api_key = data["tustena_api_key"]
        float_api_key   = data.get("float_api_key", "")
        tasks           = data["tasks"]
        template        = tustena_get_activity_template(tustena_api_key)
        results         = []
        for task in tasks:
            try:
                voucher_id = tustena_create_voucher(task, tustena_api_key, template)
                if float_api_key and task.get("task_id"):
                    float_mark_task_completed(task["task_id"], float_api_key)
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
    app.run(host="0.0.0.0", port=5000, debug=False)
