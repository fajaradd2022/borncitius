import requests
import time

BASE_URL = "http://localhost:4000"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
AUTH_ME_URL = f"{BASE_URL}/api/auth/me"
HEADERS = {"Content-Type": "application/json"}
TIMEOUT = 30

def test_get_api_auth_me_returns_authenticated_user_profile():
    email = "itopscitius@gmail.com"
    password = "BornCitius#2026"
    access_token = None

    # Login to get access token
    login_payload = {
        "email": email,
        "password": password
    }
    max_retries = 5
    for attempt in range(max_retries):
        try:
            login_resp = requests.post(LOGIN_URL, json=login_payload, headers=HEADERS, timeout=TIMEOUT)
            if login_resp.status_code == 200:
                login_data = login_resp.json()
                access_token = login_data.get("accessToken")
                break
            elif login_resp.status_code == 401:
                # API might be stale or restarting, retry after delay
                time.sleep(2)
                continue
            else:
                login_resp.raise_for_status()
        except requests.RequestException:
            time.sleep(2)
    else:
        raise Exception(f"Failed to login after {max_retries} attempts")

    assert access_token, "Access token was not retrieved from login"

    # Call GET /api/auth/me with the access token
    headers_auth = {
        "Authorization": f"Bearer {access_token}"
    }
    resp = requests.get(AUTH_ME_URL, headers=headers_auth, timeout=TIMEOUT)

    # Check for successful response
    assert resp.status_code == 200, f"Expected status code 200, got {resp.status_code}"

    user_profile = resp.json()
    # Validate some expected fields in user profile (id, email, name, role)
    assert "id" in user_profile, "User profile missing 'id'"
    assert "email" in user_profile, "User profile missing 'email'"
    assert user_profile["email"].lower() == email.lower(), "User profile email does not match login email"
    assert "name" in user_profile, "User profile missing 'name'"
    assert "role" in user_profile, "User profile missing 'role'"

test_get_api_auth_me_returns_authenticated_user_profile()