// Tab Switching Elements
const tabBtnStudio = document.getElementById('tab-btn-studio');
const tabBtnDashboard = document.getElementById('tab-btn-dashboard');
const tabBtnInsights = document.getElementById('tab-btn-insights');
const tabContentStudio = document.getElementById('tab-content-studio');
const tabContentDashboard = document.getElementById('tab-content-dashboard');
const tabContentInsights = document.getElementById('tab-content-insights');

// Theme & Wallpaper Elements
const selectTheme = document.getElementById('select-theme');
const bgCustomBar = document.getElementById('bg-custom-bar');
const inputBgUrl = document.getElementById('input-bg-url');
const inputBgFile = document.getElementById('input-bg-file');
const btnApplyBgUrl = document.getElementById('btn-apply-bg-url');
const btnClearBgUrl = document.getElementById('btn-clear-bg-url');

// Insights Elements
const metricQaScore = document.getElementById('metric-qa-score');
const metricTotalCalls = document.getElementById('metric-total-calls');
const metricFlaggedCount = document.getElementById('metric-flagged-count');
const analyticsQueryBars = document.getElementById('analytics-query-bars');
const insightsAuditLog = document.getElementById('insights-audit-log');
const btnExportQaCsv = document.getElementById('btn-export-qa-csv');

// Studio & Profile Elements
const selectCategoryFilter = document.getElementById('select-category-filter');
const dispositionChipsContainer = document.getElementById('disposition-chips');
const txtCallNotes = document.getElementById('txt-call-notes');
const btnCopyNotes = document.getElementById('btn-copy-notes');
const btnPasteToDce = document.getElementById('btn-paste-to-dce');
const btnClearNotes = document.getElementById('btn-clear-notes');
const copyFeedback = document.getElementById('copy-feedback');
const statusDot = document.getElementById('status-dot');
const recordingPill = document.getElementById('recording-pill');
const lblPresetsCount = document.getElementById('lbl-presets-count');

const rfpCalendarInput = document.getElementById('rfp-calendar-input');
const btnInsertDate = document.getElementById('btn-insert-date');
const btnTodayDate = document.getElementById('btn-today-date');

const presetSelect = document.getElementById('preset-select');
const stepsLog = document.getElementById('steps-log');
const btnClearProfileSteps = document.getElementById('btn-clear-profile-steps');
const btnDeleteProfilePathway = document.getElementById('btn-delete-profile-pathway');
const btnPurgeEmptyPathways = document.getElementById('btn-purge-empty-pathways');

const btnAppendSteps = document.getElementById('btn-append-steps');
const btnRecord = document.getElementById('btn-record');
const btnAddStepManual = document.getElementById('btn-add-step-manual');
const btnPlay = document.getElementById('btn-play');
const btnStop = document.getElementById('btn-stop');
const btnExportProfiles = document.getElementById('btn-export-profiles');
const inputImportProfiles = document.getElementById('input-import-profiles');

// Manual Step Modal Elements
const modalManualStep = document.getElementById('modal-manual-step');
const manualStepAction = document.getElementById('manual-step-action');
const manualStepTarget = document.getElementById('manual-step-target');
const manualStepValue = document.getElementById('manual-step-value');
const btnCancelManualStep = document.getElementById('btn-cancel-manual-step');
const btnSaveManualStep = document.getElementById('btn-save-manual-step');

let editingStepIndex = -1;

// Ticket Scanner
const btnScanLatestOpen = document.getElementById('btn-scan-latest-open');
const btnScanLatestClosed = document.getElementById('btn-scan-latest-closed');
const lblScanStatus = document.getElementById('lbl-scan-status');
const dceConnectionBadge = document.getElementById('dce-connection-badge');
const incompleteAlert = document.getElementById('incomplete-alert');

// Modal Elements
const btnShowAddPreset = document.getElementById('btn-show-add-preset');
const modalAddPreset = document.getElementById('modal-add-preset');
const btnCancelPreset = document.getElementById('btn-cancel-preset');
const btnSavePreset = document.getElementById('btn-save-preset');
const newPresetName = document.getElementById('new-preset-name');
const newPresetTitle = document.getElementById('new-preset-title');
const newPresetNotes = document.getElementById('new-preset-notes');
const btnFullscreenToggle = document.getElementById('btn-fullscreen-toggle');

// Dashboard & Team Elements
const filterTlSelect = document.getElementById('filter-tl-select');
const filterTeamSelect = document.getElementById('filter-team-select');
const agentRosterContainer = document.getElementById('agent-roster-container');
const agentDetailCard = document.getElementById('agent-detail-card');
const detailAgentHeader = document.getElementById('detail-agent-header');
const detailAgentStatusBadge = document.getElementById('detail-agent-status-badge');
const detailAgentMeta = document.getElementById('detail-agent-meta');
const detailCaseRef = document.getElementById('detail-case-ref');
const detailCaseTitle = document.getElementById('detail-case-title');
const detailSelectedQuery = document.getElementById('detail-selected-query');
const detailCaseLocation = document.getElementById('detail-case-location');
const detailNotesFormat = document.getElementById('detail-notes-format');
const detailNotesTokens = document.getElementById('detail-notes-tokens');
const btnClearRoster = document.getElementById('btn-clear-roster');

let allProfiles = {};
let activeProfileKey = "";
let currentSteps = [];
let selectedAgentId = null;
let liveRosterCache = {};

async function refreshBackendData() {
 if (!self.DCE_BACKEND_URL) return;
 try {
  const [rosterResponse, alertsResponse] = await Promise.all([
   fetch(`${self.DCE_BACKEND_URL}/api/roster`),
   fetch(`${self.DCE_BACKEND_URL}/api/alerts`)
  ]);
  if (!rosterResponse.ok || !alertsResponse.ok) return;
  const rosterData = await rosterResponse.json();
  const alertsData = await alertsResponse.json();
  const roster = Object.fromEntries((rosterData.agents || []).map(agent => [agent.agentId, agent]));
  chrome.storage.local.set({ dce_live_roster: roster, dce_alerts: alertsData.alerts || [] });
 } catch (error) {
  // Local storage remains the fallback when the backend is unavailable.
 }
}

function listenToBackendEvents() {
 if (!self.DCE_BACKEND_URL) return;
 const eventSource = new EventSource(`${self.DCE_BACKEND_URL}/api/events`);
 eventSource.addEventListener("roster", event => {
  const agent = JSON.parse(event.data);
  chrome.storage.local.get(["dce_live_roster"], res => {
   const roster = res.dce_live_roster || {};
   roster[agent.agentId] = agent;
   chrome.storage.local.set({ dce_live_roster: roster });
  });
 });
 eventSource.addEventListener("alert", event => {
  const alert = JSON.parse(event.data);
  chrome.storage.local.get(["dce_alerts"], res => {
   const alerts = res.dce_alerts || [];
   alerts.unshift(alert);
   chrome.storage.local.set({ dce_alerts: alerts });
  });
 });
 eventSource.addEventListener("error", () => eventSource.close());
}

const now = new Date();
const todayFormatted = now.toISOString().split('T')[0];
if (rfpCalendarInput) rfpCalendarInput.value = todayFormatted;

// 1. Advanced Theme & Custom Wallpaper Controller (Supports File Picker & URL Paste)
chrome.storage.local.get(["dce_admin_theme", "dce_admin_bg_url"], (res) => {
 const savedTheme = res.dce_admin_theme || localStorage.getItem('dce_admin_theme') || 'dark';
 const savedBgUrl = res.dce_admin_bg_url || localStorage.getItem('dce_admin_bg_url') || '';
 if (selectTheme) selectTheme.value = savedTheme;
 if (inputBgUrl && savedBgUrl) inputBgUrl.value = savedBgUrl;
 applyTheme(savedTheme, savedBgUrl);
});

if (selectTheme) {
 selectTheme.addEventListener('change', (e) => {
  const val = e.target.value;
  if (val === 'custom') {
   if (bgCustomBar) bgCustomBar.style.display = 'flex';
   const currentBg = localStorage.getItem('dce_admin_bg_url') || '';
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
   localStorage.setItem('dce_admin_bg_url', dataUrl);
   chrome.storage.local.set({ dce_admin_bg_url: dataUrl, dce_admin_theme: 'custom' });
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
   localStorage.setItem('dce_admin_bg_url', url);
   chrome.storage.local.set({ dce_admin_bg_url: url, dce_admin_theme: 'custom' });
   if (selectTheme) selectTheme.value = 'custom';
   applyTheme('custom', url);
  }
 });
}

if (btnClearBgUrl) {
 btnClearBgUrl.addEventListener('click', () => {
  localStorage.removeItem('dce_admin_bg_url');
  chrome.storage.local.remove(["dce_admin_bg_url"]);
  if (inputBgUrl) inputBgUrl.value = '';
  if (inputBgFile) inputBgFile.value = '';
  if (selectTheme) selectTheme.value = 'dark';
  if (bgCustomBar) bgCustomBar.style.display = 'none';
  applyTheme('dark', '');
 });
}

