import logging
import re
from datetime import date, timedelta, datetime

import requests
from icalendar import Calendar

logger = logging.getLogger(__name__)

_WORKDAY_START = datetime.strptime("09:00", "%H:%M")
_HOURS_RE = re.compile(r'\((\d+(?:\.\d+)?)h\)')


def _italian_holidays(years: set[int]) -> set[str]:
    """Fetch Italian public holidays from Nager.Date for the given years."""
    holidays: set[str] = set()
    for year in years:
        try:
            resp = requests.get(
                f'https://date.nager.at/api/v3/PublicHolidays/{year}/IT',
                timeout=5,
            )
            resp.raise_for_status()
            for h in resp.json():
                holidays.add(h['date'])
        except Exception as exc:
            raise RuntimeError(
                f'Impossibile recuperare le festività italiane per il {year} da Nager.Date: {exc}. '
                'Verifica la connessione o disattiva il filtro festività.'
            ) from exc
    return holidays


def parse_ical_feed(ical_text: str, skip_holidays: bool = True) -> list[dict]:
    cal = Calendar.from_ical(ical_text)

    day_cursor: dict = {}
    tasks = []

    for component in cal.walk('VEVENT'):
        summary = str(component.get('SUMMARY', ''))
        parts = [p.strip() for p in summary.split(' / ')]
        if len(parts) < 4:
            continue

        task_info = parts[0]
        contract_code = parts[1]
        client_name = parts[-1]
        service_description = ' / '.join(parts[2:-1])

        if contract_code.startswith('INT'):
            continue

        hours_match = _HOURS_RE.search(task_info)
        if not hours_match:
            continue
        hours = round(float(hours_match.group(1)), 2)

        notes = str(component.get('DESCRIPTION', '') or '').strip()
        notes = notes.replace('\\n', '\n')

        dtstart = component.get('DTSTART').dt
        dtend   = component.get('DTEND').dt

        if isinstance(dtstart, datetime):
            dtstart = dtstart.date()
        if isinstance(dtend, datetime):
            dtend = dtend.date()

        # DTEND is exclusive in iCal all-day events, so range is [dtstart, dtend)
        current = dtstart
        while current < dtend:
            date_str = current.strftime('%Y-%m-%d')
            t_start = day_cursor.get(date_str, _WORKDAY_START)
            t_end   = t_start + timedelta(hours=hours)
            day_cursor[date_str] = t_end

            tasks.append({
                'client_name':  client_name,
                'project_name': f'{contract_code} / {service_description}',
                'notes':        notes,
                'start_date':   date_str,
                'start_time':   t_start.strftime('%H:%M'),
                'end_time':     t_end.strftime('%H:%M'),
                'hours':        hours,
            })
            current += timedelta(days=1)

    if skip_holidays and tasks:
        years = {int(t['start_date'][:4]) for t in tasks}
        holidays = _italian_holidays(years)
        tasks = [t for t in tasks if t['start_date'] not in holidays]

    return sorted(tasks, key=lambda t: t['start_date'])
