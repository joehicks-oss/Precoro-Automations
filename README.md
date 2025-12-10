# Precoro PO Helpers Userscript v3.0

A Tampermonkey userscript that bundles several PO line-item helpers for Precoro. It automates copying the PO-level Delivery Date to line items, saving rows, confirming the document, and provides quick-fill tools for Request By, PR #, and Approved By. It also adds a “Send to supplier + note” helper that opens the send drawer and inserts a standard message.

## What this script does

### 1. Copy PO Delivery Date to all line Delivery Dates

When triggered, the script:

1. Reads the PO-level Delivery Date.

* Primary selector: `span[data-test-id="field:required_date"]`
* Fallback: searches for a nearby label containing “Delivery Date”.

2. Unlocks each line for editing by clicking each visible row edit (pencil) button.

* Selector targets:

  * `tbody tr button[data-test-id="action-button:edit"]`
  * `tbody tr .action-button--edit`

3. Locates line-level Delivery Date inputs.

* Primary selector:

  * `input[data-test-id="input:icf_Delivery Date"]`
* Fallback patterns:

  * `input[data-test-id^="input:icf_"][data-test-id*="Delivery"]` while excluding Request-related matches
  * Column-header based discovery if test IDs change

4. Sets each Delivery Date value with React-safe input events.

* Uses the native `value` setter when available.
* Fires `input`, `change`, simulated Enter key events, then `blur`.

5. Saves each edited row.

* Primary inline save selector:

  * `button[data-test-id="button:save"]`
* Fallbacks include common Precoro inline save variants.

### 2. Post-run Confirm clicker

After the copy-and-save flow triggers, the script attempts to click the document-level **Confirm** button.

* Primary selector: `button[data-test-id="button:confirm"]`
* Fallback: any visible button containing text that matches `confirm`.

Heuristic used to decide when row editing appears finished:

* If there are no visible Delivery Date inputs AND no visible inline save buttons, the script assumes row saves are complete and proceeds to Confirm.

### 3. Modal “Yes” auto-clicker

If Precoro shows the confirmation modal:

* The script looks for the dialog text:

  * “Are you sure you want to confirm this document?”
* Then clicks the **Yes** button.
* It also watches DOM mutations as a safety net.

### 4. Send to supplier + note

Adds a second quick-action button that:

1. Clicks the right-rail action button:

* Primary selector:

  * `button[data-test-id="button:purchase_order.change_status_send"]`
* Fallback:

  * any button containing “Send to supplier”.

2. Waits for the send drawer/dialog.

3. Fills the note editor (TipTap/ProseMirror) with this exact multi-paragraph template:

* Hello -
*
* Please see the attached PO. An order confirmation is required with the correct pricing and delivery dock date.
*
* Please send order confirmation to [PURCHASING@sendcutsend.com](mailto:PURCHASING@sendcutsend.com).
*
* Do not reply to Precoro.com.
*
* Thank you!
*
* Purchasing Department
*
* SendCutSend.com

The filler clears the editor once per run, then inserts one paragraph per line to preserve spacing.

### 5. Bulk-fill helpers for open rows

These tools only fill fields that are:

* currently visible
* already in edit mode
* empty

They do not open rows automatically.

#### Request By

* Targets:

  * `input[data-test-id="input:icf_Request By:"]`
  * Fallback: `td[data-test-id="field:icf_Request By:"] input`
* Fills empty open inputs with the value you enter in the bottom-bar control.

#### PR

* Targets:

  * `input[data-test-id="input:icf_PR #"]`
  * Fallback: `td[data-test-id="field:icf_PR #"] input`
* Fills empty open inputs with the value you enter.

#### Approved By

* Targets:

  * `input[data-test-id="input:icf_Approved By:"]`
  * Fallback: `td[data-test-id="field:icf_Approved By:"] input`
* Attempts to select the matching dropdown option by text, then commits via keyboard.

Approved By dropdown options in the bottom bar:

* Brian W NV Ops
* Erin B Office
* Jim B All
* Dan Y TX Ops
* Kevin L KY Ops
* Nick G NV Ops
* Stevie B KY Ops
* Phil Linscheid CNC

### 6. Unified bottom bar UI

A layout patch:

* Creates a centered bottom bar container (`#jh-bottom-bar`).
* Moves the main buttons and all three bulk-fill controls into a single row.
* Restyles the Request By, PR #, and Approved By controls to visually match the primary pill button theme.

## UI Elements and hotkeys

### Buttons added

* **Copy PO date → lines**
* **Send to supplier + note**
* **Request by:** input + Enter
* **PR #:** input + Enter
* **Approved by:** dropdown + Enter

### Keyboard shortcuts

* **Alt + Shift + D**
  Runs Copy PO Delivery Date → line Delivery Dates → save rows → attempt Confirm → attempt modal Yes

* **Alt + Shift + S**
  Opens Send to supplier drawer and fills the note template

The Request By, PR #, and Approved By controls currently trigger via their Enter buttons or by pressing Enter while focused inside the control.

## Installation

1. Install Tampermonkey.
2. Create a new userscript.
3. Paste the full script.
4. Ensure it is enabled.

Matches:

* `https://app.precoro.us/purchase/order/*`

Excludes:

* `https://app.precoro.us/purchase/order/create/manual`

Run timing:

* `document-idle`

## Expected workflow

### Copy Delivery Dates fast path

1. Open a PO with line items present.
2. Click **Copy PO date → lines**
   or use **Alt + Shift + D**.
3. The script will:

   * open row edit mode
   * fill each Delivery Date
   * save each row
   * click Confirm
   * click Yes if the modal appears

### Bulk-fill fields

1. Manually open the rows you want to edit if they are not already editable.
2. Use the bottom-bar controls for:

   * Request By
   * PR #
   * Approved By
3. Click **Enter** for each control to fill only empty fields.

### Send to supplier note

1. Click **Send to supplier + note**
   or use **Alt + Shift + S**.
2. The script will open the send drawer and insert the template.

## Limitations and notes

* Line-item detection relies on current Precoro `data-test-id` patterns and structural fallbacks. If Precoro changes DOM structure significantly, selectors may need updates.
* The confirm step uses a heuristic based on visibility of Delivery Date inputs and inline save buttons. If your instance uses different controls, the confirm click may trigger early or not at all.
* Bulk-fill tools do not force rows into edit mode by design. This avoids unintended edits beyond what is already open.
* The script only adds labels, inputs, and clicks within the active PO page. It does not alter Inbox state, create POs, or handle approvals outside the described flows.

## Changelog

### 3.0

* Consolidated multiple PO helper features into one script.
* React-safe Delivery Date value setting.
* Row-level save improvements with `button:save` primary selector.
* Post-run Confirm auto-clicker.
* Modal “Yes” auto-clicker.
* Added Send to supplier + note with TipTap multi-paragraph insertion.
* Added bottom-bar UI with Request By, PR #, and Approved By bulk-fill tools.
* Unified layout and styling via bottom-bar alignment patch.
