const AUTOMATION_SESSION_KEY = "irctcAutomationSession";

const masterData = {
  from: "LTT",
  to: "PRYJ",
  date: "30/05/2026",
  class: "Sleeper (SL)",
  quota: "GENERAL",
  trainName: "MAHANAGARI EXP (22177)",
  bookingClass: "AC 2 Tier (2A)",
  username: "anilpal707",
  password: "Apovey@6472",
  captcha: "",
  passengers: [
    { name: "Vikas Pal", age: "22", gender: "M", berth: "" },
    { name: "Shivshankar Pal", age: "48", gender: "M", berth: "" }
  ]
};

const runBtn = document.getElementById("runBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");

function getSession() {
  return new Promise((resolve) => {
    chrome.storage.local.get([AUTOMATION_SESSION_KEY], (result) => {
      resolve(result[AUTOMATION_SESSION_KEY] || null);
    });
  });
}

function setSession(session) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [AUTOMATION_SESSION_KEY]: session }, resolve);
  });
}

function updatePopup(session) {
  const active = Boolean(session && session.active);
  const stage = session?.lastStage ? ` (${session.lastStage})` : "";

  if (session?.lastResult === "payment_handoff") {
    statusEl.textContent = "Status: Payment Page Reached";
  } else {
    statusEl.textContent = active ? `Status: Armed${stage}` : "Status: Idle";
  }

  runBtn.textContent = active ? "Re-Run Current Stage" : "Arm Automation";
  stopBtn.disabled = !active;
}

async function renderPopup() {
  const session = await getSession();
  updatePopup(session);
}

runBtn.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const activeTab = tabs[0];
    if (!activeTab?.id) {
      return;
    }

    const session = {
      active: true,
      autoResume: true,
      targetTabId: activeTab.id,
      data: masterData,
      startedAt: Date.now(),
      armedAt: Date.now(),
      updatedAt: Date.now(),
      lastStage: null,
      lastUrl: activeTab.url || null,
      lastCompletedSignature: null,
      lastResult: "armed",
      paymentPageReachedAt: null,
      timeToPaymentMs: null
    };

    await setSession(session);
    updatePopup(session);

    chrome.tabs.sendMessage(
      activeTab.id,
      {
        action: "DO_AUTOMATION",
        data: masterData,
        source: "popup",
        force: true
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.debug(
            "Run message could not be delivered immediately:",
            chrome.runtime.lastError.message
          );
        } else {
          console.log("Extension Response:", response);
        }
      }
    );
  });
});

stopBtn.addEventListener("click", async () => {
  const session = await getSession();
  if (!session) {
    updatePopup(null);
    return;
  }

  const stoppedSession = {
    ...session,
    active: false,
    updatedAt: Date.now(),
    lastResult: "stopped"
  };

  await setSession(stoppedSession);
  updatePopup(stoppedSession);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[AUTOMATION_SESSION_KEY]) {
    updatePopup(changes[AUTOMATION_SESSION_KEY].newValue || null);
  }
});

renderPopup();
