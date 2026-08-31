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
        
        # -> Fill the email and password fields and click the 'Masuk' button to log in.
        # nama@borncitius.id email field
        elem = page.locator('[id="email"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("itopscitius@gmail.com")
        
        # -> Fill the email and password fields and click the 'Masuk' button to log in.
        # •••••••• password field
        elem = page.locator('[id="password"]')
        await elem.wait_for(state="visible", timeout=10000)
        await elem.fill("BornCitius#2026")
        
        # -> Fill the email and password fields and click the 'Masuk' button to log in.
        # Masuk button
        elem = page.get_by_role('button', name='Masuk', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Folder & Task' link in the sidebar to open the folders page.
        # Folder & Task link
        elem = page.get_by_role('link', name='Folder & Task', exact=True)
        await elem.click(timeout=10000)
        
        # -> Click the 'Rollout SD-WAN Alfamart' folder card to open its task list and verify the folder's tasks are shown.
        # Rollout SD-WAN Alfamart PT Sumber Alfaria Trijaya... link
        elem = page.get_by_role('link', name='Rollout SD-WAN Alfamart PT Sumber Alfaria Trijaya Tbk. Reviewer: Dian Supervisor 3 task', exact=True)
        await elem.click(timeout=10000)
        
        # --> Assertions to verify final state
        
        # --> The folders summary page showed per-folder task counts (e.g. 'Rollout SD-WAN Alfamart' had 3 tasks).
        # Assert-outcome: passed
        # Assert: Visited the /folders page where per-folder task counts are shown.
        await expect(page).to_have_url(re.compile("/folders"), timeout=15000), "Visited the /folders page where per-folder task counts are shown."
        
        # --> Opening the 'Rollout SD-WAN Alfamart' folder displays a task list table with the Task ID column.
        # Assert-outcome: passed
        # Assert: The task table header contains the 'Task ID' column.
        await expect(page.locator("xpath=/html/body/div[2]/main/div/div[2]/div/div/table/thead/tr").nth(0)).to_contain_text("Task ID", timeout=15000), "The task table header contains the 'Task ID' column."
        await asyncio.sleep(5)

    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()

asyncio.run(run_test())
    