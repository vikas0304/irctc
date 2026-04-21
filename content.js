const wait = (ms) => new Promise(res => setTimeout(res, ms));
const AUTOMATION_SESSION_KEY = "irctcAutomationSession";
const automationRuntime = {
    running: false,
    pendingResume: false,
    resumeTimer: null,
    lastKnownUrl: window.location.href,
    lastAttemptSignature: null,
    lastAttemptAt: 0
};

// Randomizer function for human-like delays
const randomWait = (min, max) => wait(Math.floor(Math.random() * (max - min + 1)) + min);

function getAutomationStage(url = window.location.href) {
    const lowerUrl = url.toLowerCase();

    if (lowerUrl.includes("train-list")) return "train-list";
    if (lowerUrl.includes("psgninput")) return "psgninput";
    if (lowerUrl.includes("reviewbooking")) return "reviewbooking";
    if (lowerUrl.includes("bkgpaymentoptions") || lowerUrl.includes("paymentoptions")) return "bkgpaymentoptions";

    return "nget/train-search";
}

function getRunSignature(url = window.location.href) {
    return `${getAutomationStage(url)}|${new URL(url).pathname.toLowerCase()}`;
}

function getAutomationSession() {
    return new Promise((resolve) => {
        chrome.storage.local.get([AUTOMATION_SESSION_KEY], (result) => {
            resolve(result[AUTOMATION_SESSION_KEY] || null);
        });
    });
}

function setAutomationSession(session) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [AUTOMATION_SESSION_KEY]: session }, resolve);
    });
}

async function updateAutomationSession(updates) {
    const session = await getAutomationSession();
    if (!session) return null;

    const nextSession = {
        ...session,
        ...updates,
        updatedAt: Date.now()
    };

    await setAutomationSession(nextSession);
    return nextSession;
}

async function safeUpdateAutomationSession(updates) {
    try {
        return await updateAutomationSession(updates);
    } catch (error) {
        console.debug("Session update skipped:", error);
        return null;
    }
}

async function deactivateAutomationSession(reason) {
    try {
        const session = await getAutomationSession();
        if (!session) return;

        await setAutomationSession({
            ...session,
            active: false,
            updatedAt: Date.now(),
            lastResult: reason
        });
    } catch (error) {
        console.debug("Session deactivation skipped:", error);
    }
}

async function recordPaymentPageReached() {
    try {
        const session = await getAutomationSession();
        if (!session?.startedAt || session.paymentPageReachedAt) {
            return null;
        }

        const reachedAt = Date.now();
        const elapsedMs = Math.max(0, reachedAt - session.startedAt);

        await setAutomationSession({
            ...session,
            paymentPageReachedAt: reachedAt,
            timeToPaymentMs: elapsedMs,
            updatedAt: reachedAt
        });

        const totalSeconds = Math.floor(elapsedMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const durationLabel = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

        console.log(`[Automation] Time to payment: ${durationLabel}`);
        return elapsedMs;
    } catch (error) {
        console.debug("Payment timing update skipped:", error);
        return null;
    }
}

function getCurrentTabId() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "GET_TAB_ID" }, (response) => {
            resolve(response?.tabId ?? null);
        });
    });
}

function scheduleAutoResume(reason, delay = 600) {
    if (automationRuntime.resumeTimer) {
        clearTimeout(automationRuntime.resumeTimer);
    }

    automationRuntime.resumeTimer = setTimeout(() => {
        automationRuntime.resumeTimer = null;
        maybeResumeAutomation(reason);
    }, delay);
}

function watchForRouteChanges() {
    if (window.__irctcAutomationRouteWatchInstalled) {
        return false;
    }
    window.__irctcAutomationRouteWatchInstalled = true;

    const notifyRouteChange = () => {
        if (automationRuntime.lastKnownUrl !== window.location.href) {
            automationRuntime.lastKnownUrl = window.location.href;
            scheduleAutoResume("route-change", 800);
        }
    };

    const wrapHistoryMethod = (methodName) => {
        const originalMethod = history[methodName];
        history[methodName] = function (...args) {
            const result = originalMethod.apply(this, args);
            notifyRouteChange();
            return result;
        };
    };

    wrapHistoryMethod("pushState");
    wrapHistoryMethod("replaceState");

    window.addEventListener("popstate", notifyRouteChange);
    window.addEventListener("hashchange", notifyRouteChange);

    setInterval(notifyRouteChange, 1000);
}

