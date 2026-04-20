const wait = (ms) => new Promise(res => setTimeout(res, ms));

// Randomizer function for human-like delays
const randomWait = (min, max) => wait(Math.floor(Math.random() * (max - min + 1)) + min);

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
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await wait(500); // let scroll finish
    
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
                console.error("❌ Native click failed. Response:", response);
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
    await wait(200);
    
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
        await wait(200);
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
        await randomWait(300, 500);
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
        await wait(200); 
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
            await randomWait(400, 700);
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
    await randomWait(300, 500);
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
    await randomWait(300, 600); // Breathe

    // 2. To Station
    const toInp = document.querySelector('p-autocomplete[formcontrolname="destination"] input');
    await typeNative(toInp, d.to, "To Station");
    await selectFirstAutocompleteItem("To Station");
    await randomWait(300, 600); // Breathe

    // 3. Date
    await selectDate(d.date);
    await randomWait(300, 600); // Breathe

    // 4. Class
    await selectDropdown('#journeyClass', d.class);

    // 5. Quota
    await selectDropdown('#journeyQuota', d.quota);

    // 6. CDP Native Search Click
    console.log("🚂 Routing command through Chrome Debugger API...");
    document.body.click(); // tiny programmatic blur
    console.log("⏳ Letting WAF settle and Angular validate...");
    await randomWait(2500, 3500); 

    const searchBtn = document.querySelector("button.search_btn.train_Search");
    if (searchBtn) {
        await nativeClick(searchBtn);
        console.log("✅ Search sequence executed by native API!");
    } else {
        console.error("❌ Could not find the Search Trains button.");
    }
}

// ----------------------------------------------------
// TRAIN LIST SELECTION & BOOKING LOGIC
// ----------------------------------------------------
async function selectTrainAndBook(d) {
    console.log(`🚂 Looking for train: ${d.trainName}`);
    
    // 1. Find Train Card
    let trainCard = null;
    for(let i=0; i<20; i++) {
        await wait(500);
        const cards = Array.from(document.querySelectorAll('app-train-avl-enq'));
        trainCard = cards.find(c => c.textContent.includes(d.trainName));
        if (trainCard) break;
    }

    if (!trainCard) {
        console.error("❌ Could not find train card for", d.trainName);
        return false;
    }

    console.log(`✅ Found Train Card! Look for class: ${d.bookingClass}`);
    await randomWait(500, 800);
    
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
    for(let i=0; i<30; i++) {
        await wait(1000);
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
        for (let i=0; i<20; i++) {
            await wait(1000);
            // Re-query buttons to ensure they're fresh
            const buttons = Array.from(trainCard.querySelectorAll('button.train_Search'));
            const bookBtn = buttons.find(b => b.textContent.includes("Book Now"));
            if (bookBtn) {
                await nativeClick(bookBtn);
                console.log(`✅ Clicked Book Now Button!`);
                
                // Wait for potential confirmation modal ("Yes" / "I Agree")
                console.log(`⏳ Checking for Confirmation Modal...`);
                for (let j = 0; j < 5; j++) {
                    await wait(800);
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
                    await wait(1000);
                    const userInp = document.querySelector("input[formcontrolname='userid']");
                    const passInp = document.querySelector("input[formcontrolname='password']");
                    
                    if (userInp && passInp && userInp.offsetParent !== null) {
                        console.log(`✅ Login Modal Detected!`);
                        await randomWait(1000, 2000); // Human pause

                        // Smart fill: Check if username is already present
                        if (userInp.value && userInp.value.trim() !== '') {
                            console.log(`✅ Username field already contains data (${userInp.value}). Skipping ID typing...`);
                        } else {
                            console.log(`✍️ Username field is empty. Natively typing username...`);
                            await typeNative(userInp, d.username, "Username");
                            await randomWait(300, 600);
                        }
                        
                        // Smart fill: Check if password is already present
                        if (passInp.value && passInp.value.trim() !== '') {
                            console.log(`✅ Password field already contains data. Skipping PASS typing...`);
                        } else {
                            console.log(`✍️ Password field is empty. Natively typing password...`);
                            await typeNative(passInp, d.password, "Password");
                            await randomWait(300, 600);
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
        for (let i = 0; i < 15; i++) {
            await wait(1000);
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
        await randomWait(300, 500);
        
        if (nameInp) {
            await typeNative(nameInp, pax.name, "Passenger Name");
            await randomWait(200, 400);
            await pressKeyNative("Escape", "Escape", 27); // Close autocomplete box just in case
            await randomWait(300, 600);
        }
        
        if (ageInp) {
            await typeNative(ageInp, String(pax.age), "Passenger Age");
            await randomWait(300, 500);
        }
        
        // Gender is a <select>. Natively, setting value + dispatching "change" works in Angular generally.
        if (genSelect) {
            genSelect.value = pax.gender;
            genSelect.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`✅ Selected Gender: ${pax.gender}`);
        }
        await randomWait(300, 500);
        
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
                await randomWait(800, 1500);
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
        await wait(1000);
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
    
    if (paymentSelected) {
        console.log(`⏳ Searching for Continue button...`);
        for (let i = 0; i < 20; i++) {
            await wait(1000);
            const buttons = Array.from(document.querySelectorAll('button.btnDefault'));
            const continueBtn = buttons.find(b => b.textContent && b.textContent.trim() === "Continue");
            
            if (continueBtn) {
                // Extra Jittering / Panic as requested
                await humanChaos();
                console.log(`👀 Trembling with panic... clicking Continue!`);
                await randomWait(500, 1000);
                
                await nativeClick(continueBtn); 
                console.log(`✨✨ CHECKOUT ACTION COMPLETE ✨✨`);
                break;
            }
        }
    }
}

// ----------------------------------------------------
// MAIN EVENT LISTENER
// ----------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "DO_AUTOMATION") {
        console.log("🚀 --- STARTING AUTOMATION (HUMAN MODE) ---");
        
        (async () => {
            try {
                const attached = await attachDebugger();
                if (!attached) throw new Error("Could not attach debugger");
                
                const d = msg.data;

                // Check URL to decide which stage of automation to run
                if (window.location.href.includes("train-list")) {
                    await selectTrainAndBook(d);
                } else if (window.location.href.includes("psgninput")) {
                    await fillPassengerDetails(d);
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