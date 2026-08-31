import requests

BASE_URL = "http://localhost:4000"
LOGIN_ENDPOINT = "/api/auth/login"
LOGOUT_ENDPOINT = "/api/auth/logout"
TIMEOUT = 30

def test_post_api_auth_logout_revokes_device_session():
    login_url = BASE_URL + LOGIN_ENDPOINT
    logout_url = BASE_URL + LOGOUT_ENDPOINT

    login_payload = {
        "email": "itopscitius@gmail.com",
        "password": "BornCitius#2026"
    }

    try:
        # Step 1: Login to get a valid refreshToken
        login_response = requests.post(login_url, json=login_payload, timeout=TIMEOUT)
        assert login_response.status_code == 200, f"Unexpected login status {login_response.status_code}"
        login_json = login_response.json()
        assert "refreshToken" in login_json, "refreshToken not in login response"
        refresh_token = login_json["refreshToken"]

        # Step 2: Call POST /api/auth/logout with the refreshToken
        logout_payload = {"refreshToken": refresh_token}
        logout_response = requests.post(logout_url, json=logout_payload, timeout=TIMEOUT)

        # Validate response: 204 No Content
        assert logout_response.status_code == 204, f"Expected 204 No Content, got {logout_response.status_code}"
        assert logout_response.text == '', "Logout response body should be empty"

        # Step 3: Confirm that the refreshToken is revoked by trying to refresh token with it
        refresh_url = BASE_URL + "/api/auth/refresh"
        refresh_payload = {"refreshToken": refresh_token}
        refresh_response = requests.post(refresh_url, json=refresh_payload, timeout=TIMEOUT)
        # Expected: 401 Unauthorized (invalid/expired refresh token)
        assert refresh_response.status_code == 401, f"Expected 401 after logout, got {refresh_response.status_code}"
        refresh_json = refresh_response.json()
        assert "error" in refresh_json or "message" in refresh_json, "401 response should contain error/message"

    except requests.RequestException as e:
        assert False, f"Request failed: {str(e)}"

test_post_api_auth_logout_revokes_device_session()