let attachedTabs = new Set();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const tabId = sender.tab?.id;

    if (request.action === "GET_TAB_ID") {
        sendResponse({ tabId: tabId ?? null });
        return false;
    }

    // Attach debugger once at the start of automation
    if (request.action === "ATTACH") {
        if (tabId == null) {
            sendResponse({ status: "Error", message: "No tab context available" });
            return false;
        }
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
        if (tabId == null) {
            sendResponse({ status: "Success" });
            return false;
        }
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

    if (request.action === "NATIVE_MOVE") {
        if (tabId == null) {
            sendResponse({ status: "Error", message: "No tab context available" });
            return true;
        }
        if (!attachedTabs.has(tabId)) {
            sendResponse({ status: "Error", message: "Debugger not attached" });
            return true;
        }
        chrome.debugger.sendCommand({ tabId: tabId }, "Input.dispatchMouseEvent", {
            type: "mouseMoved", x: request.x, y: request.y
        }, () => {
            if (chrome.runtime.lastError) {
                if(chrome.runtime.lastError.message.includes("Detached") || chrome.runtime.lastError.message.includes("Target closed")) {
                    sendResponse({ status: "Success" }); return;
                }
                sendResponse({ status: "Error", message: chrome.runtime.lastError.message });
                return;
            }
            sendResponse({ status: "Success" });
        });
        return true;
    }

    if (request.action === "NATIVE_CLICK") {
        if (tabId == null) {
            sendResponse({ status: "Error", message: "No tab context available" });
            return true;
        }
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
        if (tabId == null) {
            sendResponse({ status: "Error" });
            return true;
        }
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

    if (request.action === "NATIVE_KEY") {
        if (tabId == null) {
            sendResponse({ status: "Error" });
            return true;
        }
        if (!attachedTabs.has(tabId)) {
            sendResponse({ status: "Error" });
            return true;
        }

        const keyPayload = {
            key: request.key,
            code: request.code,
            windowsVirtualKeyCode: request.keyCode,
            nativeVirtualKeyCode: request.keyCode
        };

        chrome.debugger.sendCommand({ tabId: tabId }, "Input.dispatchKeyEvent", {
            type: "keyDown",
            ...keyPayload
        }, () => {
            if (chrome.runtime.lastError) {
                console.error("[Background] KeyDown Error:", chrome.runtime.lastError.message);
                sendResponse({ status: "Error", message: chrome.runtime.lastError.message });
                return;
            }

            chrome.debugger.sendCommand({ tabId: tabId }, "Input.dispatchKeyEvent", {
                type: "keyUp",
                ...keyPayload
            }, () => {
                if (chrome.runtime.lastError) {
                    console.error("[Background] KeyUp Error:", chrome.runtime.lastError.message);
                    sendResponse({ status: "Error", message: chrome.runtime.lastError.message });
                    return;
                }
                sendResponse({ status: "Success" });
            });
        });

        return true;
    }
});
