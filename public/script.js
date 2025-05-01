// public/script.js

// --- DOM References ---
const form = document.getElementById('attack-form');
const launchButton = document.getElementById('launch-button');
const stopButton = document.getElementById('stop-button');
const statusMessage = document.getElementById('status-message');
const resultsList = document.getElementById('results-list');
// Modal Elements
const detailModal = document.getElementById('detail-modal');
const modalCloseButton = document.getElementById('modal-close-button');
const modalTitle = document.getElementById('modal-title');
const modalReqHeading = document.getElementById('modal-req-heading'); // Heading for request section
const modalResHeading = document.getElementById('modal-res-heading'); // Heading for response section
const modalReqUrl = document.getElementById('modal-req-url');
const modalReqMethod = document.getElementById('modal-req-method');
const modalReqHeaders = document.getElementById('modal-req-headers');
const modalReqBody = document.getElementById('modal-req-body');
const modalResStatus = document.getElementById('modal-res-status');
const modalResHeaders = document.getElementById('modal-res-headers');
const modalResBody = document.getElementById('modal-res-body');
const modalResError = document.getElementById('modal-res-error');
// Configuration Elements
const botTypeSelect = document.getElementById('botType');
const cookieFieldContainer = document.getElementById('cookie-field-container');
const configToggleButton = document.getElementById('config-toggle-button');
const configContainer = document.getElementById('config-container');
const mainHeader = document.getElementById('main-header');

// --- State Variables ---
let resultsTableBody = null; // Reference to the results table body
let eventSource = null; // Holds the Server-Sent Events connection
let resultsStore = {}; // Stores FINAL results summary data, keyed by request ID (e.g., resultsStore[1] = {...})
let stepDetailsStore = {}; // Stores DETAILED step data (if available), keyed by unique step ID (e.g., stepDetailsStore['step-1-3'] = {...})
let stepCounters = {}; // Tracks the number of steps per request ID to generate unique step IDs { requestId: count }
let currentConfig = {}; // Stores the configuration of the currently running attack

// --- Event Listeners ---
form.addEventListener('submit', handleFormSubmit);
stopButton.addEventListener('click', handleStopClick);
modalCloseButton.addEventListener('click', hideModal);
// Close modal if clicked outside the content area
detailModal.addEventListener('click', (event) => { if (event.target === detailModal) hideModal(); });
botTypeSelect.addEventListener('change', toggleCookieField);
configToggleButton.addEventListener('click', handleConfigToggle);

// --- Initial Setup ---
toggleCookieField(); // Set initial visibility of cookie field based on default selection

// --- Functions ---

/**
 * Collapses the configuration form area smoothly.
 */
function collapseConfigArea() {
    const icon = configToggleButton.querySelector('svg');
    if (!configContainer.classList.contains('collapsed')) {
        // Set max-height to current height to allow transition FROM this height
        configContainer.style.maxHeight = configContainer.scrollHeight + "px";
        // Use requestAnimationFrame to ensure the height is set before adding the class
        requestAnimationFrame(() => {
            configContainer.classList.add('collapsed');
            configContainer.style.maxHeight = '0px'; // Animate to 0 height
            mainHeader.style.paddingBottom = '0'; // Remove header padding
            icon?.classList.add('collapsed'); // Rotate chevron
        });
    }
}

/**
 * Expands the configuration form area smoothly.
 */
function expandConfigArea() {
    const icon = configToggleButton.querySelector('svg');
     if (configContainer.classList.contains('collapsed')) {
        configContainer.classList.remove('collapsed');
        // Set max-height to scroll height to trigger animation
        configContainer.style.maxHeight = configContainer.scrollHeight + "px";
        mainHeader.style.paddingBottom = '1rem'; // Restore header padding
        icon?.classList.remove('collapsed'); // Rotate chevron back
        // Remove max-height after transition completes to allow dynamic content resizing
        setTimeout(() => {
             if (!configContainer.classList.contains('collapsed')) { // Check if still expanded
                 configContainer.style.maxHeight = null;
             }
        }, 300); // Duration should match CSS transition time
     }
}

/**
 * Toggles the visibility of the configuration area.
 */
