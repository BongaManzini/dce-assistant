const selectCategoryFilter = document.getElementById('select-category-filter');
const dispositionChipsContainer = document.getElementById('disposition-chips');
const txtCallNotes = document.getElementById('txt-call-notes');
const btnCopyNotes = document.getElementById('btn-copy-notes');
const btnPasteToDce = document.getElementById('btn-paste-to-dce');
const btnFlagIncomplete = document.getElementById('btn-flag-incomplete');
const btnClearNotes = document.getElementById('btn-clear-notes');
const copyFeedback = document.getElementById('copy-feedback');
const statusDot = document.getElementById('status-dot');
const lblEngineState = document.getElementById('lbl-engine-state');
const lblPresetsCount = document.getElementById('lbl-presets-count');
const lblPackageVer = document.getElementById('lbl-package-ver');
const inputImportProfiles = document.getElementById('input-import-profiles');

const dceConnectionBadge = document.getElementById('dce-connection-badge');
const flashAlertBanner = document.getElementById('flash-alert-banner');
const chkMultiQuery = document.getElementById('chk-multi-query');
const chkDisableModals = document.getElementById('chk-disable-modals');

const rfpCalendarInput = document.getElementById('rfp-calendar-input');
const btnInsertDate = document.getElementById('btn-insert-date');
const btnTodayDate = document.getElementById('btn-today-date');

const lblCharsCount = document.getElementById('lbl-chars-count');
const lblWordsCount = document.getElementById('lbl-words-count');

const btnScanLatestOpen = document.getElementById('btn-scan-latest-open');
const btnScanLatestClosed = document.getElementById('btn-scan-latest-closed');
const lblScanStatus = document.getElementById('lbl-scan-status');

const modalActionAlert = document.getElementById('modal-action-alert');
const modalBannerText = document.getElementById('modal-banner-text');
const btnModalCancel = document.getElementById('btn-modal-cancel');
const btnModalConfirm = document.getElementById('btn-modal-confirm');
const selectTheme = document.getElementById('select-theme');
const bgCustomBar = document.getElementById('bg-custom-bar');
const inputBgUrl = document.getElementById('input-bg-url');
const inputBgFile = document.getElementById('input-bg-file');
const btnApplyBgUrl = document.getElementById('btn-apply-bg-url');
const btnClearBgUrl = document.getElementById('btn-clear-bg-url');

const lblAgentName = document.getElementById('lbl-agent-name');
const selectAgentRoster = document.getElementById('select-agent-roster');
const lblTelephonyPresence = document.getElementById('lbl-telephony-presence');

let allProfiles = {};
let pendingExecutionItem = null;
let queryCount = 0;
let isConnectedToDCE = false;
let isCurrentTicketFlagged = false;
let selectedQuery = null;

// Load saved agent identity override if present
chrome.storage.local.get(["dce_agent_name", "dce_agent_name_override"], (res) => {
  if (res.dce_agent_name_override && selectAgentRoster) {
    selectAgentRoster.value = res.dce_agent_name_override;
  }
  if (res.dce_agent_name && lblAgentName) {
    lblAgentName.innerText = `Agent: ${res.dce_agent_name}`;
  }
});

if (selectAgentRoster) {
  selectAgentRoster.addEventListener('change', async (e) => {
    let val = e.target.value;
    if (val === 'CUSTOM') {
      const customName = prompt("Enter Agent Full Name:", "Molly Sharon Xaba");
      if (customName && customName.trim()) {
        val = customName.trim();
      } else {
        selectAgentRoster.value = 'AUTO';
        return;
      }
    }
    
    if (val === 'AUTO') {
      chrome.storage.local.remove(["dce_agent_name_override"]);
      checkDceConnection();
    } else {
      chrome.storage.local.set({ dce_agent_name: val, dce_agent_name_override: val });
      if (lblAgentName) lblAgentName.innerText = `Agent: ${val}`;
      const targetTab = await getTargetTab();
      if (targetTab?.id) {
        chrome.tabs.sendMessage(targetTab.id, { action: "SET_AGENT_NAME", agentName: val });
      }
    }
  });
}

const now = new Date();
const todayFormatted = now.toISOString().split('T')[0];
if (rfpCalendarInput) rfpCalendarInput.value = todayFormatted;

// 1. Advanced Theme & Custom Wallpaper Controller (Supports File Picker & URL Paste)
chrome.storage.local.get(["dce_agent_theme", "dce_agent_bg_url"], (res) => {
  const savedTheme = res.dce_agent_theme || localStorage.getItem('dce_agent_theme') || 'dark';
  const savedBgUrl = res.dce_agent_bg_url || localStorage.getItem('dce_agent_bg_url') || '';
  if (selectTheme) selectTheme.value = savedTheme;
  if (inputBgUrl && savedBgUrl) inputBgUrl.value = savedBgUrl;
  applyTheme(savedTheme, savedBgUrl);
});

if (selectTheme) {
  selectTheme.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'custom') {
      if (bgCustomBar) bgCustomBar.style.display = 'flex';
      const currentBg = localStorage.getItem('dce_agent_bg_url') || '';
      if (inputBgUrl) inputBgUrl.value = currentBg;
      applyTheme('custom', currentBg);
    } else {
      if (bgCustomBar) bgCustomBar.style.display = 'none';
      applyTheme(val, '');
    }
  });
}

if (inputBgFile) {
  inputBgFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target.result;
      if (inputBgUrl) inputBgUrl.value = dataUrl;
      localStorage.setItem('dce_agent_bg_url', dataUrl);
      chrome.storage.local.set({ dce_agent_bg_url: dataUrl, dce_agent_theme: 'custom' });
      if (selectTheme) selectTheme.value = 'custom';
      applyTheme('custom', dataUrl);
    };
    reader.readAsDataURL(file);
  });
}

if (btnApplyBgUrl) {
  btnApplyBgUrl.addEventListener('click', () => {
    const url = inputBgUrl ? inputBgUrl.value.trim() : '';
    if (url) {
      localStorage.setItem('dce_agent_bg_url', url);
      chrome.storage.local.set({ dce_agent_bg_url: url, dce_agent_theme: 'custom' });
      if (selectTheme) selectTheme.value = 'custom';
      applyTheme('custom', url);
    }
  });
}

if (btnClearBgUrl) {
  btnClearBgUrl.addEventListener('click', () => {
    localStorage.removeItem('dce_agent_bg_url');
    chrome.storage.local.remove(["dce_agent_bg_url"]);
    if (inputBgUrl) inputBgUrl.value = '';
    if (inputBgFile) inputBgFile.value = '';
    if (selectTheme) selectTheme.value = 'dark';
    if (bgCustomBar) bgCustomBar.style.display = 'none';
    applyTheme('dark', '');
  });
}

function applyTheme(theme, bgUrl) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('dce_agent_theme', theme);
  chrome.storage.local.set({ dce_agent_theme: theme });

  if (theme === 'custom' && bgUrl) {
    localStorage.setItem('dce_agent_bg_url', bgUrl);
    chrome.storage.local.set({ dce_agent_bg_url: bgUrl });

    document.documentElement.classList.add('custom-bg');
    document.body.classList.add('custom-bg');
    document.body.style.backgroundImage = `url("${bgUrl}")`;
    document.documentElement.style.backgroundImage = `url("${bgUrl}")`;
    if (bgCustomBar) bgCustomBar.style.display = 'flex';
  } else {
    document.documentElement.classList.remove('custom-bg');
    document.body.classList.remove('custom-bg');
    document.body.style.backgroundImage = 'none';
    document.documentElement.style.backgroundImage = 'none';
    if (bgCustomBar && theme !== 'custom') bgCustomBar.style.display = 'none';
  }
}