async function maybeResumeAutomation(reason) {
    if (automationRuntime.running) {
        automationRuntime.pendingResume = true;
        return false;
    }

    const [session, tabId] = await Promise.all([
        getAutomationSession(),
        getCurrentTabId()
    ]);

    if (!session?.active || !session?.data || session.autoResume === false) {
        return false;
    }

    if (session.targetTabId && tabId && session.targetTabId !== tabId) {
        return;
    }

    const signature = getRunSignature();
    const lastAttemptIsFresh =
        automationRuntime.lastAttemptSignature === signature &&
        (Date.now() - automationRuntime.lastAttemptAt) < 4000;

    if (lastAttemptIsFresh || session.lastCompletedSignature === signature) {
        return;
    }

    try {
        await startAutomationRun(session.data, {
            trigger: `auto:${reason}`
        });
    } catch (error) {
        console.debug("Auto resume failed:", error);
    }
}

async function attachDebugger() {
    return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: "ATTACH" }, (response) => {
            if (!response || response.status !== "Success") {
                console.error("❌ Failed to attach debugger");
                resolve(false);
            } else {
                resolve(true);
            }
        });
    });
}

async function detachDebugger() {
    return new Promise(resolve => {
        try {
            chrome.runtime.sendMessage({ action: "DETACH" }, resolve);
        } catch (e) {
            // Context might be invalidated if page is navigating. This is fine.
            resolve();
        }
    });
}

async function humanChaos() {
    console.log("🌪️ Injecting human mouse chaos...");
    const jitterCount = Math.floor(Math.random() * 3) + 2; // 2 to 4 moves
    for (let i = 0; i < jitterCount; i++) {
        const randX = Math.floor(Math.random() * 700) + 100;
        const randY = Math.floor(Math.random() * 500) + 100;
        await new Promise(r => chrome.runtime.sendMessage({ action: "NATIVE_MOVE", x: randX, y: randY }, r));
        await randomWait(50, 150);
    }
}

async function nativeClick(element) {
    if (!element) return false;
    const rectBeforeScroll = element.getBoundingClientRect();
    const needsScroll =
        rectBeforeScroll.top < 80 ||
        rectBeforeScroll.bottom > (window.innerHeight - 80) ||
        rectBeforeScroll.left < 0 ||
        rectBeforeScroll.right > window.innerWidth;

    element.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
    await randomWait(needsScroll ? 140 : 40, needsScroll ? 240 : 90);
    
    const rect = element.getBoundingClientRect();
    // Smaller random offset to avoid missing the bounding box
    const randomOffsetX = Math.floor(Math.random() * 6) - 3; 
    const randomOffsetY = Math.floor(Math.random() * 4) - 2;  
    
    const targetX = Math.round(rect.left + (rect.width / 2)) + randomOffsetX;
    const targetY = Math.round(rect.top + (rect.height / 2)) + randomOffsetY;

    console.log(`🎯 Sending native click to X:${targetX}, Y:${targetY}`);

    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            action: "NATIVE_CLICK", 
            x: targetX, 
            y: targetY
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("❌ Native click failed with lastError:", chrome.runtime.lastError.message);
                resolve(false);
            } else if (response && response.status === "Success") {
                resolve(true);
            } else {
                console.error("❌ Native click failed. Response:", response ? JSON.stringify(response) : "undefined");
                resolve(false);
            }
        });
    });
}

async function typeNative(element, text, fieldName) {
    if (!element) return;
    console.log(`⌨️ Native Typing ${fieldName}: ${text}`);
    
    // Use native click to focus the element
    await nativeClick(element);
    
    // Clear the element programmatically just in case
    element.value = "";
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await randomWait(70, 130);
    
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            action: "NATIVE_TYPE", 
            text: text
        }, (response) => {
            resolve();
        });
    });
}

async function selectFirstAutocompleteItem(fieldName) {
    console.log(`⏳ Waiting for autocomplete dropdown for ${fieldName}...`);
    let attempts = 0;
    let firstLi = null;
    while(attempts < 20) {
        await wait(150);
        const panels = document.querySelectorAll('.ui-autocomplete-panel, .ng-trigger-overlayAnimation'); // Adding fallback class for newer primeNG
        for (const panel of panels) {
            const style = window.getComputedStyle(panel);
            if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                const li = panel.querySelector('li[role="option"], li.ui-autocomplete-list-item');
                if (li) {
                    firstLi = li;
                    break;
                }
            }
        }
        if (firstLi) break;
        attempts++;
    }

    if (firstLi) {
        await nativeClick(firstLi);
        console.log(`✅ Selected first autocomplete item for ${fieldName}`);
        await randomWait(100, 200);
    } else {
        console.log(`❌ Autocomplete list not found for ${fieldName}`);
    }
}

