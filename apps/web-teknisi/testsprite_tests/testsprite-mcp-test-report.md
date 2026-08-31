# TestSprite AI Testing Report(MCP)

---

## 1️⃣ Document Metadata
- **Project Name:** web-teknisi
- **Date:** 2026-08-30
- **Prepared by:** TestSprite AI Team + manual verification (Claude)
- **Target:** apps/web-teknisi (Next.js 16 PWA, offline-first field-technician form), http://localhost:3003, dev server
- **Note:** 26 test cases were generated; TestSprite's dev-mode cap limited execution to the 15 highest-priority cases.

---

## 2️⃣ Requirement Validation Summary

### Requirement: Login / Task List

#### Test TC001 — Sign in and reach the task list
- **Status:** ✅ Passed

#### Test TC010 — Browse assigned tasks and open one
- **Status:** ✅ Passed

### Requirement: GPS Capture

#### Test TC012 — Capture a location when GPS is available
- **Status:** ✅ Passed

### Requirement: Offline Queue & Sync Indicator

#### Test TC015 — Use the sync indicator to drain pending changes
- **Status:** ✅ Passed

#### Test TC006 — See offline queue status while editing a task
- **Status:** ⛔ Blocked (TestSprite sandbox limitation, not an app issue)
- **Analysis / Findings:** TestSprite's browser-automation environment has no DevTools network-offline toggle exposed to the test agent, and the app itself has no in-page "simulate offline" control (correctly — that would be a fake feature). The edit itself was made successfully; only the offline-specific assertion couldn't be exercised. Not a defect.

#### Test TC009 — Drain queued task edits after reconnecting
- **Status:** ⛔ Blocked (same sandbox limitation as TC006)

#### Test TC013 — Show pending sync count on the task list
- **Status:** ⛔ Blocked (same sandbox limitation as TC006)

### Requirement: Field Autosave

#### Test TC004 — Autosave text and date fields in a task
- **Status:** ❌ Failed (test-fixture mismatch, not an app bug)
- **Analysis / Findings:** The test correctly filled and confirmed the text field ("Catatan Teknisi") autosaves, but found no date/number input on the task it was testing against. Verified directly: the task used ("R881-CAMMING-BONE", template "UAT Instalasi SD-WAN Retail") has fields `section, text, text, gps, signed_document, photo×4, textarea` — genuinely no `number`/`date` fields in this particular template. Verified in source (`task-form.tsx:230`) that the renderer *does* correctly map `fieldType === "number"` → `<input type="number">` and `"date"` → `<input type="date">` — the code path exists and looks correct, it just wasn't exercised because no seeded task uses those field types. Not a bug; recommend seeding a task with a template that includes number/date fields for future test coverage of this path specifically.

#### Test TC005 — Complete task fields and save progress
- **Status:** ❌ Failed (same test-fixture mismatch as TC004)

### Requirement: Photo Capture & Watermark

#### Test TC007 — Capture photo evidence with watermark metadata
- **Status:** ⛔ Blocked (TestSprite sandbox had no image file available to upload)

#### Test TC008 — Capture a camera photo with watermark
- **Status:** ⛔ Blocked (same file-fixture limitation as TC007)

### Requirement: Document Upload

#### Test TC011 — Add a supporting document to a task
- **Status:** ⛔ Blocked (TestSprite sandbox had no PDF/image file available to upload)

#### Test TC014 — Upload a scanned document to a task
- **Status:** ⛔ Blocked (same file-fixture limitation as TC011)

### Requirement: Task Submission

#### Test TC002 — Submit a completed task successfully
- **Status:** ⛔ Blocked (blocked upstream by the missing-file limitation — the task's required photo/document fields couldn't be filled, so submission correctly stayed blocked by client-side validation)

#### Test TC003 — Submit a completed task and remove it from active work
- **Status:** ⛔ Blocked (same upstream cause as TC002)

---

## 3️⃣ Coverage & Matching Metrics