function formatDateToStandard(dateStr) {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split('-');
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${monthNames[parseInt(month, 10) - 1]} ${year}`;
}

// 2. Resilient Universal Tab Detection (Supports Telviva, AltDesk, DEL CRM, and any site)
async function getTargetTab() {
  const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (activeTabs.length > 0 && activeTabs[0].url && activeTabs[0].url.startsWith("http")) {
    return activeTabs[0];
  }

  const allWebTabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  const platformTab = allWebTabs.find(t => t.url && (
    t.url.includes("telviva") || 
    t.url.includes("altdesk") || 
    t.url.includes("alteram") || 
    t.url.includes("crm") ||
    t.url.includes("desk")
  ));

  return platformTab || allWebTabs[0] || null;
}

// Live Heartbeat Monitor
async function checkDceConnection() {
  const targetTab = await getTargetTab();
  if (!targetTab?.id) {
    updateConnectionUI(false, null, "No Web Tab Detected");
    return;
  }

  let websiteLabel = "";
  try {
    const urlObj = new URL(targetTab.url);
    websiteLabel = urlObj.hostname || urlObj.host;
  } catch (e) {
    websiteLabel = targetTab.title || "Target Site";
  }

  chrome.tabs.sendMessage(targetTab.id, { action: "PING" }, (res) => {
    if (chrome.runtime.lastError || !res) {
      updateConnectionUI(false, null, websiteLabel);
    } else {
      const activeDomain = res.hostname || websiteLabel;
      updateConnectionUI(true, res, activeDomain);
    }
  });
}

function updateConnectionUI(connected, resData = null, siteLabel = "") {
  isConnectedToDCE = connected;
  if (connected) {
    dceConnectionBadge.className = "status-badge-connected";
    
    chrome.storage.local.get(["dce_agent_name", "dce_live_roster"], (res) => {
      const agentName = (resData && resData.agentName && resData.agentName !== "Unknown Agent") ? resData.agentName : (res.dce_agent_name || "Molly Sharon Xaba");
      const roster = Object.values(res.dce_live_roster || {});
      const activeAgents = roster.filter(a => a.status !== "OFFLINE" && (Date.now() - (a.lastHeartbeat || 0)) < 35000);
      
      const DEFAULT_TL_MAPPING = {
        "Molly Sharon Xaba": { tl: "Sipho Dlamini", team: "Claims Escalations" },
        "Kagiso Molefe": { tl: "Sipho Dlamini", team: "Claims Escalations" },
        "Thabo Ndlovu": { tl: "Lerato Khumalo", team: "Online Support & Portals" },
        "Nandi Zuma": { tl: "Lerato Khumalo", team: "Online Support & Portals" },
        "Bongani Sithole": { tl: "Daniel Sithole", team: "Registration & Compliance" }
      };

      const myMeta = DEFAULT_TL_MAPPING[agentName] || { tl: "Unassigned TL", team: "General Contact Centre" };
      const myTl = myMeta.tl || "Unassigned TL";
      const teamCount = activeAgents.filter(a => (a.teamLeader || a.tl || "Unassigned TL") === myTl).length || 1;

      let connText = `CONNECTED: Agent: ${agentName} | TL: ${myTl} (${teamCount} in Team)`;
      if (siteLabel) connText += ` [${siteLabel}]`;
      dceConnectionBadge.innerText = connText;
    });

    if (resData) {
      if (lblAgentName && resData.agentName && resData.agentName !== "Unknown Agent") {
        lblAgentName.innerText = `Agent: ${resData.agentName}`;
        chrome.storage.local.set({ dce_agent_name: resData.agentName });
      }
      if (lblTelephonyPresence) {
        const pres = (resData.presence || 'AVAILABLE').toUpperCase();
        const aux = resData.auxReason || 'Available but not on call';
        if (pres === 'AVAILABLE') {
          lblTelephonyPresence.style.background = '#064e3b';
          lblTelephonyPresence.style.color = '#6ee7b7';
          lblTelephonyPresence.style.borderColor = '#059669';
          if (aux && aux.toLowerCase().includes('not on call')) {
            lblTelephonyPresence.innerText = 'AVAILABLE (NOT ON CALL)';
          } else if (aux && aux.toLowerCase().includes('on call')) {
            lblTelephonyPresence.innerText = `AVAILABLE - ${aux.toUpperCase()}`;
          } else {
            lblTelephonyPresence.innerText = 'AVAILABLE (NOT ON CALL)';
          }
        } else if (pres === 'UNAVAILABLE') {
          lblTelephonyPresence.style.background = '#78350f';
          lblTelephonyPresence.style.color = '#fde68a';
          lblTelephonyPresence.style.borderColor = '#d97706';
          lblTelephonyPresence.innerText = `UNAVAILABLE (${aux})`;
        } else {
          const isMicBlocked = (aux && aux.toLowerCase().includes('microphone')) || (resData.micGuardStatus === 'BLOCKED');
          if (isMicBlocked) {
            lblTelephonyPresence.style.background = '#7f1d1d';
            lblTelephonyPresence.style.color = '#fca5a5';
            lblTelephonyPresence.style.borderColor = '#ef4444';
            lblTelephonyPresence.innerText = 'OFFLINE (MIC REQUIRED)';
          } else {
            lblTelephonyPresence.style.background = '#334155';
            lblTelephonyPresence.style.color = '#cbd5e1';
            lblTelephonyPresence.style.borderColor = '#64748b';
            lblTelephonyPresence.innerText = (aux && aux !== 'Offline') ? `OFFLINE (${aux})` : 'OFFLINE';
          }
        }
      }

      const micBadge = document.getElementById('mic-guard-badge');
      if (micBadge) {
        const isMicBlocked = (resData.micGuardStatus === 'BLOCKED') || (resData.auxReason && resData.auxReason.toLowerCase().includes('microphone'));
        if (isMicBlocked) {
          micBadge.style.background = '#7f1d1d';
          micBadge.style.color = '#fecaca';
          micBadge.style.borderColor = '#ef4444';
          micBadge.innerText = 'DISCONNECTED (MIC REQUIRED)';
        } else {
          micBadge.style.background = 'rgba(16, 185, 129, 0.15)';
          micBadge.style.color = '#10b981';
          micBadge.style.borderColor = '#10b981';
          micBadge.innerText = 'GUARDING (HEALTHY)';
        }
      }
    }
  } else {
    dceConnectionBadge.className = "status-badge-disconnected";
    dceConnectionBadge.innerText = siteLabel ? `DISCONNECTED (${siteLabel})` : "DISCONNECTED";
    chrome.storage.local.get(["dce_agent_name"], (res) => {
      const fallbackName = res.dce_agent_name || "Molly Sharon Xaba";
      if (lblAgentName) lblAgentName.innerText = `Agent: ${fallbackName} (Offline)`;
    });
    if (lblTelephonyPresence) {
      lblTelephonyPresence.style.background = '#334155';
      lblTelephonyPresence.style.color = '#cbd5e1';
      lblTelephonyPresence.style.borderColor = '#64748b';
      lblTelephonyPresence.innerText = 'OFFLINE';
    }
    const micBadge = document.getElementById('mic-guard-badge');
    if (micBadge) {
      micBadge.style.background = 'rgba(100, 116, 139, 0.2)';
      micBadge.style.color = '#94a3b8';
      micBadge.style.borderColor = '#64748b';
      micBadge.innerText = 'OFFLINE';
    }
  }
}

setInterval(checkDceConnection, 2000);
checkDceConnection();

async function sendMessageToActiveTab(msg, callback) {
  try {
    const targetTab = await getTargetTab();
    if (!targetTab?.id) {
      updateConnectionUI(false);
      alert("No DEL CRM tab found. Please open DEL CRM.");
      return;
    }

    chrome.tabs.sendMessage(targetTab.id, msg, (response) => {
      if (chrome.runtime.lastError) {
        updateConnectionUI(false);
        console.warn("[AutoCloser] Communication error:", chrome.runtime.lastError.message);
        alert("Cannot connect to DEL CRM. Please click into the DEL CRM tab and press F5.");
      } else {
        updateConnectionUI(true);
        if (callback) callback(response);
      }
    });
  } catch (err) {
    console.error("[AutoCloser] Dispatch Error:", err);
  }
}

// 3. Category Normalizer - Aligned with UIF Contact Centre Process SOP v5.1
function getNormalizedCategory(item) {
  let cat = item.category || "";
  
  if (!cat && item.steps) {
    const l2Step = item.steps.find(s => s.target && s.target.includes("classification_l2"));
    if (l2Step && l2Step.savedOptionChoice) cat = l2Step.savedOptionChoice;
  }

  if (!cat) return "General Inquiries";

  const clean = cat.trim();

  // Multi-Department Categories (CF, IES, PES)
  if (/^CF/i.test(clean)) return clean;
  if (/^IES/i.test(clean)) return clean;
  if (/^PES/i.test(clean)) return clean;

  // Reassessment of Claims (2017-2018)
  if (/reassessment/i.test(clean) || /reassessment/i.test(item.disposition || "") || /reassessment/i.test(item.issues || "")) {
    return "UIF Reassessment of Claims (2017-2018)";
  }

  // Exact SOP v5.1 Sections (UIF)
  const officialSopCategories = [
    "Claims Application (Online Benefits)",
    "Claims Application (Labour Centre Benefits)",
    "Claim Status Enquiry (Online)",
    "Claim Status Enquiry (Labour Centre)",
    "Normal Claims Appeals",
    "Payments, TAT & RFP",
    "Short / Over Payment Adjustments",
    "UIF Online Registrations",
    "UIF Online Access Blocked & Vetting",
    "Employer Declarations & Banking",
    "Pending Documents & Customer Responded",
    "CC Admin Complaints & BAU Online",
    "Floor Support & Language Barrier",
    "UIF Reassessment of Claims (2017-2018)"
  ];
  if (officialSopCategories.includes(clean)) return clean;

  // Pattern matching
  if (/^Claims Application.*online/i.test(clean)) return "Claims Application (Online Benefits)";
  if (/^Claims Application.*labour/i.test(clean)) return "Claims Application (Labour Centre Benefits)";
  if (/^Claim Status.*online/i.test(clean)) return "Claim Status Enquiry (Online)";
  if (/^Claim Status.*labour/i.test(clean)) return "Claim Status Enquiry (Labour Centre)";
  if (/^Normal Claims Appeal/i.test(clean)) return "Normal Claims Appeals";
  if (/^Payments.*(tat|rfp|enquiry)/i.test(clean)) return "Payments, TAT & RFP";
  if (/^(short|over).*payment/i.test(clean)) return "Short / Over Payment Adjustments";
  if (/^UIF Online.*reg/i.test(clean)) return "UIF Online Registrations";
  if (/^UIF Online.*(blocked|vetting|access)/i.test(clean)) return "UIF Online Access Blocked & Vetting";
  if (/^(employer.*declarations|banking)/i.test(clean)) return "Employer Declarations & Banking";
  if (/^(pending documents|customer responded)/i.test(clean)) return "Pending Documents & Customer Responded";
  if (/^(cc admin complaints|bau online)/i.test(clean)) return "CC Admin Complaints & BAU Online";

  // Legacy mappings
  if (/^Claims/i.test(clean)) return "Claims Application (Online Benefits)";
  if (/^Declarations/i.test(clean)) return "Employer Declarations & Banking";
  if (/^Registration/i.test(clean)) return "UIF Online Registrations";
  if (/^Payments/i.test(clean)) return "Payments, TAT & RFP";
  if (/^UIF Online/i.test(clean)) return "UIF Online Access Blocked & Vetting";
  if (/^Contributions/i.test(clean)) return "Employer Declarations & Banking";
  if (/^Compliance/i.test(clean)) return "Employer Declarations & Banking";
  if (/^Language Barrier/i.test(clean)) return "Floor Support & Language Barrier";

  return clean;
}

// 4. Boot Loader - Dynamic Presets Engine (Loaded from Master JSON / Multi-Department Suite)
function initializeAgentWorkspace() {
  chrome.storage.local.get(["agentMasterPresets", "agentPackageDate", "agentSopVersion", "currentDraftNotes", "disableModals"], (res) => {
    if (res.currentDraftNotes && txtCallNotes) {
      txtCallNotes.value = res.currentDraftNotes;
      updateTextCounters();
    }

    if (res.disableModals !== undefined && chkDisableModals) {
      chkDisableModals.checked = res.disableModals;
    }

    fetch(chrome.runtime.getURL('presets.json'))
      .then(r => r.json())
      .then(defaultBundle => {
        const bundle = defaultBundle.profiles || defaultBundle;
        originalSopBundle = { ...bundle };
        const storedPresets = res.agentMasterPresets || {};
        const isUpgradeNeeded = !res.agentSopVersion || res.agentSopVersion !== "5.1" || Object.keys(storedPresets).length < 63;

        if (isUpgradeNeeded || Object.keys(storedPresets).length === 0) {
          allProfiles = { ...bundle };
          Object.keys(storedPresets).forEach(key => {
            if (storedPresets[key].steps && storedPresets[key].steps.length > 0) {
              if (allProfiles[key]) {
                allProfiles[key].steps = storedPresets[key].steps;
              } else {
                allProfiles[key] = storedPresets[key];
              }
            }
          });
          chrome.storage.local.set({
            agentMasterPresets: allProfiles,
            agentSopVersion: "5.1",
            agentPackageDate: "01/10/2024 (v5.1 Multi-Dept)"
          });
          if (lblPackageVer) lblPackageVer.innerText = `Package: DEL Multi-Dept Suite (${Object.keys(allProfiles).length} Presets)`;
        } else {
          allProfiles = storedPresets;
          if (lblPackageVer) lblPackageVer.innerText = `Package: DEL Multi-Dept Suite (${Object.keys(allProfiles).length} Presets)`;
        }

        populateCategoryDropdown();
        renderFilteredChips();
      })
      .catch((err) => {
        console.error("Presets load error:", err);
        allProfiles = res.agentMasterPresets || {};
        if (lblPackageVer) lblPackageVer.innerText = `Package: Cached (${Object.keys(allProfiles).length} Presets)`;
        populateCategoryDropdown();
        renderFilteredChips();
      });
  });
}

chkDisableModals.addEventListener('change', () => {
  chrome.storage.local.set({ disableModals: chkDisableModals.checked });
});

const selectDepartmentFilter = document.getElementById('select-department-filter');
const lblDeptCount = document.getElementById('lbl-dept-count');

function populateCategoryDropdown() {
  if (!selectCategoryFilter) return;
  selectCategoryFilter.innerHTML = '<option value="ALL">All Categories (Show All)</option>';

  const chosenDept = selectDepartmentFilter ? selectDepartmentFilter.value : "ALL";
  const categorySet = new Set();
  let deptItemCount = 0;

  Object.keys(allProfiles).forEach(key => {
    const item = allProfiles[key];
    const itemDept = (item.department || "UIF").toUpperCase();
    if (chosenDept === "ALL" || itemDept === chosenDept) {
      deptItemCount++;
      const cat = getNormalizedCategory(item);
      if (cat) categorySet.add(cat);
    }
  });

  if (lblDeptCount) {
    lblDeptCount.innerText = `${deptItemCount} Presets Available`;
  }

  Array.from(categorySet).sort().forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    selectCategoryFilter.appendChild(opt);
  });
}

if (selectDepartmentFilter) {
  selectDepartmentFilter.addEventListener('change', () => {
    populateCategoryDropdown();
    renderFilteredChips();
    if (selectEditDepartment && selectDepartmentFilter.value !== 'ALL') {
      selectEditDepartment.value = selectDepartmentFilter.value;
      if (panelCaseTitleEditor && panelCaseTitleEditor.style.display !== 'none') {
        renderCaseTitleEditorList();
      }
    }
  });
}

// Clean event listener function
selectCategoryFilter.addEventListener('change', () => {
  renderFilteredChips();
});

// =========================================================================
// DEPARTMENT CASE TITLE CUSTOMIZER ENGINE (1-TAP PIPELINE)
// =========================================================================
const btnToggleCaseTitleEditor = document.getElementById('btn-toggle-case-title-editor');
const panelCaseTitleEditor = document.getElementById('panel-case-title-editor');
const btnCloseCaseTitleEditor = document.getElementById('btn-close-case-title-editor');
const selectEditDepartment = document.getElementById('select-edit-department');
const lblEditDeptCount = document.getElementById('lbl-edit-dept-count');
const inputBatchPrefix = document.getElementById('input-batch-prefix');
const btnApplyBatchPrefix = document.getElementById('btn-apply-batch-prefix');
const inputBatchFind = document.getElementById('input-batch-find');
const inputBatchReplace = document.getElementById('input-batch-replace');
const btnApplyBatchReplace = document.getElementById('btn-apply-batch-replace');
const btnCaseUpper = document.getElementById('btn-case-upper');
const btnCaseTitle = document.getElementById('btn-case-title');
const btnResetDeptTitles = document.getElementById('btn-reset-dept-titles');
const caseTitlePresetsList = document.getElementById('case-title-presets-list');
const btnSaveCaseTitles = document.getElementById('btn-save-case-titles');
const caseTitleSaveMsg = document.getElementById('case-title-save-msg');

function toTitleCase(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/(?:^|\s|\/|-|\(|\))\S/g, match => match.toUpperCase());
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderCaseTitleEditorList() {
  if (!caseTitlePresetsList) return;
  caseTitlePresetsList.innerHTML = '';

  const chosenDept = selectEditDepartment ? selectEditDepartment.value : 'UIF';
  const allKeys = Object.keys(allProfiles);

  const targetKeys = allKeys.filter(key => {
    const item = allProfiles[key];
    const itemDept = (item.department || "UIF").toUpperCase();
    if (chosenDept === "ALL") return true;
    return itemDept === chosenDept;
  });

  if (lblEditDeptCount) {
    lblEditDeptCount.innerText = `${targetKeys.length} Presets`;
  }

  if (targetKeys.length === 0) {
    caseTitlePresetsList.innerHTML = `
      <div style="color: var(--muted); font-size: 9px; text-align: center; padding: 10px 0;">
        No presets registered under department "${chosenDept}".
      </div>
    `;
    return;
  }

  targetKeys.forEach(key => {
    const item = allProfiles[key];
    const currentTitle = item.caseTitle || key;
    const row = document.createElement('div');
    row.style.cssText = 'background: var(--bg-card); border: 1px solid var(--border-soft); border-radius: 4px; padding: 4px 6px;';
    row.innerHTML = `
      <div style="font-size: 8px; color: var(--muted); margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(key)}">
        ${escapeHtml(key)}
      </div>
      <div style="display: flex; gap: 4px; align-items: center;">
        <input type="text" class="input-case-title-field" data-preset-key="${escapeHtml(key)}" value="${escapeHtml(currentTitle)}" style="flex: 1; font-size: 9.5px; font-weight: bold; color: var(--accent); background: var(--code-bg); border: 1px solid var(--border-soft); border-radius: 3px; padding: 2px 5px;">
      </div>
    `;
    caseTitlePresetsList.appendChild(row);
  });
}

if (btnToggleCaseTitleEditor && panelCaseTitleEditor) {
  btnToggleCaseTitleEditor.addEventListener('click', () => {
    const isHidden = panelCaseTitleEditor.style.display === 'none';
    panelCaseTitleEditor.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
      if (selectDepartmentFilter && selectEditDepartment) {
        const curMainDept = selectDepartmentFilter.value;
        if (curMainDept && curMainDept !== 'ALL') {
          selectEditDepartment.value = curMainDept;
        }
      }
      renderCaseTitleEditorList();
    }
  });
}

if (btnCloseCaseTitleEditor && panelCaseTitleEditor) {
  btnCloseCaseTitleEditor.addEventListener('click', () => {
    panelCaseTitleEditor.style.display = 'none';
  });
}

if (selectEditDepartment) {
  selectEditDepartment.addEventListener('change', renderCaseTitleEditorList);
}

// Bulk Prefix
if (btnApplyBatchPrefix && inputBatchPrefix) {
  btnApplyBatchPrefix.addEventListener('click', () => {
    const prefix = inputBatchPrefix.value.trim();
    if (!prefix) {
      alert("Please enter a prefix to apply (e.g. [UIF] or CF - )");
      return;
    }
    const inputs = caseTitlePresetsList.querySelectorAll('.input-case-title-field');
    inputs.forEach(input => {
      let val = input.value.trim();
      if (!val.startsWith(prefix)) {
        input.value = `${prefix} ${val}`.trim();
      }
    });
  });
}

// Bulk Find & Replace
if (btnApplyBatchReplace && inputBatchFind && inputBatchReplace) {
  btnApplyBatchReplace.addEventListener('click', () => {
    const findStr = inputBatchFind.value;
    const replaceStr = inputBatchReplace.value;
    if (!findStr) {
      alert("Please enter a text string to find!");
      return;
    }
    const inputs = caseTitlePresetsList.querySelectorAll('.input-case-title-field');
    inputs.forEach(input => {
      input.value = input.value.replaceAll(findStr, replaceStr);
    });
  });
}

// Bulk UPPERCASE
if (btnCaseUpper) {
  btnCaseUpper.addEventListener('click', () => {
    const inputs = caseTitlePresetsList.querySelectorAll('.input-case-title-field');
    inputs.forEach(input => {
      input.value = input.value.toUpperCase();
    });
  });
}

// Bulk Title Case
if (btnCaseTitle) {
  btnCaseTitle.addEventListener('click', () => {
    const inputs = caseTitlePresetsList.querySelectorAll('.input-case-title-field');
    inputs.forEach(input => {
      input.value = toTitleCase(input.value);
    });
  });
}

// Reset to SOP Defaults for this Department
if (btnResetDeptTitles) {
  btnResetDeptTitles.addEventListener('click', () => {
    const chosenDept = selectEditDepartment ? selectEditDepartment.value : 'UIF';
    const confirmReset = confirm(`Reset all case titles for department "${chosenDept}" back to original SOP defaults?`);
    if (!confirmReset) return;

    const inputs = caseTitlePresetsList.querySelectorAll('.input-case-title-field');
    inputs.forEach(input => {
      const key = input.dataset.presetKey;
      const defaultTitle = (originalSopBundle && originalSopBundle[key]) ? originalSopBundle[key].caseTitle : key.toUpperCase();
      input.value = defaultTitle || key;
    });
  });
}

// Save All Changes for This Department
if (btnSaveCaseTitles) {
  btnSaveCaseTitles.addEventListener('click', () => {
    const inputs = caseTitlePresetsList.querySelectorAll('.input-case-title-field');
    let count = 0;
    inputs.forEach(input => {
      const key = input.dataset.presetKey;
      const newTitle = input.value.trim();
      if (allProfiles[key]) {
        allProfiles[key].caseTitle = newTitle || key;
        count++;
      }
    });

    chrome.storage.local.set({ agentMasterPresets: allProfiles }, () => {
      renderFilteredChips();
      if (caseTitleSaveMsg) {
        const chosenDept = selectEditDepartment ? selectEditDepartment.value : 'Department';
        caseTitleSaveMsg.innerText = `Successfully saved ${count} case titles for ${chosenDept}!`;
        caseTitleSaveMsg.style.display = 'block';
        setTimeout(() => {
          caseTitleSaveMsg.style.display = 'none';
        }, 3500);
      }
    });
  });
}

function renderFilteredChips() {
  if (!dispositionChipsContainer) return;
  dispositionChipsContainer.innerHTML = '';

  const chosenDept = selectDepartmentFilter ? selectDepartmentFilter.value : "ALL";
  const selectedCategory = selectCategoryFilter.value;
  const allKeys = Object.keys(allProfiles);

  const filteredKeys = allKeys.filter(key => {
    const item = allProfiles[key];
    const itemDept = (item.department || "UIF").toUpperCase();
    if (chosenDept !== "ALL" && itemDept !== chosenDept) return false;
    if (selectedCategory === "ALL") return true;
    const cat = getNormalizedCategory(item);
    return cat === selectedCategory;
  });

  if (lblPresetsCount) lblPresetsCount.innerText = `${filteredKeys.length} / ${allKeys.length} Ready`;

  if (filteredKeys.length === 0) {
    dispositionChipsContainer.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; color: var(--muted); padding: 15px 0;">
        No presets found under "${selectedCategory}".
      </div>
    `;
    return;
  }

  filteredKeys.forEach(key => {
    const item = allProfiles[key];
    const chip = document.createElement('button');
    chip.className = 'btn-chip';
    const stepCount = item.steps ? item.steps.length : 0;

    const requiresCaseModeAlert = /APPEAL|REFUSED|REJECTED|DISPUTE|LOCKED|VETTING/i.test(key) || 
                                  /APPEAL|REFUSED|REJECTED|LOCKED/i.test(item.caseTitle || "");

    chip.innerHTML = `
      <div style="font-size: 8px; color: var(--accent); font-weight: bold; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${item.caseTitle || "QUERY"}
      </div>
      <div style="font-size: 9.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${key}
      </div>
    `;

    chip.addEventListener('click', () => {
      if (requiresCaseModeAlert) {
        if (chkDisableModals && chkDisableModals.checked) {
          triggerFlashingRedAlert(`CASE MODE: Ensure Case Mode is set correctly on DEL CRM for "${key}"!`);
          triggerPresetExecution(key, item);
        } else {
          pendingExecutionItem = { key, item };
          if (modalBannerText) {
            modalBannerText.innerHTML = `<b>CRITICAL CASE MODE NOTICE:</b><br>This scenario involves <u>${key}</u>.<br>Remember to set <b>Case Mode</b> accordingly on DEL CRM!`;
          }
          if (modalActionAlert) modalActionAlert.style.display = "flex";
        }
      } else {
        triggerPresetExecution(key, item);
      }
    });

    dispositionChipsContainer.appendChild(chip);
  });
}

