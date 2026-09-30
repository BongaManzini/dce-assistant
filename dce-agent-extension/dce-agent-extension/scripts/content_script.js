console.log("[AutoCloser-Agent] Loaded on DEL CRM with Live Presence Heartbeat.");

// Configuration: Organizational Team / TL Mapping (Expandable for floor roster)
const DEFAULT_TL_MAPPING = {
  "Molly Sharon Xaba": { tl: "Sipho Dlamini", team: "Claims Escalations" },
  "Kagiso Molefe": { tl: "Sipho Dlamini", team: "Claims Escalations" },
  "Thabo Ndlovu": { tl: "Lerato Khumalo", team: "Online Support & Portals" },
  "Nandi Zuma": { tl: "Lerato Khumalo", team: "Online Support & Portals" },
  "Bongani Sithole": { tl: "Daniel Sithole", team: "Registration & Compliance" }
};
let ticketFlaggedIncomplete = false;
let selectedQuery = null;

// --- 1. TOP BAR & AGENT IDENTITY ENGINE ---

const INVALID_NAME_WORDS = [
  'search', 'notification', 'menu', 'crmprod', 'alteram', 'select', 'home', 
  'dashboard', 'telephony', 'pause', 'available', 'offline', 'logout', 
  'sign out', 'help', 'settings', 'uif', 'department', 'cases', 'tickets',
  'labour', 'department of labour', 'dce', 'admin', 'supervisor', 'team leader',
  'null', 'undefined', 'unknown', 'system', 'crm', 'alteram.co.za', 'true', 'false',
  'tea break', 'lunch', 'coaching', 'meeting', 'training', 'body break', 'taking calls',
  'options', 'please select', 'user profile', 'my account', 'change password'
];

let cachedAgentName = null;

// Initialize cached agent name from storage if previously saved
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get(["dce_agent_name"], (res) => {
    if (res && res.dce_agent_name && res.dce_agent_name !== "Unknown Agent") {
      cachedAgentName = res.dce_agent_name;
    }
  });
}

function cleanPersonName(rawText) {
  if (!rawText) return "";
  let clean = String(rawText).split('\n')[0].trim();
  // Strip chevrons, icons, emojis, special unicode symbols
  clean = clean.replace(/[▼▲▼\u25BC\u25B2\u2304\u2699\u2690\u2709\u1F464\u1F465\u1F468\u1F469\u2705\u274C\u2B50]/g, '');
  clean = clean.replace(/^(welcome|hello|hi|agent|logged in as|user|account|profile)\s*:?\s*/i, '');
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean;
}

function isLikelyPersonName(text) {
  if (!text) return false;
  const clean = cleanPersonName(text);
  if (clean.length < 3 || clean.length > 50) return false;
  
  const lower = clean.toLowerCase();
  for (const inv of INVALID_NAME_WORDS) {
    if (lower === inv || lower.includes(inv)) return false;
  }
  
  if (/@|\.co\.za|\.com|\d{4,}/.test(lower)) return false;

  const parts = clean.split(' ').filter(p => p.length > 0);
  if (parts.length < 1) return false;
  
  const isProperCase = /^[A-Z][a-zA-Z'\-.]+(?:\s+[A-Z][a-zA-Z'\-.]+){0,3}$/.test(clean);
  const isValidWords = parts.every(p => /^[A-Za-z'\-.]+$/.test(p) && p.length >= 2);
  
  return isProperCase || isValidWords;
}

function getAgentNameFromStorage() {
  try {
    const keysToCheck = [
      'currentUser', 'user', 'userData', 'profile', 'authUser', 'auth_user', 
      'agent', 'agentName', 'agentInfo', 'username', 'userName', 'displayName', 
      'dce_agent_name', 'dce_cached_agent_name'
    ];
    
    for (const key of keysToCheck) {
      const val = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (!val) continue;
      
      if (val.trim().startsWith('{') || val.trim().startsWith('[')) {
        try {
          const parsed = JSON.parse(val);
          const candidate = parsed.fullName || parsed.name || parsed.displayName || 
                            parsed.agentName || parsed.agent_name || parsed.user_fullname || 
                            parsed.userName || parsed.username || 
                            (parsed.first_name ? `${parsed.first_name} ${parsed.last_name || ''}`.trim() : null);
          if (candidate && isLikelyPersonName(candidate)) {
            return cleanPersonName(candidate);
          }
        } catch (e) {}
      } else if (isLikelyPersonName(val)) {
        return cleanPersonName(val);
      }
    }
  } catch (e) {}
  return null;
}

function saveDetectedAgentName(name) {
  if (!name || name === "Unknown Agent") return;
  cachedAgentName = name;
  try {
    localStorage.setItem('dce_cached_agent_name', name);
  } catch(e) {}
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ dce_agent_name: name });
  }
}

// Scrapes the agent's full name from the DEL CRM header bar or browser storage
function scrapeAgentNameFromTopBar() {
  // 1. Real CRM selectors — DEL CRM uses Angular with ngbdropdown user dropdown in header
  //    The name sits in: div.user[ngbdropdown] > span (direct child span)
  //    NEVER target _ngcontent-* attributes — Angular generates those dynamically per session

  const realCrmSelectors = [
    'div.user[ngbdropdown] > span',
    '.user.col.dropdown > span',
    '.user.dropdown > span',
    '[ngbdropdown].user > span'
  ];

  for (const selector of realCrmSelectors) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        const raw = (el.innerText || el.textContent || '').trim();
        const clean = cleanPersonName(raw);
        if (isLikelyPersonName(clean)) {
          saveDetectedAgentName(clean);
          return clean;
        }
      }
    } catch (e) {}
  }

  // 2. Email fallback — .dropdown-header contains "molly.xaba@alteram.co.za"
  //    Extract the part before "@" and convert to title case as approximate name
  try {
    const dropHeader = document.querySelector('.header-account-dropdown .dropdown-header, [ngbdropdownmenu] .dropdown-header');
    if (dropHeader) {
      const emailMatch = (dropHeader.innerText || dropHeader.textContent || '').match(/([a-zA-Z0-9._%+-]+)@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) {
        // e.g. "molly.xaba" -> "Molly Xaba"
        const derived = emailMatch[1]
          .split('.')
          .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
          .join(' ');
        if (isLikelyPersonName(derived)) {
          saveDetectedAgentName(derived);
          return derived;
        }
      }
    }
  } catch (e) {}

  // 3. Try Storage (localStorage/sessionStorage JSON or keys)
  const storageName = getAgentNameFromStorage();
  if (storageName && isLikelyPersonName(storageName)) {
    saveDetectedAgentName(storageName);
    return storageName;
  }

  // 4. Broad DOM selector sweep (legacy fallback)
  const possibleSelectors = [
    'app-header [class*="user" i]',
    'app-topbar [class*="user" i]',
    'app-navbar [class*="user" i]',
    'app-user-profile span',
    'app-user-profile div',
    '.user-name',
    '.user-profile span',
    '.profile-name',
    '.account-name',
    '.agent-name',
    '.user-details',
    '[class*="user-name" i]',
    '[class*="user-profile" i]',
    '[class*="profile-name" i]',
    '[class*="header-user" i]',
    '.dropdown-toggle span',
    'header [class*="profile" i]',
    'header [class*="user" i]',
    'nav [class*="profile" i]',
    'nav [class*="user" i]',
    '.top-navbar .dropdown span',
    '.navbar-nav .dropdown-toggle'
  ];

  for (const selector of possibleSelectors) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const raw = el.innerText || el.textContent || "";
        const clean = cleanPersonName(raw);
        if (isLikelyPersonName(clean)) {
          saveDetectedAgentName(clean);
          return clean;
        }
      }
    } catch (e) {}
  }

  // 5. Fallback: Search all textual elements inside header/nav for full name pattern
  const headerContainer = document.querySelector('app-header, app-topbar, app-navbar, header, .navbar, .top-header, nav, .top-bar');
  if (headerContainer) {
    const fullText = headerContainer.innerText || headerContainer.textContent || "";
    const nameMatches = fullText.match(/\b[A-Z][a-z']+(?:\s+[A-Z][a-z']+){1,3}\b/g);
    if (nameMatches) {
      for (const match of nameMatches) {
        if (isLikelyPersonName(match)) {
          saveDetectedAgentName(match);
          return match.trim();
        }
      }
    }
  }

  // 6. Fallback to cached agent name from memory / storage
  if (cachedAgentName && cachedAgentName !== "Unknown Agent") {
    return cachedAgentName;
  }

  return "Unknown Agent";
}