- **4 of 15** executed test cases passed outright; **2 failed** (both a test-fixture mismatch, not app defects); **9 were blocked** by TestSprite's own sandbox limitations (no file fixtures for photo/document upload, no network-offline emulation control) rather than by application behavior.
- **Zero confirmed application bugs** in this pass. However, this also means the app's core differentiating feature — the offline-first queue, watermarked photo capture, and document upload — was **not actually exercised** by this automated run, since every test case touching those paths was blocked by sandbox limitations rather than passing or failing on the app's own merits.

| Requirement | Total Tests | ✅ Passed | ❌ Failed | ⛔ Blocked | Real bugs found |
|---|---|---|---|---|---|
| Login / Task List | 2 | 2 | 0 | 0 | 0 |
| GPS Capture | 1 | 1 | 0 | 0 | 0 |
| Offline Queue & Sync | 3 | 1 | 0 | 2 | 0 |
| Field Autosave | 2 | 0 | 2 | 0 | 0 (fixture mismatch) |
| Photo Capture & Watermark | 2 | 0 | 0 | 2 | 0 (sandbox limitation) |
| Document Upload | 2 | 0 | 0 | 2 | 0 (sandbox limitation) |
| Task Submission | 2 | 0 | 0 | 2 | 0 (blocked upstream) |
| **Total** | **15** | **4** | **2** | **9** | **0** |

---

## 4️⃣ Follow-up: Manual Playwright Verification (post-report)

Since TestSprite's sandbox couldn't supply upload fixtures or toggle real network-offline state, a targeted Playwright script (`chromium`, real file fixtures, `context.setOffline()`, mocked geolocation) was run directly against `localhost:3003` to cover exactly the paths TestSprite couldn't reach. Network responses were captured to confirm each action actually round-tripped to the API, not just that the UI looked right.

| # | Test | Result |
|---|---|---|
| 1 | Login as teknisi | ✅ Pass |
| 2 | Open task form | ✅ Pass |
| 3 | GPS capture fills field (mocked coordinates) | ✅ Pass |
| 4 | Document upload — queue → auto-drain → API | ✅ Pass (`201`) |
| 5 | Camera photo capture with watermark — queue → sync → API | ✅ Pass (`201`), see below |
| 6 | Gallery photo upload, no watermark — queue → sync → API | ✅ Pass (`201`) |
| 7 | Offline indicator shows while network is down | ✅ Pass |
| 8 | Auto-drain on reconnect (`online` event → `PATCH` → synced) | ✅ Pass (`200`) |

**8/8 passed.** The watermarked photo was downloaded back from the API and visually inspected — timestamp, mocked GPS coordinates, and technician name are all correctly burned into the image pixels, confirming `burnWatermark()` works end-to-end exactly as designed.

**One real bug was found and fixed in the process** (in `apps/api`, not this app): `GET /api/tasks/attachments/:id/file` was 404ing for every attachment, even ones that existed on disk with correct permissions — Express's `send` library was treating the dot-prefixed `.storage` segment of `STORAGE_ROOT` as a forbidden dotfile. This broke viewing/downloading any photo, document, or generated PDF in *both* `web-admin` and `web-teknisi`. Neither TestSprite pass caught it (web-admin had nothing pre-existing to click; web-teknisi never got far enough to upload anything). Fixed in `apps/api/src/tasks/tasks.controller.ts` and `apps/api/src/documents/documents.module.ts` — see `apps/api/testsprite_tests/testsprite-mcp-test-report.md` for full details. Verified fixed: the same attachment now downloads correctly (`200`, correct size, watermark visible).

One initial run also surfaced that a hand-crafted (non-decodable) JPEG test fixture correctly triggered the app's own client-side error handling ("Gagal memproses foto. The source image could not be decoded.") rather than silently queuing corrupt data — confirming the app validates image decodability before enqueueing, not a defect.

---

## 5️⃣ Follow-up 2: Date/Number Field Coverage + a Real Race-Condition Bug Found

