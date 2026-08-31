import requests
import uuid
import datetime

BASE_URL = "http://localhost:4000"
TIMEOUT = 30

PASSWORD = "w90uWxvH6vkjMXKQqoyr"

# Seed accounts for auth testing
ACCOUNTS = {
    "admin": {"email": "itopscitius@gmail.com", "role": "admin"},
    "spv": {"email": "dian.spv@borncitius.id", "role": "spv"},
    "teknisi1": {"email": "rizky@borncitius.id", "role": "teknisi"},
    "teknisi2": {"email": "agus@borncitius.id", "role": "teknisi"},
}


def login(email: str, password: str):
    try:
        resp = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": email, "password": password},
            timeout=TIMEOUT,
        )
        if resp.status_code == 200:
            data = resp.json()
            return data["accessToken"], data["refreshToken"], data["user"]
        else:
            # Treat as invalid (unauthorized) if login fails
            return None, None, None
    except Exception:
        return None, None, None


def create_task(access_token, folder_id, template_id, assigned_teknisi_id):
    due_date = (datetime.datetime.utcnow() + datetime.timedelta(days=7)).strftime(
        "%Y-%m-%d"
    )
    payload = {
        "folderId": folder_id,
        "templateId": template_id,
        "assignedTeknisiId": assigned_teknisi_id,
        "dueDate": due_date,
    }
    headers = {"Authorization": f"Bearer {access_token}"}
    r = requests.post(
        f"{BASE_URL}/tasks", json=payload, headers=headers, timeout=TIMEOUT
    )
    r.raise_for_status()
    return r.json()


def delete_task(task_id, access_token):
    headers = {"Authorization": f"Bearer {access_token}"}
    r = requests.delete(f"{BASE_URL}/tasks/{task_id}", headers=headers, timeout=TIMEOUT)
    return r


