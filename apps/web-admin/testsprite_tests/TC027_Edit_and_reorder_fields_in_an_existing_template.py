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
        
        # -> Fill the Email field with itopscitius@gmail.com, fill the Password field with BornCitius#2026, then click the 'Masuk' button to sign in.
        # nama@borncitius.id email field
        elem = page.locator('[id="email"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("itopscitius@gmail.com")
        
        # -> Fill the Email field with itopscitius@gmail.com, fill the Password field with BornCitius#2026, then click the 'Masuk' button to sign in.
        # •••••••• password field
        elem = page.locator('[id="password"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("BornCitius#2026")
        
        # -> Fill the Email field with itopscitius@gmail.com, fill the Password field with BornCitius#2026, then click the 'Masuk' button to sign in.
        # Masuk button
        elem = page.get_by_role('button', name='Masuk', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Form Template' link in the left menu to open the template list.
        # Form Template link
        elem = page.get_by_role('link', name='Form Template', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the 'Manual Test Tpl' template card to edit its fields.
        # Open the 'Manual Test Tpl' template card to edit its fields.
        elem = page.locator('xpath=/html/body/div[2]/main/div/a/div/div/div[2]/p')
        await elem.click(timeout=10000)
        
        # -> Click the 'Tambah Field' button to add a new field to the template.
        # Tambah Field button
        elem = page.get_by_role('button', name='Tambah Field', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the up-arrow on the newly added field to move it up in the field list.
        # button
        elem = page.locator('xpath=/html/body/div[2]/main/div/div/div[2]/div/div[2]/div[2]/button')
        await elem.click(timeout=10000)
        
        # -> Click the up-arrow on the newly added field to move it up in the field list.
        # Simpan Template button
        elem = page.get_by_role('button', name='Simpan Template', exact=True)
        await elem.click(timeout=10000)
        
        # -> Reload the 'Template Test 2026-08-30 143205' template edit page and verify the field order shows the moved field first.
        await page.goto("http://localhost:3002/templates/8298d4bc-e6b3-49f8-937f-14aa63dd3e47")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Click the 'Form Template' link in the left menu to return to the template list so the template can be reopened to verify the saved field order.
        # Form Template link
        elem = page.get_by_role('link', name='Form Template', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Manual Test Tpl' template card to open it for editing so the field order can be verified.
        # Click the 'Manual Test Tpl' template card to open it for editing so the field order can be verified.
        elem = page.locator('xpath=/html/body/div[2]/main/div/a[2]/div/div/div[2]/p')
        await elem.click(timeout=10000)
        
        # -> Click the 'Simpan Template' button to save the template changes.
        # Simpan Template button
        elem = page.get_by_role('button', name='Simpan Template', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Simpan Template' button to save the template changes.
        # Form Template link
        elem = page.get_by_role('link', name='Form Template', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the 'Manual Test Tpl' template card to verify the saved field order in the Form Builder.
        # Open the 'Manual Test Tpl' template card to verify the saved field order in the Form Builder.
        elem = page.locator('xpath=/html/body/div[2]/main/div/a[2]/div/div/div[2]/p')
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> The newly added field 'Field Baru' is shown first in the Form Builder, confirming the reordered field and that the change persisted after saving.
        # Assert-outcome: passed
        # Assert: Verifies the first field's visible label is 'Field Baru'.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div[1]/div[2]/div/div[1]/div[1]/span[1]").nth(0)).to_have_text("Field Baru", timeout=15000), "Verifies the first field's visible label is 'Field Baru'."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    