// Known DEL CRM Telephony Aux / Pause Reason Codes (from CRM screenshot & CTI bar)
const KNOWN_AUX_REASONS = [
  "1st Tea Break",
  "2nd Tea Break",
  "Lunch",
  "Coaching",
  "E-mail Admin",
  "Meeting",
  "Ministerial Escalations",
  "Outbound Admin",
  "Social Media",
  "Technical Assistance",
  "Training",
  "Body Break",
  "Auto pause",
  "christest"
];

// --- AUDIO HEALTH SENTINEL ENGINE (TELEPHONY & WEBRTC WATCHDOG) ---
const AUDIO_DIAGNOSTICS_MAX = 50;
let recentAudioDiagnostics = [];
let micGuardState = "HEALTHY"; // "HEALTHY" | "BLOCKED" | "DEVICE_DISCONNECTED" | "ONE_WAY_AUDIO" | "MUTED"
let micGuardLastReportedState = "HEALTHY";
let micGuardDetailMessage = "";
let lastCompletedCallSummary = null;

function showCallWrapUpToast(callSummary) {
  try {
    const existing = document.getElementById('dce-call-wrapup-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'dce-call-wrapup-toast';
    const isAbnormal = callSummary.category !== 'NORMAL_CLIENT' && callSummary.category !== 'NORMAL_AGENT';
    const borderColor = isAbnormal ? '#ef4444' : '#10b981';
    const badgeBg = isAbnormal ? '#7f1d1d' : '#064e3b';
    const badgeColor = isAbnormal ? '#fca5a5' : '#6ee7b7';
    const termColor = isAbnormal ? '#fca5a5' : '#38bdf8';

    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #0b1523;
      color: #ffffff;
      border: 2px solid ${borderColor};
      border-radius: 8px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.7), 0 0 14px ${isAbnormal ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.2)'};
      z-index: 2147483646;
      padding: 12px 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11px;
      width: 320px;
      box-sizing: border-box;
    `;

    toast.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:4px;">
        <span style="font-weight:800; font-size:11.5px; color:${termColor};">📞 CALL ENDED (${callSummary.durationFormatted})</span>
        <button id="btn-close-wrapup-toast" style="background:none; border:none; color:#94a3b8; font-size:12px; cursor:pointer; padding:0 3px;">✕</button>
      </div>
      <div style="margin-bottom:5px; font-size:10.5px;">
        <span style="color:#94a3b8;">Disconnected By:</span> <b style="color:#ffffff;">${callSummary.terminatedBy}</b>
      </div>
      <div style="margin-bottom:6px; font-size:10px; line-height:1.35; color:#cbd5e1; background:rgba(0,0,0,0.3); padding:4px 6px; border-radius:4px; border-left:2px solid ${borderColor};">
        <b>Root Cause:</b> ${callSummary.rootCause}
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:9px; color:#64748b;">
        <span>Mic: ${callSummary.headset || 'Headset'}</span>
        <span style="color:#10b981;">Auto-logged to DCE Assistant</span>
      </div>
    `;

    document.body.appendChild(toast);
    toast.querySelector('#btn-close-wrapup-toast')?.addEventListener('click', () => toast.remove());
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 9000);
  } catch (err) {}
}

function injectAudioSentinel() {
  try {
    if (document.getElementById('dce-audio-sentinel-inject')) return;
    const script = document.createElement('script');
    script.id = 'dce-audio-sentinel-inject';
    script.src = chrome.runtime.getURL('scripts/sentinel_inject.js');
    (document.head || document.documentElement).appendChild(script);
  } catch (err) {
    console.warn("[DCE-Sentinel] Inject error:", err);
  }
}

function recordAudioDiagnostic(eventType, details = {}) {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      epoch: Date.now(),
      type: eventType,
      details: details,
      agentName: (typeof scrapeAgentNameFromTopBar === 'function') ? scrapeAgentNameFromTopBar() : "Unknown",
      pageUrl: window.location.href
    };

    recentAudioDiagnostics.unshift(entry);
    if (recentAudioDiagnostics.length > AUDIO_DIAGNOSTICS_MAX) {
      recentAudioDiagnostics.pop();
    }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ dce_audio_diagnostics: recentAudioDiagnostics });
    }
  } catch (e) {
    // Ignore storage errors
  }
}

function playSentinelAlertChime() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(440.00, ctx.currentTime + 0.14); // A4
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.38);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.38);
  } catch (err) {
    // Autoplay restrictions or headless env
  }
}

function triggerAudioSentinelAlert(stateType, reasonDetail, faultCategory = "HARDWARE") {
  if (micGuardState === stateType && micGuardLastReportedState === stateType) return;
  micGuardState = stateType;
  micGuardLastReportedState = stateType;
  micGuardDetailMessage = reasonDetail;

  playSentinelAlertChime();
  renderMicGuardBanner(true, reasonDetail, stateType);

  const agentName = scrapeAgentNameFromTopBar();
  const agentId = agentName.toLowerCase().replace(/\s+/g, '.');
  const assignedMeta = (typeof customRosterMappingCache !== 'undefined' && customRosterMappingCache[agentName]) || DEFAULT_TL_MAPPING[agentName] || {
    tl: "Unassigned TL",
    team: "General Contact Centre"
  };
  const activeTicket = scrapeActiveTicketData() || {};

  const alertType = stateType === 'ONE_WAY_AUDIO' ? 'ONE_WAY_AUDIO' : 'MIC_DISCONNECTED';
  const alertTitle = stateType === 'ONE_WAY_AUDIO' 
    ? "One-Way Audio Detected (Client Cannot Hear Agent)" 
    : (stateType === 'DEVICE_DISCONNECTED' ? "Microphone Hardware Disconnected" : "Microphone Access Blocked");

  const micAlert = {
    id: "alert_audio_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
    type: alertType,
    agentId: agentId,
    agentName: agentName,
    teamLeader: assignedMeta.tl,
    team: assignedMeta.team,
    title: alertTitle,
    message: reasonDetail || "Telephony audio fault detected",
    ticketRef: activeTicket.ticketRef || "--",
    createdAt: Date.now(),
    read: false
  };

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["dce_alerts"], (res) => {
      const alerts = res.dce_alerts || [];
      alerts.unshift(micAlert);
      chrome.storage.local.set({ dce_alerts: alerts.slice(0, 500) });
    });
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ action: "PUBLISH_AGENT_ALERT", alert: micAlert }).catch(() => {});
  }
  dispatchAgentHeartbeat(false);
}

function triggerMicGuardBlocked(reasonDetail) {
  triggerAudioSentinelAlert("BLOCKED", reasonDetail || "Chrome microphone permission revoked", "PERMISSION");
}

