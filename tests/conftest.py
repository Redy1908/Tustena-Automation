import pytest
from unittest.mock import MagicMock, patch


SAMPLE_ICAL = """\
BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Float Task (2h) / PS-043-26 / Platform Support / ACME S.P.A.
DTSTART;VALUE=DATE:20250106
DTEND;VALUE=DATE:20250107
DESCRIPTION:Attività di supporto
END:VEVENT
BEGIN:VEVENT
SUMMARY:Float Task (4h) / PS-047-26 / Dev / BETA S.R.L.
DTSTART;VALUE=DATE:20250107
DTEND;VALUE=DATE:20250109
DESCRIPTION:Sviluppo feature
END:VEVENT
BEGIN:VEVENT
SUMMARY:Internal Task (1h) / INT-001 / Internal / DUMMY S.P.A.
DTSTART;VALUE=DATE:20250106
DTEND;VALUE=DATE:20250107
DESCRIPTION:Meeting interno
END:VEVENT
END:VCALENDAR
"""

SAMPLE_TASK = {
    "client_name":  "ACME S.P.A.",
    "project_name": "PS-043-26 / Platform Support",
    "notes":        "Attività di supporto",
    "start_date":   "2025-01-06",
    "start_time":   "09:00",
    "end_time":     "11:00",
    "hours":        2.0,
}

ENRICHED_TASK = {
    **SAMPLE_TASK,
    "company_id":  1,
    "contract_id": 10,
    "service_id":  100,
}


@pytest.fixture
def flask_client():
    with (
        patch("tustena_api._session"),
        patch("web_app.tustena_get_activity_template", return_value={"createdById": "42"}),
        patch("web_app.tustena_get_current_user_fullname", return_value="Mario Rossi"),
    ):
        from web_app import app
        app.config["TESTING"] = True
        with app.test_client() as client:
            yield client


def make_mock_response(json_data, status_code=200):
    m = MagicMock()
    m.json.return_value = json_data
    m.status_code = status_code
    m.raise_for_status = MagicMock()
    return m