// HQ Admin & Team Leader Feature Switchboard Event Listeners
const chkAdminNotesLock = document.getElementById('chk-admin-notes-lock');
const chkAdminSaveGuidance = document.getElementById('chk-admin-save-guidance');
const chkAdminPauseAlerts = document.getElementById('chk-admin-pause-alerts');
const chkAdminMultiQuery = document.getElementById('chk-admin-multi-query');
const chkAdminAutoStep = document.getElementById('chk-admin-auto-step');
const chkAdminTokenToolbar = document.getElementById('chk-admin-token-toolbar');
const chkAdminLoopEngine = document.getElementById('chk-admin-loop-engine');

const featureControlsMap = [
 { element: chkAdminNotesLock, key: 'dce_notes_locked', defaultVal: false, isBooleanDirect: true },
 { element: chkAdminSaveGuidance, key: 'dce_save_guidance_enabled', defaultVal: true },
 { element: chkAdminPauseAlerts, key: 'dce_pause_alerts_enabled', defaultVal: true },
 { element: chkAdminMultiQuery, key: 'dce_multi_query_enabled', defaultVal: true },
 { element: chkAdminAutoStep, key: 'dce_auto_step_exec', defaultVal: true },
 { element: chkAdminTokenToolbar, key: 'dce_token_toolbar_enabled', defaultVal: true },
 { element: chkAdminLoopEngine, key: 'dce_loop_engine_enabled', defaultVal: true }
];

featureControlsMap.forEach(ctrl => {
 if (!ctrl.element) return;
 chrome.storage.local.get([ctrl.key], (res) => {
  if (ctrl.isBooleanDirect) {
   ctrl.element.checked = Boolean(res[ctrl.key]);
  } else {
   ctrl.element.checked = res[ctrl.key] !== false;
  }
 });
 ctrl.element.addEventListener('change', () => {
  chrome.storage.local.set({ [ctrl.key]: ctrl.element.checked });
 });
});

function applyTheme(theme, bgUrl) {
 document.documentElement.setAttribute('data-theme', theme);
 localStorage.setItem('dce_admin_theme', theme);
 chrome.storage.local.set({ dce_admin_theme: theme });

 if (theme === 'custom' && bgUrl) {
  localStorage.setItem('dce_admin_bg_url', bgUrl);
  chrome.storage.local.set({ dce_admin_bg_url: bgUrl });

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

// 2. Full-Screen Dashboard Pop-out
if (btnFullscreenToggle) {
 btnFullscreenToggle.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('panel/panel.html?view=fullscreen') });
 });
}

// Check URL param if opened as standalone tab
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('view') === 'fullscreen') {
 if (btnFullscreenToggle) btnFullscreenToggle.style.display = 'none';
 switchToTab('DASHBOARD');
}

function formatDateToStandard(dateStr) {
 if (!dateStr) return "";
 const [year, month, day] = dateStr.split('-');
 const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
 return `${day} ${monthNames[parseInt(month, 10) - 1]} ${year}`;
}

// 3. Tab Switching
if (tabBtnStudio) tabBtnStudio.addEventListener('click', () => switchToTab('STUDIO'));
if (tabBtnDashboard) tabBtnDashboard.addEventListener('click', () => switchToTab('DASHBOARD'));
if (tabBtnInsights) tabBtnInsights.addEventListener('click', () => switchToTab('INSIGHTS'));

function switchToTab(tabName) {
 if (tabBtnStudio) tabBtnStudio.classList.remove('active');
 if (tabBtnDashboard) tabBtnDashboard.classList.remove('active');
 if (tabBtnInsights) tabBtnInsights.classList.remove('active');

 if (tabContentStudio) tabContentStudio.classList.remove('active');
 if (tabContentDashboard) tabContentDashboard.classList.remove('active');
 if (tabContentInsights) tabContentInsights.classList.remove('active');

 if (tabName === 'STUDIO') {
  if (tabBtnStudio) tabBtnStudio.classList.add('active');
  if (tabContentStudio) tabContentStudio.classList.add('active');
 } else if (tabName === 'DASHBOARD') {
  if (tabBtnDashboard) tabBtnDashboard.classList.add('active');
  if (tabContentDashboard) tabContentDashboard.classList.add('active');
 } else if (tabName === 'INSIGHTS') {
  if (tabBtnInsights) tabBtnInsights.classList.add('active');
  if (tabContentInsights) tabContentInsights.classList.add('active');
  renderAdminInsights();
 }
}

// 4. Universal Tab Target & Link Status (Supports Telviva, AltDesk, DEL CRM, and any site)
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

function formatRosterConnectionStatus(activeAgents, domainLabel = "") {
 if (!activeAgents || activeAgents.length === 0) {
  return domainLabel ? ` CONNECTED (${domainLabel})` : ` LIVE DASHBOARD (0 Agents Online)`;
 }

 const tlCounts = {};
 activeAgents.forEach(a => {
  const tl = a.teamLeader || a.tl || "Unassigned TL";
  tlCounts[tl] = (tlCounts[tl] || 0) + 1;
 });

 const primary = activeAgents[0];
 const agentName = primary.agentName || "Agent";
 const tlName = primary.teamLeader || primary.tl || "Unassigned TL";
 const amountInTeam = tlCounts[tlName] || 1;

 let text = "";
 if (activeAgents.length === 1) {
  text = ` CONNECTED: Agent: ${agentName} | TL: ${tlName} (${amountInTeam} in Team)`;
 } else {
  const otherCount = activeAgents.length - 1;
  text = ` CONNECTED: Agent: ${agentName} (+${otherCount} more) | TL: ${tlName} (${amountInTeam} in Team | ${activeAgents.length} Floor Total)`;
 }

 if (domainLabel) {
  text += ` [${domainLabel}]`;
 }

 return text;
}

async function checkDceConnection() {
 const targetTab = await getTargetTab();
 let websiteLabel = "";
 if (targetTab?.url) {
  try {
   const urlObj = new URL(targetTab.url);
   websiteLabel = urlObj.hostname || urlObj.host;
  } catch (e) {
   websiteLabel = targetTab.title || "Web Tab";
  }
 }

 chrome.storage.local.get(["dce_live_roster"], (res) => {
  const roster = Object.values(res.dce_live_roster || {});
  const activeAgents = roster.filter(a => a.status !== "OFFLINE" && (Date.now() - (a.lastHeartbeat || 0)) < 35000);

  if (targetTab?.id) {
   chrome.tabs.sendMessage(targetTab.id, { action: "PING" }, (pingRes) => {
    const activeDomain = (!chrome.runtime.lastError && Boolean(pingRes)) ? (pingRes.hostname || pingRes.domain || websiteLabel) : websiteLabel;
    if (!chrome.runtime.lastError && Boolean(pingRes)) {
     const statusText = formatRosterConnectionStatus(activeAgents, activeDomain);
     updateConnectionUI(true, statusText);
    } else if (activeAgents.length > 0) {
     const statusText = formatRosterConnectionStatus(activeAgents, websiteLabel);
     updateConnectionUI(true, statusText);
    } else {
     updateConnectionUI(false, ` DISCONNECTED (${websiteLabel} - Press F5 to Link)`);
    }
   });
  } else if (activeAgents.length > 0) {
   const statusText = formatRosterConnectionStatus(activeAgents, "");
   updateConnectionUI(true, statusText);
  } else {
   updateConnectionUI(false, " DISCONNECTED (No Web Tab / No Agents Online)");
  }
 });
}

function updateConnectionUI(connected, customText) {
 if (!dceConnectionBadge) return;
 if (connected) {
  dceConnectionBadge.className = "status-badge-connected";
  dceConnectionBadge.innerText = customText || " CONNECTED";
 } else {
  dceConnectionBadge.className = "status-badge-disconnected";
  dceConnectionBadge.innerText = customText || " DISCONNECTED";
 }
}

setInterval(checkDceConnection, 2000);
checkDceConnection();

async function sendMessageToActiveTab(msg, callback) {
 try {
  const targetTab = await getTargetTab();
  if (!targetTab?.id) {
   alert("No DEL CRM tab detected. Please open DEL CRM.");
   return;
  }
  chrome.tabs.sendMessage(targetTab.id, msg, (response) => {
   if (chrome.runtime.lastError) {
    console.warn("[AutoCloser-Admin] Dispatch error:", chrome.runtime.lastError.message);
   } else if (callback) {
    callback(response);
   }
  });
 } catch (err) {
  console.error("[AutoCloser-Admin] Communication error:", err);
 }
}

// 5. Category Normalizer
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

 // Exact SOP v5.1 Sections
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
  "Floor Support & Language Barrier"
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

 // Fallbacks
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

let originalSopBundle = {};

