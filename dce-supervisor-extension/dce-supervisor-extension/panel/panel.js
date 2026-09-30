let liveRosterCache = {};
let masterRosterMapping = {};
let selectedAgentId = null;
let currentCapturedDataUrl = "";

const connectionBadge = document.getElementById("connection-badge");
const selectPodFilter = document.getElementById("select-pod-filter");
const btnThemeToggle = document.getElementById("btn-theme-toggle");

const btnTabRoster = document.getElementById("btn-tab-roster");
const btnTabInsights = document.getElementById("btn-tab-insights");
const viewTabRoster = document.getElementById("view-tab-roster");
const viewTabInsights = document.getElementById("view-tab-insights");

const rosterTableBody = document.getElementById("roster-table-body");
const kpiOnlineCnt = document.getElementById("kpi-online-cnt");
const kpiActiveCnt = document.getElementById("kpi-active-cnt");
const kpiAuxCnt = document.getElementById("kpi-aux-cnt");
const kpiFlaggedCnt = document.getElementById("kpi-flagged-cnt");
const flaggedAlertStream = document.getElementById("flagged-alert-stream");

const insightAvgAht = document.getElementById("insight-avg-aht");
const insightAvgLatency = document.getElementById("insight-avg-latency");
const insightStuckCnt = document.getElementById("insight-stuck-cnt");
const insightQaRate = document.getElementById("insight-qa-rate");
const lblBarAhtPct = document.getElementById("lbl-bar-aht-pct");
const barAhtFill = document.getElementById("bar-aht-fill");
const lblBarLatencyPct = document.getElementById("lbl-bar-latency-pct");
const barLatencyFill = document.getElementById("bar-latency-fill");
const lblBarStuckPct = document.getElementById("lbl-bar-stuck-pct");
const barStuckFill = document.getElementById("bar-stuck-fill");
const btnRefreshInsights = document.getElementById("btn-refresh-insights");

const modalNudgeAgent = document.getElementById("modal-nudge-agent");
const btnCloseNudgeModal = document.getElementById("btn-close-nudge-modal");
const btnCancelNudge = document.getElementById("btn-cancel-nudge");
const btnSendNudge = document.getElementById("btn-send-nudge");
const nudgeTargetAgentLbl = document.getElementById("nudge-target-agent-lbl");
const selectPresetNudge = document.getElementById("select-preset-nudge");
const txtCustomNudge = document.getElementById("txt-custom-nudge");

const modalAgentCard = document.getElementById("modal-agent-card");
const btnCloseCardModal = document.getElementById("btn-close-card-modal");
const cardModalContent = document.getElementById("card-modal-content");

const modalRosterImport = document.getElementById("modal-roster-import");
const btnOpenRosterImport = document.getElementById("btn-open-roster-import");
const btnCloseImportModal = document.getElementById("btn-close-import-modal");
const btnCancelImport = document.getElementById("btn-cancel-import");
const btnSaveRosterImport = document.getElementById("btn-save-roster-import");
const txtRosterImportData = document.getElementById("txt-roster-import-data");
const btnExportQaCsv = document.getElementById("btn-export-qa-csv");

// Tab Switching
btnTabRoster?.addEventListener("click", () => {
 btnTabRoster.classList.add("active");
 btnTabInsights.classList.remove("active");
 viewTabRoster.classList.add("active");
 viewTabInsights.classList.remove("active");
});

btnTabInsights?.addEventListener("click", () => {
 btnTabInsights.classList.add("active");
 btnTabRoster.classList.remove("active");
 viewTabInsights.classList.add("active");
 viewTabRoster.classList.remove("active");
 renderSupervisorInsights();
});

btnRefreshInsights?.addEventListener("click", renderSupervisorInsights);

// Theme Switcher
function setTheme(theme) {
 document.documentElement.setAttribute("data-theme", theme);
 localStorage.setItem("dce_supervisor_theme", theme);
 if (btnThemeToggle) btnThemeToggle.innerText = theme === "dark" ? " Light" : " Dark";
}
setTheme(localStorage.getItem("dce_supervisor_theme") || "dark");
btnThemeToggle?.addEventListener("click", () => {
 setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
});

