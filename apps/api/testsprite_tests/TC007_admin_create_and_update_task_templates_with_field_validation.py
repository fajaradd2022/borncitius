import requests
import uuid

BASE_URL = "http://localhost:4000"
TIMEOUT = 30
PASSWORD = "w90uWxvH6vkjMXKQqoyr"

USERS = {
    "admin": {"email": "itopscitius@gmail.com", "role": "admin"},
    "spv": {"email": "dian.spv@borncitius.id", "role": "spv"},
    "teknisi1": {"email": "rizky@borncitius.id", "role": "teknisi"},
    "teknisi2": {"email": "agus@borncitius.id", "role": "teknisi"},
}

def login(email: str, password: str):
    try:
        r = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": password}, timeout=TIMEOUT)
        if r.status_code == 200:
            data = r.json()
            return data.get("accessToken"), data.get("refreshToken"), data.get("user")
        else:
            return None, None, None
    except Exception:
        return None, None, None

def auth_header(token: str):
    return {"Authorization": f"Bearer {token}"} if token else {}

def create_template(admin_token, name="Test Template", fields=None):
    if fields is None:
        fields = [
            {"name": "Field One", "type": "string", "isRequired": True, "order": 0},
            {"name": "Field Two", "type": "number", "isRequired": False, "order": 1},
        ]
    payload = {
        "name": name,
        "isActive": True,
        "fields": fields
    }
    r = requests.post(f"{BASE_URL}/templates", json=payload, headers=auth_header(admin_token), timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()

def update_template(admin_token, template_id, body):
    r = requests.put(f"{BASE_URL}/templates/{template_id}", json=body, headers=auth_header(admin_token), timeout=TIMEOUT)
    return r

def get_layouts(admin_token):
    r = requests.get(f"{BASE_URL}/layouts", headers=auth_header(admin_token), timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()

def test_TC007_admin_create_and_update_task_templates():
    # Login users
    admin_access, admin_refresh, admin_user = login(USERS["admin"]["email"], PASSWORD)
    spv_access, spv_refresh, spv_user = login(USERS["spv"]["email"], PASSWORD)
    teknisi_access, _, _ = login(USERS["teknisi1"]["email"], PASSWORD)

    # Verify login success, else adjust tests accordingly
    assert admin_access is not None, "Admin login failed - cannot continue test"
    assert spv_access is not None, "SPV login failed - will test 401 path for non-admin"
    assert teknisi_access is not None, "Teknisi login failed - will test 401 path for non-admin"

    # 1) Test POST /templates with admin credentials and valid payload -> Expect 200
    created_template = None
    try:
        created_template = create_template(admin_access)
        assert "id" in created_template and isinstance(created_template["id"], str)
        template_id = created_template["id"]

        # 2) Test POST /templates with non-admin credentials -> Expect 403
        # Try with SPV
        non_admin_payload = {
            "name": "Non Admin Template",
            "isActive": True,
            "fields": [
                {"name": "F", "type": "string", "order": 0}
            ]
        }
        r_spv = requests.post(
            f"{BASE_URL}/templates",
            json=non_admin_payload,
            headers=auth_header(spv_access),
            timeout=TIMEOUT,
        )
        assert r_spv.status_code == 403, f"Expected 403 for non-admin SPV, got {r_spv.status_code}"

        # Try with Teknisi
        r_teknisi = requests.post(
            f"{BASE_URL}/templates",
            json=non_admin_payload,
            headers=auth_header(teknisi_access),
            timeout=TIMEOUT,
        )
        assert r_teknisi.status_code == 403, f"Expected 403 for non-admin Teknisi, got {r_teknisi.status_code}"

        # 3) Test PUT /templates/:id removing fields referenced by a layout block -> Expect 400
        # To test this, first we must find a layout that references a field in this template.
        # If none exists, create one to reference
        layouts = get_layouts(admin_access)
        layout_for_template = None
        referenced_field_id = None

        # Find a layout that references the created template
        for layout in layouts:
            if layout.get("sourceTemplateId") == template_id and layout.get("blocks"):
                layout_for_template = layout
                break

        if not layout_for_template:
            # Create a layout that references one field of created_template for 400 test
            # Pick first field id
            if created_template.get("fields") and len(created_template["fields"]) > 0:
                referenced_field_id = created_template["fields"][0].get("id") if "id" in created_template["fields"][0] else None
                # If created_template fields have no ids, will skip 400 test
                if referenced_field_id:
                    layout_blocks = [{"name": "Block1", "fieldId": referenced_field_id, "order": 0}]
                    layout_payload = {
                        "name": "Test Layout For Template",
                        "blocks": layout_blocks,
                        "sourceTemplateId": template_id
                    }
                    r_layout_create = requests.post(
                        f"{BASE_URL}/layouts",
                        json=layout_payload,
                        headers=auth_header(admin_access),
                        timeout=TIMEOUT,
                    )
                    if r_layout_create.status_code == 200:
                        layout_for_template = r_layout_create.json()

        if layout_for_template:
            ref_field_ids = {b.get("fieldId") for b in layout_for_template.get("blocks", []) if b.get("fieldId")}
            # Remove one referenced field from template fields and attempt PUT -> 400 expected
            fields_after_removal = [f for f in created_template["fields"] if f.get("id") not in ref_field_ids]
            assert len(fields_after_removal) < len(created_template["fields"]), "No fields removed for 400 validation test"

            # Prepare body with removed referenced field(s)
            put_body = {
                "name": created_template["name"] + " Updated",
                "isActive": created_template.get("isActive", True),
                "fields": fields_after_removal
            }
            r_put_400 = update_template(admin_access, template_id, put_body)
            assert r_put_400.status_code == 400, f"Expected 400 when removing referenced field, got {r_put_400.status_code}"

        # 4) Test PUT /templates/:id with valid updates -> Expect 200
        # Add a new field and update name
        updated_fields = created_template["fields"][:]
        new_field = {
            "name": "Additional Field",
            "type": "string",
            "isRequired": False,
            "order": len(updated_fields)
        }
        updated_fields.append(new_field)
        put_valid_body = {
            "name": created_template["name"] + " Final Update",
            "isActive": False,
            "fields": updated_fields
        }
        r_put_200 = update_template(admin_access, template_id, put_valid_body)
        assert r_put_200.status_code == 200, f"Expected 200 on valid PUT update, got {r_put_200.status_code}"
        updated_template = r_put_200.json()
        assert updated_template["name"] == put_valid_body["name"]
        assert updated_template["isActive"] == put_valid_body["isActive"]
        assert any(f["name"] == "Additional Field" for f in updated_template.get("fields", []))

    finally:
        # Cleanup: delete created template if exists (no delete endpoint in PRD; ignoring)
        pass


test_TC007_admin_create_and_update_task_templates()