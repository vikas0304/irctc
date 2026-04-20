document.getElementById('runBtn').addEventListener('click', () => {
  const masterData = {
    user: "anilpal707",
    pass: "Apovey@6472",
    from: "LTT",
    to: "PRYJ",
    date: "30-05-2026",
    passengers: [
      { name: "Vikas Pal", age: "22", gender: "M" },
      { name: "Shivshankar Pal", age: "48", gender: "M" }
    ]
  };

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "DO_AUTOMATION", data: masterData });
  });
});