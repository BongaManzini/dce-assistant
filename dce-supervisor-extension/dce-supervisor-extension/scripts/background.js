importScripts('../backend-config.js');

chrome.runtime.onInstalled.addListener(() => {
  console.log("[DCE-Supervisor] Standalone Supervisor Console background worker initialized.");
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});
