import pytest
from unittest.mock import patch, MagicMock
from conftest import SAMPLE_ICAL
from ical_parsing import parse_ical_feed, _italian_holidays


@pytest.fixture(autouse=True)
def no_holidays():
    with patch("ical_parsing._italian_holidays", return_value=set()):
        yield


def test_parse_basic_event():
    tasks = parse_ical_feed(SAMPLE_ICAL, skip_holidays=False)
    acme = [t for t in tasks if t["client_name"] == "ACME S.P.A."]
    assert len(acme) == 1
    assert acme[0]["contract_code"] == "PS-043-26"
    assert acme[0]["service_description"] == "Platform Support"
    assert acme[0]["hours"] == 2.0
    assert acme[0]["start_date"] == "2025-01-06"
    assert acme[0]["notes"] == "Attività di supporto"


def test_multi_day_event_expands():
    tasks = parse_ical_feed(SAMPLE_ICAL, skip_holidays=False)
    beta = [t for t in tasks if t["client_name"] == "BETA S.R.L."]
    assert len(beta) == 2
    assert beta[0]["start_date"] == "2025-01-07"
    assert beta[1]["start_date"] == "2025-01-08"


def test_internal_projects_filtered():
    tasks = parse_ical_feed(SAMPLE_ICAL, skip_holidays=False)
    assert all(not t.get("contract_code", "").startswith("INT") for t in tasks)


def test_tasks_sorted_by_date():
    tasks = parse_ical_feed(SAMPLE_ICAL, skip_holidays=False)
    dates = [t["start_date"] for t in tasks]
    assert dates == sorted(dates)


def test_start_times_cascade_within_day():
    tasks = parse_ical_feed(SAMPLE_ICAL, skip_holidays=False)
    # ACME 2h task on 2025-01-06 starts at 09:00
    acme = next(t for t in tasks if t["start_date"] == "2025-01-06")
    assert acme["start_time"] == "09:00"
    assert acme["end_time"] == "11:00"


def test_holiday_filtering():
    with patch("ical_parsing._italian_holidays", return_value={"2025-01-06"}):
        tasks = parse_ical_feed(SAMPLE_ICAL, skip_holidays=True)
    assert all(t["start_date"] != "2025-01-06" for t in tasks)


def test_holiday_api_failure_raises():
    with patch("ical_parsing._italian_holidays", side_effect=RuntimeError("Impossibile recuperare le festività italiane")):
        with pytest.raises(RuntimeError, match="Impossibile recuperare le festività"):
            parse_ical_feed(SAMPLE_ICAL, skip_holidays=True)


def test_sub_day_event_correct_end_time():
    ical = """\
BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Float Task (4h) / PS-001 / Service / CLIENT
DTSTART;VALUE=DATE:20250106
DTEND;VALUE=DATE:20250107
END:VEVENT
END:VCALENDAR
"""
    tasks = parse_ical_feed(ical, skip_holidays=False)
    assert len(tasks) == 1
    assert tasks[0]["hours"] == 4.0
    assert tasks[0]["start_time"] == "09:00"
    assert tasks[0]["end_time"] == "13:00"


def test_fractional_hours_event():
    ical = """\
BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Float Task (0.5h) / PS-001 / Service / CLIENT
DTSTART;VALUE=DATE:20250106
DTEND;VALUE=DATE:20250107
END:VEVENT
END:VCALENDAR
"""
    tasks = parse_ical_feed(ical, skip_holidays=False)
    assert len(tasks) == 1
    assert tasks[0]["hours"] == 0.5
    assert tasks[0]["start_time"] == "09:00"
    assert tasks[0]["end_time"] == "09:30"


def test_two_sub_day_events_same_day_cascade():
    ical = """\
BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Task A (2h) / PS-001 / Service A / CLIENT
DTSTART;VALUE=DATE:20250106
DTEND;VALUE=DATE:20250107
END:VEVENT
BEGIN:VEVENT
SUMMARY:Task B (3h) / PS-002 / Service B / CLIENT
DTSTART;VALUE=DATE:20250106
DTEND;VALUE=DATE:20250107
END:VEVENT
END:VCALENDAR
"""
    tasks = parse_ical_feed(ical, skip_holidays=False)
    assert len(tasks) == 2
    tasks_by_contract = {t["contract_code"]: t for t in tasks}
    assert tasks_by_contract["PS-001"]["start_time"] == "09:00"
    assert tasks_by_contract["PS-001"]["end_time"] == "11:00"
    assert tasks_by_contract["PS-002"]["start_time"] == "11:00"
    assert tasks_by_contract["PS-002"]["end_time"] == "14:00"


def test_event_without_hours_skipped():
    ical = """\
BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:No hours here / PS-001 / Service / CLIENT
DTSTART;VALUE=DATE:20250106
DTEND;VALUE=DATE:20250107
END:VEVENT
END:VCALENDAR
"""
    tasks = parse_ical_feed(ical, skip_holidays=False)
    assert tasks == []


def test_event_with_too_few_parts_skipped():
    ical = """\
BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Only one part
DTSTART;VALUE=DATE:20250106
DTEND;VALUE=DATE:20250107
END:VEVENT
END:VCALENDAR
"""
    tasks = parse_ical_feed(ical, skip_holidays=False)
    assert tasks == []


def test_datetime_dtstart_and_dtend_coerced_to_date():
    # DTSTART/DTEND as datetime (not all-day) — should still produce one task
    ical = """\
BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Float Task (2h) / PS-001 / Service / CLIENT
DTSTART:20250106T090000Z
DTEND:20250107T090000Z
END:VEVENT
END:VCALENDAR
"""
    tasks = parse_ical_feed(ical, skip_holidays=False)
    assert len(tasks) == 1
    assert tasks[0]["start_date"] == "2025-01-06"


# ── _italian_holidays (direct, bypasses autouse patch) ────────────────────────

def test_italian_holidays_returns_dates():
    mock_resp = MagicMock()
    mock_resp.json.return_value = [{"date": "2025-01-01"}, {"date": "2025-04-25"}]
    mock_resp.raise_for_status = MagicMock()
    with patch("ical_parsing.requests.get", return_value=mock_resp):
        result = _italian_holidays({2025})
    assert "2025-01-01" in result
    assert "2025-04-25" in result


def test_italian_holidays_http_error_raises():
    import requests as req
    with patch("ical_parsing.requests.get", side_effect=req.ConnectionError("timeout")):
        with pytest.raises(RuntimeError, match="Impossibile recuperare le festività"):
            _italian_holidays({2025})
