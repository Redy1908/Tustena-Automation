import requests

_FLOAT_BASE_URL = "https://api.float.com/v3"
_session = requests.Session()


def _get(path: str, api_key: str, params: dict = None) -> dict | list:
    resp = _session.get(
        f"{_FLOAT_BASE_URL}/{path}",
        headers={"Authorization": f"Bearer {api_key}"},
        params=params,
        timeout=20,
    )
    resp.raise_for_status()
    return resp.json()


def _get_all(path: str, api_key: str, params: dict = None) -> list:
    """Fetch all pages of a paginated list endpoint (max 200 per page)."""
    params = {**(params or {}), "per-page": 200, "page": 1}
    results = []
    while True:
        resp = _session.get(
            f"{_FLOAT_BASE_URL}/{path}",
            headers={"Authorization": f"Bearer {api_key}"},
            params=params,
            timeout=20,
        )
        resp.raise_for_status()
        page = resp.json()
        results.extend(page)
        total_pages = int(resp.headers.get("X-Pagination-Page-Count", 1))
        if params["page"] >= total_pages:
            break
        params["page"] += 1
    return results


def _patch(path: str, api_key: str, json: dict = None) -> dict:
    resp = _session.patch(
        f"{_FLOAT_BASE_URL}/{path}",
        headers={"Authorization": f"Bearer {api_key}"},
        json=json,
        timeout=20,
    )
    resp.raise_for_status()
    return resp.json()


def float_get_person_id(name: str, api_key: str) -> int:
    matches = _get_all("people", api_key, params={"name": name})
    matches = [p for p in matches if name.lower() in p["name"].lower()]
    if len(matches) == 1:
        return matches[0]["people_id"]
    elif len(matches) > 1:
        raise ValueError(f"Trovati più match per '{name}': {[p['name'] for p in matches]}")
    raise ValueError(f"Nessuna persona trovata per '{name}'")


def _float_get_project(project_id: int, api_key: str) -> dict:
    return _get(f"projects/{project_id}", api_key)


def _float_get_client(client_id: int, api_key: str) -> dict:
    return _get(f"clients/{client_id}", api_key)


def float_get_allocations(float_people_id: int, start_date: str, end_date: str, api_key: str) -> list[dict]:
    end_date = end_date or start_date
    tasks = _get_all("tasks", api_key, params={
        "people_id": float_people_id,
        "start_date": start_date,
        "end_date": end_date,
        "expand": "task_days",
        "billable": 1,
    })

    # Fetch each unique project once
    project_ids = {t["project_id"] for t in tasks}
    projects = {pid: _float_get_project(pid, api_key) for pid in project_ids}

    # Fetch each unique client once
    client_ids = {p["client_id"] for p in projects.values()}
    clients = {cid: _float_get_client(cid, api_key) for cid in client_ids}

    expanded = []
    for task in tasks:
        project = projects[task["project_id"]]
        task["project_name"] = project["name"]
        task["client_name"]  = clients[project["client_id"]]["name"]
        for day in task.get("task_days", []):
            hours = round(task.get("estimated_hours", 0) / max(len(task.get("task_days", [1])), 1), 2)
            expanded.append({**task, "task_id": task["id"], "start_date": day, "end_date": day, "hours": hours})
    return expanded


def float_mark_task_completed(task_id: int, api_key: str) -> dict:
    return _patch(f"tasks/{task_id}", api_key, json={"status": 3})
