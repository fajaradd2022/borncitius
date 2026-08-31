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
        await page.goto("http://localhost:3003/")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Fill 'Email' with rizky@borncitius.id, fill 'Password' with BornCitius#2026, then click the 'Masuk' button to sign in.
        # nama@borncitius.id email field
        elem = page.get_by_label('Email', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("rizky@borncitius.id")
        
        # -> Fill 'Email' with rizky@borncitius.id, fill 'Password' with BornCitius#2026, then click the 'Masuk' button to sign in.
        # •••••••• password field
        elem = page.get_by_label('Password', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("BornCitius#2026")
        
        # -> Fill 'Email' with rizky@borncitius.id, fill 'Password' with BornCitius#2026, then click the 'Masuk' button to sign in.
        # Masuk button
        elem = page.get_by_role('button', name='Masuk', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the assigned task 'R881-CAMMING-BONE' from the task list by clicking the task card.
        # R881-CAMMING-BONE Baru UAT Instalasi SD-WAN... link
        elem = page.get_by_role('link', name='R881-CAMMING-BONE Baru UAT Instalasi SD-WAN Retail Rollout SD-WAN Alfamart · 06 Sep', exact=True)
        await elem.click(timeout=10000)
        
        # -> Scroll down the task form to reveal the remaining fields (look for number and date inputs and other core fields).
        await page.mouse.wheel(0, 300)
        
        # -> Fill 'Nama Store' with a unique value, fill 'Kode Store', enter a short note into 'Catatan Teknisi', then click the 'Submit Tugas' button to save the form.
        # text field
        elem = page.get_by_label('Nama Store *', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("AutoStore-2026-08-30-01")
        
        # -> Fill 'Nama Store' with a unique value, fill 'Kode Store', enter a short note into 'Catatan Teknisi', then click the 'Submit Tugas' button to save the form.
        # text field
        elem = page.get_by_label('Kode Store *', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("AUTO-0001")
        
        # -> Fill 'Nama Store' with a unique value, fill 'Kode Store', enter a short note into 'Catatan Teknisi', then click the 'Submit Tugas' button to save the form.
        # text area
        elem = page.get_by_label('Catatan TeknisiQA test note 2026-08-30', exact=True)
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("QA test note 2026-08-30")
        
        # -> Fill 'Nama Store' with a unique value, fill 'Kode Store', enter a short note into 'Catatan Teknisi', then click the 'Submit Tugas' button to save the form.
        # Submit Tugas button
        elem = page.get_by_role('button', name='Submit Tugas', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Nama Store retains the entered value AutoStore-2026-08-30-01.
        # Assert-outcome: failed
        # Assert: Expected 'Nama Store' to retain the entered value 'AutoStore-2026-08-30-01'.
        await expect(page.locator("xpath=/html/body/main/div[1]/section[1]/div[1]/label/input").nth(0)).to_have_value("AutoStore-2026-08-30-01", timeout=15000), "Expected 'Nama Store' to retain the entered value 'AutoStore-2026-08-30-01'."
        
        # --> Kode Store retains the entered value AUTO-0001.
        # Assert-outcome: failed
        # Assert: Expected 'Kode Store' to retain the entered value 'AUTO-0001'.
        await expect(page.locator("xpath=/html/body/main/div[1]/section[1]/div[2]/label/input").nth(0)).to_have_value("AUTO-0001", timeout=15000), "Expected 'Kode Store' to retain the entered value 'AUTO-0001'."
        
        # --> Catatan Teknisi retains the entered note QA test note 2026-08-30.
        # Assert-outcome: failed
        # Assert: Expected 'Catatan Teknisi' to retain the entered note 'QA test note 2026-08-30'.
        await expect(page.locator("xpath=/html/body/main/div[1]/section[3]/div[3]/label/textarea").nth(0)).to_have_value("QA test note 2026-08-30", timeout=15000), "Expected 'Catatan Teknisi' to retain the entered note 'QA test note 2026-08-30'."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    