function triggerMicGuardHealthy() {
  if (micGuardState === "HEALTHY" && micGuardLastReportedState === "HEALTHY") {
    return;
  }
  micGuardState = "HEALTHY";
  micGuardLastReportedState = "HEALTHY";
  micGuardDetailMessage = "";
  renderMicGuardBanner(false);

  recordAudioDiagnostic('MIC_HEALTH_RESTORED', { status: 'HEALTHY' });

  const agentName = scrapeAgentNameFromTopBar();
  const agentId = agentName.toLowerCase().replace(/\s+/g, '.');
  const assignedMeta = (typeof customRosterMappingCache !== 'undefined' && customRosterMappingCache[agentName]) || DEFAULT_TL_MAPPING[agentName] || {
    tl: "Unassigned TL",
    team: "General Contact Centre"
  };

  const restoredAlert = {
    id: "alert_mic_ok_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
    type: "MIC_RESTORED",
    agentId: agentId,
    agentName: agentName,
    teamLeader: assignedMeta.tl,
    team: assignedMeta.team,
    title: "Microphone & Audio Restored",
    message: "Agent audio track restored - Telephony healthy",
    createdAt: Date.now(),
    read: false
  };

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["dce_alerts"], (res) => {
      const alerts = res.dce_alerts || [];
      alerts.unshift(restoredAlert);
      chrome.storage.local.set({ dce_alerts: alerts.slice(0, 500) });
    });
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ action: "PUBLISH_AGENT_ALERT", alert: restoredAlert }).catch(() => {});
  }
  dispatchAgentHeartbeat(false);
}

