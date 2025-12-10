// ==UserScript==
// @name         Precoro: Copy PO Delivery Date → Item Delivery Dates (unlock + fill + save)
// @namespace    joe.precoro.tools
// @version      3.0
// @description  Row-level edit unlock, copy PO-level Delivery Date into each line's Delivery Date, then SAVE each line
// @match        https://app.precoro.us/purchase/order/*
// @exclude      https://app.precoro.us/purchase/order/create/manual
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------- READ PO-LEVEL DELIVERY DATE ----------
  function getPoDeliveryDate_() {
    const span = qs('span[data-test-id="field:required_date"]');
    if (span && span.textContent.trim()) return span.textContent.trim();

    const label = qsa('div, span, td, th').find(el => /delivery date/i.test(el.textContent || ''));
    if (label) {
      const val = label.closest('div, td, th, tr')?.querySelector('span, input');
      if (val?.textContent) return val.textContent.trim();
      if (val?.value) return val.value.trim();
    }
    return '';
  }

  // ---------- CLICK EACH ROW'S EDIT (PENCIL) ----------
  async function unlockRowsForEditing_() {
    const tableRoot =
      qs('.document-items-table-wrapper') ||
      qs('.document-items-table') ||
      qs('table.document-items-table') ||
      document;

    let editBtns = qsa(
      'tbody tr button[data-test-id="action-button:edit"], tbody tr .action-button--edit',
      tableRoot
    ).filter(b => b.offsetParent !== null);

    if (editBtns.length === 0) return 0;

    let opened = 0;
    for (const btn of editBtns) {
      const tr = btn.closest('tr');
      if (tr && tr.querySelector('input, select, [contenteditable="true"]')) continue; // already in edit
      btn.click();
      opened++;
      if (tr) tr.scrollIntoView({ block: 'center' });
      await sleep(120);
    }
    await sleep(300);
    return opened;
  }

  // ---------- COLLECT ONLY THE DELIVERY DATE INPUTS ----------
  function collectDeliveryInputs_() {
    // Primary (exact data-test-id from your DOM)
    let inputs = qsa('input[data-test-id="input:icf_Delivery Date"]');

    // Fallbacks
    if (inputs.length === 0) {
      inputs = qsa('input[data-test-id^="input:icf_"][data-test-id*="Delivery"]')
        .filter(inp => !/request/i.test(inp.getAttribute('data-test-id') || ''));
    }
    if (inputs.length === 0) {
      const headers = qsa('thead th, .ant-table-thead th, table thead th');
      let colIdx = -1;
      headers.forEach((th, i) => {
        const t = (th.innerText || th.textContent || '').trim().toLowerCase();
        if ((/delivery/.test(t) && !/request/.test(t)) && colIdx === -1) colIdx = i;
      });
      if (colIdx >= 0) {
        const bodies = qsa('tbody, .ant-table-tbody, table tbody');
        const found = [];
        bodies.forEach(tb => {
          qsa('tr', tb).forEach(tr => {
            const tds = qsa('td', tr);
            const cell = tds[colIdx];
            if (!cell) return;
            const inp = cell.querySelector('input, select, [contenteditable="true"]');
            if (inp) found.push(inp);
          });
        });
        inputs = found;
      }
    }
    return inputs;
  }
    // React-safe value setter for <input>, <select>, and contenteditable
function setVal_(el, value) {
  if (!el) return;

  const fire = (type, opts={}) => el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true, ...opts }));

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    // native setter so React sees it
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;

    // common commit signals for Ant/React date inputs
    fire('input');
    fire('change');

    // simulate typing confirmation for masked pickers
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));

    // blur to force validation
    fire('blur');
    return;
  }

  if (el instanceof HTMLSelectElement) {
    el.value = value;
    fire('change');
    return;
  }

  if (el.isContentEditable) {
    el.textContent = value;
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    fire('blur');
  }
}


async function fillDeliveryDates_(poDate) {
  // Try a few selectors in case Precoro changed test ids
  let inputs = collectDeliveryInputs_();
  if (inputs.length === 0) {
    inputs = qsa('input[placeholder*="Delivery" i], input[name*="delivery" i]');
  }
  if (inputs.length === 0) {
    alert('No editable Delivery Date inputs found. Make sure lines are in edit mode.');
    return 0;
  }

  let count = 0;
  for (const inp of inputs) {
    // if field is readonly, try to enable by clicking once (some date pickers)
    if (inp.hasAttribute('readonly')) {
      inp.click();
      await sleep(40);
    }

    // normalize spacing and set
    const v = (poDate || '').trim();
    inp.scrollIntoView({ block: 'center' });
    setVal_(inp, v);
    count++;
    await sleep(35);
  }
  return count;
}