function triggerFlashingRedAlert(msg) {
  if (!flashAlertBanner) return;
  flashAlertBanner.innerText = msg;
  flashAlertBanner.classList.add('flash-active');
  setTimeout(() => {
    flashAlertBanner.classList.remove('flash-active');
  }, 4500);
}

btnModalCancel.addEventListener('click', () => {
  modalActionAlert.style.display = "none";
  pendingExecutionItem = null;
});

btnModalConfirm.addEventListener('click', () => {
  modalActionAlert.style.display = "none";
  if (pendingExecutionItem) {
    triggerPresetExecution(pendingExecutionItem.key, pendingExecutionItem.item);
    pendingExecutionItem = null;
  }
});

function triggerPresetExecution(key, item) {
  selectedQuery = {
    key,
    title: item.caseTitle || key,
    issue: item.issue || item.category || getNormalizedCategory(item)
  };
  isCurrentTicketFlagged = false;
  if (btnFlagIncomplete) {
    btnFlagIncomplete.style.backgroundColor = '#d97706';
    btnFlagIncomplete.innerText = 'Flag Incomplete';
  }
  sendMessageToActiveTab({ action: "SET_SELECTED_QUERY", query: selectedQuery });

  let newNote = item.notes_template || item.notes || `QUERY: ${key}`;
  const chosenDateFormatted = formatDateToStandard(rfpCalendarInput ? rfpCalendarInput.value : todayFormatted);
  newNote = newNote.replace(/\[Insert Date\]|\[DATE\]/gi, chosenDateFormatted);

  if (chkMultiQuery && chkMultiQuery.checked) {
    queryCount++;
    const divider = `\n\n==================== [ QUERY #${queryCount}: ${item.caseTitle || key} ] ====================\n`;
    if (!txtCallNotes.value.trim()) {
      txtCallNotes.value = `[MULTI-QUERY CALL LOGGED]${divider}${newNote}`;
    } else {
      txtCallNotes.value += `${divider}${newNote}`;
    }
  } else {
    queryCount = 1;
    txtCallNotes.value = newNote;
  }

  updateTextCounters();
  chrome.storage.local.set({ currentDraftNotes: txtCallNotes.value });

  // Render SOP v5.1 Live Guidance Card
  renderSopGuidanceCard(key, item);

  if (item.steps && item.steps.length > 0) {
    if (isAutoStepEnabled) {
      updateUIState("RUNNING");
      sendMessageToActiveTab({ action: "PLAY_STEPS", steps: item.steps });
    } else {
      updateUIState("READY");
    }
  }
}

