import pytest
from unittest.mock import patch, MagicMock
from conftest import make_mock_response


@pytest.fixture
def mock_session():
    with patch("tustena_api._session") as m:
        yield m


# ── tustena_get_company_id ────────────────────────────────────────────────────

def test_get_company_id_single_match(mock_session):
    mock_session.post.return_value = make_mock_response([{"id": 42, "companyName": "ACME S.P.A."}])
    from tustena_api import tustena_get_company_id
    assert tustena_get_company_id("ACME S.P.A.", "key") == 42


def test_get_company_id_no_match_raises(mock_session):
    mock_session.post.return_value = make_mock_response([])
    from tustena_api import tustena_get_company_id
    with pytest.raises(ValueError, match="Nessun match trovato"):
        tustena_get_company_id("UNKNOWN", "key")


def test_get_company_id_multiple_matches_raises(mock_session):
    mock_session.post.return_value = make_mock_response([
        {"id": 1, "companyName": "ACME S.P.A."},
        {"id": 2, "companyName": "ACME S.R.L."},
    ])
    from tustena_api import tustena_get_company_id
    with pytest.raises(ValueError, match="più match"):
        tustena_get_company_id("ACME", "key")


def test_get_company_id_applies_mapping(mock_session):
    mock_session.post.return_value = make_mock_response([{"id": 99, "companyName": "ACME MAPPED"}])
    from tustena_api import tustena_get_company_id
    result = tustena_get_company_id("ACME ORIGINAL", "key", overrides={"ACME ORIGINAL": "ACME MAPPED"})
    assert result == 99
    called_body = mock_session.post.call_args[1]["json"]
    assert "ACME MAPPED" in called_body["filter"]


# ── tustena_get_contract_id ───────────────────────────────────────────────────

def test_get_contract_id_single_match(mock_session):
    mock_session.post.return_value = make_mock_response([{"id": 10, "customerCode": "PS-043-26"}])
    from tustena_api import tustena_get_contract_id
    assert tustena_get_contract_id(42, "PS-043-26", "key") == 10


def test_get_contract_id_no_match_raises(mock_session):
    mock_session.post.return_value = make_mock_response([])
    from tustena_api import tustena_get_contract_id
    with pytest.raises(ValueError, match="Nessun match trovato"):
        tustena_get_contract_id(42, "PS-999-99", "key")


# ── tustena_get_service_id ────────────────────────────────────────────────────

def test_get_service_id_single_match(mock_session):
    mock_session.get.return_value = make_mock_response([
        {"id": 100, "catalogDescription": "Platform Support"},
    ])
    from tustena_api import tustena_get_service_id
    assert tustena_get_service_id(10, "Platform Support", "key") == 100


def test_get_service_id_case_insensitive(mock_session):
    mock_session.get.return_value = make_mock_response([
        {"id": 100, "catalogDescription": "Platform Support"},
    ])
    from tustena_api import tustena_get_service_id
    assert tustena_get_service_id(10, "platform support", "key") == 100


def test_get_service_id_applies_mapping(mock_session):
    mock_session.get.return_value = make_mock_response([
        {"id": 100, "catalogDescription": "Platform Support Mapped"},
    ])
    from tustena_api import tustena_get_service_id
    result = tustena_get_service_id(10, "Platform Support", "key", overrides={"Platform Support": "Platform Support Mapped"})
    assert result == 100


def test_get_service_id_no_match_raises(mock_session):
    mock_session.get.return_value = make_mock_response([
        {"id": 100, "catalogDescription": "Other Service"},
    ])
    from tustena_api import tustena_get_service_id
    with pytest.raises(ValueError, match="Nessun match trovato"):
        tustena_get_service_id(10, "Nonexistent", "key")


# ── tustena_create_voucher ────────────────────────────────────────────────────

def test_create_voucher_payload(mock_session):
    mock_session.post.return_value = make_mock_response({"id": 999})
    from tustena_api import tustena_create_voucher
    task = {
        "client_name":  "ACME S.P.A.",
        "project_name": "PS-043-26 / Platform Support",
        "company_id":   1,
        "contract_id":  10,
        "service_id":   100,
        "start_date":   "2025-01-06",
        "start_time":   "09:00",
        "end_time":     "11:00",
        "description":  "Test note",
    }
    tustena_create_voucher(task, "key", {})
    payload = mock_session.post.call_args[1]["json"]
    assert payload["subject"] == "ACME S.P.A. / PS-043-26 / Platform Support"
    assert payload["duration"] == 120
    assert payload["activityDate"] == "2025-01-06T09:00:00"
    assert payload["activityEndDate"] == "2025-01-06T11:00:00"
    assert payload["companyId"] == 1
    assert payload["contractId"] == 10
    assert payload["contractServiceId"] == 100


