/**
 * DCE Telephony & Audio Health Sentinel (In-Page Inject)
 * Runs directly in page context (MAIN world) to monitor WebRTC, getUserMedia,
 * audio hardware changes, RTP transmission health, and call disconnection diagnostics.
 */
(function() {
  if (window.__dceAudioSentinelInitialized) return;
  window.__dceAudioSentinelInitialized = true;

  const sentinelState = {
    knownAudioInputs: [],
    activePeerConnections: new Set(),
    activeAudioTracks: new Set(),
    lastRtpStats: new Map(), // pc -> { packetsSent, bytesSent, timestamp, stallCount }
    isCallActive: false,
    statsInterval: null,
    currentCallSession: null
  };

  function dispatchSentinelEvent(eventType, payload = {}) {
    try {
      const eventDetail = {
        type: eventType,
        timestamp: Date.now(),
        payload: payload
      };
      window.dispatchEvent(new CustomEvent('dce-audio-sentinel-event', { detail: eventDetail }));
    } catch (e) {
      // Safe fallback
    }
  }

  // --- 1. Audio Input Hardware Tracking ---
  async function refreshAudioDevices(notifyChanges = false) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({
          deviceId: d.deviceId,
          label: d.label || 'Default / Unlabeled Microphone',
          groupId: d.groupId
        }));

      if (notifyChanges && sentinelState.knownAudioInputs.length > 0) {
        const currentIds = new Set(audioInputs.map(d => d.deviceId));
        const previousIds = new Set(sentinelState.knownAudioInputs.map(d => d.deviceId));

        // Check for disconnected devices
        const removed = sentinelState.knownAudioInputs.filter(d => !currentIds.has(d.deviceId));
        if (removed.length > 0) {
          if (sentinelState.currentCallSession) {
            sentinelState.currentCallSession.deviceDrops++;
            sentinelState.currentCallSession.lastDroppedDevice = removed.map(d => d.label).join(', ');
          }
          dispatchSentinelEvent('DEVICE_DISCONNECTED', {
            removedDevices: removed,
            remainingDevices: audioInputs
          });
        }

        // Check for newly connected devices
        const added = audioInputs.filter(d => !previousIds.has(d.deviceId));
        if (added.length > 0) {
          dispatchSentinelEvent('DEVICE_CONNECTED', {
            addedDevices: added,
            allDevices: audioInputs
          });
        }
      }

      sentinelState.knownAudioInputs = audioInputs;
    } catch (err) {
      // Ignore enumeration errors
    }
  }

  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => {
      refreshAudioDevices(true);
    });
  }
  refreshAudioDevices(false);

  // --- 2. getUserMedia Interceptor ---
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

    navigator.mediaDevices.getUserMedia = async function(constraints) {
      const wantsAudio = !!(constraints && (constraints.audio || constraints.audio === undefined));

      try {
        const stream = await originalGetUserMedia(constraints);

        if (wantsAudio && stream) {
          const audioTracks = stream.getAudioTracks();
          audioTracks.forEach(track => {
            trackStreamTrack(track, constraints);
          });
        }

        dispatchSentinelEvent('GUM_SUCCESS', {
          constraints: constraints,
          tracks: stream.getAudioTracks().map(t => ({ id: t.id, label: t.label, readyState: t.readyState }))
        });

        return stream;
      } catch (error) {
        if (wantsAudio) {
          if (sentinelState.currentCallSession) {
            sentinelState.currentCallSession.deviceDrops++;
          }
          dispatchSentinelEvent('GUM_ERROR', {
            errorName: error.name || 'UnknownError',
            errorMessage: error.message || '',
            constraints: constraints,
            knownAudioInputs: sentinelState.knownAudioInputs
          });
        }
        throw error;
      }
    };
  }

  function trackStreamTrack(track, constraints = null) {
    if (!track || sentinelState.activeAudioTracks.has(track)) return;
    sentinelState.activeAudioTracks.add(track);

    track.addEventListener('mute', () => {
      if (sentinelState.currentCallSession) {
        sentinelState.currentCallSession.outboundStalls++;
      }
      dispatchSentinelEvent('TRACK_MUTED', {
        trackId: track.id,
        trackLabel: track.label,
        muted: track.muted,
        readyState: track.readyState
      });
    });

    track.addEventListener('unmute', () => {
      dispatchSentinelEvent('TRACK_UNMUTED', {
        trackId: track.id,
        trackLabel: track.label,
        muted: track.muted,
        readyState: track.readyState
      });
    });

    track.addEventListener('ended', () => {
      sentinelState.activeAudioTracks.delete(track);
      if (sentinelState.currentCallSession) {
        sentinelState.currentCallSession.deviceDrops++;
      }
      dispatchSentinelEvent('TRACK_ENDED', {
        trackId: track.id,
        trackLabel: track.label,
        readyState: track.readyState
      });
    });
  }

  // --- 3. RTCPeerConnection Interceptor & Outbound-RTP Health Monitor ---
  if (window.RTCPeerConnection) {
    const OriginalRTCPeerConnection = window.RTCPeerConnection;

    window.RTCPeerConnection = function(...args) {
      const pc = new OriginalRTCPeerConnection(...args);
      sentinelState.activePeerConnections.add(pc);

      pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'failed') {
          if (sentinelState.currentCallSession) sentinelState.currentCallSession.iceFailures++;
        }
        if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
          sentinelState.activePeerConnections.delete(pc);
          sentinelState.lastRtpStats.delete(pc);
        }
        evaluateCallActiveState();
      });

      pc.addEventListener('iceconnectionstatechange', () => {
        if (pc.iceConnectionState === 'failed') {
          if (sentinelState.currentCallSession) sentinelState.currentCallSession.iceFailures++;
        }
        if (pc.iceConnectionState === 'closed' || pc.iceConnectionState === 'failed') {
          sentinelState.activePeerConnections.delete(pc);
          sentinelState.lastRtpStats.delete(pc);
        }
        evaluateCallActiveState();
      });

      return pc;
    };
    window.RTCPeerConnection.prototype = OriginalRTCPeerConnection.prototype;
  }

  function evaluateCallActiveState() {
    let anyActive = false;
    for (const pc of sentinelState.activePeerConnections) {
      const cState = pc.connectionState;
      const iceState = pc.iceConnectionState;
      if (cState === 'connected' || iceState === 'connected' || iceState === 'completed') {
        anyActive = true;
        break;
      }
    }

    if (anyActive && !sentinelState.isCallActive) {
      sentinelState.isCallActive = true;
      const activeHeadset = sentinelState.knownAudioInputs[0]?.label || "Default Microphone";
      sentinelState.currentCallSession = {
        callId: "call_" + Date.now(),
        startTime: Date.now(),
        agentClickedHangup: false,
        outboundStalls: 0,
        stalledDurationSec: 0,
        deviceDrops: 0,
        lastDroppedDevice: "",
        iceFailures: 0,
        headset: activeHeadset
      };
      startRtpStatsPolling();
      dispatchSentinelEvent('CALL_STATE_CHANGED', { active: true, session: sentinelState.currentCallSession });
    } else if (!anyActive && sentinelState.isCallActive) {
      sentinelState.isCallActive = false;
      stopRtpStatsPolling();

      const session = sentinelState.currentCallSession || { startTime: Date.now() - 1000 };
      const durationSec = Math.max(1, Math.round((Date.now() - session.startTime) / 1000));
      const mins = Math.floor(durationSec / 60);
      const secs = durationSec % 60;
      const durationFormatted = `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;

      let terminatedBy = "Client / Caller";
      let rootCause = "Normal Hangup: Client ended call cleanly";
      let category = "NORMAL_CLIENT";

      if (session.agentClickedHangup) {
        terminatedBy = "Agent";
        rootCause = "Normal Hangup: Agent clicked End Call in softphone";
        category = "NORMAL_AGENT";
      } else if (session.iceFailures > 0) {
        terminatedBy = "Network / Telecom";
        rootCause = "Abnormal Drop: WebRTC ICE connection failed (UDP/NAT keep-alive timeout)";
        category = "NETWORK_TIMEOUT";
      } else if (session.deviceDrops > 0) {
        terminatedBy = "Client (Caused by Agent Headset)";
        rootCause = `Client hung up after agent headset disconnected mid-call (${session.lastDroppedDevice || 'Jabra/USB drop'})`;
        category = "HEADSET_DROP";
      } else if (session.outboundStalls > 0 || session.stalledDurationSec >= 4) {
        terminatedBy = "Client (Caused by One-Way Audio)";
        rootCause = `Client hung up because outbound voice stalled (${Math.round(session.stalledDurationSec)}s silent mic)`;
        category = "ONE_WAY_AUDIO_DROP";
      }

      const callSummary = {
        callId: session.callId || ("call_" + Date.now()),
        startTime: session.startTime,
        endTime: Date.now(),
        durationSec: durationSec,
        durationFormatted: durationFormatted,
        terminatedBy: terminatedBy,
        rootCause: rootCause,
        category: category,
        headset: session.headset || "Default Microphone",
        outboundStalls: session.outboundStalls || 0,
        stalledDurationSec: Math.round(session.stalledDurationSec || 0),
        timestamp: new Date().toLocaleTimeString()
      };

      dispatchSentinelEvent('CALL_DISCONNECTED', callSummary);
      dispatchSentinelEvent('CALL_STATE_CHANGED', { active: false, summary: callSummary });
      sentinelState.currentCallSession = null;
    }
  }

  function startRtpStatsPolling() {
    if (sentinelState.statsInterval) clearInterval(sentinelState.statsInterval);
    sentinelState.statsInterval = setInterval(pollOutboundRtpHealth, 2500);
  }

  function stopRtpStatsPolling() {
    if (sentinelState.statsInterval) {
      clearInterval(sentinelState.statsInterval);
      sentinelState.statsInterval = null;
    }
    sentinelState.lastRtpStats.clear();
  }

  async function pollOutboundRtpHealth() {
    for (const pc of sentinelState.activePeerConnections) {
      if (pc.connectionState !== 'connected' && pc.iceConnectionState !== 'connected') continue;

      try {
        const senders = pc.getSenders ? pc.getSenders() : [];
        const audioSender = senders.find(s => s.track && s.track.kind === 'audio');

        if (!audioSender || !audioSender.getStats) continue;

        const stats = await audioSender.getStats();
        let outboundRtp = null;

        stats.forEach(report => {
          if (report.type === 'outbound-rtp' && (report.kind === 'audio' || report.mediaType === 'audio')) {
            outboundRtp = report;
          }
        });

        if (!outboundRtp) continue;

        const currentPackets = outboundRtp.packetsSent || 0;
        const currentBytes = outboundRtp.bytesSent || 0;
        const now = Date.now();

        const prev = sentinelState.lastRtpStats.get(pc);

        if (prev) {
          const deltaPackets = currentPackets - prev.packetsSent;
          const deltaBytes = currentBytes - prev.bytesSent;
          const elapsed = (now - prev.timestamp) / 1000;

          if (deltaPackets <= 0 && elapsed >= 2.0) {
            const stallCount = (prev.stallCount || 0) + 1;
            sentinelState.lastRtpStats.set(pc, {
              packetsSent: currentPackets,
              bytesSent: currentBytes,
              timestamp: now,
              stallCount: stallCount
            });

            // If stalled for 2 consecutive polls (~5 seconds) while call is connected
            if (stallCount >= 2) {
              if (sentinelState.currentCallSession) {
                sentinelState.currentCallSession.outboundStalls++;
                sentinelState.currentCallSession.stalledDurationSec += 2.5;
              }
              dispatchSentinelEvent('RTP_FLATLINE', {
                packetsSent: currentPackets,
                bytesSent: currentBytes,
                consecutiveStalls: stallCount,
                audioTrack: audioSender.track ? {
                  label: audioSender.track.label,
                  muted: audioSender.track.muted,
                  readyState: audioSender.track.readyState
                } : null
              });
            }
          } else {
            if (prev.stallCount && prev.stallCount >= 2) {
              dispatchSentinelEvent('RTP_RECOVERED', {
                packetsSent: currentPackets,
                bytesSent: currentBytes
              });
            }

            sentinelState.lastRtpStats.set(pc, {
              packetsSent: currentPackets,
              bytesSent: currentBytes,
              timestamp: now,
              stallCount: 0
            });
          }
        } else {
          sentinelState.lastRtpStats.set(pc, {
            packetsSent: currentPackets,
            bytesSent: currentBytes,
            timestamp: now,
            stallCount: 0
          });
        }
      } catch (err) {
        // Safe catch on peer connection stats error
      }
    }
  }

  // --- 4. Capture Agent Hangup Button Clicks in DOM ---
  document.addEventListener('click', (e) => {
    try {
      const target = e.target;
      if (!target) return;
      const btn = target.closest('button, a, .btn, span, [role="button"]');
      if (!btn) return;
      const txt = (btn.innerText || btn.textContent || btn.getAttribute('aria-label') || btn.title || '').toLowerCase().trim();
      if (txt === 'hang up' || txt === 'end call' || txt === 'release call' || txt === 'disconnect' || txt.includes('hang up') || txt.includes('end call')) {
        if (sentinelState.currentCallSession) {
          sentinelState.currentCallSession.agentClickedHangup = true;
        }
      }
    } catch (err) {}
  }, true);

  // --- 5. Command Listener for Agent Self-Healing ---
  window.addEventListener('dce-audio-sentinel-command', async (e) => {
    const command = e.detail && e.detail.command;
    if (!command) return;

    if (command === 'AGENT_CLICKED_HANGUP') {
      if (sentinelState.currentCallSession) {
        sentinelState.currentCallSession.agentClickedHangup = true;
      }
    }

    if (command === 'REPROBE_DEVICES') {
      await refreshAudioDevices(true);
      dispatchSentinelEvent('DEVICES_REPROBED', { devices: sentinelState.knownAudioInputs });
    }

    if (command === 'TOGGLE_DCE_MUTE') {
      // Look for common DCE / DEL CRM / Telviva mute buttons in the DOM
      const muteSelectors = [
        'button[data-action="mute"]',
        'button[title*="Mute" i]',
        'button[title*="Unmute" i]',
        'button[aria-label*="Mute" i]',
        'button[aria-label*="Unmute" i]',
        '.btn-mute',
        '.btn-softphone-mute',
        '#btn-mute',
        '#softphone-mute-btn',
        '#btn-agent-mute',
        '.call-control-mute'
      ];

      let clicked = false;
      for (const sel of muteSelectors) {
        const btn = document.querySelector(sel);
        if (btn && typeof btn.click === 'function') {
          btn.click();
          clicked = true;
          // Toggle back after 400ms to simulate re-negotiation cycle
          setTimeout(() => {
            try { btn.click(); } catch(e) {}
          }, 400);
          break;
        }
      }

      dispatchSentinelEvent('DCE_MUTE_TOGGLED', { success: clicked });
    }
  });

  // Announce sentinel ready
  dispatchSentinelEvent('SENTINEL_READY', {
    knownAudioInputs: sentinelState.knownAudioInputs
  });
})();