async function saveAllEditedRows_() {
  const visible = el => el && el.offsetParent !== null;

  // collect the inputs we just filled, so we save those rows
  const inputs = collectDeliveryInputs_();
  if (inputs.length === 0) return 0;

  let saved = 0;

  for (const inp of inputs) {
    const tr = inp.closest('tr') || inp.closest('[data-row-key]') || document.body;

    // action cell usually hosts the approve/save + cancel buttons
    const actionCell =
      tr.querySelector('.action-button-list') ||
      tr.querySelector('td .action-button-list') ||
      tr;

    // NEW primary selector for Precoro inline save
    let saveBtn =
      actionCell.querySelector('button[data-test-id="button:save"]');

    // keep our old fallbacks in case of variant rows
    if (!saveBtn) {
      saveBtn =
        actionCell.querySelector('button[data-test-id*="action-button:create"]') ||
        actionCell.querySelector('.action-button--create') ||
        actionCell.querySelector('button[title*="Save" i], button[aria-label*="Save" i]') ||
        actionCell.querySelector('button[data-test-id*="update"]') ||
        actionCell.querySelector('button[aria-label*="Apply" i], button[title*="Apply" i]');
    }
    // global fallbacks if the action cell pattern shifts
    if (!saveBtn) {
      saveBtn = Array.from(document.querySelectorAll('button')).find(b =>
        visible(b) && (
          b.matches('button[data-test-id="button:save"]') ||
          /save|apply|confirm/i.test(b.textContent || '') ||
          b.querySelector('svg[aria-label*="check" i]')
        )
      );
    }

    if (!saveBtn) {
      console.warn('[Copy PO Date] No save button for row; input:', inp);
      continue;
    }

    saveBtn.scrollIntoView({ block: 'center' });
    // robust click sequence for icon-only buttons
    saveBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    saveBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    saveBtn.click();
    saved++;

    // wait for row to exit edit mode or for button to disable (Ant spinner)
    let tries = 0;
    while (tries++ < 30) {
      const stillEditing =
        tr.isConnected &&
        tr.querySelector('input, select, [contenteditable="true"]');
      const disabled = saveBtn.getAttribute('disabled') !== null ||
                       saveBtn.ariaDisabled === 'true' ||
                       saveBtn.classList.contains('ant-btn-loading');

      if (!stillEditing || disabled || !inp.isConnected) break;
      await new Promise(r => setTimeout(r, 120));
    }

    // settle a tick before next row
    await new Promise(r => setTimeout(r, 140));
  }

  return saved;
}
  // ---------- MAIN ----------
  async function runCopyFlow_() {
    const poDate = getPoDeliveryDate_();
    if (!poDate) {
      alert('Could not read the PO-level Delivery Date.');
      return;
    }

    await unlockRowsForEditing_();

    // optional: jump near top so virtualized rows are in DOM
    window.scrollTo({ top: 0 });

    const filled = await fillDeliveryDates_(poDate);
    const saved = await saveAllEditedRows_();

    console.log(`[Copy PO Date] "${poDate}" → filled ${filled} Delivery Date field(s); saved ${saved} row(s).`);
  }

  // ---------- UI BUTTON ----------
  function ensureButton() {
    if (document.getElementById('jh-copy-po-date')) return;
    injectStyles_();
    const btn = document.createElement('button');
    btn.id = 'jh-copy-po-date';
    btn.className = 'scs-btn';
    btn.textContent = 'Copy PO date → lines';
    btn.title = 'Alt + Shift + D';
    btn.addEventListener('click', runCopyFlow_);
    Object.assign(btn.style, {
      position: 'fixed',
      left: '50%',
      bottom: '18px',
      transform: 'translateX(-50%)',
      zIndex: 2147483647
    });
    document.body.appendChild(btn);
    window.addEventListener('keydown', (e) => {
      if (e.altKey && e.shiftKey && e.code === 'KeyD') {
        e.preventDefault();
        runCopyFlow_();
      }
    }, { passive: false });
  }

  // ---------- STYLES ----------
  function injectStyles_() {
    const s = document.createElement('style');
    s.textContent = `
      .scs-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 22px;
  border-radius: 9999px;
  border: none;
  background-color: #1B2559; /* Precoro dark navy */
  color: #ffffff;
  font: 700 13px/1.2 system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  transition: all 0.15s ease;
}

.scs-btn:hover {
  background-color: #0f1740; /* slightly darker hover */
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.35);
}

.scs-btn:active {
  background-color: #091030;
  transform: translateY(1px);
}

    `;
    document.head.appendChild(s);
  }

  // ---------- INIT ----------
  ensureButton();
})();
// ===== POST-RUN CONFIRM CLICKER (append-only) =====
(() => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Robust finder for the "Confirm" button shown in your screenshot
  function findConfirmBtn() {
    // 1) data-test-id straight shot
    let btn = document.querySelector('button[data-test-id="button:confirm"]');
    if (btn) return btn;

    // 2) any button whose inner span says "Confirm"
    const candidates = Array.from(document.querySelectorAll('button'));
    return candidates.find(b => /confirm/i.test(b.textContent || '')) || null;
  }

  // Heuristic: when there are no visible Delivery Date inputs and no visible green Save buttons,
  // assume the row saves are done and we can confirm.
  function rowsStillEditing() {
    const visible = el => el && el.offsetParent !== null;

    const deliveryInputs = Array.from(document.querySelectorAll(
      'input[data-test-id="input:icf_Delivery Date"], ' +
      'input[data-test-id^="input:icf_"][data-test-id*="Delivery"]'
    )).filter(visible);

    const saveBtns = Array.from(document.querySelectorAll(
      'button[data-test-id*="action-button:create"], .action-button--create,' +
      'button[title*="Save" i], button[aria-label*="Save" i]'
    )).filter(visible);

    return deliveryInputs.length > 0 || saveBtns.length > 0;
  }

  async function waitForEditsToFinish(timeoutMs = 20000) {
    const start = Date.now();
    // give the flow a head start
    await sleep(400);

    while (Date.now() - start < timeoutMs) {
      if (!rowsStillEditing()) return true;
      await sleep(250);
    }
    return false; // timed out, fail soft
  }

  async function waitAndConfirm() {
    const done = await waitForEditsToFinish();
    const btn = findConfirmBtn();
    if (!btn) return; // nothing to click

    // small guard waits so any final DOM updates settle
    await sleep(200);
    btn.scrollIntoView({ block: 'center' });
    btn.click();
    // optional: log for sanity
    console.log('[Copy PO Date] Post-run: clicked Confirm', { done });
  }

  // Hook 1: when the floating button is clicked, start the watcher
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t) return;
    const btn = t.id === 'jh-copy-po-date' ? t : t.closest && t.closest('#jh-copy-po-date');
    if (btn) {
      // start a detached watcher, do not block original handler
      setTimeout(waitAndConfirm, 50);
    }
  }, true);

  // Hook 2: if you trigger via Alt+Shift+D, also start the watcher
  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && e.code === 'KeyD') {
      setTimeout(waitAndConfirm, 100);
    }
  }, true);
})();
// ===== MODAL "YES" AUTO-CLICKER (append-only) =====
(() => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Find the specific confirmation dialog from your screenshot
  function findConfirmDialog() {
    const dialogs = Array.from(document.querySelectorAll(
      '.pc-alert-dialog, [role="dialog"], .pc-modal, .ant-modal'
    ));
    return dialogs.find(d =>
      /are you sure you want to confirm this document\?/i.test(d.textContent || '')
    ) || null;
  }

  function findYesBtnInDialog(dialog) {
    if (!dialog) return null;
    // Prefer an explicit "Yes" text match inside the dialog
    const byText = Array.from(dialog.querySelectorAll('button'))
      .find(b => /^(yes)$/i.test((b.textContent || '').trim()));
    if (byText) return byText;

    // Fallback: Precoro often uses this test id on the modal's confirm
    const byTestId = dialog.querySelector('button[data-test-id="button:confirm"]');
    if (byTestId) return byTestId;

    return null;
  }

  async function clickYesIfDialogAppears(timeoutMs = 12000) {
    const start = Date.now();

    // Poll for the dialog to show up
    while (Date.now() - start < timeoutMs) {
      const dlg = findConfirmDialog();
      if (dlg) {
        const yesBtn = findYesBtnInDialog(dlg);
        if (yesBtn && yesBtn.offsetParent !== null) {
          yesBtn.scrollIntoView({ block: 'center' });
          // extra-robust sequence
          yesBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          yesBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          yesBtn.click();
          console.log('[Copy PO Date] Modal: clicked "Yes".');
          return true;
        }
      }
      await sleep(150);
    }
    console.warn('[Copy PO Date] Modal: did not find "Yes" within timeout.');
    return false;
  }

  // 1) After any click on a "Confirm" button, watch for the modal and hit "Yes"
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button');
    if (!b) return;
    const label = (b.textContent || '').trim();
    const isConfirmish = /confirm/i.test(label) || b.matches('button[data-test-id="button:confirm"]');
    if (isConfirmish) {
      // Give the modal a moment to mount, then auto-confirm.
      setTimeout(() => { clickYesIfDialogAppears(); }, 250);
    }
  }, true);

  // 2) Safety net: observe DOM changes; if the exact dialog appears, click "Yes"
  const mo = new MutationObserver(() => {
    const dlg = findConfirmDialog();
    if (!dlg) return;
    const btn = findYesBtnInDialog(dlg);
    if (btn) {
      btn.scrollIntoView({ block: 'center' });
      btn.click();
      console.log('[Copy PO Date] Modal(observer): clicked "Yes".');
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  // 3) Also tie into your Alt+Shift+D flow
  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && e.code === 'KeyD') {
      setTimeout(() => { clickYesIfDialogAppears(); }, 600);
    }
  }, true);
})();
// ===== SECOND BUTTON: "Send to supplier + note" (append-only) =====
(() => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // one-shot guard so the filler won't retrigger
  let noteFilledOnce = false;

  // --- UI: add a second button, to the right of the existing one ---
      function ensureSecondaryBtn() {
    if (document.getElementById('jh-send-to-supplier')) return;
    const btn = document.createElement('button');
    btn.id = 'jh-send-to-supplier';
    btn.className = 'scs-btn';
    btn.textContent = 'Send to supplier + note';
    btn.title = 'Alt + Shift + S';
    Object.assign(btn.style, {
      position: 'fixed',
      left: 'calc(50% + 200px)',
      bottom: '18px',
      transform: 'translateX(-50%)',
      zIndex: 2147483647,
      marginLeft: '12px',
      border: '2px solid #ff3b30', // 🔴 clean red border
      boxShadow: '0 2px 6px rgba(255, 0, 0, 0.3)', // subtle red glow
      transition: 'all 0.2s ease',
    });
    btn.addEventListener('mouseover', () => {
      btn.style.backgroundColor = '#0f1740';
      btn.style.boxShadow = '0 4px 10px rgba(255, 0, 0, 0.45)';
    });
    btn.addEventListener('mouseout', () => {
      btn.style.backgroundColor = '#1B2559';
      btn.style.boxShadow = '0 2px 6px rgba(255, 0, 0, 0.3)';
    });
    document.body.appendChild(btn);

    btn.addEventListener('click', runSendFlow, false);

    window.addEventListener('keydown', (e) => {
      if (e.altKey && e.shiftKey && e.code === 'KeyS') {
        e.preventDefault();
        runSendFlow();
      }
    }, { passive: false });
  }

  // --- Find and click the “Send to supplier” action button (right rail) ---
  function findSendActionBtn() {
    return (
      document.querySelector('button[data-test-id="button:purchase_order.change_status_send"]') ||
      document.querySelector('button[data-test-id*="change_status_send"]') ||
      Array.from(document.querySelectorAll('button'))
        .find(b => /send to supplier/i.test(b.textContent || '')) ||
      null
    );
  }

  async function openSendDrawer() {
    const btn = findSendActionBtn();
    if (!btn) {
      console.warn('[SendFlow] Send-to-supplier action button not found.');
      return false;
    }
    btn.scrollIntoView({ block: 'center' });
    btn.click();
    // wait for drawer
    const start = Date.now();
    while (Date.now() - start < 10000) {
      const drawer = document.querySelector('.preview-dialog, [class*="send-po-to-supplier-dialog"]');
      if (drawer) return true;
      await sleep(120);
    }
    console.warn('[SendFlow] Drawer did not appear.');
    return false;
  }

  // --- TipTap/ProseMirror helpers (paragraph-preserving filler) ---
  const LINES = [
    'Hello -',
    '',
    'Please see the attached PO. An order confirmation is required with the correct pricing and delivery dock date.',
    '',
    'Please send order confirmation to PURCHASING@sendcutsend.com.',
    '',
    'Do not reply to Precoro.com.',
    '',
    'Thank you!',
    '',
    'Purchasing Department',
    '',
    'SendCutSend.com'];

  function getEditable() {
    const anyP = document.querySelector('div.tiptap-editor p');
    return anyP ? anyP.closest('[contenteditable="true"]') : null;
  }

  function clearOnce(root) {
    const sel = window.getSelection();
    const rng = document.createRange();
    rng.selectNodeContents(root);
    sel.removeAllRanges();
    sel.addRange(rng);
    document.execCommand('delete');
  }

  async function fillNoteExact() {
    if (noteFilledOnce) return;
    const root = getEditable();
    if (!root) {
      console.warn('[SendFlow] TipTap editor not found.');
      return;
    }
    noteFilledOnce = true;

    root.focus();
    clearOnce(root);

    for (let i = 0; i < LINES.length; i++) {
      const line = LINES[i];
      if (line) document.execCommand('insertText', false, line);
      document.execCommand('insertParagraph'); // new paragraph each line (blank lines become empty <p>)
      await sleep(2);
    }

    root.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
    root.blur();
    console.log('[SendFlow] Note filled with preserved spacing.');
  }

  // --- Orchestrator for the secondary button ---
  async function runSendFlow() {
    try {
      noteFilledOnce = false; // reset per run
      const opened = await openSendDrawer();
      if (!opened) return;

      // wait a moment for editor to mount, then fill
      const start = Date.now();
      while (Date.now() - start < 8000) {
        const ed = getEditable();
        if (ed) break;
        await sleep(120);
      }
      await fillNoteExact();
    } catch (e) {
      console.error('[SendFlow] Error:', e);
    }
  }

  // Init
  ensureSecondaryBtn();
})();
// ===== REQUEST BY BULK FILL (self-contained, append-only) =====
(() => {
  'use strict';

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const visible = (el) => !!(el && el.offsetParent !== null);

  // React-safe value setter
  function setVal_(el, value) {
    if (!el) return;

    const fire = (type) => el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const proto = Object.getPrototypeOf(el);
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, value);
      else el.value = value;

      fire('input');
      fire('change');

      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));

      fire('blur');
      return;
    }

    if (el instanceof HTMLSelectElement) {
      el.value = value;
      fire('change');
      return;
    }

    if (el.isContentEditable) {
      el.textContent = value;
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
      fire('blur');
    }
  }

  // Click each row edit pencil so Request By inputs exist
  async function unlockRowsForEditing_() {
    const tableRoot =
      qs('.document-items-table-wrapper') ||
      qs('.document-items-table') ||
      qs('table.document-items-table') ||
      document;

    let editBtns = qsa(
      'tbody tr button[data-test-id="action-button:edit"], tbody tr .action-button--edit',
      tableRoot
    ).filter(visible);

    if (editBtns.length === 0) return 0;

    let opened = 0;
    for (const btn of editBtns) {
      const tr = btn.closest('tr');
      if (tr && tr.querySelector('input, select, [contenteditable="true"]')) continue;
      btn.click();
      opened++;
      if (tr) tr.scrollIntoView({ block: 'center' });
      await sleep(120);
    }
    await sleep(250);
    return opened;
  }

  function collectRequestByInputs_() {
    // Primary exact selector from your inspect
    let inputs = qsa('input[data-test-id="input:icf_Request By:"]');

    // Strong structural fallback
    if (inputs.length === 0) {
      inputs = qsa('td[data-test-id="field:icf_Request By:"] input');
    }

    // Loose fallbacks
    if (inputs.length === 0) {
      inputs = qsa('input[data-test-id^="input:icf_"][data-test-id*="Request By"]');
    }
    if (inputs.length === 0) {
      inputs = qsa('input[placeholder*="Request" i], input[name*="request" i], input[aria-label*="Request" i]');
    }

    return inputs.filter(visible);
  }

