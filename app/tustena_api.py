import json
import os
import requests

_TUSTENA_BASE_URL = "https://kiratechapp.cloud.teamsystem.com:444/api/v1"
_session = requests.Session()

_COMPANY_MAPPING_PATH = os.path.join(os.path.dirname(__file__), "..", "mappings", "company_mapping.json")
_SERVICE_MAPPING_PATH = os.path.join(os.path.dirname(__file__), "..", "mappings", "service_mapping.json")

def _load_mapping(path: str) -> dict:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}

_COMPANY_MAPPING = _load_mapping(_COMPANY_MAPPING_PATH)
_SERVICE_MAPPING = _load_mapping(_SERVICE_MAPPING_PATH)

_VOUCHER_DEFAULTS = {
    "type": 6,
    "subTypeId": 24,
    "state": 2,
    "toDo": 1,
    "FF_ACTIVITY_TYPE": "Remota",
    "FF_BRAND": "ALT",
}


def _get(path: str, api_key: str, params: dict = None) -> dict | list:
    resp = _session.get(
        f"{_TUSTENA_BASE_URL}/{path}",
        params={"apikey": api_key, **(params or {})},
        timeout=20,
    )
    resp.raise_for_status()
    return resp.json()


def _post(path: str, api_key: str, json: dict = None) -> dict | list:
    resp = _session.post(
        f"{_TUSTENA_BASE_URL}/{path}",
        params={"apikey": api_key},
        json=json,
        timeout=20,
    )
    resp.raise_for_status()
    return resp.json()


def tustena_get_current_user_fullname(api_key: str) -> str:
    users = _post("Account/Search", api_key, json={"select": "id,name,surname"})
    if not users:
        raise ValueError("Impossibile recuperare l'utente Tustena autenticato")
    u = users[0]
    return f"{u['name']} {u['surname']}".strip()


def tustena_search_services(company_name: str, contract_code: str, api_key: str) -> list[str]:
    company_id  = tustena_get_company_id(company_name, api_key)
    contract_id = tustena_get_contract_id(company_id, contract_code, api_key)
    services    = _get(f"Contract/{contract_id}/Services", api_key)
    return [s["catalogDescription"] for s in (services or [])]


def tustena_search_companies(query: str, api_key: str) -> list[str]:
    companies = _post("Company/SearchByODataCriteria", api_key,
                      json={"filter": f"substringof('{query}',companyName)", "select": "id,companyName"})
    return [c["companyName"] for c in (companies or [])]


def tustena_get_company_id(company_name: str, api_key: str, overrides: dict = None):
    mapping = _COMPANY_MAPPING.copy()
    if overrides:
        mapping.update(overrides)
    company_name = mapping.get(company_name, company_name)
    companies = _post("Company/SearchByODataCriteria", api_key,
                      json={"filter": f"substringof('{company_name}',companyName)", "select": "id,companyName"})
    if len(companies) == 1:
        return companies[0]["id"]
    elif len(companies) > 1:
        raise ValueError(f"Trovati più match per '{company_name}': {[c['companyName'] for c in companies]}")
    raise ValueError(f"Nessun match trovato per '{company_name}'")


def tustena_get_contract_id(company_id: str, contract_code: str, api_key: str):
    contracts = [c for c in _post("Contract/SearchByODataCriteria", api_key,
                                   json={"filter": f"crossId eq {company_id} and customerCode eq '{contract_code}'",
                                         "select": "id,customerCode"})
                 if c["customerCode"] == contract_code]
    if len(contracts) == 1:
        return contracts[0]["id"]
    elif len(contracts) > 1:
        raise ValueError(f"Trovati più match per '{contract_code}': {[c['id'] for c in contracts]}")
    raise ValueError(f"Nessun match trovato per '{contract_code}'")


def tustena_get_service_id(contract_id: str, service_description: str, api_key: str, overrides: dict = None):
    mapping = _SERVICE_MAPPING.copy()
    if overrides:
        mapping.update(overrides)
    service_description = mapping.get(service_description, service_description)
    all_services = _get(f"Contract/{contract_id}/Services", api_key)
    services = [s for s in all_services
                if s["catalogDescription"].lower() == service_description.lower()]
    if len(services) == 1:
        return services[0]["id"]
    elif len(services) > 1:
        raise ValueError(f"Trovati più match per '{service_description}': {[s['id'] for s in services]}")
    raise ValueError(f"Nessun match trovato per '{service_description}'")


def tustena_get_existing_voucher_subjects(date_from: str, date_to: str, company_id: int, api_key: str, tustena_user_id: str) -> dict:
    from datetime import date, timedelta
    next_day = (date.fromisoformat(date_to) + timedelta(days=1)).isoformat()
    results = _get("Activity/Search", api_key, params={
        "filter": (
            f" companyId eq {company_id}"
            f" and activityDate ge datetime'{date_from}T00:00:00'"
            f" and activityDate lt datetime'{next_day}T00:00:00'"
            f" and createdById eq {tustena_user_id}"
        ),
        "select": "id,subject,activityDate",
    })
    out: dict = {}
    for r in (results or []):
        day = (r.get("activityDate") or "")[:10]
        if day:
            out.setdefault(day, set()).add(r.get("subject", "").strip())
    return out


def tustena_get_activity_template(api_key: str) -> dict:
    return _get("Activity/GetNewInstance", api_key)


def tustena_create_voucher(task: dict, api_key: str, template: dict) -> int:
    date_str = task["start_date"]
    start    = task["start_time"]
    end      = task["end_time"]
    sh, sm   = map(int, start.split(":"))
    eh, em   = map(int, end.split(":"))
    duration = (eh * 60 + em) - (sh * 60 + sm)
    subject  = f"{task['client_name']} / {task['project_name']}"

    payload = {
        **_VOUCHER_DEFAULTS,
        "companyId":         task["company_id"],
        "subject":           subject,
        "description":       task.get("description", ""),
        "contractId":        task["contract_id"],
        "contractServiceId": task["service_id"],
        "activityDate":      f"{date_str}T{start}:00",
        "activityEndDate":   f"{date_str}T{end}:00",
        "duration":          duration,
    }

    return _post("Activity/CreateOrUpdate", api_key, json={**template, **payload})
