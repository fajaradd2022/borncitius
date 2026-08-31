import requests

BASE_URL = "http://localhost:4000/api"
LOGIN_ENDPOINT = f"{BASE_URL}/auth/login"
REFRESH_ENDPOINT = f"{BASE_URL}/auth/refresh"
TIMEOUT = 30

def test_post_api_auth_refresh_with_valid_and_invalid_refresh_tokens():
    # Use known seeded account for login (admin)
    login_payload = {
        "email": "itopscitius@gmail.com",
        "password": "BornCitius#2026"
    }

    try:
        # Step 1: Login to get valid refreshToken
        login_resp = requests.post(LOGIN_ENDPOINT, json=login_payload, timeout=TIMEOUT)
        assert login_resp.status_code == 200, f"Login failed with status {login_resp.status_code}"
        login_data = login_resp.json()
        valid_refresh_token = login_data.get("refreshToken")
        assert valid_refresh_token and isinstance(valid_refresh_token, str), "No valid refreshToken from login"

        # Step 2: POST /api/auth/refresh with valid refreshToken
        refresh_payload_valid = {"refreshToken": valid_refresh_token}
        refresh_resp_valid = requests.post(REFRESH_ENDPOINT, json=refresh_payload_valid, timeout=TIMEOUT)
        assert refresh_resp_valid.status_code == 200, f"Refresh with valid token failed with status {refresh_resp_valid.status_code}"
        refresh_data_valid = refresh_resp_valid.json()
        assert "accessToken" in refresh_data_valid and isinstance(refresh_data_valid["accessToken"], str), "Missing accessToken in refresh response"
        assert "refreshToken" in refresh_data_valid and isinstance(refresh_data_valid["refreshToken"], str), "Missing refreshToken in refresh response"

        # Step 3: POST /api/auth/refresh with an invalid refreshToken
        invalid_refresh_tokens = [
            "invalid.token.example.string",
            "",  # empty string
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.invalidsignature",  # malformed JWT
        ]
        for token in invalid_refresh_tokens:
            refresh_payload_invalid = {"refreshToken": token}
            refresh_resp_invalid = requests.post(REFRESH_ENDPOINT, json=refresh_payload_invalid, timeout=TIMEOUT)
            # Accept 401 or 400 as server may return 400 on malformed tokens
            assert refresh_resp_invalid.status_code in (400, 401), f"Invalid token did not return 401/400, got {refresh_resp_invalid.status_code}"
            resp_json = {}
            try:
                resp_json = refresh_resp_invalid.json()
            except Exception:
                pass
            assert any(k in resp_json for k in ("error", "message")), "401/400 response lacks error or message field"

        # Step 4: POST /api/auth/refresh with an expired token (simulate by using a previously valid but then invalidated token if possible)
        # Since no explicit expired token provided, we just attempt one more invalid but well-formed token (simulate expired)
        expired_token = valid_refresh_token + "expired"  # malformed but well-formed prefix
        refresh_payload_expired = {"refreshToken": expired_token}
        refresh_resp_expired = requests.post(REFRESH_ENDPOINT, json=refresh_payload_expired, timeout=TIMEOUT)
        assert refresh_resp_expired.status_code == 401, f"Expired token did not return 401, got {refresh_resp_expired.status_code}"
        expired_resp_json = {}
        try:
            expired_resp_json = refresh_resp_expired.json()
        except Exception:
            pass
        assert any(k in expired_resp_json for k in ("error", "message")), "Expired token 401 response lacks error or message field"

    except requests.RequestException as e:
        assert False, f"HTTP request failed: {e}"

test_post_api_auth_refresh_with_valid_and_invalid_refresh_tokens()
