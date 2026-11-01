const dispositionChipsContainer = document.getElementById('disposition-chips');
const txtCallNotes = document.getElementById('txt-call-notes');
const btnCopyNotes = document.getElementById('btn-copy-notes');
const btnPasteToDce = document.getElementById('btn-paste-to-dce');
const btnClearNotes = document.getElementById('btn-clear-notes');
const copyFeedback = document.getElementById('copy-feedback');
const statusDot = document.getElementById('status-dot');
const recordingPill = document.getElementById('recording-pill');

const rfpCalendarInput = document.getElementById('rfp-calendar-input');
const btnInsertDate = document.getElementById('btn-insert-date');
const btnTodayDate = document.getElementById('btn-today-date');

const presetSelect = document.getElementById('preset-select');
const stepsLog = document.getElementById('steps-log');
const lblStepsCount = document.getElementById('lbl-steps-count');
const btnClearProfileSteps = document.getElementById('btn-clear-profile-steps');

const btnRecord = document.getElementById('btn-record');
const btnPlay = document.getElementById('btn-play');
const btnStop = document.getElementById('btn-stop');
const btnExportProfiles = document.getElementById('btn-export-profiles');
const inputImportProfiles = document.getElementById('input-import-profiles');

// New Preset Modal Elements
const btnShowAddPreset = document.getElementById('btn-show-add-preset');
const modalAddPreset = document.getElementById('modal-add-preset');
const btnCancelPreset = document.getElementById('btn-cancel-preset');
const btnSavePreset = document.getElementById('btn-save-preset');
const newPresetName = document.getElementById('new-preset-name');
const newPresetTitle = document.getElementById('new-preset-title');
const newPresetNotes = document.getElementById('new-preset-notes');

let allProfiles = {};
let activeProfileKey = "";
let currentSteps = [];

const now = new Date();
const todayFormatted = now.toISOString().split('T')[0];
if (rfpCalendarInput) rfpCalendarInput.value = todayFormatted;