async function fillRequestByEmpty_(value) {
  const v = (value || '').trim();
  if (!v) return 0;

  // Only touch fields that already exist (rows already in edit mode)
  const inputs = collectRequestByInputs_();
  if (inputs.length === 0) {
    alert('No editable Request By inputs currently open. Open the rows you want first.');
    return 0;
  }

  let count = 0;
  for (const inp of inputs) {
    const current = (inp.value || '').trim();
    if (current) continue;

    inp.scrollIntoView({ block: 'center' });
    setVal_(inp, v);
    count++;
    await sleep(25);
  }

  console.log(`[Request By] Filled ${count} empty OPEN field(s) with "${v}".`);
  return count;
}


  function ensureRequestByBubble_() {
    if (document.getElementById('jh-request-by-wrap')) return;

    const wrap = document.createElement('div');
    wrap.id = 'jh-request-by-wrap';

    const label = document.createElement('span');
    label.textContent = 'Request by:';

    const input = document.createElement('input');
    input.id = 'jh-request-by-input';
    input.type = 'text';
    input.placeholder = 'Please Enter';

    const btn = document.createElement('button');
    btn.id = 'jh-request-by-apply';
    btn.textContent = 'Enter';

    // Bubble styling
    Object.assign(wrap.style, {
      position: 'fixed',
      left: 'calc(50% + 430px)',
      bottom: '18px',
      transform: 'translateX(-50%)',
      zIndex: 2147483647,
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 10px',
      background: '#ffffff',
      border: '1px solid rgba(0,0,0,0.12)',
      borderRadius: '12px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
    });

    Object.assign(label.style, {
      font: '600 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
      color: '#1B2559',
      whiteSpace: 'nowrap'
    });

    Object.assign(input.style, {
      height: '28px',
      width: '140px',
      border: '1px solid rgba(0,0,0,0.15)',
      borderRadius: '8px',
      padding: '0 8px',
      fontSize: '12px',
      outline: 'none'
    });

    // Button styling to match your theme even if .scs-btn isn't in scope
    Object.assign(btn.style, {
      height: '28px',
      padding: '6px 14px',
      borderRadius: '9999px',
      border: 'none',
      backgroundColor: '#1B2559',
      color: '#ffffff',
      font: '700 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
      cursor: 'pointer',
      boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
    });

    const apply = async () => {
      const val = input.value;
      console.log('[Request By] Apply triggered:', val);
      await fillRequestByEmpty_(val);
    };

    btn.addEventListener('click', apply);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        apply();
      }
    });

    wrap.appendChild(label);
    wrap.appendChild(input);
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
  }

  // Keep it alive across Precoro re-renders
  const init = () => ensureRequestByBubble_();
  init();

  const mo = new MutationObserver(() => ensureRequestByBubble_());
  mo.observe(document.body, { childList: true, subtree: true });
})();
// ===== PR # BULK FILL (self-contained, append-only) =====
(() => {
  'use strict';

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const visible = (el) => !!(el && el.offsetParent !== null);

  // React-safe value setter
  function setVal_(el, value) {
    if (!el) return;

    const fire = (type) => el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const proto = Object.getPrototypeOf(el);
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, value);
      else el.value = value;

      fire('input');
      fire('change');

      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));

      fire('blur');
      return;
    }

    if (el instanceof HTMLSelectElement) {
      el.value = value;
      fire('change');
      return;
    }

    if (el.isContentEditable) {
      el.textContent = value;
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
      fire('blur');
    }
  }

  function collectPrInputs_() {
    // Primary guess based on your Request By pattern
    let inputs = qsa('input[data-test-id="input:icf_PR #"]');

    // Strong structural fallback
    if (inputs.length === 0) {
      inputs = qsa('td[data-test-id="field:icf_PR #"] input');
    }

    // Looser fallbacks
    if (inputs.length === 0) {
      inputs = qsa('input[data-test-id^="input:icf_"][data-test-id*="PR"]');
    }
    if (inputs.length === 0) {
      inputs = qsa('input[placeholder*="PR" i], input[name*="pr" i], input[aria-label*="PR" i]');
    }

    return inputs.filter(visible);
  }

  async function fillPrEmpty_(value) {
    const v = (value || '').trim();
    if (!v) return 0;

    // Only touch rows already in edit mode
    const inputs = collectPrInputs_();
    if (inputs.length === 0) {
      alert('No editable PR # inputs currently open. Open the rows you want first.');
      return 0;
    }

    let count = 0;
    for (const inp of inputs) {
      const current = (inp.value || '').trim();
      if (current) continue;

      inp.scrollIntoView({ block: 'center' });
      setVal_(inp, v);
      count++;
      await sleep(25);
    }

    console.log(`[PR #] Filled ${count} empty OPEN field(s) with "${v}".`);
    return count;
  }

  function ensurePrBubble_() {
    if (document.getElementById('jh-pr-wrap')) return;

    const wrap = document.createElement('div');
    wrap.id = 'jh-pr-wrap';

    const label = document.createElement('span');
    label.textContent = 'PR #:'; // label text

    const input = document.createElement('input');
    input.id = 'jh-pr-input';
    input.type = 'text';
    input.placeholder = 'Please Enter';

    const btn = document.createElement('button');
    btn.id = 'jh-pr-apply';
    btn.textContent = 'Enter';

    // Keep simple inline styles. The bar patch will theme it.
    Object.assign(wrap.style, {
      position: 'fixed',
      left: 'calc(50% + 430px)',
      bottom: '18px',
      transform: 'translateX(-50%)',
      zIndex: 2147483647,
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 10px',
      background: '#ffffff',
      border: '1px solid rgba(0,0,0,0.12)',
      borderRadius: '12px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
    });

    Object.assign(label.style, {
      font: '600 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
      color: '#1B2559',
      whiteSpace: 'nowrap'
    });

    Object.assign(input.style, {
      height: '28px',
      width: '140px',
      border: '1px solid rgba(0,0,0,0.15)',
      borderRadius: '8px',
      padding: '0 8px',
      fontSize: '12px',
      outline: 'none'
    });

    Object.assign(btn.style, {
      height: '28px',
      padding: '6px 14px',
      borderRadius: '9999px',
      border: 'none',
      backgroundColor: '#1B2559',
      color: '#ffffff',
      font: '700 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
      cursor: 'pointer',
      boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
    });

    const apply = async () => {
      const val = input.value;
      console.log('[PR #] Apply triggered:', val);
      await fillPrEmpty_(val);
    };

    btn.addEventListener('click', apply);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        apply();
      }
    });

    wrap.appendChild(label);
    wrap.appendChild(input);
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
  }

  const init = () => ensurePrBubble_();
  init();

  const mo = new MutationObserver(() => ensurePrBubble_());
  mo.observe(document.body, { childList: true, subtree: true });
})();
// ===== APPROVED BY BULK FILL (self-contained, append-only) =====
(() => {
  'use strict';

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const visible = (el) => !!(el && el.offsetParent !== null);

  // React-safe-ish value setter for inputs
  function setVal_(el, value) {
    if (!el) return;

    const fire = (type) => el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const proto = Object.getPrototypeOf(el);
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, value);
      else el.value = value;

      fire('input');
      fire('change');

      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));

      fire('blur');
      return;
    }

    if (el.isContentEditable) {
      el.textContent = value;
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
      fire('blur');
    }
  }

  // Try to click a visible dropdown option matching text
 // Try to click a visible dropdown option matching text