function handleConfigToggle() {
    const isCollapsed = configContainer.classList.contains('collapsed');
    if (isCollapsed) {
        expandConfigArea();
    } else {
        collapseConfigArea();
    }
}

/**
 * Shows or hides the optional cookie input field based on the selected bot type.
 */
function toggleCookieField() {
    // Show only if "Medium" bot type is selected
    cookieFieldContainer.classList.toggle('hidden', botTypeSelect.value !== 'Medium');
}

/**
 * Handles the form submission to launch an attack simulation.
 * @param {Event} event - The form submission event.
 */
async function handleFormSubmit(event) {
     event.preventDefault(); // Prevent default form submission
     closeEventSource(); // Close any existing SSE connection
     // Reset state for the new attack
     resultsStore = {};
     stepDetailsStore = {};
     stepCounters = {};

     // Update UI: Disable launch, enable stop, show stop button
     launchButton.disabled = true;
     launchButton.classList.add('hidden');
     stopButton.disabled = false;
     stopButton.classList.remove('hidden');
     stopButton.textContent = 'Stop Attack'; // Reset text just in case

     collapseConfigArea(); // Collapse config on launch
     showStatus('Initiating attack simulation...', 'info'); // Show initial status
     clearResultsTable(); // Clear previous results and setup table structure

     // Get form data and store configuration
     const formData = new FormData(form);
     currentConfig = {
         targetUrl: formData.get('targetUrl'),
         endpoint: formData.get('endpoint'),
         numRequests: parseInt(formData.get('numRequests'), 10), // Ensure it's a number
         botType: formData.get('botType'),
         cookieString: formData.get('cookieString') || '' // Use empty string if null/undefined
     };

     try {
         // Send launch request to the backend
         const launchResponse = await fetch('/launch-attack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentConfig),
         });
         const launchResult = await launchResponse.json();
         // Check if the launch request itself was accepted (202 Accepted)
         if (launchResponse.status !== 202) {
             resetButtonsOnError(); // Reset UI if launch failed
             throw new Error(launchResult.message || `Unexpected response status: ${launchResponse.status}`);
         }
         // If accepted, show status and connect to SSE stream
         showStatus('Attack running... Waiting for results stream.', 'info');
         connectEventSource();
     } catch (error) {
         // Handle errors during the launch request
         console.error('Error during attack launch:', error);
         showStatus(`Error: ${error.message}`, 'error');
         resetButtonsOnError(); // Reset UI on error
     }
 }

/**
 * Handles the click event for the "Stop Attack" button.
 */
async function handleStopClick() {
     console.log("Stop button clicked");
     // Disable button immediately and show feedback
     stopButton.disabled = true;
     stopButton.textContent = 'Stopping...';
     showStatus('Stop request sent...', 'info'); // Inform user

     try {
         // Send request to the backend stop endpoint
         const response = await fetch('/stop-attack', { method: 'POST' });
         if (!response.ok) {
             // If the stop request fails, re-enable the button and show error
             const errorResult = await response.json();
             stopButton.disabled = false;
             stopButton.textContent = 'Stop Attack';
             throw new Error(errorResult.message || `HTTP error! Status: ${response.status}`);
         }
         // If successful, log confirmation. UI reset happens on 'done' event.
         console.log("Stop request acknowledged by server.");
     } catch (error) {
         // Handle errors during the stop request
         console.error('Error sending stop request:', error);
         showStatus(`Error sending stop request: ${error.message}`, 'error');
         // Re-enable button if fetch failed
         stopButton.disabled = false;
         stopButton.textContent = 'Stop Attack';
     }
 }

/**
 * Resets button states and expands config area on launch error or connection error.
 */
function resetButtonsOnError() {
    launchButton.disabled = false;
    launchButton.classList.remove('hidden');
    stopButton.disabled = true;
    stopButton.classList.add('hidden');
    stopButton.textContent = 'Stop Attack'; // Reset text
    expandConfigArea(); // Show config again
}

/**
 * Resets button states and expands config area when simulation finishes or is stopped.
 */
function resetButtonsOnFinish() {
     launchButton.disabled = false;
     launchButton.classList.remove('hidden');
     stopButton.disabled = true;
     stopButton.classList.add('hidden');
     stopButton.textContent = 'Stop Attack'; // Reset text
     expandConfigArea(); // Show config again
}

