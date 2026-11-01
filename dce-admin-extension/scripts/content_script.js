let isRecordingActive = false;
let currentRecordingBuffer = [];
let activeRecordingProfileKey = "";

// --- Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 1. Admin Recording Controls
  if (message.action === "START_RECORDING") {
    isRecordingActive = true;
    currentRecordingBuffer = [];
    activeRecordingProfileKey = message.profileKey;
    showAdminRecordingBanner(true, activeRecordingProfileKey);
    sendResponse({ status: "RECORDING_STARTED" });
    return true;
  }

  if (message.action === "STOP_RECORDING") {
    isRecordingActive = false;
    showAdminRecordingBanner(false);
    sendResponse({ status: "RECORDING_STOPPED", steps: currentRecordingBuffer });
    return true;
  }

  // 2. Playback all steps (Inputs, TextAreas, Dropdowns, Clicks)
  if (message.action === "PLAY_STEPS") {
    replayRecordedSteps(message.steps);
    sendResponse({ status: "PLAYBACK_STARTED" });
    return true;
  }

  return true;
});

// --- REAL-TIME EVENT RECORDERS (CAPTURING INPUTS + TEXTAREAS + DROPDOWNS) ---

// 1. Capture Text Inputs & Textareas (Case Title, Notes, etc.)
window.addEventListener('input', (e) => {
  if (!isRecordingActive) return;
  const target = e.target;

  if (target.matches('input[type="text"], input:not([type]), textarea, [contenteditable="true"]')) {
    if (target.closest('#admin-recording-banner')) return;

    const selector = generateRobustSelector(target);
    const textVal = target.value || target.innerText || "";

    // If previous step was already editing this exact field, update the value instead of creating spam steps
    const lastStep = currentRecordingBuffer[currentRecordingBuffer.length - 1];
    if (lastStep && lastStep.action === "input" && lastStep.target === selector) {
      lastStep.inputValue = textVal;
    } else {
      const stepData = {
        action: "input",
        target: selector,
        inputValue: textVal,
        delay: 500
      };
      currentRecordingBuffer.push(stepData);
      chrome.runtime.sendMessage({ action: "STEP_CAPTURED", step: stepData });
    }
  }
}, true);

// 2. Capture Dropdowns
window.addEventListener('change', (e) => {
  if (!isRecordingActive) return;
  const target = e.target;

  if (target.tagName === "SELECT") {
    const selector = generateRobustSelector(target);
    const selectedOpt = target.options[target.selectedIndex];
    const stepData = {
      action: "select",
      target: selector,
      savedOptionChoice: selectedOpt ? selectedOpt.text.trim() : "",
      savedOptionValue: selectedOpt ? selectedOpt.value : "",
      savedOptionIndex: target.selectedIndex,
      delay: 900
    };

    currentRecordingBuffer.push(stepData);
    chrome.runtime.sendMessage({ action: "STEP_CAPTURED", step: stepData });
  }
}, true);

// 3. Capture Clicks (Buttons, Radios, Checkboxes, Tabs)
window.addEventListener('click', (e) => {
  if (!isRecordingActive) return;
  if (e.target.closest('#admin-recording-banner')) return;

  const target = e.target.closest('button, a, input[type="button"], input[type="submit"], input[type="checkbox"], input[type="radio"]') || e.target;
  
  // Skip plain text clicks so we don't record redundant click steps before typing
  if (target.matches('input[type="text"], input:not([type]), textarea, select')) return;

  const selector = generateRobustSelector(target);
  const stepData = {
    action: "click",
    target: selector,
    delay: 800
  };

  currentRecordingBuffer.push(stepData);
  chrome.runtime.sendMessage({ action: "STEP_CAPTURED", step: stepData });
}, true);

// Robust Selector prioritizing active DEL CRM fields
function generateRobustSelector(el) {
  if (el.id && el.id.startsWith('sc_cases-')) return `#${el.id}`;
  if (el.getAttribute('formcontrolname')) return `[formcontrolname="${el.getAttribute('formcontrolname')}"]`;
  if (el.id && el.id.length < 30 && !el.id.match(/[0-9a-fA-F\-]{6,}/)) return `#${el.id}`;

  let path = [];
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    let tag = el.nodeName.toLowerCase();
    if (tag === 'body' || tag === 'html') break;
    let index = 1;
    let sib = el.previousElementSibling;
    while (sib) {
      if (sib.nodeName === el.nodeName) index++;
      sib = sib.previousElementSibling;
    }
    path.unshift(`${tag}:nth-of-type(${index})`);
    el = el.parentNode;
  }
  return path.join(' > ');
}

// Replay Engine (Handles typing text, selecting dropdowns, and clicks)
async function replayRecordedSteps(steps) {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    let element = document.querySelector(step.target);

    // Wait for Angular to render element if it's dynamic
    if (!element) {
      for (let retry = 0; retry < 15; retry++) {
        await new Promise(r => setTimeout(r, 200));
        element = document.querySelector(step.target);
        if (element) break;
      }
    }

    if (!element) {
      console.warn(`[AutoCloser] Target not found: ${step.target}`);
      continue;
    }

    // Step Type 1: Text Input / TextArea (Case Title & Notes)
    if (step.action === "input") {
      element.focus();
      element.value = step.inputValue || "";
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } 
    // Step Type 2: Select Dropdown
    else if (step.action === "select" && element.tagName === "SELECT") {
      let matchedOpt = null;
      for (let optRetry = 0; optRetry < 15; optRetry++) {
        matchedOpt = Array.from(element.options).find(o => 
          o.text.trim().toLowerCase() === step.savedOptionChoice.toLowerCase() ||
          o.value === step.savedOptionValue
        );
        if (matchedOpt) break;
        await new Promise(r => setTimeout(r, 200));
      }

      if (matchedOpt) {
        element.selectedIndex = matchedOpt.index;
        element.value = matchedOpt.value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } 
    // Step Type 3: Click
    else {
      element.scrollIntoView({ block: 'center' });
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }

    await new Promise(r => setTimeout(r, step.delay || 700));
  }

  chrome.runtime.sendMessage({ action: "PLAYBACK_FINISHED" });
}

// Banner Overlay
function showAdminRecordingBanner(show, profileName = "") {
  const old = document.getElementById('admin-recording-banner');
  if (old) old.remove();
  if (!show) return;

  const banner = document.createElement('div');
  banner.id = 'admin-recording-banner';
  banner.style.cssText = "position: fixed; top: 12px; right: 20px; background: #dc2626; color: white; padding: 10px 18px; font-weight: bold; border-radius: 6px; z-index: 999999999; font-family: sans-serif; font-size: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);";
  banner.innerHTML = `🔴 RECORDING: <span style="text-decoration: underline;">${profileName}</span> (Type in Title/Notes & select dropdowns on screen)`;
  document.body.appendChild(banner);
}