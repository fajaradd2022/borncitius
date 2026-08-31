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
        
        # -> Fill the Email and Password fields and click the 'Masuk' button to sign in as the supervisor.
        # nama@borncitius.id email field
        elem = page.locator('[id="email"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("dian.spv@borncitius.id")
        
        # -> Fill the Email and Password fields and click the 'Masuk' button to sign in as the supervisor.
        # •••••••• password field
        elem = page.locator('[id="password"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("BornCitius#2026")
        
        # -> Fill the Email and Password fields and click the 'Masuk' button to sign in as the supervisor.
        # Masuk button
        elem = page.get_by_role('button', name='Masuk', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Folder & Task' link in the left menu to open the task list.
        # Folder & Task link
        elem = page.get_by_role('link', name='Folder & Task', exact=True)
        await elem.click(timeout=10000)
        
        # -> Extract the page content to find the link/href or clickable element for the 'Rollout SD-WAN Alfamart' folder.
        # [internal] extract_content: 
        
        # -> Open the 'Rollout SD-WAN Alfamart' folder (the card labelled 'Rollout SD-WAN Alfamart').
        await page.goto("http://localhost:3002/folders/c52ad6fe-35f9-4c70-b8b1-fc3806a4cddf")
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=5000)
        except Exception:
            pass
        
        # -> Click the 'Lihat' link for the Approved task (task id 3bb327a4) to open its review page.
        # Lihat link
        elem = page.locator('a[href="/tasks/3bb327a4-5e1c-47f6-91ec-67fad0f3b31f"]')
        await elem.click(timeout=10000)
        
        # -> Click the 'Export Word' button to start the Word export and wait for the app to respond.
        # Export Word button
        elem = page.get_by_role('button', name='Export Word', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> A Word export did not become available after clicking Export Word — the app returned an error instead.
        await page.locator("xpath=/html/body/section").nth(0).scroll_into_view_if_needed()
        # Assert-outcome: failed
        # Assert: Expected a Word document to be created and available after clicking Export Word.
        await expect(page.locator("xpath=/html/body/section").nth(0)).to_be_visible(timeout=15000), "Expected a Word document to be created and available after clicking Export Word."
        
        # --> The approved task review page remained visible after the export attempt.
        # Assert-outcome: failed
        # Assert: Expected the browser to remain on the approved task's review page after export.
        await expect(page).to_have_url(re.compile("/tasks/3bb327a4\\-5e1c\\-47f6\\-91ec\\-67fad0f3b31f"), timeout=15000), "Expected the browser to remain on the approved task's review page after export."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    