/**
 * Establishes the Server-Sent Events (SSE) connection to the backend stream.
 */
function connectEventSource() {
     if (eventSource) eventSource.close(); // Close any existing connection first
     eventSource = new EventSource('/attack-stream'); // Endpoint defined in server.js

     // Add listeners for specific event types from the backend
     eventSource.addEventListener('result', handleResultEvent); // Final result summary
     eventSource.addEventListener('step', handleStepEvent);   // Intermediate steps (potentially detailed)
     eventSource.addEventListener('done', handleDoneEvent);   // Simulation finished/stopped signal
     eventSource.addEventListener('error', handleErrorEvent); // Custom error events from backend simulation
     eventSource.onerror = handleGenericErrorEvent; // Handles generic SSE connection errors

     console.log("Connecting to SSE stream...");
 }

/**
 * Handles 'result' events (final outcome summary for a workflow iteration).
 * Stores the summary data and updates/creates the final row in the table.
 * @param {MessageEvent} event - The SSE event containing result data.
 */
function handleResultEvent(event) {
    try {
        const resultData = JSON.parse(event.data);
        resultsStore[resultData.id] = resultData; // Store final summary data
        // Create or update the row representing the final result
        const finalRow = createOrUpdateResultRow(resultData, 'result');

        // Auto-collapse steps when the final result arrives for complex workflows
        const isComplex = resultData.method?.startsWith('WORKFLOW');
        if (finalRow && isComplex) {
            const toggleCell = finalRow.cells[0];
            const chevron = toggleCell?.querySelector('.chevron');
            // Collapse steps associated with this final result row
            collapseSteps(finalRow, toggleCell, chevron, resultData.id);
        }
    } catch (e) {
        console.error("Failed to parse result data:", event.data, e);
    }
}

/**
 * Handles 'step' events (intermediate progress, potentially with network details).
 * Generates a unique ID, stores detailed data if present, and updates/creates the step row.
 * @param {MessageEvent} event - The SSE event containing step data {id, message, details?}.
 */
function handleStepEvent(event) {
    try {
        const stepData = JSON.parse(event.data);
        const requestId = stepData.id; // ID of the parent workflow iteration

        // Generate a unique ID for this specific step instance within the request
        stepCounters[requestId] = (stepCounters[requestId] || 0) + 1;
        const uniqueStepId = `step-${requestId}-${stepCounters[requestId]}`;
        stepData.uniqueStepId = uniqueStepId; // Add the unique ID to the data object

        // If the step includes network 'details', store them using the unique step ID
        if (stepData.details) {
            stepDetailsStore[uniqueStepId] = stepData; // Store the *entire* stepData object
            console.log(`Stored details for step ${uniqueStepId}`);
        }

        // Add a timestamp when the event is received by the frontend
        stepData.timestamp = Date.now();

        // Create or update the table row for this step
        // The function will handle adding click listeners if details were stored
        createOrUpdateResultRow(stepData, 'step');
    } catch (e) {
        console.error("Failed to parse step data:", event.data, e);
    }
}


/**
 * Handles the 'done' event signaling the end of the simulation batch.
 */
function handleDoneEvent(event) {
    console.log('Received done event:', event.data);
    showStatus('Simulation complete or stopped.', 'success'); // Update status message
    closeEventSource(); // Close the SSE connection
    resetButtonsOnFinish(); // Reset UI buttons and expand config
}

/**
 * Handles custom 'error' events sent from the backend simulation logic.
 */
function handleErrorEvent(event) {
     try {
        const errorData = JSON.parse(event.data);
        console.error('Received error event:', errorData);
        showStatus(`Simulation Error: ${errorData.message || 'Unknown error'}`, 'error');
     } catch (e) {
         // Handle cases where the error data itself is malformed
         console.error("Failed to parse error event data:", event.data, e);
         showStatus('Received an unparseable error from the server.', 'error');
     }
     // Assume simulation is over on error, reset UI
     resetButtonsOnFinish();
}

/**
 * Handles generic EventSource connection errors (e.g., server unavailable).
 */
