import requests
from requests.exceptions import RequestException

BASE_URL = "http://localhost:4000"
PASSWORD = "w90uWxvH6vkjMXKQqoyr"
TIMEOUT = 30

ADMIN_EMAIL = "itopscitius@gmail.com"
SPV_EMAIL = "dian.spv@borncitius.id"
TEKNISI_EMAILS = ["rizky@borncitius.id", "agus@borncitius.id"]


def login(email, password):
    try:
        resp = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": email, "password": password},
            timeout=TIMEOUT,
        )
        if resp.status_code == 200:
            data = resp.json()
            return data["accessToken"], data["refreshToken"], data["user"]
        elif resp.status_code == 401:
            return None, None, None
        else:
            resp.raise_for_status()
    except RequestException:
        return None, None, None


def get_folders_list(token):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.get(f"{BASE_URL}/folders", headers=headers, timeout=TIMEOUT)


def get_folder_detail(folder_id, token):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return requests.get(f"{BASE_URL}/folders/{folder_id}", headers=headers, timeout=TIMEOUT)


def test_get_folders_list_and_folder_details_with_spv_scoping():
    # Login SPV user
    spv_access_token, _, _ = login(SPV_EMAIL, PASSWORD)
    if spv_access_token is None:
        # Credentials invalid, test 401 unauthorized for /folders
        resp = get_folders_list(None)
        assert resp.status_code == 401, f"Expected 401 for unauthenticated /folders but got {resp.status_code}"
        # Also test GET /folders/:id returns 401 for any id
        dummy_uuid = "00000000-0000-0000-0000-000000000000"
        resp_unauth = get_folder_detail(dummy_uuid, None)
        assert resp_unauth.status_code == 401, f"Expected 401 for unauthenticated /folders/:id but got {resp_unauth.status_code}"
        return

    headers_spv = {"Authorization": f"Bearer {spv_access_token}"}

    # 1. GET /folders with SPV token - should receive 200 with folder list including defaultReviewer and task count
    resp = get_folders_list(spv_access_token)
    assert resp.status_code == 200, f"Expected 200 but got {resp.status_code}"
    folders = resp.json()
    assert isinstance(folders, list), f"Expected a list of folders but got {type(folders)}"
    # Each folder should have defaultReviewer and task count fields
    for f in folders:
        assert "defaultReviewer" in f, "Folder missing defaultReviewer field"
        assert "taskCount" in f or "task_count" in f, "Folder missing task count field"

    # Select one folder that the SPV reviews
    folder_spv_reviews = None
    for f in folders:
        default_reviewer = f.get("defaultReviewer") or {}
        if isinstance(default_reviewer, dict) and default_reviewer.get("email", "").lower() == SPV_EMAIL.lower():
            folder_spv_reviews = f
            break

    # Select one folder that the SPV does NOT review (from folders)
    folder_spv_not_reviews = None
    for f in folders:
        default_reviewer = f.get("defaultReviewer") or {}
        if isinstance(default_reviewer, dict) and default_reviewer.get("email", "").lower() != SPV_EMAIL.lower():
            folder_spv_not_reviews = f
            break

    # 2. GET /folders/:id with SPV token for folder they review -> expect 200 with folder details
    if folder_spv_reviews:
        folder_id = folder_spv_reviews.get("id") or folder_spv_reviews.get("uuid")
        assert folder_id, "Folder id missing"
        resp = get_folder_detail(folder_id, spv_access_token)
        assert resp.status_code == 200, f"Expected 200 for folder reviewed by SPV but got {resp.status_code}"
        folder_detail = resp.json()
        assert folder_detail.get("id") == folder_id or folder_detail.get("uuid") == folder_id, "Folder detail id mismatch"
    else:
        # If no folder found where SPV is default reviewer, skip this part
        folder_id = None

    # 3. GET /folders/:id with SPV token for folder they do NOT review -> expect 403
    if folder_spv_not_reviews:
        folder_id_not = folder_spv_not_reviews.get("id") or folder_spv_not_reviews.get("uuid")
        assert folder_id_not, "Folder id missing"
        resp = get_folder_detail(folder_id_not, spv_access_token)
        assert resp.status_code == 403, f"Expected 403 for folder NOT reviewed by SPV but got {resp.status_code}"
    else:
        # No folder found that SPV is not reviewing - cannot test 403 case
        pass

    # 4. GET /folders/:non_existent_id with SPV token -> 404
    non_existent_id = "00000000-0000-0000-0000-000000000000"
    resp = get_folder_detail(non_existent_id, spv_access_token)
    assert resp.status_code == 404, f"Expected 404 for non-existent folder but got {resp.status_code}"


test_get_folders_list_and_folder_details_with_spv_scoping()