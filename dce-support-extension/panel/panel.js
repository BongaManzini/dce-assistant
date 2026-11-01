// --- IT SUPPORT TOOLS HUB: MAIN CONTROLLER ENGINE ---

const tabBtnCloser = document.getElementById('tab-btn-closer');
const tabBtnUnlocker = document.getElementById('tab-btn-unlocker');
const paneCloserModule = document.getElementById('pane-closer-module');
const paneUnlockerModule = document.getElementById('pane-unlocker-module');

if (tabBtnCloser && tabBtnUnlocker && paneCloserModule && paneUnlockerModule) {
  tabBtnCloser.addEventListener('click', () => {
    tabBtnCloser.classList.add('tab-active');
    tabBtnUnlocker.classList.remove('tab-active');
    paneCloserModule.classList.add('pane-visible');
    paneUnlockerModule.classList.remove('pane-visible');
  });

  tabBtnUnlocker.addEventListener('click', () => {
    tabBtnUnlocker.classList.add('tab-active');
    tabBtnCloser.classList.remove('tab-active');
    paneUnlockerModule.classList.add('pane-visible');
    paneCloserModule.classList.remove('pane-visible');
  });
}

const btnRecord = document.getElementById('btn-record');
const btnPlay = document.getElementById('btn-play');
const btnStop = document.getElementById('btn-stop');
const btnManual = document.getElementById('btn-manual');
const btnRerecord = document.getElementById('btn-rerecord');
const btnClearAll = document.getElementById('btn-clear-all');
const btnRefreshExtension = document.getElementById('btn-refresh-extension');
const btnDeselectAllTree = document.getElementById('btn-deselect-all-tree');

const cfgMaxRuns = document.getElementById('cfg-max-runs');
const cfgStepPause = document.getElementById('cfg-step-pause');
const cfgCountdown = document.getElementById('cfg-countdown');
const cfgMuteAlerts = document.getElementById('cfg-mute-alerts');

const logPasteInput = document.getElementById('txt-log-paste-input');
const treeRootCategories = document.getElementById('tree-root-categories');
const auditHistoryLog = document.getElementById('audit-history-log');

const lblProgress = document.getElementById('lbl-progress');
const lblClosedCount = document.getElementById('lbl-closed-count');
const statusDot = document.getElementById('status-dot');
const stepsLog = document.getElementById('steps-log');

// Unlocker Module Elements
const txtUnlockAccountsInput = document.getElementById('txt-unlock-accounts-input');
const strategyUsername = document.getElementById('strategy-username');
const strategyGlobal = document.getElementById('strategy-global');
const txtGlobalPasswordValue = document.getElementById('txt-global-password-value');
const btnStartUnlocking = document.getElementById('btn-start-unlocking');
const btnUnlockStop = document.getElementById('btn-unlock-stop');
const btnUnlockRerecord = document.getElementById('btn-unlock-rerecord');
const btnUnlockRecord = document.getElementById('btn-unlock-record');
const btnUnlockClear = document.getElementById('btn-unlock-clear');
const lblUnlockCurrentTarget = document.getElementById('lbl-unlock-current-target');
const unlockStepsLog = document.getElementById('unlock-steps-log');

let currentSteps = [];
let currentUnlockSteps = [];
let scrapedTopicsList = [];
let disabledSubOptions = [];

