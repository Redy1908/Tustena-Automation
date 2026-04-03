import pytest
import requests as req
from unittest.mock import patch, MagicMock
from conftest import SAMPLE_ICAL, SAMPLE_TASK, ENRICHED_TASK


# ── _resolve_tustena_ids ──────────────────────────────────────────────────────

def test_resolve_tustena_ids_success():
    from web_app import _resolve_tustena_ids
    cache = {"companies": {}, "contracts": {}, "services": {}}
    with (
        patch("web_app.tustena_get_company_id", return_value=1),
        patch("web_app.tustena_get_contract_id", return_value=10),
        patch("web_app.tustena_get_service_id", return_value=100),
    ):
        result = _resolve_tustena_ids(SAMPLE_TASK, "key", cache)
    assert result["company_id"] == 1
    assert result["contract_id"] == 10
    assert result["service_id"] == 100
    assert "error" not in result


def test_resolve_tustena_ids_company_not_found():
    from web_app import _resolve_tustena_ids
    cache = {"companies": {}, "contracts": {}, "services": {}}
    with patch("web_app.tustena_get_company_id", side_effect=ValueError("Nessun match trovato per 'ACME S.P.A.'")):
        result = _resolve_tustena_ids(SAMPLE_TASK, "key", cache)
    assert "error" in result


def test_resolve_tustena_ids_contract_not_found():
    from web_app import _resolve_tustena_ids
    cache = {"companies": {}, "contracts": {}, "services": {}}
    with (
        patch("web_app.tustena_get_company_id", return_value=1),
        patch("web_app.tustena_get_contract_id", side_effect=ValueError("Nessun match trovato")),
    ):
        result = _resolve_tustena_ids(SAMPLE_TASK, "key", cache)
    assert "error" in result
    assert result.get("error_type") == "contract"


def test_resolve_tustena_ids_service_not_found():
    from web_app import _resolve_tustena_ids
    cache = {"companies": {}, "contracts": {}, "services": {}}
    with (
        patch("web_app.tustena_get_company_id", return_value=1),
        patch("web_app.tustena_get_contract_id", return_value=10),
        patch("web_app.tustena_get_service_id", side_effect=ValueError("Nessun match trovato")),
    ):
        result = _resolve_tustena_ids(SAMPLE_TASK, "key", cache)
    assert "error" in result
    assert result.get("error_type") == "service"


def test_resolve_tustena_ids_caches_company():
    from web_app import _resolve_tustena_ids
    cache = {"companies": {}, "contracts": {}, "services": {}}
    with (
        patch("web_app.tustena_get_company_id", return_value=1) as mock_company,
        patch("web_app.tustena_get_contract_id", return_value=10),
        patch("web_app.tustena_get_service_id", return_value=100),
    ):
        _resolve_tustena_ids(SAMPLE_TASK, "key", cache)
        _resolve_tustena_ids(SAMPLE_TASK, "key", cache)
    mock_company.assert_called_once()


# ── /preview_ical route ───────────────────────────────────────────────────────

def test_preview_ical_missing_api_key(flask_client):
    resp = flask_client.post("/preview_ical", json={"ical_url": "http://example.com/cal.ics"})
    assert resp.status_code == 400


def test_preview_ical_missing_ical_url(flask_client):
    resp = flask_client.post("/preview_ical", json={"tustena_api_key": "key"})
    assert resp.status_code == 400


def test_preview_ical_success(flask_client):
    with (
        patch("web_app.requests.get", return_value=MagicMock(text=SAMPLE_ICAL, raise_for_status=lambda: None)),
        patch("web_app.tustena_get_company_id", return_value=1),
        patch("web_app.tustena_get_contract_id", return_value=10),
        patch("web_app.tustena_get_service_id", return_value=100),
        patch("web_app.tustena_get_existing_voucher_subjects", return_value={}),
        patch("ical_parsing._italian_holidays", return_value=set()),
    ):
        resp = flask_client.post("/preview_ical", json={
            "tustena_api_key": "key",
            "ical_url": "http://example.com/cal.ics",
            "skip_holidays": False,
        })
    assert resp.status_code == 200
    data = resp.get_json()
    assert "allocations" in data
    assert len(data["allocations"]) > 0