function renderMicGuardBanner(show, reason = "", stateType = "BLOCKED") {
  const existingBanner = document.getElementById("dce-mic-guard-banner");
  if (existingBanner) existingBanner.remove();
  if (!show) return;

  const isOneWay = stateType === 'ONE_WAY_AUDIO';
  const isHardware = stateType === 'DEVICE_DISCONNECTED';

  const bannerTitle = isOneWay
    ? "CALL AUDIO ALERT: ONE-WAY AUDIO DETECTED (CLIENT CANNOT HEAR YOU!)"
    : (isHardware ? "MIC GUARD: AUDIO HARDWARE DISCONNECTED" : "MIC GUARD: TELEPHONY MICROPHONE BLOCKED");

  const headerColor = isOneWay ? "#fde047" : "#fecaca";
  const borderGradient = isOneWay ? "#eab308" : "#ef4444";
  const bgGradient = isOneWay ? "linear-gradient(135deg, #713f12, #451a03)" : "linear-gradient(135deg, #7f1d1d, #450a0a)";

  const banner = document.createElement("div");
  banner.id = "dce-mic-guard-banner";
  banner.style.cssText = `
    position: fixed;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    background: ${bgGradient};
    color: #ffffff;
    border: 2px solid ${borderGradient};
    border-radius: 10px;
    box-shadow: 0 10px 35px rgba(0, 0, 0, 0.7), 0 0 20px rgba(239, 68, 68, 0.4);
    z-index: 2147483647;
    padding: 14px 22px;
    display: flex;
    align-items: center;
    gap: 18px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    max-width: 90vw;
  `;

  banner.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 4px; max-width: 580px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 13px; font-weight: 800; letter-spacing: 0.5px; color: ${headerColor}; text-transform: uppercase;">
          ${bannerTitle}
        </span>
      </div>
      <div id="mic-guard-banner-body" style="font-size: 11px; line-height: 1.4; color: #f8fafc;">
        ${reason ? `<b>Issue:</b> ${reason}<br>` : ''}
        <b>Recommended Actions:</b><br>
        ${isOneWay ? `
          1. Click <b>Quick Reset Audio</b> below to re-negotiate softphone voice stream.<br>
          2. Reseat headset 3.5mm jack into the USB inline puck.<br>
          3. If client still cannot hear, click <b>Reload Telephony Tab</b>.
        ` : (isHardware ? `
          1. <b>Firmly reseat the 3.5mm jack</b> into the round Jabra USB call-control puck.<br>
          2. If loose, switch USB connector to a rear motherboard port.<br>
          3. Click <b>Quick Reset Audio</b> below once plugged in.
        ` : `
          1. Click the <b>Site Settings / Padlock</b> icon in the Chrome address bar.<br>
          2. Toggle <b>Microphone</b> to <b>Allowed / On</b>.<br>
          3. Click <b>Reload Telephony Tab</b> to restore connection.
        `)}
      </div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 6px; min-width: 150px;">
      <button id="btn-mic-guard-quick-reset" style="background: linear-gradient(135deg, #0284c7, #0369a1); color: white; border: 1px solid #38bdf8; font-weight: bold; border-radius: 6px; padding: 7px 12px; font-size: 11px; cursor: pointer; white-space: nowrap; box-shadow: 0 2px 8px rgba(2, 132, 199, 0.4);">
        Quick Reset Audio
      </button>
      <button id="btn-mic-guard-reload" style="background: linear-gradient(135deg, #10b981, #059669); color: white; border: 1px solid #34d399; font-weight: bold; border-radius: 6px; padding: 6px 12px; font-size: 10.5px; cursor: pointer; white-space: nowrap; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);">
        Reload Telephony Tab
      </button>
      <button id="btn-mic-guard-dismiss" style="background: rgba(255,255,255,0.15); color: #e2e8f0; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; padding: 3px 8px; font-size: 9.5px; cursor: pointer;">
        Dismiss Warning
      </button>
    </div>
  `;

  document.body.appendChild(banner);

  const resetBtn = document.getElementById("btn-mic-guard-quick-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      resetBtn.innerText = "Re-binding Audio...";
      resetBtn.disabled = true;

      // 1. Dispatch reprobe and softphone mute toggle commands to in-page sentinel
      window.dispatchEvent(new CustomEvent('dce-audio-sentinel-command', { detail: { command: 'REPROBE_DEVICES' } }));
      window.dispatchEvent(new CustomEvent('dce-audio-sentinel-command', { detail: { command: 'TOGGLE_DCE_MUTE' } }));

      // 2. Request local getUserMedia to re-trigger permissions & enumeration
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(stream => {
            stream.getTracks().forEach(t => t.stop());
            triggerMicGuardHealthy();
          })
          .catch(() => {});
      }

      // 3. Evaluate after 2.5 seconds
      setTimeout(() => {
        if (micGuardState === "HEALTHY") {
          renderMicGuardBanner(false);
        } else {
          resetBtn.innerText = "Retry Reset";
          resetBtn.disabled = false;
          const bodyEl = document.getElementById("mic-guard-banner-body");
          if (bodyEl) {
            bodyEl.innerHTML = `
              <b style="color: #fca5a5;">Soft reset completed, but microphone is still unattached.</b><br>
              Hardware check needed: Check 3.5mm connection on Jabra puck or click <b>Reload Telephony Tab</b>.
            `;
          }
        }
      }, 2500);
    });
  }

  document.getElementById("btn-mic-guard-reload")?.addEventListener("click", () => {
    window.location.reload();
  });
  document.getElementById("btn-mic-guard-dismiss")?.addEventListener("click", () => {
    banner.remove();
  });
}

function evaluateMicGuard() {
  const fullBodyText = (document.body ? (document.body.innerText || "") : "").toLowerCase();

  const hasDisconnectText = 
    fullBodyText.includes("logged out from telephony") ||
    fullBodyText.includes("abrupt disconnection") ||
    fullBodyText.includes("allow microphone permission") ||
    fullBodyText.includes("needs access to your microphone");

  if (hasDisconnectText) {
    triggerMicGuardBlocked("Telephony disconnected (Chrome microphone permission revoked)");
    return true;
  }

  if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'microphone' }).then(status => {
      if (status.state === 'denied') {
        triggerMicGuardBlocked("Chrome site settings have blocked Microphone access");
      } else if (status.state === 'granted' && micGuardState === 'BLOCKED' && !hasDisconnectText) {
        triggerMicGuardHealthy();
      }
    }).catch(() => {});
  }

  return false;
}

function initMicGuardEngine() {
  injectAudioSentinel();

  // Listen for deep in-page WebRTC and Hardware Sentinel events
  window.addEventListener('dce-audio-sentinel-event', (e) => {
    const { type, payload } = e.detail || {};
    if (!type) return;

    recordAudioDiagnostic(type, payload);

    if (type === 'CALL_DISCONNECTED') {
      const summary = payload || {};
      lastCompletedCallSummary = summary;
      showCallWrapUpToast(summary);

      // Save to chrome storage
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(["dce_call_history"], (res) => {
          const list = res.dce_call_history || [];
          list.unshift(summary);
          chrome.storage.local.set({ 
            dce_call_history: list.slice(0, 30),
            dce_latest_call: summary
          });
        });
      }

      // If call terminated abnormally, notify supervisor alert feed
      if (summary.category === 'ONE_WAY_AUDIO_DROP' || summary.category === 'HEADSET_DROP' || summary.category === 'NETWORK_TIMEOUT') {
        const agentName = scrapeAgentNameFromTopBar();
        const agentId = agentName.toLowerCase().replace(/\s+/g, '.');
        const assignedMeta = (typeof customRosterMappingCache !== 'undefined' && customRosterMappingCache[agentName]) || DEFAULT_TL_MAPPING[agentName] || {
          tl: "Unassigned TL",
          team: "General Contact Centre"
        };
        const activeTicket = scrapeActiveTicketData() || {};

        const callDropAlert = {
          id: "alert_calldrop_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
          type: summary.category === 'ONE_WAY_AUDIO_DROP' ? "ONE_WAY_AUDIO" : "MIC_DISCONNECTED",
          agentId: agentId,
          agentName: agentName,
          teamLeader: assignedMeta.tl,
          team: assignedMeta.team,
          title: `Call Terminated: ${summary.terminatedBy}`,
          message: `${summary.rootCause} (Duration: ${summary.durationFormatted})`,
          ticketRef: activeTicket.ticketRef || "--",
          createdAt: Date.now(),
          read: false
        };

        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ action: "PUBLISH_AGENT_ALERT", alert: callDropAlert }).catch(() => {});
        }
      }
    } else if (type === 'DEVICE_DISCONNECTED') {
      const devNames = (payload.removedDevices || []).map(d => d.label).join(', ') || 'Headset';
      triggerAudioSentinelAlert('DEVICE_DISCONNECTED', `Microphone hardware unplugged or disconnected: ${devNames}`);
    } else if (type === 'GUM_ERROR') {
      const errName = payload.errorName || 'NotFoundError';
      if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        triggerAudioSentinelAlert('DEVICE_DISCONNECTED', `Microphone not found by browser (${errName}: Requested device not found)`);
      } else if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        triggerAudioSentinelAlert('BLOCKED', `Microphone access denied in browser site permissions`);
      } else {
        triggerAudioSentinelAlert('BLOCKED', `Audio capture error: ${errName} - ${payload.errorMessage || ''}`);
      }
    } else if (type === 'RTP_FLATLINE') {
      const stalls = payload.consecutiveStalls || 2;
      triggerAudioSentinelAlert('ONE_WAY_AUDIO', `One-way audio detected: Outbound voice packets stalled for >${Math.round(stalls * 2.5)}s while on call. Client cannot hear you!`);
    } else if (type === 'TRACK_MUTED') {
      if (micGuardState === 'HEALTHY') {
        triggerAudioSentinelAlert('MUTED', `Active audio track was muted by driver or OS: ${payload.trackLabel || ''}`);
      }
    } else if (type === 'RTP_RECOVERED' || type === 'DEVICE_CONNECTED' || type === 'GUM_SUCCESS' || type === 'TRACK_UNMUTED') {
      if (micGuardState !== 'HEALTHY') {
        triggerMicGuardHealthy();
      }
    }
  });

  // Standard permission query fallback
  if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'microphone' }).then(permissionStatus => {
      const handleState = () => {
        if (permissionStatus.state === 'denied') {
          triggerMicGuardBlocked("Chrome site settings have blocked Microphone access");
        } else if (permissionStatus.state === 'granted' && micGuardState === 'BLOCKED') {
          triggerMicGuardHealthy();
        }
      };
      handleState();
      permissionStatus.onchange = handleState;
    }).catch(() => {});
  }

  setInterval(evaluateMicGuard, 3000);
}

// Scrapes CTI / Telephony presence state and specific Aux reason or active Call Disposition
function scrapeTelephonyStateAndReason() {
  const fullBodyText = (document.body ? (document.body.innerText || "") : "").toLowerCase();

  // 1. Mic Guard check - Abrupt Disconnection / Microphone Error (Leggero DCE / Chrome site permissions)
  const isMicBlocked = (micGuardState === "BLOCKED") ||
    fullBodyText.includes("logged out from telephony") ||
    fullBodyText.includes("abrupt disconnection") ||
    fullBodyText.includes("allow microphone permission") ||
    fullBodyText.includes("needs access to your microphone");

  if (isMicBlocked) {
    if (micGuardState !== "BLOCKED") {
      triggerMicGuardBlocked("Telephony disconnected (Chrome microphone permission revoked)");
    }
    return {
      status: "OFFLINE",
      auxReason: "Disconnected (Microphone Required)"
    };
  }

  // 2. Check if agent is on an active call with a disposition selected in Call History / CRM datatable
  const liveDomQuery = scrapeSelectedQueryFromDom();
  if (liveDomQuery && liveDomQuery.title) {
    return {
      status: "AVAILABLE",
      auxReason: `On Call: ${liveDomQuery.title}`
    };
  }

  // Check if call is actively connected / active call controls
  const callActionElements = Array.from(document.querySelectorAll('button, a, .btn, span, [role="button"]'));
  const isActivelyOnCall = callActionElements.some(el => {
    const t = (el.innerText || el.textContent || "").trim().toLowerCase();
    return t === "hang up" || t === "end call" || t === "release call" || t === "talking" || t.includes("call in progress");
  });
  if (isActivelyOnCall) {
    return {
      status: "AVAILABLE",
      auxReason: "On Call"
    };
  }

  // 3. Check for EXPLICIT Paused state (button says "Resume Telephony" or status badge shows "Paused")
  // NOTE: If the button says "Pause Telephony", telephony is ACTIVE and NOT paused!
  let isExplicitlyPaused = false;
  let detectedReason = null;

  for (const el of callActionElements) {
    const text = (el.innerText || el.textContent || "").trim().toLowerCase();
    if (!text) continue;

    if (text.includes("resume telephony") || text.includes("unpause telephony") || text === "resume") {
      isExplicitlyPaused = true;
      break;
    }
  }

  // Check explicit status text badges (e.g. "Status: Paused" or "Telephony: Paused")
  const statusBadges = Array.from(document.querySelectorAll('.badge, .status-badge, .telephony-status, [class*="status"], [class*="state"]'));
  for (const b of statusBadges) {
    const bText = (b.innerText || b.textContent || "").trim().toLowerCase();
    if (bText === "paused" || bText.startsWith("paused:") || bText.includes("telephony paused")) {
      isExplicitlyPaused = true;
      break;
    }
  }

  if (isExplicitlyPaused) {
    // Only look for selected aux reason when actually paused
    const selectedOption = document.querySelector('select[name*="aux" i] option:checked, select[name*="pause" i] option:checked, .dropdown-menu .active');
    if (selectedOption) {
      const optText = (selectedOption.innerText || selectedOption.textContent || "").trim();
      for (const reason of KNOWN_AUX_REASONS) {
        if (optText.toLowerCase().includes(reason.toLowerCase())) {
          detectedReason = reason;
          break;
        }
      }
    }
    return {
      status: "UNAVAILABLE",
      auxReason: detectedReason || "Paused"
    };
  }

  // 4. Telephony Active & Ready (e.g. EXT: 3131 or Pause Telephony control active)
  // When telephony is connected and agent is not on a call, they are Available but not on call
  const hasExtOrTelephony = 
    fullBodyText.includes("ext:") || 
    fullBodyText.includes("pause telephony") ||
    fullBodyText.includes("telephony") ||
    document.querySelector('[class*="telephony"], [id*="telephony"]');

  const agentName = scrapeAgentNameFromTopBar();
  if (agentName !== "Unknown Agent" || hasExtOrTelephony) {
    return {
      status: "AVAILABLE",
      auxReason: "Available but not on call"
    };
  }

  return { status: "OFFLINE", auxReason: "Offline" };
}

// Scrapes customer information card from DEL CRM screen
function scrapeCustomerInfoFromDom() {
  const fullText = document.body.innerText;

  const nameMatch = fullText.match(/(?:Name|Customer|Individual)\s*:\s*([A-Za-z\s]+)/i);
  const idMatch = fullText.match(/(?:National ID|ID Number|ID)\s*:\s*(\d{13})/i);
  const phoneMatch = fullText.match(/(?:Phone Number|Phone|Mobile)\s*:\s*(\d{10})/i);
  const emailMatch = fullText.match(/(?:Email Address|Email)\s*:\s*([\w.-]+@[\w.-]+\.\w+)/i);

  return {
    customerName: nameMatch ? nameMatch[1].trim() : "",
    idNumber: idMatch ? idMatch[1] : "",
    phoneNumber: phoneMatch ? phoneMatch[1] : "",
    email: emailMatch ? emailMatch[1] : ""
  };
}

// Scrapes the currently active open ticket on the screen across DEL CRM, AltDesk, Telviva, or any web platform
function scrapeActiveTicketData() {
  const caseTitle = document.querySelector('[formcontrolname="case_title"], [formcontrolname="subject"], #ticket-subject, .ticket-title, h1.ticket-subject, input[name*="title" i]')?.value || 
                    document.querySelector('.ticket-title, h1.ticket-subject, #ticket-subject')?.innerText || "No Active Case";

  const caseStatus = document.querySelector('[formcontrolname="case_status"], select[name*="status" i], .ticket-status')?.value || 
                     document.querySelector('.ticket-status, .badge-status')?.innerText || "--";

  const province = document.querySelector('[formcontrolname="province"], [name*="province" i]')?.value || "--";
  const labourCenter = document.querySelector('[formcontrolname="labour_centre"], [name*="centre" i]')?.value || "--";
  const noteText = document.querySelector('textarea[formcontrolname="note_text"], textarea#ticket-notes, textarea[name*="note" i], textarea')?.value || "";

  // Ref extraction (Supports DEL CRM C-XXXXXXXX-X, AltDesk T-XXXXX, #XXXXX, or any ticket ref)
  const refEl = document.querySelector('.case-id, .ticket-ref, .ticket-id, #ticket-ref, [data-testid="ticket-id"], h3, h4');
  const refText = refEl ? refEl.innerText : document.body.innerText;
  const refMatch = refText.match(/C-\d{8}-\d+|C-\d{4,}|T-\d{4,}|#\d{4,}|INC\d{5,}/i);
  const ticketRef = refMatch ? refMatch[0] : "--";

  // Check notes compliance
  const hasTokens = /\[Insert Date\]|\[DATE\]|\[number\]|\[LANGUAGE\]/i.test(noteText);
  const adheres = (/QUERY\s*:/i.test(noteText) && /STATUS\s*:/i.test(noteText) && /ADVICE\s*:/i.test(noteText)) ||
    (/client called/i.test(noteText) && /advised/i.test(noteText) && (/submitted/i.test(noteText) || /turn\s*around/i.test(noteText) || /working days/i.test(noteText) || /tat/i.test(noteText)));

  return {
    ticketRef,
    caseTitle,
    caseStatus,
    province,
    labourCenter,
    hasTokens,
    adheres,
    notesLength: noteText.length
  };
}

// Scrapes the selected query from the DEL CRM query dropdown selector (<select class="form-control form-control-sm">)
function scrapeSelectedQueryFromDom() {
  const selectors = [
    'div.py-2.d-flex select',
    'select.form-control.form-control-sm',
    'select[formcontrolname="query"]',
    'select[formcontrolname="query_type"]',
    'select[formcontrolname*="query"]',
    '.d-flex select'
  ];

  let querySelectEl = null;

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.options && el.options.length > 1) {
      querySelectEl = el;
      break;
    }
  }

  if (!querySelectEl) {
    const selects = Array.from(document.querySelectorAll('select'));
    querySelectEl = selects.find(sel => {
      return Array.from(sel.options).some(opt => opt.value && (opt.value.toLowerCase().includes('uif') || opt.value.toLowerCase().includes('u-filing')));
    });
  }

  if (!querySelectEl) return null;

  const selectedOption = querySelectEl.options[querySelectEl.selectedIndex];
  if (!selectedOption) return null;

  const val = (selectedOption.value || "").trim();
  const text = (selectedOption.textContent || selectedOption.innerText || "").trim();

  if (!val || val === "null" || val === "--" || text === "--" || !text) {
    return null;
  }

  return {
    key: val,
    title: text,
    issue: text
  };
}

// Automatically detect when agent selects a query directly on the DEL CRM web page
document.addEventListener('change', (e) => {
  if (e.target && e.target.tagName === 'SELECT') {
    const val = e.target.value;
    const text = e.target.options?.[e.target.selectedIndex]?.textContent?.trim();
    if (val && val !== 'null' && text && text !== '--') {
      const isUifQuery = Array.from(e.target.options).some(opt => opt.value && (opt.value.includes('uif') || opt.value.includes('u-filing')));
      if (isUifQuery) {
        selectedQuery = { key: val, title: text, issue: text };
        dispatchAgentHeartbeat(false);
        chrome.runtime.sendMessage({ action: "QUERY_AUTO_DETECTED", query: selectedQuery }).catch(() => {});
      }
    }
  }
}, true);

function handleCaseSavedEvent() {
  const agentName = scrapeAgentNameFromTopBar();
  const agentId = agentName.toLowerCase().replace(/\s+/g, '.');
  const ticketData = scrapeActiveTicketData() || {};
  const customerData = scrapeCustomerInfoFromDom();
  const assignedMeta = DEFAULT_TL_MAPPING[agentName] || { tl: "Unassigned TL", team: "General Contact Centre" };

  const savedAlertItem = {
    id: "alert_saved_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
    type: "CASE_SAVED",
    agentId: agentId,
    agentName: agentName,
    teamLeader: assignedMeta.tl,
    team: assignedMeta.team,
    query: selectedQuery || {},
    ticketRef: ticketData.ticketRef || "--",
    caseTitle: ticketData.caseTitle || "Closed Case",
    caseStatus: "Resolved / Closed",
    customer: customerData,
    createdAt: Date.now(),
    read: false
  };

  // 1. Sync saved case alert to local chrome.storage
  chrome.storage.local.get(["dce_alerts", "dce_saved_cases"], (res) => {
    const alerts = res.dce_alerts || [];
    const savedCases = res.dce_saved_cases || [];
    alerts.unshift(savedAlertItem);
    savedCases.unshift(savedAlertItem);
    chrome.storage.local.set({
      dce_alerts: alerts.slice(0, 500),
      dce_saved_cases: savedCases.slice(0, 500)
    });
  });

  // 2. Broadcast via service worker to backend
  chrome.runtime.sendMessage({ action: "PUBLISH_AGENT_ALERT", alert: savedAlertItem });

  // 3. Dispatch heartbeat with saved state
  dispatchAgentHeartbeat(false);
}

// Automatically detect when agent clicks Save / Submit / Resolve button in DEL CRM
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button, input[type="submit"], .btn-save, .btn-submit, a.btn');
  if (!btn) return;
  const txt = (btn.innerText || btn.value || "").toLowerCase();
  if (txt.includes('save') || txt.includes('submit') || txt.includes('resolve') || txt.includes('close')) {
    setTimeout(handleCaseSavedEvent, 500);
  }
}, true);

// --- 2. LIVE BROADCASTER (LOCAL & ONLINE READY) ---

// --- CLIENT-SIDE FRICTION & TIME-TRACKING TELEMETRY ENGINE ---
let activeFieldFocusName = null;
let activeFieldStartTime = 0;
let fieldFrictionLog = [];
let ticketStartTime = Date.now();
let lastNavigationClickTime = 0;
let lastNavigationLatencyMs = 850;
let customRosterMappingCache = {};

// Load dynamic Roster Sheet mapping if configured
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get(["dce_master_roster_mapping"], (res) => {
    if (res && res.dce_master_roster_mapping) {
      customRosterMappingCache = res.dce_master_roster_mapping;
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.dce_master_roster_mapping) {
      customRosterMappingCache = changes.dce_master_roster_mapping.newValue || {};
    }
  });
}

// Track field focus dwell time (detecting when agents get stuck in fields)
window.addEventListener('focusin', (e) => {
  const target = e.target;
  if (target && target.matches('input, select, textarea, [formcontrolname]')) {
    const fcn = target.getAttribute('formcontrolname') || target.name || target.id || target.tagName.toLowerCase();
    activeFieldFocusName = fcn;
    activeFieldStartTime = Date.now();
  }
}, true);

window.addEventListener('focusout', (e) => {
  if (activeFieldFocusName && activeFieldStartTime > 0) {
    const durationSec = Math.round((Date.now() - activeFieldStartTime) / 1000);
    if (durationSec >= 12) { // 12+ seconds stuck in a field = friction point
      fieldFrictionLog.push({
        field: activeFieldFocusName,
        durationSec: durationSec,
        timestamp: new Date().toLocaleTimeString()
      });
      if (fieldFrictionLog.length > 30) fieldFrictionLog.shift();
    }
    activeFieldFocusName = null;
    activeFieldStartTime = 0;
  }
}, true);

// Track page load and navigation latency
window.addEventListener('click', (e) => {
  const clickTarget = e.target.closest('a, button, [role="tab"], ngx-datatable datatable-body-row, .nav-link');
  if (clickTarget) {
    lastNavigationClickTime = performance.now();
  }
}, true);

const pageLatencyObserver = new MutationObserver(() => {
  if (lastNavigationClickTime > 0) {
    const elapsed = performance.now() - lastNavigationClickTime;
    if (elapsed > 300 && elapsed < 12000) {
      lastNavigationLatencyMs = Math.round(elapsed);
    }
    lastNavigationClickTime = 0;
  }
});

if (document.body) {
  pageLatencyObserver.observe(document.body, { childList: true, subtree: true });
}

async function dispatchAgentHeartbeat(forceOffline = false) {
  const agentName = scrapeAgentNameFromTopBar();
  if (agentName === "Unknown Agent" && !forceOffline) return;

  const agentId = agentName.toLowerCase().replace(/\s+/g, '.');
  const presenceState = forceOffline ? { status: "OFFLINE", auxReason: "Offline" } : scrapeTelephonyStateAndReason();
  const ticketData = forceOffline ? null : scrapeActiveTicketData();
  
  const liveDomQuery = scrapeSelectedQueryFromDom();
  if (liveDomQuery) {
    selectedQuery = liveDomQuery;
  }

  if (ticketData) {
    ticketData.flaggedIncomplete = ticketFlaggedIncomplete;
    ticketData.selectedQuery = selectedQuery;
  }

  // Resolve TL & Team from custom Roster Sheet mapping, default mapping, or fallback
  const assignedMeta = customRosterMappingCache[agentName] || DEFAULT_TL_MAPPING[agentName] || {
    tl: "Unassigned TL",
    team: "General Contact Centre"
  };

  const handleTimeSec = Math.round((Date.now() - ticketStartTime) / 1000);
  const currentDwellSec = (activeFieldFocusName && activeFieldStartTime > 0) 
    ? Math.round((Date.now() - activeFieldStartTime) / 1000) 
    : 0;

  const heartbeatPayload = {
    agentId,
    agentName,
    teamLeader: assignedMeta.tl,
    team: assignedMeta.team,
    status: presenceState.status,
    auxReason: presenceState.auxReason,
    lastHeartbeat: Date.now(),
    activeCase: ticketData,
    telemetry: {
      fieldFriction: fieldFrictionLog.slice(-5), // Send recent 5 friction events
      stuckField: currentDwellSec >= 12 ? { field: activeFieldFocusName, durationSec: currentDwellSec } : null,
      avgNavigationLatencyMs: lastNavigationLatencyMs,
      handleTimeSec: handleTimeSec > 0 ? handleTimeSec : 45
    }
  };

  chrome.runtime.sendMessage({ action: "PUBLISH_AGENT_HEARTBEAT", agent: heartbeatPayload });

  window.dispatchEvent(new CustomEvent("DCE_AGENT_HEARTBEAT_BROADCAST", {
    detail: JSON.stringify(heartbeatPayload)
  }));

  chrome.storage.local.get(["dce_live_roster"], (res) => {
    let roster = res.dce_live_roster || {};
    roster[agentId] = heartbeatPayload;
    chrome.storage.local.set({ dce_live_roster: roster });
  });
}

// Heartbeat Loop (every 5 seconds)
setInterval(() => {
  dispatchAgentHeartbeat(false);
}, 5000);

// Immediate First Ping
setTimeout(() => {
  dispatchAgentHeartbeat(false);
}, 1500);

// Set offline immediately when tab closes or navigates away
window.addEventListener('beforeunload', () => {
  dispatchAgentHeartbeat(true);
});

// --- 3. STANDARD AUTO-CLOSER & TICKET LOOKUP ENGINE ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "SET_SELECTED_QUERY") {
    selectedQuery = message.query || null;
    if (selectedQuery && selectedQuery.key) {
      const querySelectEl = document.querySelector('div.py-2.d-flex select, select.form-control.form-control-sm, select[formcontrolname*="query"]');
      if (querySelectEl) {
        const matchingOption = Array.from(querySelectEl.options).find(opt => 
          opt.value === selectedQuery.key || 
          opt.textContent.trim().toLowerCase() === selectedQuery.title?.toLowerCase()
        );
        if (matchingOption) {
          querySelectEl.value = matchingOption.value;
          querySelectEl.dispatchEvent(new Event('change', { bubbles: true }));
          querySelectEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }
    dispatchAgentHeartbeat(false);
    sendResponse({ status: "QUERY_UPDATED" });
    return true;
  }

  if (message.action === "FLAG_TICKET_INCOMPLETE") {
    ticketFlaggedIncomplete = Boolean(message.flagged);
    dispatchAgentHeartbeat(false);

    if (ticketFlaggedIncomplete) {
      const agentName = scrapeAgentNameFromTopBar();
      const agentId = agentName.toLowerCase().replace(/\s+/g, '.');
      const ticketData = scrapeActiveTicketData() || {};
      const assignedMeta = DEFAULT_TL_MAPPING[agentName] || { tl: "Unassigned TL", team: "General Contact Centre" };

      const alertItem = {
        id: "alert_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
        type: "INCOMPLETE_TICKET",
        agentId: agentId,
        agentName: agentName,
        teamLeader: assignedMeta.tl,
        team: assignedMeta.team,
        query: selectedQuery || {},
        ticketRef: ticketData.ticketRef || "--",
        issue: selectedQuery?.issue || ticketData.caseTitle || "Incomplete Details",
        caseTitle: ticketData.caseTitle || "Uncategorised",
        createdAt: Date.now(),
        read: false
      };

      // 1. Sync to local storage for TL/Admin and Support extensions
      chrome.storage.local.get(["dce_alerts"], (res) => {
        const alerts = res.dce_alerts || [];
        alerts.unshift(alertItem);
        chrome.storage.local.set({ dce_alerts: alerts.slice(0, 500) });
      });

      // 2. Broadcast via service worker to backend server if available
      chrome.runtime.sendMessage({ action: "PUBLISH_AGENT_ALERT", alert: alertItem });
    }

    sendResponse({ status: "FLAG_UPDATED" });
    return true;
  }

  if (message.action === "SET_AGENT_NAME") {
    if (message.agentName) {
      saveDetectedAgentName(message.agentName);
      dispatchAgentHeartbeat(false);
    }
    sendResponse({ status: "AGENT_NAME_UPDATED", agentName: scrapeAgentNameFromTopBar() });
    return true;
  }

  if (message.action === "PING") {
    const presenceState = scrapeTelephonyStateAndReason();
    sendResponse({ 
      status: "PONG", 
      agentName: scrapeAgentNameFromTopBar(), 
      presence: presenceState.status,
      auxReason: presenceState.auxReason,
      hostname: window.location.hostname || window.location.host,
      url: window.location.href,
      title: document.title || "Web Application",
      micGuardStatus: micGuardState,
      micGuardDetail: micGuardDetailMessage,
      audioDiagnostics: recentAudioDiagnostics,
      latestCall: lastCompletedCallSummary
    });
    return true;
  }

  if (message.action === "GET_AUDIO_DIAGNOSTICS") {
    sendResponse({
      status: "OK",
      micGuardState: micGuardState,
      micGuardDetail: micGuardDetailMessage,
      diagnostics: recentAudioDiagnostics
    });
    return true;
  }

  if (message.action === "RESUME_MACRO") {
    showPauseBanner(false);
    if (macroResumeResolver) {
      macroResumeResolver();
      macroResumeResolver = null;
    }
    sendResponse({ status: "MACRO_RESUMED" });
    return true;
  }

  if (message.action === "PLAY_STEPS") {
    sendResponse({ status: "PLAYBACK_STARTED" });
    replayRecordedSteps(message.steps);
    return true;
  }

  if (message.action === "INSERT_INTO_NOTES_LOG") {
    insertStagedNoteIntoDceNotesLog(message.notesText);
    setTimeout(handleCaseSavedEvent, 800);
    sendResponse({ status: "NOTE_INSERTED" });
    return true;
  }

  if (message.action === "FIND_LATEST_AND_OPEN_NOTES") {
    findLatestTicketAndOpenNotesLog(message.tabType);
    sendResponse({ status: "SCANNING_INITIATED" });
    return true;
  }

  return true;
});

function locateTargetElement(targetSelector) {
  let el = document.querySelector(targetSelector);
  if (el) return el;

  const fcnMatch = targetSelector.match(/formcontrolname=["']([^"']+)["']/i);
  if (fcnMatch) {
    const fcn = fcnMatch[1];
    el = document.querySelector(`[formcontrolname="${fcn}"]`) || 
         document.getElementById(`sc_cases-${fcn}`) ||
         document.getElementById(fcn);
    if (el) return el;
  }

  const idMatch = targetSelector.match(/#([\w\-]+)/);
  if (idMatch) {
    el = document.getElementById(idMatch[1]);
    if (el) return el;
  }
  return null;
}

function formatDateToStandard(dateObj = new Date()) {
  const day = String(dateObj.getDate()).padStart(2, '0');
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[dateObj.getMonth()];
  const year = dateObj.getFullYear();
  return `${day} ${month} ${year}`;
}

function formatDateISO(dateObj = new Date()) {
  return dateObj.toISOString().split('T')[0];
}

let macroResumeResolver = null;

function showPauseBanner(show, stepText = "") {
  const old = document.getElementById('macro-pause-banner');
  if (old) old.remove();
  if (!show) return;

  const banner = document.createElement('div');
  banner.id = 'macro-pause-banner';
  banner.style.cssText = `
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(15, 23, 42, 0.96);
    color: #fef2f2;
    border: 2px solid #7c3aed;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(124, 58, 237, 0.5);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: 12px;
    padding: 12px 22px;
    z-index: 999999999;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex;
    align-items: center;
    gap: 16px;
  `;
  banner.innerHTML = `
    <div style="display: flex; flex-direction: column;">
      <span style="font-size: 12px; font-weight: bold; color: #c4b5fd;">MACRO PAUSED FOR ON-SCREEN INPUT (${stepText})</span>
      <span style="font-size: 10px; color: #cbd5e1;">Fill or inspect details on screen now, then click Resume to continue macro execution.</span>
    </div>
    <button id="btn-resume-macro-page" style="background: linear-gradient(135deg, #10b981, #059669); color: white; border: 1px solid #34d399; font-weight: bold; border-radius: 6px; padding: 7px 16px; font-size: 11px; cursor: pointer; box-shadow: 0 0 12px rgba(16, 185, 129, 0.5);">
      Resume Macro Execution
    </button>
  `;
  document.body.appendChild(banner);

  document.getElementById('btn-resume-macro-page')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showPauseBanner(false);
    if (macroResumeResolver) {
      macroResumeResolver();
      macroResumeResolver = null;
    }
    chrome.runtime.sendMessage({ action: "MACRO_RESUMED" });
  });
}

async function replayRecordedSteps(steps) {
  if (!steps || steps.length === 0) {
    chrome.runtime.sendMessage({ action: "PLAYBACK_FINISHED" });
    return;
  }

  const todayIso = formatDateISO();
  const todayStd = formatDateToStandard();
  const nextWeekIso = formatDateISO(new Date(Date.now() + 7 * 86400000));

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // Handle manual wait / pause / fill-in step: Pause execution and notify agent until Resume is clicked
    const isWaitInputStep = step.action === "wait_input" || 
                            step.action === "pause" || 
                            step.requiresInput === true || 
                            step.prompt === true || 
                            step.requiresManualInput === true || 
                            (step.action === "input" && (!step.inputValue || step.inputValue.trim() === "" || /\[DATE\]|\[NUMBER\]|\[FILL_IN\]|\[INPUT_NEEDED\]|\[PROMPT\]|\[MANUAL\]|\[Insert Date\]/i.test(step.inputValue)));

    if (isWaitInputStep) {
      let element = locateTargetElement(step.target);
      let fieldName = step.fieldName || step.targetLabel || "";
      if (!fieldName && element) {
        fieldName = element.getAttribute('formcontrolname') || 
                    element.name || 
                    element.getAttribute('aria-label') || 
                    element.placeholder || 
                    element.id || 
                    "CRM Field";
      }
      if (!fieldName) fieldName = step.target || "Required Field";

      let promptMsg = `Please fill in [${fieldName}]`;
      if (/\[DATE\]|\[Insert Date\]/i.test(step.inputValue || "") || /date/i.test(fieldName)) {
        promptMsg = `Please select or enter the required Date in [${fieldName}]`;
      } else if (/\[NUMBER\]/i.test(step.inputValue || "") || /number|claim|ref/i.test(fieldName)) {
        promptMsg = `Please enter the required Number in [${fieldName}]`;
      }

      if (element) {
        element.scrollIntoView({ block: 'center' });
        element.focus();
        element.style.outline = "3px solid #7c3aed";
        element.style.boxShadow = "0 0 20px rgba(124, 58, 237, 0.9)";
      }
      showPauseBanner(true, `Step ${i + 1} of ${steps.length}: ${promptMsg}`);
      chrome.runtime.sendMessage({ 
        action: "MACRO_PAUSED", 
        stepIndex: i + 1, 
        totalSteps: steps.length, 
        fieldName: fieldName, 
        promptMsg: promptMsg,
        target: step.target 
      });

      await new Promise(resolve => {
        macroResumeResolver = resolve;
      });

      if (element) {
        element.style.outline = "";
        element.style.boxShadow = "";
      }
      continue;
    }

    let element = locateTargetElement(step.target);

    if (!element) {
      for (let retry = 0; retry < 20; retry++) {
        await new Promise(r => setTimeout(r, 200));
        element = locateTargetElement(step.target);
        if (element) break;
      }
    }

    if (!element) continue;

    if (step.action === "input") {
      element.focus();
      
      let rawVal = step.inputValue || "";
      // Use live user-entered values directly without auto-generating random numbers or fake IDs
      let resolvedVal = rawVal
        .replace(/\[DATE\]|\[Insert Date\]/gi, element.type === 'date' ? todayIso : todayStd)
        .replace(/\[TODAY\]/gi, element.type === 'date' ? todayIso : todayStd);

      element.value = resolvedVal;
      try {
        const proto = element.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (nativeSetter) nativeSetter.call(element, resolvedVal);
      } catch (e) {}

      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (step.action === "select" || element.tagName === "SELECT") {
      let matchedOpt = null;
      const targetChoice = (step.savedOptionChoice || "").toLowerCase().replace(/[\s\-_/]+/g, ' ').trim();
      const targetVal = (step.savedOptionValue || "").toString().toLowerCase().trim();

      for (let optRetry = 0; optRetry < 25; optRetry++) {
        const availableOptions = Array.from(element.options).filter(o => o.value !== "" && o.text.trim() !== "--");

        if (availableOptions.length > 0) {
          matchedOpt = availableOptions.find(o => {
            const optText = o.text.toLowerCase().replace(/[\s\-_/]+/g, ' ').trim();
            const optVal = o.value.toString().toLowerCase().trim();
            return optVal === targetVal || optText === targetChoice;
          });

          if (!matchedOpt) {
            matchedOpt = availableOptions.find(o => {
              const optText = o.text.toLowerCase().replace(/[\s\-_/]+/g, ' ').trim();
              if (targetChoice.includes("normal") && optText.includes("normal")) return true;
              return optText.length > 3 && (optText === targetChoice || targetChoice === optText);
            });
          }
        }

        if (matchedOpt) break;
        await new Promise(r => setTimeout(r, 150));
      }

      if (matchedOpt) {
        element.selectedIndex = matchedOpt.index;
        element.value = matchedOpt.value;

        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    } else {
      element.scrollIntoView({ block: 'center' });
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }

    await new Promise(r => setTimeout(r, step.delay || 700));
  }

  chrome.runtime.sendMessage({ action: "PLAYBACK_FINISHED" });
}

async function findLatestTicketAndOpenNotesLog(tabType) {
  const navTabs = Array.from(document.querySelectorAll('.nav-link, button, [role="tab"], .btn, span'));
  const targetTab = navTabs.find(el => {
    const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
    return tabType === "OPEN" ? txt === "open cases" : txt === "closed cases";
  });

  if (targetTab) {
    targetTab.click();
    targetTab.dispatchEvent(new Event('click', { bubbles: true }));
  }

  await new Promise(r => setTimeout(r, 700));

  const rowElements = Array.from(document.querySelectorAll('ngx-datatable datatable-body-row, .datatable-body-row, tbody tr'));
  if (!rowElements || rowElements.length === 0) {
    chrome.runtime.sendMessage({ action: "NO_CASES_FOUND", tabType: tabType });
    return;
  }

  const parsedCases = [];
  rowElements.forEach((row, index) => {
    const rowText = row.innerText || row.textContent || "";
    const refMatch = rowText.match(/C-\d{8}-\d+|C-\d{4,}/i) || rowText.match(/\b\d{7,}\b/);
    const ticketRef = refMatch ? refMatch[0] : `Ticket #${index + 1}`;

    const dateMatch = rowText.match(/\d{2}\s+[A-Za-z]{3}\s+\d{4}(\s+\d{2}:\d{2})?/) || rowText.match(/\d{4}-\d{2}-\d{2}(\s+\d{2}:\d{2})?/);
    let parsedTimestamp = 0;

    if (dateMatch) {
      const parsedDate = new Date(dateMatch[0]);
      parsedTimestamp = !isNaN(parsedDate.getTime()) ? parsedDate.getTime() : 0;
    }

    parsedCases.push({
      element: row,
      ticketRef: ticketRef,
      timestamp: parsedTimestamp
    });
  });

  parsedCases.sort((a, b) => b.timestamp - a.timestamp);
  const latestCase = parsedCases[0];

  const clickTarget = latestCase.element.querySelector('a, .datatable-body-cell, span') || latestCase.element;
  clickTarget.scrollIntoView({ block: 'center' });
  clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

  for (let poll = 0; poll < 18; poll++) {
    await new Promise(r => setTimeout(r, 200));
    const allTabs = Array.from(document.querySelectorAll('.nav-link, a, [role="tab"], button, span'));
    const notesLogTab = allTabs.find(el => {
      const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
      return txt === "notes log" || txt.includes("notes log");
    });

    if (notesLogTab) {
      notesLogTab.scrollIntoView({ block: 'center' });
      notesLogTab.click();
      notesLogTab.dispatchEvent(new Event('click', { bubbles: true }));
      break;
    }
  }

  chrome.runtime.sendMessage({
    action: "LATEST_CASE_FOUND",
    ticketRef: latestCase.ticketRef
  });
}