function initializeExtensionDashboard() {
  chrome.storage.local.get([
    "automationRunningState", "maxRunsConfig", "stepPauseConfig", "countdownTimerConfig", 
    "currentTicketIndexCounter", "savedMacroSteps", "savedUnlockMacroSteps", "muteAlertsConfig", "closedTicketsCount",
    "currentActiveTicketNum", "scrapedTopics", "pastedRawLogCache", "disabledSubOptionsConfig",
    "processedTicketsAuditRecords", "pastedUnlockAccountsCache", "passwordStrategyConfig", 
    "globalPasswordValueConfig", "currentUnlockingExtensionIndex", "preferredThemeProfile"
  ], (res) => {
    if (cfgMaxRuns) cfgMaxRuns.value = res.maxRunsConfig || 5;
    if (cfgStepPause) cfgStepPause.value = res.stepPauseConfig || 1500;
    if (cfgCountdown) cfgCountdown.value = res.countdownTimerConfig || 5;
    if (cfgMuteAlerts) cfgMuteAlerts.checked = res.muteAlertsConfig || false;
    
    scrapedTopicsList = res.scrapedTopics || [];
    disabledSubOptions = res.disabledSubOptionsConfig || [];
    
    if (res.pastedRawLogCache && logPasteInput) logPasteInput.value = res.pastedRawLogCache;
    if (res.preferredThemeProfile) document.body.className = res.preferredThemeProfile;

    if (res.pastedUnlockAccountsCache && txtUnlockAccountsInput) txtUnlockAccountsInput.value = res.pastedUnlockAccountsCache;
    if (res.globalPasswordValueConfig && txtGlobalPasswordValue) txtGlobalPasswordValue.value = res.globalPasswordValueConfig;
    if (res.passwordStrategyConfig === "global" && strategyGlobal && txtGlobalPasswordValue) {
      strategyGlobal.checked = true;
      txtGlobalPasswordValue.style.display = 'block';
    }

    updateProgressDisplay(res.currentTicketIndexCounter || 0, res.currentActiveTicketNum || "None");
    if (lblClosedCount) lblClosedCount.innerText = res.closedTicketsCount || 0;
    
    buildRangeDropdownMenuTree();
    renderAuditHistoryLogList(res.processedTicketsAuditRecords || []);

    if (res.savedMacroSteps) {
      currentSteps = res.savedMacroSteps;
      renderStepsList(currentSteps, stepsLog, "savedMacroSteps");
    }

    if (res.savedUnlockMacroSteps) {
      currentUnlockSteps = res.savedUnlockMacroSteps;
      renderStepsList(currentUnlockSteps, unlockStepsLog, "savedUnlockMacroSteps");
    }

    updateUIState(res.automationRunningState ? "PLAYING" : "IDLE");
  });
}

// Theme Event Listeners
const slateBtn = document.getElementById('theme-btn-slate');
const nordBtn = document.getElementById('theme-btn-nord');
const oliveBtn = document.getElementById('theme-btn-olive');

if (slateBtn) slateBtn.addEventListener('click', () => saveThemeSelection(''));
if (nordBtn) nordBtn.addEventListener('click', () => saveThemeSelection('theme-nord'));
if (oliveBtn) oliveBtn.addEventListener('click', () => saveThemeSelection('theme-olive'));

function saveThemeSelection(classNameStr) {
  document.body.className = classNameStr;
  chrome.storage.local.set({ preferredThemeProfile: classNameStr });
}

if (strategyUsername && txtGlobalPasswordValue) {
  strategyUsername.addEventListener('change', () => { 
    txtGlobalPasswordValue.style.display = 'none'; 
    chrome.storage.local.set({ passwordStrategyConfig: "username" }); 
  });
}
if (strategyGlobal && txtGlobalPasswordValue) {
  strategyGlobal.addEventListener('change', () => { 
    txtGlobalPasswordValue.style.display = 'block'; 
    chrome.storage.local.set({ passwordStrategyConfig: "global" }); 
  });
}
if (txtGlobalPasswordValue) {
  txtGlobalPasswordValue.addEventListener('input', () => chrome.storage.local.set({ globalPasswordValueConfig: txtGlobalPasswordValue.value }));
}
if (txtUnlockAccountsInput) {
  txtUnlockAccountsInput.addEventListener('input', () => chrome.storage.local.set({ pastedUnlockAccountsCache: txtUnlockAccountsInput.value }));
}

// Unlocker Tab Action Control Event Handlers
if (btnUnlockRecord) {
  btnUnlockRecord.addEventListener('click', () => {
    chrome.storage.local.get(["unlockRecordingState"], (res) => {
      let logging = !res.unlockRecordingState;
      chrome.storage.local.set({ unlockRecordingState: logging, targetRecordingKey: "savedUnlockMacroSteps" });
      btnUnlockRecord.innerText = logging ? "Stop Recording" : "Record Steps";
      btnUnlockRecord.style.backgroundColor = logging ? "var(--accent-orange)" : "var(--accent-red)";
      chrome.runtime.sendMessage({ action: "START_RECORDING_INJECTION", targetKey: "savedUnlockMacroSteps" });
    });
  });
}

