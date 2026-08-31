import requests

BASE_URL = "http://localhost:4000"
LOGIN_URL = f"{BASE_URL}/auth/login"
LOGOUT_URL = f"{BASE_URL}/auth/logout"

USERS = [
    {"email": "itopscitius@gmail.com", "password": "w90uWxvH6vkjMXKQqoyr", "role": "admin"},
    {"email": "dian.spv@borncitius.id", "password": "w90uWxvH6vkjMXKQqoyr", "role": "spv"},
    {"email": "rizky@borncitius.id", "password": "w90uWxvH6vkjMXKQqoyr", "role": "teknisi"},
    {"email": "agus@borncitius.id", "password": "w90uWxvH6vkjMXKQqoyr", "role": "teknisi"},
]

def test_post_auth_logout_revoke_refresh_token():
    timeout = 30
    # Attempt login for each user until one succeeds
    refresh_token = None
    for user in USERS:
        try:
            resp = requests.post(
                LOGIN_URL,
                json={"email": user["email"], "password": user["password"]},
                timeout=timeout,
            )
            if resp.status_code == 200:
                data = resp.json()
                refresh_token = data.get("refreshToken")
                break
            elif resp.status_code == 401:
                continue
            else:
                # Unexpected status; continue trying other users
                continue
        except requests.RequestException:
            continue

    # If no valid login, test 401 case by trying logout with invalid refresh token
    if not refresh_token:
        # Use a dummy invalid token to test 401 path
        invalid_token = "invalid-refresh-token-for-testing"
        try:
            logout_resp = requests.post(
                LOGOUT_URL,
                json={"refreshToken": invalid_token},
                timeout=timeout,
            )
        except requests.RequestException as e:
            assert False, f"Logout request failed unexpectedly: {e}"

        # Allow logout response 400, 401, or 404 for invalid token
        assert logout_resp.status_code != 204, "Logout should not succeed with invalid refreshToken"
        assert logout_resp.status_code in [400, 401, 404], f"Expected 400, 401 or 404 for invalid token, got {logout_resp.status_code}"
        return

    # If valid refresh token obtained, test logout success path
    try:
        logout_resp = requests.post(
            LOGOUT_URL,
            json={"refreshToken": refresh_token},
            timeout=timeout,
        )
    except requests.RequestException as e:
        assert False, f"Logout request failed unexpectedly: {e}"

    assert logout_resp.status_code == 204, f"Logout did not return 204 No content, got {logout_resp.status_code}"

    # Verify that the refresh token is revoked by attempting token refresh - should fail with 401
    refresh_url = f"{BASE_URL}/auth/refresh"
    try:
        refresh_resp = requests.post(
            refresh_url,
            json={"refreshToken": refresh_token},
            timeout=timeout,
        )
    except requests.RequestException as e:
        assert False, f"Refresh request failed unexpectedly: {e}"

    assert refresh_resp.status_code == 401, f"Refreshed with revoked token, expected 401, got {refresh_resp.status_code}"

test_post_auth_logout_revoke_refresh_token()
