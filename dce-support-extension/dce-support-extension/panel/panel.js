const CRM_URLS = ["https://*.alteram.co.za/*", "https://dcl.crmprod.alteram.co.za/*"];
const connection = document.getElementById("connection");
const auditResults = document.getElementById("audit-results");
const auditStatus = document.getElementById("audit-status");
const overrideStatus = document.getElementById("override-status");
const caseResults = document.getElementById("case-results");
const roster = document.getElementById("roster");
const memo = document.getElementById("memo");
const memoStatus = document.getElementById("memo-status");
const flagAlert = document.getElementById("flag-alert");
let scannedCases = [];
let activeTicket = null;

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
  chrome.storage.local.set({ dce_support_roster: roster, dce_alerts: alertsData.alerts || [] });
 } catch (error) {
  // Local storage remains the fallback when the backend is unavailable.
 }
}

function setTheme(theme) {
 document.documentElement.setAttribute("data-theme", theme);
 localStorage.setItem("dce_support_theme", theme);
 document.getElementById("theme").innerText = theme === "dark" ? " Light" : " Dark";
}
setTheme(localStorage.getItem("dce_support_theme") || "dark");
document.getElementById("theme").addEventListener("click", () => {
 setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
});

document.querySelectorAll(".tab").forEach(button => {
 button.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(tab => tab.classList.remove("active"));
  document.querySelectorAll(".view").forEach(view => view.classList.remove("active"));
  button.classList.add("active");
  document.getElementById(`view-${button.dataset.view}`).classList.add("active");
 });
});

document.getElementById("fullscreen").addEventListener("click", () => {
 chrome.tabs.create({ url: chrome.runtime.getURL("panel/panel.html?view=fullscreen") });
});

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

async function sendToCrm(message) {
 const tab = await getTargetTab();
 if (!tab?.id) {
  connection.innerText = " DISCONNECTED";
  throw new Error("No active web platform tab found");
 }
 return new Promise((resolve, reject) => {
  chrome.tabs.sendMessage(tab.id, message, response => {
   if (chrome.runtime.lastError) {
    connection.innerText = " DISCONNECTED";
    reject(new Error(chrome.runtime.lastError.message));
    return;
   }
   connection.innerText = " DCE CONNECTED";
   resolve(response || {});
  });
 });
}

async function inspectTicket() {
 auditStatus.innerText = "Checking...";
 try {
  const response = await sendToCrm({ action: "INSPECT_TICKET" });
  activeTicket = response.ticket;
  renderAudit(activeTicket);
 } catch (error) {
  auditStatus.innerText = "Offline";
  auditResults.innerText = error.message;
 }
}

document.getElementById("inspect").addEventListener("click", inspectTicket);

function renderAudit(ticket) {
 const missing = ticket.missingMandatory || [];
 const warnings = [...missing.map(name => `${name.replace("_", " ")} is --`), ticket.hasRawTokens ? "Raw note tokens remain" : ""]
  .filter(Boolean);
 auditStatus.innerText = warnings.length ? " Attention required" : " Ready";
 auditStatus.className = warnings.length ? "audit-warn" : "audit-ok";
 auditResults.innerHTML = warnings.length
  ? warnings.map(item => `<div class="audit-warn"> ${item}</div>`).join("")
  : `<div class="audit-ok"> Mandatory fields present</div><div>Ticket: ${ticket.ticketRef || "--"} | ${ticket.caseTitle || "--"}</div>`;
}

document.getElementById("reset").addEventListener("click", async () => {
 try {
  const response = await sendToCrm({ action: "RESET_CLASSIFICATION_CASCADE" });
  overrideStatus.innerText = `Cascade reset complete: ${response.fieldsReset} field(s) re-triggered.`;
 } catch (error) {
  overrideStatus.innerText = error.message;
 }
});

document.getElementById("override").addEventListener("change", async event => {
 if (!event.target.value) return;
 try {
  const response = await sendToCrm({ action: "APPLY_SUPPORT_OVERRIDE", override: event.target.value });
  overrideStatus.innerText = response.status === "OVERRIDE_APPLIED"
   ? `Override applied to ${response.fieldsUpdated} field(s): ${event.target.value}.`
   : `No matching CRM options found for ${event.target.value}.`;
 } catch (error) {
  overrideStatus.innerText = error.message;
 }
});