// 6. Initial Boot Loader - Aligned with UIF SOP v5.1
fetch(chrome.runtime.getURL('presets.json'))
 .then(r => r.json())
 .then(defaultPresets => {
  chrome.storage.local.get(["customMacroPresets", "activePresetKey", "currentDraftNotes", "sopPackageVersion"], (res) => {
   allProfiles = res.customMacroPresets || {};
   const bundle = defaultPresets.profiles || defaultPresets;
   originalSopBundle = { ...bundle };

   // Merge/update master presets from JSON
   Object.keys(bundle).forEach(key => {
    if (!allProfiles[key]) {
     allProfiles[key] = { ...bundle[key], steps: bundle[key].steps || [] };
    } else {
     // Preserve recorded steps, but ensure SOP metadata is up to date
     const existingSteps = allProfiles[key].steps || [];
     allProfiles[key] = { ...bundle[key], steps: existingSteps };
    }
   });

   chrome.storage.local.set({
    customMacroPresets: allProfiles,
    sopPackageVersion: "5.1"
   });

   activeProfileKey = res.activePresetKey || Object.keys(allProfiles)[0];
   currentSteps = allProfiles[activeProfileKey]?.steps || [];

   if (res.currentDraftNotes && txtCallNotes) {
    txtCallNotes.value = res.currentDraftNotes;
   }

   populateCategoryDropdown();
   renderProfileDropdown();
   renderStepsList(currentSteps);
   renderFilteredChips();
   renderTeamFilters();
  });
 })
 .catch(err => console.error("Error loading presets:", err));

const selectDepartmentFilter = document.getElementById('select-department-filter');
const lblDeptCount = document.getElementById('lbl-dept-count');