if (btnUnlockStop) {
  btnUnlockStop.addEventListener('click', () => {
    chrome.storage.local.set({ unlockLoopActiveState: false, unlockRecordingState: false });
    btnStartUnlocking.innerText = "Launch Accounts Batch Process Loop";
    btnStartUnlocking.style.backgroundColor = "var(--accent-blue)";
    btnUnlockRecord.innerText = "Record Steps";
    btnUnlockRecord.style.backgroundColor = "var(--accent-red)";
    sendMessageToActiveTab({ action: "STOP" });
  });
}

if (btnUnlockRerecord) {
  btnUnlockRerecord.addEventListener('click', () => {
    sendMessageToActiveTab({ action: "FORCE_RERECORD_STEP" });
  });
}

if (btnUnlockClear) {
  btnUnlockClear.addEventListener('click', () => {
    currentUnlockSteps = [];
    renderStepsList(currentUnlockSteps, unlockStepsLog, "savedUnlockMacroSteps");
    chrome.storage.local.set({ savedUnlockMacroSteps: [] });
    sendMessageToActiveTab({ action: "CLEAR_STEPS" });
  });
}

if (btnStartUnlocking) {
  btnStartUnlocking.addEventListener('click', () => {
    chrome.storage.local.get(["unlockLoopActiveState"], (res) => {
      if (res.unlockLoopActiveState) {
        chrome.storage.local.set({ unlockLoopActiveState: false });
        btnStartUnlocking.innerText = "Launch Accounts Batch Process Loop";
        btnStartUnlocking.style.backgroundColor = "var(--accent-blue)";
        sendMessageToActiveTab({ action: "STOP" });
      } else {
        const accountsList = txtUnlockAccountsInput ? txtUnlockAccountsInput.value.split(/[\s\n\r,]+/).map(s => s.trim()).filter(s => s.length > 0) : [];
        
        chrome.storage.local.set({ 
          unlockLoopActiveState: true,
          currentUnlockingExtensionIndex: 0,
          parsedUnlockAccountsArray: accountsList
        }, () => {
          btnStartUnlocking.innerText = "🛑 Stop Process Loop";
          btnStartUnlocking.style.backgroundColor = "var(--accent-red)";
          chrome.runtime.sendMessage({ action: "START_ACCOUNT_UNLOCK_AUTOMATION" });
        });
      }
    });
  });
}

if (logPasteInput) {
  logPasteInput.addEventListener('input', () => {
    const content = logPasteInput.value;
    chrome.storage.local.set({ pastedRawLogCache: content });
    parseRawTextMatrixLog(content);
  });
}

function parseRawTextMatrixLog(rawContent) {
  let parsedLookupTable = {};
  const lines = rawContent.split(/[\n\r,]+/);
  lines.forEach(line => {
    const cleanLine = line.trim();
    if (!cleanLine) return;
    const match = cleanLine.match(/\b(\d{4,8})\b/);
    if (match) {
      const ticketId = match[1];
      let classification = "Audio Drop Agent Side";
      if (cleanLine.toLowerCase().includes('caller side')) classification = "Audio Drop Caller Side";
      else if (cleanLine.toLowerCase().includes('both sides')) classification = "Audio Drop Both Sides";
      else if (cleanLine.toLowerCase().includes('agent side')) classification = "Audio Drop Agent Side";
      parsedLookupTable[ticketId] = classification;
    }
  });
  chrome.storage.local.set({ excelTicketRoutingMap: parsedLookupTable });
}

