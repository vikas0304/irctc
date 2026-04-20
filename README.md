# IRCTC Intern Master Automation

An advanced Chrome Extension using native hardware telemetry (Chrome DevTools Protocol - CDP) paired with a local Python AI backend to autonomously book IRCTC train tickets. It safely traverses advanced anti-bot (Akamai WAF) mechanisms by spoofing raw operating system input curves.

## 🚀 Features

- **Hardware-Level Inputs:** Uses `Input.dispatchMouseEvent` and `Input.dispatchKeyEvent` through the Debugger API. The browser detects these purely as `isTrusted = true` human interactions.
- **Dynamic Train Search Targeting:** Formats passenger configurations, train selection, quotas, and class lists.
- **Persistent Anti-Bot Measures:** Injects minute, randomized delays and hardware mouse polling.
- **Smart Login Modal Automation:** Detects UI bindings and executes seamless credentials loading without triggering shadow-ban locks.
- **Dynamic Passenger Builder:** Handles concurrent `Add Passenger` logic with automatic verification algorithms.
- **Local CAPTCHA AI Engine:** Rips raw `Base64` blobs instantly from memory and bounces them securely off your local `pytesseract` solver over a Flask protocol.
- **Auto-Retrying CAPTCHA Intercepts:** Identifies common heuristic IRCTC noise artifacts (`~`, `@`, etc.), purges them via `re`, and seamlessly cycles the `Refresh Captcha` button if the backend kicks it out.
- **Surgical Checkout Execution:** Bypasses lagging Chrome IPC closure blocks natively utilizing robust, synchronous gateway forwarding.

---

## 🛠️ Tech Stack & Requirements

### Browser Space
- **Google Chrome** (latest)
- **Manifest V3** Native Environment 

### Local OS Space (OCR Engine)
- **Python** (version `3.8` or newer) 
- **Tesseract OCR Application** (Hardware Engine)

---

## 🖥️ Setup & Installation Instructions

### 1. Configure the Python AI Engine

To automate Phase 5 (the Review Captcha Validation), you must deploy the local API.

1. **Install Tesseract-OCR Application to your OS:**
   - **Windows:** Download from the [UB-Mannheim Tesseract Wiki](https://github.com/UB-Mannheim/tesseract/wiki) and install to the default directory (`C:\Program Files\Tesseract-OCR\tesseract.exe`).
   - **Linux / Mac:** Ensure you install it via standard package managers (`sudo apt install tesseract-ocr` or `brew install tesseract`).
2. **Install Python Libraries:** 
   Open your project terminal and install the OCR and Web-Server requirements.
   ```bash
   pip install flask flask-cors pytesseract pillow
   ```
3. **Launch the Engine:**
   Run the processing server locally. Leave this terminal open during automation!
   ```bash
   python ocr_server.py
   ```
   *(It will broadcast seamlessly on `http://localhost:5000`)*

### 2. Install the Chrome Extension

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Ensure **Developer mode** toggle in the top-right corner is flipped to **ON**.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the folder containing these project files (where `manifest.json` lives).
5. Ensure the extension is enabled and pinned securely to your browser bar!

---

## 🚦 How to Use

1. Launch Chrome and head to the [IRCTC Website](https://www.irctc.co.in/).
2. Setup your desired automation credentials physically in `popup.js` (Class, Username, Password, Pax Arrays).
3. Click the **Extension Icon** and click **Run Automation**. 
4. **Relax.** The script takes over native control. 
   - *Note:* Do NOT frantically move your physical mouse or hit keys during critical CDP interactions or you will interrupt the viewport calculations!

### Automation Stages
- **Homepage:** Automatically loads Journey specifics.
- **Train List (`/train-list`):** Identifies chosen Train and interacts with Confirmation Dialogs ("Agree").
- **Passenger Input (`/psgninput`):** Cycles the arrays, loads PAX details, and shifts to BHIM/UPI configuration.
- **Review Booking (`/reviewBooking`):** Scrapes the CAPTCHA Base64 into Python, translates, types, and loops on failures automatically. 
- **Payment Options (`/bkgPaymentOptions`):** Detects gateway, syncs "Pay & Book", and hands operations strictly back to the user.