function handleGenericErrorEvent(err) {
    console.error('EventSource failed:', err);
    // Only show status if the connection wasn't already intentionally closed
    if (eventSource && eventSource.readyState !== EventSource.CLOSED) {
         showStatus('Error connecting to results stream. Please try again.', 'error');
    }
    closeEventSource(); // Ensure connection is closed
    resetButtonsOnError(); // Reset UI as if launch failed
}

/**
 * Closes the EventSource connection if it's currently open.
 */
function closeEventSource() {
    if (eventSource) {
        eventSource.close();
        eventSource = null; // Clear the reference
        console.log("SSE connection closed.");
    }
}

/**
 * Clears the results table and resets related state variables.
 */
function clearResultsTable() {
    resultsList.innerHTML = ''; // Clear previous content
    // Reset state associated with table content
    stepCounters = {};
    stepDetailsStore = {};
    resultsStore = {};

    // Create new table structure
    const table = document.createElement('table');
    table.className = 'min-w-full divide-y divide-gray-200 border border-gray-200';
    // Define table headers (adjust column names as needed)
    table.innerHTML = `
        <thead class="bg-gray-50">
            <tr>
                <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Workflow / ID</th>
                <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status / Step Status</th>
                <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">URL / Step Message</th>
                <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                <th scope="col" class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Response Snippet / Error</th>
            </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200"></tbody>
    `;
    resultsList.appendChild(table);
    resultsTableBody = table.querySelector('tbody'); // Store reference to the new tbody
}

/**
 * Ensures a placeholder row exists for a complex workflow's final result.
 * This row acts as the parent for nested step rows.
 * @param {number} requestId - The ID of the workflow iteration.
 * @returns {HTMLElement | null} The created or found final row element, or null on error.
 */
function ensurePlaceholderFinalRow(requestId) {
    if (!resultsTableBody) return null; // Safety check

    const finalRowId = `result-${requestId}`;
    let finalRow = resultsTableBody.querySelector(`#${finalRowId}`);

    // If the final row doesn't exist yet, create it
    if (!finalRow) {
        finalRow = document.createElement('tr');
        finalRow.id = finalRowId;
        finalRow.setAttribute('data-request-id', requestId);
        // Add classes to identify it as a final row for a workflow
        finalRow.classList.add('result-row', 'final-row', 'final-workflow-row');
        finalRow.setAttribute('data-expanded', 'true'); // Start expanded by default

        // Create placeholder cells
        for (let i = 0; i < 6; i++) {
            const cell = document.createElement('td');
            cell.className = 'px-4 py-2 text-sm text-gray-500'; // Default styling
            cell.textContent = '...'; // Placeholder content
            finalRow.appendChild(cell);
        }

        // Customize the first cell for workflow name and toggle
        const endpointName = currentConfig.endpoint?.split('/').pop() || `Workflow ${requestId}`;
        const firstCell = finalRow.cells[0];
        firstCell.className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-700 toggle-cell';
        firstCell.innerHTML = `${endpointName} <span class="chevron"></span>`; // Add chevron for toggle
        // Add click listener ONLY to the first cell for toggling steps
        firstCell.addEventListener('click', handleToggleClick);

        // Add click listener to the ROW ITSELF for showing final result details
        // This listener ignores clicks on the first cell (toggle cell)
        finalRow.addEventListener('click', (event) => {
            if (!firstCell.contains(event.target)) { // Check if click was outside the toggle cell
                showDetails(requestId, 'result'); // Show final result details
            }
        });

        // Insert the new final row in the correct order (before the next request ID's rows)
        let insertBeforeElement = resultsTableBody.querySelector(`tr[data-request-id="${requestId + 1}"]`);
        if (insertBeforeElement) {
            resultsTableBody.insertBefore(finalRow, insertBeforeElement);
        } else {
            // Append if it's the last request or no next request exists yet
            resultsTableBody.appendChild(finalRow);
        }
    }
    return finalRow; // Return the existing or newly created final row
}


/**
 * Creates or updates a row in the results table for either a step or a final result.
 * Ensures correct ordering and adds click listeners where appropriate.
 * @param {object} data - The data object (either stepData or resultData).
 * @param {'step'|'result'} type - The type of row to create/update ('step' or 'result').
 * @returns {HTMLElement | null} The created or updated row element.
 */