function buildRangeDropdownMenuTree() {
  if (!treeRootCategories) return;
  treeRootCategories.innerHTML = '';
  let structuredMap = {};
  scrapedTopicsList.forEach(topic => {
    let parent = topic.includes('/') ? topic.split('/')[0].trim() : "General Options";
    if (!structuredMap[parent]) structuredMap[parent] = [];
    structuredMap[parent].push(topic);
  });
  Object.keys(structuredMap).forEach(categoryName => {
    const block = document.createElement('div'); block.className = 'category-accordion-block';
    const header = document.createElement('div'); header.className = 'category-header-row';
    header.innerHTML = `<span class="category-title">${categoryName}</span><span class="accordion-arrow-indicator" style="color:#38bdf8; font-size:10px;">▼</span>`;
    const contentBox = document.createElement('div'); contentBox.className = 'category-dropdown-content';
    structuredMap[categoryName].forEach(fullOptionString => {
      const row = document.createElement('div'); row.className = 'sub-option-row';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !disabledSubOptions.includes(fullOptionString);
      cb.id = `tree-cb-${btoa(encodeURIComponent(fullOptionString)).replace(/=/g,'')}`;
      cb.addEventListener('change', () => {
        if (!cb.checked) { if (!disabledSubOptions.includes(fullOptionString)) disabledSubOptions.push(fullOptionString); }
        else { disabledSubOptions = disabledSubOptions.filter(item => item !== fullOptionString); }
        chrome.storage.local.set({ disabledSubOptionsConfig: disabledSubOptions });
      });
      const lbl = document.createElement('label'); lbl.htmlFor = cb.id; lbl.innerText = fullOptionString.includes('/') ? fullOptionString.split('/').slice(1).join('/').trim() : fullOptionString;
      row.appendChild(cb); row.appendChild(lbl); contentBox.appendChild(row);
    });
    header.addEventListener('click', () => {
      const isVisible = contentBox.style.display === 'flex';
      contentBox.style.display = isVisible ? 'none' : 'flex';
      header.querySelector('.accordion-arrow-indicator').innerText = isVisible ? '▼' : '▲';
    });
    block.appendChild(header); block.appendChild(contentBox); treeRootCategories.appendChild(block);
  });
}

if (btnDeselectAllTree) {
  btnDeselectAllTree.addEventListener('click', () => {
    disabledSubOptions = [...scrapedTopicsList];
    chrome.storage.local.set({ disabledSubOptionsConfig: disabledSubOptions }, () => { buildRangeDropdownMenuTree(); });
  });
}

function renderAuditHistoryLogList(records) {
  if (!auditHistoryLog) return;
  if (!records || records.length === 0) {
    auditHistoryLog.innerHTML = '<div style="color: #64748b; text-align: center; padding-top: 40px;">No tickets closed in this window session yet.</div>';
    return;
  }
  auditHistoryLog.innerHTML = '';
  [...records].reverse().forEach(record => {
    const div = document.createElement('div'); div.className = 'audit-row';
    div.innerHTML = `<div style="color: #4ade80; font-weight: bold;">Ticket: #${record.id || "Unknown"}</div><div style="color: #e2e8f0; margin-left: 5px;">Name: ${record.name || "Unknown Operator"}</div><div style="color: #94a3b8; margin-left: 5px; font-size: 10px;">Menu Choice Match: ${record.topic || "None"}</div>`;
    auditHistoryLog.appendChild(div);
  });
}

function updateProgressDisplay(index, ticketNum) {
  if (lblProgress) lblProgress.innerHTML = `${index} <span style="color: #94a3b8; font-weight: normal; margin-left: 5px;">(Ticket Link Selector Rank: #${ticketNum})</span>`;
}

if (cfgMaxRuns) cfgMaxRuns.addEventListener('input', () => { chrome.storage.local.set({ maxRunsConfig: parseInt(cfgMaxRuns.value, 10) || 5 }); });
if (cfgStepPause) cfgStepPause.addEventListener('input', () => { chrome.storage.local.set({ stepPauseConfig: parseInt(cfgStepPause.value, 10) || 1500 }); });
if (cfgCountdown) cfgCountdown.addEventListener('input', () => { chrome.storage.local.set({ countdownTimerConfig: parseInt(cfgCountdown.value, 10) || 5 }); });
if (cfgMuteAlerts) cfgMuteAlerts.addEventListener('change', () => { chrome.storage.local.set({ muteAlertsConfig: cfgMuteAlerts.checked }); });

if (btnRecord) { 
  btnRecord.addEventListener('click', () => { 
    updateUIState("RECORDING"); 
    chrome.storage.local.set({ targetRecordingKey: "savedMacroSteps" });
    chrome.runtime.sendMessage({ action: "START_RECORDING_INJECTION", targetKey: "savedMacroSteps" }); 
  }); 
}

