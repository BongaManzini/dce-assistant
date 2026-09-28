chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(error => console.error("[DCE Support] Side panel setup failed", error));

chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const tab of tabs) {
    if (!tab.id || (tab.url && tab.url.startsWith("chrome"))) continue;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["scripts/content_script.js"] });
    } catch (error) {
      // Restricted or already-closed tabs can be ignored.
    }
  }
});
importScripts("backend-config.js");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== "STORE_AGENT_HEARTBEAT") return false;

  const agent = request.agent;
  if (!agent?.agentId) {
    sendResponse({ status: "INVALID_AGENT_DATA" });
    return true;
  }

  chrome.storage.local.get(["dce_support_roster", "dce_agent_records", "dce_alerts"], result => {
    const roster = result.dce_support_roster || {};
    const records = result.dce_agent_records || {};
    const alerts = result.dce_alerts || [];
    const previous = roster[agent.agentId];
    roster[agent.agentId] = agent;
    records[agent.agentId] = { ...agent, lastSeen: Date.now(), updatedBy: "agent-heartbeat" };

    if (agent.activeCase?.flaggedIncomplete && !previous?.activeCase?.flaggedIncomplete) {
      alerts.unshift({
        id: `${agent.agentId}-${Date.now()}`,
        type: "INCOMPLETE_TICKET",
        agentId: agent.agentId,
        agentName: agent.agentName,
        query: agent.activeCase.selectedQuery || {},
        ticketRef: agent.activeCase.ticketRef || "--",
        createdAt: Date.now(),
        read: false
      });
    }

    chrome.storage.local.set({
      dce_support_roster: roster,
      dce_agent_records: records,
      dce_alerts: alerts.slice(0, 100)
    }, () => sendResponse({ status: "AGENT_DATA_STORED" }));

    fetch(`${self.DCE_BACKEND_URL}/api/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(agent)
    }).catch(() => {});
  });
  return true;
});
