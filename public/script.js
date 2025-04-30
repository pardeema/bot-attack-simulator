// public/script.js

// --- DOM References ---
const form = document.getElementById('attack-form');
const launchButton = document.getElementById('launch-button');
const stopButton = document.getElementById('stop-button');
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
let resultsTableBody = null; // To store reference to tbody
let eventSource = null; // To store the EventSource instance
let resultsStore = {}; // Still store FINAL results by request ID for the modal
let rowCounter = 0; // Simple counter for unique row IDs (primarily for steps now)
let currentConfig = {}; // Store current attack config

// --- Event Listeners ---
form.addEventListener('submit', handleFormSubmit);
stopButton.addEventListener('click', handleStopClick);
modalCloseButton.addEventListener('click', hideModal);
detailModal.addEventListener('click', (event) => { if (event.target === detailModal) hideModal(); });
botTypeSelect.addEventListener('change', toggleCookieField);

// --- Initial Setup ---
toggleCookieField(); // Call once on load to set initial visibility


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
     rowCounter = 0; // Reset row counter

     // --- Update Button States ---
     launchButton.disabled = true;
     launchButton.classList.add('hidden'); // Hide Launch button
     stopButton.disabled = false;
     stopButton.classList.remove('hidden'); // Show Stop button
     stopButton.textContent = 'Stop Attack'; // Ensure text is correct
     // ---

     showStatus('Initiating attack simulation...', 'info');
     clearResultsTable(); // Clear and setup table

     const formData = new FormData(form);
     // Store config globally for access later (e.g., for placeholder rows)
     currentConfig = {
         targetUrl: formData.get('targetUrl'),
         endpoint: formData.get('endpoint'),
         numRequests: parseInt(formData.get('numRequests'), 10), // Ensure number
         botType: formData.get('botType'),
         cookieString: formData.get('cookieString') || ''
     };

     // --- REMOVED: Pre-population of rows ---

     try {
         const launchResponse = await fetch('/launch-attack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentConfig), // Send currentConfig
         });
         const launchResult = await launchResponse.json();
         if (launchResponse.status !== 202) {
             resetButtonsOnError(); // Reset buttons if launch itself fails
             throw new Error(launchResult.message || `Unexpected response status: ${launchResponse.status}`);
         }
         showStatus('Attack running... Waiting for results stream.', 'info');
         connectEventSource(); // Connect to SSE stream
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
             // Re-enable stop button if the API call failed
             stopButton.disabled = false;
             stopButton.textContent = 'Stop Attack';
             throw new Error(errorResult.message || `HTTP error! Status: ${response.status}`);
         }
         console.log("Stop request acknowledged by server.");
         // UI update (disabling launch button etc.) happens when 'done' event received
     } catch (error) {
         console.error('Error sending stop request:', error);
         showStatus(`Error sending stop request: ${error.message}`, 'error');
         // Re-enable stop button if the API call failed
         stopButton.disabled = false;
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
     if (eventSource) eventSource.close(); // Close existing connection first
     eventSource = new EventSource('/attack-stream'); // Connect to the stream endpoint

     eventSource.addEventListener('result', handleResultEvent); // Final result for a request
     eventSource.addEventListener('step', handleStepEvent);   // Intermediate step for complex bots
     eventSource.addEventListener('done', handleDoneEvent);   // Signal that the whole batch is finished
     eventSource.addEventListener('error', handleErrorEvent); // Custom error event from server simulation
     eventSource.onerror = handleGenericErrorEvent; // Handles generic connection errors

     console.log("Connecting to SSE stream...");
 }

/**
 * Handles 'result' events (final outcome) from the SSE stream.
 * Creates or updates the final result row and auto-collapses steps.
 * @param {MessageEvent} event - The event object containing result data.
 */
function handleResultEvent(event) {
    try {
        const resultData = JSON.parse(event.data);
        resultsStore[resultData.id] = resultData; // Store final data for modal
        // Create or update the final result row
        const finalRow = createOrUpdateResultRow(resultData, 'result');

        // --- ADDED: Auto-collapse logic ---
        const isComplex = resultData.method?.startsWith('WORKFLOW');
        if (finalRow && isComplex) {
            // Find the toggle elements within the final row
            const toggleCell = finalRow.cells[0];
            const chevron = toggleCell?.querySelector('.chevron');
            // Collapse the steps associated with this final row
            collapseSteps(finalRow, toggleCell, chevron, resultData.id);
        }
        // --- End Auto-collapse ---

    } catch (e) {
        console.error("Failed to parse result data:", event.data, e);
    }
}