if (btnPlay) {
  btnPlay.addEventListener('click', () => {
    chrome.storage.local.get(["automationRunningState"], (res) => {
      if (res.automationRunningState) {
        updateUIState("IDLE"); chrome.storage.local.set({ automationRunningState: false });
        sendMessageToActiveTab({ action: "STOP" });
      } else {
        updateUIState("PLAYING"); chrome.storage.local.set({ automationRunningState: true }, () => { chrome.runtime.sendMessage({ action: "START_AUTORUN_LOOP_INJECTION" }); });
      }
    });
  });
}

if (btnStop) btnStop.addEventListener('click', () => { updateUIState("IDLE"); chrome.storage.local.set({ automationRunningState: false }); sendMessageToActiveTab({ action: "STOP" }); });
if (btnManual) btnManual.addEventListener('click', () => { sendMessageToActiveTab({ action: "FORCE_MANUAL_DROPDOWN" }); });
if (btnRerecord) btnRerecord.addEventListener('click', () => { sendMessageToActiveTab({ action: "FORCE_RERECORD_STEP" }); });
if (btnClearAll) btnClearAll.addEventListener('click', () => { currentSteps = []; renderStepsList(currentSteps, stepsLog, "savedMacroSteps"); chrome.storage.local.set({ savedMacroSteps: [] }); sendMessageToActiveTab({ action: "CLEAR_STEPS" }); });
if (btnRefreshExtension) btnRefreshExtension.addEventListener('click', () => { chrome.storage.local.remove(["scrapedTopics"], () => { sendMessageToActiveTab({ action: "TRIGGER_IMMEDIATE_RESCRAPE" }); setTimeout(initializeExtensionDashboard, 600); }); });

function renderStepsList(steps, targetContainer, storageKey) {
  if (!targetContainer) return;
  if (!steps || steps.length === 0) { 
    targetContainer.innerHTML = '<div style="color: #64748b; text-align: center; margin-top: 40px;">No recorded actions yet.</div>'; 
    return; 
  }
  targetContainer.innerHTML = '';
  steps.forEach((step, idx) => {
    const stepItem = document.createElement('div'); stepItem.className = 'step-item';
    if (step.disabled) stepItem.classList.add('disabled-state-muted');
    const isRotating = step.savedOptionChoice && step.savedOptionChoice.includes(',');
    let displayValue = isRotating ? `[Rotates: ${step.savedOptionChoice}]` : step.savedOptionChoice;
    let desc = step.isSelectMenu ? `Select Menu Input: "${displayValue}"` : `Mouse Click on: ${step.target ? step.target.split(' > ').pop() : 'Element'}`;
    if (step.repeatCount && step.repeatCount > 1) desc += ` (Repeated ${step.repeatCount} times)`;

    const mainRow = document.createElement('div'); mainRow.style.cssText = "display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 6px;";
    const activeCb = document.createElement('input'); activeCb.type = 'checkbox'; activeCb.checked = !step.disabled;
    activeCb.addEventListener('change', () => {
      steps[idx].disabled = !activeCb.checked;
      let updateObj = {}; updateObj[storageKey] = steps;
      chrome.storage.local.set(updateObj, () => { renderStepsList(steps, targetContainer, storageKey); });
    });

    const info = document.createElement('div'); info.className = 'step-info'; info.innerHTML = `<b style="color:${isRotating ? '#38bdf8' : '#94a3b8'};">Action Row ${idx + 1}:</b> ${desc}`;
    const actions = document.createElement('div'); actions.style.cssText = "display: flex; gap: 6px; flex-shrink: 0; align-items: center;";
    const duplicateBtn = document.createElement('button'); duplicateBtn.innerHTML = 'Duplicate';
    duplicateBtn.style.cssText = "background: #1e293b; color: #38bdf8; border: 1px solid #334155; padding: 2px 6px; border-radius: 4px; font-size: 10px; cursor: pointer;";
    duplicateBtn.addEventListener('click', (e) => {
      e.stopPropagation(); steps.splice(idx + 1, 0, JSON.parse(JSON.stringify(steps[idx])));
      let updateObj = {}; updateObj[storageKey] = steps;
      chrome.storage.local.set(updateObj, () => { renderStepsList(steps, targetContainer, storageKey); });
    });

    const deleteBtn = document.createElement('button'); deleteBtn.innerHTML = 'Delete'; 
    deleteBtn.style.cssText = "background: #1e293b; color: #f87171; border: 1px solid #334155; padding: 2px 6px; border-radius: 4px; font-size: 10px; cursor: pointer;";

    mainRow.appendChild(activeCb); mainRow.appendChild(info); actions.appendChild(duplicateBtn); actions.appendChild(deleteBtn);
    mainRow.appendChild(actions); stepItem.appendChild(mainRow);

    deleteBtn.addEventListener('click', () => { 
      steps.splice(idx, 1); 
      let updateObj = {}; updateObj[storageKey] = steps;
      chrome.storage.local.set(updateObj, () => { renderStepsList(steps, targetContainer, storageKey); }); 
    });
    targetContainer.appendChild(stepItem);
  });
}