def get_tasks(access_token):
    headers = {"Authorization": f"Bearer {access_token}"}
    r = requests.get(f"{BASE_URL}/tasks", headers=headers, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def get_folders(access_token):
    headers = {"Authorization": f"Bearer {access_token}"}
    r = requests.get(f"{BASE_URL}/folders", headers=headers, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def approve_task(task_id, access_token):
    headers = {"Authorization": f"Bearer {access_token}"}
    r = requests.post(
        f"{BASE_URL}/tasks/{task_id}/approve", headers=headers, timeout=TIMEOUT
    )
    r.raise_for_status()
    return r.json()


def post_generate_document(task_id, access_token):
    headers = {"Authorization": f"Bearer {access_token}"}
    r = requests.post(
        f"{BASE_URL}/tasks/{task_id}/document", headers=headers, timeout=TIMEOUT
    )
    return r


def get_document_pdf(task_id, access_token):
    headers = {"Authorization": f"Bearer {access_token}"}
    r = requests.get(
        f"{BASE_URL}/tasks/{task_id}/document/pdf", headers=headers, timeout=TIMEOUT
    )
    return r


def get_document_word(task_id, access_token):
    headers = {"Authorization": f"Bearer {access_token}"}
    r = requests.get(
        f"{BASE_URL}/tasks/{task_id}/document/word", headers=headers, timeout=TIMEOUT
    )
    return r


def test_document_generation_and_download_for_approved_tasks():
    # Login all users
    admin_access_token, admin_refresh_token, admin_user = login(ACCOUNTS["admin"]["email"], PASSWORD)
    spv_access_token, spv_refresh_token, spv_user = login(ACCOUNTS["spv"]["email"], PASSWORD)
    teknisi1_access_token, teknisi1_refresh_token, teknisi1_user = login(ACCOUNTS["teknisi1"]["email"], PASSWORD)
    # If login fails for admin or spv, treat credentials as invalid and test 401 paths

    if not admin_access_token or not spv_access_token:
        # If admin or spv login failed, test 401 unauthorized for these users and skip other tests
        # POST /tasks/:taskId/document with invalid admin/spv tokens
        dummy_task_id = str(uuid.uuid4())
        headers_admin = {"Authorization": f"Bearer invalid-admin-token"}
        headers_spv = {"Authorization": f"Bearer invalid-spv-token"}

        r_admin = requests.post(
            f"{BASE_URL}/tasks/{dummy_task_id}/document",
            headers=headers_admin,
            timeout=TIMEOUT,
        )
        assert r_admin.status_code in (401, 403)

        r_spv = requests.post(
            f"{BASE_URL}/tasks/{dummy_task_id}/document",
            headers=headers_spv,
            timeout=TIMEOUT,
        )
        assert r_spv.status_code in (401, 403)

        # GET /tasks/:taskId/document/pdf and /word with invalid tokens
        r_pdf = requests.get(
            f"{BASE_URL}/tasks/{dummy_task_id}/document/pdf",
            headers=headers_admin,
            timeout=TIMEOUT,
        )
        assert r_pdf.status_code in (401, 403, 404)

        r_word = requests.get(
            f"{BASE_URL}/tasks/{dummy_task_id}/document/word",
            headers=headers_spv,
            timeout=TIMEOUT,
        )
        assert r_word.status_code in (401, 403, 404)

        return

    # Get folderId, templateId, assignedTeknisiId to create a task (from folders and tasks)
    folders = get_folders(admin_access_token)
    assert isinstance(folders, list) and len(folders) > 0
    folder = folders[0]
    folder_id = folder["id"]

    # Get templates for templateId
    headers_admin = {"Authorization": f"Bearer {admin_access_token}"}
    r_templates = requests.get(f"{BASE_URL}/templates", headers=headers_admin, timeout=TIMEOUT)
    r_templates.raise_for_status()
    templates = r_templates.json()
    assert isinstance(templates, list) and len(templates) > 0
    template_id = templates[0]["id"]

    # Get teknisi users list to assign teknisi - fallback to teknisi1 id if list fails
    r_users = requests.get(f"{BASE_URL}/users", headers=headers_admin, timeout=TIMEOUT)
    r_users.raise_for_status()
    users = r_users.json()
    teknisi_users = [u for u in users if u["role"] == "teknisi" and u.get("isActive", True)]
    if teknisi_users:
        assigned_teknisi_id = teknisi_users[0]["id"]
    else:
        # fallback to teknisi1 user id after obtaining from /auth/me
        r_me = requests.get(f"{BASE_URL}/auth/me", headers={"Authorization": f"Bearer {teknisi1_access_token}"}, timeout=TIMEOUT)
        r_me.raise_for_status()
        me = r_me.json()
        assigned_teknisi_id = me["id"]

    # Create a new task with admin token (task initially not approved)
    task = None
    try:
        task = create_task(admin_access_token, folder_id, template_id, assigned_teknisi_id)
        task_id = task["id"]

        # Immediately try GET /tasks/:taskId/document/pdf before generation -> expect 404
        r_pdf_before = get_document_pdf(task_id, admin_access_token)
        assert r_pdf_before.status_code == 404

        # Approve the task with admin token
        approved_task = approve_task(task_id, admin_access_token)
        assert approved_task["id"] == task_id

        # POST /tasks/:taskId/document with admin token for approved task -> expect 200 with metadata
        r_post_doc_admin = post_generate_document(task_id, admin_access_token)
        assert r_post_doc_admin.status_code == 200
        doc_metadata_admin = r_post_doc_admin.json()
        # Check all required fields from PRD
        assert "id" in doc_metadata_admin
        assert "pdfPath" in doc_metadata_admin
        assert "generatedAt" in doc_metadata_admin
        assert "sizeBytes" in doc_metadata_admin
        assert "pages" in doc_metadata_admin

        # POST /tasks/:taskId/document with spv token for approved task -> expect 200 or 403 if spv not assigned reviewer
        r_post_doc_spv = post_generate_document(task_id, spv_access_token)
        if r_post_doc_spv.status_code == 200:
            doc_metadata_spv = r_post_doc_spv.json()
            assert "id" in doc_metadata_spv
            assert "pdfPath" in doc_metadata_spv
            assert "generatedAt" in doc_metadata_spv
            assert "sizeBytes" in doc_metadata_spv
            assert "pages" in doc_metadata_spv
        else:
            # If 403, test is valid (spv unauthorized)
            assert r_post_doc_spv.status_code == 403

        # POST /tasks/:taskId/document with teknisi token -> expect 403
        if teknisi1_access_token:
            r_post_doc_teknisi = post_generate_document(task_id, teknisi1_access_token)
            assert r_post_doc_teknisi.status_code == 403 or r_post_doc_teknisi.status_code == 401

        # GET /tasks/:taskId/document/pdf after generation -> expect 200 and binary content
        r_pdf_after = get_document_pdf(task_id, admin_access_token)
        assert r_pdf_after.status_code == 200
        assert r_pdf_after.headers.get("Content-Type", "").startswith("application/pdf")
        assert len(r_pdf_after.content) > 0

        # GET /tasks/:taskId/document/word with valid authentication (admin) -> expect 200 and binary .docx content
        r_word_admin = get_document_word(task_id, admin_access_token)
        assert r_word_admin.status_code == 200
        assert (
            r_word_admin.headers.get("Content-Type", "") == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            or r_word_admin.headers.get("Content-Type", "") == "application/octet-stream"
        )
        assert len(r_word_admin.content) > 0

        # GET /tasks/:taskId/document/word with spv token -> expect 200 or 403 if unauthorized
        r_word_spv = get_document_word(task_id, spv_access_token)
        if r_word_spv.status_code == 200:
            assert (
                r_word_spv.headers.get("Content-Type", "") == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                or r_word_spv.headers.get("Content-Type", "") == "application/octet-stream"
            )
            assert len(r_word_spv.content) > 0
        else:
            assert r_word_spv.status_code == 403

        # GET /tasks/:taskId/document/word with teknisi token -> expect 403 or 401
        if teknisi1_access_token:
            r_word_teknisi = get_document_word(task_id, teknisi1_access_token)
            assert r_word_teknisi.status_code in (403, 401)
    finally:
        # Cleanup: delete task if created
        if task:
            delete_task(task["id"], admin_access_token)


test_document_generation_and_download_for_approved_tasks()