function insertStagedNoteIntoDceNotesLog(notesText) {
  const noteSelectors = [
    'textarea[formcontrolname="note_text"]',
    'textarea[formcontrolname="notes"]',
    '#notes-log-textarea',
    'textarea[name*="note" i]',
    '.notes-log textarea',
    'textarea'
  ];

  let targetBox = null;
  for (const selector of noteSelectors) {
    const el = document.querySelector(selector);
    if (el && el.offsetParent !== null) {
      targetBox = el;
      break;
    }
  }

  if (!targetBox) {
    alert("Please ensure the Notes Log tab is selected and the note entry field is visible on DEL CRM.");
    return;
  }

  targetBox.focus();
  targetBox.value = notesText;
  targetBox.dispatchEvent(new Event('input', { bubbles: true }));
  targetBox.dispatchEvent(new Event('change', { bubbles: true }));
}

// Start Proactive Mic Guard Monitoring
initMicGuardEngine();

// ============================================================
// CRM TAB PERMISSION ENFORCEMENT (Admin-controlled)
// ============================================================
(function initTabPermissionGuard() {
  const TOAST_ID = 'dce-tab-blocked-toast';

  function showTabBlockedToast(tabName) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = TOAST_ID;
      toast.style.cssText = [
        'position: fixed',
        'top: 70px',
        'left: 50%',
        'transform: translateX(-50%)',
        'background: #7f1d1d',
        'color: #fef2f2',
        'border: 1px solid #ef4444',
        'border-radius: 6px',
        'padding: 8px 18px',
        'font-size: 12px',
        'font-weight: bold',
        'z-index: 2147483647',
        'box-shadow: 0 4px 12px rgba(0,0,0,0.5)',
        'pointer-events: none',
        'opacity: 0',
        'transition: opacity 0.2s ease'
      ].join(';');
      document.body.appendChild(toast);
    }
    toast.innerText = `🔒 "${tabName}" is restricted by your administrator`;
    toast.style.opacity = '1';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
  }

  function attachTabGuard() {
    const navList = document.getElementById('nav-item-list');
    if (!navList || navList.dataset.dceGuarded) return;
    navList.dataset.dceGuarded = '1';

    navList.addEventListener('click', (e) => {
      const link = e.target.closest('a.nav-item-value');
      if (!link) return;
      const tabName = link.textContent.trim();

      chrome.storage.local.get(['dce_tab_permissions'], (res) => {
        const perms = res.dce_tab_permissions || {};
        // If explicitly set to false, block it
        if (perms[tabName] === false) {
          e.preventDefault();
          e.stopImmediatePropagation();
          showTabBlockedToast(tabName);
        }
      });
    }, true); // capture phase so we intercept before Angular routing
  }

  // Attach immediately if nav is already rendered
  attachTabGuard();

  // Also watch for Angular dynamically rendering the nav (route changes)
  const observer = new MutationObserver(() => {
    attachTabGuard();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();