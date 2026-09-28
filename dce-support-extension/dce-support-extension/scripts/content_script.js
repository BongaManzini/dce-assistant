(() => {
  if (window.__dceSupportLoaded) return;
  window.__dceSupportLoaded = true;

  const rosterKey = "dce_support_roster";
  const fieldNames = ["classification_l1", "classification_l2", "classification_l3", "classification_l4"];
  const selectors = {
    notes: 'textarea[formcontrolname="note_text"], textarea[formcontrolname="notes"], textarea'
  };

  function valueOf(formControlName) {
    const element = document.querySelector(`[formcontrolname="${formControlName}"]`);
    return element?.value || element?.textContent?.trim() || "--";
  }

  function readTicket() {
    const pageText = document.body?.innerText || "";
    const refMatch = pageText.match(/C-\d{4,}(?:-\d+)?/i);
    const notesElement = document.querySelector(selectors.notes);
    const notes = notesElement?.value || notesElement?.textContent || "";
    const refElement = document.querySelector('.case-id, .ticket-ref, [class*="case-number"]');

    return {
      ticketRef: refElement?.innerText?.trim() || refMatch?.[0] || "--",
      createdDate: valueOf("created_date"),
      caseCreator: valueOf("created_by"),
      caseTitle: valueOf("case_title"),
      province: valueOf("province"),
      labourCentre: valueOf("labour_centre"),
      caseStatus: valueOf("case_status"),
      notes,
      hasRawTokens: /\[(?:Insert Date|DATE|number|LANGUAGE)\]/i.test(notes),
      missingMandatory: ["province", "labour_centre"].filter(name => ["", "--", "Select"].includes(valueOf(name)))
    };
  }

  function setNativeValue(element, value) {
    const prototype = element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function injectNotes(notesText) {
    const notesElement = document.querySelector(selectors.notes);
    if (!notesElement) return false;
    setNativeValue(notesElement, notesText);
    notesElement.focus();
    return true;
  }

  function resetCascade() {
    let count = 0;
    fieldNames.forEach(name => {
      const element = document.querySelector(`[formcontrolname="${name}"]`);
      if (!element) return;
      setNativeValue(element, "");
      count += 1;
    });
    return count;
  }

  function scanCases(caseType) {
    const allRows = Array.from(document.querySelectorAll(
      '[class*="case-row"], [class*="ticket-row"], [class*="history-row"], table tbody tr'
    ));
    const typedRows = caseType
      ? allRows.filter(row => new RegExp(`\\b${caseType.toLowerCase()}\\b`, "i").test(row.innerText))
      : allRows;
    const rows = typedRows.length ? typedRows : allRows;
    const extracted = rows.map((row, index) => {
      const cells = Array.from(row.querySelectorAll("td, [class*='cell']"))
        .map(cell => cell.innerText.trim()).filter(Boolean);
      const text = row.innerText.trim();
      const ref = text.match(/C-\d{4,}(?:-\d+)?/i)?.[0] || cells.find(cell => /^C-/i.test(cell)) || `History row ${index + 1}`;
      return {
        ticketRef: ref,
        caseType: caseType || "ALL",
        createdDate: cells[1] || "--",
        caseCreator: cells[2] || "--",
        caseTitle: cells[3] || text.slice(0, 90) || "--",
        province: cells[4] || "--",
        labourCentre: cells[5] || "--",
        notes: "History row available in CRM"
      };
    });
    const current = readTicket();
    if (!extracted.length) extracted.push(current);
    return extracted.slice(0, 3);
  }

  function applySupportOverride(override) {
    const terms = override.toLowerCase().split(/\s+-\s+|\s+/).filter(term => term.length > 2);
    let fieldsUpdated = 0;
    fieldNames.some(name => {
      const element = document.querySelector(`[formcontrolname="${name}"]`);
      if (!element || element.tagName !== "SELECT") return false;
      const option = Array.from(element.options).find(candidate => {
        const text = candidate.textContent.toLowerCase();
        return terms.some(term => text.includes(term));
      });
      if (!option) return false;
      setNativeValue(element, option.value);
      fieldsUpdated += 1;
      return true;
    });
    return fieldsUpdated;
  }

  function publishRoster(data) {
    chrome.runtime.sendMessage({ action: "STORE_AGENT_HEARTBEAT", agent: data });
  }

  window.addEventListener("DCE_AGENT_HEARTBEAT_BROADCAST", event => {
    let data = event.detail;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch (error) { return; }
    }
    if (data?.agentId) publishRoster(data);
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "PING") {
      sendResponse({ status: "PONG" });
      return true;
    }
    if (message.action === "INSPECT_TICKET") {
      sendResponse({ status: "INSPECTED", ticket: readTicket() });
      return true;
    }
    if (message.action === "SCAN_LAST_THREE_CASES") {
      sendResponse({ status: "SCANNED", cases: scanCases(message.caseType) });
      return true;
    }
    if (message.action === "APPLY_SUPPORT_OVERRIDE") {
      const fieldsUpdated = applySupportOverride(message.override || "");
      sendResponse({ status: fieldsUpdated ? "OVERRIDE_APPLIED" : "OVERRIDE_NOT_FOUND", fieldsUpdated });
      return true;
    }
    if (message.action === "INJECT_ESCALATION_MEMO") {
      sendResponse({ status: injectNotes(message.notesText) ? "INJECTED" : "NOTES_FIELD_NOT_FOUND" });
      return true;
    }
    if (message.action === "RESET_CLASSIFICATION_CASCADE") {
      sendResponse({ status: "CASCADE_RESET", fieldsReset: resetCascade() });
      return true;
    }
    return true;
  });
})();
