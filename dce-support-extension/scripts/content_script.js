let isRecording = false;
let stopAutomationRequested = false;
let isPausedStateFlag = false; 
let recordedSteps = [];
let targetRecordingKey = "savedMacroSteps";
let ticketStartTime = null; 
let continuousHeartbeatTimer = null;
let telvivaProcessingTimer = null;

// --- MESSAGE LISTENER & DISPATCHER ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "START" || message.action === "START_RECORDING_INJECTION") { 
    isRecording = true; 
    stopAutomationRequested = false; 
    recordedSteps = []; 
    if (message.targetKey) targetRecordingKey = message.targetKey;
    showRecordingStatusBanner(true); 
  }
  if (message.action === "STOP") { 
    isRecording = false; 
    stopAutomationRequested = true; 
    showRecordingStatusBanner(false); 
    hideStatusOverlayModal();
    if (continuousHeartbeatTimer) clearInterval(continuousHeartbeatTimer);
    if (telvivaProcessingTimer) clearTimeout(telvivaProcessingTimer);
    chrome.storage.local.set({ automationRunningState: false, unlockLoopActiveState: false, unlockRecordingState: false }); 
    
    let saveObj = {}; 
    saveObj[targetRecordingKey] = recordedSteps;
    chrome.storage.local.set(saveObj); 
    chrome.runtime.sendMessage({ action: "SAVE_STEPS", steps: recordedSteps, targetKey: targetRecordingKey }); 
  }
  if (message.action === "CLEAR_STEPS") { recordedSteps = []; }
  if (message.action === "UPDATE_STEPS_ARRAY") { recordedSteps = message.steps; }
  if (message.action === "TRIGGER_IMMEDIATE_RESCRAPE") { initiateContinuousScraperEngine(true); }

  if (message.action === "PLAY") { 
    stopAutomationRequested = false; 
    isPausedStateFlag = false; 
    startPersistentExecutionScheduler(); 
  }
  
  if (message.action === "START_ACCOUNT_UNLOCK_AUTOMATION") {
    stopAutomationRequested = false;
    executeTelvivaUnlockSequence();
  }
});

// --- RECORDING MOUSE & FORM INTERACTIONS ---
document.addEventListener('mouseover', (e) => { 
  if (!isRecording) return; 
  let el = e.target.closest('button, select, input, a, td, tr, span, svg') || e.target; 
  el.style.outline = '3px dashed #38bdf8'; 
  el.style.cursor = 'pointer'; 
}, true);

document.addEventListener('mouseout', (e) => { 
  if (!isRecording) return; 
  let el = e.target.closest('button, select, input, a, td, tr, span, svg') || e.target; 
  el.style.outline = ''; 
  el.style.cursor = ''; 
}, true);

const captureAction = (e) => {
  if (!isRecording) return; 
  if (e.target.tagName === "HTML" || e.target.tagName === "BODY") return;
  
  let element = e.target.closest('button, select, input, a, td, tr, span, svg') || e.target; 
  let structuralSelector = generateSmartSelector(element); 
  let targetText = element.tagName === "SELECT" ? (element.options[element.selectedIndex]?.text || "") : "";
  
  recordedSteps.push({ 
    action: "click", 
    target: structuralSelector, 
    isSelectMenu: element.tagName === "SELECT", 
    savedOptionChoice: targetText.trim(), 
    repeatCount: 1, 
    disabled: false 
  });
  
  let saveObj = {}; 
  saveObj[targetRecordingKey] = recordedSteps;
  chrome.storage.local.set(saveObj, () => { 
    chrome.runtime.sendMessage({ action: "STEPS_UPDATED", steps: recordedSteps, targetKey: targetRecordingKey }); 
  });
};

window.addEventListener('click', captureAction, true); 
window.addEventListener('change', captureAction, true);

// --- SCHEDULER & HEARTBEAT ---
function startPersistentExecutionScheduler() {
  if (continuousHeartbeatTimer) clearInterval(continuousHeartbeatTimer);
  continuousHeartbeatTimer = setInterval(() => {
    chrome.storage.local.get(["automationRunningState", "savedMacroSteps", "currentTicketIndexCounter"], (res) => {
      if (res.automationRunningState && !stopAutomationRequested && !isPausedStateFlag) {
        executeAutomationLoop(res.savedMacroSteps, res.currentTicketIndexCounter || 1);
      }
    });
  }, 4000); 
}