/**
 * Handles 'step' events (intermediate progress) from the SSE stream.
 * Creates a new row for the step.
 * @param {MessageEvent} event - The event object containing step data {id, message}.
 */
function handleStepEvent(event) {
    try {
        const stepData = JSON.parse(event.data);
        // Add a timestamp to the step data when received
        stepData.timestamp = Date.now();
        // Create a row specifically for this step
        createOrUpdateResultRow(stepData, 'step');
    } catch (e) {
        console.error("Failed to parse step data:", event.data, e);
    }
}

/**
 * Handles the 'done' event from the SSE stream (entire batch finished/stopped).
 */
function handleDoneEvent(event) {
    console.log('Received done event:', event.data);
    showStatus('Simulation complete or stopped.', 'success'); // Updated message
    closeEventSource();
    resetButtonsOnFinish(); // Reset buttons
}

/**
 * Handles custom 'error' events from the SSE stream (simulation-level error).
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
    // Only show status if the connection isn't already closed or closing
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
    resultsList.innerHTML = ''; // Clear previous content
    const table = document.createElement('table');
    table.className = 'min-w-full divide-y divide-gray-200 border border-gray-200';
    // Update headers slightly
    table.innerHTML = `
        <thead class="bg-gray-50">
            <tr>
                <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Workflow / ID</th>
                <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status / Step</th>
                <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">URL</th>
                <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Response / Error</th>
            </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200"></tbody>
    `;
    resultsList.appendChild(table);
    resultsTableBody = table.querySelector('tbody'); // Get reference to the new tbody
}

/**
 * Creates the initial placeholder row for a complex workflow run.
 * @param {number} requestId - The ID of the request.
 * @returns {HTMLElement | null} The created placeholder row element or null.
 */
function createPlaceholderFinalRow(requestId) {
    if (!resultsTableBody) return null;

    const finalRowId = `result-${requestId}`;
    // Check if it already exists
    if (resultsTableBody.querySelector(`#${finalRowId}`)) {
        return resultsTableBody.querySelector(`#${finalRowId}`);
    }

    const row = document.createElement('tr');
    row.id = finalRowId;
    row.setAttribute('data-request-id', requestId);
    row.classList.add('result-row', 'final-row', 'final-workflow-row'); // Add all relevant classes
    row.setAttribute('data-expanded', 'true'); // Start expanded

    // Add 6 cells with placeholders
    const cells = [];
    for (let i = 0; i < 6; i++) {
        const cell = document.createElement('td');
        cell.className = 'px-4 py-2 text-sm text-gray-500'; // Default style
        cell.textContent = '...'; // Placeholder
        row.appendChild(cell);
        cells.push(cell);
    }

    // Populate first cell with toggle/endpoint
    const endpointName = currentConfig.endpoint?.split('/').pop() || requestId;
    cells[0].className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-700 toggle-cell';
    cells[0].innerHTML = `${endpointName} <span class="chevron"></span>`;
    cells[0].addEventListener('click', handleToggleClick);

    // Add modal listener to the row (excluding the first cell)
    row.addEventListener('click', (event) => {
        if (!cells[0].contains(event.target)) {
            showDetails(requestId);
        }
    });

    // --- Insertion Logic for Placeholder ---
    // Find the last row of the *previous* request ID to insert after
    let insertAfterElement = null;
    if (requestId > 1) {
        const prevReqId = requestId - 1;
        const prevRows = resultsTableBody.querySelectorAll(`tr[data-request-id="${prevReqId}"]`);
        if (prevRows.length > 0) {
            insertAfterElement = prevRows[prevRows.length - 1];
        }
    }

    if (insertAfterElement) {
        insertAfterElement.insertAdjacentElement('afterend', row);
    } else {
        resultsTableBody.insertBefore(row, resultsTableBody.firstChild); // Insert at the top
    }

    return row; // Return the created row
}


/**
 * Creates or updates a row in the results table for either a step or a final result.
 * Ensures final rows appear before step rows for the same request ID.
 * @param {object} data - The data object (either stepData or resultData).
 * @param {'step'|'result'} type - The type of row to create/update.
 * @returns {HTMLElement | null} The created or updated row element.
 */
