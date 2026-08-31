import asyncio
import re
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None

    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()

        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",
                "--disable-dev-shm-usage",
                "--ipc=host",
                "--single-process"
            ],
        )

        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        # Wider default timeout to match the agent's DOM-stability budget;
        # auto-waiting Playwright APIs (expect, locator.wait_for) inherit this.
        context.set_default_timeout(15000)

        # Open a new page in the browser context
        page = await context.new_page()

        # Interact with the page elements to simulate user flow
        # -> navigate
        await page.goto("http://localhost:3002/")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Fill the Email field with 'itopscitius@gmail.com', fill the Password field with the admin password, then click the 'Masuk' button to log in.
        # nama@borncitius.id email field
        elem = page.locator('[id="email"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("itopscitius@gmail.com")
        
        # -> Fill the Email field with 'itopscitius@gmail.com', fill the Password field with the admin password, then click the 'Masuk' button to log in.
        # •••••••• password field
        elem = page.locator('[id="password"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("BornCitius#2026")
        
        # -> Fill the Email field with 'itopscitius@gmail.com', fill the Password field with the admin password, then click the 'Masuk' button to log in.
        # Masuk button
        elem = page.get_by_role('button', name='Masuk', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Form Template' link in the sidebar to open the template builder/list.
        # Form Template link
        elem = page.get_by_role('link', name='Form Template', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Buat Template' button to open the new template builder.
        # Buat Template link
        elem = page.get_by_role('link', name='Buat Template', exact=True)
        await elem.click(timeout=10000)
        
        # -> Fill the 'Nama Template' field with a unique name, toggle the 'Aktif' switch, then click the '+ Tambah Field' button.
        # text field
        elem = page.locator('[id="tmpl-name"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("Template Test 2026-08-30 143205")
        
        # -> Fill the 'Nama Template' field with a unique name, toggle the 'Aktif' switch, then click the '+ Tambah Field' button.
        # button
        elem = page.locator('[id="active"]')
        await elem.click(timeout=10000)
        
        # -> Fill the 'Nama Template' field with a unique name, toggle the 'Aktif' switch, then click the '+ Tambah Field' button.
        # Tambah Field button
        elem = page.get_by_role('button', name='Tambah Field', exact=True)
        await elem.click(timeout=10000)
        
        # -> Activate the template by clicking the 'Nonaktif' switch, enable 'Wajib diisi' for the field, then click the 'Simpan Template' button to save the template.
        # button
        elem = page.locator('[id="active"]')
        await elem.click(timeout=10000)
        
        # -> Activate the template by clicking the 'Nonaktif' switch, enable 'Wajib diisi' for the field, then click the 'Simpan Template' button to save the template.
        # button
        elem = page.locator('[id="required"]')
        await elem.click(timeout=10000)
        
        # -> Activate the template by clicking the 'Nonaktif' switch, enable 'Wajib diisi' for the field, then click the 'Simpan Template' button to save the template.
        # Simpan Template button
        elem = page.get_by_role('button', name='Simpan Template', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> A save notification confirms the template "Template Test 2026-08-30 143205" was saved.
        # Assert-outcome: passed
        # Assert: Save notification contains the template name and saved message.
        await expect(page.locator("xpath=/html/body/section/ol/li").nth(0)).to_contain_text("Template \"Template Test 2026-08-30 143205\" disimpan.", timeout=15000), "Save notification contains the template name and saved message."
        
        # --> The template builder shows the added field 'Field Baru' and it is configured as required.
        # Assert-outcome: passed
        # Assert: The field labeled 'Field Baru' is visible in the builder.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div[1]/div[2]/div/div/div[1]").nth(0)).to_contain_text("Field Baru", timeout=15000), "The field labeled 'Field Baru' is visible in the builder."
        # Assert-outcome: passed
        # Assert: The 'Wajib diisi' (required) switch for the field is set to on.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div[2]/div/div/div[4]/button").nth(0)).to_have_attribute("value", "on", timeout=15000), "The 'Wajib diisi' (required) switch for the field is set to on."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    