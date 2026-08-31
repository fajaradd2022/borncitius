import requests

BASE_URL = "http://localhost:4000"
TIMEOUT = 30
PASSWORD = "w90uWxvH6vkjMXKQqoyr"
ACCOUNTS = [
    {"email": "itopscitius@gmail.com", "role": "admin"},
    {"email": "dian.spv@borncitius.id", "role": "spv"},
    {"email": "rizky@borncitius.id", "role": "teknisi"},
    {"email": "agus@borncitius.id", "role": "teknisi"},
]

def test_post_auth_refresh_with_valid_and_invalid_refresh_tokens():
    session = requests.Session()
    headers = {"Content-Type": "application/json"}
    valid_refresh_tokens = []

    # Attempt login for all accounts to collect valid refresh tokens
    for account in ACCOUNTS:
        try:
            login_resp = session.post(
                f"{BASE_URL}/auth/login",
                json={
                    "email": account["email"],
                    "password": PASSWORD,
                },
                headers=headers,
                timeout=TIMEOUT,
            )
        except requests.RequestException as e:
            assert False, f"Login request failed for {account['email']}: {e}"

        if login_resp.status_code == 200:
            login_data = login_resp.json()
            # Store the valid refresh token
            rt = login_data.get("refreshToken")
            assert rt and isinstance(rt, str), f"Missing refreshToken on login for {account['email']}"
            valid_refresh_tokens.append(rt)
        elif login_resp.status_code in (401, 404):
            # Treat as invalid credentials or user not found - skip adding token
            pass
        else:
            assert False, f"Unexpected status {login_resp.status_code} on login for {account['email']}"

    assert valid_refresh_tokens, "No valid refresh tokens obtained from login."

    # Test valid refresh tokens - expect 200 with new accessToken and refreshToken
    for rt in valid_refresh_tokens:
        try:
            refresh_resp = session.post(
                f"{BASE_URL}/auth/refresh",
                json={"refreshToken": rt},
                headers=headers,
                timeout=TIMEOUT,
            )
        except requests.RequestException as e:
            assert False, f"Refresh request failed for valid token: {e}"

        assert refresh_resp.status_code == 200, f"Expected 200 for valid refresh token, got {refresh_resp.status_code}"
        rdata = refresh_resp.json()
        assert "accessToken" in rdata and isinstance(rdata["accessToken"], str) and rdata["accessToken"], "Missing or invalid accessToken in refresh response"
        assert "refreshToken" in rdata and isinstance(rdata["refreshToken"], str) and rdata["refreshToken"], "Missing or invalid refreshToken in refresh response"

    # Test invalid refresh tokens - expect 401 with error message
    invalid_tokens = [
        "",  # empty string
        "invalidtoken",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.expired.signature",  # malformed/expired JWT
        "1234567890abcdef",
    ]

    for invalid_rt in invalid_tokens:
        try:
            refresh_resp = session.post(
                f"{BASE_URL}/auth/refresh",
                json={"refreshToken": invalid_rt},
                headers=headers,
                timeout=TIMEOUT,
            )
        except requests.RequestException as e:
            assert False, f"Refresh request failed for invalid token '{invalid_rt}': {e}"

        assert refresh_resp.status_code == 401, f"Expected 401 for invalid refresh token '{invalid_rt}', got {refresh_resp.status_code}"
        # Response body may contain message indicating invalid/expired token
        try:
            data = refresh_resp.json()
            error_msg = str(data.get("message", "")).lower()
            assert "invalid" in error_msg or "expired" in error_msg, f"Unexpected error message for invalid token '{invalid_rt}': {error_msg}"
        except Exception:
            # Non-JSON or no message is also considered valid for this test
            pass

test_post_auth_refresh_with_valid_and_invalid_refresh_tokens()