function createOrUpdateResultRow(data, type) {
    if (!resultsTableBody) return null; // Table body must exist

    const requestId = data.id; // ID of the overall request/workflow
    const finalRowId = `result-${requestId}`; // ID for the final summary row
    let finalRow = resultsTableBody.querySelector(`#${finalRowId}`); // Find the final row
    let rowToModify = null; // Will hold the row being added/updated

    // Determine if this belongs to a complex workflow (needs placeholder/parent row)
    const isComplex = data.method?.startsWith('WORKFLOW') || type === 'step';
    // Ensure the final/placeholder row exists if this is part of a complex workflow
    if (isComplex && !finalRow) {
        finalRow = ensurePlaceholderFinalRow(requestId);
        if (!finalRow) return null; // Error creating placeholder
    }

    // --- Handle STEP Row Creation ---
    if (type === 'step') {
        const stepRow = document.createElement('tr');
        stepRow.id = data.uniqueStepId; // Use the generated unique step ID
        stepRow.setAttribute('data-request-id', requestId); // Link to parent request
        // Add classes to identify as a step row and link to parent ID for toggling
        stepRow.classList.add('result-row', 'step-row', `step-row-for-${requestId}`);

        // Create cells for the step row
        const stepCells = [];
        for (let i = 0; i < 6; i++) {
            const cell = document.createElement('td');
            cell.className = 'px-4 py-2 text-xs'; // Use smaller text for steps
            stepRow.appendChild(cell);
            stepCells.push(cell);
        }

        // --- Populate Step Cells ---
        // Cell 0: Indication of step
        stepCells[0].textContent = `└─ Step`;
        stepCells[0].className = 'px-4 py-2 whitespace-nowrap text-xs pl-6 text-gray-500'; // Indent

        // Cell 1: Step Status (if network details exist)
        stepCells[1].className = 'px-4 py-2 whitespace-nowrap text-xs'; // Base style
        if (data.details?.responseStatus !== undefined && data.details?.responseStatus !== null) {
            const status = data.details.responseStatus;
            const statusText = data.details.responseStatusText || '';
            let statusClass = 'status-other'; // Default color
            // Determine color based on status code
            if (status >= 200 && status < 300) statusClass = 'status-success';
            else if (status >= 300 && status < 400) statusClass = 'status-redirect';
            else if (status >= 400 && status < 500) statusClass = 'status-client-error';
            else if (status >= 500) statusClass = 'status-server-error';
            else if (status === 'Error' || data.details.error) statusClass = 'status-client-error'; // Handle explicit errors
            stepCells[1].textContent = `${status} ${statusText}`;
            stepCells[1].classList.add(statusClass); // Apply color class
        } else {
            stepCells[1].textContent = '-'; // Placeholder if no status
            stepCells[1].classList.add('text-gray-500');
        }

        // Cell 2: Step Method (if network details exist)
        stepCells[2].textContent = data.details?.method || '-';
        stepCells[2].className = 'px-4 py-2 whitespace-nowrap text-xs text-gray-500';

        // Cell 3: Step Message / URL
        stepCells[3].textContent = data.message; // Display the primary step message
        stepCells[3].className = 'px-4 py-2 text-xs text-gray-600 italic whitespace-normal'; // Allow wrapping
        // Use tooltip to show the URL if available, otherwise just the message
        stepCells[3].title = data.details?.url || data.message;

        // Cell 4: Step Timestamp (frontend received time)
        stepCells[4].textContent = data.timestamp ? formatTimestamp(data.timestamp) : '-';
        stepCells[4].className = 'px-4 py-2 whitespace-nowrap text-xs text-gray-500';

        // Cell 5: Step Response Snippet / Error (if network details exist)
        const stepResponseContent = data.details?.error || data.details?.responseBodySnippet || (data.details ? '(No Body)' : '-');
        stepCells[5].textContent = stepResponseContent;
        stepCells[5].className = 'px-4 py-2 text-xs text-gray-500 truncate'; // Truncate long snippets
        stepCells[5].title = stepResponseContent; // Show full content on hover

        // --- Make Step Row Clickable (if details were stored) ---
        if (stepDetailsStore[data.uniqueStepId]) { // Check if details exist for this unique step ID
            stepRow.classList.add('clickable-step'); // Add class for styling/cursor
            stepRow.setAttribute('data-step-id', data.uniqueStepId); // Store unique ID for click handler
            stepRow.addEventListener('click', handleStepClick); // Attach click listener
            // Add a visual indicator (eye icon) to the message cell
            stepCells[3].innerHTML += ` <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 inline-block text-blue-500 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>`;
        }

        // --- Insert Step Row ---
        // Insert the new step row *after* the last existing row for this request ID
        // This ensures steps appear below the final row and other preceding steps.
        const allRelatedRows = resultsTableBody.querySelectorAll(`tr[data-request-id="${requestId}"]`);
        const lastRelatedRow = allRelatedRows[allRelatedRows.length - 1]; // Should be the final row or last step
        // Use insertAdjacentElement for precise placement
        lastRelatedRow.insertAdjacentElement('afterend', stepRow);

        // Hide the step row if its parent final row is currently collapsed
        if (finalRow && finalRow.getAttribute('data-expanded') === 'false') {
            stepRow.classList.add('hidden');
        }
        rowToModify = stepRow; // Set the row to scroll to

    }
    // --- Handle FINAL Result Row Update/Creation ---
    else { // type === 'result'
        // If it's a simple/medium bot result and the row doesn't exist, create it
        if (!finalRow) {
            finalRow = document.createElement('tr');
            finalRow.id = finalRowId;
            finalRow.setAttribute('data-request-id', requestId);
            finalRow.classList.add('result-row', 'final-row'); // Mark as final row
             // Create cells
             for (let i = 0; i < 6; i++) finalRow.appendChild(document.createElement('td'));
             resultsTableBody.appendChild(finalRow); // Append to table body
             // Add click listener for Simple/Medium final rows
             finalRow.addEventListener('click', () => showDetails(requestId, 'result'));
        }

        rowToModify = finalRow; // Set the row to scroll to
        const cells = Array.from(finalRow.cells); // Get all cells in the final row

        // --- Populate/Update Final Row Cells ---
        // Cell 0: Workflow Name / Request ID / Toggle
        cells[0].className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-700'; // Base style
        if (isComplex) {
            // If it's complex, ensure the toggle cell structure is present (done in ensurePlaceholderFinalRow)
            // Just update the text part if needed (e.g., if endpoint name wasn't available initially)
             const endpointName = data.url.split('/').pop() || `Workflow ${data.id}`;
             cells[0].firstChild.textContent = `${endpointName} `; // Update text node before chevron span
             // Click listener for toggling is added in ensurePlaceholderFinalRow
             // Click listener for showing details (on row, excluding toggle cell) is also added there
        } else {
            // For Simple/Medium, just show the request ID
            cells[0].textContent = requestId;
            cells[0].classList.remove('toggle-cell'); // Ensure no toggle style
        }

        // Cell 1: Final Status
        let statusClass = 'status-other'; // Default color
        if (typeof data.status === 'number') { // Check if status is a number
             if (data.status >= 200 && data.status < 300) statusClass = 'status-success';
             else if (data.status >= 300 && data.status < 400) statusClass = 'status-redirect';
             else if (data.status >= 400 && data.status < 500) statusClass = 'status-client-error';
             else if (data.status >= 500) statusClass = 'status-server-error';
        } else if (data.error || data.status === 'Error') { // Check for explicit error states
            statusClass = 'status-client-error';
        }
        cells[1].textContent = `${data.status} ${data.statusText || ''}`;
        cells[1].className = `px-4 py-2 whitespace-nowrap text-sm ${statusClass}`; // Apply status color

        // Cell 2: Final Method (or Workflow type)
        cells[2].textContent = data.method;
        cells[2].className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-500';

        // Cell 3: Final URL (Target Endpoint)
        cells[3].textContent = data.url;
        cells[3].className = 'px-4 py-2 text-sm text-gray-500 truncate'; // Truncate long URLs
        cells[3].title = data.url; // Show full URL on hover

        // Cell 4: Start Timestamp of the workflow
        cells[4].textContent = data.timestamp ? formatTimestamp(data.timestamp) : 'N/A';
        cells[4].className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-500';

        // Cell 5: Final Response Snippet / Error Message
        // Show error message if present, otherwise the response snippet
        const finalContent = data.error || data.responseDataSnippet || '(No response body)';
        cells[5].textContent = finalContent;
        cells[5].className = 'px-4 py-2 text-sm text-gray-500 truncate'; // Truncate
        cells[5].title = finalContent; // Show full content on hover
    }

    // --- Auto-Scrolling ---
    // Scroll the newly added/updated row into view
    if (rowToModify) {
        rowToModify.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    return rowToModify; // Return the affected row element
}


/**
 * Handles clicks on the toggle cell (first cell) of a final workflow row
 * to show/hide its associated step rows.
 * @param {Event} event - The click event.
 */
function handleToggleClick(event) {
    event.stopPropagation(); // Prevent the row's click listener (showDetails) from firing

    const toggleCell = event.currentTarget; // The cell that was clicked (td)
    const finalRow = toggleCell.closest('tr'); // The parent row (tr)
    if (!finalRow) return;

    const requestId = finalRow.getAttribute('data-request-id'); // Get the parent request ID
    const isExpanded = finalRow.getAttribute('data-expanded') === 'true'; // Check current state
    const chevron = toggleCell.querySelector('.chevron'); // Find the chevron icon

    // Find all step rows associated with this request ID
    const stepRows = resultsTableBody.querySelectorAll(`.step-row-for-${requestId}`);

    // Toggle the 'hidden' class on all associated step rows
    stepRows.forEach(stepRow => {
        stepRow.classList.toggle('hidden', isExpanded); // Hide if currently expanded, show if collapsed
    });

    // Update the state attribute and chevron rotation
    finalRow.setAttribute('data-expanded', !isExpanded); // Toggle the state
    chevron?.classList.toggle('collapsed', isExpanded); // Toggle chevron class
}

/**
 * Handles clicks on a step row that has associated network details.
 * @param {Event} event - The click event.
 */
function handleStepClick(event) {
    const stepRow = event.currentTarget; // The step row (tr) that was clicked
    // Retrieve the unique step ID stored in the data attribute
    const stepId = stepRow.dataset.stepId;
    if (stepId) {
        // Call showDetails, passing the unique step ID and specifying the type as 'step'
        showDetails(stepId, 'step');
    } else {
        // Should not happen if listener is added correctly, but good practice to check
        console.warn("Clicked step row missing data-step-id attribute.");
    }
}


/**
 * Collapses the step rows associated with a given final row.
 * Used when the final result arrives to initially hide steps.
 * @param {HTMLElement} finalRow - The final row element (TR).
 * @param {HTMLElement} toggleCell - The first cell (TD) containing the toggle.
 * @param {HTMLElement} chevron - The chevron span element within the toggle cell.
 * @param {string|number} requestId - The request ID.
 */
 function collapseSteps(finalRow, toggleCell, chevron, requestId) {
    // Find all step rows for this request
    const stepRows = resultsTableBody.querySelectorAll(`.step-row-for-${requestId}`);
    // Add 'hidden' class to each step row
    stepRows.forEach(stepRow => {
        stepRow.classList.add('hidden');
    });
    // Update the final row's state attribute and chevron to collapsed
    finalRow.setAttribute('data-expanded', 'false');
    chevron?.classList.add('collapsed');
}

/**
 * Formats a timestamp (milliseconds since epoch) into a readable time string.
 * @param {number} timestamp - The timestamp in milliseconds.
 * @returns {string} Formatted time string (e.g., "14:35:10.123") or 'N/A'.
 */
function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    try {
        // Format to locale time string with milliseconds
        return new Date(timestamp).toLocaleTimeString([], {
            hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3
        });
    } catch (e) {
        // Handle potential invalid date errors
        return 'Invalid Date';
    }
}

