import requests
import uuid
import datetime
import time

BASE_URL = "http://localhost:4000/api"
TIMEOUT = 30


def login(email, password, deviceId=None):
    url = f"{BASE_URL}/auth/login"
    payload = {"email": email, "password": password}
    if deviceId:
        payload["deviceId"] = deviceId
    resp = requests.post(url, json=payload, timeout=TIMEOUT)
    if resp.status_code == 401:
        try:
            body = resp.json()
            if "error" in body and "message" in body:
                # Recognize this as invalid credentials response (Indonesian)
                return None
        except Exception:
            pass
        resp.raise_for_status()
    resp.raise_for_status()
    data = resp.json()
    return data["accessToken"], data["refreshToken"], data["user"]


def create_task_instance(access_token, folder_id, template_id, assigned_teknisi_id, due_date_iso):
    url = f"{BASE_URL}/tasks"
    headers = {"Authorization": f"Bearer {access_token}"}
    payload = {
        "folderId": folder_id,
        "templateId": template_id,
        "assignedTeknisiId": assigned_teknisi_id,
        "dueDate": due_date_iso
    }
    resp = requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def get_tasks(access_token):
    url = f"{BASE_URL}/tasks"
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


def approve_task(access_token, task_id):
    url = f"{BASE_URL}/tasks/{task_id}/approve"
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = requests.post(url, headers=headers, timeout=TIMEOUT)
    return resp


def generate_document(access_token, task_id):
    url = f"{BASE_URL}/tasks/{task_id}/document"
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = requests.post(url, headers=headers, timeout=TIMEOUT)
    return resp


def download_pdf(access_token, task_id):
    url = f"{BASE_URL}/tasks/{task_id}/document/pdf"
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = requests.get(url, headers=headers, timeout=TIMEOUT)
    return resp


def delete_task(access_token, task_id):
    url = f"{BASE_URL}/tasks/{task_id}"
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = requests.delete(url, headers=headers, timeout=TIMEOUT)
    return resp


def submit_task(access_token, task_id):
    url = f"{BASE_URL}/tasks/{task_id}/submit"
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = requests.post(url, headers=headers, timeout=TIMEOUT)
    return resp


