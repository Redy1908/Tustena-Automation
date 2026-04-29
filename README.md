# Float → Tustena CRM Automation

[![Tests](https://github.com/Redy1908/Tustena-Automation/actions/workflows/test.yml/badge.svg)](https://github.com/Redy1908/Tustena-Automation/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/Redy1908/Tustena-Automation/graph/badge.svg)](https://codecov.io/gh/Redy1908/Tustena-Automation)

A tool for automatically creating **Voucher Intervento** entries in **Tustena CRM** from **Float** allocations. Eliminates manual entry: import your allocations, review the vouchers, and confirm them in one click.

## Quick start

```bash
docker compose up --build -d
```

The app will be available at `http://localhost:5001`.

### Environment variables (optional)

These pre-fill the UI fields on first launch:

| Variable          | Description                  | Where to find it                                                      |
| ----------------- | ---------------------------- | --------------------------------------------------------------------- |
| `TUSTENA_API_KEY` | Tustena CRM API Key          | Tustena CRM → Setup → Gestione Account → Web API Keys → Nuova         |
| `FLOAT_ICAL_URL`  | Float iCal feed URL          | Float → Personal → Calendar Integrations → Copy the link              |

```bash
export TUSTENA_API_KEY=your-key
export FLOAT_ICAL_URL=https://ical.float.com/...
docker compose up --build -d
```

## How to use

1. Enter your **Tustena API Key** and **Float iCal URL** in Settings and save. The configuration is stored in the browser and does not need to be re-entered.
2. The dashboard shows the current week's allocations grouped by day. Use the arrows to navigate between weeks.
3. Click **Crea** on a voucher to submit it to Tustena.

> After creation, remember to send the timesheet email manually from Tustena CRM.

## Name mismatch resolution

Some vouchers may fail because a company or service name in Float does not match the one in Tustena. Use the inline search directly on the voucher to find the correct name and map it — the mapping is saved automatically in Settings and reapplied in future sessions.

If two Tustena companies share the same name but have different IDs, the inline search will display each entry with its `#ID` so you can pick the correct one. The mapping will store the numeric ID to bypass any ambiguity.

## Technical notes

### Voucher times

The first voucher of the day starts at `09:00`; subsequent ones are chained:

```
Voucher A: 09:00 → 13:00
Voucher B: 13:00 → 17:00
```

Times can be adjusted in the preview before creation.
