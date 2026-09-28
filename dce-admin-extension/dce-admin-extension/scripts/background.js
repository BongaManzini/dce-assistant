importScripts("../backend-config.js");

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Error setting panel behavior:", error));

chrome.runtime.onInstalled.addListener(async () => {
  console.log("DCE Ticket Automator background service active (v0.6.7.5-beta).");
  
  const allTabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });

  for (const tab of allTabs) {
    if (tab.url && !tab.url.startsWith("chrome")) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["scripts/content_script.js"]
        });
      } catch (err) {
        // Ignore tabs where script injection is restricted
      }
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "STORE_AGENT_HEARTBEAT") {
    const agent = request.agent;
    if (!agent?.agentId) {
      sendResponse({ status: "INVALID_AGENT_DATA" });
      return true;
    }

    chrome.storage.local.get(["dce_live_roster", "dce_agent_records", "dce_alerts"], (res) => {
      const roster = res.dce_live_roster || {};
      const records = res.dce_agent_records || {};
      const alerts = res.dce_alerts || [];
      const previous = roster[agent.agentId];
      roster[agent.agentId] = agent;
      records[agent.agentId] = {
        ...agent,
        lastSeen: Date.now(),
        updatedBy: "agent-heartbeat"
      };

      const wasFlagged = Boolean(previous?.activeCase?.flaggedIncomplete);
      const isFlagged = Boolean(agent.activeCase?.flaggedIncomplete);
      if (isFlagged && !wasFlagged) {
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

      const wasMicDisconnected = Boolean(previous?.auxReason && previous.auxReason.toLowerCase().includes("microphone"));
      const isMicDisconnected = Boolean(agent.auxReason && agent.auxReason.toLowerCase().includes("microphone"));
      if (isMicDisconnected && !wasMicDisconnected) {
        alerts.unshift({
          id: `mic-${agent.agentId}-${Date.now()}`,
          type: "MIC_DISCONNECTED",
          agentId: agent.agentId,
          agentName: agent.agentName,
          teamLeader: agent.teamLeader,
          team: agent.team,
          message: "Telephony disconnected - Chrome microphone permission denied",
          createdAt: Date.now(),
          read: false
        });
      } else if (!isMicDisconnected && wasMicDisconnected) {
        alerts.unshift({
          id: `mic-ok-${agent.agentId}-${Date.now()}`,
          type: "MIC_RESTORED",
          agentId: agent.agentId,
          agentName: agent.agentName,
          teamLeader: agent.teamLeader,
          team: agent.team,
          message: "Agent re-enabled microphone - Telephony restored",
          createdAt: Date.now(),
          read: false
        });
      }

      chrome.storage.local.set({
        dce_live_roster: roster,
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
  }

  if (request.action === "PUBLISH_AGENT_ALERT") {
    chrome.storage.local.get(["dce_alerts"], (res) => {
      const alerts = res.dce_alerts || [];
      alerts.unshift(request.alert);
      chrome.storage.local.set({ dce_alerts: alerts.slice(0, 100) }, () => {
        sendResponse({ status: "ALERT_STORED" });
      });
    });
    fetch(`${self.DCE_BACKEND_URL}/api/alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.alert)
    }).catch(() => {});
    return true;
  }

  if (request.action === "CLEAR_DCE_ALERTS") {
    chrome.storage.local.set({ dce_alerts: [] }, () => sendResponse({ status: "ALERTS_CLEARED" }));
    return true;
  }

  if (request.action === "SAVE_STEPS") {
    chrome.storage.local.get(["customMacroPresets", "activePresetKey"], (res) => {
      let presets = res.customMacroPresets || {};
      let activeKey = res.activePresetKey || "Default Workflow";
      
      if (presets[activeKey]) {
        presets[activeKey].steps = request.steps;
      }

      chrome.storage.local.set({
        savedMacroSteps: request.steps,
        customMacroPresets: presets
      }, () => {
        chrome.runtime.sendMessage({ action: "STEPS_UPDATED", steps: request.steps });
      });
    });
  }
  });