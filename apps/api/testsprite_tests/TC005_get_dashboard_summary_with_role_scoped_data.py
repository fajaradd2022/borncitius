import requests

BASE_URL = "http://localhost:4000"
PASSWORD = "w90uWxvH6vkjMXKQqoyr"
TIMEOUT = 30

USERS = {
    "admin": "itopscitius@gmail.com",
    "spv": "dian.spv@borncitius.id",
    "teknisi1": "rizky@borncitius.id",
    "teknisi2": "agus@borncitius.id"
}

def login(email, password):
    url = f"{BASE_URL}/auth/login"
    json_data = {"email": email, "password": password}
    try:
        resp = requests.post(url, json=json_data, timeout=TIMEOUT)
    except Exception as e:
        raise RuntimeError(f"Login request failed for {email}: {e}")
    return resp

def test_get_dashboard_summary_with_role_scoped_data():
    tokens = {}
    # Login each user and store access tokens if successful
    for role, email in USERS.items():
        resp = login(email, PASSWORD)
        if resp.status_code == 200:
            json_resp = resp.json()
            tokens[role] = json_resp.get("accessToken")
        else:
            # Invalid credentials, we do not store token for this user and treat for 401 path
            tokens[role] = None

    headers_no_auth = {}
    url = f"{BASE_URL}/dashboard/summary"

    # 1. Test each valid token: GET /dashboard/summary expects 200 with statusCounts, perFolder, overdue
    for role in ["admin", "spv", "teknisi1", "teknisi2"]:
        token = tokens.get(role)
        if token:
            headers = {"Authorization": f"Bearer {token}"}
            try:
                resp = requests.get(url, headers=headers, timeout=TIMEOUT)
            except Exception as e:
                raise RuntimeError(f"GET /dashboard/summary request failed for role {role}: {e}")

            assert resp.status_code == 200, f"Expected 200 for role {role}, got {resp.status_code}"
            data = resp.json()
            # Validate presence and types of expected keys
            assert isinstance(data, dict), f"Response for {role} is not a JSON object"
            assert "statusCounts" in data, f"Missing 'statusCounts' in response for {role}"
            assert isinstance(data["statusCounts"], dict), f"'statusCounts' is not a dict for {role}"
            assert "perFolder" in data, f"Missing 'perFolder' in response for {role}"
            assert isinstance(data["perFolder"], list), f"'perFolder' is not a list for {role}"
            assert "overdue" in data, f"Missing 'overdue' in response for {role}"
            assert isinstance(data["overdue"], list), f"'overdue' is not a list for {role}"
        else:
            # Token not available due to login failure - test 401 Unauthorized scenario with this user credentials
            # but the instruction says treat credentials as invalid and test 401 unauthorized, so test without token
            try:
                resp = requests.get(url, timeout=TIMEOUT)
            except Exception as e:
                raise RuntimeError(f"GET /dashboard/summary request failed without token: {e}")

            assert resp.status_code == 401, f"Expected 401 Unauthorized when no token is provided, got {resp.status_code}"

    # 2. Explicit test for GET /dashboard/summary without access token - expect 401 unauthorized
    try:
        resp = requests.get(url, timeout=TIMEOUT)
    except Exception as e:
        raise RuntimeError(f"GET /dashboard/summary request failed without token: {e}")

    assert resp.status_code == 401, f"Expected 401 Unauthorized when no token is provided, got {resp.status_code}"


test_get_dashboard_summary_with_role_scoped_data()