async function selectDropdown(containerId, searchText) {
    console.log(`📂 Attempting to open dropdown: ${containerId}`);
    const pDropdown = document.querySelector(containerId);
    if (!pDropdown) return false;

    const triggerBox = pDropdown.querySelector('.ui-dropdown-trigger') || pDropdown.querySelector('.ui-dropdown');
    if (!triggerBox) return false;

    await nativeClick(triggerBox);

    let options = [];
    let attempts = 0;
    while (attempts < 20) {
        await wait(150); 
        const openPanels = document.querySelectorAll('.ui-dropdown-panel');
        for (const panel of openPanels) {
            const style = window.getComputedStyle(panel);
            if (style.display !== 'none' && style.opacity !== '0') {
                options = panel.querySelectorAll('li[role="option"]');
                if (options.length > 0) break;
            }
        }
        if (options.length > 0) break; 
        attempts++;
    }

    if (options.length === 0) return false;

    for (const opt of options) {
        const text = opt.textContent.trim();
        const ariaLabel = opt.getAttribute('aria-label');

        if ((text && text.includes(searchText)) || (ariaLabel && ariaLabel.includes(searchText))) {
            console.log(`🖱️ Clicking matching item: ${searchText}`);
            await nativeClick(opt);
            console.log(`✅ Success! Selected ${searchText}`);
            await randomWait(100, 250);
            return true;
        }
    }
    return false;
}

async function pressKeyNative(key, code, keyCode) {
    console.log(`⌨️ Native Key Press: ${key}`);
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({
            action: "NATIVE_KEY", 
            key: key,
            code: code,
            keyCode: keyCode
        }, (response) => {
            resolve();
        });
    });
}
async function selectDate(dateStr) {
    console.log(`📅 Typing Date directly: ${dateStr}`);
    
    const calendarDataInp = document.querySelector("#jDate input, p-calendar[formcontrolname='journeyDate'] input");
    if (!calendarDataInp) {
        console.error("❌ Could not find calendar input");
        return false;
    }

    // Use string type method directly
    await typeNative(calendarDataInp, dateStr, "Date");
    
    // Press Escape to elegantly close the popup so it doesnt block UI
    await pressKeyNative("Escape", "Escape", 27);
    await randomWait(100, 200);
    return true;
}

// ----------------------------------------------------
// HOMEPAGE SEARCH LOGIC
// ----------------------------------------------------
async function searchTrains(d) {
    // 1. From Station
    const fromInp = document.querySelector('p-autocomplete[formcontrolname="origin"] input');
    await typeNative(fromInp, d.from, "From Station");
    await selectFirstAutocompleteItem("From Station");
    await randomWait(100, 200); // Breathe

    // 2. To Station
    const toInp = document.querySelector('p-autocomplete[formcontrolname="destination"] input');
    await typeNative(toInp, d.to, "To Station");
    await selectFirstAutocompleteItem("To Station");
    await randomWait(100, 200); // Breathe

    // 3. Date
    await selectDate(d.date);
    await randomWait(100, 200); // Breathe

    // 4. Class
    await selectDropdown('#journeyClass', d.class);

    // 5. Quota
    await selectDropdown('#journeyQuota', d.quota);

    // 6. CDP Native Search Click
    console.log("🚂 Routing command through Chrome Debugger API...");
    document.body.click(); // tiny programmatic blur
    console.log("⏳ Letting WAF settle and Angular validate...");
    await randomWait(250, 450); 

    let searchTriggered = false;
    const searchBtn = document.querySelector("button.search_btn.train_Search");
    if (searchBtn) {
        await nativeClick(searchBtn);
        searchTriggered = true;
        console.log("✅ Search sequence executed by native API!");
    } else {
        console.error("❌ Could not find the Search Trains button.");
    }
    return searchTriggered;
}