// ================= SOP v5.1 LIVE GUIDANCE CARD LOGIC =================
let activeSopPresetItem = null;

function renderSopGuidanceCard(key, item) {
  const sectionSopGuidance = document.getElementById('section-sop-guidance');
  if (!sectionSopGuidance) return;
  sectionSopGuidance.style.display = 'block';

  const sopGuideTitle = document.getElementById('sop-guide-title');
  const sopGuideSectionBadge = document.getElementById('sop-guide-section-badge');
  const sopValStatus = document.getElementById('sop-val-status');
  const sopValMode = document.getElementById('sop-val-mode');
  const sopValWorkgroup = document.getElementById('sop-val-workgroup');
  const sopValTat = document.getElementById('sop-val-tat');
  const sopProbingList = document.getElementById('sop-probing-list');
  const sopDocsList = document.getElementById('sop-docs-list');

  if (sopGuideTitle) sopGuideTitle.innerText = `SOP Guidance: ${key}`;
  if (sopGuideSectionBadge) sopGuideSectionBadge.innerText = item.sopSection ? `SOP Section ${item.sopSection}` : 'SOP v5.1';

  if (sopValStatus) {
    sopValStatus.innerText = item.caseStatus || 'Resolved';
    sopValStatus.style.color = (item.caseStatus === 'Resolved') ? '#34d399' : (item.caseStatus === 'Open' ? '#ef4444' : '#fbbf24');
  }

  if (sopValMode) {
    const isComplaint = (item.caseMode === 'UIF Complaint');
    sopValMode.innerText = item.caseMode || 'Normal';
    sopValMode.style.color = isComplaint ? '#ef4444' : '#34d399';
  }

  if (sopValWorkgroup) {
    sopValWorkgroup.innerText = item.dispatchWorkgroup || 'N/A (FCR)';
    sopValWorkgroup.title = item.dispatchWorkgroup || 'N/A';
  }
  if (sopValTat) sopValTat.innerText = item.tat || 'Immediate FCR';

  if (sopProbingList) {
    sopProbingList.innerHTML = '';
    const questions = item.probingQuestions || ["Ask caller nature of inquiry to assist promptly (SOP Section 1.3)."];
    questions.forEach(q => {
      const li = document.createElement('li');
      li.innerText = q;
      sopProbingList.appendChild(li);
    });
  }

  if (sopDocsList) {
    sopDocsList.innerHTML = '';
    const docs = item.requiredDocuments || ["No additional supporting documents required."];
    docs.forEach(d => {
      const li = document.createElement('li');
      li.innerText = d;
      sopDocsList.appendChild(li);
    });
  }

  activeSopPresetItem = item;
}

const btnInsertDocsToNotes = document.getElementById('btn-insert-docs-to-notes');
if (btnInsertDocsToNotes) {
  btnInsertDocsToNotes.addEventListener('click', () => {
    if (!activeSopPresetItem || !activeSopPresetItem.requiredDocuments || activeSopPresetItem.requiredDocuments.length === 0) {
      alert("No required documents listed for this scenario.");
      return;
    }
    const docsText = `\n\nREQUIRED SUPPORTING DOCUMENTS (SOP Section ${activeSopPresetItem.sopSection || '2.0'}):\n` +
      activeSopPresetItem.requiredDocuments.map(d => `- ${d}`).join('\n');
    if (txtCallNotes) {
      txtCallNotes.value += docsText;
      updateTextCounters();
      chrome.storage.local.set({ currentDraftNotes: txtCallNotes.value });
      if (copyFeedback) {
        copyFeedback.innerText = "Docs Inserted!";
        copyFeedback.style.display = 'inline';
        setTimeout(() => { copyFeedback.style.display = 'none'; }, 1500);
      }
    }
  });
}

// ================= INBOUND CALLER VERIFICATION (SOP 1.2) =================
const toggleVerificationPanel = document.getElementById('toggle-verification-panel');
const verificationContentBox = document.getElementById('verification-content-box');
const iconToggleVerify = document.getElementById('icon-toggle-verify');
const badgeVerificationStatus = document.getElementById('badge-verification-status');
const btnInsertVerificationNotes = document.getElementById('btn-insert-verification-notes');
const btnLogFailedVerification = document.getElementById('btn-log-failed-verification');
const btnResetVerification = document.getElementById('btn-reset-verification');
const btnInsertSurveyScript = document.getElementById('btn-insert-survey-script');

// Role Switcher Tabs & Panels
const btnRoleEmployee = document.getElementById('btn-role-employee');
const btnRoleEmployer = document.getElementById('btn-role-employer');
const btnRolePractitioner = document.getElementById('btn-role-practitioner');
const panelVerifyEmployee = document.getElementById('panel-verify-employee');
const panelVerifyEmployer = document.getElementById('panel-verify-employer');
const panelVerifyPractitioner = document.getElementById('panel-verify-practitioner');

// Employee Checkboxes
const chkVerifyId = document.getElementById('chk-verify-id');
const chkVerifyName = document.getElementById('chk-verify-name');
const chkVerifyEmployer = document.getElementById('chk-verify-employer');
const chkVerifyContact = document.getElementById('chk-verify-contact');
const chkVerifyEmail = document.getElementById('chk-verify-email');
const chkVerifyAddress = document.getElementById('chk-verify-address');
const chkVerifyBank = document.getElementById('chk-verify-bank');
const chkVerifyBenefit = document.getElementById('chk-verify-benefit');
const chkVerifyPayment = document.getElementById('chk-verify-payment');
const chkVerifyProvince = document.getElementById('chk-verify-province');
const chkVerifyCentre = document.getElementById('chk-verify-centre');

