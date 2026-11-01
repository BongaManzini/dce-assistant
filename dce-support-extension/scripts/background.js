chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: "panel/panel.html",
    enabled: true
  }, () => {
    chrome.sidePanel.open({ tabId: tab.id });
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    message.action === "START_RECORDING_INJECTION" || 
    message.action === "START_AUTORUN_LOOP_INJECTION" || 
    message.action === "START_ACCOUNT_UNLOCK_AUTOMATION"
  ) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, message).catch(() => {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            files: ["scripts/content_script.js"]
          }, () => {
            chrome.tabs.sendMessage(tabs[0].id, message).catch((err) => console.error("Script synchronization failed:", err));
          });
        });
      }
    });
  }

  if (message.action === "STEPS_UPDATED" || message.action === "SAVE_STEPS") {
    chrome.runtime.sendMessage({ 
      action: "STEPS_UPDATED", 
      steps: message.steps,
      targetKey: message.targetKey
    }).catch(() => {});
  }
});