def test_preview_ical_date_filter(flask_client):
    with (
        patch("web_app.requests.get", return_value=MagicMock(text=SAMPLE_ICAL, raise_for_status=lambda: None)),
        patch("web_app.tustena_get_company_id", return_value=1),
        patch("web_app.tustena_get_contract_id", return_value=10),
        patch("web_app.tustena_get_service_id", return_value=100),
        patch("web_app.tustena_get_existing_voucher_subjects", return_value={}),
        patch("ical_parsing._italian_holidays", return_value=set()),
    ):
        resp = flask_client.post("/preview_ical", json={
            "tustena_api_key": "key",
            "ical_url": "http://example.com/cal.ics",
            "skip_holidays": False,
            "date_from": "2025-01-06",
            "date_to": "2025-01-06",
        })
    assert resp.status_code == 200
    data = resp.get_json()
    assert all(t["start_date"] == "2025-01-06" for t in data["allocations"] if "error" not in t)


def test_preview_ical_unhandled_error(flask_client):
    with patch("web_app.requests.get", side_effect=Exception("network failure")):
        resp = flask_client.post("/preview_ical", json={
            "tustena_api_key": "key",
            "ical_url": "http://example.com/cal.ics",
        })
    assert resp.status_code == 500


def test_preview_ical_empty_tasks(flask_client):
    with (
        patch("web_app.requests.get", return_value=MagicMock(text="BEGIN:VCALENDAR\nEND:VCALENDAR", raise_for_status=lambda: None)),
        patch("ical_parsing._italian_holidays", return_value=set()),
    ):
        resp = flask_client.post("/preview_ical", json={
            "tustena_api_key": "key",
            "ical_url": "http://example.com/cal.ics",
            "skip_holidays": False,
        })
    assert resp.status_code == 400
    assert "Nessuna allocazione" in resp.get_json()["error"]


# ── /search_company route ─────────────────────────────────────────────────────

def test_search_company_missing_api_key(flask_client):
    resp = flask_client.get("/search_company?q=ACME")
    assert resp.status_code == 400


def test_search_company_missing_query_returns_empty(flask_client):
    resp = flask_client.get("/search_company?tustena_api_key=key")
    assert resp.status_code == 200
    assert resp.get_json()["companies"] == []


def test_search_company_success(flask_client):
    with patch("web_app.tustena_search_companies", return_value=["ACME S.P.A."]):
        resp = flask_client.get("/search_company?tustena_api_key=key&q=ACME")
    assert resp.status_code == 200
    assert resp.get_json()["companies"] == ["ACME S.P.A."]


def test_search_company_api_error(flask_client):
    with patch("web_app.tustena_search_companies", side_effect=ValueError("Errore")):
        resp = flask_client.get("/search_company?tustena_api_key=key&q=ACME")
    assert resp.status_code == 500


# ── /search_services route ────────────────────────────────────────────────────

def test_search_services_missing_api_key(flask_client):
    resp = flask_client.get("/search_services?company=ACME&contract=PS-001")
    assert resp.status_code == 400


def test_search_services_missing_params_returns_empty(flask_client):
    resp = flask_client.get("/search_services?tustena_api_key=key&company=ACME")
    assert resp.status_code == 200
    assert resp.get_json()["services"] == []


def test_search_services_success(flask_client):
    with patch("web_app.tustena_search_services", return_value=["Platform Support"]):
        resp = flask_client.get("/search_services?tustena_api_key=key&company=ACME&contract=PS-001")
    assert resp.status_code == 200
    assert resp.get_json()["services"] == ["Platform Support"]