function clickOptionByText_(value) {
  const v = (value || '').trim().toLowerCase();
  if (!v) return false;

  const candidates = [
    ...qsa('.pc-select__option'),
    ...qsa('[role="option"]'),
    ...qsa('.ant-select-item-option'),
  ];

  const hit = candidates.find(el => {
    if (!visible(el)) return false;
    const t = (el.textContent || '').trim().toLowerCase();
    return t === v;
  });

  if (hit) {
    hit.scrollIntoView({ block: 'nearest' });
    hit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    hit.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    hit.click();
    return true;
  }
  return false;
}
    function commitPcSelect_(inp) {
  if (!inp) return;

  // Many pc-select controls commit the highlighted option with ArrowDown + Enter
  inp.focus();

  inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
  inp.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));

  inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
  inp.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));

  // Nudge change without blurring immediately
  inp.dispatchEvent(new Event('change', { bubbles: true }));
}
    function commitCombo_(combo) {
  if (!combo) return;

  // Ant/Precoro-style selects usually commit on Enter + change + blur
  combo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
  combo.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
  combo.dispatchEvent(new Event('change', { bubbles: true }));
  combo.dispatchEvent(new Event('blur', { bubbles: true }));
}

  function collectApprovedInputs_() {
    // Primary exact selector from your DOM screenshot
    let inputs = qsa('input[data-test-id="input:icf_Approved By:"]');

    // Structural fallback
    if (inputs.length === 0) {
      inputs = qsa('td[data-test-id="field:icf_Approved By:"] input');
    }

    // Looser fallbacks
    if (inputs.length === 0) {
      inputs = qsa('input[data-test-id^="input:icf_"][data-test-id*="Approved By"]');
    }
    if (inputs.length === 0) {
      inputs = qsa('input[placeholder*="Approved" i], input[name*="approved" i], input[aria-label*="Approved" i]');
    }

    return inputs.filter(visible);
  }

  // For each open row input, open dropdown and choose value