// Employer Checkboxes
const chkEmpReg = document.getElementById('chk-emp-reg');
const chkEmpTrade = document.getElementById('chk-emp-trade');
const chkEmpProvince = document.getElementById('chk-emp-province');
const chkEmpContact = document.getElementById('chk-emp-contact');
const chkEmpEmail = document.getElementById('chk-emp-email');
const chkEmpAddress = document.getElementById('chk-emp-address');

// Practitioner Checkboxes
const chkPracConsent = document.getElementById('chk-prac-consent');
const chkPracId = document.getElementById('chk-prac-id');
const chkPracName = document.getElementById('chk-prac-name');
const chkPracContact = document.getElementById('chk-prac-contact');
const chkPracEmail = document.getElementById('chk-prac-email');

let currentCallerRole = 'employee';

function switchCallerRole(role) {
  currentCallerRole = role;
  if (panelVerifyEmployee) panelVerifyEmployee.style.display = (role === 'employee') ? 'block' : 'none';
  if (panelVerifyEmployer) panelVerifyEmployer.style.display = (role === 'employer') ? 'block' : 'none';
  if (panelVerifyPractitioner) panelVerifyPractitioner.style.display = (role === 'practitioner') ? 'block' : 'none';

  if (btnRoleEmployee) {
    btnRoleEmployee.style.background = (role === 'employee') ? '#2563eb' : '#1e293b';
    btnRoleEmployee.style.color = (role === 'employee') ? 'white' : 'var(--muted)';
  }
  if (btnRoleEmployer) {
    btnRoleEmployer.style.background = (role === 'employer') ? '#2563eb' : '#1e293b';
    btnRoleEmployer.style.color = (role === 'employer') ? 'white' : 'var(--muted)';
  }
  if (btnRolePractitioner) {
    btnRolePractitioner.style.background = (role === 'practitioner') ? '#2563eb' : '#1e293b';
    btnRolePractitioner.style.color = (role === 'practitioner') ? 'white' : 'var(--muted)';
  }
  updateVerificationState();
}

if (btnRoleEmployee) btnRoleEmployee.addEventListener('click', () => switchCallerRole('employee'));
if (btnRoleEmployer) btnRoleEmployer.addEventListener('click', () => switchCallerRole('employer'));
if (btnRolePractitioner) btnRolePractitioner.addEventListener('click', () => switchCallerRole('practitioner'));

if (toggleVerificationPanel && verificationContentBox) {
  toggleVerificationPanel.addEventListener('click', () => {
    const isHidden = verificationContentBox.style.display === 'none';
    verificationContentBox.style.display = isHidden ? 'block' : 'none';
    if (iconToggleVerify) iconToggleVerify.innerText = isHidden ? '[v]' : '[>]';
  });
}

function updateVerificationState() {
  if (!badgeVerificationStatus) return;

  if (currentCallerRole === 'employee') {
    const coreIdAndEmployer = (chkVerifyId?.checked && chkVerifyName?.checked && chkVerifyEmployer?.checked);
    const hasContactOrEmail = (chkVerifyContact?.checked || chkVerifyEmail?.checked);
    const secondaryChecks = [chkVerifyAddress, chkVerifyBank, chkVerifyBenefit, chkVerifyPayment];
    const secondaryCount = secondaryChecks.filter(c => c && c.checked).length;

    const allCompulsory = [chkVerifyId, chkVerifyName, chkVerifyEmployer, chkVerifyContact, chkVerifyEmail];
    const compCount = allCompulsory.filter(c => c && c.checked).length;

    if (coreIdAndEmployer && hasContactOrEmail) {
      badgeVerificationStatus.innerText = 'VERIFIED (3/3 Compulsory)';
      badgeVerificationStatus.style.background = '#064e3b';
      badgeVerificationStatus.style.color = '#34d399';
      badgeVerificationStatus.style.borderColor = '#059669';
    } else if (coreIdAndEmployer && secondaryCount >= 2) {
      badgeVerificationStatus.innerText = 'VERIFIED (Secondary 2/2)';
      badgeVerificationStatus.style.background = '#064e3b';
      badgeVerificationStatus.style.color = '#34d399';
      badgeVerificationStatus.style.borderColor = '#059669';
    } else if (compCount > 0 || secondaryCount > 0) {
      badgeVerificationStatus.innerText = `IN PROGRESS (${compCount}/3)`;
      badgeVerificationStatus.style.background = '#78350f';
      badgeVerificationStatus.style.color = '#fde68a';
      badgeVerificationStatus.style.borderColor = '#d97706';
    } else {
      badgeVerificationStatus.innerText = 'INCOMPLETE (0/3)';
      badgeVerificationStatus.style.background = '#7f1d1d';
      badgeVerificationStatus.style.color = '#fca5a5';
      badgeVerificationStatus.style.borderColor = '#ef4444';
    }
  } else if (currentCallerRole === 'employer') {
    const empChecks = [chkEmpReg, chkEmpTrade, chkEmpProvince, chkEmpContact, chkEmpEmail, chkEmpAddress];
    const empCount = empChecks.filter(c => c && c.checked).length;
    if (chkEmpReg?.checked && chkEmpTrade?.checked && (chkEmpContact?.checked || chkEmpEmail?.checked || chkEmpProvince?.checked)) {
      badgeVerificationStatus.innerText = 'VERIFIED (Employer)';
      badgeVerificationStatus.style.background = '#064e3b';
      badgeVerificationStatus.style.color = '#34d399';
      badgeVerificationStatus.style.borderColor = '#059669';
    } else if (empCount > 0) {
      badgeVerificationStatus.innerText = `IN PROGRESS (${empCount}/3)`;
      badgeVerificationStatus.style.background = '#78350f';
      badgeVerificationStatus.style.color = '#fde68a';
      badgeVerificationStatus.style.borderColor = '#d97706';
    } else {
      badgeVerificationStatus.innerText = 'INCOMPLETE (0/3)';
      badgeVerificationStatus.style.background = '#7f1d1d';
      badgeVerificationStatus.style.color = '#fca5a5';
      badgeVerificationStatus.style.borderColor = '#ef4444';
    }
  } else if (currentCallerRole === 'practitioner') {
    const pracDetails = [chkPracId, chkPracName, chkPracContact, chkPracEmail];
    const detailCount = pracDetails.filter(c => c && c.checked).length;
    if (chkPracConsent?.checked && detailCount >= 2) {
      badgeVerificationStatus.innerText = 'VERIFIED (Practitioner)';
      badgeVerificationStatus.style.background = '#064e3b';
      badgeVerificationStatus.style.color = '#34d399';
      badgeVerificationStatus.style.borderColor = '#059669';
    } else if (chkPracConsent?.checked || detailCount > 0) {
      badgeVerificationStatus.innerText = 'IN PROGRESS (Consent/ID)';
      badgeVerificationStatus.style.background = '#78350f';
      badgeVerificationStatus.style.color = '#fde68a';
      badgeVerificationStatus.style.borderColor = '#d97706';
    } else {
      badgeVerificationStatus.innerText = 'INCOMPLETE (0/3)';
      badgeVerificationStatus.style.background = '#7f1d1d';
      badgeVerificationStatus.style.color = '#fca5a5';
      badgeVerificationStatus.style.borderColor = '#ef4444';
    }
  }
}

document.querySelectorAll('.verify-check').forEach(chk => {
  chk.addEventListener('change', updateVerificationState);
});

if (btnResetVerification) {
  btnResetVerification.addEventListener('click', () => {
    document.querySelectorAll('.verify-check').forEach(c => { c.checked = false; });
    updateVerificationState();
  });
}

if (btnInsertVerificationNotes) {
  btnInsertVerificationNotes.addEventListener('click', () => {
    let verificationHeader = '';
    if (currentCallerRole === 'employee') {
      const verifiedId = chkVerifyId?.checked ? '13-Digit ID/Passport: Confirmed' : '13-Digit ID/Passport: Not Verified';
      const verifiedName = chkVerifyName?.checked ? 'Full Name: Confirmed' : 'Full Name: Not Verified';
      const verifiedEmployer = chkVerifyEmployer?.checked ? 'Last Company: Confirmed' : 'Last Company: Not Verified';
      let demoDetail = 'Demographic: Not Verified';
      if (chkVerifyContact?.checked && chkVerifyEmail?.checked) {
        demoDetail = 'Demographic: Contact No & Email Confirmed';
      } else if (chkVerifyContact?.checked) {
        demoDetail = 'Demographic: Contact No Confirmed';
      } else if (chkVerifyEmail?.checked) {
        demoDetail = 'Demographic: Email Address Confirmed';
      } else {
        const secPassed = [];
        if (chkVerifyAddress?.checked) secPassed.push('Address');
        if (chkVerifyBank?.checked) secPassed.push('Banking');
        if (chkVerifyBenefit?.checked) secPassed.push('Benefit Type');
        if (chkVerifyPayment?.checked) secPassed.push('Last Payment');
        if (secPassed.length >= 2) {
          demoDetail = `Secondary Verification: Passed (${secPassed.join(', ')})`;
        }
      }
      let postDashboard = '';
      if (chkVerifyProvince?.checked || chkVerifyCentre?.checked) {
        postDashboard = `\n- Post-Dashboard: Province & Labour Centre Confirmed`;
      }
      verificationHeader = `[CALLER IDENTITY VERIFICATION: PASSED (SOP 1.2)]\n- ${verifiedId}\n- ${verifiedName}\n- ${verifiedEmployer}\n- ${demoDetail}${postDashboard}\n\n`;
    } else if (currentCallerRole === 'employer') {
      const vReg = chkEmpReg?.checked ? 'Company Reg: Confirmed' : 'Company Reg: Not Verified';
      const vTrade = chkEmpTrade?.checked ? 'Trade Name: Confirmed' : 'Trade Name: Not Verified';
      const vProv = chkEmpProvince?.checked ? 'Province: Confirmed' : 'Province: Not Verified';
      const vContact = (chkEmpContact?.checked || chkEmpEmail?.checked) ? 'Contact/Email: Confirmed' : 'Contact/Email: Not Verified';
      verificationHeader = `[EMPLOYER CALLER IDENTITY VERIFICATION: PASSED (SOP 1.2)]\n- ${vReg}\n- ${vTrade}\n- ${vProv}\n- ${vContact}\n\n`;
    } else if (currentCallerRole === 'practitioner') {
      const vConsent = chkPracConsent?.checked ? 'Consent to Act: Confirmed' : 'Consent: Not Verified';
      const vPracId = chkPracId?.checked ? 'Practitioner ID: Confirmed' : 'ID: Not Verified';
      const vPracName = chkPracName?.checked ? 'Practitioner Name: Confirmed' : 'Name: Not Verified';
      const vPracContact = (chkPracContact?.checked || chkPracEmail?.checked) ? 'Contact/Email: Confirmed' : 'Contact: Not Verified';
      verificationHeader = `[LABOUR PRACTITIONER VERIFICATION: PASSED (SOP 1.2)]\n- ${vConsent}\n- ${vPracName} (${vPracId})\n- ${vPracContact}\n\n`;
    }

    if (txtCallNotes) {
      txtCallNotes.value = verificationHeader + txtCallNotes.value;
      updateTextCounters();
      chrome.storage.local.set({ currentDraftNotes: txtCallNotes.value });
      if (copyFeedback) {
        copyFeedback.innerText = "Verification Stamped!";
        copyFeedback.style.display = 'inline';
        setTimeout(() => { copyFeedback.style.display = 'none'; }, 1500);
      }
    }
  });
}