function formatDateToStandard(dateStr) {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split('-');
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${monthNames[parseInt(month, 10) - 1]} ${year}`;
}

// Resilient Tab Messenger
async function sendMessageToActiveTab(msg, callback) {
  try {
    const crmTabs = await chrome.tabs.query({
      url: ["https://*.alteram.co.za/*", "https://dcl.crmprod.alteram.co.za/*"],
      currentWindow: true
    });
    let targetTab = crmTabs.find(t => t.active) || crmTabs[0];

    if (!targetTab) {
      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      targetTab = activeTabs[0];
    }

    if (!targetTab?.id) {
      alert("Please open or switch to the DEL CRM tab first.");
      return;
    }

    chrome.tabs.sendMessage(targetTab.id, msg, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("[AutoCloser] Tab disconnected. Refresh DEL CRM (F5).");
      } else if (callback) {
        callback(response);
      }
    });
  } catch (err) {
    console.error("[AutoCloser] Message dispatch error:", err);
  }
}

// 1. Initial Load: Merge local storage or load presets
fetch(chrome.runtime.getURL('presets.json'))
  .then(r => r.json())
  .then(defaultPresets => {
    chrome.storage.local.get(["customMacroPresets", "activePresetKey", "currentDraftNotes"], (res) => {
      allProfiles = res.customMacroPresets || {};

      // Seed presets if storage is empty
      Object.keys(defaultPresets).forEach(key => {
        if (!allProfiles[key]) {
          allProfiles[key] = {
            ...defaultPresets[key],
            steps: defaultPresets[key].steps || []
          };
        }
      });

      activeProfileKey = res.activePresetKey || Object.keys(allProfiles)[0];
      currentSteps = allProfiles[activeProfileKey]?.steps || [];

      if (res.currentDraftNotes && txtCallNotes) {
        txtCallNotes.value = res.currentDraftNotes;
      }

      renderProfileDropdown();
      renderStepsList(currentSteps);
      renderMatrixChips();
    });
  })
  .catch(err => console.error("Error loading presets:", err));

// 2. Matrix Chip Generator (1-Tap Replay of All Steps)
function renderMatrixChips() {
  if (!dispositionChipsContainer) return;
  dispositionChipsContainer.innerHTML = '';

  Object.keys(allProfiles).forEach(key => {
    const item = allProfiles[key];
    const chip = document.createElement('button');
    chip.className = 'btn-chip';
    const hasSteps = item.steps && item.steps.length > 0;

    chip.innerHTML = `
      <div style="font-size: 8px; color: var(--accent-color); font-weight: bold; text-transform: uppercase;">
        ${item.caseTitle || "QUERY"} ${hasSteps ? '⚡' : '⚠️'}
      </div>
      <div style="font-size: 9.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${key}
      </div>
    `;

    chip.title = hasSteps 
      ? `Recorded steps: ${item.steps.length}\n1-Tap to replay entire flow (Title, Notes & Dropdowns).` 
      : `No steps recorded yet. Click 🔴 Record Steps below to capture Case Title, Notes, and Dropdowns.`;

    chip.addEventListener('click', () => {
      switchActiveProfile(key);

      // Auto-populate Notes Staging Area
      let note = item.notes_template || item.notes || `QUERY: ${key}`;
      const chosenDateFormatted = formatDateToStandard(rfpCalendarInput ? rfpCalendarInput.value : todayFormatted);
      note = note.replace(/\[Insert Date\]|\[DATE\]/gi, chosenDateFormatted);

      if (txtCallNotes) {
        txtCallNotes.value = note;
        chrome.storage.local.set({ currentDraftNotes: note });
      }

      // Replay all recorded steps
      if (item.steps && item.steps.length > 0) {
        updateUIState("PLAYING");
        sendMessageToActiveTab({ action: "PLAY_STEPS", steps: item.steps });
      } else {
        alert(`No steps recorded for "${key}" yet. Select it in the Profile Step Studio below and click 🔴 Record Steps.`);
      }
    });

    dispositionChipsContainer.appendChild(chip);
  });
}

// 3. Profile & Steps Manager
function renderProfileDropdown() {
  if (!presetSelect) return;
  presetSelect.innerHTML = '';
  Object.keys(allProfiles).forEach(key => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = `${key} (${allProfiles[key].steps?.length || 0} steps)`;
    if (key === activeProfileKey) opt.selected = true;
    presetSelect.appendChild(opt);
  });
}

function switchActiveProfile(newKey) {
  if (!newKey || !allProfiles[newKey]) return;
  activeProfileKey = newKey;
  if (presetSelect) presetSelect.value = newKey;
  currentSteps = allProfiles[activeProfileKey].steps || [];

  renderStepsList(currentSteps);
  chrome.storage.local.set({ activePresetKey: activeProfileKey });
}

if (presetSelect) {
  presetSelect.addEventListener('change', (e) => switchActiveProfile(e.target.value));
}

// Display recorded steps
function renderStepsList(steps) {
  if (!stepsLog) return;

  if (!steps || steps.length === 0) {
    stepsLog.innerHTML = `
      <div style="color: var(--muted); padding: 8px; text-align: center;">
        No steps recorded for <b>${activeProfileKey}</b>.<br>
        Click <b>🔴 Record Steps</b>, type your Case Title & Notes, select dropdowns on DEL CRM, and click <b>⏹ Stop</b>.
      </div>
    `;
    return;
  }

  stepsLog.innerHTML = '';
  steps.forEach((step, idx) => {
    const row = document.createElement('div');
    row.className = 'step-item';

    let desc = "";
    if (step.action === "input") {
      const val = step.inputValue || "";
      const shortText = val.length > 25 ? val.slice(0, 25) + "..." : val;
      desc = `Type: <span style="color: var(--highlight);">"${shortText}"</span>`;
    } else if (step.action === "select") {
      desc = `Select: <span style="color: var(--accent-color);">"${step.savedOptionChoice}"</span>`;
    } else {
      desc = `Click: ${step.target.split(' > ').pop()}`;
    }

    row.innerHTML = `
      <span><b style="color: var(--accent-color);">#${idx + 1}</b> ${desc}</span>
      <button class="step-del-btn" data-index="${idx}" title="Delete step">&times;</button>
    `;

    row.querySelector('.step-del-btn').addEventListener('click', (e) => {
      const delIdx = parseInt(e.target.getAttribute('data-index'), 10);
      currentSteps.splice(delIdx, 1);
      allProfiles[activeProfileKey].steps = currentSteps;
      saveCurrentProfiles();
      renderStepsList(currentSteps);
      renderProfileDropdown();
      renderMatrixChips();
    });

    stepsLog.appendChild(row);
  });
}

function saveCurrentProfiles() {
  chrome.storage.local.set({
    customMacroPresets: allProfiles,
    activePresetKey: activeProfileKey
  });
}

if (btnClearProfileSteps) {
  btnClearProfileSteps.addEventListener('click', () => {
    if (confirm(`Clear all recorded steps for "${activeProfileKey}"?`)) {
      currentSteps = [];
      allProfiles[activeProfileKey].steps = [];
      saveCurrentProfiles();
      renderStepsList(currentSteps);
      renderProfileDropdown();
      renderMatrixChips();
    }
  });
}

// 4. Custom Preset Creation
if (btnShowAddPreset) {
  btnShowAddPreset.addEventListener('click', () => {
    newPresetName.value = "";
    newPresetTitle.value = "";
    newPresetNotes.value = "QUERY: \nSTATUS: \nADVICE: ";
    modalAddPreset.style.display = "flex";
  });
}

if (btnCancelPreset) {
  btnCancelPreset.addEventListener('click', () => {
    modalAddPreset.style.display = "none";
  });
}

if (btnSavePreset) {
  btnSavePreset.addEventListener('click', () => {
    const name = newPresetName.value.trim();
    const title = newPresetTitle.value.trim() || name.toUpperCase();
    const notes = newPresetNotes.value.trim();

    if (!name) {
      alert("Please enter a preset name.");
      return;
    }

    allProfiles[name] = {
      disposition: name,
      caseTitle: title,
      service: "UIF Normal",
      category: "",
      subCategory: "",
      issues: "",
      caseStatus: "Resolved",
      notes_template: notes,
      steps: []
    };

    saveCurrentProfiles();
    switchActiveProfile(name);
    renderProfileDropdown();
    renderMatrixChips();
    modalAddPreset.style.display = "none";
  });
}

// 5. Recording Controls
if (btnRecord) {
  btnRecord.addEventListener('click', () => {
    updateUIState("RECORDING");
    currentSteps = []; 
    allProfiles[activeProfileKey].steps = [];

    sendMessageToActiveTab({
      action: "START_RECORDING",
      profileKey: activeProfileKey
    });

    stepsLog.innerHTML = `
      <div style="color: #fca5a5; padding: 10px; text-align: center; font-weight: bold;">
        🔴 Recording into "${activeProfileKey}"...<br>
        Type your Case Title & Notes, then select dropdowns on DEL CRM!
      </div>
    `;
  });
}

if (btnPlay) {
  btnPlay.addEventListener('click', () => {
    if (currentSteps.length === 0) {
      alert("No steps recorded for this profile yet.");
      return;
    }
    updateUIState("PLAYING");
    sendMessageToActiveTab({ action: "PLAY_STEPS", steps: currentSteps });
  });
}

if (btnStop) {
  btnStop.addEventListener('click', () => {
    updateUIState("IDLE");
    sendMessageToActiveTab({ action: "STOP_RECORDING" }, (res) => {
      if (res && res.steps) {
        currentSteps = res.steps;
        allProfiles[activeProfileKey].steps = currentSteps;
        saveCurrentProfiles();
        renderStepsList(currentSteps);
        renderProfileDropdown();
        renderMatrixChips();
      }
    });
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "STEP_CAPTURED") {
    currentSteps.push(message.step);
    if (allProfiles[activeProfileKey]) {
      allProfiles[activeProfileKey].steps = currentSteps;
    }
    saveCurrentProfiles();
    renderStepsList(currentSteps);
    renderProfileDropdown();
  }
  if (message.action === "PLAYBACK_FINISHED") {
    updateUIState("IDLE");
  }
});

// 6. Master JSON Export & Bulk Import for Team Deployment
if (btnExportProfiles) {
  btnExportProfiles.addEventListener('click', () => {
    const exportPackage = {
      package: "SmartTicketAutoCloser",
      role: "ADMIN_MASTER_EXPORT",
      version: "0.6.8",
      createdAt: new Date().toISOString(),
      profiles: allProfiles
    };

    const blob = new Blob([JSON.stringify(exportPackage, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DEL_CRM_MASTER_PRESETS_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

if (inputImportProfiles) {
  inputImportProfiles.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        const incoming = data.profiles || data;
        
        // Single unified import: completely replaces or merges master set
        allProfiles = { ...allProfiles, ...incoming };

        saveCurrentProfiles();
        switchActiveProfile(Object.keys(allProfiles)[0]);
        renderProfileDropdown();
        renderMatrixChips();
        alert(`Master package imported successfully! Loaded ${Object.keys(incoming).length} presets.`);
      } catch (err) {
        alert("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  });
}

// UI State Indicator
function updateUIState(state) {
  if (!statusDot) return;
  if (state === "RECORDING") {
    statusDot.style.backgroundColor = "#ef4444";
    statusDot.style.boxShadow = "0 0 8px #ef4444";
    if (recordingPill) recordingPill.style.display = "inline";
  } else if (state === "PLAYING") {
    statusDot.style.backgroundColor = "#107c41";
    statusDot.style.boxShadow = "0 0 8px #107c41";
    if (recordingPill) recordingPill.style.display = "none";
  } else {
    statusDot.style.backgroundColor = "#64748b";
    statusDot.style.boxShadow = "0 0 8px rgba(100, 116, 139, 0.5)";
    if (recordingPill) recordingPill.style.display = "none";
  }
}

// Notes Utilities
if (btnCopyNotes) {
  btnCopyNotes.addEventListener('click', () => {
    if (!txtCallNotes || !txtCallNotes.value) return;
    navigator.clipboard.writeText(txtCallNotes.value);
    if (copyFeedback) {
      copyFeedback.style.display = 'inline';
      setTimeout(() => { copyFeedback.style.display = 'none'; }, 1500);
    }
  });
}

if (btnPasteToDce) {
  btnPasteToDce.addEventListener('click', () => {
    if (!txtCallNotes) return;
    sendMessageToActiveTab({
      action: "INJECT_HEADER_AND_NOTES",
      notes: txtCallNotes.value
    });
  });
}

if (btnClearNotes) {
  btnClearNotes.addEventListener('click', () => {
    if (txtCallNotes) txtCallNotes.value = '';
    chrome.storage.local.remove(["currentDraftNotes"]);
  });
}

if (btnTodayDate) {
  btnTodayDate.addEventListener('click', () => {
    if (rfpCalendarInput) rfpCalendarInput.value = todayFormatted;
  });
}

if (btnInsertDate) {
  btnInsertDate.addEventListener('click', () => {
    const selectedDate = rfpCalendarInput ? rfpCalendarInput.value : "";
    if (!selectedDate) return;
    const formatted = formatDateToStandard(selectedDate);
    const currentText = txtCallNotes ? txtCallNotes.value : "";

    if (/DATE OF SUBMISSION\s*:\s*(\[.*?\]|[\d\w\s]+)/i.test(currentText)) {
      txtCallNotes.value = currentText.replace(/DATE OF SUBMISSION\s*:\s*(\[.*?\]|[\d\w\s]+)/i, `DATE OF SUBMISSION : ${formatted}`);
    } else if (/\[Insert Date\]|\[DATE\]/gi.test(currentText)) {
      txtCallNotes.value = currentText.replace(/\[Insert Date\]|\[DATE\]/gi, formatted);
    } else {
      txtCallNotes.value += `\nDATE OF SUBMISSION : ${formatted}`;
    }
    chrome.storage.local.set({ currentDraftNotes: txtCallNotes.value });
  });
}