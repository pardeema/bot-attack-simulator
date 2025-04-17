// public/script.js

// --- DOM References ---
const form = document.getElementById('attack-form');
const launchButton = document.getElementById('launch-button');
const stopButton = document.getElementById('stop-button'); // Added Stop Button
const statusMessage = document.getElementById('status-message');
const resultsList = document.getElementById('results-list');
const detailModal = document.getElementById('detail-modal');
const modalCloseButton = document.getElementById('modal-close-button');
// ... (other modal references) ...
const botTypeSelect = document.getElementById('botType');
const cookieFieldContainer = document.getElementById('cookie-field-container');

// --- State Variables ---
let resultsTableBody = null;
let eventSource = null;
let resultsStore = {};

// --- Event Listeners ---
form.addEventListener('submit', handleFormSubmit);
stopButton.addEventListener('click', handleStopClick); // Added listener for Stop button
modalCloseButton.addEventListener('click', hideModal);
detailModal.addEventListener('click', (event) => { if (event.target === detailModal) hideModal(); });
botTypeSelect.addEventListener('change', toggleCookieField);

// --- Initial Setup ---
toggleCookieField();


// --- Functions ---

function toggleCookieField() { /* ... same as before ... */ }

/**
 * Handles the form submission event (Launch Attack).
 */
async function handleFormSubmit(event) {
    event.preventDefault();
    closeEventSource();
    resultsStore = {};

    // --- Update Button States ---
    launchButton.disabled = true;
    launchButton.classList.add('hidden'); // Hide Launch button
    stopButton.disabled = false;
    stopButton.classList.remove('hidden'); // Show Stop button
    // ---

    showStatus('Initiating attack simulation...', 'info');
    clearResultsTable();

    const formData = new FormData(form);
    const config = {
        targetUrl: formData.get('targetUrl'),
        endpoint: formData.get('endpoint'),
        numRequests: formData.get('numRequests'),
        botType: formData.get('botType'),
        cookieString: formData.get('cookieString') || ''
    };

    try {
        const launchResponse = await fetch('/launch-attack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
        });
        const launchResult = await launchResponse.json();
        if (launchResponse.status !== 202) {
            // If launch fails, reset buttons immediately
            resetButtonsOnError();
            throw new Error(launchResult.message || `Unexpected response status: ${launchResponse.status}`);
        }
        showStatus('Attack running... Waiting for results stream.', 'info');
        connectEventSource();
    } catch (error) {
        console.error('Error during attack launch:', error);
        showStatus(`Error: ${error.message}`, 'error');
        resetButtonsOnError(); // Reset buttons on error
    }
}

/**
 * Handles the click event for the Stop Attack button.
 */
async function handleStopClick() {
    console.log("Stop button clicked");
    stopButton.disabled = true; // Disable stop button after click
    stopButton.textContent = 'Stopping...';
    showStatus('Stop request sent...', 'info');

    try {
        const response = await fetch('/stop-attack', { method: 'POST' });
        if (!response.ok) {
            const errorResult = await response.json();
            throw new Error(errorResult.message || `HTTP error! Status: ${response.status}`);
        }
        console.log("Stop request acknowledged by server.");
        // Don't re-enable launch button here; wait for 'done' or 'error' event from SSE
    } catch (error) {
        console.error('Error sending stop request:', error);
        showStatus(`Error sending stop request: ${error.message}`, 'error');
        // If stop request fails, maybe re-enable stop button? Or wait? Let's wait for SSE.
        // Consider resetting button states if SSE connection also fails.
    }
}


/**
 * Resets button states when an error occurs before/during SSE connection
 */
function resetButtonsOnError() {
    launchButton.disabled = false;
    launchButton.classList.remove('hidden');
    stopButton.disabled = true;
    stopButton.classList.add('hidden');
    stopButton.textContent = 'Stop Attack'; // Reset text
}

