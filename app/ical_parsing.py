import re
from datetime import date, timedelta, datetime

from icalendar import Calendar


_WORKDAY_START = datetime.strptime("09:00", "%H:%M")
_HOURS_RE = re.compile(r'\((\d+(?:\.\d+)?)h\)')


def parse_ical_feed(ical_text: str) -> list[dict]:
    cal = Calendar.from_ical(ical_text)

    day_cursor: dict = {}
    tasks = []

    for component in cal.walk('VEVENT'):
        summary = str(component.get('SUMMARY', ''))
        parts = [p.strip() for p in summary.split(' / ')]
        if len(parts) != 4:
            continue

        task_info, contract_code, service_description, client_name = parts

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

    return sorted(tasks, key=lambda t: t['start_date'])