def test_post_api_tasks_taskid_document_generate_and_get_pdf_download():
    # Login admin and SPV
    admin_email = "itopscitius@gmail.com"
    spv_email = "dian.spv@borncitius.id"
    password = "BornCitius#2026"

    admin_creds = login(admin_email, password)
    spv_creds = login(spv_email, password)
    assert admin_creds is not None, "Admin login failed"
    assert spv_creds is not None, "SPV login failed"
    admin_access_token, admin_refresh_token, admin_user = admin_creds
    spv_access_token, spv_refresh_token, spv_user = spv_creds

    # Get folders accessible to SPV (to get folderId for task creation)
    folders = get_folders(spv_access_token)
    assert isinstance(folders, list), "Folders response not list"
    folder_id = None
    # Find a folder where spv is defaultReviewer
    for f in folders:
        if "defaultReviewer" in f and f["defaultReviewer"] and f["defaultReviewer"]["id"] == spv_user["id"]:
            folder_id = f["id"]
            break
    if not folder_id:
        # Fallback: take first folder any (admin might see all)
        folders_admin = get_folders(admin_access_token)
        if folders_admin:
            folder_id = folders_admin[0]["id"]
        else:
            raise AssertionError("No folder found for creating task")

    # Get templates to find a templateId for task creation
    url_templates = f"{BASE_URL}/templates"
    headers_admin = {"Authorization": f"Bearer {admin_access_token}"}
    resp_templates = requests.get(url_templates, headers=headers_admin, timeout=TIMEOUT)
    resp_templates.raise_for_status()
    templates = resp_templates.json()
    assert isinstance(templates, list) and len(templates) > 0, "No templates found"
    template_id = templates[0]["id"]

    # Get teknisi users to assign task
    url_users = f"{BASE_URL}/users"
    resp_users = requests.get(url_users, headers=headers_admin, timeout=TIMEOUT)
    resp_users.raise_for_status()
    users = resp_users.json()
    teknisi_ids = [u["id"] for u in users if u.get("role") == "teknisi" and u.get("isActive", True)]
    assert len(teknisi_ids) > 0, "No active teknisi users found"
    assigned_teknisi_id = teknisi_ids[0]

    # Prepare dueDate - tomorrow
    due_date_iso = (datetime.datetime.utcnow() + datetime.timedelta(days=1)).strftime("%Y-%m-%d")

    created_task = None
    try:
        # Create new task with admin token (admin or SPV allowed)
        created_task = create_task_instance(admin_access_token, folder_id, template_id, assigned_teknisi_id, due_date_iso)
        assert "id" in created_task, "Created task missing id"
        task_id = created_task["id"]

        # Submit the task to allow approval
        submit_resp = submit_task(admin_access_token, task_id)
        assert submit_resp.status_code == 200, f"Submitting task failed, status {submit_resp.status_code}"

        # Approve the task to allow document generation
        approve_resp = approve_task(admin_access_token, task_id)
        assert approve_resp.status_code == 200, "Approving task failed, status " + str(approve_resp.status_code)

        # POST /api/tasks/:taskId/document with admin token (should succeed)
        doc_resp = generate_document(admin_access_token, task_id)
        assert doc_resp.status_code == 200, f"Admin document generation failed: {doc_resp.status_code}"
        doc_data = doc_resp.json()
        assert all(k in doc_data for k in ("id", "pdfPath", "generatedAt", "sizeBytes", "pages")), "Incomplete document metadata"

        # GET /api/tasks/:taskId/document/pdf with admin token (should succeed)
        pdf_resp = download_pdf(admin_access_token, task_id)
        assert pdf_resp.status_code == 200, f"Admin PDF download failed: {pdf_resp.status_code}"
        assert pdf_resp.headers.get("content-type") in ["application/pdf", "application/octet-stream"], "Unexpected content-type for PDF"

        # POST /api/tasks/:taskId/document with SPV assigned as defaultReviewer (should succeed if SPV is reviewer)

        # Check if SPV is assigned reviewer of task's folder or override reviewer
        # If not, we skip SPV test because SPV must be assigned reviewer to generate doc
        spv_can_generate = False
        # We know folder_id is for the task, verify if folder defaultReviewer is SPV user
        try:
            folder_resp = requests.get(f"{BASE_URL}/folders/{folder_id}", headers={"Authorization": f"Bearer {spv_access_token}"}, timeout=TIMEOUT)
            if folder_resp.status_code == 200:
                folder_data = folder_resp.json()
                if "defaultReviewer" in folder_data and folder_data["defaultReviewer"] and folder_data["defaultReviewer"]["id"] == spv_user["id"]:
                    spv_can_generate = True
        except Exception:
            pass

        if spv_can_generate:
            doc_resp_spv = generate_document(spv_access_token, task_id)
            assert doc_resp_spv.status_code == 200, f"SPV document generation failed: {doc_resp_spv.status_code}"
            doc_data_spv = doc_resp_spv.json()
            assert all(k in doc_data_spv for k in ("id", "pdfPath", "generatedAt", "sizeBytes", "pages"))

            pdf_resp_spv = download_pdf(spv_access_token, task_id)
            assert pdf_resp_spv.status_code == 200, f"SPV PDF download failed: {pdf_resp_spv.status_code}"
            assert pdf_resp_spv.headers.get("content-type") in ["application/pdf", "application/octet-stream"], "Unexpected content-type for SPV PDF"
        else:
            # Test SPV without permission to generate document -> expect 403
            doc_resp_spv = generate_document(spv_access_token, task_id)
            assert doc_resp_spv.status_code == 403, f"Expected 403 for SPV not assigned reviewer, got {doc_resp_spv.status_code}"

        # Test unauthorized user (teknisi) trying to generate document -> expect 403
        teknisi_email = "rizky@borncitius.id"
        teknisi_creds = login(teknisi_email, password)
        assert teknisi_creds is not None, "Teknisi login failed"
        teknisi_access_token, _, _ = teknisi_creds
        doc_resp_teknisi = generate_document(teknisi_access_token, task_id)
        assert doc_resp_teknisi.status_code == 403, f"Expected 403 for teknisi generating document, got {doc_resp_teknisi.status_code}"

        # Test GET /api/tasks/:taskId/document/pdf before generation (use a new task without generated document)
        # Create new task for this purpose
        new_task = create_task_instance(admin_access_token, folder_id, template_id, assigned_teknisi_id, due_date_iso)
        new_task_id = new_task["id"]

        # Submit and approve new task to allow document generation
        submit_resp2 = submit_task(admin_access_token, new_task_id)
        assert submit_resp2.status_code == 200, f"Submitting second task failed: {submit_resp2.status_code}"
        approve_resp2 = approve_task(admin_access_token, new_task_id)
        assert approve_resp2.status_code == 200, f"Approving second task failed: {approve_resp2.status_code}"

        # Try to GET pdf without generating document first -> expect 404
        pdf_resp_no_doc = download_pdf(admin_access_token, new_task_id)
        assert pdf_resp_no_doc.status_code == 404, f"Expected 404 for PDF not generated, got {pdf_resp_no_doc.status_code}"

        # Unauthorized GET PDF download with invalid/no token -> expect 401
        pdf_resp_unauth = requests.get(f"{BASE_URL}/tasks/{task_id}/document/pdf", timeout=TIMEOUT)
        assert pdf_resp_unauth.status_code == 401 or pdf_resp_unauth.status_code == 403, f"Expected 401/403 for unauthenticated PDF download, got {pdf_resp_unauth.status_code}"

    finally:
        # Cleanup created tasks
        if created_task and "id" in created_task:
            try:
                del_resp = delete_task(admin_access_token, created_task["id"])
                # If deletion fails because task reviewed, we ignore
                assert del_resp.status_code in (200, 400), f"Unexpected delete status: {del_resp.status_code}"
            except Exception:
                pass
        if 'new_task_id' in locals():
            try:
                del_resp2 = delete_task(admin_access_token, new_task_id)
                assert del_resp2.status_code in (200, 400), f"Unexpected delete status: {del_resp2.status_code}"
            except Exception:
                pass


test_post_api_tasks_taskid_document_generate_and_get_pdf_download()
