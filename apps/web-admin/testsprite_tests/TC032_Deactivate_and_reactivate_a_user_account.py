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
        
        # -> Fill the 'Email' field with the admin email, fill the 'Password' field with the admin password, then click the 'Masuk' button.
        # nama@borncitius.id email field
        elem = page.locator('[id="email"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("itopscitius@gmail.com")
        
        # -> Fill the 'Email' field with the admin email, fill the 'Password' field with the admin password, then click the 'Masuk' button.
        # •••••••• password field
        elem = page.locator('[id="password"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("BornCitius#2026")
        
        # -> Fill the 'Email' field with the admin email, fill the 'Password' field with the admin password, then click the 'Masuk' button.
        # Masuk button
        elem = page.get_by_role('button', name='Masuk', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'User Management' link in the left menu to open the Users page.
        # User Management link
        elem = page.get_by_role('link', name='User Management', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the actions menu for user 'Rizky Pratama' (rizky@borncitius.id) by clicking that row's three-dots actions button.
        # button
        elem = page.locator('xpath=/html/body/div[2]/main/div/div/div/div/table/tbody/tr[5]/td[5]/button')
        await elem.click(timeout=10000)
        
        # -> Click the 'Nonaktifkan' menu item in the user's actions menu to deactivate the account.
        # Nonaktifkan menu item
        elem = page.get_by_role('menuitem', name='Nonaktifkan', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the 'Aksi' (three-dots) menu for the Rizky Pratama row to reveal the reactivate option.
        # button
        elem = page.locator('xpath=/html/body/div[2]/main/div/div/div/div/table/tbody/tr[5]/td[5]/button')
        await elem.click(timeout=10000)
        
        # -> Click the 'Aktifkan' menu item to reactivate the user Rizky Pratama (label shown: 'Aktifkan').
        # Aktifkan menu item
        elem = page.get_by_role('menuitem', name='Aktifkan', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> Rizky Pratama's user row in the Users list shows the account as 'Aktif'.
        # Assert-outcome: passed
        # Assert: The Rizky Pratama row's Status cell displays 'Aktif'.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div/div/div/table/tbody/tr[5]/td[4]").nth(0)).to_have_text("Aktif", timeout=15000), "The Rizky Pratama row's Status cell displays 'Aktif'."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    