function createOrUpdateResultRow(data, type) {
    if (!resultsTableBody) return null;

    const requestId = data.id;
    const finalRowId = `result-${requestId}`;
    let finalRow = resultsTableBody.querySelector(`#${finalRowId}`); // Try to find the final/placeholder row
    let rowToModify = null; // Keep track of the row we add/update

    // --- Ensure Final/Placeholder Row Exists First for Complex ---
    const isComplex = data.method?.startsWith('WORKFLOW') || type === 'step';
    if (isComplex && !finalRow) {
        finalRow = createPlaceholderFinalRow(requestId);
        if (!finalRow) return null; // Should not happen
    }

    // --- Create/Update Row based on Type ---
    if (type === 'step') {
        // --- Create and Insert STEP Row ---
        const stepRow = document.createElement('tr');
        rowCounter++;
        stepRow.id = `step-${requestId}-${rowCounter}`;
        stepRow.setAttribute('data-request-id', requestId);
        stepRow.classList.add('result-row', 'step-row', `step-row-for-${requestId}`);
        // Add 6 cells
        const stepCells = [];
        for (let i = 0; i < 6; i++) {
            const cell = document.createElement('td');
            cell.className = 'px-4 py-2 text-sm'; // Base style
            stepRow.appendChild(cell);
            stepCells.push(cell);
        }

        // Populate step cells
        stepCells[0].textContent = `└─ Step`;
        stepCells[0].className = 'px-4 py-2 whitespace-nowrap text-xs pl-6 text-gray-500';
        stepCells[1].textContent = data.message; // Step message in second column
        stepCells[1].className = 'px-4 py-2 whitespace-normal text-sm text-gray-600 italic';
        stepCells[4].textContent = data.timestamp ? formatTimestamp(data.timestamp) : '-';
        stepCells[4].className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-500';
        stepCells[2].textContent = '-'; stepCells[2].className = 'px-4 py-2 text-sm text-gray-500';
        stepCells[3].textContent = '-'; stepCells[3].className = 'px-4 py-2 text-sm text-gray-500';
        stepCells[5].textContent = '-'; stepCells[5].className = 'px-4 py-2 text-sm text-gray-500';

        // Insert Step Row *after* the last existing row for this request ID
        const allRelatedRows = resultsTableBody.querySelectorAll(`tr[data-request-id="${requestId}"]`);
        const lastRelatedRow = allRelatedRows[allRelatedRows.length - 1]; // Should be the final row or last step
        lastRelatedRow.insertAdjacentElement('afterend', stepRow);

        // Hide if final row is collapsed
        if (finalRow && finalRow.getAttribute('data-expanded') === 'false') {
            stepRow.classList.add('hidden');
        }
        rowToModify = stepRow; // Scroll to the new step row

    } else { // type === 'result'
        // --- Update FINAL Row ---
        if (!finalRow) {
            // Create row for Simple/Medium bots
            finalRow = document.createElement('tr');
            finalRow.id = finalRowId;
            finalRow.setAttribute('data-request-id', requestId);
            finalRow.classList.add('result-row', 'final-row');
             for (let i = 0; i < 6; i++) finalRow.appendChild(document.createElement('td'));
             resultsTableBody.appendChild(finalRow); // Append simple/medium results
             finalRow.addEventListener('click', (event) => { showDetails(requestId); });
        }

        rowToModify = finalRow; // Scroll to the final row when it's updated
        const cells = Array.from(finalRow.cells);

        // Update Cell 0: Workflow / ID
        cells[0].className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-700'; // Base style
        if (isComplex) {
            if (!cells[0].querySelector('.chevron')) { // Ensure toggle elements exist
                cells[0].addEventListener('click', handleToggleClick);
                cells[0].classList.add('toggle-cell');
                cells[0].innerHTML = `${data.url.split('/').pop() || data.id} <span class="chevron"></span>`;
                 if (!finalRow.hasAttribute('data-expanded')) { finalRow.setAttribute('data-expanded', 'true'); }
            } else { // Just update text
                 cells[0].firstChild.textContent = `${data.url.split('/').pop() || data.id} `;
            }
        } else {
            cells[0].textContent = requestId; // Just ID
            cells[0].classList.remove('toggle-cell');
        }

        // Update Cell 1: Status
        let statusClass = 'status-other';
        if (typeof data.status === 'number') { /* ... determine statusClass ... */
             if (data.status >= 200 && data.status < 300) statusClass = 'status-success';
             else if (data.status >= 300 && data.status < 400) statusClass = 'status-redirect';
             else if (data.status >= 400 && data.status < 500) statusClass = 'status-client-error';
             else if (data.status >= 500) statusClass = 'status-server-error';
        } else if (data.error || data.status === 'Error') { statusClass = 'status-client-error'; }
        cells[1].textContent = `${data.status} ${data.statusText || ''}`;
        cells[1].className = `px-4 py-2 whitespace-nowrap text-sm ${statusClass}`; // Final status style

        // Update Cell 2: Method
        cells[2].textContent = data.method;
        cells[2].className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-500';

        // Update Cell 3: URL
        cells[3].textContent = data.url;
        cells[3].className = 'px-4 py-2 text-sm text-gray-500 truncate';
        cells[3].title = data.url;

        // Update Cell 4: Timestamp
        cells[4].textContent = data.timestamp ? formatTimestamp(data.timestamp) : 'N/A';
        cells[4].className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-500';

        // Update Cell 5: Response / Error
        const finalContent = data.error || data.responseDataSnippet || '(No response body)';
        cells[5].textContent = finalContent;
        cells[5].className = 'px-4 py-2 text-sm text-gray-500 truncate';
        cells[5].title = finalContent;
    }

    // --- Auto-Scrolling ---
    if (rowToModify) {
        rowToModify.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    return rowToModify; // Return the row that was added/updated
}


/**
 * Handles clicks on the first cell of a final workflow row to toggle step visibility.
 */
function handleToggleClick(event) {
    event.stopPropagation(); // Prevent modal from opening

    const toggleCell = event.currentTarget; // The cell that was clicked (td)
    const finalRow = toggleCell.closest('tr'); // The parent row (tr)
    if (!finalRow) return;

    const requestId = finalRow.getAttribute('data-request-id');
    const isExpanded = finalRow.getAttribute('data-expanded') === 'true';
    const chevron = toggleCell.querySelector('.chevron');

    // Find all step rows for this request
    const stepRows = resultsTableBody.querySelectorAll(`.step-row-for-${requestId}`);

    // Toggle visibility
    stepRows.forEach(stepRow => {
        stepRow.classList.toggle('hidden', isExpanded); // Hide if expanded, show if collapsed
    });

    // Update state attribute and chevron
    finalRow.setAttribute('data-expanded', !isExpanded);
    if (chevron) {
        chevron.classList.toggle('collapsed', isExpanded);
    }
}

/**
 * Collapses the steps for a given final row.
 * @param {HTMLElement} finalRow - The final row element (TR).
 * @param {HTMLElement} toggleCell - The first cell (TD) of the final row.
 * @param {HTMLElement} chevron - The chevron span element.
 * @param {string|number} requestId - The request ID.
 */
 function collapseSteps(finalRow, toggleCell, chevron, requestId) {
    // Find all step rows for this request
    const stepRows = resultsTableBody.querySelectorAll(`.step-row-for-${requestId}`);
    // Hide all step rows
    stepRows.forEach(stepRow => {
        stepRow.classList.add('hidden');
    });
    // Update state attribute and chevron to collapsed state
    finalRow.setAttribute('data-expanded', 'false');
    if (chevron) {
        chevron.classList.add('collapsed');
    }
}


/**
 * Formats a timestamp into a readable time string.
 */
function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    try {
        return new Date(timestamp).toLocaleTimeString([], {
            hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3
        });
    } catch (e) {
        return 'Invalid Date';
    }
}

