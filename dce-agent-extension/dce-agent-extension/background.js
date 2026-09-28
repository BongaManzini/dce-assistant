chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("[AutoCloser-Background] Sidepanel setup error:", error));

chrome.runtime.onInstalled.addListener(async () => {
  console.log("[AutoCloser-Background] Background service active.");
  
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
importScripts("backend-config.js");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "PUBLISH_AGENT_HEARTBEAT") {
    fetch(`${self.DCE_BACKEND_URL}/api/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request.agent)
    }).then(() => sendResponse({ status: "BACKEND_SYNCED" }))
      .catch(() => sendResponse({ status: "BACKEND_OFFLINE" }));
    return true;
  }

  if (request.action === "PUBLISH_AGENT_ALERT") {
    fetch(`${self.DCE_BACKEND_URL}/api/alerts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request.alert)
    }).then(() => sendResponse({ status: "ALERT_BACKEND_SYNCED" }))
      .catch(() => sendResponse({ status: "ALERT_BACKEND_OFFLINE" }));
    return true;
  }

  return false;
});