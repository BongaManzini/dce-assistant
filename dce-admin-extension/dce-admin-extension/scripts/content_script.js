let isRecordingActive = false;
let currentRecordingBuffer = [];
let activeRecordingProfileKey = "";

console.log("[AutoCloser-Admin] Injected and listening on DEL CRM.");

// Bridge agent heartbeats into this extension's separate storage partition.
window.addEventListener("DCE_AGENT_HEARTBEAT_BROADCAST", (event) => {
  let agentData = event.detail;
  if (typeof agentData === "string") {
    try {
      agentData = JSON.parse(agentData);
    } catch (error) {
      return;
    }
  }
  if (!agentData || !agentData.agentId) return;

  chrome.runtime.sendMessage({ action: "STORE_AGENT_HEARTBEAT", agent: agentData });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "PING") {
    sendResponse({ 
      status: "PONG",
      hostname: window.location.hostname || window.location.host,
      url: window.location.href,
      title: document.title || "Web Application"
    });
    return true;
  }

  // --- RECORDING CONTROLS ---
  if (message.action === "START_RECORDING") {
    isRecordingActive = true;
    if (message.append && Array.isArray(message.existingSteps)) {
      currentRecordingBuffer = [...message.existingSteps];
    } else {
      currentRecordingBuffer = [];
    }
    activeRecordingProfileKey = message.profileKey;
    showAdminRecordingBanner(true, activeRecordingProfileKey);
    sendResponse({ status: "RECORDING_STARTED", bufferCount: currentRecordingBuffer.length });
    return true;
  }

  if (message.action === "STOP_RECORDING") {
    isRecordingActive = false;
    showAdminRecordingBanner(false);
    sendResponse({ status: "RECORDING_STOPPED", steps: currentRecordingBuffer });
    return true;
  }

  if (message.action === "RESUME_MACRO") {
    showPauseBanner(false);
    if (macroResumeResolver) {
      macroResumeResolver();
      macroResumeResolver = null;
    }
    sendResponse({ status: "MACRO_RESUMED" });
    return true;
  }

  // --- REPLAY & NOTE ACTIONS ---
  if (message.action === "PLAY_STEPS") {
    sendResponse({ status: "PLAYBACK_STARTED" });
    replayRecordedSteps(message.steps);
    return true;
  }

  if (message.action === "INSERT_INTO_NOTES_LOG") {
    insertStagedNoteIntoDceNotesLog(message.notesText);
    sendResponse({ status: "NOTE_INSERTED" });
    return true;
  }

  // --- TICKET HISTORY & QA AUDIT SCANNERS ---
  if (message.action === "FIND_LATEST_AND_OPEN_NOTES") {
    findLatestTicketAndOpenNotesLog(message.tabType);
    sendResponse({ status: "SCANNING_INITIATED" });
    return true;
  }

  if (message.action === "AUDIT_AGENT_SESSION") {
    const auditData = extractAgentSessionAndTicketAudit();
    sendResponse({ status: "AUDIT_COMPLETE", data: auditData });
    return true;
  }

  return true;
});

// --- RECORDING HOOKS ---
let lastRecordedTargetElement = null;

function updatePodActiveFieldDisplay(el) {
  const statusEl = document.getElementById('pod-token-status');
  if (statusEl && el) {
    const name = el.getAttribute('formcontrolname') || el.name || el.placeholder || el.id || el.getAttribute('aria-label') || "Form field";
    statusEl.innerHTML = `Active field: <b style="color: #60a5fa;">[${name}]</b>`;
  }
}

window.addEventListener('focusin', (e) => {
  if (!isRecordingActive) return;
  if (e.target.closest('#admin-recording-banner')) return;
  if (e.target.matches('input, textarea, [contenteditable="true"], select')) {
    lastRecordedTargetElement = e.target;
    updatePodActiveFieldDisplay(e.target);
  }
}, true);

window.addEventListener('pointerdown', (e) => {
  if (!isRecordingActive) return;
  if (e.target.closest('#admin-recording-banner')) return;
  if (e.target.matches('input, textarea, [contenteditable="true"], select')) {
    lastRecordedTargetElement = e.target;
    updatePodActiveFieldDisplay(e.target);
  }
}, true);