chrome.storage.local.get(["savedMacroSteps"], (res) => { if (res.savedMacroSteps) { recordedSteps = res.savedMacroSteps; } });
chrome.storage.local.get(["automationRunningState"], (res) => { if (res.automationRunningState) startPersistentExecutionScheduler(); });

// --- HTML TABLE EXTRACTOR FOR UNLOCKER ---
function scrapeExtensionNumbersFromHTML() {
  let scrapedNumbers = [];
  let extensionLinks = document.querySelectorAll('a[href*="name="], a[href*="phones/edit"]');
  extensionLinks.forEach(link => {
    let match = link.href.match(/name=(\d{4,8})/);
    if (match && !scrapedNumbers.includes(match[1])) scrapedNumbers.push(match[1]);
  });

  if (scrapedNumbers.length === 0) {
    let cells = document.querySelectorAll('table td, div[class*="row"]');
    cells.forEach(cell => {
      let text = cell.innerText.trim();
      let match = text.match(/\b(\d{4,8})\b/);
      if (match && !scrapedNumbers.includes(match[1])) scrapedNumbers.push(match[1]);
    });
  }
  return scrapedNumbers;
}

// --- MODULE 2: ACCOUNT UNLOCKER & PASSWORD CHANGER LOOP WITH VISUAL MODALS ---
async function executeTelvivaUnlockSequence() {
  if (stopAutomationRequested) return;

  await dismissValidationPopups();

  let state = await new Promise(r => chrome.storage.local.get([
    "unlockLoopActiveState", "currentUnlockingExtensionIndex", "parsedUnlockAccountsArray", 
    "passwordStrategyConfig", "globalPasswordValueConfig", "savedUnlockMacroSteps"
  ], r));

  if (!state.unlockLoopActiveState) return;

  let arr = state.parsedUnlockAccountsArray || [];

  // Auto-scan HTML table if list is empty
  if (arr.length === 0 && window.location.href.includes('/devices/phones/list')) {
    arr = scrapeExtensionNumbersFromHTML();
    if (arr.length > 0) {
      await new Promise(r => chrome.storage.local.set({ parsedUnlockAccountsArray: arr }, r));
    } else {
      showStatusOverlayModal("⚠️ No Target Extensions Found", "Unable to extract account codes from the current table view.", "#ea580c");
      chrome.storage.local.set({ unlockLoopActiveState: false });
      return;
    }
  }

  const idx = state.currentUnlockingExtensionIndex || 0;
  if (idx >= arr.length) {
    showStatusOverlayModal("✅ Batch Automation Finished", "All requested account targets have been processed successfully!", "#16a34a");
    chrome.storage.local.set({ unlockLoopActiveState: false });
    setTimeout(hideStatusOverlayModal, 4000);
    return;
  }

  const currentTargetExtensionNum = arr[idx];

  // SUB-FLOW A: DEVICE LIST TABLE SCANNER & MULTI-PAGE PAGE FLIPPER
  if (window.location.href.includes('/devices/phones/list')) {
    showStatusOverlayModal("🔍 Scanning View", `Searching current page table for Extension <b>#${currentTargetExtensionNum}</b> (${idx + 1} of ${arr.length})`, "#2563eb");

    let targetLinkNode = findDeepElement(`a[href*="${currentTargetExtensionNum}"]`);
    if (!targetLinkNode) {
      let cells = Array.from(document.querySelectorAll('td, a, span'));
      let matchingCell = cells.find(c => c.innerText.trim() === currentTargetExtensionNum);
      if (matchingCell) {
        let parentRow = matchingCell.closest('tr');
        targetLinkNode = parentRow ? parentRow.querySelector('a[href*="edit"]') : matchingCell;
      }
    }

    if (targetLinkNode) {
      showStatusOverlayModal("🎯 Target Extension Located", `Found <b>#${currentTargetExtensionNum}</b>! Opening settings page...`, "#16a34a");
      await new Promise(r => setTimeout(r, 800));
      targetLinkNode.click();
      telvivaProcessingTimer = setTimeout(executeTelvivaUnlockSequence, 2000);
    } else {
      // Find Next Page Controls
      let paginationContainer = findDeepElement('.pagination, ul.pagination, div[class*="page"]');
      let nextPageButton = null;

      if (paginationContainer) {
        let activePageLink = paginationContainer.querySelector('.active a, span.current, [class*="current"]');
        if (activePageLink) {
          let nextNumberListItem = activePageLink.closest('li')?.nextElementSibling;
          nextPageButton = nextNumberListItem ? nextNumberListItem.querySelector('a') : null;
        }
        if (!nextPageButton) nextPageButton = paginationContainer.querySelector('a[title*="Next"], [class*="next"] a, a:contains("›")');
      } else {
        let genericLinks = Array.from(document.querySelectorAll('a, span'));
        nextPageButton = genericLinks.find(el => el.innerText.trim() === '›' || el.innerText.toLowerCase().includes('next'));
      }

      if (nextPageButton && (nextPageButton.tagName === 'A' || nextPageButton.onclick || nextPageButton.href)) {
        showStatusOverlayModal("📄 Pivoting Table Page", `Extension <b>#${currentTargetExtensionNum}</b> not on this page. Flipping to Next Page...`, "#ea580c");
        await new Promise(r => setTimeout(r, 1000));
        nextPageButton.click();
        telvivaProcessingTimer = setTimeout(executeTelvivaUnlockSequence, 2500);
      } else {
        showStatusOverlayModal("⚠️ Extension Missing", `Could not locate Extension <b>#${currentTargetExtensionNum}</b> on any page. Skipping...`, "#dc2626");
        await new Promise(r => setTimeout(r, 1500));
        chrome.storage.local.set({ currentUnlockingExtensionIndex: idx + 1 }, () => {
          telvivaProcessingTimer = setTimeout(executeTelvivaUnlockSequence, 1000);
        });
      }
    }
    return;
  }

  // SUB-FLOW B: ACCOUNT EDIT SCREEN & RECORDED MACRO STEP EXECUTION
  if (window.location.href.includes('/devices/phones/edit')) {
    let customRecordedUnlockSteps = state.savedUnlockMacroSteps || [];

    // Playback custom recorded steps if present
    if (customRecordedUnlockSteps.length > 0) {
      for (let i = 0; i < customRecordedUnlockSteps.length; i++) {
        let step = customRecordedUnlockSteps[i];
        if (step.disabled) continue;

        showStatusOverlayModal("⚡ Executing Recorded Macro", `Step [${i + 1}/${customRecordedUnlockSteps.length}]: Target <code>${step.target.split(' > ').pop()}</code>`, "#7c3aed");
        let el = findDeepElement(step.target);
        if (el) {
          el.scrollIntoView({ block: 'center' });
          el.click();
          await new Promise(r => setTimeout(r, 1000));
        } else {
          showStatusOverlayModal("⏳ Waiting for UI Element", `Attempting to locate <code>${step.target.split(' > ').pop()}</code>...`, "#ea580c");
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    showStatusOverlayModal("⚙️ Adjusting Account Settings", `Applying password strategy & clearing lock for Extension <b>#${currentTargetExtensionNum}</b>...`, "#2563eb");

    let modalTitleHeader = findDeepElement('div.modal-title, h3, .dialog h2');
    let modalIsVisible = modalTitleHeader && modalTitleHeader.innerText.includes('User');

    let discoveredOwnerString = currentTargetExtensionNum; 
    let ownerSelectDropdown = findDeepElement('select[name="owner"], select#owner');
    if (ownerSelectDropdown) {
      discoveredOwnerString = ownerSelectDropdown.options[ownerSelectDropdown.selectedIndex]?.text?.trim() || ownerSelectDropdown.value;
    }

    if (!modalIsVisible) {
      let rowSettingsButton = findDeepElement('select[name="owner"] + .dropdown button, select#owner + div button, .owner-row .dropdown-toggle, select[name*="owner"] ~ [class*="dots"], select[name="owner"] ~ svg');
      if (!rowSettingsButton) {
        let selects = Array.from(document.querySelectorAll('select'));
        let ownerSelect = selects.find(s => s.name === 'owner' || s.id === 'owner');
        if (ownerSelect) {
          let containerCard = ownerSelect.closest('div, td, tr');
          rowSettingsButton = containerCard ? containerCard.querySelector('button, .dropdown-toggle, [class*="icon"]') : null;
        }
      }

      if (rowSettingsButton) {
        rowSettingsButton.click();
        telvivaProcessingTimer = setTimeout(executeTelvivaUnlockSequence, 1200);
      } else {
        let inlineUserButton = findDeepElement('a[href*="users/edit"], .user-edit-link');
        if (inlineUserButton) {
          inlineUserButton.click();
          telvivaProcessingTimer = setTimeout(executeTelvivaUnlockSequence, 2000);
        } else {
          showStatusOverlayModal("⏳ Waiting for Settings Modal", "Opening User Account settings modal...", "#ea580c");
          telvivaProcessingTimer = setTimeout(executeTelvivaUnlockSequence, 2000);
        }
      }
      return;
    }

    if (modalIsVisible) {
      let passwordField = findDeepElement('input[name="password"], input[id*="password"], input[placeholder*="password"]');
      let repeatField = findDeepElement('input[name="password_repeat"], input[id*="repeat"], input[name*="confirm"]');
      let lockToggleSwitch = findDeepElement('input[name="locked"], input[type="checkbox"][id*="lock"], .toggle-container input, [class*="switch"] input');

      let calculatedTargetStringValue = discoveredOwnerString; 
      if (state.passwordStrategyConfig === "global" && state.globalPasswordValueConfig) {
        calculatedTargetStringValue = state.globalPasswordValueConfig;
      }

      if (passwordField) {
        passwordField.value = calculatedTargetStringValue;
        passwordField.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (repeatField) {
        repeatField.value = calculatedTargetStringValue;
        repeatField.dispatchEvent(new Event('input', { bubbles: true }));
      }

      if (lockToggleSwitch) {
        if (lockToggleSwitch.checked) {
          lockToggleSwitch.click();
          lockToggleSwitch.checked = false;
          lockToggleSwitch.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        let checkedLocks = Array.from(document.querySelectorAll('input[type="checkbox"]')).filter(cb => cb.id.toLowerCase().includes('lock') || cb.name.toLowerCase().includes('lock'));
        checkedLocks.forEach(lock => {
          if (lock.checked) { lock.click(); lock.checked = false; lock.dispatchEvent(new Event('change', { bubbles: true })); }
        });
      }

      await new Promise(r => setTimeout(r, 600));

      showStatusOverlayModal("💾 Saving Changes", `Saving profile configuration for Extension <b>#${currentTargetExtensionNum}</b>...`, "#16a34a");

      let modalSaveButton = findDeepElement('.modal-footer button.btn-primary, button[type="submit"], .modal-dialog .save-btn, button:contains("Save")');
      if (!modalSaveButton) {
        let footerButtons = Array.from(document.querySelectorAll('.modal-footer button, .modal button, form button'));
        modalSaveButton = footerButtons.find(btn => btn.innerText.toLowerCase().includes('save') || btn.innerText.toLowerCase().includes('submit') || btn.innerText.toLowerCase().includes('ok'));
      }

      if (modalSaveButton) modalSaveButton.click();

      chrome.storage.local.set({ currentUnlockingExtensionIndex: idx + 1 }, () => {
        setTimeout(() => {
          let backToListButton = findDeepElement('a[href*="list"], .back-to-list, #go-back');
          if (backToListButton) backToListButton.click();
          else window.location.href = window.location.href.split('/edit')[0] + '/list/';
        }, 1500);
      });
    }
  }
}

// --- MODULE 1: TICKET CLOSER AUTOMATION LOOP ---
function performIntelligentTriageScraping() {
  let combinedScrapeCorpus = "";
  let ticketHeaderEl = findDeepElement('h2.ticket-subject, .ticket-title, #ticket-subject-header, h1, td.subject, .issue-title');
  if (ticketHeaderEl) combinedScrapeCorpus += " " + ticketHeaderEl.innerText;
  let threadContainer = document.querySelectorAll('.thread-body, .message-body, #ticket-thread, .thread-entry, .description');
  threadContainer.forEach(entry => { if (entry) combinedScrapeCorpus += " " + entry.innerText; });
  return combinedScrapeCorpus.toLowerCase().replace(/\s+/g, ' ');
}

function scrapeActiveTicketUserName() {
  let userLabelEl = findDeepElement('td:contains("User"), td:contains("Agent"), .user-info, .assigned-agent, #ticket-user-header, td a[href*="user"]');
  if (!userLabelEl) {
    let possibleRow = Array.from(document.querySelectorAll('table.ticket-info tr, table.form tr')).find(tr => tr.innerText.includes('Name') || tr.innerText.includes('Assigned'));
    if (possibleRow) userLabelEl = possibleRow.querySelector('td:nth-of-type(2)');
  }
  return userLabelEl ? userLabelEl.innerText.trim().replace(/\s+/g, ' ') : "Unknown Operator";
}

async function executeAutomationLoop(steps, ticketRunNumber) {
  if (stopAutomationRequested || isPausedStateFlag) return;
  let currentRunningLock = document.body.getAttribute('data-automation-lock'); if (currentRunningLock === "active") return;
  document.body.setAttribute('data-automation-lock', 'active');
  await dismissValidationPopups(); ticketStartTime = Date.now();

  let storageState = await new Promise(r => chrome.storage.local.get(["stepPauseConfig", "maxRunsConfig", "closedTicketsCount", "excelTicketRoutingMap", "disabledSubOptionsConfig", "processedTicketsAuditRecords"], r));
  let currentStepPause = storageState.stepPauseConfig || 1500; let currentMaxRuns = storageState.maxRunsConfig || 5; let closedTicketsCount = storageState.closedTicketsCount || 0; let excelLookupMap = storageState.excelTicketRoutingMap || {}; let excludedWhitelists = storageState.disabledSubOptionsConfig || []; let auditRecordsList = storageState.processedTicketsAuditRecords || [];

  let friendlyTicketNum = "Unknown"; let urlParams = new URLSearchParams(window.location.search); let urlId = urlParams.get('id') || urlParams.get('number');
  if (urlId && urlId.match(/^\d+$/)) { friendlyTicketNum = urlId; } chrome.storage.local.set({ currentActiveTicketNum: friendlyTicketNum });

  let parsedUserName = scrapeActiveTicketUserName(); let finalSelectedHelpTopic = "Normal Injected Choice";

  for (let i = 0; i < steps.length; i++) {
    let step = steps[i]; if (step.disabled) continue;
    let totalLoopsToRun = parseInt(step.repeatCount, 10) || 1;
    for (let rep = 0; rep < totalLoopsToRun; rep++) {
      let stepLoopComplete = false; let attemptsCount = 0;
      while (!stepLoopComplete) {
        if (stopAutomationRequested) { hideStatusOverlayModal(); document.body.removeAttribute('data-automation-lock'); return; }
        await dismissValidationPopups();
        let element = findDeepElement(step.target);
        if (!element) { attemptsCount++; showStatusOverlayModal("⚠️ Waiting for Element", `Cannot find ${step.target.split(' > ').pop()} (Attempt #${attemptsCount})`, "#ea580c"); if (attemptsCount > 3) { document.body.removeAttribute('data-automation-lock'); return; } await new Promise(r => setTimeout(r, 500)); continue; }
        hideStatusOverlayModal();

        if (element && element.tagName === "SELECT") {
          let textMatchQuery = step.savedOptionChoice;
          if (friendlyTicketNum !== "Unknown" && excelLookupMap[friendlyTicketNum]) {
            let targetFileLabel = excelLookupMap[friendlyTicketNum].trim().toLowerCase(); let structuralScoreMax = -1;
            for (let opt of element.options) {
              let optionText = opt.text.trim().toLowerCase();
              if (optionText.includes('dce crm') || optionText.includes('dce')) {
                if (optionText.includes(targetFileLabel)) { textMatchQuery = opt.text; break; }
                let overlappingWordsCount = targetFileLabel.split(' ').filter(word => optionText.includes(word)).length;
                if (overlappingWordsCount > structuralScoreMax) { structuralScoreMax = overlappingWordsCount; textMatchQuery = opt.text; }
              }
            }
          } else { let optionsArray = step.savedOptionChoice.split(',').map(item => item.trim()); textMatchQuery = optionsArray[(ticketRunNumber - 1) % optionsArray.length]; }
          if (excludedWhitelists.includes(textMatchQuery)) { stepLoopComplete = true; continue; }
          finalSelectedHelpTopic = textMatchQuery;
          let handled = await processNativeSelectDropdown(element, textMatchQuery, ticketRunNumber, false, 5, false);
          if (handled) { await new Promise(r => setTimeout(r, currentStepPause)); stepLoopComplete = true; continue; }
        }

        if (element) {
          if (i === steps.length - 1 && rep === totalLoopsToRun - 1) { auditRecordsList.push({ id: friendlyTicketNum, name: parsedUserName, topic: finalSelectedHelpTopic }); chrome.storage.local.set({ closedTicketsCount: closedTicketsCount + 1, processedTicketsAuditRecords: auditRecordsList }); }
          element.scrollIntoView({ block: 'center', inline: 'center' }); element.click(); element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          await new Promise(r => setTimeout(r, currentStepPause)); stepLoopComplete = true;
        } else { stepLoopComplete = true; }
      }
    }
  }

  setTimeout(async () => {
    if (stopAutomationRequested) { document.body.removeAttribute('data-automation-lock'); return; }
    if (ticketRunNumber >= currentMaxRuns) { clearInterval(continuousHeartbeatTimer); chrome.storage.local.set({ automationRunningState: false, currentActiveTicketNum: "Finished" }); document.body.removeAttribute('data-automation-lock'); return; }
    let nextTicketMarker = findDeepElement(steps[0].target) || findDeepElement('td a.preview, tr.active + tr td a, tbody tr td a[href*="id="], .ticket-link, a[href*="tickets.php?id="]') || findDeepElement('a[href*="tickets.php"], .back-to-list, #go-back, .next-ticket-button');
    if (nextTicketMarker) {
      let nextRunIndexNum = ticketRunNumber + 1;
      chrome.storage.local.set({ currentTicketIndexCounter: nextRunIndexNum }, () => { setTimeout(() => { document.body.removeAttribute('data-automation-lock'); if (nextTicketMarker.click) nextTicketMarker.click(); else window.location.href = nextTicketMarker.getAttribute('href'); }, 150); });
    } else { document.body.removeAttribute('data-automation-lock'); }
  }, 3000);
}

// --- VISUAL ON-SCREEN STATUS MODAL HELPERS ---
function showRecordingStatusBanner(show) {
  let old = document.getElementById('macro-recording-status-banner-hud'); if (old) old.remove(); if (!show) return;
  let banner = document.createElement('div'); banner.id = 'macro-recording-status-banner-hud'; 
  banner.style.cssText = "position: fixed; bottom: 20px; right: 20px; background: #dc2626; color: white; padding: 10px 20px; font-weight: bold; border-radius: 6px; z-index: 99999999; font-family: sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,0.3); border: 1px solid #f87171;"; 
  banner.innerText = "⏺️ Recording Mouse Actions Active"; document.body.appendChild(banner);
}

function showStatusOverlayModal(titleText, bodyText, headerBgColor = "#ea580c") {
  let banner = document.getElementById('automation-recovery-alert-banner');
  if (!banner) { 
    banner = document.createElement('div'); 
    banner.id = 'automation-recovery-alert-banner'; 
    banner.style.cssText = "position: fixed; top: 20px; left: 50%; transform: translateX(-50%); color: white; padding: 12px 24px; font-weight: bold; border-radius: 8px; z-index: 99999999; font-family: sans-serif; box-shadow: 0 4px 16px rgba(0,0,0,0.4); border: 2px solid #ffedd5; text-align: center; min-width: 320px; transition: background 0.2s;"; 
    document.body.appendChild(banner); 
  }
  banner.style.background = headerBgColor;
  banner.innerHTML = `<div style="font-size: 13px; margin-bottom: 3px; letter-spacing: 0.3px;">${titleText}</div><div style="font-size: 11px; font-weight: normal; color: #ffedd5;">${bodyText}</div>`;
}

function hideStatusOverlayModal() { 
  let banner = document.getElementById('automation-recovery-alert-banner'); 
  if (banner) banner.remove(); 
}

function findDeepElement(selector) {
  let element = document.querySelector(selector); if (element) return element;
  let iframes = document.querySelectorAll('iframe, frame');
  for (let i = 0; i < iframes.length; i++) {
    try {
      let frameDoc = iframes[i].contentDocument || iframes[i].contentWindow.document;
      let el = frameDoc.querySelector(selector); if (el) return el;
    } catch (e) {}
  }
  return null;
}

function generateSmartSelector(el) {
  let insideModal = el.closest('.dialog, .modal, #popup, [role="dialog"]'); 
  if (insideModal && el.id && el.id.length < 30) { return `#${insideModal.id} #${el.id}`; }
  if (el.id && !el.id.match(/^(_|id|id_|k-)[0-9a-fA-F\-]{6,}/) && el.id.length < 30) { return `#${el.id}`; }
  let path = [];
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    let tag = el.nodeName.toLowerCase(); if (tag === 'body' || tag === 'html') { el = el.parentNode; continue; }
    let className = el.className && typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(c => c && !c.match(/[0-9a-fA-F]{6,}/) && !c.includes('ng-')).map(c => `.${c}`).join('') : ''; 
    let attrSelector = el.getAttribute('name') ? `[name="${el.getAttribute('name')}"]` : ''; 
    let index = 1; let sibling = el.previousElementSibling;
    while (sibling) { if (sibling.nodeName === el.nodeName) index++; sibling = sibling.previousElementSibling; }
    let segment = tag + className + attrSelector; if (index > 1 || (el.nextElementSibling && el.nextElementSibling.nodeName === el.nodeName)) { segment += `:nth-of-type(${index})`; } path.unshift(segment); el = el.parentNode;
  }
  return path.join(' > ');
}

async function dismissValidationPopups() {
  let alertBoxes = document.querySelectorAll('.dialog, .modal, #popup, [role="dialog"], .alert-danger');
  for (let box of alertBoxes) { 
    if (box.textContent.toLowerCase().match(/(unable to update|required field|missing data)/)) { 
      let closeBtn = box.querySelector('button, .close, input[type="button"][value="Close"], .btn-default'); 
      if (closeBtn) { closeBtn.click(); await new Promise(r => setTimeout(r, 800)); return true; } 
    } 
  }
  return false;
}

async function processNativeSelectDropdown(selectElement, targetText, runIndex, isFirstTicket, secondsToWait, alertsEnabled) {
  if (!selectElement || selectElement.tagName !== "SELECT") return false;
  for (let option of selectElement.options) {
    let optionText = option.text.trim().replace(/\s+/g, ' ').toLowerCase(); 
    let queryText = targetText.trim().replace(/\s+/g, ' ').toLowerCase();
    if (optionText === queryText || optionText.includes(queryText)) { 
      selectElement.value = option.value; 
      selectElement.dispatchEvent(new Event('change', { bubbles: true })); 
      return true; 
    }
  }
  return false;
}

const initiateContinuousScraperEngine = (forceImmediateClear = false) => {
  let selectElements = document.querySelectorAll('select[name*="topic"], select[id*="topic"], select[id*="help"], select[name*="[]"], select[id*="_"]');
  chrome.storage.local.get(["scrapedTopics"], (res) => {
    let currentCachedTopics = forceImmediateClear ? [] : (res.scrapedTopics || []); 
    let discoveredNewTopicsFlag = false;
    selectElements.forEach(selectElement => {
      if (selectElement && selectElement.options.length > 1) {
        for (let option of selectElement.options) {
          let val = option.value; let txt = option.text.trim();
          if (val && txt && !txt.startsWith('—') && !txt.toLowerCase().includes('select')) { 
            if (!currentCachedTopics.includes(txt)) { currentCachedTopics.push(txt); discoveredNewTopicsFlag = true; } 
          }
        }
      }
    });
    if (discoveredNewTopicsFlag || forceImmediateClear) { chrome.storage.local.set({ scrapedTopics: currentCachedTopics }); }
  });
};
setInterval(initiateContinuousScraperEngine, 2500);