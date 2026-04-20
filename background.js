let attachedTabs = new Set();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const tabId = sender.tab.id;

    // Attach debugger once at the start of automation
    if (request.action === "ATTACH") {
        if (!attachedTabs.has(tabId)) {
            chrome.debugger.attach({ tabId: tabId }, "1.3", () => {
                if (chrome.runtime.lastError) {
                    console.error("[Background] Attach error:", chrome.runtime.lastError.message);
                    sendResponse({ status: "Error", message: chrome.runtime.lastError.message });
                } else {
                    attachedTabs.add(tabId);
                    sendResponse({ status: "Success" });
                }
            });
        } else {
            sendResponse({ status: "Success" });
        }
        return true;
    }

    // Detach debugger at the end of automation
    if (request.action === "DETACH") {
        if (attachedTabs.has(tabId)) {
            chrome.debugger.detach({ tabId: tabId }, () => {
                if (chrome.runtime.lastError) {
                    console.error("[Background] Detach error:", chrome.runtime.lastError.message);
                }
                attachedTabs.delete(tabId);
                sendResponse({ status: "Success" });
            });
        } else {
            sendResponse({ status: "Success" });
        }
        return true;
    }

    if (request.action === "NATIVE_CLICK") {
        if (!attachedTabs.has(tabId)) {
            sendResponse({ status: "Error", message: "Debugger not attached" });
            return true;
        }

        console.log(`[Background] Native Click X:${request.x}, Y:${request.y}`);

        // 1. Move to coordinate
        chrome.debugger.sendCommand({ tabId: tabId }, "Input.dispatchMouseEvent", {
            type: "mouseMoved", x: request.x, y: request.y
        }, () => {
            if (chrome.runtime.lastError) {
                if(chrome.runtime.lastError.message.includes("Detached") || chrome.runtime.lastError.message.includes("Target closed")) {
                    sendResponse({ status: "Success" }); return;
                }
                console.error("[Background] Move Error:", chrome.runtime.lastError.message);
                sendResponse({ status: "Error", message: chrome.runtime.lastError.message });
                return;
            }
            // 2. Press down
            chrome.debugger.sendCommand({ tabId: tabId }, "Input.dispatchMouseEvent", {
                type: "mousePressed", x: request.x, y: request.y, button: "left", clickCount: 1
            }, () => {
                if (chrome.runtime.lastError) {
                    if(chrome.runtime.lastError.message.includes("Detached") || chrome.runtime.lastError.message.includes("Target closed")) {
                        sendResponse({ status: "Success" }); return;
                    }
                    console.error("[Background] Press Error:", chrome.runtime.lastError.message);
                    sendResponse({ status: "Error", message: chrome.runtime.lastError.message });
                    return;
                }
                // 3. Release
                chrome.debugger.sendCommand({ tabId: tabId }, "Input.dispatchMouseEvent", {
                    type: "mouseReleased", x: request.x, y: request.y, button: "left", clickCount: 1
                }, () => {
                    if (chrome.runtime.lastError) {
                        if(chrome.runtime.lastError.message.includes("Detached") || chrome.runtime.lastError.message.includes("Target closed")) {
                            sendResponse({ status: "Success" }); return;
                        }
                        console.error("[Background] Release Error:", chrome.runtime.lastError.message);
                        sendResponse({ status: "Error", message: chrome.runtime.lastError.message });
                        return;
                    }
                    sendResponse({ status: "Success" });
                });
            });
        });

        return true; 
    }

    if (request.action === "NATIVE_TYPE") {
        if (!attachedTabs.has(tabId)) {
            sendResponse({ status: "Error" });
            return true;
        }

        const text = request.text;
        
        const typeChar = (index) => {
             if (index >= text.length) {
                 sendResponse({ status: "Success" });
                 return;
             }
             const char = text[index];
             
             // Dispatch keyDown with character
             chrome.debugger.sendCommand({ tabId: tabId }, "Input.dispatchKeyEvent", {
                 type: "keyDown", text: char
             }, () => {
                 if (chrome.runtime.lastError) console.error("[Background] KeyDown Error:", chrome.runtime.lastError.message);
                 // Dispatch keyUp
                 setTimeout(() => {
                     chrome.debugger.sendCommand({ tabId: tabId }, "Input.dispatchKeyEvent", {
                         type: "keyUp", text: char
                     }, () => {
                         if (chrome.runtime.lastError) console.error("[Background] KeyUp Error:", chrome.runtime.lastError.message);
                         // Small delay before next char
                         setTimeout(() => typeChar(index + 1), Math.floor(Math.random() * 80) + 40);
                     });
                 }, Math.floor(Math.random() * 40) + 20); // Hold key for 20-60ms
             });
        };
        typeChar(0);
        return true;
    }
});