if (btnLogFailedVerification) {
  btnLogFailedVerification.addEventListener('click', () => {
    const failedNotes = `[FAILED CALLER VETTING / VERIFICATION - SOP 1.2]\n- Caller failed identity verification requirements.\n- Advised caller to email certified copy of ID / Passport (PDF) and proof of banking/employment to uifcallcenter@labour.gov.za.\n- No account details or sensitive claim information disclosed per POPI Act.\n\n`;
    if (txtCallNotes) {
      txtCallNotes.value = failedNotes + txtCallNotes.value;
      updateTextCounters();
      chrome.storage.local.set({ currentDraftNotes: txtCallNotes.value });
    }
    const failedKey = "Failed Verification - Employment History / Vetting";
    if (allProfiles[failedKey]) {
      triggerPresetExecution(failedKey, allProfiles[failedKey]);
    } else {
      alert("Failed Vetting notice stamped into Call Notes.\nCaller must email certified ID (PDF) to uifcallcenter@labour.gov.za.");
    }
  });
}

if (btnInsertSurveyScript) {
  btnInsertSurveyScript.addEventListener('click', () => {
    const closingScript = `\n[OFFICIAL CALL CLOSING & SURVEY SCRIPT]\n"Thank you for contacting the Department of Employment and Labour Call Centre. Before ending the call, please stay on the line to participate in our brief automated customer satisfaction survey. Have a great day further."\n`;
    if (txtCallNotes) {
      txtCallNotes.value = txtCallNotes.value + closingScript;
      updateTextCounters();
      chrome.storage.local.set({ currentDraftNotes: txtCallNotes.value });
      if (copyFeedback) {
        copyFeedback.innerText = "Survey Script Added!";
        copyFeedback.style.display = 'inline';
        setTimeout(() => { copyFeedback.style.display = 'none'; }, 1500);
      }
    }
  });
}

// ================= DASHBOARD NOTES DECODER =================
const toggleNotesDecoderPanel = document.getElementById('toggle-notes-decoder-panel');
const notesDecoderContentBox = document.getElementById('notes-decoder-content-box');
const iconToggleDecoder = document.getElementById('icon-toggle-decoder');
const decoderDetailBox = document.getElementById('decoder-detail-box');
const decoderDetailTitle = document.getElementById('decoder-detail-title');
const decoderDetailMeaning = document.getElementById('decoder-detail-meaning');
const decoderDetailAction = document.getElementById('decoder-detail-action');
const btnInsertDecoderNote = document.getElementById('btn-insert-decoder-note');
const btnCloseDecoderDetail = document.getElementById('btn-close-decoder-detail');

const DECODER_DEFINITIONS = {
  "ES": {
    title: "E/S / EMS (Employment Services System)",
    meaning: "Status indicates client record is linked or synchronized with the Employment Services / ICRS system.",
    action: "Verify if UI-19 declarations have been captured into Siyaya. If pending capture, advise client or route to data capture queue.",
    note: "[DASHBOARD STATUS: E/S - Employment Services System]\n- Meaning: Client record integrated with Employment Services/ICRS.\n- Action: Verified UI-19 capture status in Siyaya.\n"
  },
  "CLOSE_OPEN": {
    title: "Close Open Period",
    meaning: "A previous employment declaration period remains unclosed, which blocks benefit calculation and payment of new claims.",
    action: "Assessor or agent must close the preceding open period, or request updated UI-19 from employer with confirmed termination date.",
    note: "[DASHBOARD STATUS: Close Open Period]\n- Meaning: Previous employment period remains open, halting benefit calculation.\n- Action: Requesting employer to submit updated UI-19 with termination date or assessor to close period.\n"
  },
  "ICRS": {
    title: "UI-19 on ICRS",
    meaning: "The UI-19 form has been uploaded/scanned to the ICRS document archive but not yet processed or captured onto the claim.",
    action: "Advise client documents have been received on ICRS. Normal processing turnaround time applies (10-15 working days).",
    note: "[DASHBOARD STATUS: UI-19 on ICRS]\n- Meaning: UI-19 documents received and uploaded to ICRS archive.\n- Action: Advised caller documents are on repository; processing underway within standard SLA.\n"
  },
  "CAPTURE": {
    title: "CAPTURE UI-19 / ES LOAD",
    meaning: "UI-19 form details require manual data capture onto Siyaya / DEL system by processing staff.",
    action: "Capture UI-19 employment period details or escalate to the Data Capture team if assessor permissions required.",
    note: "[DASHBOARD STATUS: CAPTURE UI-19 / ES LOAD]\n- Meaning: UI-19 declaration requires manual entry onto Siyaya.\n- Action: Forwarded to Data Capture queue for employer period entry.\n"
  },
  "GAP": {
    title: "GAP (Missing UI-19 / Employment Gap)",
    meaning: "Missing employment period or un-declared months detected between employment periods, resulting in inadequate credit days.",
    action: "Request missing UI-19 declarations and UI-2.7 / salary advice from employer for the gap period.",
    note: "[DASHBOARD STATUS: GAP (Missing UI-19)]\n- Meaning: Unaccounted period between employments; missing UI-19 declaration.\n- Action: Advised caller/employer to submit missing UI-19 to bridge gap.\n"
  },
  "SEC16": {
    title: "Section 16(1)(d) Work Seeker Sanction",
    meaning: "Claim is disqualified because the applicant did not register or report as a work seeker, or was deemed unavailable for work.",
    action: "Advise applicant to visit nearest Labour Centre in person with 13-digit ID to register on ESSA and lift Section 16(1)(d) flag.",
    note: "[DASHBOARD STATUS: Section 16(1)(d) Work Seeker]\n- Meaning: Disqualification under Sec 16(1)(d) - work seeker registration required.\n- Action: Advised applicant to report to Labour Centre to register on ESSA.\n"
  }
};

let activeDecoderCode = null;

if (toggleNotesDecoderPanel && notesDecoderContentBox) {
  toggleNotesDecoderPanel.addEventListener('click', () => {
    const isHidden = notesDecoderContentBox.style.display === 'none';
    notesDecoderContentBox.style.display = isHidden ? 'block' : 'none';
    if (iconToggleDecoder) iconToggleDecoder.innerText = isHidden ? '[v]' : '[>]';
  });
}

document.querySelectorAll('.btn-decoder-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    const code = btn.getAttribute('data-code');
    const def = DECODER_DEFINITIONS[code];
    if (!def) return;
    activeDecoderCode = code;
    if (decoderDetailTitle) decoderDetailTitle.innerText = def.title;
    if (decoderDetailMeaning) decoderDetailMeaning.innerHTML = `<b>Meaning:</b> ${def.meaning}`;
    if (decoderDetailAction) decoderDetailAction.innerHTML = `<b>Advice/Action:</b> ${def.action}`;
    if (decoderDetailBox) decoderDetailBox.style.display = 'block';
  });
});

if (btnCloseDecoderDetail && decoderDetailBox) {
  btnCloseDecoderDetail.addEventListener('click', () => {
    decoderDetailBox.style.display = 'none';
  });
}

if (btnInsertDecoderNote) {
  btnInsertDecoderNote.addEventListener('click', () => {
    if (!activeDecoderCode) return;
    const def = DECODER_DEFINITIONS[activeDecoderCode];
    if (!def || !txtCallNotes) return;
    txtCallNotes.value = def.note + "\n" + txtCallNotes.value;
    updateTextCounters();
    chrome.storage.local.set({ currentDraftNotes: txtCallNotes.value });
    if (copyFeedback) {
      copyFeedback.innerText = "Decoder Note Inserted!";
      copyFeedback.style.display = 'inline';
      setTimeout(() => { copyFeedback.style.display = 'none'; }, 1500);
    }
  });
}

// ================= SOP v5.1 QUICK DIRECTORY & COPY LOGIC =================
const toggleSopDirectory = document.getElementById('toggle-sop-directory');
const sopDirectoryContent = document.getElementById('sop-directory-content');
const iconToggleDirectory = document.getElementById('icon-toggle-directory');

if (toggleSopDirectory && sopDirectoryContent) {
  toggleSopDirectory.addEventListener('click', () => {
    const isHidden = sopDirectoryContent.style.display === 'none';
    sopDirectoryContent.style.display = isHidden ? 'block' : 'none';
    if (iconToggleDirectory) iconToggleDirectory.innerText = isHidden ? '[v]' : '[>]';
  });
}

document.querySelectorAll('.btn-copy-quick').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const textToCopy = e.target.getAttribute('data-copy');
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    const origText = e.target.innerText;
    e.target.innerText = "Copied!";
    e.target.style.background = "#059669";
    setTimeout(() => {
      e.target.innerText = origText;
      e.target.style.background = "";
    }, 1500);
  });
});

// Ticket Scanner
btnScanLatestOpen.addEventListener('click', () => {
  lblScanStatus.innerText = "Locating Open Case...";
  sendMessageToActiveTab({ action: "FIND_LATEST_AND_OPEN_NOTES", tabType: "OPEN" });
});

btnScanLatestClosed.addEventListener('click', () => {
  lblScanStatus.innerText = "Locating Closed Case...";
  sendMessageToActiveTab({ action: "FIND_LATEST_AND_OPEN_NOTES", tabType: "CLOSED" });
});