window.addEventListener('input', (e) => {
  if (!isRecordingActive) return;
  const target = e.target;
  if (target.matches('input, textarea, [contenteditable="true"]')) {
    if (target.closest('#admin-recording-banner')) return;
    lastRecordedTargetElement = target;
    updatePodActiveFieldDisplay(target);
    const selector = generateRobustSelector(target);
    const textVal = target.value || target.innerText || "";

    const lastStep = currentRecordingBuffer[currentRecordingBuffer.length - 1];
    if (lastStep && lastStep.action === "input" && lastStep.target === selector) {
      lastStep.inputValue = textVal;
    } else {
      const stepData = {
        action: "input",
        target: selector,
        inputValue: textVal,
        delay: 500
      };
      currentRecordingBuffer.push(stepData);
      chrome.runtime.sendMessage({ action: "STEP_CAPTURED", step: stepData });
    }
  }
}, true);

window.addEventListener('change', (e) => {
  if (!isRecordingActive) return;
  const target = e.target;
  if (target.tagName === "SELECT") {
    const selector = generateRobustSelector(target);
    const selectedOpt = target.options[target.selectedIndex];
    const isSubCategory = selector.includes("classification_l3");
    
    const stepData = {
      action: "select",
      target: selector,
      savedOptionChoice: selectedOpt ? selectedOpt.text.trim() : "",
      savedOptionValue: selectedOpt ? selectedOpt.value : "",
      savedOptionIndex: target.selectedIndex,
      delay: isSubCategory ? 1100 : 900
    };

    currentRecordingBuffer.push(stepData);
    chrome.runtime.sendMessage({ action: "STEP_CAPTURED", step: stepData });
  }
}, true);

window.addEventListener('click', (e) => {
  if (!isRecordingActive) return;
  if (e.target.closest('#admin-recording-banner')) return;

  if (e.target.matches('input, textarea, [contenteditable="true"], select')) {
    lastRecordedTargetElement = e.target;
    updatePodActiveFieldDisplay(e.target);
  }

  const target = e.target.closest('button, a, input[type="button"], input[type="submit"]') || e.target;
  if (target.matches('input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]), textarea, select')) return;

  const selector = generateRobustSelector(target);
  const stepData = {
    action: "click",
    target: selector,
    delay: 800
  };

  currentRecordingBuffer.push(stepData);
  chrome.runtime.sendMessage({ action: "STEP_CAPTURED", step: stepData });
}, true);

function generateRobustSelector(el) {
  if (el.id && el.id.startsWith('sc_cases-')) return `#${el.id}`;
  if (el.getAttribute('formcontrolname')) return `[formcontrolname="${el.getAttribute('formcontrolname')}"]`;
  if (el.id && el.id.length < 30 && !el.id.match(/[0-9a-fA-F\-]{6,}/)) return `#${el.id}`;

  let path = [];
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    let tag = el.nodeName.toLowerCase();
    if (tag === 'body' || tag === 'html') break;
    let index = 1;
    let sib = el.previousElementSibling;
    while (sib) {
      if (sib.nodeName === el.nodeName) index++;
      sib = sib.previousElementSibling;
    }
    path.unshift(`${tag}:nth-of-type(${index})`);
    el = el.parentNode;
  }
  return path.join(' > ');
}

