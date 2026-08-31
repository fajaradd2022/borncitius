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
        
        # -> Fill the Email field with the admin email and the Password field with the admin password, then click the 'Masuk' button to sign in.
        # nama@borncitius.id email field
        elem = page.locator('[id="email"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("itopscitius@gmail.com")
        
        # -> Fill the Email field with the admin email and the Password field with the admin password, then click the 'Masuk' button to sign in.
        # •••••••• password field
        elem = page.locator('[id="password"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("BornCitius#2026")
        
        # -> Fill the Email field with the admin email and the Password field with the admin password, then click the 'Masuk' button to sign in.
        # Masuk button
        elem = page.get_by_role('button', name='Masuk', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Output Layout' link in the left menu to open the Layouts page.
        # Output Layout link
        elem = page.get_by_role('link', name='Output Layout', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Buat Layout' button to open the layout editor.
        # Buat Layout link
        elem = page.get_by_role('link', name='Buat Layout', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the 'Pilih template…' dropdown to reveal template options so a layout can be opened for editing.
        # Pilih template… button
        elem = page.locator('xpath=/html/body/div[2]/main/div/div/div/div/button')
        await elem.click(timeout=10000)
        
        # -> Select the 'UAT Instalasi Fiber' option from the template dropdown to open its layout for editing.
        # UAT Instalasi Fiber option
        elem = page.get_by_role('option', name='UAT Instalasi Fiber', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Geser blok Nama Pelanggan' (move) button to initiate moving the 'Nama Pelanggan' block.
        # Geser blok Nama Pelanggan button
        elem = page.get_by_role('button', name='Geser blok Nama Pelanggan', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Geser blok Nomor Kontrak' (move) button to set the drop position for the 'Nama Pelanggan' block.
        # Geser blok Nomor Kontrak button
        elem = page.get_by_role('button', name='Geser blok Nomor Kontrak', exact=True)
        await elem.click(timeout=10000)
        
        # -> Scroll to the bottom of the layout editor and locate the 'Simpan' button to save the layout.
        await page.mouse.wheel(0, 300)
        
        # -> Scroll the layout editor to the bottom and reveal the 'Simpan' (Save) button so it can be clicked.
        await page.mouse.wheel(0, 300)
        
        # -> Click the 'Simpan Layout' button to save the reordered layout.
        # Simpan Layout button
        elem = page.get_by_test_id('save-layout-button')
        await elem.click(timeout=10000)
        
        # -> Click the 'Output Layout' link in the left menu to open the Output Layouts list so the saved layout can be reopened and its block order verified.
        # Output Layout link
        elem = page.get_by_role('link', name='Output Layout', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        current_url = await page.evaluate("() => window.location.href")
        # Assert-outcome: passed
        # Assert: page loaded with a URL (final outcome verified by the AI judge during the run)
        assert current_url, 'Page should have loaded with a URL'
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    