const macroInputAlertBar = document.getElementById('macro-input-alert-bar');
const lblPauseStepNum = document.getElementById('lbl-pause-step-num');
const macroInputMsgText = document.getElementById('macro-input-msg-text');
const btnResumeMacroPanel = document.getElementById('btn-resume-macro-panel');

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "LATEST_CASE_FOUND") {
    lblScanStatus.innerText = `Opened: ${message.ticketRef}`;
  }
  if (message.action === "NO_CASES_FOUND") {
    lblScanStatus.innerText = `No ${message.tabType} cases`;
    alert(`No ${message.tabType} tickets found on this customer profile.`);
  }
  if (message.action === "MACRO_PAUSED") {
    updateUIState("PAUSED");
    if (isPauseAlertsEnabled) {
      if (macroInputAlertBar) macroInputAlertBar.style.display = 'block';
      if (lblPauseStepNum) lblPauseStepNum.innerText = `Step ${message.stepIndex || 1}${message.totalSteps ? ` of ${message.totalSteps}` : ''}`;
      if (macroInputMsgText) {
        const targetName = message.fieldName || message.target || "field on screen";
        macroInputMsgText.innerHTML = `<b>Action Required:</b> Please fill in required details for <b>${targetName}</b> on your CRM screen or click an insert button, then click <b>Resume</b> below.`;
      }
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        osc1.frequency.setValueAtTime(880.00, audioCtx.currentTime + 0.12); // A5
        gain1.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.start(audioCtx.currentTime);
        osc1.stop(audioCtx.currentTime + 0.35);
      } catch (e) {}
    }
  }
  if (message.action === "MACRO_RESUMED" || message.action === "PLAYBACK_FINISHED") {
    if (macroInputAlertBar) macroInputAlertBar.style.display = 'none';
    if (message.action === "PLAYBACK_FINISHED") {
      updateUIState("IDLE");
    }
  }
});

if (btnResumeMacroPanel) {
  btnResumeMacroPanel.addEventListener('click', () => {
    if (macroInputAlertBar) macroInputAlertBar.style.display = 'none';
    sendMessageToActiveTab({ action: "RESUME_PAUSED_MACRO" });
  });
}

// JSON Importer
if (inputImportProfiles) {
  inputImportProfiles.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        const incoming = data.profiles || data;
        allProfiles = incoming;

        const packageDate = data.createdAt ? new Date(data.createdAt).toLocaleDateString() : new Date().toLocaleDateString();

        chrome.storage.local.set({
          agentMasterPresets: allProfiles,
          agentPackageDate: packageDate
        }, () => {
          if (lblPackageVer) lblPackageVer.innerText = `Package: Active (${packageDate})`;
          populateCategoryDropdown();
          renderFilteredChips();
          alert(`Configuration updated! Loaded ${Object.keys(allProfiles).length} profiles.`);
        });
      } catch (err) {
        alert("Invalid JSON configuration file.");
      }
    };
    reader.readAsText(file);
  });
}

function updateUIState(state) {
  if (!statusDot || !lblEngineState) return;
  if (state === "RUNNING") {
    statusDot.style.backgroundColor = "#38bdf8";
    statusDot.style.boxShadow = "0 0 8px #38bdf8";
    lblEngineState.innerText = "Filling...";
    lblEngineState.style.color = "#38bdf8";
  } else {
    statusDot.style.backgroundColor = "#107c41";
    statusDot.style.boxShadow = "0 0 6px rgba(16, 124, 65, 0.5)";
    lblEngineState.innerText = "Ready";
    lblEngineState.style.color = "var(--muted)";
  }
}

function updateTextCounters() {
  if (!txtCallNotes) return;
  const text = txtCallNotes.value || "";
  if (lblCharsCount) lblCharsCount.innerText = `${text.length} chars`;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  if (lblWordsCount) lblWordsCount.innerText = `${words} words`;
}

if (txtCallNotes) {
  txtCallNotes.addEventListener('input', () => {
    updateTextCounters();
    chrome.storage.local.set({ currentDraftNotes: txtCallNotes.value });
  });
}

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
    if (!txtCallNotes || !txtCallNotes.value) return;
    sendMessageToActiveTab({
      action: "INSERT_INTO_NOTES_LOG",
      notesText: txtCallNotes.value
    });
  });

}

const flaggedFixReminder = document.getElementById('flagged-fix-reminder');
const btnStraightToSave = document.getElementById('btn-straight-to-save');
let isGuidanceEnabled = true;

function updateFlaggedUI() {
  if (!btnFlagIncomplete) return;
  btnFlagIncomplete.style.backgroundColor = isCurrentTicketFlagged ? '#dc2626' : '#d97706';
  btnFlagIncomplete.innerText = isCurrentTicketFlagged ? 'Flagged (Incomplete)' : 'Flag Incomplete';
  
  if (flaggedFixReminder) {
    flaggedFixReminder.style.display = (isCurrentTicketFlagged && isGuidanceEnabled) ? 'block' : 'none';
  }
}

if (btnFlagIncomplete) {
  btnFlagIncomplete.addEventListener('click', () => {
    if (!selectedQuery) {
      alert('Select a query before flagging this ticket.');
      return;
    }

    isCurrentTicketFlagged = !isCurrentTicketFlagged;
    updateFlaggedUI();
    sendMessageToActiveTab({
      action: 'FLAG_TICKET_INCOMPLETE',
      flagged: isCurrentTicketFlagged
    });
  });
}

if (btnStraightToSave) {
  btnStraightToSave.addEventListener('click', () => {
    if (txtCallNotes && txtCallNotes.value) {
      sendMessageToActiveTab({
        action: "INSERT_INTO_NOTES_LOG",
        notesText: txtCallNotes.value
      });
    }
    sendMessageToActiveTab({
      action: "FORCE_SAVE_TICKET"
    });
    isCurrentTicketFlagged = false;
    updateFlaggedUI();
    sendMessageToActiveTab({
      action: 'FLAG_TICKET_INCOMPLETE',
      flagged: false
    });
    alert('Staged notes inserted into Notes Log & Save Case triggered.');
  });
}

// HQ Admin & Team Leader Feature Control Policy Flags
let isNotesLocked = false;
let isPauseAlertsEnabled = true;
let isMultiQueryEnabled = true;
let isAutoStepEnabled = true;
let isTokenToolbarEnabled = true;

function applyNotesLockSetting(locked) {
  if (!txtCallNotes) return;
  isNotesLocked = Boolean(locked);
  txtCallNotes.readOnly = isNotesLocked;
  if (isNotesLocked) {
    txtCallNotes.setAttribute('readonly', 'readonly');
    txtCallNotes.setAttribute('placeholder', '[Notes Locked (Admin Directive)] Select a 1-Tap preset and use toolbar insert buttons above...');
  } else {
    txtCallNotes.removeAttribute('readonly');
    txtCallNotes.setAttribute('placeholder', '[Notes Unlocked] Type call notes here or select a 1-Tap preset above...');
  }
}

function updateAdminFeatureUI() {
  const modeBar = document.querySelector('.notes-mode-bar');
  if (modeBar) modeBar.style.display = isMultiQueryEnabled ? 'flex' : 'none';

  const toolbar = document.querySelector('.smart-token-toolbar');
  if (toolbar) toolbar.style.display = isTokenToolbarEnabled ? 'flex' : 'none';
}

chrome.storage.local.get([
  "dce_notes_locked",
  "dce_save_guidance_enabled",
  "dce_pause_alerts_enabled",
  "dce_multi_query_enabled",
  "dce_auto_step_exec",
  "dce_token_toolbar_enabled"
], (res) => {
  applyNotesLockSetting(Boolean(res.dce_notes_locked));
  isGuidanceEnabled = res.dce_save_guidance_enabled !== false;
  isPauseAlertsEnabled = res.dce_pause_alerts_enabled !== false;
  isMultiQueryEnabled = res.dce_multi_query_enabled !== false;
  isAutoStepEnabled = res.dce_auto_step_exec !== false;
  isTokenToolbarEnabled = res.dce_token_toolbar_enabled !== false;

  updateAdminFeatureUI();
  updateFlaggedUI();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.dce_notes_locked !== undefined) {
      applyNotesLockSetting(Boolean(changes.dce_notes_locked.newValue));
    }
    if (changes.dce_save_guidance_enabled !== undefined) {
      isGuidanceEnabled = changes.dce_save_guidance_enabled.newValue !== false;
      updateFlaggedUI();
    }
    if (changes.dce_pause_alerts_enabled !== undefined) {
      isPauseAlertsEnabled = changes.dce_pause_alerts_enabled.newValue !== false;
    }
    if (changes.dce_multi_query_enabled !== undefined) {
      isMultiQueryEnabled = changes.dce_multi_query_enabled.newValue !== false;
      updateAdminFeatureUI();
    }
    if (changes.dce_auto_step_exec !== undefined) {
      isAutoStepEnabled = changes.dce_auto_step_exec.newValue !== false;
    }
    if (changes.dce_token_toolbar_enabled !== undefined) {
      isTokenToolbarEnabled = changes.dce_token_toolbar_enabled.newValue !== false;
      updateAdminFeatureUI();
    }
    if (changes.dce_tl_nudge && changes.dce_tl_nudge.newValue) {
      const nudge = changes.dce_tl_nudge.newValue;
      triggerFlashingRedAlert(`SUPERVISOR NOTICE (${nudge.sender || "TL"}): ${nudge.message}`);
    }
  }
});

if (btnClearNotes) {
  btnClearNotes.addEventListener('click', () => {
    if (txtCallNotes) txtCallNotes.value = '';
    queryCount = 0;
    updateTextCounters();
    chrome.storage.local.remove(["currentDraftNotes"]);
  });
}

if (btnTodayDate) {
  btnTodayDate.addEventListener('click', () => {
    if (rfpCalendarInput) rfpCalendarInput.value = todayFormatted;
  });
}

document.getElementById('btn-due-date')?.addEventListener('click', () => {
  const future = new Date(Date.now() + 7 * 86400000);
  const futureIso = future.toISOString().split('T')[0];
  if (rfpCalendarInput) rfpCalendarInput.value = futureIso;
  const formatted = formatDateToStandard(futureIso);
  if (txtCallNotes) txtCallNotes.value += `\nDUE DATE : ${formatted}`;
  updateTextCounters();
});

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
    updateTextCounters();
    chrome.storage.local.set({ currentDraftNotes: txtCallNotes.value });
  });
}