# ── tustena_get_current_user_fullname ─────────────────────────────────────────

def test_get_current_user_fullname(mock_session):
    mock_session.post.return_value = make_mock_response([{"id": 1, "name": "Mario", "surname": "Rossi"}])
    from tustena_api import tustena_get_current_user_fullname
    assert tustena_get_current_user_fullname("key") == "Mario Rossi"


def test_get_current_user_fullname_empty_raises(mock_session):
    mock_session.post.return_value = make_mock_response([])
    from tustena_api import tustena_get_current_user_fullname
    with pytest.raises(ValueError, match="Impossibile recuperare l'utente"):
        tustena_get_current_user_fullname("key")


# ── tustena_search_companies ──────────────────────────────────────────────────

def test_search_companies(mock_session):
    mock_session.post.return_value = make_mock_response([
        {"id": 1, "companyName": "ACME S.P.A."},
        {"id": 2, "companyName": "ACME S.R.L."},
    ])
    from tustena_api import tustena_search_companies
    result = tustena_search_companies("ACME", "key")
    assert result == [{"id": 1, "name": "ACME S.P.A."}, {"id": 2, "name": "ACME S.R.L."}]


# ── tustena_search_services ───────────────────────────────────────────────────

def test_search_services(mock_session):
    mock_session.post.return_value = make_mock_response([{"id": 1, "companyName": "ACME S.P.A."}])
    mock_session.get.return_value = make_mock_response([
        {"id": 100, "catalogDescription": "Platform Support"},
    ])
    from tustena_api import tustena_search_services
    with patch("tustena_api.tustena_get_contract_id", return_value=10):
        result = tustena_search_services("ACME S.P.A.", "PS-043-26", "key")
    assert result == ["Platform Support"]


# ── tustena_get_contract_id multiple matches ──────────────────────────────────

def test_get_contract_id_multiple_matches_raises(mock_session):
    mock_session.post.return_value = make_mock_response([
        {"id": 10, "customerCode": "PS-043-26"},
        {"id": 11, "customerCode": "PS-043-26"},
    ])
    from tustena_api import tustena_get_contract_id
    with pytest.raises(ValueError, match="più match"):
        tustena_get_contract_id(1, "PS-043-26", "key")


# ── tustena_get_service_id multiple matches ───────────────────────────────────

def test_get_service_id_multiple_matches_raises(mock_session):
    mock_session.get.return_value = make_mock_response([
        {"id": 100, "catalogDescription": "Platform Support"},
        {"id": 101, "catalogDescription": "Platform Support"},
    ])
    from tustena_api import tustena_get_service_id
    with pytest.raises(ValueError, match="più match"):
        tustena_get_service_id(10, "Platform Support", "key")


# ── tustena_get_existing_voucher_subjects ─────────────────────────────────────

def test_get_existing_voucher_subjects(mock_session):
    mock_session.get.return_value = make_mock_response([
        {"id": 1, "subject": "ACME / Project", "activityDate": "2025-01-06T09:00:00"},
        {"id": 2, "subject": "ACME / Project", "activityDate": "2025-01-07T09:00:00"},
    ])
    from tustena_api import tustena_get_existing_voucher_subjects
    result = tustena_get_existing_voucher_subjects("2025-01-06", "2025-01-07", 1, "key", "42")
    assert "ACME / Project" in result["2025-01-06"]
    assert "ACME / Project" in result["2025-01-07"]


def test_get_existing_voucher_subjects_empty(mock_session):
    mock_session.get.return_value = make_mock_response([])
    from tustena_api import tustena_get_existing_voucher_subjects
    result = tustena_get_existing_voucher_subjects("2025-01-06", "2025-01-06", 1, "key", "42")
    assert result == {}


# ── tustena_get_activity_template ─────────────────────────────────────────────

def test_get_activity_template(mock_session):
    mock_session.get.return_value = make_mock_response({"createdById": "42", "type": 6})
    from tustena_api import tustena_get_activity_template
    result = tustena_get_activity_template("key")
    assert result["createdById"] == "42"