/**
 * Shows the detail modal, populating it with data for either a final result or a specific step.
 * @param {string|number} identifier - The result ID (number for final results) or unique step ID (string for steps).
 * @param {'result'|'step'} type - Specifies whether to show details for a 'result' or a 'step'.
 */
function showDetails(identifier, type = 'result') {
    let data; // Holds the raw data object (either from resultsStore or stepDetailsStore)
    let details; // Holds the object containing the actual network details (nested for steps)
    let titlePrefix; // Text for the modal title
    let reqHeadingText; // Text for the request section heading
    let resHeadingText; // Text for the response section heading

    // Retrieve the correct data based on the type
    if (type === 'result') {
        data = resultsStore[identifier]; // Get final result summary data
        if (!data) return console.error("Details not found for result ID:", identifier);
        // For final results, the main data object contains the relevant network details (of the last API call)
        details = data;
        titlePrefix = `Details for Request #${identifier}`;
        reqHeadingText = 'Request (Final API Call)';
        resHeadingText = 'Response (Final API Call)';
    } else { // type === 'step'
        data = stepDetailsStore[identifier]; // Get detailed step data using unique step ID
        if (!data) return console.error("Details not found for step ID:", identifier);
        // For steps, the network details are nested within the 'details' property
        details = data.details;
        if (!details) return console.warn("Step data found, but no network details present for step ID:", identifier);
        titlePrefix = `Details for Step: ${data.message}`; // Use step message in title
        reqHeadingText = 'Request (Step Network Call)';
        resHeadingText = 'Response (Step Network Call)';
    }

    // --- Populate Modal Elements ---
    modalTitle.textContent = titlePrefix;
    modalReqHeading.textContent = reqHeadingText; // Update request heading
    modalResHeading.textContent = resHeadingText; // Update response heading

    // Populate Request Details
    modalReqUrl.textContent = details.url || 'N/A';
    modalReqMethod.textContent = details.method || 'N/A';
    // Safely stringify headers/body, providing defaults
    modalReqHeaders.textContent = details.requestHeaders ? JSON.stringify(details.requestHeaders, null, 2) : '(Not captured/available)';

    let reqBodyText = '(Not captured/available)';
    if (details.requestBody !== null && details.requestBody !== undefined) {
        if (typeof details.requestBody === 'object') {
            reqBodyText = JSON.stringify(details.requestBody, null, 2);
        } else {
            // Attempt to convert buffer/other types to string
            try { reqBodyText = String(details.requestBody); } catch { reqBodyText = '(Cannot display body)'; }
        }
    }
    modalReqBody.textContent = reqBodyText;

    // Populate Response Details
    // Use the correct status field based on type ('responseStatus' for steps, 'status' for final results)
    const status = type === 'step' ? details.responseStatus : details.status;
    const statusText = type === 'step' ? details.responseStatusText : details.statusText;
    modalResStatus.textContent = status !== null && status !== undefined ? `${status} ${statusText || ''}` : 'N/A';

    modalResHeaders.textContent = details.responseHeaders ? JSON.stringify(details.responseHeaders, null, 2) : 'N/A';
    // Use the correct body snippet field based on type
    const bodySnippet = type === 'step' ? details.responseBodySnippet : details.responseDataSnippet;
    modalResBody.textContent = bodySnippet || '(No response body snippet captured)';

    // Show error if present (exists in both step details and final result structures)
    modalResError.textContent = details.error ? `Error: ${details.error}` : '';
    modalResError.classList.toggle('hidden', !details.error); // Hide/show error paragraph

    // --- Show Modal ---
    detailModal.classList.remove('hidden');
}


/**
 * Hides the detail modal.
 */
function hideModal() {
    detailModal.classList.add('hidden');
}

/**
 * Displays status messages to the user (info, success, error).
 * @param {string} message - The message to display.
 * @param {'info'|'success'|'error'} type - The type of message.
 */
function showStatus(message, type = 'info') {
    statusMessage.textContent = message;
    // Base classes + type-specific classes for styling
    statusMessage.className = 'mb-4 p-3 rounded-md'; // Reset classes first
    switch (type) {
        case 'success': statusMessage.classList.add('bg-green-50', 'text-green-700'); break;
        case 'error': statusMessage.classList.add('bg-red-50', 'text-red-700'); break;
        case 'info': default: statusMessage.classList.add('bg-blue-50', 'text-blue-700'); break;
    }
    statusMessage.classList.remove('hidden'); // Make visible
}

/**
 * Clears and hides the status message area.
 */
function hideStatus() {
    statusMessage.textContent = '';
    statusMessage.classList.add('hidden');
}
