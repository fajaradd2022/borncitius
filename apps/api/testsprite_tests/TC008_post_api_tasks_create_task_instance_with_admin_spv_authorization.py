import requests
from datetime import datetime, timedelta

BASE_URL = "http://localhost:4000/api"
PASSWORD = "BornCitius#2026"
TIMEOUT = 30

USERS = {
    "admin": "itopscitius@gmail.com",
    "spv": "dian.spv@borncitius.id",
    "teknisi": "rizky@borncitius.id",
}


def login(email: str, password: str):
    url = f"{BASE_URL}/auth/login"
    payload = {"email": email, "password": password}
    try:
        r = requests.post(url, json=payload, timeout=TIMEOUT)
        if r.status_code == 200:
            return r.json()
        elif r.status_code == 401:
            # Accept as invalid credentials, return None
            return None
        else:
            r.raise_for_status()
    except requests.RequestException as e:
        raise RuntimeError(f"Login request failed: {e}")


def get_folders(access_token: str):
    url = f"{BASE_URL}/folders"
    headers = {"Authorization": f"Bearer {access_token}"}
    try:
        r = requests.get(url, headers=headers, timeout=TIMEOUT)
        r.raise_for_status()
        return r.json()
    except requests.RequestException as e:
        raise RuntimeError(f"Get folders request failed: {e}")


def get_templates(access_token: str):
    url = f"{BASE_URL}/templates"
    headers = {"Authorization": f"Bearer {access_token}"}
    try:
        r = requests.get(url, headers=headers, timeout=TIMEOUT)
        r.raise_for_status()
        return r.json()
    except requests.RequestException as e:
        raise RuntimeError(f"Get templates request failed: {e}")


def get_teknisi_users(access_token: str):
    url = f"{BASE_URL}/users"
    headers = {"Authorization": f"Bearer {access_token}"}
    try:
        r = requests.get(url, headers=headers, timeout=TIMEOUT)
        r.raise_for_status()
        return r.json()
    except requests.RequestException as e:
        raise RuntimeError(f"Get users request failed: {e}")


def create_task(
    access_token: str,
    folder_id: str,
    template_id: str,
    assigned_teknisi_id: str,
    due_date: str,
    reviewer_override_id=None,
    site_id=None,
):
    url = f"{BASE_URL}/tasks"
    headers = {"Authorization": f"Bearer {access_token}"}
    body = {
        "folderId": folder_id,
        "templateId": template_id,
        "assignedTeknisiId": assigned_teknisi_id,
        "dueDate": due_date,
    }
    if reviewer_override_id:
        body["reviewerOverrideId"] = reviewer_override_id
    if site_id:
        body["siteId"] = site_id
    r = requests.post(url, json=body, headers=headers, timeout=TIMEOUT)
    return r


def delete_task(access_token: str, task_id: str):
    url = f"{BASE_URL}/tasks/{task_id}"
    headers = {"Authorization": f"Bearer {access_token}"}
    r = requests.delete(url, headers=headers, timeout=TIMEOUT)
    return r


def test_post_api_tasks_create_task_instance_with_admin_spv_authorization():
    # Login as admin, spv, and teknisi
    admin_auth = login(USERS["admin"], PASSWORD)
    spv_auth = login(USERS["spv"], PASSWORD)
    teknisi_auth = login(USERS["teknisi"], PASSWORD)

    assert admin_auth is not None, "Admin login failed"
    assert spv_auth is not None, "SPV login failed"
    assert teknisi_auth is not None, "Teknisi login failed"

    admin_token = admin_auth["accessToken"]
    spv_token = spv_auth["accessToken"]
    teknisi_token = teknisi_auth["accessToken"]

    # Get a folder:
    folders_admin = get_folders(admin_token)
    assert isinstance(folders_admin, list) and len(folders_admin) > 0, "No folders found for admin"
    folder = folders_admin[0]
    folder_id = folder.get("id")
    assert folder_id is not None, "Folder id missing"

    # Get templates:
    templates_admin = get_templates(admin_token)
    assert isinstance(templates_admin, list) and len(templates_admin) > 0, "No templates found for admin"
    template = templates_admin[0]
    template_id = template.get("id")
    assert template_id is not None, "Template id missing"

    # Get teknisi user id for assignment (try from admin user's perspective)
    users_admin = get_teknisi_users(admin_token)
    teknisi_users = [u for u in users_admin if u.get("role") == "teknisi" and u.get("isActive", True)]
    assert len(teknisi_users) > 0, "No active teknisi users found"
    assigned_teknisi_id = teknisi_users[0].get("id")
    assert assigned_teknisi_id is not None, "Teknisi id missing"

    # Prepare due date string in ISO format (e.g., tomorrow)
    due_date = (datetime.utcnow() + timedelta(days=1)).date().isoformat()

    # 1) Test as admin: create task
    admin_task = None
    try:
        resp = create_task(
            access_token=admin_token,
            folder_id=folder_id,
            template_id=template_id,
            assigned_teknisi_id=assigned_teknisi_id,
            due_date=due_date,
        )
        assert resp.status_code in (200, 201), f"Admin task creation failed: {resp.status_code} {resp.text}"
        admin_task = resp.json()
        assert "id" in admin_task, "Admin task creation response missing id"
        # Adjust assertions for nested template and assignedTeknisi objects
        assert admin_task.get("folderId") == folder_id
        template_obj = admin_task.get("template") or {}
        assert template_obj.get("id") == template_id
        assigned_teknisi_obj = admin_task.get("assignedTeknisi") or {}
        assert assigned_teknisi_obj.get("id") == assigned_teknisi_id
        assert admin_task.get("dueDate").startswith(due_date), "Due date mismatch in admin task"
    finally:
        if admin_task and "id" in admin_task:
            del_resp = delete_task(admin_token, admin_task["id"])
            # Deletion might fail if reviewed - ignore for cleanup but log
            assert del_resp.status_code in (200, 400, 403, 404), f"Unexpected delete status ({del_resp.status_code})"

    # 2) Test as SPV: create task
    spv_task = None
    try:
        resp = create_task(
            access_token=spv_token,
            folder_id=folder_id,
            template_id=template_id,
            assigned_teknisi_id=assigned_teknisi_id,
            due_date=due_date,
        )
        assert resp.status_code in (200, 201), f"SPV task creation failed: {resp.status_code} {resp.text}"
        spv_task = resp.json()
        assert "id" in spv_task, "SPV task creation response missing id"
        assert spv_task.get("folderId") == folder_id
        template_obj = spv_task.get("template") or {}
        assert template_obj.get("id") == template_id
        assigned_teknisi_obj = spv_task.get("assignedTeknisi") or {}
        assert assigned_teknisi_obj.get("id") == assigned_teknisi_id
        assert spv_task.get("dueDate").startswith(due_date), "Due date mismatch in SPV task"
    finally:
        if spv_task and "id" in spv_task:
            del_resp = delete_task(spv_token, spv_task["id"])
            assert del_resp.status_code in (200, 400, 403, 404), f"Unexpected delete status ({del_resp.status_code})"

    # 3) Test as teknisi: create task - expect 403
    resp = create_task(
        access_token=teknisi_token,
        folder_id=folder_id,
        template_id=template_id,
        assigned_teknisi_id=assigned_teknisi_id,
        due_date=due_date,
    )
    # Expect forbidden
    assert resp.status_code == 403, f"Teknisi should be forbidden, got status {resp.status_code}"


test_post_api_tasks_create_task_instance_with_admin_spv_authorization()