// Active Target Tab Lookup
async function getTargetTab() {
 const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
 if (activeTabs.length > 0 && activeTabs[0].url && activeTabs[0].url.startsWith("http")) {
  return activeTabs[0];
 }
 const allWebTabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
 const platformTab = allWebTabs.find(t => t.url && (
  t.url.includes("telviva") || t.url.includes("altdesk") || t.url.includes("alteram") || t.url.includes("crm") || t.url.includes("desk")
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

// Connection Checker
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
     updateConnectionUI(false, ` DISCONNECTED (${websiteLabel})`);
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
 if (!connectionBadge) return;
 if (connected) {
  connectionBadge.className = "status-badge-connected";
  connectionBadge.innerText = customText || " CONNECTED";
 } else {
  connectionBadge.className = "status-badge-disconnected";
  connectionBadge.innerText = customText || " DISCONNECTED";
 }
}
setInterval(checkDceConnection, 2500);
checkDceConnection();

// Load Live Roster & Master Mapping
function loadLiveRosterFromStorage() {
 chrome.storage.local.get(["dce_live_roster", "dce_master_roster", "dce_alerts"], (res) => {
  liveRosterCache = res.dce_live_roster || {};
  masterRosterMapping = res.dce_master_roster || {};
  const latestAlert = (res.dce_alerts || [])[0];
  if (latestAlert) showStoredAlert(latestAlert);
  renderTeamFilters();
  renderAgentRoster();
  if (viewTabInsights && viewTabInsights.classList.contains("active")) {
   renderSupervisorInsights();
  }
 });
}

function showStoredAlert(alert) {
 if (!flaggedAlertStream) return;
 const tlText = alert.teamLeader ? ` (TL: ${alert.teamLeader})` : '';
 if (alert.type === "MIC_DISCONNECTED") {
  flaggedAlertStream.innerHTML = `<span><b>MIC GUARD ALERT:</b> Agent <b>${alert.agentName || "Agent"}</b>${tlText} lost telephony! <b>Microphone Required / Access Denied</b>.</span> <span style="cursor:pointer; float:right;" title="Dismiss">X</span>`;
  flaggedAlertStream.style.background = 'rgba(239, 68, 68, 0.2)';
  flaggedAlertStream.style.borderColor = '#ef4444';
  flaggedAlertStream.style.color = '#fca5a5';
  flaggedAlertStream.style.display = 'block';
 } else if (alert.type === "ONE_WAY_AUDIO") {
  flaggedAlertStream.innerHTML = `<span><b>ONE-WAY AUDIO ALERT:</b> Agent <b>${alert.agentName || "Agent"}</b>${tlText} outbound voice stalled! <b>Client cannot hear agent</b>.</span> <span style="cursor:pointer; float:right;" title="Dismiss">X</span>`;
  flaggedAlertStream.style.background = 'rgba(234, 179, 8, 0.2)';
  flaggedAlertStream.style.borderColor = '#eab308';
  flaggedAlertStream.style.color = '#fde047';
  flaggedAlertStream.style.display = 'block';
 } else if (alert.type === "MIC_RESTORED") {
  flaggedAlertStream.innerHTML = `<span><b>MIC GUARD:</b> Agent <b>${alert.agentName || "Agent"}</b>${tlText} restored microphone access.</span> <span style="cursor:pointer; float:right;" title="Dismiss">X</span>`;
  flaggedAlertStream.style.background = 'rgba(16, 185, 129, 0.15)';
  flaggedAlertStream.style.borderColor = '#10b981';
  flaggedAlertStream.style.color = '#10b981';
  flaggedAlertStream.style.display = 'block';
 } else if (alert.type === "CASE_SAVED") {
  flaggedAlertStream.innerHTML = `<span> <b>${alert.agentName || "Agent"}</b>${tlText} <b>SAVED CASE</b>: Ticket: <b>${alert.ticketRef || "--"}</b> | Query: <b>${alert.query?.title || "Unknown"}</b></span> <span style="cursor:pointer; float:right;" title="Dismiss">X</span>`;
  flaggedAlertStream.style.background = 'rgba(16, 185, 129, 0.15)';
  flaggedAlertStream.style.borderColor = '#10b981';
  flaggedAlertStream.style.color = '#10b981';
  flaggedAlertStream.style.display = 'block';
 } else {
  flaggedAlertStream.innerHTML = `<span> <b>${alert.agentName || "Agent"}</b>${tlText} flagged an incomplete ticket: <b>Query ${alert.query?.title || "Unknown"}</b> | <b>Ticket: ${alert.ticketRef || "--"}</b></span> <span style="cursor:pointer; float:right;" title="Dismiss">X</span>`;
  flaggedAlertStream.style.background = 'rgba(239, 68, 68, 0.15)';
  flaggedAlertStream.style.borderColor = '#ef4444';
  flaggedAlertStream.style.color = '#ef4444';
  flaggedAlertStream.style.display = 'block';
 }
}

flaggedAlertStream?.addEventListener("click", (e) => {
 if (e.target.innerText === "") flaggedAlertStream.style.display = "none";
});

function renderTeamFilters() {
 if (!selectPodFilter) return;
 const currentVal = selectPodFilter.value;
 const teamLeaders = new Set();
 Object.values(liveRosterCache).forEach(agent => {
  const mapped = masterRosterMapping[agent.agentName] || {};
  const tl = mapped.tl || agent.teamLeader;
  if (tl) teamLeaders.add(tl);
 });
 selectPodFilter.innerHTML = '<option value="ALL"> All Team Leaders / Pods</option>';
 Array.from(teamLeaders).sort().forEach(tl => {
  const opt = document.createElement("option");
  opt.value = tl;
  opt.textContent = ` TL: ${tl}`;
  if (tl === currentVal) opt.selected = true;
  selectPodFilter.appendChild(opt);
 });
}

selectPodFilter?.addEventListener("change", () => {
 renderAgentRoster();
 renderSupervisorInsights();
});

function formatTimer(sec) {
 if (!sec || sec < 0) return "00:00";
 const m = Math.floor(sec / 60);
 const s = sec % 60;
 return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function renderAgentRoster() {
 if (!rosterTableBody) return;
 const allAgents = Object.values(liveRosterCache);
 const selectedTl = selectPodFilter ? selectPodFilter.value : "ALL";
 const now = Date.now();

 const filteredAgents = allAgents.filter(agent => {
  if (selectedTl === "ALL") return true;
  const mapped = masterRosterMapping[agent.agentName] || {};
  const tl = mapped.tl || agent.teamLeader;
  return tl === selectedTl;
 });

 // KPI Calculations
 const onlineList = filteredAgents.filter(a => (now - (a.lastHeartbeat || 0)) < 35000);
 const activeList = onlineList.filter(a => a.status === "AVAILABLE" || a.status === "IN_CALL");
 const auxList = onlineList.filter(a => a.status !== "AVAILABLE" && a.status !== "IN_CALL");
 const flaggedList = onlineList.filter(a => a.activeCase?.flaggedIncomplete);

 if (kpiOnlineCnt) kpiOnlineCnt.innerText = onlineList.length;
 if (kpiActiveCnt) kpiActiveCnt.innerText = activeList.length;
 if (kpiAuxCnt) kpiAuxCnt.innerText = auxList.length;
 if (kpiFlaggedCnt) kpiFlaggedCnt.innerText = flaggedList.length;

 if (filteredAgents.length === 0) {
  rosterTableBody.innerHTML = `
   <tr>
    <td colspan="7" style="text-align: center; color: var(--muted); padding: 15px;">
     No active agent stations online under ${selectedTl === "ALL" ? "the floor roster" : selectedTl}.
    </td>
   </tr>
  `;
  return;
 }

 rosterTableBody.innerHTML = "";
 filteredAgents.forEach(agt => {
  const isOnline = (now - (agt.lastHeartbeat || 0)) < 35000;
  const mapped = masterRosterMapping[agt.agentName] || {};
  const tlName = mapped.tl || agt.teamLeader || "General";
  const statusVal = isOnline ? (agt.status || "AVAILABLE") : "OFFLINE";
  const auxReason = agt.auxReason || (statusVal === "AVAILABLE" ? "In-Call / Taking Calls" : "Auxiliary");

  const auxSec = Math.floor((now - (agt.auxStartTime || agt.lastHeartbeat || now)) / 1000);
  const isOverAux = (statusVal !== "AVAILABLE" && statusVal !== "OFFLINE" && auxSec > 900); // > 15 mins

  let pillClass = "pill-avail";
  if (auxReason && (auxReason.toLowerCase().includes("microphone") || auxReason.toLowerCase().includes("mic required"))) {
   pillClass = "pill-over-aux";
  } else if (statusVal !== "AVAILABLE" && statusVal !== "OFFLINE") {
   pillClass = isOverAux ? "pill-over-aux" : "pill-aux";
  }

  const ac = agt.activeCase || {};
  const queryTitle = ac.selectedQuery?.title || ac.caseTitle || "--";
  const ticketRef = ac.ticketRef || "--";
  const flaggedTag = ac.flaggedIncomplete ? `<span class="stuck-tag"> FLAGGED</span>` : "";

  const tel = agt.telemetry || {};
  const latencyMs = tel.avgNavigationLatencyMs ? `${tel.avgNavigationLatencyMs}ms` : "--";
  const handleSec = tel.handleTimeSec ? `${tel.handleTimeSec}s` : "--";

  let stuckHtml = "--";
  if (tel.stuckField && tel.stuckField.durationSec > 120) {
   stuckHtml = `<span class="stuck-tag"> ${tel.stuckField.field} (${formatTimer(tel.stuckField.durationSec)})</span>`;
  }

  const row = document.createElement("tr");
  row.innerHTML = `
   <td>
    <div style="font-weight: bold; color: var(--text);">${agt.agentName || "Agent Station"}</div>
    <div style="font-size: 8.5px; color: var(--muted);">${isOnline ? " Station Online" : " Station Offline"}</div>
   </td>
   <td>
    <div style="color: var(--accent); font-weight: 600;">${tlName}</div>
   </td>
   <td>
    <span class="status-pill ${pillClass}">
     ${statusVal !== "AVAILABLE" ? `${auxReason} (${formatTimer(auxSec)})` : " Available"}
    </span>
   </td>
   <td>
    <div style="font-weight: 600; color: var(--text);">${ticketRef} ${flaggedTag}</div>
    <div style="font-size: 9px; color: var(--muted); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${queryTitle}</div>
   </td>
   <td>
    <div> ${formatTimer(handleSec)}</div>
    <div style="font-size: 8.5px; color: var(--muted);">${latencyMs}ms latency</div>
   </td>
   <td>${stuckHtml}</td>
   <td>
    <button class="btn btn-nudge" data-id="${agt.agentId}" data-name="${agt.agentName}" style="padding: 2px 6px; font-size: 9px; border-color: #38bdf8; color: #38bdf8;"> Nudge</button>
    <button class="btn btn-card" data-id="${agt.agentId}" style="padding: 2px 6px; font-size: 9px;"> Card</button>
   </td>
  `;

  row.querySelector(".btn-nudge").addEventListener("click", () => openNudgeModal(agt));
  row.querySelector(".btn-card").addEventListener("click", () => openAgentCardModal(agt));
  rosterTableBody.appendChild(row);
 });
}

// Floor Insights Telemetry Calculator
function renderSupervisorInsights() {
 const allAgents = Object.values(liveRosterCache);
 const selectedTl = selectPodFilter ? selectPodFilter.value : "ALL";

 const agents = allAgents.filter(agent => {
  if (selectedTl === "ALL") return true;
  const mapped = masterRosterMapping[agent.agentName] || {};
  const tl = mapped.tl || agent.teamLeader;
  return tl === selectedTl;
 });

 if (agents.length === 0) {
  if (insightAvgAht) insightAvgAht.innerText = "--";
  if (insightAvgLatency) insightAvgLatency.innerText = "--";
  if (insightStuckCnt) insightStuckCnt.innerText = "0";
  if (insightQaRate) insightQaRate.innerText = "100%";
  if (barAhtFill) barAhtFill.style.width = "0%";
  if (barLatencyFill) barLatencyFill.style.width = "0%";
  if (barStuckFill) barStuckFill.style.width = "0%";
  return;
 }

 let totalAhtSec = 0;
 let totalLatencyMs = 0;
 let stuckCount = 0;
 let flaggedCount = 0;

 agents.forEach(agt => {
  const tel = agt.telemetry || {};
  totalAhtSec += tel.handleTimeSec || 45;
  totalLatencyMs += tel.avgNavigationLatencyMs || 640;
  if (tel.stuckField && tel.stuckField.durationSec > 120) stuckCount++;
  if (agt.activeCase?.flaggedIncomplete) flaggedCount++;
 });

 const avgAht = Math.round(totalAhtSec / agents.length);
 const avgLatency = Math.round(totalLatencyMs / agents.length);
 const qaRatePct = Math.max(0, Math.round(((agents.length - flaggedCount) / agents.length) * 100));

 if (insightAvgAht) insightAvgAht.innerText = formatTimer(avgAht);
 if (insightAvgLatency) insightAvgLatency.innerText = `${avgLatency}ms`;
 if (insightStuckCnt) insightStuckCnt.innerText = stuckCount;
 if (insightQaRate) insightQaRate.innerText = `${qaRatePct}%`;

 // Progress Bar Calculations
 const ahtTargetPct = Math.min(100, Math.round((avgAht / 240) * 100)); // Target 240s
 const latencyTargetPct = Math.min(100, Math.round((avgLatency / 1000) * 100)); // Target 1000ms
 const stuckPct = Math.min(100, Math.round((stuckCount / agents.length) * 100));

 if (lblBarAhtPct) lblBarAhtPct.innerText = `${ahtTargetPct}%`;
 if (barAhtFill) barAhtFill.style.width = `${ahtTargetPct}%`;

 if (lblBarLatencyPct) lblBarLatencyPct.innerText = `${latencyTargetPct}%`;
 if (barLatencyFill) barLatencyFill.style.width = `${latencyTargetPct}%`;

 if (lblBarStuckPct) lblBarStuckPct.innerText = `${stuckPct}%`;
 if (barStuckFill) barStuckFill.style.width = `${stuckPct}%`;
}

// Nudge Modal Handlers
function openNudgeModal(agt) {
 selectedAgentId = agt.agentId;
 if (nudgeTargetAgentLbl) nudgeTargetAgentLbl.innerHTML = `Target Agent: <b style="color:var(--accent);">${agt.agentName}</b> (Station ID: ${agt.agentId})`;
 if (modalNudgeAgent) modalNudgeAgent.style.display = "flex";
}

selectPresetNudge?.addEventListener("change", () => {
 if (selectPresetNudge.value !== "CUSTOM" && txtCustomNudge) {
  txtCustomNudge.value = selectPresetNudge.options[selectPresetNudge.selectedIndex].text;
 }
});

btnSendNudge?.addEventListener("click", () => {
 const msgText = txtCustomNudge?.value.trim() || selectPresetNudge?.value;
 if (!msgText || msgText === "CUSTOM") {
  alert("Please select or type a nudge message for the agent.");
  return;
 }
 const nudgeData = {
  agentId: selectedAgentId,
  sender: "Floor Supervisor",
  message: msgText,
  timestamp: Date.now()
 };
 chrome.storage.local.set({ dce_tl_nudge: nudgeData }, () => {
  alert(` Nudge sent to agent station screen!`);
  if (modalNudgeAgent) modalNudgeAgent.style.display = "none";
 });
});

btnCloseNudgeModal?.addEventListener("click", () => modalNudgeAgent.style.display = "none");
btnCancelNudge?.addEventListener("click", () => modalNudgeAgent.style.display = "none");

// Agent Station Card Modal
function openAgentCardModal(agt) {
 if (!cardModalContent) return;
 const ac = agt.activeCase || {};
 const query = ac.selectedQuery || {};
 const tel = agt.telemetry || {};

 cardModalContent.innerHTML = `
  <div style="background: rgba(255,255,255,0.03); padding: 8px; border-radius: 4px; margin-bottom: 8px;">
   <div style="font-size: 13px; font-weight: bold; color: var(--accent);">${agt.agentName || "Agent Station"}</div>
   <div style="color: var(--muted);">Team Leader: <b>${agt.teamLeader || "General"}</b> | Status: <b>${agt.status || "AVAILABLE"}</b></div>
  </div>
  <div style="margin-bottom: 8px;">
   <div style="font-weight: bold; color: var(--text); margin-bottom: 4px;"> Active Case & Ticket Details:</div>
   <div>Ticket Reference: <b>${ac.ticketRef || "--"}</b> ${ac.flaggedIncomplete ? '<span class="stuck-tag"> Incomplete</span>' : ''}</div>
   <div>Selected Query: <b>${query.title || ac.caseTitle || "--"}</b></div>
   <div>Customer Name: <b>${ac.customerName || "--"}</b></div>
  </div>
  <div style="margin-bottom: 8px;">
   <div style="font-weight: bold; color: var(--text); margin-bottom: 4px;"> Live Call Notes Preview:</div>
   <textarea readonly class="select-ctl" style="width:100%; height:70px;">${ac.draftNotes || ac.notesText || "No notes staged yet..."}</textarea>
  </div>
  <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--muted);">
   <span>Handle Time: <b>${tel.handleTimeSec ? formatTimer(tel.handleTimeSec) : "--"}</b></span>
   <span>Avg Latency: <b>${tel.avgNavigationLatencyMs ? `${tel.avgNavigationLatencyMs}ms` : "--"}</b></span>
  </div>
 `;

 if (modalAgentCard) modalAgentCard.style.display = "flex";
}
btnCloseCardModal?.addEventListener("click", () => modalAgentCard.style.display = "none");

// Roster Importer Modal Handlers
btnOpenRosterImport?.addEventListener("click", () => {
 if (modalRosterImport) modalRosterImport.style.display = "flex";
});
btnCloseImportModal?.addEventListener("click", () => modalRosterImport.style.display = "none");
btnCancelImport?.addEventListener("click", () => modalRosterImport.style.display = "none");

btnSaveRosterImport?.addEventListener("click", () => {
 const text = txtRosterImportData?.value.trim();
 if (!text) {
  alert("Please paste roster CSV/table text.");
  return;
 }
 const lines = text.split("\n");
 const mapping = {};
 lines.forEach(line => {
  const parts = line.split(",").map(p => p.trim().replace(/^"/, '').replace(/"$/, ''));
  if (parts.length >= 2 && parts[0].toLowerCase() !== "agent name") {
   mapping[parts[0]] = { agentName: parts[0], tl: parts[1], team: parts[2] || "Contact Centre" };
  }
 });
 masterRosterMapping = mapping;
 chrome.storage.local.set({ dce_master_roster: mapping }, () => {
  alert(`Loaded master roster mapping for ${Object.keys(mapping).length} agents!`);
  if (modalRosterImport) modalRosterImport.style.display = "none";
  renderTeamFilters();
  renderAgentRoster();
  renderSupervisorInsights();
 });
});

// Ground-Truth QA CSV Export
btnExportQaCsv?.addEventListener("click", () => {
 chrome.storage.local.get(["dce_live_roster", "dce_master_roster"], (res) => {
  const roster = Object.values(res.dce_live_roster || {});
  let csv = "Timestamp,Agent Name,Team Leader,Team,Status,Aux Reason,Ticket Ref,Case Title,Query Name,Flagged Incomplete,Has Raw Tokens,Handle Time (s),Avg Latency (ms),Stuck Field Info\n";

  roster.forEach(agt => {
   const ac = agt.activeCase || {};
   const sq = ac.selectedQuery || {};
   const tel = agt.telemetry || {};
   const mapped = masterRosterMapping[agt.agentName] || {};
   const tl = mapped.tl || agt.teamLeader || 'General';
   const team = mapped.team || agt.team || 'Contact Centre';
   const ts = new Date(agt.lastHeartbeat || Date.now()).toISOString();
   const stuckFieldInfo = tel.stuckField ? `${tel.stuckField.field} (${tel.stuckField.durationSec}s)` : 'None';

   csv += `"${ts}","${agt.agentName || ''}","${tl}","${team}","${agt.status || ''}","${agt.auxReason || 'Taking Calls'}","${ac.ticketRef || ''}","${ac.caseTitle || ''}","${sq.title || ''}",${ac.flaggedIncomplete ? 'YES' : 'NO'},${ac.hasTokens ? 'YES' : 'NO'},${tel.handleTimeSec || 0},${tel.avgNavigationLatencyMs || 0},"${stuckFieldInfo}"\n`;
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `DCE_Floor_Supervisor_QA_Report_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
 });
});

// Auto-Screenshot & Report Issue Controller
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
   reportActiveSiteLbl.innerText = "DCE Supervisor Console (Standalone / Command Panel)";
  }
 }
}

btnOpenReportIssue?.addEventListener('click', () => {
 if (modalReportIssue) modalReportIssue.style.display = 'flex';
 updateReportActiveSiteInfo();
 captureActiveTabScreenshot();
});
btnCloseReportModal?.addEventListener('click', () => {
 if (modalReportIssue) modalReportIssue.style.display = 'none';
});
btnRecaptureShot?.addEventListener('click', captureActiveTabScreenshot);

selectIssueCategory?.addEventListener('change', () => {
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

selectSupportEmail?.addEventListener('change', () => {
 if (inputCustomEmail) {
  inputCustomEmail.style.display = (selectSupportEmail.value === "CUSTOM") ? "block" : "none";
 }
});

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

 return `[DCE SUPERVISOR / ISSUE REPORT]
Reported By: Floor Supervisor / Team Leader
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

btnSendEmailReport?.addEventListener('click', () => {
 const recipient = getRecipientEmail();
 const categoryText = selectIssueCategory ? selectIssueCategory.options[selectIssueCategory.selectedIndex].text : "Issue Report";
 const subject = `[DCE Supervisor Support Ticket] ${categoryText}`;
 const body = buildStructuredReportBody();
 const mailtoUrl = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
 window.open(mailtoUrl, '_blank');
 alert(`Opened email client to send report to ${recipient}.\n\nIf your email client does not open, click "Copy Report" to copy the text.`);
});

btnCopyReportText?.addEventListener('click', () => {
 const reportText = buildStructuredReportBody();
 navigator.clipboard.writeText(reportText).then(() => {
  alert(" Issue Report copied to clipboard!");
 }).catch(() => {
  alert("Copied report text.");
 });
});

btnDownloadShot?.addEventListener('click', () => {
 if (!currentCapturedDataUrl) {
  alert("No active screen capture available to download.");
  return;
 }
 const a = document.createElement('a');
 a.href = currentCapturedDataUrl;
 a.download = `DCE_Supervisor_Screenshot_${Date.now()}.png`;
 a.click();
});

// Storage Change Listener
chrome.storage.onChanged.addListener((changes, areaName) => {
 if (areaName === "local" && (changes.dce_live_roster || changes.dce_master_roster)) {
  loadLiveRosterFromStorage();
 }
 if (areaName === "local" && changes.dce_alerts) {
  const latestAlert = (changes.dce_alerts.newValue || [])[0];
  if (latestAlert) showStoredAlert(latestAlert);
 }
});

// Auto-refresh interval
setInterval(loadLiveRosterFromStorage, 3000);
loadLiveRosterFromStorage();

// =========================================================================
// WEBHOOK 5-MIN ESCALATION ENGINE
// =========================================================================

// Webhook Modal & Config
const modalWebhookConfig = document.getElementById('modal-webhook-config');
const btnOpenWebhookConfig = document.getElementById('btn-open-webhook-config');
const btnCloseWebhookModal = document.getElementById('btn-close-webhook-modal');
const btnCancelWebhook = document.getElementById('btn-cancel-webhook');
const btnSaveWebhook = document.getElementById('btn-save-webhook');
const inputWebhookUrl = document.getElementById('input-webhook-url');
const inputEscalationEmail = document.getElementById('input-escalation-email');
const lblWebhookSaveStatus = document.getElementById('lbl-webhook-save-status');

chrome.storage.local.get(['dce_webhook_url', 'dce_escalation_email'], (res) => {
 if (inputWebhookUrl && res.dce_webhook_url) inputWebhookUrl.value = res.dce_webhook_url;
 if (inputEscalationEmail && res.dce_escalation_email) inputEscalationEmail.value = res.dce_escalation_email;
});

btnOpenWebhookConfig?.addEventListener('click', () => {
 if (modalWebhookConfig) modalWebhookConfig.style.display = 'flex';
});
btnCloseWebhookModal?.addEventListener('click', () => {
 if (modalWebhookConfig) modalWebhookConfig.style.display = 'none';
});
btnCancelWebhook?.addEventListener('click', () => {
 if (modalWebhookConfig) modalWebhookConfig.style.display = 'none';
});

btnSaveWebhook?.addEventListener('click', () => {
 const url = inputWebhookUrl ? inputWebhookUrl.value.trim() : '';
 const email = inputEscalationEmail ? inputEscalationEmail.value.trim() : '';
 chrome.storage.local.set({ dce_webhook_url: url, dce_escalation_email: email }, () => {
  if (lblWebhookSaveStatus) {
   lblWebhookSaveStatus.innerText = ' Saved Webhook Config!';
   setTimeout(() => {
    lblWebhookSaveStatus.innerText = '';
    if (modalWebhookConfig) modalWebhookConfig.style.display = 'none';
   }, 1200);
  }
 });
});

// 5-Minute Tier 2 Alert Escalation Tracker
const activeAlertTimers = {};

function schedule5MinAlertEscalation(alertId, alertText) {
 if (activeAlertTimers[alertId]) return;

 activeAlertTimers[alertId] = setTimeout(() => {
  triggerTier2AlertEscalation(alertId, alertText);
 }, 5 * 60 * 1000); // 5 Minutes
}

function triggerTier2AlertEscalation(alertId, alertText) {
 chrome.storage.local.get(['dce_webhook_url', 'dce_escalation_email'], (res) => {
  const webhookUrl = res.dce_webhook_url;
  const emailTarget = res.dce_escalation_email || 'tl.escalations@alteram.co.za';

  const payload = {
   text: ` [5-MIN UNRESOLVED ESCALATION] Floor Alert Exceeded 5 Minutes!`,
   attachments: [{
    color: '#ef4444',
    fields: [
     { title: 'Alert Summary', value: alertText, short: false },
     { title: 'Escalation Target', value: emailTarget, short: true },
     { title: 'Timestamp', value: new Date().toLocaleString(), short: true }
    ]
   }]
  };

  if (webhookUrl) {
   fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
   }).catch(err => console.log('Webhook dispatch note:', err));
  }
 });
}