async function scanCases(caseType) {
 caseResults.innerHTML = "<div class='status'>Scanning CRM history...</div>";
 try {
  const response = await sendToCrm({ action: "SCAN_LAST_THREE_CASES", caseType });
  scannedCases = response.cases || [];
  renderCases();
 } catch (error) {
  caseResults.innerHTML = `<div class='audit-warn'>${error.message}</div>`;
 }
}
document.getElementById("scan-open").addEventListener("click", () => scanCases("OPEN"));
document.getElementById("scan-closed").addEventListener("click", () => scanCases("CLOSED"));

function renderCases() {
 caseResults.innerHTML = scannedCases.length ? scannedCases.map((item, index) => `
  <details class="case" ${index === 0 ? "open" : ""}>
   <summary><strong>${item.ticketRef}</strong> · ${item.caseTitle}</summary>
   <div>Created: ${item.createdDate || "--"}</div>
   <div>Creator: ${item.caseCreator || "--"}</div>
   <div>Province/Centre: ${item.province || "--"} / ${item.labourCentre || "--"}</div>
  </details>`).join("") : "<div class='status'>No cases found.</div>";
}

function buildMemo() {
 const reason = document.getElementById("reason").value;
 const action = document.getElementById("action").value;
 const findings = document.getElementById("findings").value.trim() || "Not provided";
 const attempts = scannedCases.length
  ? scannedCases.map(item => `${item.ticketRef} (${item.caseTitle || "Previous case"})`).join("; ")
  : "No historical cases scanned";
 memo.value = `ESCALATION REASON: ${reason}\nPREVIOUS ATTEMPTS: ${attempts}\nINVESTIGATION FINDINGS: ${findings}\nACTION REQUIRED: ${action}`;
 memoStatus.innerText = "Memo ready for review.";
}
document.getElementById("generate").addEventListener("click", buildMemo);

document.getElementById("inject").addEventListener("click", async () => {
 if (!memo.value.trim()) buildMemo();
 try {
  const response = await sendToCrm({ action: "INJECT_ESCALATION_MEMO", notesText: memo.value });
  memoStatus.innerText = response.status === "INJECTED" ? " Escalation memo injected into Notes Log." : "Notes Log field was not found.";
 } catch (error) {
  memoStatus.innerText = error.message;
 }
});

