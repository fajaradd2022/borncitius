import requests
import io
import time

BASE_URL = "http://localhost:4000/api"
TIMEOUT = 30

ADMIN_EMAIL = "itopscitius@gmail.com"
ADMIN_PASSWORD = "BornCitius#2026"

# Utility functions
def login(email, password):
    url = f"{BASE_URL}/auth/login"
    payload = {"email": email, "password": password}
    resp = requests.post(url, json=payload, timeout=TIMEOUT)
    if resp.status_code == 200:
        data = resp.json()
        return data["accessToken"]
    elif resp.status_code == 401:
        data = resp.json()
        if "error" in data and data["error"] == "Unauthorized":
            return None
    resp.raise_for_status()

def create_task(access_token, folder_id, template_id, assigned_teknisi_id, due_date):
    url = f"{BASE_URL}/tasks"
    payload = {
        "folderId": folder_id,
        "templateId": template_id,
        "assignedTeknisiId": assigned_teknisi_id,
        "dueDate": due_date
    }
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()

def get_templates(access_token):
    url = f"{BASE_URL}/templates"
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = requests.get(url, headers=headers, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()

def get_folders(access_token):
    url = f"{BASE_URL}/folders"
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = requests.get(url, headers=headers, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()

def get_task_fields(access_token, task_id):
    url = f"{BASE_URL}/tasks/{task_id}"
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = requests.get(url, headers=headers, timeout=TIMEOUT)
    resp.raise_for_status()
    task = resp.json()
    # Extract fields from the task's fields property
    if "fields" in task and isinstance(task["fields"], list):
        return task["fields"]
    # If fields not present, try to get from nested or fallback
    return []

def upload_attachment(access_token, task_id, field_id, file_tuple, extra_fields=None):
    url = f"{BASE_URL}/tasks/{task_id}/fields/{field_id}/attachments"
    headers = {"Authorization": f"Bearer {access_token}"}
    files = {"file": file_tuple}
    data = extra_fields if extra_fields else {}
    resp = requests.post(url, headers=headers, files=files, data=data, timeout=TIMEOUT)
    return resp

def get_attachment_status(access_token, attachment_id):
    url = f"{BASE_URL}/tasks/attachments/{attachment_id}/status"
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = requests.get(url, headers=headers, timeout=TIMEOUT)
    return resp

def delete_attachment(access_token, task_id, field_id, attachment_id):
    url = f"{BASE_URL}/tasks/{task_id}/fields/{field_id}/attachments/{attachment_id}"
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = requests.delete(url, headers=headers, timeout=TIMEOUT)
    return resp

def test_tc009_post_api_tasks_field_attachments_upload_and_get_status():
    # Login as admin to create resources and perform test
    access_token = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert access_token is not None, "Admin login failed"

    # Prepare: Get folder and template and teknisi for creating a task
    folders = get_folders(access_token)
    assert isinstance(folders, list) and len(folders) > 0, "No folders retrieved"
    folder = folders[0]
    folder_id = folder.get("id") or folder.get("uuid") or folder.get("ID") or folder.get("folderId") or folder.get("id") or None
    assert folder_id is not None, "Folder ID not found"

    templates = get_templates(access_token)
    assert isinstance(templates, list) and len(templates) > 0, "No templates retrieved"
    template = templates[0]
    template_id = template.get("id") or template.get("uuid") or None
    assert template_id is not None, "Template ID not found"

    # We need assignedTeknisiId, get list of teknisi users or assign a teknisi id from users list - admin doesn't have a direct endpoint here,
    # fallback: use spv or teknisi email and login, or use folder defaultReviewer if available and substitute. 
    # To keep simple, use a known teknisi email to login and get user id from auth/me.

    # Login as teknisi to get own user id
    teknisi_email = "rizky@borncitius.id"
    teknisi_access_token = login(teknisi_email, ADMIN_PASSWORD)
    assert teknisi_access_token is not None, "Teknisi login failed"
    me_url = f"{BASE_URL}/auth/me"
    headers = {"Authorization": f"Bearer {teknisi_access_token}"}
    me_resp = requests.get(me_url, headers=headers, timeout=TIMEOUT)
    me_resp.raise_for_status()
    teknisi_profile = me_resp.json()
    assigned_teknisi_id = teknisi_profile.get("id") or teknisi_profile.get("uuid") or None
    assert assigned_teknisi_id is not None, "Teknisi user id not found"

    # Create a new task to get a valid taskId
    from datetime import datetime, timedelta
    due_date = (datetime.utcnow() + timedelta(days=7)).strftime("%Y-%m-%d")
    task = create_task(access_token, folder_id, template_id, assigned_teknisi_id, due_date)
    task_id = task.get("id") or task.get("uuid") or None
    assert task_id is not None, "Failed to create task"

    # Get the list of fields for the task to get a valid fieldId
    fields = get_task_fields(access_token, task_id)
    assert isinstance(fields, list) and len(fields) > 0, "No fields found in task"
    field = fields[0]
    field_id = field.get("id") or field.get("uuid") or None
    assert field_id is not None, "No fieldId found in task fields"

    # Prepare valid file for upload (small PDF file)
    valid_file_content = b"%PDF-1.4\n%Test PDF file\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT\n/F1 24 Tf\n100 100 Td\n(Test) Tj\nET\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
    valid_file = ("test.pdf", io.BytesIO(valid_file_content), "application/pdf")

    # Prepare invalid file (too large - over 20MB)
    invalid_large_content = b"x" * (20 * 1024 * 1024 + 1)  # 20MB + 1 byte
    invalid_large_file = ("large.bin", io.BytesIO(invalid_large_content), "application/octet-stream")

    # Prepare invalid file (invalid type)
    invalid_type_content = b"%PDF-1.4"  # pretend PDF but type not accepted maybe
    invalid_type_file = ("file.exe", io.BytesIO(invalid_type_content), "application/x-msdownload")

    attachment_id = None

    try:
        # Upload valid attachment - expect 200 or 201
        resp_valid = upload_attachment(access_token, task_id, field_id, valid_file)
        assert resp_valid.status_code in (200, 201), f"Valid file upload failed: {resp_valid.status_code} {resp_valid.text}"
        attachment = resp_valid.json()
        attachment_id = attachment.get("id") or attachment.get("uuid") or None
        assert attachment_id is not None, "No attachment id in valid upload response"

        # Poll or immediately get attachment status (Drive mirror sync may be pending)
        status_resp = get_attachment_status(access_token, attachment_id)
        assert status_resp.status_code == 200, f"Get attachment status failed with status {status_resp.status_code}"
        status_data = status_resp.json()
        assert "syncStatus" in status_data, "syncStatus missing in attachment status response"
        # driveUrl may be null or present depending on async mirroring
        assert "driveUrl" in status_data, "driveUrl missing in attachment status response"

        # Upload large invalid attachment - expect 400 error
        resp_large = upload_attachment(access_token, task_id, field_id, invalid_large_file)
        assert resp_large.status_code == 400, f"Large file upload should fail with 400, got {resp_large.status_code}"

        # Upload invalid type attachment - expect 400 error
        resp_type = upload_attachment(access_token, task_id, field_id, invalid_type_file)
        assert resp_type.status_code == 400, f"Invalid type file upload should fail with 400, got {resp_type.status_code}"

    finally:
        # Cleanup: delete the uploaded attachment if created
        if attachment_id:
            del_resp = delete_attachment(access_token, task_id, field_id, attachment_id)
            assert del_resp.status_code == 200 or del_resp.status_code == 404, f"Failed to delete attachment, status {del_resp.status_code}"

        # Cleanup: delete the created task
        del_task_url = f"{BASE_URL}/tasks/{task_id}"
        headers = {"Authorization": f"Bearer {access_token}"}
        del_task_resp = requests.delete(del_task_url, headers=headers, timeout=TIMEOUT)
        # May get 400 if already reviewed, but should not be reviewed at this stage
        assert del_task_resp.status_code == 200, f"Failed to delete test task, status {del_task_resp.status_code}"

test_tc009_post_api_tasks_field_attachments_upload_and_get_status()
