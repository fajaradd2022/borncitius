import requests

BASE_URL = "http://localhost:4000"
LOGIN_URL = f"{BASE_URL}/auth/login"
AUTH_ME_URL = f"{BASE_URL}/auth/me"
TIMEOUT = 30
PASSWORD = "w90uWxvH6vkjMXKQqoyr"

# Accounts seeded for auth testing as per instructions
test_users = [
    {"email": "itopscitius@gmail.com", "role": "admin"},
    {"email": "dian.spv@borncitius.id", "role": "spv"},
    {"email": "rizky@borncitius.id", "role": "teknisi"},
    {"email": "agus@borncitius.id", "role": "teknisi"},
]

def test_get_auth_me_returns_current_authenticated_user():
    session = requests.Session()
    headers = {}
    for user in test_users:
        login_payload = {
            "email": user["email"],
            "password": PASSWORD
        }
        try:
            login_resp = session.post(LOGIN_URL, json=login_payload, timeout=TIMEOUT)
        except requests.RequestException as e:
            raise AssertionError(f"Login request failed for user {user['email']}: {e}")

        if login_resp.status_code == 200:
            # Parse tokens
            try:
                login_json = login_resp.json()
                access_token = login_json["accessToken"]
                user_profile = login_json.get("user", {})
            except (ValueError, KeyError) as e:
                raise AssertionError(f"Malformed login response for user {user['email']}: {e}")

            assert isinstance(access_token, str) and access_token, f"Access token missing for user {user['email']}"

            # Test GET /auth/me with this access token
            headers = {"Authorization": f"Bearer {access_token}"}
            try:
                auth_me_resp = session.get(AUTH_ME_URL, headers=headers, timeout=TIMEOUT)
            except requests.RequestException as e:
                raise AssertionError(f"GET /auth/me request failed for user {user['email']}: {e}")

            assert auth_me_resp.status_code == 200, f"GET /auth/me failed with status {auth_me_resp.status_code} for user {user['email']}"

            try:
                auth_me_data = auth_me_resp.json()
            except ValueError:
                raise AssertionError(f"Invalid JSON response from /auth/me for user {user['email']}")

            # Validate that user details are present and match login profile fields at least partially
            assert isinstance(auth_me_data, dict), f"/auth/me response is not a JSON object for user {user['email']}"
            # Check keys typical for authenticated user
            expected_keys = ["id", "email", "role"]
            for key in expected_keys:
                assert key in auth_me_data, f"Key '{key}' missing in /auth/me response for user {user['email']}"
            assert auth_me_data["email"] == user["email"], f"Email mismatch in /auth/me response for user {user['email']}"
            # Role might be checked but may differ in case or naming, check it loosely
            assert auth_me_data["role"].lower() == user["role"].lower(), f"Role mismatch in /auth/me response for user {user['email']}"

        elif login_resp.status_code == 401:
            # Invalid credentials path
            # According to instructions, treat credentials as invalid and test 401 path
            # So here we test that GET /auth/me with no or invalid token returns 401
            try:
                auth_me_bad_resp = session.get(AUTH_ME_URL, timeout=TIMEOUT)
            except requests.RequestException as e:
                raise AssertionError(f"GET /auth/me request failed for invalid user {user['email']}: {e}")
            assert auth_me_bad_resp.status_code == 401, f"Expected 401 Unauthorized for user {user['email']} without token, got {auth_me_bad_resp.status_code}"

            invalid_token_headers = {"Authorization": "Bearer invalidtoken123"}
            try:
                auth_me_bad_token_resp = session.get(AUTH_ME_URL, headers=invalid_token_headers, timeout=TIMEOUT)
            except requests.RequestException as e:
                raise AssertionError(f"GET /auth/me request failed for invalid token for user {user['email']}: {e}")
            assert auth_me_bad_token_resp.status_code == 401, f"Expected 401 for invalid token for user {user['email']}, got {auth_me_bad_token_resp.status_code}"

        else:
            raise AssertionError(f"Unexpected login status {login_resp.status_code} for user {user['email']}")

test_get_auth_me_returns_current_authenticated_user()