function renderRoster(data) {
 const allAgents = Object.values(data || {});
 const selectPodFilter = document.getElementById("select-floor-pod-filter");
 const selectedPod = selectPodFilter ? selectPodFilter.value : "ALL";

 const agents = allAgents.filter(agent => {
  if (selectedPod === "ALL") return true;
  return (agent.team || "").toLowerCase().includes(selectedPod.toLowerCase()) ||
      (selectedPod === "Claims Escalations" && (agent.team || "").toLowerCase().includes("claims")) ||
      (selectedPod === "Online Support & Portals" && (agent.team || "").toLowerCase().includes("online")) ||
      (selectedPod === "Registration & Compliance" && (agent.team || "").toLowerCase().includes("registration"));
 });

 const cntAvail = document.getElementById("cnt-avail");
 const cntAux = document.getElementById("cnt-aux");
 const cntFlagged = document.getElementById("cnt-flagged");

 if (cntAvail) cntAvail.innerText = allAgents.filter(a => a.status === "AVAILABLE").length;
 if (cntAux) cntAux.innerText = allAgents.filter(a => a.status === "UNAVAILABLE").length;
 if (cntFlagged) cntFlagged.innerText = allAgents.filter(a => a.activeCase?.flaggedIncomplete).length;

 const flaggedAgent = agents.find(agent => agent.activeCase?.flaggedIncomplete);
 if (flaggedAgent) showFlagAlert(flaggedAgent);
 document.getElementById("roster-status").innerText = `${agents.length} / ${allAgents.length} Tracked`;

 if (!roster) return;

 if (agents.length === 0) {
  roster.innerHTML = "<div class='status'>No agents found under selected department pod.</div>";
  return;
 }

 roster.innerHTML = agents.map(agent => {
  const activeCase = agent.activeCase || {};
  const query = activeCase.selectedQuery || {};
  const flagged = Boolean(activeCase.flaggedIncomplete);
  const isOnline = agent.status !== "OFFLINE";
  const tlConnected = isOnline ? " TL Heartbeat Connected" : " TL Offline";

  return `<div class="agent ${flagged ? "flagged" : ""}" data-agent-id="${agent.agentId}">
   <div style="display: flex; justify-content: space-between; align-items: center;">
    <strong>${agent.agentName || "Unknown Agent"}</strong>
    <span style="font-size: 8.5px; color: ${isOnline ? '#34d399' : '#94a3b8'}; font-weight: bold;">${agent.status || "OFFLINE"}</span>
   </div>
   <div style="font-size: 9px; color: var(--highlight); margin-top: 2px;">
     Pod: ${agent.team || "Contact Centre"} · TL: <b>${agent.teamLeader || "General"}</b> <span style="font-size: 8px; color: #a7f3d0;">(${tlConnected})</span>
   </div>
   <div style="font-size: 9px; color: var(--muted); margin-top: 2px;">
    ${flagged ? `<b style="color: #f87171;"> INCOMPLETE:</b> ${query.title || activeCase.caseTitle || "Unknown query"} | Issue: ${query.issue || "Uncategorised"}` : `Active Query: ${query.title || "None selected"}`}
   </div>
   ${activeCase.ticketRef ? `<div style="font-size: 8.5px; color: var(--muted);">Ticket Ref: ${activeCase.ticketRef} | Province: ${activeCase.province || '--'}</div>` : ''}
   <div style="display: flex; gap: 4px; margin-top: 6px;">
    <button class="btn-secondary btn-directive" style="font-size: 8px; padding: 2px 6px;" data-agent="${agent.agentId}"> Send Directive</button>
    <button class="btn-primary btn-force-save" style="font-size: 8px; padding: 2px 6px;" data-agent="${agent.agentId}"> Force Save</button>
    ${flagged ? `<button class="btn-muted btn-resolve-flag" style="font-size: 8px; padding: 2px 6px; background: #059669;" data-agent="${agent.agentId}"> Clear Flag</button>` : ''}
   </div>
  </div>`;
 }).join("");

 // Attach Floor Support Quick Action Button Handlers
 document.querySelectorAll(".btn-directive").forEach(btn => {
  btn.onclick = () => {
   const agtId = btn.dataset.agent;
   const msg = prompt(`Enter support directive for agent (${agtId}):`, "TL Directive: Complete Q/S/A fields before saving ticket.");
   if (msg) {
    chrome.storage.local.set({ [`dce_directive_${agtId}`]: msg });
    alert(`Directive sent to agent station ${agtId}.`);
   }
  };
 });

 document.querySelectorAll(".btn-force-save").forEach(btn => {
  btn.onclick = () => {
   const agtId = btn.dataset.agent;
   chrome.storage.local.get(["dce_support_roster", "dce_live_roster"], res => {
    const roster = res.dce_support_roster || res.dce_live_roster || {};
    if (roster[agtId]) {
     roster[agtId].activeCase = roster[agtId].activeCase || {};
     roster[agtId].activeCase.caseStatus = "Force Saved by Support";
     roster[agtId].activeCase.flaggedIncomplete = false;
     chrome.storage.local.set({ dce_support_roster: roster, dce_live_roster: roster });
     alert(`Force Save command issued for agent station ${agtId}.`);
    }
   });
  };
 });

 document.querySelectorAll(".btn-resolve-flag").forEach(btn => {
  btn.onclick = () => {
   const agtId = btn.dataset.agent;
   chrome.storage.local.get(["dce_support_roster", "dce_live_roster"], res => {
    const roster = res.dce_support_roster || res.dce_live_roster || {};
    if (roster[agtId] && roster[agtId].activeCase) {
     roster[agtId].activeCase.flaggedIncomplete = false;
     chrome.storage.local.set({ dce_support_roster: roster, dce_live_roster: roster });
     alert(`Flag resolved for agent station ${agtId}.`);
    }
   });
  };
 });
}