// For each open row input, open dropdown and choose value
// For each open row input, open dropdown and choose value
async function setApprovedOnInput_(inp, value) {
  const v = (value || '').trim();
  if (!v) return false;

  inp.scrollIntoView({ block: 'center' });
  inp.click();
  await sleep(40);

  // Type to filter
  setVal_(inp, v);
  await sleep(100);

  // Best case, click the exact option
  if (clickOptionByText_(v)) {
    await sleep(50);
    commitPcSelect_(inp);
    await sleep(30);
    return true;
  }

  // Fallback, rely on keyboard commit
  commitPcSelect_(inp);
  await sleep(30);

  return true;
}


  async function fillApprovedEmpty_(value) {
    const v = (value || '').trim();
    if (!v) return 0;

    // Only touch rows already in edit mode
    const inputs = collectApprovedInputs_();
    if (inputs.length === 0) {
      alert('No editable Approved By fields currently open. Open the rows you want first.');
      return 0;
    }

    let count = 0;
    for (const inp of inputs) {
      const current = (inp.value || '').trim();
      if (current) continue;

      const ok = await setApprovedOnInput_(inp, v);
      if (ok) count++;
      await sleep(25);
    }

    console.log(`[Approved By] Filled ${count} empty OPEN field(s) with "${v}".`);
    return count;
  }

  // Options from your screenshots
  const APPROVED_OPTIONS = [
    'Brian W NV Ops',
    'Erin B Office',
    'Jim B All',
    'Dan Y TX Ops',
    'Kevin L KY Ops',
    'Nick G NV Ops',
    'Stevie B KY Ops',
    'Phil Linscheid CNC'
  ];

  function ensureApprovedBubble_() {
    if (document.getElementById('jh-approved-wrap')) return;

    const wrap = document.createElement('div');
    wrap.id = 'jh-approved-wrap';

    const label = document.createElement('span');
    label.textContent = 'Approved by:';

    // Dropdown for the bottom bar
    const select = document.createElement('select');
    select.id = 'jh-approved-select';

    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'Select';
    select.appendChild(blank);

    for (const opt of APPROVED_OPTIONS) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      select.appendChild(o);
    }

    const btn = document.createElement('button');
    btn.id = 'jh-approved-apply';
    btn.textContent = 'Enter';

    // Simple inline styles. Your alignment/theme patch will override.
    Object.assign(wrap.style, {
      position: 'fixed',
      left: 'calc(50% + 430px)',
      bottom: '18px',
      transform: 'translateX(-50%)',
      zIndex: 2147483647,
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 10px',
      background: '#ffffff',
      border: '1px solid rgba(0,0,0,0.12)',
      borderRadius: '12px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
    });

    Object.assign(label.style, {
      font: '600 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
      color: '#1B2559',
      whiteSpace: 'nowrap'
    });

    Object.assign(select.style, {
      height: '28px',
      width: '160px',
      border: '1px solid rgba(0,0,0,0.15)',
      borderRadius: '8px',
      padding: '0 6px',
      fontSize: '12px',
      outline: 'none',
      background: '#fff'
    });

    Object.assign(btn.style, {
      height: '28px',
      padding: '6px 14px',
      borderRadius: '9999px',
      border: 'none',
      backgroundColor: '#1B2559',
      color: '#ffffff',
      font: '700 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
      cursor: 'pointer',
      boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
    });

    const apply = async () => {
      const val = select.value;
      console.log('[Approved By] Apply triggered:', val);
      await fillApprovedEmpty_(val);
    };

    btn.addEventListener('click', apply);

    select.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        apply();
      }
    });

    wrap.appendChild(label);
    wrap.appendChild(select);
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
  }

  const init = () => ensureApprovedBubble_();
  init();

  const mo = new MutationObserver(() => ensureApprovedBubble_());
  mo.observe(document.body, { childList: true, subtree: true });
})();