function locateTargetElement(targetSelector) {
  let el = document.querySelector(targetSelector);
  if (el) return el;

  const fcnMatch = targetSelector.match(/formcontrolname=["']([^"']+)["']/i);
  if (fcnMatch) {
    const fcn = fcnMatch[1];
    el = document.querySelector(`[formcontrolname="${fcn}"]`) || 
         document.getElementById(`sc_cases-${fcn}`) ||
         document.getElementById(fcn);
    if (el) return el;
  }

  const idMatch = targetSelector.match(/#([\w\-]+)/);
  if (idMatch) {
    el = document.getElementById(idMatch[1]);
    if (el) return el;
  }
  return null;
}

// Helper for formatting date strings
function formatDateToStandard(dateObj = new Date()) {
  const day = String(dateObj.getDate()).padStart(2, '0');
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[dateObj.getMonth()];
  const year = dateObj.getFullYear();
  return `${day} ${month} ${year}`;
}

function formatDateISO(dateObj = new Date()) {
  return dateObj.toISOString().split('T')[0];
}

let macroResumeResolver = null;

function showPauseBanner(show, stepText = "") {
  const old = document.getElementById('macro-pause-banner');
  if (old) old.remove();
  if (!show) return;

  const banner = document.createElement('div');
  banner.id = 'macro-pause-banner';
  banner.style.cssText = `
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(15, 23, 42, 0.96);
    color: #fef2f2;
    border: 2px solid #7c3aed;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(124, 58, 237, 0.5);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: 12px;
    padding: 12px 22px;
    z-index: 999999999;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex;
    align-items: center;
    gap: 16px;
  `;
  banner.innerHTML = `
    <div style="display: flex; flex-direction: column;">
      <span style="font-size: 12px; font-weight: bold; color: #c4b5fd;">MACRO PAUSED FOR ON-SCREEN INPUT (${stepText})</span>
      <span style="font-size: 10px; color: #cbd5e1;">Fill or inspect details on screen now, then click Resume to continue macro execution.</span>
    </div>
    <button id="btn-resume-macro-page" style="background: linear-gradient(135deg, #10b981, #059669); color: white; border: 1px solid #34d399; font-weight: bold; border-radius: 6px; padding: 7px 16px; font-size: 11px; cursor: pointer; box-shadow: 0 0 12px rgba(16, 185, 129, 0.5);">
      Resume Macro Execution
    </button>
  `;
  document.body.appendChild(banner);

  document.getElementById('btn-resume-macro-page')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showPauseBanner(false);
    if (macroResumeResolver) {
      macroResumeResolver();
      macroResumeResolver = null;
    }
    chrome.runtime.sendMessage({ action: "MACRO_RESUMED" });
  });
}

