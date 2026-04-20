document.getElementById('runBtn').addEventListener('click', () => {
    const masterData = {
      from: "LTT",
      to: "PRYJ",
      date: "30/05/2026",
      class: "Sleeper (SL)",
      quota: "GENERAL",
      trainName: "MAHANAGARI EXP (22177)",
      bookingClass: "AC 2 Tier (2A)"
    };
  
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "DO_AUTOMATION", data: masterData }, (response) => {
            console.log("Extension Response:", response);
          });
      }
    });
  });