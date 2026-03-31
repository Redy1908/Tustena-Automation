import csv
from datetime import datetime, timedelta


_WORKDAY_START = datetime.strptime("09:00", "%H:%M")


def parse_float_people_csv(filepath: str) -> list[dict]:
    with open(filepath, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        rows = list(reader)

    fixed_cols = ["Name", "Role", "Department", "Task", "Project", "Client", "Time off", "Notes"]

    header_row_idx = next(
        (i for i, r in enumerate(rows) if [h.strip() for h in r[:len(fixed_cols)]] == fixed_cols),
        None,
    )
    if header_row_idx is None:
        raise ValueError("Formato CSV non riconosciuto: colonne fisse non corrispondenti.")
    headers = rows[header_row_idx]
    date_headers = headers[len(fixed_cols):]
    try:
        parsed_dates = [datetime.strptime(d.strip(), "%d %b %Y") for d in date_headers if d.strip()]
    except ValueError:
        raise ValueError("Formato CSV non riconosciuto: date non parsabili. Assicurati di esportare con opzione 'Day'.")

    if len(parsed_dates) >= 2 and (parsed_dates[1] - parsed_dates[0]).days >= 7:
        raise ValueError("Il CSV è un export settimanale. Esporta con opzione 'Day' per ottenere i dati giornalieri.")

    dates = [d.strftime("%Y-%m-%d") for d in parsed_dates]

    scheduled_count = sum(
        1 for row in rows[header_row_idx + 1:] if row and row[0].strip().upper() == "SCHEDULED"
    )
    if scheduled_count > 1:
        raise ValueError("Il CSV contiene più persone. Esporta un CSV filtrando su 'Me'.")

    day_cursor: dict = {}  # tracks next available start time per day
    tasks = []
    for row in rows[header_row_idx + 1:]:
        if not row or not row[0].strip() or row[0].strip().upper() in ("SCHEDULED", "CAPACITY"):
            break

        name    = row[0].strip()
        project = row[4].strip()
        client  = row[5].strip()
        notes   = row[7].strip()

        if not project or not client:
            continue

        # Skip internal projects
        project_code = project.split("/")[0].strip()
        if project_code.startswith("INT"):
            continue

        hour_values = row[len(fixed_cols):]
        for i, date_str in enumerate(dates):
            if i >= len(hour_values):
                continue
            try:
                hours = round(float(hour_values[i].strip() or 0), 2)
            except ValueError:
                continue
            if hours <= 0:
                continue

            t_start = day_cursor.get(date_str, _WORKDAY_START)
            t_end   = t_start + timedelta(hours=hours)
            day_cursor[date_str] = t_end

            tasks.append({
                "name":         name,
                "client_name":  client,
                "project_name": project,
                "notes":        notes,
                "start_date":   date_str,
                "start_time":   t_start.strftime("%H:%M"),
                "end_time":     t_end.strftime("%H:%M"),
                "hours":        hours,
            })

    return tasks
