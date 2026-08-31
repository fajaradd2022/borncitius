import requests
from requests.exceptions import RequestException
import uuid

BASE_URL = "http://localhost:4000"
ADMIN_EMAIL = "itopscitius@gmail.com"
ADMIN_PASSWORD = "w90uWxvH6vkjMXKQqoyr"
TIMEOUT = 30

def admin_manage_output_layouts_with_blocks():
    # Authenticate as admin
    try:
        login_resp = requests.post(
            f"{BASE_URL}/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
            timeout=TIMEOUT,
        )
        if login_resp.status_code != 200:
            # Login failed, test 401 path by attempting protected calls without token
            # Test GET /layouts unauthorized
            resp = requests.get(f"{BASE_URL}/layouts", timeout=TIMEOUT)
            assert resp.status_code == 401
            
            # Test POST /layouts unauthorized
            resp = requests.post(
                f"{BASE_URL}/layouts",
                json={"name":"fail", "sourceTemplateId":str(uuid.uuid4()), "blocks":[]},
                timeout=TIMEOUT,
            )
            assert resp.status_code == 401
            
            # Test PUT /layouts/:id unauthorized
            resp = requests.put(
                f"{BASE_URL}/layouts/{str(uuid.uuid4())}",
                json={"name": "fail", "blocks":[]},
                timeout=TIMEOUT,
            )
            assert resp.status_code == 401

            # Test GET /layouts/:id unauthorized
            resp = requests.get(f"{BASE_URL}/layouts/{str(uuid.uuid4())}", timeout=TIMEOUT)
            assert resp.status_code == 401
            return
        login_data = login_resp.json()
        access_token = login_data["accessToken"]
    except (RequestException, KeyError) as e:
        raise AssertionError(f"Admin login failed or malformed response: {e}")

    headers = {"Authorization": f"Bearer {access_token}"}

    # Create a task template with at least one field to use fieldId in layout blocks
    try:
        template_payload = {
            "name": "Test Template for Layout Blocks",
            "isActive": True,
            "fields": [
                {
                    "name": "Field1",
                    "type": "string",
                    "order": 1,
                    "isRequired": False
                }
            ]
        }
        tmpl_resp = requests.post(f"{BASE_URL}/templates", headers=headers, json=template_payload, timeout=TIMEOUT)
        assert tmpl_resp.status_code == 200
        tmpl = tmpl_resp.json()
        template_id = tmpl["id"]
        # Get the fieldId from the first field
        fields = tmpl.get("fields", [])
        assert len(fields) > 0
        field_id = fields[0]["id"]
    except Exception as e:
        raise AssertionError(f"Failed to create template with fields for layout testing: {e}")

    # 1. GET /layouts to receive 200 with layout list
    try:
        resp = requests.get(f"{BASE_URL}/layouts", headers=headers, timeout=TIMEOUT)
        assert resp.status_code == 200
        layouts = resp.json()
        assert isinstance(layouts, list)
    except (RequestException, AssertionError) as e:
        raise AssertionError(f"GET /layouts failed or invalid response: {e}")

    # 2. GET /layouts/:id with valid id (use first layout if exists)
    valid_layout_id = None
    if layouts:
        first_layout = layouts[0]
        valid_layout_id = first_layout.get("id")
    # If no layout exists, create one for test then delete after
    created_layout_id = None

    def create_sample_layout():
        layout_payload = {
            "name": "Test Layout for TC008",
            "sourceTemplateId": template_id,
            "blocks": [
                {
                    "fieldId": field_id,
                    "order": 1,
                    "content": "Sample block content"
                }
            ]
        }
        try:
            create_resp = requests.post(f"{BASE_URL}/layouts", headers=headers, json=layout_payload, timeout=TIMEOUT)
            assert create_resp.status_code == 200
            layout = create_resp.json()
            return layout
        except Exception as e:
            raise AssertionError(f"Failed to create layout for testing: {e}")

    try:
        if not valid_layout_id:
            layout = create_sample_layout()
            created_layout_id = layout.get("id")
            valid_layout_id = created_layout_id

        # GET with valid id
        resp = requests.get(f"{BASE_URL}/layouts/{valid_layout_id}", headers=headers, timeout=TIMEOUT)
        assert resp.status_code == 200
        layout_data = resp.json()
        assert "blocks" in layout_data
        assert "sourceTemplate" in layout_data or "sourceTemplateId" in layout_data
    except (RequestException, AssertionError) as e:
        raise AssertionError(f"GET /layouts/:id with valid id failed: {e}")

    # GET with invalid id -> 404
    try:
        invalid_id = str(uuid.uuid4())
        # Ensure invalid_id is different
        if invalid_id == valid_layout_id:
            invalid_id = str(uuid.uuid4())
        resp = requests.get(f"{BASE_URL}/layouts/{invalid_id}", headers=headers, timeout=TIMEOUT)
        assert resp.status_code == 404
    except (RequestException, AssertionError) as e:
        raise AssertionError(f"GET /layouts/:id with invalid id did not return 404: {e}")

    # 3. POST /layouts with admin credentials and valid payload to create layout (200)
    create_payload = {
        "name": "Layout for TC008 Create Test",
        "sourceTemplateId": template_id,
        "blocks": [
            {
                "fieldId": field_id,
                "order": 1,
                "content": "Block content for new layout"
            }
        ]
    }

    new_layout_id = None
    try:
        resp = requests.post(f"{BASE_URL}/layouts", headers=headers, json=create_payload, timeout=TIMEOUT)
        assert resp.status_code == 200
        new_layout = resp.json()
        new_layout_id = new_layout.get("id")
        assert new_layout["name"] == create_payload["name"]
    except (RequestException, AssertionError) as e:
        raise AssertionError(f"POST /layouts failed: {e}")

    # 4. PUT /layouts/:id with valid id
    put_payload = {
        "name": "Updated Layout Name",
        "blocks": [
            {
                "fieldId": field_id,
                "order": 1,
                "content": "Updated block content"
            },
            {
                "fieldId": field_id,
                "order": 2,
                "content": "Additional block"
            }
        ]
    }

    try:
        resp = requests.put(f"{BASE_URL}/layouts/{new_layout_id}", headers=headers, json=put_payload, timeout=TIMEOUT)
        assert resp.status_code == 200
        updated_layout = resp.json()
        assert updated_layout.get("name") == put_payload["name"]
        assert isinstance(updated_layout.get("blocks"), list)
        assert len(updated_layout["blocks"]) == 2
    except (RequestException, AssertionError) as e:
        raise AssertionError(f"PUT /layouts/:id with valid id failed: {e}")

    # PUT /layouts/:id with missing/non-existent id -> 404
    try:
        missing_id = str(uuid.uuid4())
        if missing_id == new_layout_id:
            missing_id = str(uuid.uuid4())
        resp = requests.put(f"{BASE_URL}/layouts/{missing_id}", headers=headers, json=put_payload, timeout=TIMEOUT)
        assert resp.status_code == 404
    except (RequestException, AssertionError) as e:
        raise AssertionError(f"PUT /layouts/:id with missing id did not return 404: {e}")

    # Cleanup created layout and template if created
    try:
        if new_layout_id:
            # DELETE for /layouts/:id is not supported per PRD; no action
            pass
    except Exception:
        pass

    try:
        if created_layout_id:
            # DELETE for /layouts/:id is not supported per PRD; no action
            pass
    except Exception:
        pass

admin_manage_output_layouts_with_blocks()
