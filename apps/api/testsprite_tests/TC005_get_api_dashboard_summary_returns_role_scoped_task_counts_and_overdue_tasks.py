import requests
from requests.exceptions import RequestException
import pytest

BASE_URL = "http://localhost:4000"
API_PREFIX = "/api"
TIMEOUT = 30

# Seeded user credentials
USERS = {
    "admin": {"email": "itopscitius@gmail.com", "password": "BornCitius#2026"},
    "spv": {"email": "dian.spv@borncitius.id", "password": "BornCitius#2026"},
    "teknisi": {"email": "rizky@borncitius.id", "password": "BornCitius#2026"},
}

def login_get_access_token(email: str, password: str):
    url = f"{BASE_URL}{API_PREFIX}/auth/login"
    try:
        resp = requests.post(
            url,
            json={"email": email, "password": password},
            timeout=TIMEOUT,
        )
        if resp.status_code == 200:
            data = resp.json()
            return data.get("accessToken")
        elif resp.status_code == 401:
            # treat any 401 with error/message field as invalid credentials, no assert on exact wording
            if "error" in resp.json() or "message" in resp.json():
                return None
        else:
            resp.raise_for_status()
    except RequestException as e:
        pytest.fail(f"Login request failed: {e}")
    return None


def test_get_dashboard_summary_with_and_without_auth():
    # Test GET /api/dashboard/summary without authentication should return 401 unauthorized
    url = f"{BASE_URL}{API_PREFIX}/dashboard/summary"
    try:
        resp = requests.get(url, timeout=TIMEOUT)
    except RequestException as e:
        pytest.fail(f"Request to {url} without auth failed: {e}")
    assert resp.status_code == 401
    # Validate error/message field for invalid credentials or unauthorized
    body = resp.json()
    assert "error" in body or "message" in body

    # For each seeded role (admin, spv, teknisi), login and test GET /api/dashboard/summary
    for role, creds in USERS.items():
        access_token = login_get_access_token(creds["email"], creds["password"])
        assert access_token is not None, f"Failed to obtain access token for {role}"
        headers = {"Authorization": f"Bearer {access_token}"}

        try:
            resp = requests.get(url, headers=headers, timeout=TIMEOUT)
        except RequestException as e:
            pytest.fail(f"Request failed for role {role}: {e}")

        assert resp.status_code == 200, f"Expected 200 for role {role}, got {resp.status_code}"

        data = resp.json()
        # Validate presence and type of expected keys in response
        assert isinstance(data, dict), f"Response for role {role} is not a dict"
        assert "statusCounts" in data, f"Missing statusCounts in response for role {role}"
        assert isinstance(data["statusCounts"], dict), f"statusCounts is not a dict for role {role}"
        assert "perFolder" in data, f"Missing perFolder in response for role {role}"
        assert isinstance(data["perFolder"], list), f"perFolder is not a list for role {role}"
        assert "overdue" in data, f"Missing overdue in response for role {role}"
        assert isinstance(data["overdue"], list), f"overdue is not a list for role {role}"

        # Further checks: statusCounts keys and values should be int >= 0
        for key, val in data["statusCounts"].items():
            assert isinstance(key, str)
            assert isinstance(val, int)
            assert val >= 0

        # perFolder: each item should be a dict (folder task counts), at least with folderId or similar (cannot assert exact schema)
        for folder in data["perFolder"]:
            assert isinstance(folder, dict)

        # overdue: each item should be a dict (task info)
        for task in data["overdue"]:
            assert isinstance(task, dict)
            # Overdue tasks limit max 20 (per PRD) but not strictly enforced here
        # No further assumptions made about exact content or keys as it is role scoped and dynamic

test_get_dashboard_summary_with_and_without_auth()