// ----------------------------------------------------
// TRAIN LIST SELECTION & BOOKING LOGIC
// ----------------------------------------------------
async function selectTrainAndBook(d) {
    console.log(`🚂 Looking for train: ${d.trainName}`);
    
    // 1. Find Train Card
    let trainCard = null;
    for(let i=0; i<40; i++) {
        await wait(250);
        const cards = Array.from(document.querySelectorAll('app-train-avl-enq'));
        trainCard = cards.find(c => c.textContent.includes(d.trainName));
        if (trainCard) break;
    }

    if (!trainCard) {
        console.error("❌ Could not find train card for", d.trainName);
        return false;
    }

    console.log(`✅ Found Train Card! Look for class: ${d.bookingClass}`);
    await randomWait(50, 150);
    
    // 2. Click Refresh Button (div.pre-avl matching class)
    const preAvls = Array.from(trainCard.querySelectorAll('div.pre-avl'));
    const targetPreAvl = preAvls.find(el => el.textContent.includes(d.bookingClass));
    
    if (targetPreAvl) {
        await nativeClick(targetPreAvl);
        console.log(`✅ Clicked Class Refresh!`);
    } else {
        console.error("❌ Could not find class block for", d.bookingClass);
        return false;
    }

    // 3. Wait for AVl grid and click Date Cell
    console.log(`⏳ Waiting for Availability Grid...`);
    let dateClicked = false;
    let bookingTriggered = false;
    for(let i=0; i<60; i++) {
        await wait(200);
        // Look inside trainCard for availability grid cells
        const blocks = Array.from(trainCard.querySelectorAll('div.pre-avl'));
        
        // Find first pre-avl block that contains AVAILABLE, RAC, or WL and is not the class block
        const dateTarget = blocks.find(el => 
            el !== targetPreAvl && 
            (el.querySelector('div.AVAILABLE, div.RAC, div.WL') !== null || 
             el.textContent.includes("AVAILABLE") || 
             el.textContent.includes("RAC") || 
             el.textContent.includes("WL"))
        );

        if (dateTarget) {
            await nativeClick(dateTarget);
            dateClicked = true;
            console.log(`✅ Clicked Date Cell!`);
            break;
        }
    }

    // 4. Click 'Book Now' Button
    if (dateClicked) {
        console.log(`⏳ Waiting for Book Now button...`);
        for (let i=0; i<40; i++) {
            await wait(250);
            // Re-query buttons to ensure they're fresh
            const buttons = Array.from(trainCard.querySelectorAll('button.train_Search'));
            const bookBtn = buttons.find(b => b.textContent.includes("Book Now"));
            if (bookBtn) {
                await nativeClick(bookBtn);
                bookingTriggered = true;
                console.log(`✅ Clicked Book Now Button!`);
                
                // Wait for potential confirmation modal ("Yes" / "I Agree")
                console.log(`⏳ Checking for Confirmation Modal...`);
                for (let j = 0; j < 15; j++) {
                    await wait(250);
                    const spans = Array.from(document.querySelectorAll('span.ui-button-text'));
                    const targetSpan = spans.find(span => span.textContent.trim() === "Yes" || span.textContent.trim() === "I Agree");
                    
                    if (targetSpan) {
                        const targetBtn = targetSpan.closest('button');
                        if (targetBtn) {
                            await nativeClick(targetBtn);
                            console.log(`✅ Cleared Confirmation Dialog!`);
                        }
                        break;
                    }
                }
                
                // Phase 2: Login Modal handling
                console.log(`⏳ Checking for Login Modal...`);
                for (let k = 0; k < 12; k++) {
                    await wait(250);
                    const userInp = document.querySelector("input[formcontrolname='userid']");
                    const passInp = document.querySelector("input[formcontrolname='password']");
                    const errorMsg = document.querySelector(".ui-messages-error");
                    
                    if (errorMsg && errorMsg.offsetParent !== null) {
                        console.error("❌ IRCTC Error detected, aborting login loop.");
                        break;
                    }
                    
                    if (userInp && passInp && userInp.offsetParent !== null) {
                        console.log(`✅ Login Modal Detected!`);
                        await randomWait(100, 250); // Human pause

                        // Smart fill: Check if username is already present
                        if (userInp.value && userInp.value.trim() !== '') {
                            console.log(`✅ Username field already contains data (${userInp.value}). Skipping ID typing...`);
                        } else {
                            console.log(`✍️ Username field is empty. Natively typing username...`);
                            await typeNative(userInp, d.username, "Username");
                            await randomWait(50, 150);
                        }
                        
                        // Smart fill: Check if password is already present
                        if (passInp.value && passInp.value.trim() !== '') {
                            console.log(`✅ Password field already contains data. Skipping PASS typing...`);
                        } else {
                            console.log(`✍️ Password field is empty. Natively typing password...`);
                            await typeNative(passInp, d.password, "Password");
                            await randomWait(50, 150);
                        }
                        
                        const buttons = Array.from(document.querySelectorAll("button.search_btn.train_Search"));
                        const signInBtn = buttons.find(b => b.textContent.includes("SIGN IN"));
                        if (signInBtn) {
                            console.log(`✅ Found SIGN IN button. Firing native click!`);
                            await nativeClick(signInBtn);
                            console.log(`✨ SIGN IN action complete!`);
                        } else {
                            console.error(`❌ Could not locate the SIGN IN button!`);
                        }
                        break;
                    }
                }
                
                break;
            }
        }
    }
    return bookingTriggered;
}

