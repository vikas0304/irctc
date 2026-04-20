function triggerEvents(element, value) {
    if (!element) return;
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    element.focus();
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "DO_AUTOMATION") {
        const d = request.data;

        // --- STEP 1: LOGIN MODAL ---
        const userInp = document.querySelector('input[formcontrolname="userid"]');
        const passInp = document.querySelector('input[formcontrolname="password"]');
        if (userInp && passInp) {
            triggerEvents(userInp, d.user);
            triggerEvents(passInp, d.pass);
            console.log("Login credentials filled.");
        }

        // --- STEP 2: SEARCH STATIONS ---
        const fromInp = document.querySelector('p-autocomplete[formcontrolname="origin"] input');
        const toInp = document.querySelector('p-autocomplete[formcontrolname="destination"] input');
        if (fromInp) triggerEvents(fromInp, d.from);
        if (toInp) triggerEvents(toInp, d.to);

        // --- STEP 3: JOURNEY DATE ---
        const dateInp = document.querySelector('p-calendar[formcontrolname="journeyDate"] input');
        if (dateInp) triggerEvents(dateInp, d.date);

        // --- STEP 4: PASSENGER DETAILS ---
        const nameFields = document.querySelectorAll('p-autocomplete[formcontrolname="passengerName"] input');
        if (nameFields.length > 0) {
            d.passengers.forEach((p, i) => {
                if (nameFields[i]) {
                    triggerEvents(nameFields[i], p.name);
                    
                    const ageField = document.querySelectorAll('input[formcontrolname="passengerAge"]')[i];
                    if (ageField) triggerEvents(ageField, p.age);
                    
                    const genField = document.querySelectorAll('select[formcontrolname="passengerGender"]')[i];
                    if (genField) triggerEvents(genField, p.gender);
                }
            });
            console.log("Passenger details filled.");
        }
    }
});