// ===== UI ALIGNMENT PATCH: center + clean spacing (append-only) =====
(() => {
  'use strict';

  function injectLayoutStyles() {
    if (document.getElementById('jh-bottom-bar-styles')) return;

    const s = document.createElement('style');
    s.id = 'jh-bottom-bar-styles';
    s.textContent = `
  #jh-bottom-bar {
    position: fixed;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 0;
  }

  /* Group pills styled like scs-btn */
  #jh-request-by-wrap,
  #jh-pr-wrap,
  #jh-approved-wrap {
    position: static !important;
    left: auto !important;
    bottom: auto !important;
    transform: none !important;

    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;

    height: 32px !important;
    padding: 0 10px !important;

    border-radius: 9999px !important;
    border: none !important;
    background-color: #1B2559 !important;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25) !important;
  }

  #jh-request-by-wrap span,
  #jh-pr-wrap span,
  #jh-approved-wrap span {
    font: 700 13px/1.2 system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial !important;
    color: #ffffff !important;
    white-space: nowrap !important;
    display: inline-flex !important;
    align-items: center !important;
  }

  /* Inputs */
  #jh-request-by-input,
  #jh-pr-input,
  #jh-approved-select {
    height: 24px !important;

    background: #ffffff !important;
    color: #111 !important;

    border: 1px solid rgba(0,0,0,0.10) !important;
    border-radius: 8px !important;

    padding: 0 8px !important;
    margin: 0 !important;

    display: inline-flex !important;
    align-items: center !important;

    font: 600 12px/1.2 system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial !important;
    outline: none !important;
    box-sizing: border-box !important;
  }

  /* Keep text inputs tighter */
  #jh-request-by-input,
  #jh-pr-input {
    width: 130px !important;
  }

  /* Give Approved a little more room for names */
  #jh-approved-select {
    width: 160px !important;
  }

  /* Mini Enter buttons */
  #jh-request-by-apply,
  #jh-pr-apply,
  #jh-approved-apply {
    height: 24px !important;
    padding: 4px 12px !important;
    font-size: 12px !important;
  }
`;

    document.head.appendChild(s);
  }

  function ensureBar() {
    let bar = document.getElementById('jh-bottom-bar');
    if (bar) return bar;

    bar = document.createElement('div');
    bar.id = 'jh-bottom-bar';
    document.body.appendChild(bar);
    return bar;
  }

  function normalizeElement(el) {
    if (!el) return;

    el.style.position = 'static';
    el.style.left = 'auto';
    el.style.bottom = 'auto';
    el.style.transform = 'none';
    el.style.margin = '0';
  }

  function mountIntoBar() {
    const bar = ensureBar();

    const copyBtn = document.getElementById('jh-copy-po-date');
const sendBtn = document.getElementById('jh-send-to-supplier');
const reqWrap = document.getElementById('jh-request-by-wrap');
const prWrap = document.getElementById('jh-pr-wrap');
const approvedWrap = document.getElementById('jh-approved-wrap');

        if (copyBtn) {
      normalizeElement(copyBtn);
      if (copyBtn.parentElement !== bar) bar.appendChild(copyBtn);
    }

    if (sendBtn) {
      normalizeElement(sendBtn);
      if (sendBtn.parentElement !== bar) bar.appendChild(sendBtn);
    }

    if (reqWrap) {
      normalizeElement(reqWrap);
      if (reqWrap.parentElement !== bar) bar.appendChild(reqWrap);
    }

    if (prWrap) {
      normalizeElement(prWrap);
      if (prWrap.parentElement !== bar) bar.appendChild(prWrap);
    }

    if (approvedWrap) {
  normalizeElement(approvedWrap);
  if (approvedWrap.parentElement !== bar) bar.appendChild(approvedWrap);
}
  }
  injectLayoutStyles();
  mountIntoBar();

  const mo = new MutationObserver(() => mountIntoBar());
  mo.observe(document.body, { childList: true, subtree: true });
})();