// Replay engine with exact matching and dynamic date/number token resolution
async function replayRecordedSteps(steps) {
  if (!steps || steps.length === 0) {
    chrome.runtime.sendMessage({ action: "PLAYBACK_FINISHED" });
    return;
  }

  const todayIso = formatDateISO();
  const todayStd = formatDateToStandard();
  const nextWeekIso = formatDateISO(new Date(Date.now() + 7 * 86400000));

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // Handle manual wait / pause step: Pause execution until user clicks Resume
    const isWaitInputStep = step.action === "wait_input" || 
                            step.action === "pause" || 
                            step.requiresInput === true || 
                            (step.action === "input" && (!step.inputValue || step.inputValue.trim() === "" || /\[DATE\]|\[NUMBER\]/i.test(step.inputValue)));

    if (isWaitInputStep) {
      let element = locateTargetElement(step.target);
      let fieldName = step.fieldName || "";
      if (!fieldName && element) {
        fieldName = element.getAttribute('formcontrolname') || element.name || element.placeholder || element.id || "Active Field";
      }
      if (element) {
        element.scrollIntoView({ block: 'center' });
        element.focus();
        element.style.outline = "3px solid #7c3aed";
        element.style.boxShadow = "0 0 16px rgba(124, 58, 237, 0.9)";
      }
      showPauseBanner(true, `Step ${i + 1} of ${steps.length}: ${fieldName}`);
      chrome.runtime.sendMessage({ action: "MACRO_PAUSED", stepIndex: i + 1, totalSteps: steps.length, fieldName: fieldName });

      await new Promise(resolve => {
        macroResumeResolver = resolve;
      });

      if (element) {
        element.style.outline = "";
        element.style.boxShadow = "";
      }
      continue;
    }

    let element = locateTargetElement(step.target);

    if (!element) {
      for (let retry = 0; retry < 18; retry++) {
        await new Promise(r => setTimeout(r, 200));
        element = locateTargetElement(step.target);
        if (element) break;
      }
    }

    if (!element) continue;

    if (step.action === "input") {
      element.focus();
      
      let rawVal = step.inputValue || "";
      // Use live user-entered values directly without auto-generating random numbers or fake IDs
      let resolvedVal = rawVal
        .replace(/\[DATE\]|\[Insert Date\]/gi, element.type === 'date' ? todayIso : todayStd)
        .replace(/\[TODAY\]/gi, element.type === 'date' ? todayIso : todayStd);

      element.value = resolvedVal;
      try {
        const proto = element.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (nativeSetter) nativeSetter.call(element, resolvedVal);
      } catch (e) {}

      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (step.action === "select" || element.tagName === "SELECT") {
      let matchedOpt = null;
      const targetChoice = (step.savedOptionChoice || "").toLowerCase().replace(/[\s\-_/]+/g, ' ').trim();
      const targetVal = (step.savedOptionValue || "").toString().toLowerCase().trim();

      for (let optRetry = 0; optRetry < 25; optRetry++) {
        const availableOptions = Array.from(element.options).filter(o => o.value !== "" && o.text.trim() !== "--");

        if (availableOptions.length > 0) {
          matchedOpt = availableOptions.find(o => {
            const optText = o.text.toLowerCase().replace(/[\s\-_/]+/g, ' ').trim();
            const optVal = o.value.toString().toLowerCase().trim();
            return optVal === targetVal || optText === targetChoice;
          });

          if (!matchedOpt) {
            matchedOpt = availableOptions.find(o => {
              const optText = o.text.toLowerCase().replace(/[\s\-_/]+/g, ' ').trim();
              if (targetChoice.includes("normal") && optText.includes("normal")) return true;
              return optText.length > 3 && (optText === targetChoice || targetChoice === optText);
            });
          }
        }

        if (matchedOpt) break;
        await new Promise(r => setTimeout(r, 150));
      }

      if (matchedOpt) {
        element.selectedIndex = matchedOpt.index;
        element.value = matchedOpt.value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    } else {
      element.scrollIntoView({ block: 'center' });
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }

    await new Promise(r => setTimeout(r, step.delay || 700));
  }

  chrome.runtime.sendMessage({ action: "PLAYBACK_FINISHED" });
}

// Find latest ticket by date and open Notes Log tab
async function findLatestTicketAndOpenNotesLog(tabType) {
  const navTabs = Array.from(document.querySelectorAll('.nav-link, button, [role="tab"], .btn, span'));
  const targetTab = navTabs.find(el => {
    const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
    return tabType === "OPEN" ? txt === "open cases" : txt === "closed cases";
  });

  if (targetTab) {
    targetTab.click();
    targetTab.dispatchEvent(new Event('click', { bubbles: true }));
  }

  await new Promise(r => setTimeout(r, 700));

  const rowElements = Array.from(document.querySelectorAll('ngx-datatable datatable-body-row, .datatable-body-row, tbody tr'));
  if (!rowElements || rowElements.length === 0) {
    chrome.runtime.sendMessage({ action: "NO_CASES_FOUND", tabType: tabType });
    return;
  }

  const parsedCases = [];
  rowElements.forEach((row, index) => {
    const rowText = row.innerText || row.textContent || "";
    const refMatch = rowText.match(/C-\d{8}-\d+|C-\d{4,}/i) || rowText.match(/\b\d{7,}\b/);
    const ticketRef = refMatch ? refMatch[0] : `Ticket #${index + 1}`;

    const dateMatch = rowText.match(/\d{2}\s+[A-Za-z]{3}\s+\d{4}(\s+\d{2}:\d{2})?/) || rowText.match(/\d{4}-\d{2}-\d{2}(\s+\d{2}:\d{2})?/);
    let parsedTimestamp = 0;

    if (dateMatch) {
      const parsedDate = new Date(dateMatch[0]);
      parsedTimestamp = !isNaN(parsedDate.getTime()) ? parsedDate.getTime() : 0;
    }

    parsedCases.push({
      element: row,
      ticketRef: ticketRef,
      timestamp: parsedTimestamp
    });
  });

  parsedCases.sort((a, b) => b.timestamp - a.timestamp);
  const latestCase = parsedCases[0];

  const clickTarget = latestCase.element.querySelector('a, .datatable-body-cell, span') || latestCase.element;
  clickTarget.scrollIntoView({ block: 'center' });
  clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

  for (let poll = 0; poll < 18; poll++) {
    await new Promise(r => setTimeout(r, 200));
    const allTabs = Array.from(document.querySelectorAll('.nav-link, a, [role="tab"], button, span'));
    const notesLogTab = allTabs.find(el => {
      const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
      return txt === "notes log" || txt.includes("notes log");
    });

    if (notesLogTab) {
      notesLogTab.scrollIntoView({ block: 'center' });
      notesLogTab.click();
      notesLogTab.dispatchEvent(new Event('click', { bubbles: true }));
      break;
    }
  }

  chrome.runtime.sendMessage({
    action: "LATEST_CASE_FOUND",
    ticketRef: latestCase.ticketRef
  });
}

function insertStagedNoteIntoDceNotesLog(notesText) {
  const noteSelectors = [
    'textarea[formcontrolname="note_text"]',
    'textarea[formcontrolname="notes"]',
    '#notes-log-textarea',
    'textarea'
  ];

  let targetBox = null;
  for (const selector of noteSelectors) {
    const el = document.querySelector(selector);
    if (el && el.offsetParent !== null) {
      targetBox = el;
      break;
    }
  }

  if (!targetBox) {
    alert("Please ensure the Notes Log tab is selected and the note entry field is visible.");
    return;
  }

  targetBox.focus();
  targetBox.value = notesText;
  targetBox.dispatchEvent(new Event('input', { bubbles: true }));
  targetBox.dispatchEvent(new Event('change', { bubbles: true }));
}

function scrapeAgentNameFromAdminTopBar() {
  try {
    const keys = ['currentUser', 'user', 'userData', 'profile', 'dce_agent_name', 'dce_cached_agent_name'];
    for (const key of keys) {
      const val = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (!val) continue;
      if (val.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(val);
          const name = parsed.fullName || parsed.name || parsed.displayName || parsed.agentName;
          if (name && name.length > 2) return name.trim();
        } catch (e) {}
      } else if (val.length > 2 && !/null|undefined|false/i.test(val)) {
        return val.trim();
      }
    }
  } catch(e) {}

  const selectors = [
    'app-header [class*="user" i]', 'app-topbar [class*="user" i]',
    '.user-profile', '.dropdown-user', '.user-name', '.profile-name',
    '[class*="user" i]', '[class*="profile" i]', '.dropdown-toggle span'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const text = (el.innerText || el.textContent || "").split('\n')[0].trim();
      const clean = text.replace(/[▼▲▼\u25BC\u25B2\u2304]/g, '').trim();
      if (clean.length > 2 && !/search|notification|menu|select/i.test(clean)) {
        return clean;
      }
    }
  }
  return "Molly Sharon Xaba";
}