The only in-progress task reachable through the technician's active task list used a template with no `date`/`number` fields, which is why TC004/TC005 (TestSprite's automated run) couldn't exercise those input types — not an app defect. To close the gap: added `Tanggal Instalasi` (date) and `Jumlah Perangkat Terpasang` (number) fields to the "UAT Instalasi SD-WAN Retail" template (`apps/api/prisma/seed.ts`, applied live via `PUT /api/templates/:id`) and created a fresh task from it so both field types are now genuinely reachable in the seeded data.

While verifying both fields autosave correctly, a **real, reproducible race-condition bug** was found in the offline sync queue:

- **Bug:** `drainQueue()` (`apps/web-teknisi/src/lib/offline-queue.ts`) used a single-flight guard (`if (draining) return`) that silently dropped a concurrent call with no retry. If a technician edited two different fields close together (very plausible in normal use — e.g. typing across a form), the second field's debounced auto-save could get skipped entirely and sit unsent for up to 20 seconds (the periodic fallback interval), confirmed by isolating each field individually (both work alone) vs. together (one gets dropped, reproduced twice).
- **More serious implication:** `handleSubmit()` in `task-form.tsx` only checked `drainQueue()`'s `failed` count before submitting — but a guard-skipped call returns `{sent:0, failed:0}`, which looks identical to "nothing pending." A technician editing a field and hitting "Submit Tugas" shortly after could have submission proceed while that edit was still queued, unsent. For a *required* field the server correctly rejects the submit (a known, deliberately-added guard — see `assertCanFill` in `workflow.service.ts`), but for a **non-required field, this could silently and permanently lose the technician's data**: once the task is submitted, further field-value PATCHes are rejected by the server (403), so the stuck queue item would retry forever and never actually apply.
- **Fixed:** `drainQueue()` now tracks a "rerun requested" flag and immediately re-runs itself once the in-flight drain finishes, instead of relying on the next external trigger. `handleSubmit()` now verifies the task's queue is actually empty (via `itemsForTask()`, retrying the drain up to 5 times with a short backoff) rather than trusting a single call's `failed` count.
- **Verified:** reproduced the original race twice (isolating single-field edits worked; editing two fields together dropped one, confirmed via both the persisted server value being `null` and by capturing network requests). After the fix, both fields' `PATCH` requests fire and succeed within a 3-second window — re-tested with fresh values (`2026-11-20` / `9`) and confirmed both persisted server-side immediately, no more waiting for the 20-second interval.

---

## 6️⃣ Key Gaps / Risks

1. ~~Coverage gap~~ **Resolved by the manual Playwright follow-up above:** the offline queue, photo watermarking, document upload, and offline→online auto-sync were all independently verified working correctly end-to-end.
2. **Bug #1 found and fixed** (see section 4): attachment/document file downloads were completely broken (`404`) due to an Express `send`-library dotfile-handling quirk triggered by this environment's `STORAGE_ROOT` path. Now fixed and verified in both the API and via re-download here.
3. **Bug #2 found and fixed** (see section 5): `drainQueue()`'s single-flight guard could silently drop a concurrent field-save with no retry, and `handleSubmit()` trusted a single `drainQueue()` call's result without verifying the queue was actually empty — together this could let a technician submit a task while a just-edited non-required field was still unsent, permanently losing that edit (the queued retry would 403 forever once the task left the editable state). Both fixed: `drainQueue()` now re-runs itself if a call was skipped, and `handleSubmit()` verifies the task's queue is genuinely empty (with bounded retries) before proceeding.
4. ~~No date/number field currently exercised in seed data~~ **Resolved:** added `Tanggal Instalasi` (date) and `Jumlah Perangkat Terpasang` (number) fields to the SD-WAN Retail template and created a task from it — both field types verified rendering and autosaving correctly (and this is precisely what surfaced Bug #2 above).
5. Consistent with the backend and web-admin findings: authentication, role handling, and the read-heavy paths (task list, task detail, GPS) all work correctly, and the write-heavy/offline-first paths — this app's actual core risk area — are now confirmed working, with two real bugs found and fixed along the way.