chrome.runtime.onMessage.addListener((msg) => { 
  if (msg.action === "STEPS_UPDATED") { 
    if (msg.targetKey === "savedUnlockMacroSteps") {
      currentUnlockSteps = msg.steps;
      renderStepsList(currentUnlockSteps, unlockStepsLog, "savedUnlockMacroSteps");
    } else {
      currentSteps = msg.steps; 
      renderStepsList(currentSteps, stepsLog, "savedMacroSteps"); 
    }
  } 
});

chrome.storage.onChanged.addListener((ch) => {
  if (ch.currentTicketIndexCounter || ch.currentActiveTicketNum) chrome.storage.local.get(["currentTicketIndexCounter", "currentActiveTicketNum"], res => updateProgressDisplay(res.currentTicketIndexCounter||0, res.currentActiveTicketNum||"None"));
  if (ch.scrapedTopics) { scrapedTopicsList = ch.scrapedTopics.newValue || []; buildRangeDropdownMenuTree(); renderStepsList(currentSteps, stepsLog, "savedMacroSteps"); }
  if (ch.closedTicketsCount || ch.processedTicketsAuditRecords) {
    chrome.storage.local.get(["closedTicketsCount", "processedTicketsAuditRecords"], res => {
      if (lblClosedCount) lblClosedCount.innerText = res.closedTicketsCount || 0;
      renderAuditHistoryLogList(res.processedTicketsAuditRecords || []);
    });
  }
  if (ch.currentUnlockingExtensionIndex && lblUnlockCurrentTarget) {
    chrome.storage.local.get(["parsedUnlockAccountsArray"], res => {
      const arr = res.parsedUnlockAccountsArray || [];
      lblUnlockCurrentTarget.innerText = arr[ch.currentUnlockingExtensionIndex.newValue] || "None";
    });
  }
  if (ch.unlockLoopActiveState && btnStartUnlocking) {
    if (!ch.unlockLoopActiveState.newValue) {
      btnStartUnlocking.innerText = "Launch Accounts Batch Process Loop";
      btnStartUnlocking.style.backgroundColor = "var(--accent-blue)";
    }
  }
  if (ch.automationRunningState) updateUIState(ch.automationRunningState.newValue ? "PLAYING" : "IDLE");
});

async function sendMessageToActiveTab(msg) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (activeTab && activeTab.id) chrome.tabs.sendMessage(activeTab.id, msg).catch(() => {});
  });
}

function updateUIState(state) {
  if (!statusDot || !btnPlay) return;
  if (state === "RECORDING") { statusDot.style.backgroundColor = "#ef4444"; btnPlay.innerText = "Start Auto-Run"; btnPlay.style.backgroundColor = "#2563eb"; }
  else if (state === "PLAYING") { statusDot.style.backgroundColor = "#2563eb"; btnPlay.innerText = "Pause Auto-Run"; btnPlay.style.backgroundColor = "#ea580c"; }
  else { statusDot.style.backgroundColor = "#64748b"; btnPlay.innerText = "Start Auto-Run"; btnPlay.style.backgroundColor = "#2563eb"; }
}

initializeExtensionDashboard();