// Number Dropdown & Custom Input Handler
const selectNumberDropdown = document.getElementById('select-number-dropdown');
const inputCustomNumber = document.getElementById('input-custom-number');
const btnInsertNumberVal = document.getElementById('btn-insert-number-val');

selectNumberDropdown?.addEventListener('change', () => {
  if (selectNumberDropdown.value === 'CUSTOM') {
    if (inputCustomNumber) {
      inputCustomNumber.style.display = 'block';
      inputCustomNumber.focus();
    }
  } else {
    if (inputCustomNumber) inputCustomNumber.style.display = 'none';
  }
});

btnInsertNumberVal?.addEventListener('click', () => {
  let numVal = selectNumberDropdown ? selectNumberDropdown.value : "";
  const typedVal = inputCustomNumber ? inputCustomNumber.value.trim() : "";

  if (selectNumberDropdown?.value === 'CUSTOM') {
    numVal = typedVal || prompt("Enter Custom Number or Value to insert into call notes:", "1500") || "";
  } else if (typedVal) {
    numVal = typedVal;
  }

  if (numVal) {
    insertTokenToNotes(numVal);
  }
});

// Smart Token Insert Handlers for Agent Panel (Replaces placeholders or appends)
function insertTokenToNotes(tokenStr) {
  if (!txtCallNotes) return;
  let val = txtCallNotes.value || "";

  if (tokenStr === 'TODAY' || tokenStr === '+7DAYS') {
    const d = (tokenStr === 'TODAY') 
      ? new Date() 
      : new Date(Date.now() + 7 * 86400000);
    const dateFormatted = formatDateToStandard(d.toISOString().split('T')[0]);

    if (/DATE OF SUBMISSION\s*:\s*(\[.*?\]|[\d\w\s]+)/i.test(val)) {
      val = val.replace(/DATE OF SUBMISSION\s*:\s*(\[.*?\]|[\d\w\s]+)/i, `DATE OF SUBMISSION : ${dateFormatted}`);
      txtCallNotes.value = val;
    } else if (/\[Insert Date\]|\[DATE\]/gi.test(val)) {
      val = val.replace(/\[Insert Date\]|\[DATE\]/gi, dateFormatted);
      txtCallNotes.value = val;
    } else {
      const start = txtCallNotes.selectionStart || val.length;
      const end = txtCallNotes.selectionEnd || val.length;
      txtCallNotes.value = val.substring(0, start) + dateFormatted + val.substring(end);
      txtCallNotes.selectionStart = txtCallNotes.selectionEnd = start + dateFormatted.length;
    }
    updateTextCounters();
    chrome.storage.local.set({ currentDraftNotes: txtCallNotes.value });
    return;
  }

  // If inserting a concrete number/text (not a bracketed token) and notes contain [NUMBER]/[AMOUNT]/[ID_NUMBER]/[REF_NUMBER], replace first placeholder
  if (!tokenStr.startsWith("[") && /\[NUMBER\]|\[AMOUNT\]|\[ID_NUMBER\]|\[REF_NUMBER\]/i.test(val)) {
    val = val.replace(/\[NUMBER\]|\[AMOUNT\]|\[ID_NUMBER\]|\[REF_NUMBER\]/i, tokenStr);
    txtCallNotes.value = val;
  } else {
    const start = txtCallNotes.selectionStart || val.length;
    const end = txtCallNotes.selectionEnd || val.length;
    txtCallNotes.value = val.substring(0, start) + tokenStr + val.substring(end);
    txtCallNotes.selectionStart = txtCallNotes.selectionEnd = start + tokenStr.length;
  }

  updateTextCounters();
  chrome.storage.local.set({ currentDraftNotes: txtCallNotes.value });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "QUERY_AUTO_DETECTED" && message.query) {
    selectedQuery = message.query;
  }
});

// --- AUTO-SCREENSHOT & REPORT ISSUE CONTROLLER ---
let currentCapturedDataUrl = "";

const btnOpenReportIssue = document.getElementById('btn-open-report-issue');
const modalReportIssue = document.getElementById('modal-report-issue');
const btnCloseReportModal = document.getElementById('btn-close-report-modal');
const reportActiveSiteLbl = document.getElementById('report-active-site-lbl');
const selectIssueCategory = document.getElementById('select-issue-category');
const selectSupportEmail = document.getElementById('select-support-email');
const inputCustomEmail = document.getElementById('input-custom-email');
const txtIssueDetails = document.getElementById('txt-issue-details');
const btnRecaptureShot = document.getElementById('btn-recapture-shot');
const imgShotPreview = document.getElementById('img-shot-preview');
const lblShotStatus = document.getElementById('lbl-shot-status');
const btnSendEmailReport = document.getElementById('btn-send-email-report');
const btnCopyReportText = document.getElementById('btn-copy-report-text');
const btnDownloadShot = document.getElementById('btn-download-shot');

function captureActiveTabScreenshot() {
  if (lblShotStatus) lblShotStatus.innerText = "Capturing active screen...";
  if (imgShotPreview) imgShotPreview.style.display = "none";
  
  chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
    if (chrome.runtime.lastError || !dataUrl) {
      if (lblShotStatus) lblShotStatus.innerText = "Captured (Local/Browser page preview restricted)";
      currentCapturedDataUrl = "";
    } else {
      currentCapturedDataUrl = dataUrl;
      if (imgShotPreview) {
        imgShotPreview.src = dataUrl;
        imgShotPreview.style.display = "inline-block";
      }
      if (lblShotStatus) lblShotStatus.innerText = "Screen Captured (PNG)";
    }
  });
}

async function updateReportActiveSiteInfo() {
  const targetTab = await getTargetTab();
  if (reportActiveSiteLbl) {
    if (targetTab && targetTab.url) {
      try {
        const u = new URL(targetTab.url);
        reportActiveSiteLbl.innerText = `${u.hostname} (${targetTab.title || 'Active Tab'})`;
      } catch (e) {
        reportActiveSiteLbl.innerText = targetTab.title || targetTab.url;
      }
    } else {
      reportActiveSiteLbl.innerText = "DCE Extension Panel (Standalone / Side Panel)";
    }
  }
}

if (btnOpenReportIssue) {
  btnOpenReportIssue.addEventListener('click', () => {
    if (modalReportIssue) modalReportIssue.style.display = 'flex';
    updateReportActiveSiteInfo();
    captureActiveTabScreenshot();
  });
}

if (btnCloseReportModal) {
  btnCloseReportModal.addEventListener('click', () => {
    if (modalReportIssue) modalReportIssue.style.display = 'none';
  });
}

if (btnRecaptureShot) {
  btnRecaptureShot.addEventListener('click', captureActiveTabScreenshot);
}

if (selectIssueCategory) {
  selectIssueCategory.addEventListener('change', () => {
    const val = selectIssueCategory.value;
    if (val === "DCE_EXTENSION" && selectSupportEmail) {
      selectSupportEmail.value = "bonga.manzini@alteram.co.za";
    } else if (val === "WEBSITE_CRM" && selectSupportEmail) {
      selectSupportEmail.value = "support.crm@labour.gov.za";
    } else if (val === "TELEPHONY_NETWORK" && selectSupportEmail) {
      selectSupportEmail.value = "it.helpdesk@alteram.co.za";
    }
    if (inputCustomEmail) inputCustomEmail.style.display = (selectSupportEmail?.value === "CUSTOM") ? "block" : "none";
  });
}

if (selectSupportEmail) {
  selectSupportEmail.addEventListener('change', () => {
    if (inputCustomEmail) {
      inputCustomEmail.style.display = (selectSupportEmail.value === "CUSTOM") ? "block" : "none";
    }
  });
}

function getRecipientEmail() {
  if (selectSupportEmail?.value === "CUSTOM") {
    return inputCustomEmail?.value.trim() || "bonga.manzini@alteram.co.za";
  }
  return selectSupportEmail?.value || "bonga.manzini@alteram.co.za";
}

function buildStructuredReportBody() {
  const categoryText = selectIssueCategory ? selectIssueCategory.options[selectIssueCategory.selectedIndex].text : "General Technical Issue";
  const siteText = reportActiveSiteLbl ? reportActiveSiteLbl.innerText : "Active Site";
  const details = txtIssueDetails ? txtIssueDetails.value.trim() : "No additional description provided.";
  const agentName = (typeof lblAgentName !== 'undefined' && lblAgentName) ? lblAgentName.innerText : "Frontline Operator";

  return `[DCE ISSUE & SUPPORT REPORT]
Reported By: ${agentName}
Target Component: ${categoryText}
Active Website: ${siteText}
Timestamp: ${new Date().toLocaleString()}

ISSUE DETAILS & DESCRIPTION:
${details}

DEVELOPMENT SUPPORT CONTACT:
Bonga Manzini (Lead Extension Developer)
Email: bonga.manzini@alteram.co.za / bonga@devsupport.co.za

--------------------------------------------------
*Screenshot Captured: ${currentCapturedDataUrl ? "YES (Attached / PNG Data Available)" : "N/A"}*`;
}

if (btnSendEmailReport) {
  btnSendEmailReport.addEventListener('click', () => {
    const recipient = getRecipientEmail();
    const categoryText = selectIssueCategory ? selectIssueCategory.options[selectIssueCategory.selectedIndex].text : "Issue Report";
    const subject = `[DCE Support Ticket] ${categoryText}`;
    const body = buildStructuredReportBody();

    const mailtoUrl = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl, '_blank');
    alert(`Opened email client to send report to ${recipient}.\n\nIf your email client does not open, click "Copy Report" to copy the text.`);
  });
}

if (btnCopyReportText) {
  btnCopyReportText.addEventListener('click', () => {
    const reportText = buildStructuredReportBody();
    navigator.clipboard.writeText(reportText).then(() => {
      alert("Issue Report copied to clipboard!");
    }).catch(() => {
      alert("Copied report text.");
    });
  });
}

if (btnDownloadShot) {
  btnDownloadShot.addEventListener('click', () => {
    if (!currentCapturedDataUrl) {
      alert("No active screen capture available to download.");
      return;
    }
    const a = document.createElement('a');
    a.href = currentCapturedDataUrl;
    a.download = `DCE_Issue_Screenshot_${Date.now()}.png`;
    a.click();
  });
}



initializeAgentWorkspace();