// ----------------------------------------------------
// PASSENGER ENTRY LOGIC (PHASE 3)
// ----------------------------------------------------
async function fillPassengerDetails(d) {
    if (!d.passengers || !d.passengers.length) {
        console.error("❌ No passenger data provided.");
        return;
    }
    
    console.log(`🚂 Starting Passenger Detail Filling...`);
    
    for (let idx = 0; idx < d.passengers.length; idx++) {
        const pax = d.passengers[idx];
        
        // Wait for age input to appear indicating the block is rendered
        let paxBlockFound = false;
        for (let i = 0; i < 30; i++) {
            await wait(200);
            const ageInputs = document.querySelectorAll("input[formcontrolname='passengerAge']");
            if (ageInputs.length > idx) {
                paxBlockFound = true;
                break;
            }
        }
        
        if (!paxBlockFound) {
             console.error(`❌ Could not find passenger form block for ${pax.name}`);
             break;
        }

        console.log(`✍️ Inputting details for: ${pax.name}`);
        
        const nameInp = document.querySelectorAll("p-autocomplete[formcontrolname='passengerName'] input")[idx];
        const ageInp = document.querySelectorAll("input[formcontrolname='passengerAge']")[idx];
        const genSelect = document.querySelectorAll("select[formcontrolname='passengerGender']")[idx];
        const berthSelect = document.querySelectorAll("select[formcontrolname='passengerBerthChoice']")[idx];
        
        // Wait just slightly for Angular view to stabilize fully
        await randomWait(100, 200);
        
        if (nameInp) {
            await typeNative(nameInp, pax.name, "Passenger Name");
            await randomWait(50, 150);
            await pressKeyNative("Escape", "Escape", 27); // Close autocomplete box just in case
            await randomWait(50, 150);
        }
        
        if (ageInp) {
            await typeNative(ageInp, String(pax.age), "Passenger Age");
            await randomWait(50, 150);
        }
        
        // Gender is a <select>. Natively, setting value + dispatching "change" works in Angular generally.
        if (genSelect) {
            genSelect.value = pax.gender;
            genSelect.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`✅ Selected Gender: ${pax.gender}`);
        }
        await randomWait(120, 220);
        
        // Berth Choice
        if (pax.berth && berthSelect) {
            berthSelect.value = pax.berth;
            berthSelect.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`✅ Selected Berth: ${pax.berth}`);
        }
        
        // Add new passenger block if there are more
        if (idx < d.passengers.length - 1) {
            console.log(`➕ Adding new passenger block...`);
            const addSpans = Array.from(document.querySelectorAll("span.prenext"));
            const addBtn = addSpans.find(s => s.textContent.includes("+ Add Passenger"));
            if (addBtn) {
                await nativeClick(addBtn);
                await randomWait(450, 900);
            }
        }
    }
    
    console.log(`✅✅ Passenger fill complete!`);
    await humanChaos();
    
    // ----------------------------------------------------
    // PAYMENT OPTIONS & SUBMIT (PHASE 4)
    // ----------------------------------------------------
    console.log(`⏳ Searching for BHIM/UPI Payment Option...`);
    let paymentSelected = false;
    for (let i = 0; i < 15; i++) {
        await wait(600);
        // Locate label with the exact text
        const labels = Array.from(document.querySelectorAll('label'));
        const upiLabel = labels.find(l => l.textContent.includes("Pay through BHIM/UPI"));
        
        if (upiLabel) {
            console.log(`✅ Found BHIM/UPI Label object!`);
            
            // Check if it's already checked (PrimeNG ui-state-active)
            const radioBox = upiLabel.querySelector('.ui-radiobutton-box');
            if (radioBox && radioBox.classList.contains('ui-state-active')) {
                console.log(`✅ BHIM/UPI is already selected by default! Leaving it alone.`);
                paymentSelected = true;
                break;
            } else {
                console.log(`🎯 BHIM/UPI is NOT selected. Sending native click...`);
                // Send click directly to the visual radio box if it exists, else label
                const targetClick = radioBox || upiLabel;
                await nativeClick(targetClick);
                
                // Let Angular process the change visually
                await randomWait(300, 500); 
                
                // Verify the click stuck
                if (radioBox && radioBox.classList.contains('ui-state-active')) {
                    console.log(`✅ Successfully selected BHIM/UPI Payment!`);
                } else {
                    console.warn(`⚠️ Click sent to BHIM/UPI, but state change not verified. It may still be processed.`);
                }
                paymentSelected = true;
                break;
            }
        }
    }
    
    let continueTriggered = false;

    if (paymentSelected) {
        console.log(`⏳ Searching for Continue button...`);
        for (let i = 0; i < 20; i++) {
            await wait(600);
            const buttons = Array.from(document.querySelectorAll('button.btnDefault'));
            const continueBtn = buttons.find(b => b.textContent && b.textContent.trim() === "Continue");
            
            if (continueBtn) {
                // Extra Jittering / Panic as requested
                await humanChaos();
                console.log(`👀 Trembling with panic... clicking Continue!`);
                await randomWait(500, 1000);
                
                await nativeClick(continueBtn); 
                continueTriggered = true;
                console.log(`✨✨ CHECKOUT ACTION COMPLETE ✨✨`);
                break;
            }
        }
    }
    return continueTriggered;
}

