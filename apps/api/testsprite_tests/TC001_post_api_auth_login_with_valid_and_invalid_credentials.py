import requests

BASE_URL = "http://localhost:4000"
API_LOGIN_PATH = "/api/auth/login"
TIMEOUT = 30


def test_post_api_auth_login_with_valid_and_invalid_credentials():
    url = BASE_URL + API_LOGIN_PATH
    headers = {"Content-Type": "application/json"}

    # Valid credentials to test (seeded accounts)
    valid_accounts = [
        {"email": "itopscitius@gmail.com", "password": "BornCitius#2026"},  # admin
        {"email": "dian.spv@borncitius.id", "password": "BornCitius#2026"},  # spv
        {"email": "rizky@borncitius.id", "password": "BornCitius#2026"},  # teknisi
        {"email": "agus@borncitius.id", "password": "BornCitius#2026"},  # teknisi
    ]

    for account in valid_accounts:
        payload = {
            "email": account["email"],
            "password": account["password"],
            "deviceId": "test-device-123"
        }
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)
        except requests.RequestException as e:
            assert False, f"Valid login request failed: {e}"

        assert response.status_code == 200, f"Expected 200 OK for valid login, got {response.status_code}"
        try:
            data = response.json()
        except Exception as e:
            assert False, f"Failed to parse JSON from valid login response: {e}"

        assert "accessToken" in data and isinstance(data["accessToken"], str) and data["accessToken"], "Missing or invalid accessToken"
        assert "refreshToken" in data and isinstance(data["refreshToken"], str) and data["refreshToken"], "Missing or invalid refreshToken"
        assert "user" in data and isinstance(data["user"], dict), "Missing or invalid user object"

    # Invalid credentials tests - different types of invalid data
    invalid_credentials = [
        {"email": "itopscitius@gmail.com", "password": "wrongpassword"},  # wrong password
        {"email": "nonexistent@borncitius.id", "password": "BornCitius#2026"},  # non-existent user
        {"email": "", "password": "BornCitius#2026"},  # empty email
        {"email": "itopscitius@gmail.com", "password": ""},  # empty password
        {"email": "invalidemailformat", "password": "BornCitius#2026"},  # invalid email format
    ]

    for cred in invalid_credentials:
        payload = {
            "email": cred["email"],
            "password": cred["password"],
        }
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)
        except requests.RequestException as e:
            assert False, f"Invalid login request failed: {e}"

        # Expecting 401 Unauthorized with error message in Indonesian or error field
        assert response.status_code == 401, f"Expected 401 Unauthorized for invalid login, got {response.status_code}"
        try:
            err_data = response.json()
        except Exception:
            err_data = {}

        # Validate the presence of error/message fields in response to count as valid invalid-credentials response
        assert (
            ("error" in err_data and err_data["error"].lower() == "unauthorized")
            or "message" in err_data
            or "error" in err_data
        ), f"401 response missing error/message fields: {err_data}"


test_post_api_auth_login_with_valid_and_invalid_credentials()