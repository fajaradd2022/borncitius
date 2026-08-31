import requests
import uuid
import time

BASE_URL = "http://localhost:4000/api"
TIMEOUT = 30

SPV_EMAIL = "dian.spv@borncitius.id"
SPV_PASSWORD = "BornCitius#2026"
ADMIN_EMAIL = "itopscitius@gmail.com"
ADMIN_PASSWORD = "BornCitius#2026"

def login(email, password):
    try:
        resp = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": email, "password": password},
            timeout=TIMEOUT,
        )
        if resp.status_code == 200:
            data = resp.json()
            return data.get("accessToken")
        elif resp.status_code == 401:
            # Valid invalid credentials response with message field
            json_body = resp.json()
            if "message" in json_body and "error" in json_body:
                return None
            resp.raise_for_status()
        else:
            resp.raise_for_status()
    except requests.RequestException as e:
        raise Exception(f"Login failed: {e}")

def get_folders(access_token):
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = requests.get(f"{BASE_URL}/folders", headers=headers, timeout=TIMEOUT)
    return resp

def get_folder(access_token, folder_id):
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = requests.get(f"{BASE_URL}/folders/{folder_id}", headers=headers, timeout=TIMEOUT)
    return resp

def test_get_api_folders_list_and_get_folder_details_with_spv_scoping():
    spv_token = login(SPV_EMAIL, SPV_PASSWORD)
    assert spv_token is not None, "SPV login failed"

    # 1. Test GET /api/folders with valid SPV access token to receive folder list
    resp = get_folders(spv_token)
    assert resp.status_code == 200, f"Expected 200 OK, got {resp.status_code}"
    folders = resp.json()
    assert isinstance(folders, list), "Folders response should be a list"
    # Check that each folder has defaultReviewer and taskCount keys (best effort)
    for folder in folders:
        assert "defaultReviewer" in folder, "Folder missing defaultReviewer"
        assert "taskCount" in folder, "Folder missing taskCount"

    # If no folders available, cannot proceed with detailed folder tests
    if not folders:
        raise Exception("No folders available for SPV to test further folder detail endpoints")

    # Find a folder UUID within SPV scope: folder where spv is defaultReviewer
    folder_in_scope = None
    for folder in folders:
        # Usually defaultReviewer field could be an object; check email or id
        dr = folder.get("defaultReviewer")
        if dr:
            if isinstance(dr, dict):
                email = dr.get("email")
                if email == SPV_EMAIL:
                    folder_in_scope = folder
                    break
            elif isinstance(dr, str):
                # Unlikely but if defaultReviewer is string UUID or email, try match
                if dr == SPV_EMAIL:
                    folder_in_scope = folder
                    break

    assert folder_in_scope is not None, "No folder found within SPV scope"

    folder_in_scope_id = folder_in_scope.get("id")
    assert folder_in_scope_id is not None, "Folder in scope missing id"

    # 2. GET /api/folders/:id for folder UUID within SPV scope => 200 with details
    resp = get_folder(spv_token, folder_in_scope_id)
    assert resp.status_code == 200, f"Expected 200 OK for folder in scope, got {resp.status_code}"
    folder_detail = resp.json()
    assert "id" in folder_detail and folder_detail["id"] == folder_in_scope_id, "Folder detail id mismatch"
    assert "defaultReviewer" in folder_detail, "Folder detail missing defaultReviewer"
    assert "taskCount" in folder_detail, "Folder detail missing taskCount"

    # 3. Find or create a folder outside SPV scope to test 403
    # We will retrieve folder list with admin token to find a folder not assigned to spv
    admin_token = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    assert admin_token is not None, "Admin login failed for scope test"

    resp = get_folders(admin_token)
    assert resp.status_code == 200, f"Expected 200 OK from admin folders list, got {resp.status_code}"
    admin_folders = resp.json()

    folder_out_of_scope = None
    for folder in admin_folders:
        dr = folder.get("defaultReviewer")
        if dr:
            if isinstance(dr, dict):
                email = dr.get("email")
                if email != SPV_EMAIL:
                    folder_out_of_scope = folder
                    break
            elif isinstance(dr, str):
                if dr != SPV_EMAIL:
                    folder_out_of_scope = folder
                    break

    if not folder_out_of_scope:
        # No suitable folder found out of scope; create one with admin, then update defaultReviewer
        # But PRD does not provide folder creation endpoint; raise error to indicate test limitation
        raise Exception("No folder outside SPV scope available to test 403 response")

    folder_out_scope_id = folder_out_of_scope.get("id")
    assert folder_out_scope_id is not None, "Folder out of scope missing id"

    # 4. GET /api/folders/:id for folder UUID outside SPV scope => 403
    resp = get_folder(spv_token, folder_out_scope_id)
    assert resp.status_code == 403, f"Expected 403 Forbidden for folder out of SPV scope, got {resp.status_code}"

    # 5. GET /api/folders/:id for non-existent UUID => 404
    fake_uuid = str(uuid.uuid4())
    resp = get_folder(spv_token, fake_uuid)
    assert resp.status_code == 404, f"Expected 404 Not Found for non-existent folder UUID, got {resp.status_code}"

test_get_api_folders_list_and_get_folder_details_with_spv_scoping()
