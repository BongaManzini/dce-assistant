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
window.addEventListener('input', (e) => {
  if (!isRecordingActive) return;
  const target = e.target;
  if (target.matches('input[type="text"], input:not([type]), textarea, [contenteditable="true"]')) {
    if (target.closest('#admin-recording-banner')) return;
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

  const target = e.target.closest('button, a, input[type="button"], input[type="submit"]') || e.target;
  if (target.matches('input[type="text"], textarea, select')) return;

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

    // Handle manual wait / pause step: Pause execution until agent clicks Resume
    if (step.action === "wait_input" || step.action === "pause") {
      let element = locateTargetElement(step.target);
      if (element) {
        element.scrollIntoView({ block: 'center' });
        element.style.outline = "3px solid #7c3aed";
        element.style.boxShadow = "0 0 16px rgba(124, 58, 237, 0.9)";
      }
      showPauseBanner(true, `Step ${i + 1} of ${steps.length}`);
      chrome.runtime.sendMessage({ action: "MACRO_PAUSED", stepIndex: i + 1 });

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
      // Resolve dynamic date and number tokens
      let resolvedVal = rawVal
        .replace(/\[DATE\]|\[Insert Date\]/gi, element.type === 'date' ? todayIso : todayStd)
        .replace(/\[TODAY\]/gi, element.type === 'date' ? todayIso : todayStd)
        .replace(/\[DUE_DATE\]/gi, element.type === 'date' ? nextWeekIso : formatDateToStandard(new Date(Date.now() + 7 * 86400000)))
        .replace(/\[NUMBER\]/gi, () => Math.floor(100000 + Math.random() * 900000).toString())
        .replace(/\[ID_NUMBER\]/gi, "8501015029087")
        .replace(/\[REF_NUMBER\]/gi, "C-2026-" + Math.floor(10000 + Math.random() * 90000))
        .replace(/\[AMOUNT\]/gi, "R 1,250.00");

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
      Preset: <b style="color: #60a5fa;">${profileName || "Active Preset"}</b><br>
      <span style="color: #cbd5e1;">Click inputs/dropdowns on page to record. Insert numbers/dates or stop below:</span>
    </div>

    <!-- Number Dropdown & Input Box on Floating Pod -->
    <div style="display: flex; flex-direction: column; gap: 4px; background: rgba(30, 41, 59, 0.6); padding: 6px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1);">
      <div style="font-size: 9.5px; color: #94a3b8; font-weight: bold;">Number Dropdown & Input:</div>
      <div style="display: flex; gap: 4px; align-items: center;">
        <select id="pod-number-select" style="flex: 1; background: #0f172a; color: #38bdf8; border: 1px solid #0284c7; border-radius: 4px; padding: 3px 4px; font-size: 10px; outline: none; min-width: 120px;">
          <option value="[NUMBER]">[NUMBER] Dynamic Number</option>
          <option value="[ID_NUMBER]">[ID_NUMBER] SA ID Number</option>
          <option value="[REF_NUMBER]">[REF_NUMBER] Claim Reference</option>
          <option value="[AMOUNT]">[AMOUNT] Benefit Amount</option>
          <option value="1000">1000</option>
          <option value="5000">5000</option>
          <option value="CUSTOM">Custom Input...</option>
        </select>
        <input type="text" id="pod-custom-number-input" placeholder="Type number..." style="flex: 1; display: none; background: #0f172a; color: #f1f5f9; border: 1px solid #475569; border-radius: 4px; padding: 3px 5px; font-size: 10px; outline: none; min-width: 100px;">
        <button id="pod-btn-insert-number-val" style="background: rgba(2, 132, 199, 0.4); border: 1px solid #0284c7; color: #38bdf8; border-radius: 4px; padding: 3px 8px; font-size: 9.5px; font-weight: bold; cursor: pointer;">
          Insert
        </button>
      </div>
    </div>

    <!-- Quick Date Token Injector on In-Page Pod -->
    <div style="display: flex; gap: 4px;">
      <button id="pod-btn-date" style="background: rgba(13, 148, 136, 0.3); border: 1px solid #0d9488; color: #2dd4bf; border-radius: 4px; padding: 3px 6px; font-size: 9.5px; cursor: pointer; flex: 1;" title="Insert dynamic Date token into last field">
        + Date Token
      </button>
      <button id="pod-btn-today-date" style="background: rgba(51, 65, 85, 0.6); border: 1px solid #475569; color: #e2e8f0; border-radius: 4px; padding: 3px 6px; font-size: 9.5px; cursor: pointer; flex: 1;" title="Insert today's date">
        + Today's Date
      </button>
    </div>

    <!-- In-Page Stop Button directly on page pod -->
    <div style="display: flex; gap: 6px; margin-top: 2px;">
      <button id="pod-btn-wait-input" style="background: #334155; border: 1px solid #475569; color: #f1f5f9; border-radius: 5px; padding: 5px 8px; font-size: 10px; font-weight: bold; cursor: pointer; flex: 1;">
        + Pause Step
      </button>
      <button id="pod-btn-stop" style="background: linear-gradient(135deg, #ef4444, #dc2626); border: 1px solid #f87171; color: white; border-radius: 5px; padding: 5px 10px; font-size: 10px; font-weight: bold; cursor: pointer; flex: 1.5; box-shadow: 0 0 10px rgba(239, 68, 68, 0.4);">
        Stop Recording & Save
      </button>
    </div>
  `;

  document.body.appendChild(banner);

  const podNumberSelect = document.getElementById('pod-number-select');
  const podCustomInput = document.getElementById('pod-custom-number-input');
  const podBtnInsertNum = document.getElementById('pod-btn-insert-number-val');

  podNumberSelect?.addEventListener('change', () => {
    if (podNumberSelect.value === 'CUSTOM') {
      if (podCustomInput) {
        podCustomInput.style.display = 'block';
        podCustomInput.focus();
      }
    } else {
      if (podCustomInput) podCustomInput.style.display = 'none';
    }
  });

  podBtnInsertNum?.addEventListener('click', (e) => {
    e.stopPropagation();
    let valToInsert = podNumberSelect.value;
    if (valToInsert === 'CUSTOM') {
      valToInsert = podCustomInput ? podCustomInput.value.trim() : "";
      if (!valToInsert) valToInsert = "[NUMBER]";
    }

    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      activeEl.value = valToInsert;
      activeEl.dispatchEvent(new Event('input', { bubbles: true }));
      activeEl.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      const stepData = { action: "input", target: "active_field", inputValue: valToInsert, delay: 500 };
      currentRecordingBuffer.push(stepData);
      chrome.runtime.sendMessage({ action: "STEP_CAPTURED", step: stepData });
      updateBannerStepCount();
    }
  });

  // In-Page Pod Event Handlers
  document.getElementById('pod-btn-stop')?.addEventListener('click', (e) => {
    e.stopPropagation();
    isRecordingActive = false;
    showAdminRecordingBanner(false);
    chrome.runtime.sendMessage({ action: "STOP_RECORDING_FROM_BANNER", steps: currentRecordingBuffer });
  });

  document.getElementById('pod-btn-date')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      activeEl.value = '[DATE]';
      activeEl.dispatchEvent(new Event('input', { bubbles: true }));
      activeEl.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      const stepData = { action: "input", target: "active_field", inputValue: "[DATE]", delay: 500 };
      currentRecordingBuffer.push(stepData);
      chrome.runtime.sendMessage({ action: "STEP_CAPTURED", step: stepData });
      updateBannerStepCount();
    }
  });

  document.getElementById('pod-btn-today-date')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const todayStr = formatDateToStandard(new Date());
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      activeEl.value = todayStr;
      activeEl.dispatchEvent(new Event('input', { bubbles: true }));
      activeEl.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      const stepData = { action: "input", target: "active_field", inputValue: todayStr, delay: 500 };
      currentRecordingBuffer.push(stepData);
      chrome.runtime.sendMessage({ action: "STEP_CAPTURED", step: stepData });
      updateBannerStepCount();
    }
  });

  document.getElementById('pod-btn-wait-input')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const stepData = { action: "wait_input", target: "MANUAL_INPUT", delay: 1000 };
    currentRecordingBuffer.push(stepData);
    chrome.runtime.sendMessage({ action: "STEP_CAPTURED", step: stepData });
    updateBannerStepCount();
  });
}