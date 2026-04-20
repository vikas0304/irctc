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
        chrome.runtime.sendMessage({ action: "DETACH" }, resolve);
    });
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
            if (response && response.status === "Success") {
                resolve(true);
            } else {
                console.error("❌ Native click failed", response);
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

async function selectDate(dateStr) {
    console.log(`📅 Selecting Date: ${dateStr}`);
    const [day] = dateStr.split("/");
    const targetDay = parseInt(day);
    
    const calendar = document.querySelector("#jDate input, p-calendar[formcontrolname='journeyDate'] input");
    if (calendar) {
        await nativeClick(calendar);
        await randomWait(400, 600);
    }

    const days = document.querySelectorAll("a.ui-state-default:not(.ui-state-disabled)");
    for (const dayEl of days) {
        if (parseInt(dayEl.textContent.trim()) === targetDay) {
            await nativeClick(dayEl);
            console.log(`✅ Date ${dateStr} selected.`);
            return true;
        }
    }
    return false;
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
    
    let trainCard = null;
    let attempts = 0;
    while (attempts < 20) {
        await wait(500);
        // Find train heading, usually strong or div containing train name/number
        const allElements = document.querySelectorAll('.train-heading, strong, div.form-group');
        for (const el of allElements) {
            if (el.textContent && el.textContent.includes(d.trainName)) {
                // Find parent container that wraps the train
                trainCard = el.closest('app-train-avl-enq') || el.closest('.form-group') || (el.parentElement && el.parentElement.parentElement ? el.parentElement.parentElement.parentElement : null);
                if (trainCard && trainCard.querySelector('.pre-avl')) {
                    break;
                }
            }
        }
        if (trainCard && trainCard.querySelector('.pre-avl')) break;
        attempts++;
    }

    if (!trainCard) {
        console.error("❌ Could not find train card for", d.trainName);
        return false;
    }

    console.log(`✅ Found Train Card! Look for class: ${d.bookingClass}`);
    await randomWait(500, 800);
    
    // Step 1: Click the Class from the upper horizontal table (Refresh or Class block)
    let classClicked = false;
    attempts = 0;
    let extractedClassName = d.bookingClass.includes("(") ? d.bookingClass.substring(0, 3) : d.bookingClass;

    while (attempts < 10) {
        await wait(500);
        const preAvlBoxes = trainCard.querySelectorAll('td .pre-avl, div.pre-avl');
        for (const box of preAvlBoxes) {
            // Match the bookingClass string (e.g. AC 2 Tier (2A) or 2A)
            if (box.textContent.includes(d.bookingClass) || box.textContent.includes(extractedClassName)) {
                await nativeClick(box);
                classClicked = true;
                break;
            }
        }
        if (classClicked) break;
        attempts++;
    }

    if (!classClicked) {
        console.error("❌ Could not find the class box for", d.bookingClass);
    }

    // Step 2: Ensure the correct Tier Tab is selected from ui-tabmenu
    console.log(`⏳ Waiting for Tier Tabs to expand...`);
    let tabClicked = false;
    attempts = 0;
    while (attempts < 15) {
        await wait(500);
        const tabs = trainCard.querySelectorAll('.ui-tabmenuitem strong');
        if (tabs.length > 0) {
            for (const tab of tabs) {
                if (tab.textContent.includes(d.bookingClass) || tab.textContent.includes(extractedClassName)) {
                    await nativeClick(tab.closest('a'));
                    tabClicked = true;
                    break;
                }
            }
            break; 
        }
        attempts++;
    }

    // Step 3: Wait for Availability Grid & Click on Available Date Cell
    console.log(`⏳ Waiting for Availability Grid...`);
    let dateClicked = false;
    attempts = 0;
    while (attempts < 20) {
        await wait(500);
        // Look through grid TD cells
        const blocks = trainCard.querySelectorAll('td.link .pre-avl, td .pre-avl, td.link');
        for (const block of blocks) {
            if (block.textContent.includes("WL") || block.textContent.includes("AVAILABLE") || block.textContent.includes("RAC") || block.textContent.includes("REGRET")) {
                await nativeClick(block);
                dateClicked = true;
                console.log(`✅ Selected Availability Date Block.`);
                break;
            }
        }
        if (dateClicked) break;
        attempts++;
    }

    // Step 4: Click 'Book Now' Button
    console.log(`⏳ Waiting for Book Now button...`);
    attempts = 0;
    let booked = false;
    while (attempts < 15) {
        await wait(500);
        const buttons = trainCard.querySelectorAll('button.btnDefault.train_Search');
        for (const btn of buttons) {
            if (btn.textContent.includes("Book Now")) {
                await nativeClick(btn);
                booked = true;
                console.log(`✅ Clicked Book Now Button!`);
                break;
            }
        }
        if (booked) break;
        attempts++;
    }
    
    if(!booked) {
        console.error("❌ Could not find Book Now button.");
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
                } else {
                    await searchTrains(d);
                }

                console.log("🏁 --- TASK COMPLETE ---");
                
                await detachDebugger();
                sendResponse({ status: "Success" });

            } catch (error) {
                console.error("💥 Automation crashed:", error);
                await detachDebugger();
                sendResponse({ status: "Error", message: error.toString() });
            }
        })();

        return true; 
    }
});