def test_search_services_invalid_company_mapping_ignored(flask_client):
    with patch("web_app.tustena_search_services", return_value=["Platform Support"]):
        resp = flask_client.get("/search_services?tustena_api_key=key&company=ACME&contract=PS-001&company_mapping=NOT_JSON")
    assert resp.status_code == 200
    assert resp.get_json()["services"] == ["Platform Support"]


def test_search_services_api_error(flask_client):
    with patch("web_app.tustena_search_services", side_effect=ValueError("Errore")):
        resp = flask_client.get("/search_services?tustena_api_key=key&company=ACME&contract=PS-001")
    assert resp.status_code == 500


# ── /run route ────────────────────────────────────────────────────────────────

def test_run_missing_api_key(flask_client):
    resp = flask_client.post("/run", json={"tasks": []})
    assert resp.status_code == 500


def test_run_success(flask_client):
    task = {**ENRICHED_TASK, "start_time": "09:00", "end_time": "11:00", "description": "Test"}
    with (
        patch("web_app.tustena_get_activity_template", return_value={"createdById": "42"}),
        patch("web_app.tustena_create_voucher", return_value={"id": 999}),
    ):
        resp = flask_client.post("/run", json={"tustena_api_key": "key", "tasks": [task]})
    assert resp.status_code == 200
    assert resp.get_json()["results"][0]["ok"] is True


def test_run_task_creation_error_returns_partial(flask_client):
    task = {**ENRICHED_TASK, "start_time": "09:00", "end_time": "11:00", "description": "Test"}
    with (
        patch("web_app.tustena_get_activity_template", return_value={"createdById": "42"}),
        patch("web_app.tustena_create_voucher", side_effect=ValueError("Errore creazione")),
    ):
        resp = flask_client.post("/run", json={"tustena_api_key": "key", "tasks": [task]})
    assert resp.status_code == 200
    assert resp.get_json()["results"][0]["ok"] is False


# ── _enrich_and_check ─────────────────────────────────────────────────────────

def test_enrich_and_check_subjects_fetch_failure():
    from web_app import _enrich_and_check
    with (
        patch("web_app.tustena_get_company_id", return_value=1),
        patch("web_app.tustena_get_contract_id", return_value=10),
        patch("web_app.tustena_get_service_id", return_value=100),
        patch("web_app.tustena_get_existing_voucher_subjects", side_effect=Exception("network error")),
    ):
        result = _enrich_and_check([SAMPLE_TASK], "key", "42")
    assert len(result) == 1
    assert "error" not in result[0]


# ── _friendly_error ───────────────────────────────────────────────────────────

def test_friendly_error_401(flask_client):
    from web_app import _friendly_error
    e = req.HTTPError(response=MagicMock(status_code=401))
    msg, status = _friendly_error(e)
    assert status == 401
    assert "API key" in msg


def test_friendly_error_403(flask_client):
    from web_app import _friendly_error
    e = req.HTTPError(response=MagicMock(status_code=403))
    msg, status = _friendly_error(e)
    assert status == 403


def test_friendly_error_404(flask_client):
    from web_app import _friendly_error
    e = req.HTTPError(response=MagicMock(status_code=404))
    msg, status = _friendly_error(e)
    assert status == 404


def test_friendly_error_500(flask_client):
    from web_app import _friendly_error
    e = req.HTTPError(response=MagicMock(status_code=503))
    msg, status = _friendly_error(e)
    assert status == 502


def test_friendly_error_other_http(flask_client):
    from web_app import _friendly_error
    e = req.HTTPError(response=MagicMock(status_code=422))
    msg, status = _friendly_error(e)
    assert status == 422


def test_friendly_error_non_http(flask_client):
    from web_app import _friendly_error
    msg, status = _friendly_error(ValueError("qualcosa è andato storto"))
    assert status == 500
    assert "qualcosa" in msg


# ── / index route ─────────────────────────────────────────────────────────────

def test_index(flask_client):
    resp = flask_client.get("/")
    assert resp.status_code == 200