// ----------------------------------------------------
// OCR CAPTCHA & FINAL REVIEW LOGIC (PHASE 5)
// ----------------------------------------------------
async function processReviewAndCaptcha() {
    console.log(`🚂 Attempting CAPTCHA OCR sequence...`);
    
    let lastCaptchaSrc = null;

    for (let retry = 1; retry <= 5; retry++) {
        if (retry > 1) {
            console.log(`🔄 CAPTCHA Retry Attempt #${retry}...`);
            await randomWait(300, 600); // FASTER wait
        }

        let base64Image = null;
        let captchaInput = null;

        // 1. Hunt down the Base64 CAPTCHA Blob from the DOM
        for (let i = 0; i < 15; i++) {
            await wait(250); // Aggressively poll at 4x speed
            
            if (window.location.href.toLowerCase().includes("bkgpaymentoptions")) return true;

            captchaInput = document.querySelector("input[formcontrolname='captcha'], input#captcha");
            const possibleImgs = Array.from(document.querySelectorAll("img"));
            const captchaImgEl = possibleImgs.find(img => img.src && img.src.includes('base64'));
            
            if (captchaImgEl && captchaInput) {
                 // On retries, we expect a NEW image. If it stays the same, it hasn't refreshed yet.
                 if (captchaImgEl.src !== lastCaptchaSrc) {
                     base64Image = captchaImgEl.src;
                     lastCaptchaSrc = base64Image;
                     break;
                 } else if (i === 5 && retry > 1) {
                     // If we've waited 5 seconds on a retry and image hasn't changed, 
                     // IRCTC might be stuck. Force a refresh click.
                     console.log("🔄 CAPTCHA stuck. Firing manual refresh...");
                     const refreshBtn = document.querySelector("a[aria-label='Refresh Captcha'], .glyphicon-repeat");
                     if (refreshBtn) await nativeClick(refreshBtn);
                 }
            }
        }
        
        if (!base64Image || !captchaInput) {
            console.warn(`⚠️ Could not locate a New CAPTCHA image. Page might be hanging or transitioned.`);
            if (window.location.href.toLowerCase().includes("bkgpaymentoptions")) return true;
            continue; 
        }
        
        console.log(`✅ Extracted CAPTCHA Blob! Bouncing it to Python AI Server...`);
        
        // 2. Request OCR Resolution Locally
        let solvedText = "";
        try {
            const response = await fetch("http://localhost:5000/solve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image: base64Image })
            });
            
            if (response.ok) {
                const json = await response.json();
                solvedText = json.solved_text;
                console.log(`🧠 Local AI solved CAPTCHA: [${solvedText}]`);
            } else {
                console.error(`❌ Local API returned an error.`);
                return false; 
            }
        } catch (e) {
            console.error(`❌ Connection to Local Python Server failed!`, e);
            return false;
        }
        
        // 3. Punch in the solution 
        if (solvedText && solvedText !== "UNKNOWN") {
            // Clear input first
            captchaInput.value = "";
            captchaInput.dispatchEvent(new Event('input', { bubbles: true }));

            await typeNative(captchaInput, solvedText, "Captcha");
            await randomWait(800, 1500); 
            
            // 4. Click the "Continue" button
            const buttons = Array.from(document.querySelectorAll('button.btnDefault'));
            const continueBtn = buttons.find(b => b.textContent && b.textContent.trim() === "Continue");
            
            if (continueBtn) {
                console.log(`🎯 Clicking Continue...`);
                await randomWait(100, 250); // Faster checkout click
                await nativeClick(continueBtn);
                
                console.log(`⏳ Monitoring rapid validation...`);
                
                // Aggressive fast-polling for 3 seconds max
                let errorFound = false;
                for (let j = 0; j < 15; j++) {
                    await wait(200); 

                    const lowerUrl = window.location.href.toLowerCase();
                    if (lowerUrl.includes("paymentoptions") || lowerUrl.includes("bkgpaymentoptions")) {
                        console.log(`✨✨ CAPTCHA ACCEPTED! ✨✨`);
                        return true;
                    }
                    
                    const errorSpan = document.querySelector(".error, .ui-messages-error-detail");
                    if (errorSpan && errorSpan.textContent && errorSpan.textContent.trim() !== '') {
                        console.log(`❗ IRCTC Error Triggered: ${errorSpan.textContent}`);
                        errorFound = true;
                        break; // Fail fast so the loop restarts immediately!
                    }
                }
                
                if (!errorFound) {
                    const lowerUrl = window.location.href.toLowerCase();
                    if (lowerUrl.includes("paymentoptions") || lowerUrl.includes("bkgpaymentoptions")) return true;
                }
                console.warn(`⚠️ Validation failed or timed out. Re-engaging captcha extraction...`);
            }
        } else {
            console.log(`⚠️ OCR returned empty/UNKNOWN. Retrying...`);
            // Force a captcha refresh if possible, or just wait for the loop to catch a change
            const refreshBtn = document.querySelector("a[aria-label='Refresh Captcha'], .glyphicon-repeat");
            if (refreshBtn) {
                await nativeClick(refreshBtn);
                await wait(2000);
            }
        }
    }
    
    console.error(`❌ Max CAPTCHA retries reached. Manual intervention required.`);
    return false;
}