/**
 * Resets button states when the attack finishes naturally or is stopped.
 */
function resetButtonsOnFinish() {
     launchButton.disabled = false;
     launchButton.classList.remove('hidden');
     stopButton.disabled = true;
     stopButton.classList.add('hidden');
     stopButton.textContent = 'Stop Attack'; // Reset text
}


function connectEventSource() { /* ... same as before ... */
    if (eventSource) eventSource.close();
    eventSource = new EventSource('/attack-stream');
    eventSource.addEventListener('result', handleResultEvent);
    eventSource.addEventListener('step', handleStepEvent);
    eventSource.addEventListener('done', handleDoneEvent);
    eventSource.addEventListener('error', handleErrorEvent);
    eventSource.onerror = handleGenericErrorEvent;
    console.log("Connecting to SSE stream...");
}

function handleResultEvent(event) { /* ... same as before ... */
    try {
        const resultData = JSON.parse(event.data);
        resultsStore[resultData.id] = resultData;
        displayResult(resultData);
    } catch (e) { console.error("Failed to parse result data:", event.data, e); }
}

function handleStepEvent(event) { /* ... same as before ... */
    try {
        const stepData = JSON.parse(event.data);
        if (!resultsTableBody) return;
        let row = resultsTableBody.querySelector(`tr[data-id="${stepData.id}"]`);
        if (!row) { /* ... create placeholder row ... */
             row = document.createElement('tr');
             row.setAttribute('data-id', stepData.id);
             row.className = 'result-row hover:bg-gray-100 cursor-pointer';
             for (let i = 0; i < 6; i++) { const cell = document.createElement('td'); cell.className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-500'; cell.textContent = '...'; row.appendChild(cell); }
             resultsTableBody.appendChild(row);
             row.addEventListener('click', () => showDetails(stepData.id));
             const rows = Array.from(resultsTableBody.querySelectorAll('tr')); rows.sort((a, b) => parseInt(a.dataset.id) - parseInt(b.dataset.id)); rows.forEach(r => resultsTableBody.appendChild(r));
        }
        const firstCell = row.cells[0];
        if (firstCell) {
            firstCell.textContent = stepData.message;
            firstCell.title = stepData.message;
            firstCell.className = 'px-4 py-2 whitespace-normal text-xs text-blue-600';
        }
    } catch (e) { console.error("Failed to parse step data:", event.data, e); }
}

function handleDoneEvent(event) { /* ... modified to reset buttons ... */
    console.log('Received done event:', event.data);
    showStatus('Simulation complete or stopped.', 'success'); // Updated message
    closeEventSource();
    resetButtonsOnFinish(); // Reset buttons
}

function handleErrorEvent(event) { /* ... modified to reset buttons ... */
     try {
        const errorData = JSON.parse(event.data);
        console.error('Received error event:', errorData);
        showStatus(`Simulation Error: ${errorData.message || 'Unknown error'}`, 'error');
     } catch (e) {
         console.error("Failed to parse error event data:", event.data, e);
         showStatus('Received an unparseable error from the server.', 'error');
     }
     // Also reset buttons if a simulation-level error occurs
     resetButtonsOnFinish();
}

function handleGenericErrorEvent(err) { /* ... modified to reset buttons ... */
    console.error('EventSource failed:', err);
    if (eventSource && eventSource.readyState !== EventSource.CLOSED) {
         showStatus('Error connecting to results stream. Please try again.', 'error');
    }
    closeEventSource();
    resetButtonsOnError(); // Reset buttons on connection error
}

function closeEventSource() { /* ... same as before ... */ }
function clearResultsTable() { /* ... same as before ... */ }
function displayResult(result) { /* ... same as before ... */ }
function showDetails(resultId) { /* ... same as before ... */ }
function hideModal() { /* ... same as before ... */ }
function showStatus(message, type = 'info') { /* ... same as before ... */ }
function hideStatus() { /* ... same as before ... */ }