// Session & Ticket QA Audit Scanner
function extractAgentSessionAndTicketAudit() {
  const agentName = scrapeAgentNameFromAdminTopBar();

  const caseTitle = document.querySelector('[formcontrolname="case_title"]')?.value || "Not Set";
  const caseStatus = document.querySelector('[formcontrolname="case_status"]')?.value || "Not Set";
  const province = document.querySelector('[formcontrolname="province"]')?.value || "--";
  const labourCenter = document.querySelector('[formcontrolname="labour_centre"]')?.value || "--";
  const activeNote = document.querySelector('textarea[formcontrolname="note_text"], textarea')?.value || "";

  const hasUnfilledTokens = /\[Insert Date\]|\[DATE\]|\[number\]|\[LANGUAGE\]/i.test(activeNote);
  const adheresToStructuredFormat = (/QUERY\s*:/i.test(activeNote) && /STATUS\s*:/i.test(activeNote) && /ADVICE\s*:/i.test(activeNote)) ||
    (/client called/i.test(activeNote) && /advised/i.test(activeNote) && (/submitted/i.test(activeNote) || /turn\s*around/i.test(activeNote) || /working days/i.test(activeNote) || /tat/i.test(activeNote)));

  return {
    agentName,
    caseTitle,
    caseStatus,
    province,
    labourCenter,
    hasUnfilledTokens,
    adheresToStructuredFormat,
    notesLength: activeNote.length,
    timestamp: new Date().toLocaleTimeString()
  };
}

// Update floating pod step counter badge
function updateBannerStepCount() {
  const counterEl = document.getElementById('banner-step-count');
  if (counterEl) {
    counterEl.innerText = `${currentRecordingBuffer.length} step${currentRecordingBuffer.length !== 1 ? 's' : ''}`;
  }
}