async function processPaymentOptions(d) {
    console.log(`🚂 Reached Payment Options page. Finalizing order...`);
    
    for (let i = 0; i < 20; i++) {
        await wait(600);
        
        // Broaden search: look for ANY button that mentions "Pay & Book"
        const allButtons = Array.from(document.querySelectorAll('button'));
        const payBtn = allButtons.find(b => b.textContent && b.textContent.includes("Pay & Book") && b.offsetParent !== null);
        
        if (payBtn) {
            console.log(`🎯 Found 'Pay & Book' button (Visible). Firing final click!`);
            
            // Check if disabled
            if (payBtn.disabled || payBtn.getAttribute('aria-disabled') === 'true') {
                console.log(`⚠️ Button is found but currently disabled. Waiting...`);
                continue;
            }

            await randomWait(1500, 2500); // Human pause before payment
            
            // Because Chrome's Service Worker IPC may close its ports intermittently during 
            // the gateway redirect, we enforce a hard DOM click to guarantee success!
            try {
                payBtn.click();
            } catch (e) {
                console.error("DOM Click Failed", e);
            }
            
            // We also fire the native hardware click as backup insurance
            await nativeClick(payBtn);
            
            console.log(`🚀🚀 REDIRECTING TO PAYMENT GATEWAY! MISSION COMPLETE! 🚀🚀`);
            
            // Small extra check
            await wait(2000);
            if (window.location.href.includes("irctcipay.com")) {
                 console.log("✅ Verified: Landing on iPay gateway.");
            }
            return true;
        } else {
            const visibleButtons = allButtons.filter(b => b.offsetParent !== null).map(b => b.textContent?.trim());
            console.log(`⏳ Still looking for 'Pay & Book' button...`);
        }
    }
    return false;
}

