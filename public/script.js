// public/script.js

// --- DOM References ---
const form = document.getElementById('attack-form');
const launchButton = document.getElementById('launch-button');
const stopButton = document.getElementById('stop-button'); // Added Stop Button
const statusMessage = document.getElementById('status-message');
const resultsList = document.getElementById('results-list');
const detailModal = document.getElementById('detail-modal');
const modalCloseButton = document.getElementById('modal-close-button');
const modalTitle = document.getElementById('modal-title');
const modalReqUrl = document.getElementById('modal-req-url');
const modalReqMethod = document.getElementById('modal-req-method');
const modalReqHeaders = document.getElementById('modal-req-headers');
const modalReqBody = document.getElementById('modal-req-body');
const modalResStatus = document.getElementById('modal-res-status');
const modalResHeaders = document.getElementById('modal-res-headers');
const modalResBody = document.getElementById('modal-res-body');
const modalResError = document.getElementById('modal-res-error');
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

/**
 * Shows or hides the optional cookie field based on selected Bot Type.
 */
function toggleCookieField() {
    const selectedType = botTypeSelect.value;
    if (selectedType === 'Medium') {
        cookieFieldContainer.classList.remove('hidden');
    } else {
        cookieFieldContainer.classList.add('hidden');
    }
}


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
    stopButton.textContent = 'Stop Attack'; // Ensure text is correct
    // ---

    showStatus('Initiating attack simulation...', 'info');
    clearResultsTable();

    const formData = new FormData(form);
    const config = {
        targetUrl: formData.get('targetUrl'),
        endpoint: formData.get('endpoint'),
        numRequests: formData.get('numRequests'),
        botType: formData.get('botType'),
        // *** ADDED: Read cookie string value ***
        cookieString: formData.get('cookieString') || '' // Send empty string if not provided
    };

    try {
        const launchResponse = await fetch('/launch-attack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config), // Send config including cookieString
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
         stopButton.disabled = false; // Re-enable if the API call failed
         stopButton.textContent = 'Stop Attack';
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


/**
 * Establishes connection to the SSE stream.
 */
function connectEventSource() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource('/attack-stream');
    eventSource.addEventListener('result', handleResultEvent);
    eventSource.addEventListener('step', handleStepEvent); // Listen for step events
    eventSource.addEventListener('done', handleDoneEvent);
    eventSource.addEventListener('error', handleErrorEvent); // Listen for custom error events
    eventSource.onerror = handleGenericErrorEvent; // Handles generic connection errors
    console.log("Connecting to SSE stream...");
}

/**
 * Handles 'result' events (final outcome) from the SSE stream.
 */
function handleResultEvent(event) {
    try {
        const resultData = JSON.parse(event.data);
        resultsStore[resultData.id] = resultData; // Store final data
        displayResult(resultData); // Update row with final data
    } catch (e) {
        console.error("Failed to parse result data:", event.data, e);
    }
}

/**
 * Handles 'step' events (intermediate progress) from the SSE stream.
 * Updates the FIRST column of the corresponding row.
 */
function handleStepEvent(event) {
    try {
        const stepData = JSON.parse(event.data);
        if (!resultsTableBody) return;

        let row = resultsTableBody.querySelector(`tr[data-id="${stepData.id}"]`);

        // If row doesn't exist yet, create a basic structure for it.
        if (!row) {
            row = document.createElement('tr');
            row.setAttribute('data-id', stepData.id);
            row.className = 'result-row hover:bg-gray-100 cursor-pointer';
            // Add placeholder cells
            for (let i = 0; i < 6; i++) { // Assuming 6 columns
                 const cell = document.createElement('td');
                 cell.className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-500';
                 if (i === 0) cell.textContent = '...'; // Initial placeholder for ID/Step col
                 else cell.textContent = '...';
                 row.appendChild(cell);
            }
            resultsTableBody.appendChild(row);
            // Add click listener now that row exists
             row.addEventListener('click', () => showDetails(stepData.id));
             // Re-sort after adding placeholder row
             const rows = Array.from(resultsTableBody.querySelectorAll('tr'));
             rows.sort((a, b) => parseInt(a.dataset.id) - parseInt(b.dataset.id));
             rows.forEach(r => resultsTableBody.appendChild(r));
        }

        // Find the FIRST cell (index 0)
        const firstCell = row.cells[0];
        if (firstCell) {
            firstCell.textContent = stepData.message; // Show step message
            firstCell.title = stepData.message; // Update tooltip too
            // Apply temporary styling for steps
            firstCell.className = 'px-4 py-2 whitespace-normal text-xs text-blue-600'; // Allow wrap, smaller blue text
        }

    } catch (e) {
        console.error("Failed to parse step data:", event.data, e);
    }
}


/**
 * Handles the 'done' event from the SSE stream.
 */
function handleDoneEvent(event) {
    console.log('Received done event:', event.data);
    showStatus('Simulation complete or stopped.', 'success'); // Updated message
    closeEventSource();
    resetButtonsOnFinish(); // Reset buttons
}

/**
 * Handles custom 'error' events from the SSE stream.
 */
function handleErrorEvent(event) {
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

/**
 * Handles generic EventSource connection errors.
 */
function handleGenericErrorEvent(err) {
    console.error('EventSource failed:', err);
    if (eventSource && eventSource.readyState !== EventSource.CLOSED) {
         showStatus('Error connecting to results stream. Please try again.', 'error');
    }
    closeEventSource();
    resetButtonsOnError(); // Reset buttons on connection error
}


/**
 * Closes the EventSource connection if it's open.
 */
function closeEventSource() {
    if (eventSource) {
        eventSource.close();
        eventSource = null;
        console.log("SSE connection closed.");
    }
}

/**
 * Clears the results area and sets up the table structure.
 */
function clearResultsTable() {
    resultsList.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'min-w-full divide-y divide-gray-200 border border-gray-200';
    table.innerHTML = `
        <thead class="bg-gray-50">
            <tr>
                <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"># / Step</th>
                <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">URL</th>
                <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Response / Error</th>
            </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200"></tbody>
    `;
    resultsList.appendChild(table);
    resultsTableBody = table.querySelector('tbody');
}


/**
 * Adds or updates a single result row in the table using FINAL result data.
 * Ensures first column shows ID and last shows final response/error.
 * Adds click listener to show details.
 * @param {object} result - The final result object for one request/workflow.
 */
function displayResult(result) {
    if (!resultsTableBody) return;

    let row = resultsTableBody.querySelector(`tr[data-id="${result.id}"]`);

    // If row doesn't exist when the final result comes, create it and its cells.
    if (!row) {
        row = document.createElement('tr');
        row.setAttribute('data-id', result.id);
        row.className = 'result-row hover:bg-gray-100 cursor-pointer';
         // Add required cells
         for (let i = 0; i < 6; i++) {
             const cell = document.createElement('td');
             cell.className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-500'; // Base style
             row.appendChild(cell);
         }
        resultsTableBody.appendChild(row);
        row.addEventListener('click', () => showDetails(result.id));
    }

    // --- Update Cells with FINAL Data ---

    // Cell 0: ID (# / Step) - Set back to ID and normal style
    const cell0 = row.cells[0];
    cell0.textContent = result.id;
    cell0.title = ''; // Clear step tooltip
    cell0.className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-500'; // Restore default style

    // Cell 1: Status
    const cell1 = row.cells[1];
    let statusClass = 'status-other';
     if (typeof result.status === 'number') {
        if (result.status >= 200 && result.status < 300) statusClass = 'status-success';
        else if (result.status >= 300 && result.status < 400) statusClass = 'status-redirect';
        else if (result.status >= 400 && result.status < 500) statusClass = 'status-client-error';
        else if (result.status >= 500) statusClass = 'status-server-error';
    } else if (result.error || result.status === 'Error') { // Check for explicit 'Error' status too
         statusClass = 'status-client-error';
    }
    cell1.textContent = `${result.status} ${result.statusText || ''}`;
    cell1.className = `px-4 py-2 whitespace-nowrap text-sm ${statusClass}`; // Apply status color

    // Cell 2: Method
    row.cells[2].textContent = result.method;
    row.cells[2].className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-500';


    // Cell 3: URL
    row.cells[3].textContent = result.url;
    row.cells[3].className = 'px-4 py-2 text-sm text-gray-500 truncate';
    row.cells[3].title = result.url;

    // Cell 4: Timestamp
    const cell4 = row.cells[4];
    cell4.textContent = result.timestamp
        ? new Date(result.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })
        : 'N/A';
    cell4.className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-500';


    // Cell 5: Response / Error (Final)
    const cell5 = row.cells[5];
    const finalLastCellContent = result.error || result.responseDataSnippet || '(No response body)';
    cell5.textContent = finalLastCellContent;
    cell5.title = finalLastCellContent;
    cell5.className = 'px-4 py-2 text-sm text-gray-500 truncate'; // Restore default style


    // Re-sort rows (optional, but keeps order consistent if rows were added out of order)
    const rows = Array.from(resultsTableBody.querySelectorAll('tr'));
    rows.sort((a, b) => parseInt(a.dataset.id) - parseInt(b.dataset.id));
    rows.forEach(r => resultsTableBody.appendChild(r));
}


/**
 * Shows the detail modal populated with data for the given result ID.
 */
function showDetails(resultId) {
    const data = resultsStore[resultId];
    if (!data) return;

    // Reference modal elements (ensure these IDs exist in index.html)
    const modalTitle = document.getElementById('modal-title');
    const modalReqUrl = document.getElementById('modal-req-url');
    const modalReqMethod = document.getElementById('modal-req-method');
    const modalReqHeaders = document.getElementById('modal-req-headers');
    const modalReqBody = document.getElementById('modal-req-body');
    const modalResStatus = document.getElementById('modal-res-status');
    const modalResHeaders = document.getElementById('modal-res-headers');
    const modalResBody = document.getElementById('modal-res-body');
    const modalResError = document.getElementById('modal-res-error');
    const detailModal = document.getElementById('detail-modal');


    modalTitle.textContent = `Details for Request #${data.id}`;
    modalReqUrl.textContent = data.url || 'N/A';
    // For complex bots, method is 'WORKFLOW (POST)', maybe clarify
    modalReqMethod.textContent = data.method || 'N/A';

    // Format Headers (handle null/undefined)
    modalReqHeaders.textContent = data.requestHeaders ? JSON.stringify(data.requestHeaders, null, 2) : '(Not captured/available for this workflow)';
    modalResHeaders.textContent = data.responseHeaders ? JSON.stringify(data.responseHeaders, null, 2) : 'N/A';

    // Format Request Body (handle null/undefined, might be object or string)
     let reqBodyText = 'N/A';
     if (data.requestBody) {
         if (typeof data.requestBody === 'object') {
             reqBodyText = JSON.stringify(data.requestBody, null, 2);
         } else {
             reqBodyText = String(data.requestBody); // Treat as plain text if not object
         }
     } else {
        reqBodyText = '(Not captured/available for this workflow)';
     }
     modalReqBody.textContent = reqBodyText;


    // Populate Response Info
    modalResStatus.textContent = `${data.status} ${data.statusText || ''}`;
    modalResBody.textContent = data.responseDataSnippet || '(No response body snippet captured)';
    modalResError.textContent = data.error ? `Error: ${data.error}` : '';
    modalResError.classList.toggle('hidden', !data.error);

    detailModal.classList.remove('hidden');
}

/** Hides the detail modal. */
function hideModal() {
    detailModal.classList.add('hidden');
}

/** Displays status messages to the user. */
function showStatus(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.className = 'mb-4 p-3 rounded-md';
    switch (type) {
        case 'success': statusMessage.classList.add('bg-green-50', 'text-green-700'); break;
        case 'error': statusMessage.classList.add('bg-red-50', 'text-red-700'); break;
        case 'info': default: statusMessage.classList.add('bg-blue-50', 'text-blue-700'); break;
    }
    statusMessage.classList.remove('hidden');
}

/** Clears the status message area. */
function hideStatus() {
    statusMessage.textContent = '';
    statusMessage.classList.add('hidden');
}