// Helper to insert token into the active form field during live recording
function insertTokenIntoField(tokenType) {
  let target = lastRecordedTargetElement;

  if (!target || !target.isConnected) {
    const active = document.activeElement;
    if (active && active !== document.body && !active.closest('#admin-recording-banner') && active.matches('input, textarea, [contenteditable="true"]')) {
      target = active;
      lastRecordedTargetElement = target;
    }
  }

  const podStatusEl = document.getElementById('pod-token-status');

  if (!target || !target.isConnected) {
    if (podStatusEl) {
      podStatusEl.innerHTML = `<span style="color: #f87171; font-weight: bold;">⚠️ Click a form field on page first!</span>`;
      setTimeout(() => updatePodActiveFieldDisplay(lastRecordedTargetElement), 3200);
    }
    return;
  }

  const fieldName = target.getAttribute('formcontrolname') || target.name || target.placeholder || target.id || target.getAttribute('aria-label') || "Form Field";
  const selector = generateRobustSelector(target);
  const isDateInput = target.type === 'date';
  const isNumberInput = target.type === 'number';

  // Apply value to DOM for visual feedback and Angular form binding
  if (tokenType === '[DATE]') {
    const domVal = isDateInput ? formatDateISO(new Date()) : '[DATE]';
    target.value = domVal;
    try {
      const proto = target.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (nativeSetter) nativeSetter.call(target, domVal);
    } catch(err) {}
  } else if (tokenType === '[NUMBER]') {
    const domVal = isNumberInput ? '0' : '[NUMBER]';
    target.value = domVal;
    try {
      const proto = target.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (nativeSetter) nativeSetter.call(target, domVal);
    } catch(err) {}
  }

  // Dispatch events to trigger Angular change detection
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  target.dispatchEvent(new Event('blur', { bubbles: true }));

  // Visual pulse confirmation on the page element
  const prevOutline = target.style.outline;
  const prevBoxShadow = target.style.boxShadow;
  target.style.outline = "3px solid #14b8a6";
  target.style.boxShadow = "0 0 16px rgba(20, 184, 166, 0.8)";
  setTimeout(() => {
    target.style.outline = prevOutline;
    target.style.boxShadow = prevBoxShadow;
  }, 1400);

  // Construct recorded step data
  const stepData = {
    action: "input",
    target: selector,
    inputValue: tokenType,
    fieldName: fieldName,
    requiresInput: true,
    delay: 500
  };

  const lastStep = currentRecordingBuffer[currentRecordingBuffer.length - 1];
  if (lastStep && lastStep.action === "input" && lastStep.target === selector) {
    currentRecordingBuffer[currentRecordingBuffer.length - 1] = stepData;
  } else {
    currentRecordingBuffer.push(stepData);
  }

  chrome.runtime.sendMessage({ action: "STEP_CAPTURED", step: stepData });
  updateBannerStepCount();

  if (podStatusEl) {
    podStatusEl.innerHTML = `<span style="color: #34d399; font-weight: bold;">✓ Inserted ${tokenType} into [${fieldName}]</span>`;
    setTimeout(() => updatePodActiveFieldDisplay(target), 3000);
  }
}

