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
        
        # -> Fill the Email field with the admin email, fill the Password field with the admin password, then click the 'Masuk' button to submit the login form.
        # nama@borncitius.id email field
        elem = page.locator('[id="email"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("itopscitius@gmail.com")
        
        # -> Fill the Email field with the admin email, fill the Password field with the admin password, then click the 'Masuk' button to submit the login form.
        # •••••••• password field
        elem = page.locator('[id="password"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("BornCitius#2026")
        
        # -> Fill the Email field with the admin email, fill the Password field with the admin password, then click the 'Masuk' button to submit the login form.
        # Masuk button
        elem = page.get_by_role('button', name='Masuk', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the new layout builder by clicking the 'Output Layout' menu item in the left navigation.
        # Output Layout link
        elem = page.get_by_role('link', name='Output Layout', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Output Layout' menu item in the left navigation to open the layout builder or output layouts list.
        # Output Layout link
        elem = page.get_by_role('link', name='Output Layout', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Buat Layout' button to open the new layout creation form.
        # Buat Layout link
        elem = page.get_by_role('link', name='Buat Layout', exact=True)
        await elem.click(timeout=10000)
        
        # -> Open the 'Pilih template…' template source combobox so available templates can be selected.
        # Pilih template… button
        elem = page.locator('xpath=/html/body/div[2]/main/div/div/div/div/button')
        await elem.click(timeout=10000)
        
        # -> Select the 'Template Test 2026-08-30 143205' option from the 'Pilih template…' combobox so the layout fields become available.
        # Template Test 2026-08-30 143205 option
        elem = page.get_by_role('option', name='Template Test 2026-08-30 143205', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Teks' button in the 'Sisipkan' toolbar to add a text block to the canvas, then wait for the UI to update.
        # Teks button
        elem = page.get_by_role('button', name='Teks', exact=True)
        await elem.click(timeout=10000)
        
        # -> Scroll the Output Layout Builder page to reveal hidden controls, then list all visible 'button' elements so the 'Simpan' (Save) button can be identified.
        await page.mouse.wheel(0, 300)
        
        # -> Click the 'Simpan Layout' button in the top-right to save the created layout.
        # Simpan Layout button
        elem = page.get_by_test_id('save-layout-button')
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> New layout "Layout Baru — Template Test 2026-08-30 143205" is shown after saving.
        # Assert-outcome: passed
        # Assert: A saved-layout notification containing the new layout name is visible.
        await expect(page.locator("xpath=/html/body/section/ol/li").nth(0)).to_contain_text("Layout \"Layout Baru \u2014 Template Test 2026-08-30 143205\" tersi", timeout=15000), "A saved-layout notification containing the new layout name is visible."
        
        # --> The layout contains the added text block with content "Teks baru".
        # Assert-outcome: passed
        # Assert: The inserted text block displays the text 'Teks baru'.
        await expect(page.locator("xpath=/html/body/div[2]/main/div[2]/div[1]/div[2]/div[2]/div/div/div[4]/p").nth(0)).to_have_text("Teks baru", timeout=15000), "The inserted text block displays the text 'Teks baru'."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    