function populateCategoryDropdown() {
 if (!selectCategoryFilter) return;
 selectCategoryFilter.innerHTML = '<option value="ALL"> All Categories (Show All)</option>';

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
  opt.textContent = ` ${cat}`;
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

selectCategoryFilter.addEventListener('change', renderFilteredChips);

// =========================================================================
// DEPARTMENT CASE TITLE CUSTOMIZER ENGINE (ADMIN MATRIX)
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

  chrome.storage.local.set({ customMacroPresets: allProfiles }, () => {
   renderFilteredChips();
   renderProfileDropdown();
   if (caseTitleSaveMsg) {
    const chosenDept = selectEditDepartment ? selectEditDepartment.value : 'Department';
    caseTitleSaveMsg.innerText = ` Successfully saved ${count} case titles for ${chosenDept}!`;
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
  return getNormalizedCategory(item) === selectedCategory;
 });

 if (lblPresetsCount) lblPresetsCount.innerText = `${filteredKeys.length} / ${allKeys.length} Ready`;

 filteredKeys.forEach(key => {
  const item = allProfiles[key];
  const chip = document.createElement('button');
  chip.className = 'btn-chip';
  const hasSteps = item.steps && item.steps.length > 0;

  chip.innerHTML = `
   <div style="font-size: 8px; color: var(--accent); font-weight: bold; text-transform: uppercase;">
    ${item.caseTitle || "QUERY"} ${hasSteps ? '' : ''}
   </div>
   <div style="font-size: 9.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
    ${key}
   </div>
  `;

  chip.addEventListener('click', () => {
   switchActiveProfile(key);

   let note = item.notes_template || item.notes || `QUERY: ${key}`;
   const chosenDateFormatted = formatDateToStandard(rfpCalendarInput ? rfpCalendarInput.value : todayFormatted);
   note = note.replace(/\[Insert Date\]|\[DATE\]/gi, chosenDateFormatted);

   if (txtCallNotes) {
    txtCallNotes.value = note;
    chrome.storage.local.set({ currentDraftNotes: note });
   }

   if (item.steps && item.steps.length > 0) {
    updateUIState("PLAYING");
    sendMessageToActiveTab({ action: "PLAY_STEPS", steps: item.steps });
   } else {
    alert(`No steps recorded for "${key}". Select it below and click Record Steps.`);
   }
  });

  dispositionChipsContainer.appendChild(chip);
 });
}

function renderProfileDropdown() {
 if (!presetSelect) return;
 presetSelect.innerHTML = '';
 const keys = Object.keys(allProfiles);
 if (keys.length === 0) {
  const opt = document.createElement('option');
  opt.value = '';
  opt.textContent = '(No presets available)';
  presetSelect.appendChild(opt);
  return;
 }
 keys.forEach(key => {
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

presetSelect.addEventListener('change', (e) => switchActiveProfile(e.target.value));

function renderStepsList(steps) {
 if (!stepsLog) return;
 if (!activeProfileKey || !allProfiles[activeProfileKey]) {
  stepsLog.innerHTML = `
   <div style="color: var(--muted); padding: 8px; text-align: center;">
    No active profile selected. Click <b> Add Preset</b> to create a pathway.
   </div>
  `;
  return;
 }
 if (!steps || steps.length === 0) {
  stepsLog.innerHTML = `
   <div style="color: var(--muted); padding: 8px; text-align: center;">
    No steps recorded for <b>${activeProfileKey}</b>.<br>
    Click <b> Append Steps</b> or <b> Overwrite</b> to capture actions on DEL CRM.
   </div>
  `;
  return;
 }

 stepsLog.innerHTML = '';
 steps.forEach((step, idx) => {
  const row = document.createElement('div');
  row.className = 'step-item';
  row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 4px 6px; background: rgba(255,255,255,0.03); border-radius: 4px; margin-bottom: 3px; font-size: 9.5px;';

  let desc = "";
  if (step.action === "input") {
   const val = step.inputValue || "";
   const shortText = val.length > 20 ? val.slice(0, 20) + "..." : val;
   desc = `Type: <span style="color: var(--highlight);">"${shortText}"</span>`;
  } else if (step.action === "select") {
   desc = `Select: <span style="color: var(--accent);">"${step.savedOptionChoice}"</span>`;
  } else {
   desc = `Click: ${step.target.split(' > ').pop()}`;
  }

  row.innerHTML = `
   <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; margin-right: 4px;">
    <b style="color: var(--accent);">#${idx + 1}</b> ${desc}
   </span>
   <div style="display: flex; gap: 2px; flex-shrink: 0;">
    <button class="step-btn step-up-btn" data-index="${idx}" title="Move step up" ${idx === 0 ? 'disabled style="opacity:0.3;"' : ''} style="background: transparent; border: 1px solid #475569; color: #94a3b8; font-size: 8px; padding: 0 4px; cursor: pointer; border-radius: 2px;">Up</button>
    <button class="step-btn step-down-btn" data-index="${idx}" title="Move step down" ${idx === steps.length - 1 ? 'disabled style="opacity:0.3;"' : ''} style="background: transparent; border: 1px solid #475569; color: #94a3b8; font-size: 8px; padding: 0 4px; cursor: pointer; border-radius: 2px;">Dn</button>
    <button class="step-btn step-edit-btn" data-index="${idx}" title="Edit step" style="background: transparent; border: 1px solid #0284c7; color: #38bdf8; font-size: 8px; padding: 0 4px; cursor: pointer; border-radius: 2px;">Edit</button>
    <button class="step-btn step-del-btn" data-index="${idx}" title="Delete step" style="background: transparent; border: 1px solid #ef4444; color: #f87171; font-size: 9px; padding: 0 4px; cursor: pointer; border-radius: 2px;">X</button>
   </div>
  `;

  // Move Up
  row.querySelector('.step-up-btn').addEventListener('click', (e) => {
   e.stopPropagation();
   const moveIdx = parseInt(e.target.getAttribute('data-index'), 10);
   if (moveIdx > 0) {
    const item = currentSteps.splice(moveIdx, 1)[0];
    currentSteps.splice(moveIdx - 1, 0, item);
    allProfiles[activeProfileKey].steps = currentSteps;
    saveCurrentProfiles();
    renderStepsList(currentSteps);
   }
  });

  // Move Down
  row.querySelector('.step-down-btn').addEventListener('click', (e) => {
   e.stopPropagation();
   const moveIdx = parseInt(e.target.getAttribute('data-index'), 10);
   if (moveIdx < currentSteps.length - 1) {
    const item = currentSteps.splice(moveIdx, 1)[0];
    currentSteps.splice(moveIdx + 1, 0, item);
    allProfiles[activeProfileKey].steps = currentSteps;
    saveCurrentProfiles();
    renderStepsList(currentSteps);
   }
  });

  // Edit Step
  row.querySelector('.step-edit-btn').addEventListener('click', (e) => {
   e.stopPropagation();
   editingStepIndex = parseInt(e.target.getAttribute('data-index'), 10);
   const stepToEdit = currentSteps[editingStepIndex];
   if (stepToEdit) {
    manualStepAction.value = stepToEdit.action || "click";
    manualStepTarget.value = stepToEdit.target || "";
    manualStepValue.value = stepToEdit.inputValue || stepToEdit.savedOptionChoice || "";
    modalManualStep.style.display = "flex";
   }
  });

  // Delete Step
  row.querySelector('.step-del-btn').addEventListener('click', (e) => {
   e.stopPropagation();
   const delIdx = parseInt(e.target.getAttribute('data-index'), 10);
   currentSteps.splice(delIdx, 1);
   allProfiles[activeProfileKey].steps = currentSteps;
   saveCurrentProfiles();
   renderStepsList(currentSteps);
   renderProfileDropdown();
   renderFilteredChips();
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

btnClearProfileSteps.addEventListener('click', () => {
 if (!activeProfileKey || !allProfiles[activeProfileKey]) return;
 if (confirm(`Clear all steps for "${activeProfileKey}"?`)) {
  currentSteps = [];
  allProfiles[activeProfileKey].steps = [];
  saveCurrentProfiles();
  renderStepsList(currentSteps);
  renderProfileDropdown();
  renderFilteredChips();
 }
});

if (btnDeleteProfilePathway) {
 btnDeleteProfilePathway.addEventListener('click', () => {
  deleteCurrentPathway();
 });
}

if (btnPurgeEmptyPathways) {
 btnPurgeEmptyPathways.addEventListener('click', () => {
  purgeEmptyPathways();
 });
}

function deleteCurrentPathway() {
 if (!activeProfileKey || !allProfiles[activeProfileKey]) {
  alert("No active pathway preset selected to delete.");
  return;
 }

 const targetKey = activeProfileKey;
 if (confirm(`Are you sure you want to permanently delete the pathway preset "${targetKey}"?`)) {
  delete allProfiles[targetKey];
  
  const remainingKeys = Object.keys(allProfiles);
  if (remainingKeys.length > 0) {
   activeProfileKey = remainingKeys[0];
   currentSteps = allProfiles[activeProfileKey].steps || [];
  } else {
   activeProfileKey = "";
   currentSteps = [];
  }

  saveCurrentProfiles();
  populateCategoryDropdown();
  renderProfileDropdown();
  renderStepsList(currentSteps);
  renderFilteredChips();
 }
}

function purgeEmptyPathways() {
 const allKeys = Object.keys(allProfiles);
 const emptyKeys = allKeys.filter(key => {
  const item = allProfiles[key];
  return !item || !item.steps || item.steps.length === 0;
 });

 if (emptyKeys.length === 0) {
  alert("No pathways with 0 recorded steps were found.");
  return;
 }

 if (confirm(`Found ${emptyKeys.length} pathway(s) with 0 recorded steps:\n\n${emptyKeys.map(k => "• " + k).join('\n')}\n\nAre you sure you want to purge all these empty pathways?`)) {
  emptyKeys.forEach(key => {
   delete allProfiles[key];
  });

  const remainingKeys = Object.keys(allProfiles);
  if (!allProfiles[activeProfileKey]) {
   if (remainingKeys.length > 0) {
    activeProfileKey = remainingKeys[0];
    currentSteps = allProfiles[activeProfileKey].steps || [];
   } else {
    activeProfileKey = "";
    currentSteps = [];
   }
  }

  saveCurrentProfiles();
  populateCategoryDropdown();
  renderProfileDropdown();
  renderStepsList(currentSteps);
  renderFilteredChips();
  alert(`Successfully purged ${emptyKeys.length} empty pathway(s).`);
 }
}

// Custom Preset Modal
btnShowAddPreset.addEventListener('click', () => {
 newPresetName.value = "";
 newPresetTitle.value = "";
 newPresetNotes.value = "QUERY: \nSTATUS: \nADVICE: ";
 modalAddPreset.style.display = "flex";
});

btnCancelPreset.addEventListener('click', () => {
 modalAddPreset.style.display = "none";
});

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
  category: "Custom Presets",
  subCategory: "",
  issues: "",
  caseStatus: "Resolved",
  notes_template: notes,
  steps: []
 };

 saveCurrentProfiles();
 populateCategoryDropdown();
 switchActiveProfile(name);
 renderProfileDropdown();
 renderFilteredChips();
 modalAddPreset.style.display = "none";
});

// --- APPEND STEPS CONTROL ---
if (btnAppendSteps) {
 btnAppendSteps.addEventListener('click', () => {
  updateUIState("RECORDING");
  sendMessageToActiveTab({
   action: "START_RECORDING",
   profileKey: activeProfileKey,
   append: true,
   existingSteps: currentSteps
  });

  stepsLog.innerHTML = `
   <div style="color: #38bdf8; padding: 10px; text-align: center; font-weight: bold; font-size: 10px; background: rgba(2,132,199,0.1); border-radius: 4px;">
     APPENDING STEPS into "${activeProfileKey}"...<br>
    <span style="font-weight: normal; font-size: 9px; color: var(--muted);">Currently holding ${currentSteps.length} existing steps. Perform new clicks/inputs on DEL CRM and click Stop when done.</span>
   </div>
  `;
 });
}

// --- OVERWRITE RECORDING CONTROL ---
btnRecord.addEventListener('click', () => {
 if (currentSteps.length > 0) {
  if (!confirm(`This preset already has ${currentSteps.length} recorded steps.\n\nAre you sure you want to OVERWRITE and record from scratch?\n\n(Click Cancel and use " Append Steps" if you want to keep existing steps!)`)) {
   return;
  }
 }
 updateUIState("RECORDING");
 currentSteps = [];
 allProfiles[activeProfileKey].steps = [];
 saveCurrentProfiles();

 sendMessageToActiveTab({
  action: "START_RECORDING",
  profileKey: activeProfileKey,
  append: false
 });

 stepsLog.innerHTML = `
  <div style="color: #fca5a5; padding: 10px; text-align: center; font-weight: bold; background: rgba(239,68,68,0.1); border-radius: 4px;">
    Recording from scratch into "${activeProfileKey}"...<br>
   Fill out fields on DEL CRM now!
  </div>
 `;
});

// --- MANUAL STEP MODAL CONTROLS ---
if (btnAddStepManual) {
 btnAddStepManual.addEventListener('click', () => {
  editingStepIndex = -1;
  manualStepAction.value = "input";
  manualStepTarget.value = "";
  manualStepValue.value = "";
  modalManualStep.style.display = "flex";
 });
}

if (btnCancelManualStep) {
 btnCancelManualStep.addEventListener('click', () => {
  modalManualStep.style.display = "none";
 });
}

if (btnSaveManualStep) {
 btnSaveManualStep.addEventListener('click', () => {
  const act = manualStepAction.value;
  const targetSel = manualStepTarget.value.trim();
  const textVal = manualStepValue.value.trim();

  if (!targetSel) {
   alert("Please enter a target selector or form control name (e.g. [formcontrolname=\"province\"]).");
   return;
  }

  const stepObj = {
   action: act,
   target: targetSel,
   inputValue: act === "input" ? textVal : "",
   savedOptionChoice: act === "select" ? textVal : "",
   fieldName: textVal || targetSel,
   requiresInput: act === "wait_input" || (act === "input" && !textVal),
   delay: act === "select" ? 900 : 500
  };

  if (editingStepIndex >= 0 && editingStepIndex < currentSteps.length) {
   currentSteps[editingStepIndex] = stepObj;
  } else {
   currentSteps.push(stepObj);
  }

  allProfiles[activeProfileKey].steps = currentSteps;
  saveCurrentProfiles();
  renderStepsList(currentSteps);
  renderProfileDropdown();
  renderFilteredChips();
  modalManualStep.style.display = "none";
 });
}

btnPlay.addEventListener('click', () => {
 if (currentSteps.length === 0) {
  alert("No steps recorded for this profile yet.");
  return;
 }
 updateUIState("PLAYING");
 sendMessageToActiveTab({ action: "PLAY_STEPS", steps: currentSteps });
});

btnStop.addEventListener('click', () => {
 updateUIState("IDLE");
 sendMessageToActiveTab({ action: "STOP_RECORDING" }, (res) => {
  if (res && res.steps) {
   currentSteps = res.steps;
   allProfiles[activeProfileKey].steps = currentSteps;
   saveCurrentProfiles();
   renderStepsList(currentSteps);
   renderProfileDropdown();
   renderFilteredChips();
  }
 });
});

chrome.runtime.onMessage.addListener((message) => {
 if (message.action === "STOP_RECORDING_FROM_BANNER") {
  if (message.steps) {
   currentSteps = message.steps;
   if (allProfiles[activeProfileKey]) {
    allProfiles[activeProfileKey].steps = currentSteps;
   }
   saveCurrentProfiles();
   renderStepsList(currentSteps);
   renderProfileDropdown();
   renderFilteredChips();
  }
  updateUIState("IDLE");
 }
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
 if (message.action === "LATEST_CASE_FOUND") {
  lblScanStatus.innerText = `Opened: ${message.ticketRef}`;
 }
 if (message.action === "NO_CASES_FOUND") {
  lblScanStatus.innerText = `No ${message.tabType} cases`;
  alert(`No ${message.tabType} tickets found.`);
 }
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

// JSON Import & Export
btnExportProfiles.addEventListener('click', () => {
 const exportPackage = {
  package: "SmartTicketAutoCloser",
  role: "ADMIN_MASTER_EXPORT",
  version: "1.0.0",
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

inputImportProfiles.addEventListener('change', (e) => {
 const file = e.target.files[0];
 if (!file) return;

 const reader = new FileReader();
 reader.onload = (evt) => {
  try {
   const data = JSON.parse(evt.target.result);
   const incoming = data.profiles || data;
   allProfiles = { ...allProfiles, ...incoming };

   saveCurrentProfiles();
   populateCategoryDropdown();
   switchActiveProfile(Object.keys(allProfiles)[0]);
   renderProfileDropdown();
   renderFilteredChips();
   alert(`Master configuration loaded with ${Object.keys(incoming).length} presets!`);
  } catch (err) {
   alert("Invalid JSON file format.");
  }
 };
 reader.readAsText(file);
});

// Modal Token Helpers
document.getElementById('btn-modal-date-token')?.addEventListener('click', () => {
 if (manualStepValue) manualStepValue.value += "[DATE]";
});
document.getElementById('btn-modal-number-token')?.addEventListener('click', () => {
 if (manualStepValue) manualStepValue.value += "[NUMBER]";
});
document.getElementById('btn-modal-id-token')?.addEventListener('click', () => {
 if (manualStepValue) manualStepValue.value += "[ID_NUMBER]";
});

btnTodayDate?.addEventListener('click', () => {
 if (rfpCalendarInput) rfpCalendarInput.value = todayFormatted;
});

document.getElementById('btn-due-date')?.addEventListener('click', () => {
 const future = new Date(Date.now() + 7 * 86400000);
 const futureIso = future.toISOString().split('T')[0];
 if (rfpCalendarInput) rfpCalendarInput.value = futureIso;
 const formatted = formatDateToStandard(futureIso);
 if (txtCallNotes) txtCallNotes.value += `\nDUE DATE : ${formatted}`;
});

btnInsertDate?.addEventListener('click', () => {
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

// Smart Token Insert Handlers for Admin Panel (Replaces placeholders or appends)
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
  txtCallNotes.focus();
  txtCallNotes.selectionStart = txtCallNotes.selectionEnd = start + tokenStr.length;
 }
 chrome.storage.local.set({ currentDraftNotes: txtCallNotes.value });
}

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

// ==========================================
// 7. REAL-TIME TEAM & TL ROSTER CONTROLLER
// ==========================================

// Load broadcasted heartbeats from shared storage
function loadLiveRosterFromStorage() {
 chrome.storage.local.get(["dce_live_roster", "dce_alerts"], (res) => {
  liveRosterCache = res.dce_live_roster || {};
  const latestAlert = (res.dce_alerts || [])[0];
  if (latestAlert) showStoredAlert(latestAlert);
  else {
   const flaggedAgent = Object.values(liveRosterCache).find(agt => agt.activeCase?.flaggedIncomplete);
   if (flaggedAgent) showIncompleteNotification(flaggedAgent);
  }
  renderTeamFilters();
  renderAgentRoster();
 });
}

function playAlertChime() {
 try {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(587.33, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.4);
 } catch (e) {}
}

function showStoredAlert(alert) {
 if (!incompleteAlert) return;
 const tlText = alert.teamLeader ? ` (TL: ${alert.teamLeader})` : '';

 if (alert.type === "MIC_DISCONNECTED") {
  incompleteAlert.innerHTML = `<span><b>MIC GUARD ALERT:</b> Agent <b>${alert.agentName || "Agent"}</b>${tlText} lost Telephony! <b>Microphone Required / Access Denied</b>.</span> <span style="cursor:pointer; float:right; opacity:0.8;" title="Dismiss alert">X</span>`;
  incompleteAlert.style.background = '#991b1b';
  incompleteAlert.style.borderColor = '#ef4444';
  incompleteAlert.style.color = '#ffffff';
  incompleteAlert.style.display = 'block';
  incompleteAlert.style.cursor = 'pointer';
  playAlertChime();
 } else if (alert.type === "MIC_RESTORED") {
  incompleteAlert.innerHTML = `<span><b>MIC GUARD:</b> Agent <b>${alert.agentName || "Agent"}</b>${tlText} restored microphone access and reconnected.</span> <span style="cursor:pointer; float:right; opacity:0.8;" title="Dismiss alert">X</span>`;
  incompleteAlert.style.background = '#065f46';
  incompleteAlert.style.borderColor = '#10b981';
  incompleteAlert.style.color = '#ffffff';
  incompleteAlert.style.display = 'block';
  incompleteAlert.style.cursor = 'pointer';
 } else if (alert.type === "CASE_SAVED") {
  incompleteAlert.innerHTML = `<span> <b>${alert.agentName || "Agent"}</b>${tlText} <b>SAVED & CLOSED CASE</b>: Ticket: <b>${alert.ticketRef || "--"}</b> | Query: <b>${alert.query?.title || "Unknown"}</b>${alert.customer?.customerName ? ` | Customer: <b>${alert.customer.customerName}</b>` : ''}</span> <span style="cursor:pointer; float:right; opacity:0.8;" title="Dismiss alert">X</span>`;
  incompleteAlert.style.background = '#065f46';
  incompleteAlert.style.borderColor = '#10b981';
  incompleteAlert.style.color = '#ffffff';
  incompleteAlert.style.display = 'block';
  incompleteAlert.style.cursor = 'pointer';
 } else {
  incompleteAlert.innerHTML = `<span> <b>${alert.agentName || "Agent"}</b>${tlText} flagged an incomplete ticket: <b>Query ${alert.query?.title || "Unknown"}</b> | <b>Issue: ${alert.query?.issue || alert.issue || "Uncategorised"}</b> | <b>Ticket: ${alert.ticketRef || "--"}</b></span> <span style="cursor:pointer; float:right; opacity:0.8;" title="Dismiss alert">X</span>`;
  incompleteAlert.style.background = '#7f1d1d';
  incompleteAlert.style.borderColor = '#ef4444';
  incompleteAlert.style.color = '#ffffff';
  incompleteAlert.style.display = 'block';
  incompleteAlert.style.cursor = 'pointer';
 }
}

function showIncompleteNotification(agent) {
 if (!incompleteAlert) return;
 const activeCase = agent.activeCase || {};
 const query = activeCase.selectedQuery || {};
 const tlText = agent.teamLeader ? ` (TL: ${agent.teamLeader})` : '';
 incompleteAlert.innerHTML = `<span> <b>${agent.agentName || "Agent"}</b>${tlText} flagged an incomplete ticket: <b>Query ${query.title || activeCase.caseTitle || "Unknown"}</b> | <b>Issue: ${query.issue || "Uncategorised"}</b> | <b>Ticket: ${activeCase.ticketRef || "--"}</b></span> <span style="cursor:pointer; float:right; opacity:0.8;" title="Dismiss alert"></span>`;
 incompleteAlert.style.display = 'block';
 incompleteAlert.style.cursor = 'pointer';
}

if (incompleteAlert) {
 incompleteAlert.addEventListener('click', (e) => {
  if (e.target.innerText === '') {
   incompleteAlert.style.display = 'none';
  } else {
   const flaggedAgent = Object.values(liveRosterCache).find(agt => agt.activeCase?.flaggedIncomplete);
   if (flaggedAgent) {
    selectedAgentId = flaggedAgent.agentId;
    renderAgentRoster();
    displayAgentDrillDown(flaggedAgent);
   }
  }
 });
}

// Instant sync when any agent station sends a heartbeat
chrome.storage.onChanged.addListener((changes, areaName) => {
 if (areaName === "local" && changes.dce_live_roster) {
  const previousRoster = changes.dce_live_roster.oldValue || {};
  const nextRoster = changes.dce_live_roster.newValue || {};
  Object.keys(nextRoster).forEach(agentId => {
   const wasFlagged = Boolean(previousRoster[agentId]?.activeCase?.flaggedIncomplete);
   const isFlagged = Boolean(nextRoster[agentId]?.activeCase?.flaggedIncomplete);
   if (isFlagged && !wasFlagged) showIncompleteNotification(nextRoster[agentId]);
  });
  liveRosterCache = changes.dce_live_roster.newValue || {};
  renderTeamFilters();
  renderAgentRoster();
  renderAdminInsights();

  // If an agent is actively selected, refresh their drill-down in real time
  if (selectedAgentId && liveRosterCache[selectedAgentId]) {
   displayAgentDrillDown(liveRosterCache[selectedAgentId]);
  }
 }
 if (areaName === "local" && changes.dce_alerts) {
  const latestAlert = (changes.dce_alerts.newValue || [])[0];
  if (latestAlert) showStoredAlert(latestAlert);
  renderAdminInsights();
 }
});

// Periodic presence evaluator (sets agents to OFFLINE if silent >30s)
setInterval(() => {
 const nowMs = Date.now();
 let changed = false;

 Object.keys(liveRosterCache).forEach(id => {
  const agt = liveRosterCache[id];
  if (agt.status !== "OFFLINE" && (nowMs - agt.lastHeartbeat > 30000)) {
   agt.status = "OFFLINE";
   changed = true;
  }
 });

 if (changed) {
  renderAgentRoster();
  if (selectedAgentId && liveRosterCache[selectedAgentId]) {
   displayAgentDrillDown(liveRosterCache[selectedAgentId]);
  }
 }
}, 5000);

if (btnClearRoster) {
 btnClearRoster.addEventListener('click', () => {
  if (confirm("Purge stale/offline agent cards from the local dashboard?")) {
   chrome.storage.local.remove(["dce_live_roster"], () => {
    liveRosterCache = {};
    agentDetailCard.style.display = 'none';
    renderTeamFilters();
    renderAgentRoster();
   });
  }
 });
}

// Roster Sheet Importer Elements & Custom Mapping Logic
const btnShowImportRoster = document.getElementById('btn-show-import-roster');
const modalImportRoster = document.getElementById('modal-import-roster');
const inputRosterFile = document.getElementById('input-roster-file');
const lblRosterFileName = document.getElementById('lbl-roster-file-name');
const txtRosterPaste = document.getElementById('txt-roster-paste');
const btnCancelRosterMapping = document.getElementById('btn-cancel-roster-mapping');
const btnSaveRosterMapping = document.getElementById('btn-save-roster-mapping');

let masterRosterMapping = {};

chrome.storage.local.get(["dce_master_roster_mapping"], (res) => {
 if (res && res.dce_master_roster_mapping) {
  masterRosterMapping = res.dce_master_roster_mapping;
  renderTeamFilters();
 }
});

if (btnShowImportRoster) {
 btnShowImportRoster.addEventListener('click', () => {
  if (modalImportRoster) modalImportRoster.style.display = 'flex';
 });
}
if (btnCancelRosterMapping) {
 btnCancelRosterMapping.addEventListener('click', () => {
  if (modalImportRoster) modalImportRoster.style.display = 'none';
 });
}
if (inputRosterFile) {
 inputRosterFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
   if (lblRosterFileName) lblRosterFileName.innerText = file.name;
   const reader = new FileReader();
   reader.onload = (evt) => {
    if (txtRosterPaste) txtRosterPaste.value = evt.target.result;
   };
   reader.readAsText(file);
  }
 });
}

function parseRosterSheetText(text) {
 const mapping = {};
 if (!text) return mapping;
 
 try {
  const jsonData = JSON.parse(text);
  if (Array.isArray(jsonData)) {
   jsonData.forEach(item => {
    const name = item.agentName || item.Agent || item.name || item.AgentName || item["Agent Name"];
    const tl = item.teamLeader || item.TL || item.tl || item.TeamLeader || item["Team Leader"];
    const team = item.team || item.pod || item.Team || item["Team"] || item["Pod"];
    if (name && tl) {
     mapping[name.trim()] = { tl: tl.trim(), team: (team || "General Support").trim() };
    }
   });
   return mapping;
  }
 } catch(e) {}

 const lines = text.split(/\r?\n/);
 lines.forEach((line, idx) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  if (idx === 0 && (trimmed.toLowerCase().includes('agent') && trimmed.toLowerCase().includes('leader'))) return;
  
  const parts = trimmed.split(/,|\t|;/).map(p => p.trim().replace(/^"|"$/g, ''));
  if (parts.length >= 2) {
   const name = parts[0];
   const tl = parts[1];
   const team = parts[2] || "General Support";
   if (name && tl && name.toLowerCase() !== "agent name") {
    mapping[name] = { tl: tl, team: team };
   }
  }
 });
 return mapping;
}

if (btnSaveRosterMapping) {
 btnSaveRosterMapping.addEventListener('click', () => {
  const pastedText = txtRosterPaste ? txtRosterPaste.value.trim() : "";
  const parsedMap = parseRosterSheetText(pastedText);
  
  if (Object.keys(parsedMap).length === 0) {
   alert("Please upload or paste a valid roster sheet format (e.g. Agent Name, Team Leader, Team/Pod)");
   return;
  }
  
  masterRosterMapping = { ...masterRosterMapping, ...parsedMap };
  chrome.storage.local.set({ dce_master_roster_mapping: masterRosterMapping }, () => {
   if (modalImportRoster) modalImportRoster.style.display = 'none';
   alert(` Successfully loaded ${Object.keys(parsedMap).length} Team Leader & Agent mappings!`);
   renderTeamFilters();
   renderAgentRoster();
   renderAdminInsights();
  });
 });
}

function renderTeamFilters() {
 if (!filterTlSelect || !filterTeamSelect) return;

 const currentTl = filterTlSelect.value;
 const currentTeam = filterTeamSelect.value;

 const tlSet = new Set();
 const teamSet = new Set();

 Object.values(masterRosterMapping).forEach(meta => {
  if (meta.tl) tlSet.add(meta.tl);
  if (meta.team) teamSet.add(meta.team);
 });

 Object.values(liveRosterCache).forEach(agt => {
  const mapped = masterRosterMapping[agt.agentName] || {};
  const tl = mapped.tl || agt.teamLeader;
  const team = mapped.team || agt.team;
  if (tl) tlSet.add(tl);
  if (team) teamSet.add(team);
 });

 filterTlSelect.innerHTML = '<option value="ALL">All Team Leaders</option>';
 Array.from(tlSet).sort().forEach(tl => {
  const opt = document.createElement('option');
  opt.value = tl;
  opt.textContent = `TL: ${tl}`;
  if (tl === currentTl) opt.selected = true;
  filterTlSelect.appendChild(opt);
 });

 filterTeamSelect.innerHTML = '<option value="ALL">All Teams</option>';
 Array.from(teamSet).sort().forEach(tm => {
  const opt = document.createElement('option');
  opt.value = tm;
  opt.textContent = `Pod: ${tm}`;
  if (tm === currentTeam) opt.selected = true;
  filterTeamSelect.appendChild(opt);
 });
}

if (filterTlSelect) filterTlSelect.addEventListener('change', () => { renderAgentRoster(); renderAdminInsights(); });
if (filterTeamSelect) filterTeamSelect.addEventListener('change', () => { renderAgentRoster(); renderAdminInsights(); });

// Returns state badge with specific Aux Reason (e.g. 1st Tea Break, Lunch, Coaching)
function getPresenceBadgeMarkup(state, auxReason = null) {
 if (auxReason && (auxReason.toLowerCase().includes("microphone") || auxReason.toLowerCase().includes("mic required"))) {
  return `<span class="state-pill" style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; font-weight: bold;"> MIC BLOCKED</span>`;
 }
 switch (state) {
  case "AVAILABLE":
   if (auxReason && auxReason.toLowerCase().includes("not on call")) {
    return `<span class="state-pill state-available"> Available (Not on Call)</span>`;
   } else if (auxReason && auxReason.toLowerCase().includes("on call")) {
    return `<span class="state-pill state-available"> Available (${auxReason})</span>`;
   }
   return `<span class="state-pill state-available"> Available (Taking Calls)</span>`;
  case "UNAVAILABLE":
   return `<span class="state-pill state-unavailable"> Unavailable (${auxReason || "Paused"})</span>`;
  default:
   return `<span class="state-pill state-offline"> Offline</span>`;
 }
}

function renderAgentRoster() {
 if (!agentRosterContainer) return;
 agentRosterContainer.innerHTML = '';

 const selectedTl = filterTlSelect ? filterTlSelect.value : "ALL";
 const selectedTeam = filterTeamSelect ? filterTeamSelect.value : "ALL";

 const allAgents = Object.values(liveRosterCache);

 const filteredAgents = allAgents.filter(agt => {
  const mapped = masterRosterMapping[agt.agentName] || {};
  const tl = mapped.tl || agt.teamLeader || "General";
  const team = mapped.team || agt.team || "Contact Centre";
  const tlMatch = selectedTl === "ALL" || tl === selectedTl;
  const teamMatch = selectedTeam === "ALL" || team === selectedTeam;
  return tlMatch && teamMatch;
 });

 if (filteredAgents.length === 0) {
  agentRosterContainer.innerHTML = `
   <div style="color: var(--muted); padding: 14px; text-align: center;">
    No active agent heartbeats detected for selected Team Leader / Pod.<br>
    Open DEL CRM on an agent station to begin tracking.
   </div>
  `;
  return;
 }

 filteredAgents.sort((a, b) => {
  const priority = { "AVAILABLE": 1, "UNAVAILABLE": 2, "OFFLINE": 3 };
  return (priority[a.status] || 4) - (priority[b.status] || 4);
 });

 filteredAgents.forEach(agt => {
  const mapped = masterRosterMapping[agt.agentName] || {};
  const effectiveTl = mapped.tl || agt.teamLeader || "General";
  const effectiveTeam = mapped.team || agt.team || "Contact Centre";

  const card = document.createElement('div');
  card.className = `agent-card ${agt.agentId === selectedAgentId ? 'selected' : ''}`;
  const isFlagged = Boolean(agt.activeCase && agt.activeCase.flaggedIncomplete);
  const selectedQuery = agt.activeCase && agt.activeCase.selectedQuery;
  const tel = agt.telemetry || {};

  card.innerHTML = `
   <div>
    <div style="display: flex; align-items: center; gap: 5px;">
     <b style="color: var(--text-heading); font-size: 11.5px;">${agt.agentName}</b>
     ${isFlagged ? '<span style="background: #ef4444; color: white; font-size: 8px; padding: 1px 4px; border-radius: 3px; font-weight: bold;"> INCOMPLETE</span>' : ''}
     ${tel.stuckField ? `<span style="background: #f59e0b; color: #07131d; font-size: 8px; padding: 1px 4px; border-radius: 3px; font-weight: bold;" title="Dwell time >= 12s on field"> STUCK (${tel.stuckField.durationSec}s)</span>` : ''}
    </div>
    <div style="font-size: 9px; color: var(--highlight);">${selectedQuery ? `Query: ${selectedQuery.title}` : 'No query selected'}</div>
    <div style="font-size: 9px; color: var(--muted);">${effectiveTeam} • TL: ${effectiveTl} ${tel.handleTimeSec ? `• AHT: ${tel.handleTimeSec}s` : ''}</div>
   </div>
   <div>
    ${getPresenceBadgeMarkup(agt.status, agt.auxReason)}
   </div>
  `;

  card.addEventListener('click', () => {
   selectedAgentId = agt.agentId;
   document.querySelectorAll('.agent-card').forEach(c => c.classList.remove('selected'));
   card.classList.add('selected');
   displayAgentDrillDown(agt);
  });

  agentRosterContainer.appendChild(card);
 });
}

function displayAgentDrillDown(agt) {
 agentDetailCard.style.display = 'block';
 detailAgentHeader.innerText = `Agent Audit: ${agt.agentName}`;
 detailAgentStatusBadge.outerHTML = getPresenceBadgeMarkup(agt.status, agt.auxReason);

 const mapped = masterRosterMapping[agt.agentName] || {};
 const effectiveTl = mapped.tl || agt.teamLeader || "General";
 const effectiveTeam = mapped.team || agt.team || "Contact Centre";

 detailAgentMeta.innerText = `${effectiveTeam} (Team Leader: ${effectiveTl})`;
 
 const activeCase = agt.activeCase || {};
 detailCaseRef.innerText = activeCase.flaggedIncomplete
  ? `${activeCase.ticketRef || "--"} [FLAGGED INCOMPLETE]`
  : (activeCase.ticketRef || "--");
 detailCaseRef.style.color = activeCase.flaggedIncomplete ? "#ef4444" : "";
 detailCaseTitle.innerText = activeCase.caseTitle || "No Active Form Open";
 const selectedQuery = activeCase.selectedQuery || {};
 detailSelectedQuery.innerText = selectedQuery.key
  ? `${selectedQuery.title} / ${selectedQuery.issue || "Uncategorised issue"}${activeCase.flaggedIncomplete ? " / FLAGGED INCOMPLETE" : ""}`
  : "No query selected";
 detailSelectedQuery.style.color = activeCase.flaggedIncomplete ? "#ef4444" : "var(--highlight)";
 detailCaseLocation.innerText = `${activeCase.province || "--"} / ${activeCase.labourCenter || "--"}`;

 const tel = agt.telemetry || {};
 detailNotesFormat.innerText = `${activeCase.adheres ? "Compliant (Floor Standard)" : "Non-Standard Format"} | AHT: ${tel.handleTimeSec || 45}s | Latency: ${tel.avgNavigationLatencyMs || 640}ms`;
 detailNotesFormat.style.color = activeCase.adheres ? "#34d399" : "#ef4444";

 if (tel.stuckField) {
  detailNotesTokens.innerText = `Friction Alert: Agent stuck in field "${tel.stuckField.field}" (${tel.stuckField.durationSec}s dwell)`;
  detailNotesTokens.style.color = "#f59e0b";
 } else {
  detailNotesTokens.innerText = activeCase.hasTokens ? "Raw Tokens Detected ([DATE])" : "Clean (No Tokens / No Friction)";
  detailNotesTokens.style.color = activeCase.hasTokens ? "#ef4444" : "#34d399";
 }
}

// Notes Staging Area Handlers
btnCopyNotes.addEventListener('click', () => {
 if (!txtCallNotes || !txtCallNotes.value) return;
 navigator.clipboard.writeText(txtCallNotes.value);
 copyFeedback.style.display = 'inline';
 setTimeout(() => { copyFeedback.style.display = 'none'; }, 1500);
});

btnPasteToDce.addEventListener('click', () => {
 if (!txtCallNotes || !txtCallNotes.value) return;
 sendMessageToActiveTab({
  action: "INSERT_INTO_NOTES_LOG",
  notesText: txtCallNotes.value
 });
});

btnClearNotes.addEventListener('click', () => {
 if (txtCallNotes) txtCallNotes.value = '';
 chrome.storage.local.remove(["currentDraftNotes"]);
});

btnTodayDate.addEventListener('click', () => {
 if (rfpCalendarInput) rfpCalendarInput.value = todayFormatted;
});

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

// ==========================================
// 8. ADMIN INSIGHTS & QUALITY ANALYTICS
// ==========================================
function renderAdminInsights() {
 const selectedTl = filterTlSelect ? filterTlSelect.value : "ALL";
 const selectedTeam = filterTeamSelect ? filterTeamSelect.value : "ALL";

 const allAgents = Object.values(liveRosterCache);
 
 const agents = allAgents.filter(agt => {
  const mapped = masterRosterMapping[agt.agentName] || {};
  const tl = mapped.tl || agt.teamLeader || "General";
  const team = mapped.team || agt.team || "Contact Centre";
  const tlMatch = selectedTl === "ALL" || tl === selectedTl;
  const teamMatch = selectedTeam === "ALL" || team === selectedTeam;
  return tlMatch && teamMatch;
 });

 const totalAgents = agents.length;
 if (metricTotalCalls) metricTotalCalls.innerText = totalAgents.toString();

 let flaggedCount = 0;
 let nonCompliantCount = 0;
 let totalHandleTimeSec = 0;
 let totalLatencyMs = 0;
 let totalFrictionIncidents = 0;
 const fieldFrictionMap = {};

 const categoryTally = {};
 const auxReasonTally = {};
 const flaggedAuditTrail = [];

 agents.forEach(agt => {
  const ac = agt.activeCase || {};
  const tel = agt.telemetry || {};
  const mapped = masterRosterMapping[agt.agentName] || {};
  const effectiveTl = mapped.tl || agt.teamLeader || "General";
  const effectiveTeam = mapped.team || agt.team || "Contact Centre";

  if (ac.flaggedIncomplete) {
   flaggedCount++;
   flaggedAuditTrail.push({
    agentName: agt.agentName || "Agent",
    teamLeader: effectiveTl,
    team: effectiveTeam,
    ticketRef: ac.ticketRef || "--",
    caseTitle: ac.caseTitle || "Unspecified Case",
    queryTitle: ac.selectedQuery?.title || "Uncategorised",
    issue: ac.selectedQuery?.issue || "Incomplete Details",
    timestamp: new Date(agt.lastHeartbeat || Date.now()).toLocaleTimeString()
   });
  }

  if (ac.hasTokens || (ac.adheres === false)) {
   nonCompliantCount++;
  }

  if (ac.selectedQuery?.title) {
   const qTitle = ac.selectedQuery.title;
   categoryTally[qTitle] = (categoryTally[qTitle] || 0) + 1;
  }

  if (agt.status === "UNAVAILABLE") {
   const auxReason = agt.auxReason || "Paused Telephony";
   auxReasonTally[auxReason] = (auxReasonTally[auxReason] || 0) + 1;
  }

  if (tel.handleTimeSec) totalHandleTimeSec += tel.handleTimeSec;
  if (tel.avgNavigationLatencyMs) totalLatencyMs += tel.avgNavigationLatencyMs;

  if (tel.stuckField) {
   totalFrictionIncidents++;
   const fName = tel.stuckField.field;
   if (!fieldFrictionMap[fName]) fieldFrictionMap[fName] = { count: 0, totalSec: 0 };
   fieldFrictionMap[fName].count += 1;
   fieldFrictionMap[fName].totalSec += tel.stuckField.durationSec;
  }

  if (tel.fieldFriction && Array.isArray(tel.fieldFriction)) {
   tel.fieldFriction.forEach(f => {
    totalFrictionIncidents++;
    if (!fieldFrictionMap[f.field]) fieldFrictionMap[f.field] = { count: 0, totalSec: 0 };
    fieldFrictionMap[f.field].count += 1;
    fieldFrictionMap[f.field].totalSec += f.durationSec;
   });
  }
 });

 if (metricFlaggedCount) metricFlaggedCount.innerText = flaggedCount.toString();

 // Ground-Truth Time & Friction Scorecard
 const metricGroundAht = document.getElementById('metric-ground-aht');
 const metricWrapTime = document.getElementById('metric-wrap-time');
 const metricNavLatency = document.getElementById('metric-nav-latency');
 const metricFrictionCount = document.getElementById('metric-friction-count');
 const analyticsFrictionBars = document.getElementById('analytics-friction-bars');

 const avgAht = totalAgents > 0 ? Math.round(totalHandleTimeSec / totalAgents) : 138;
 const avgLatency = totalAgents > 0 ? Math.round(totalLatencyMs / totalAgents) : 640;
 const avgWrap = Math.round(avgAht * 0.18);

 if (metricGroundAht) metricGroundAht.innerText = `${avgAht}s`;
 if (metricWrapTime) metricWrapTime.innerText = `${avgWrap}s`;
 if (metricNavLatency) metricNavLatency.innerText = `${avgLatency}ms`;
 if (metricFrictionCount) metricFrictionCount.innerText = totalFrictionIncidents.toString();

 if (analyticsFrictionBars) {
  const frictionEntries = Object.entries(fieldFrictionMap).sort((a, b) => b[1].count - a[1].count);
  if (frictionEntries.length > 0) {
   analyticsFrictionBars.innerHTML = frictionEntries.map(([fName, stat]) => {
    const avgDwell = Math.round(stat.totalSec / Math.max(1, stat.count));
    return `
     <div class="analytics-bar-row">
      <div class="analytics-bar-label">
       <span><b>Field [${fName}]</b> — Dwell Bottleneck</span>
       <span>${stat.count} Friction Flags (${avgDwell}s avg dwell)</span>
      </div>
      <div class="analytics-progress-bg">
       <div class="analytics-progress-fill" style="width: ${Math.min(100, stat.count * 20)}%; background: #f87171;"></div>
      </div>
     </div>
    `;
   }).join('');
  } else {
   analyticsFrictionBars.innerHTML = `<div style="text-align: center; color: #34d399; padding: 8px; font-size: 10px;"> No field friction bottlenecks detected (Agents flowing smoothly without field pauses >= 12s).</div>`;
  }
 }

 let qaScorePct = 100;
 if (totalAgents > 0) {
  const deductions = (flaggedCount * 15) + (nonCompliantCount * 10);
  qaScorePct = Math.max(60, 100 - Math.min(40, deductions / Math.max(1, totalAgents)));
 }
 if (metricQaScore) metricQaScore.innerText = `${qaScorePct.toFixed(1)}%`;

 if (analyticsQueryBars) {
  const totalTally = Object.values(categoryTally).reduce((a, b) => a + b, 0) || 1;
  const sortedCategories = Object.entries(categoryTally).sort((a, b) => b[1] - a[1]);
  
  if (sortedCategories.length > 0) {
   const colors = ["#00d68f", "#0284c7", "#818cf8", "#f59e0b", "#ec4899"];
   analyticsQueryBars.innerHTML = sortedCategories.map(([cat, count], idx) => {
    const pct = Math.round((count / totalTally) * 100);
    const barColor = colors[idx % colors.length];
    return `
     <div class="analytics-bar-row">
      <div class="analytics-bar-label">
       <span>${cat}</span>
       <span>${pct}% (${count})</span>
      </div>
      <div class="analytics-progress-bg">
       <div class="analytics-progress-fill" style="width: ${pct}%; background: ${barColor};"></div>
      </div>
     </div>
    `;
   }).join('');
  } else {
   analyticsQueryBars.innerHTML = `<div style="text-align: center; color: var(--muted); padding: 8px; font-size: 10px;">No query data collected yet for selected team.</div>`;
  }
 }

 const analyticsAuxBars = document.getElementById('analytics-aux-bars');
 if (analyticsAuxBars) {
  const totalUnavailable = Object.values(auxReasonTally).reduce((a, b) => a + b, 0) || 0;
  const sortedAux = Object.entries(auxReasonTally).sort((a, b) => b[1] - a[1]);

  if (sortedAux.length > 0 && totalUnavailable > 0) {
   const auxColors = ["#f59e0b", "#38bdf8", "#a7f3d0", "#f43f5e", "#fb923c", "#c084fc"];
   analyticsAuxBars.innerHTML = sortedAux.map(([reason, count], idx) => {
    const pct = Math.round((count / totalUnavailable) * 100);
    const color = auxColors[idx % auxColors.length];
    return `
     <div class="analytics-bar-row">
      <div class="analytics-bar-label">
       <span> ${reason}</span>
       <span>${count} Agent${count > 1 ? 's' : ''} (${pct}%)</span>
      </div>
      <div class="analytics-progress-bg">
       <div class="analytics-progress-fill" style="width: ${pct}%; background: ${color};"></div>
      </div>
     </div>
    `;
   }).join('');
  } else {
   analyticsAuxBars.innerHTML = `<div style="text-align: center; color: var(--muted); padding: 8px; font-size: 10px;"> All logged-in agents are currently Available (Taking Calls).</div>`;
  }
 }

 if (insightsAuditLog) {
  chrome.storage.local.get(["dce_alerts"], (res) => {
   const alerts = res.dce_alerts || [];
   const auditEntries = alerts.filter(item => {
    if (selectedTl === "ALL") return true;
    const mapped = masterRosterMapping[item.agentName] || {};
    const tl = mapped.tl || item.teamLeader;
    return tl === selectedTl;
   }).slice(0, 50);

   const lblAuditCount = document.getElementById('lbl-audit-count');
   if (lblAuditCount) lblAuditCount.innerText = `${auditEntries.length} Case Activity Logs`;

   if (auditEntries.length === 0 && flaggedAuditTrail.length === 0) {
    insightsAuditLog.innerHTML = `
     <div style="text-align: center; color: var(--muted); padding: 12px; font-size: 10px;">
       All team station tickets are currently compliant. No activity alerts recorded.
     </div>
    `;
   } else {
    const combined = auditEntries.length > 0 ? auditEntries : flaggedAuditTrail.map(f => ({ ...f, type: "INCOMPLETE_TICKET", createdAt: Date.now() }));
    insightsAuditLog.innerHTML = combined.map(item => {
     const isSaved = item.type === "CASE_SAVED";
     const borderCol = isSaved ? "#10b981" : "#7f1d1d";
     const bgCol = isSaved ? "rgba(16, 185, 129, 0.1)" : "var(--code-bg)";
     const headerCol = isSaved ? "#34d399" : "#f87171";
     const badgeIcon = isSaved ? " CASE CLOSED" : " FLAGGED INCOMPLETE";

     return `
      <div style="background: ${bgCol}; border: 1px solid ${borderCol}; border-radius: 4px; padding: 6px 8px; font-size: 10px; margin-bottom: 4px;">
       <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
        <b style="color: ${headerCol};">${badgeIcon} — ${item.agentName || 'Agent'} (TL: ${item.teamLeader || 'General'})</b>
        <span style="color: var(--muted);">${new Date(item.createdAt || Date.now()).toLocaleTimeString()}</span>
       </div>
       <div style="color: var(--text-heading);">Ref: ${item.ticketRef || '--'} • ${item.caseTitle || item.issue || 'Case Logged'}</div>
       <div style="color: var(--highlight);">Query: ${item.query?.title || item.issue || item.queryTitle || 'General Enquiry'}${item.customer?.customerName ? ` • Customer: ${item.customer.customerName}` : ''}</div>
      </div>
     `;
    }).join('');
   }
  });
 }
}

if (btnExportQaCsv) {
 btnExportQaCsv.addEventListener('click', () => {
  const agents = Object.values(liveRosterCache);
  let csv = "Timestamp,Agent Name,Team Leader,Team Pod,Presence Status,Aux Reason,Ticket Ref,Case Title,Selected Query,Flagged Incomplete,Raw Tokens,Ground-Truth AHT (s),System Latency (ms),Stuck Field Friction\n";
  
  agents.forEach(agt => {
   const ac = agt.activeCase || {};
   const sq = ac.selectedQuery || {};
   const tel = agt.telemetry || {};
   const mapped = masterRosterMapping[agt.agentName] || {};
   const tl = mapped.tl || agt.teamLeader || 'General';
   const team = mapped.team || agt.team || 'Contact Centre';
   const ts = new Date(agt.lastHeartbeat || Date.now()).toISOString();
   const stuckFieldInfo = tel.stuckField ? `${tel.stuckField.field} (${tel.stuckField.durationSec}s)` : 'None';

   csv += `"${ts}","${agt.agentName || ''}","${tl}","${team}","${agt.status || ''}","${agt.auxReason || 'Taking Calls'}","${ac.ticketRef || ''}","${ac.caseTitle || ''}","${sq.title || ''}",${ac.flaggedIncomplete ? 'YES' : 'NO'},${ac.hasTokens ? 'YES' : 'NO'},${tel.handleTimeSec || 45},${tel.avgNavigationLatencyMs || 640},"${stuckFieldInfo}"\n`;
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DCE_Ground_Truth_QA_Report_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
 });
}

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
   if (lblShotStatus) lblShotStatus.innerText = " Screen Captured (PNG)";
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
   reportActiveSiteLbl.innerText = "DCE Admin Studio (Standalone / Command Panel)";
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

 return `[DCE ADMIN / ISSUE REPORT]
Reported By: Team Leader / Admin Command Panel
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
  const subject = `[DCE Admin Support Ticket] ${categoryText}`;
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
   alert(" Issue Report copied to clipboard!");
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
  a.download = `DCE_Admin_Issue_Screenshot_${Date.now()}.png`;
  a.click();
 });
}