// Show Theme-Styled Interactive Floating In-Page Recording Pod
function showAdminRecordingBanner(show, profileName = "") {
  const old = document.getElementById('admin-recording-banner');
  if (old) old.remove();
  if (!show) return;

  const banner = document.createElement('div');
  banner.id = 'admin-recording-banner';
  banner.style.cssText = `
    position: fixed;
    bottom: 14px;
    right: 20px;
    background: rgba(15, 23, 42, 0.95);
    color: #e2e8f0;
    border: 1px solid rgba(124, 58, 237, 0.6);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 15px rgba(124, 58, 237, 0.3);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-radius: 10px;
    padding: 10px 14px;
    z-index: 999999999;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 11px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 290px;
    max-width: 360px;
  `;

  banner.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 6px;">
      <div style="display: flex; align-items: center; gap: 6px; font-weight: bold; color: #f43f5e;">
        <span style="display: inline-block; width: 8px; height: 8px; background: #ef4444; border-radius: 50%; box-shadow: 0 0 8px #ef4444; animation: pulse 1.2s infinite;"></span>
        <span>RECORDING LIVE</span>
      </div>
      <span style="font-size: 10px; background: rgba(124, 58, 237, 0.3); color: #c4b5fd; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(167, 139, 250, 0.4);" id="banner-step-count">
        ${currentRecordingBuffer.length} step${currentRecordingBuffer.length !== 1 ? 's' : ''}
      </span>
    </div>

    <div style="font-size: 10px; color: #94a3b8;">
      Preset: <b style="color: #60a5fa;">${profileName || "Active Preset"}</b>
    </div>

    <!-- Active Field Display -->
    <div id="pod-token-status" style="font-size: 10px; color: #94a3b8; background: rgba(15, 23, 42, 0.6); padding: 5px 8px; border-radius: 5px; border: 1px solid rgba(255, 255, 255, 0.08); min-height: 22px; display: flex; align-items: center;">
      Active field: <span style="color: #64748b; margin-left: 4px;">(Click any field on page)</span>
    </div>

    <!-- Token Injection Buttons (Strictly [DATE] and [NUMBER]) -->
    <div style="display: flex; gap: 6px;">
      <button id="pod-btn-date" type="button" style="background: rgba(13, 148, 136, 0.35); border: 1px solid #0d9488; color: #2dd4bf; border-radius: 6px; padding: 6px 8px; font-size: 10.5px; font-weight: bold; cursor: pointer; flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px; box-shadow: 0 2px 6px rgba(13, 148, 136, 0.2);" title="Insert [DATE] token into active field">
        📅 + [DATE]
      </button>
      <button id="pod-btn-number" type="button" style="background: rgba(2, 132, 199, 0.35); border: 1px solid #0284c7; color: #38bdf8; border-radius: 6px; padding: 6px 8px; font-size: 10.5px; font-weight: bold; cursor: pointer; flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px; box-shadow: 0 2px 6px rgba(2, 132, 199, 0.2);" title="Insert [NUMBER] token into active field">
        🔢 + [NUMBER]
      </button>
    </div>

    <!-- Pod Action Buttons: Pause Step & Stop -->
    <div style="display: flex; gap: 6px; margin-top: 2px;">
      <button id="pod-btn-wait-input" type="button" style="background: #334155; border: 1px solid #475569; color: #f1f5f9; border-radius: 5px; padding: 5px 8px; font-size: 10px; font-weight: bold; cursor: pointer; flex: 1;" title="Insert a Pause step for manual on-screen agent input">
        ⏸ + Pause Step
      </button>
      <button id="pod-btn-stop" type="button" style="background: linear-gradient(135deg, #ef4444, #dc2626); border: 1px solid #f87171; color: white; border-radius: 5px; padding: 5px 10px; font-size: 10px; font-weight: bold; cursor: pointer; flex: 1.4; box-shadow: 0 0 10px rgba(239, 68, 68, 0.4);">
        ⏹ Stop & Save
      </button>
    </div>
  `;

  document.body.appendChild(banner);

  if (lastRecordedTargetElement) {
    updatePodActiveFieldDisplay(lastRecordedTargetElement);
  }

  // Pod Event Handlers
  document.getElementById('pod-btn-date')?.addEventListener('click', (e) => {
    e.stopPropagation();
    insertTokenIntoField('[DATE]');
  });

  document.getElementById('pod-btn-number')?.addEventListener('click', (e) => {
    e.stopPropagation();
    insertTokenIntoField('[NUMBER]');
  });

  document.getElementById('pod-btn-wait-input')?.addEventListener('click', (e) => {
    e.stopPropagation();
    let targetSelector = "MANUAL_INPUT";
    let fieldName = "Manual Action Required";
    if (lastRecordedTargetElement && lastRecordedTargetElement.isConnected) {
      targetSelector = generateRobustSelector(lastRecordedTargetElement);
      fieldName = lastRecordedTargetElement.getAttribute('formcontrolname') || lastRecordedTargetElement.name || lastRecordedTargetElement.placeholder || lastRecordedTargetElement.id || "Active Field";
    }
    const stepData = {
      action: "wait_input",
      target: targetSelector,
      fieldName: fieldName,
      requiresInput: true,
      delay: 800
    };
    currentRecordingBuffer.push(stepData);
    chrome.runtime.sendMessage({ action: "STEP_CAPTURED", step: stepData });
    updateBannerStepCount();
    const statusEl = document.getElementById('pod-token-status');
    if (statusEl) {
      statusEl.innerHTML = `<span style="color: #c4b5fd; font-weight: bold;">⏸ Added Pause Step for [${fieldName}]</span>`;
    }
  });

  document.getElementById('pod-btn-stop')?.addEventListener('click', (e) => {
    e.stopPropagation();
    isRecordingActive = false;
    showAdminRecordingBanner(false);
    chrome.runtime.sendMessage({ action: "STOP_RECORDING_FROM_BANNER", steps: currentRecordingBuffer });
  });
}