/**
 * Shows the detail modal populated with data for the given result ID.
 */
function showDetails(resultId) {
    const data = resultsStore[resultId]; // Get FINAL stored data
    if (!data) {
        console.error("Details not found for result ID:", resultId);
        return;
    }

    // Reference modal elements
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

    // Populate Modal
    modalTitle.textContent = `Details for Request #${data.id}`;
    modalReqUrl.textContent = data.url || 'N/A';
    modalReqMethod.textContent = data.method || 'N/A';
    modalReqHeaders.textContent = data.requestHeaders ? JSON.stringify(data.requestHeaders, null, 2) : '(Not captured/available)';
    modalResHeaders.textContent = data.responseHeaders ? JSON.stringify(data.responseHeaders, null, 2) : 'N/A';
     let reqBodyText = 'N/A';
     if (data.requestBody) {
         if (typeof data.requestBody === 'object') reqBodyText = JSON.stringify(data.requestBody, null, 2);
         else reqBodyText = String(data.requestBody);
     } else reqBodyText = '(Not captured/available)';
     modalReqBody.textContent = reqBodyText;
    modalResStatus.textContent = `${data.status} ${data.statusText || ''}`;
    modalResBody.textContent = data.responseDataSnippet || '(No response body snippet captured)';
    modalResError.textContent = data.error ? `Error: ${data.error}` : '';
    modalResError.classList.toggle('hidden', !data.error);

    // Show Modal
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

