# Precoro PO Helpers Userscript v3.0

This Tampermonkey userscript adds a small control bar to Precoro purchase orders to speed up common tasks. You can copy the PO-level Delivery Date to all line items, save each line, confirm the document, auto-accept the “Yes” confirmation modal, open “Send to supplier,” and insert a standard note. You also get quick bulk-fill tools for Request By, PR #, and Approved By.

---

## Installation

1. **Install Tampermonkey**

* Add the Tampermonkey extension in Chrome or Edge.

2. **Create a new script**

* Click the Tampermonkey icon.
* Select **Create a new script**.

3. **Paste the full userscript**

* Delete the default template.
* Paste the entire script.

4. **Save**

* File → Save.

5. **Make sure it is enabled**

* In the Tampermonkey dashboard, confirm the script toggle is on.

This script runs on:

* `https://app.precoro.us/purchase/order/*`

It does not run on:

* `https://app.precoro.us/purchase/order/create/manual`

---

## What you will see

A centered bottom bar with:

* **Copy PO date → lines**
* **Send to supplier + note**
* **Request by:** input + Enter
* **PR #:** input + Enter
* **Approved by:** dropdown + Enter

---

## How to use

### Copy PO Delivery Date to all line Delivery Dates

Use either:

* Click **Copy PO date → lines**
* Press **Alt + Shift + D**

What happens:

1. The script reads the PO-level Delivery Date.
2. It opens each line for editing (clicks the pencil icon).
3. It fills each line’s Delivery Date with the PO date.
4. It saves each edited row.
5. It clicks **Confirm** on the document.
6. If a confirmation modal appears, it clicks **Yes**.

### Send to supplier + note

Use either:

* Click **Send to supplier + note**
* Press **Alt + Shift + S**

What happens:

1. The script clicks the right-side **Send to supplier** action.
2. It waits for the send drawer to open.
3. It fills the note editor with the preset template and preserves spacing.

### Bulk-fill fields (Request By, PR #, Approved By)

Important:

* These tools only fill **empty fields** on rows you have **already opened in edit mode**.
* They do not automatically open rows.

How to use:

1. Open the rows you want to edit.
2. In the bottom bar:

   * Type a value in **Request by** and click **Enter**.
   * Type a value in **PR #** and click **Enter**.
   * Choose a value in **Approved by** and click **Enter**.

Approved By options:

* Brian W NV Ops
* Erin B Office
* Jim B All
* Dan Y TX Ops
* Kevin L KY Ops
* Nick G NV Ops
* Stevie B KY Ops
* Phil Linscheid CNC

---

## What the script does (brief technical summary)

* Reads the PO Delivery Date from:

  * `span[data-test-id="field:required_date"]`
  * Falls back to a label-based search for “Delivery Date”.

* Finds line-level Delivery Date inputs using:

  * `input[data-test-id="input:icf_Delivery Date"]`
  * Broader Delivery-based fallbacks if IDs change.

* Sets values using React-safe event patterns:

  * Native value setter when available.
  * `input`, `change`, Enter key events, and `blur`.

* Saves rows using:

  * `button[data-test-id="button:save"]`
  * Additional fallback selectors if needed.

* Confirms the document by clicking:

  * `button[data-test-id="button:confirm"]`
  * Or a visible button containing “Confirm”.

* Auto-clicks **Yes** when the modal text matches:

  * “Are you sure you want to confirm this document?”

* Opens the “Send to supplier” drawer and fills the note via the TipTap editor.

---

## Limitations

* If Precoro changes `data-test-id` values or table structure, some features may need selector updates.
* The Confirm step uses a visibility-based check to infer when row edits are finished, so behavior may vary slightly by instance.
* Bulk-fill tools are intentionally conservative to avoid unintended edits.