async function startAutomationRun(data, options = {}) {
    const trigger = options.trigger || "manual";
    const force = Boolean(options.force);
    const runSignature = getRunSignature();
    const currentStage = getAutomationStage();
    const repeatedAttempt =
        automationRuntime.lastAttemptSignature === runSignature &&
        (Date.now() - automationRuntime.lastAttemptAt) < 4000;

    if (automationRuntime.running || (!force && repeatedAttempt)) {
        return false;
    }

    automationRuntime.running = true;
    automationRuntime.pendingResume = false;
    automationRuntime.lastAttemptSignature = runSignature;
    automationRuntime.lastAttemptAt = Date.now();

    console.log("ðŸš€ --- STARTING AUTOMATION (HUMAN MODE) ---");

    try {
        const attached = await attachDebugger();
        if (!attached) throw new Error("Could not attach debugger");

        let stageResult = false;
        const currentUrl = window.location.href.toLowerCase();

        const onPaymentPage =
            currentUrl.includes("bkgpaymentoptions") ||
            currentUrl.includes("paymentoptions");

        if (currentUrl.includes("train-list")) {
            stageResult = await selectTrainAndBook(data);
        } else if (currentUrl.includes("psgninput")) {
            stageResult = await fillPassengerDetails(data);
        } else if (currentUrl.includes("reviewbooking")) {
            stageResult = await processReviewAndCaptcha();
        } else if (onPaymentPage) {
            await recordPaymentPageReached();
            stageResult = await processPaymentOptions(data);
        } else {
            stageResult = await searchTrains(data);
        }

        if (stageResult) {
            await safeUpdateAutomationSession({
                lastStage: currentStage,
                lastUrl: window.location.href,
                lastResult: "success",
                lastTrigger: trigger,
                lastCompletedSignature: runSignature
            });

            if (currentStage === "bkgpaymentoptions") {
                await deactivateAutomationSession("payment_handoff");
            }
        } else {
            await safeUpdateAutomationSession({
                lastStage: currentStage,
                lastUrl: window.location.href,
                lastResult: "stalled",
                lastTrigger: trigger
            });
        }

        console.log("ðŸ --- TASK COMPLETE ---");
        await detachDebugger();
        return stageResult;

    } catch (error) {
        if (error.message && error.message.includes("Extension context invalidated")) {
            console.log("âœ… Booking triggered page transition! Automation shutting down cleanly.");
        } else {
            console.error("ðŸ’¥ Automation crashed:", error);
            await safeUpdateAutomationSession({
                lastStage: currentStage,
                lastUrl: window.location.href,
                lastResult: "error",
                lastTrigger: trigger,
                lastError: error.toString()
            });
            await detachDebugger();
        }
        throw error;
    } finally {
        automationRuntime.running = false;

        if (automationRuntime.pendingResume) {
            automationRuntime.pendingResume = false;
            scheduleAutoResume("queued-resume", 500);
        }
    }
}

watchForRouteChanges();
scheduleAutoResume("page-load", 1200);

// ----------------------------------------------------
// MAIN EVENT LISTENER
// ----------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "DO_AUTOMATION") {
        console.log("🚀 --- STARTING AUTOMATION (HUMAN MODE) ---");
        
        (async () => {
            try {
                const completed = await startAutomationRun(msg.data, {
                    trigger: msg.source || "manual",
                    force: Boolean(msg.force)
                });
                sendResponse({ status: completed ? "Success" : "Paused" });
                return;

                const attached = await attachDebugger();
                if (!attached) throw new Error("Could not attach debugger");
                
                const d = msg.data;

                const currentUrl = window.location.href.toLowerCase();

                // Check URL to decide which stage of automation to run
                if (currentUrl.includes("train-list")) {
                    await selectTrainAndBook(d);
                } else if (currentUrl.includes("psgninput")) {
                    await fillPassengerDetails(d);
                } else if (currentUrl.includes("reviewbooking")) {
                    await processReviewAndCaptcha();
                } else if (currentUrl.includes("bkgpaymentoptions")) {
                    await processPaymentOptions(d);
                } else {
                    await searchTrains(d);
                }

                console.log("🏁 --- TASK COMPLETE ---");
                
                await detachDebugger();
                sendResponse({ status: "Success" });

            } catch (error) {
                if (error.message && error.message.includes("Extension context invalidated")) {
                    console.log("✅ Booking triggered page transition! Automation shutting down cleanly.");
                } else {
                    console.error("💥 Automation crashed:", error);
                    await detachDebugger();
                }
                // Suppress response error on invalidated contexts
                try { sendResponse({ status: "Error", message: error.toString() }); } catch(e){}
            }
        })();

        return true; 
    }
});