const floorPodFilter = document.getElementById("select-floor-pod-filter");
if (floorPodFilter) {
 floorPodFilter.addEventListener("change", () => {
  chrome.storage.local.get(["dce_support_roster", "dce_live_roster"], res => {
   renderRoster(res.dce_support_roster || res.dce_live_roster || {});
  });
 });
}

function showFlagAlert(agent) {
 if (!flagAlert) return;
 const activeCase = agent.activeCase || {};
 const query = activeCase.selectedQuery || {};
 const tlText = agent.teamLeader ? ` (TL: ${agent.teamLeader})` : '';
 flagAlert.innerHTML = `<span> <b>${agent.agentName || "Agent"}</b>${tlText} flagged an incomplete ticket: <b>Query ${query.title || activeCase.caseTitle || "Unknown"}</b> | <b>Issue: ${query.issue || "Uncategorised"}</b> | <b>Ticket: ${activeCase.ticketRef || "--"}</b></span> <span style="cursor:pointer; float:right; opacity:0.8;" title="Dismiss alert"></span>`;
 flagAlert.style.display = "block";
 flagAlert.style.cursor = "pointer";
}

if (flagAlert) {
 flagAlert.addEventListener('click', (e) => {
  if (e.target.innerText === '') {
   flagAlert.style.display = 'none';
  }
 });
}

function listenToBackendEvents() {
 if (!self.DCE_BACKEND_URL) return;
 try {
  const eventSource = new EventSource(`${self.DCE_BACKEND_URL}/api/events`);
  eventSource.addEventListener("roster", event => {
   const agent = JSON.parse(event.data);
   chrome.storage.local.get(["dce_support_roster"], res => {
    const roster = res.dce_support_roster || {};
    roster[agent.agentId] = agent;
    chrome.storage.local.set({ dce_support_roster: roster });
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
 } catch (error) {}
}

function loadRoster() {
 chrome.storage.local.get(["dce_support_roster", "dce_live_roster", "dce_alerts"], result => {
  renderRoster(result.dce_support_roster || result.dce_live_roster || {});
  const latestAlert = (result.dce_alerts || [])[0];
  if (latestAlert) showStoredAlert(latestAlert);
 });
}

function showStoredAlert(alert) {
 if (!flagAlert) return;
 const tlText = alert.teamLeader ? ` (TL: ${alert.teamLeader})` : '';
 flagAlert.innerHTML = `<span> <b>${alert.agentName || "Agent"}</b>${tlText} flagged an incomplete ticket: <b>Query ${alert.query?.title || "Unknown"}</b> | <b>Issue: ${alert.query?.issue || alert.issue || "Uncategorised"}</b> | <b>Ticket: ${alert.ticketRef || "--"}</b></span> <span style="cursor:pointer; float:right; opacity:0.8;" title="Dismiss alert"></span>`;
 flagAlert.style.display = "block";
 flagAlert.style.cursor = "pointer";
}

chrome.storage.onChanged.addListener((changes, area) => {
 if (area === "local" && (changes.dce_support_roster || changes.dce_live_roster)) {
  const rosterData = changes.dce_support_roster?.newValue || changes.dce_live_roster?.newValue || {};
  renderRoster(rosterData);
 }
 if (area === "local" && changes.dce_alerts) {
  const latestAlert = (changes.dce_alerts.newValue || [])[0];
  if (latestAlert) showStoredAlert(latestAlert);
 }
});

setInterval(() => {
 sendToCrm({ action: "PING" }).catch(() => { connection.innerText = " DISCONNECTED"; });
 inspectTicket();
}, 5000);
loadRoster();
refreshBackendData();
setInterval(refreshBackendData, 5000);
listenToBackendEvents();
inspectTicket();

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
   reportActiveSiteLbl.innerText = "DCE Support Pro (Standalone / Side Panel)";
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

 return `[DCE SUPPORT PRO / ISSUE REPORT]
Reported By: Support Specialist / Floor Supervisor
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
  const subject = `[DCE Support Pro Ticket] ${categoryText}`;
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
  a.download = `DCE_Issue_Screenshot_${Date.now()}.png`;
  a.click();
 });
}
