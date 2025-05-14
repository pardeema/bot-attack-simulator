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
const modalReqHeading = document.getElementById('modal-req-heading');
const modalResHeading = document.getElementById('modal-res-heading');
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
// const cookieFieldContainer = document.getElementById('cookie-field-container'); // Old container, remove/replace
const simpleBotOptionsContainer = document.getElementById('simple-bot-options-container');
const useRealUserAgentsCheckbox = document.getElementById('useRealUserAgents');
const simpleBotCookiesTextarea = document.getElementById('simpleBotCookies');

const configToggleButton = document.getElementById('config-toggle-button');
const configContainer = document.getElementById('config-container');
const mainHeader = document.getElementById('main-header');

// --- State Variables ---
let resultsTableBody = null;
let eventSource = null;
let resultsStore = {};
let stepDetailsStore = {};
let stepCounters = {};
let currentConfig = {};

// --- Event Listeners ---
form.addEventListener('submit', handleFormSubmit);
stopButton.addEventListener('click', handleStopClick);
modalCloseButton.addEventListener('click', hideModal);
detailModal.addEventListener('click', (event) => { if (event.target === detailModal) hideModal(); });
botTypeSelect.addEventListener('change', toggleSimpleBotOptions); // Updated function name
configToggleButton.addEventListener('click', handleConfigToggle);

// --- Initial Setup ---
toggleSimpleBotOptions(); // Set initial visibility of Simple Bot options

// --- Functions ---

function collapseConfigArea() {
    const icon = configToggleButton.querySelector('svg');
    if (!configContainer.classList.contains('collapsed')) {
        configContainer.style.maxHeight = configContainer.scrollHeight + "px";
        requestAnimationFrame(() => {
            configContainer.classList.add('collapsed');
            configContainer.style.maxHeight = '0px';
            mainHeader.style.paddingBottom = '0';
            icon?.classList.add('collapsed');
        });
    }
}

function expandConfigArea() {
    const icon = configToggleButton.querySelector('svg');
     if (configContainer.classList.contains('collapsed')) {
        configContainer.classList.remove('collapsed');
        configContainer.style.maxHeight = configContainer.scrollHeight + "px";
        mainHeader.style.paddingBottom = '1rem';
        icon?.classList.remove('collapsed');
        setTimeout(() => {
             if (!configContainer.classList.contains('collapsed')) {
                 configContainer.style.maxHeight = null;
             }
        }, 300);
     }
}

function handleConfigToggle() {
    const isCollapsed = configContainer.classList.contains('collapsed');
    if (isCollapsed) {
        expandConfigArea();
    } else {
        collapseConfigArea();
    }
}

/**
 * Shows or hides the additional options for the "Simple" bot type.
 */
function toggleSimpleBotOptions() {
    // Show the container if "Simple" bot type is selected, hide otherwise.
    const showOptions = botTypeSelect.value === 'Simple';
    simpleBotOptionsContainer.classList.toggle('hidden', !showOptions);

    // If hiding, you might want to clear the simple bot specific fields
    if (!showOptions) {
        useRealUserAgentsCheckbox.checked = false;
        simpleBotCookiesTextarea.value = '';
    }
}


/**
 * Handles the form submission to launch an attack simulation.
 * @param {Event} event - The form submission event.
 */
async function handleFormSubmit(event) {
     event.preventDefault();
     closeEventSource();
     resultsStore = {};
     stepDetailsStore = {};
     stepCounters = {};

     launchButton.disabled = true;
     launchButton.classList.add('hidden');
     stopButton.disabled = false;
     stopButton.classList.remove('hidden');
     stopButton.textContent = 'Stop Attack';

     collapseConfigArea();
     showStatus('Initiating attack simulation...', 'info');
     clearResultsTable();

     const formData = new FormData(form);
     currentConfig = {
         targetUrl: formData.get('targetUrl'),
         endpoint: formData.get('endpoint'),
         numRequests: parseInt(formData.get('numRequests'), 10),
         botType: formData.get('botType'),
         // cookieString: formData.get('cookieString') || '' // This was for old Medium bot
     };

     // Add Simple Bot specific options if that type is selected
     if (currentConfig.botType === 'Simple') {
         currentConfig.useRealUserAgents = formData.get('useRealUserAgents') === 'on'; // Checkbox value
         currentConfig.simpleBotCookies = formData.get('simpleBotCookies') || '';
     }
     // For "Medium" (Browser Emulation), no extra specific fields from here for now.
     // cookieString from original form is not explicitly used by complexBot.js logic.

     try {
         const launchResponse = await fetch('/launch-attack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentConfig),
         });
         const launchResult = await launchResponse.json();
         if (launchResponse.status !== 202) {
             resetButtonsOnError();
             throw new Error(launchResult.message || `Unexpected response status: ${launchResponse.status}`);
         }
         showStatus('Attack running... Waiting for results stream.', 'info');
         connectEventSource();
     } catch (error) {
         console.error('Error during attack launch:', error);
         showStatus(`Error: ${error.message}`, 'error');
         resetButtonsOnError();
     }
 }

async function handleStopClick() {
     console.log("Stop button clicked");
     stopButton.disabled = true;
     stopButton.textContent = 'Stopping...';
     showStatus('Stop request sent...', 'info');

     try {
         const response = await fetch('/stop-attack', { method: 'POST' });
         if (!response.ok) {
             const errorResult = await response.json();
             stopButton.disabled = false;
             stopButton.textContent = 'Stop Attack';
             throw new Error(errorResult.message || `HTTP error! Status: ${response.status}`);
         }
         console.log("Stop request acknowledged by server.");
         // UI reset will happen on 'done' event from server
     } catch (error) {
         console.error('Error sending stop request:', error);
         showStatus(`Error sending stop request: ${error.message}`, 'error');
         stopButton.disabled = false;
         stopButton.textContent = 'Stop Attack';
     }
 }

function resetButtonsOnError() {
    launchButton.disabled = false;
    launchButton.classList.remove('hidden');
    stopButton.disabled = true;
    stopButton.classList.add('hidden');
    stopButton.textContent = 'Stop Attack';
    expandConfigArea();
}

function resetButtonsOnFinish() {
     launchButton.disabled = false;
     launchButton.classList.remove('hidden');
     stopButton.disabled = true;
     stopButton.classList.add('hidden');
     stopButton.textContent = 'Stop Attack';
     expandConfigArea();
}

function connectEventSource() {
     if (eventSource) eventSource.close();
     eventSource = new EventSource('/attack-stream');

     eventSource.addEventListener('result', handleResultEvent);
     eventSource.addEventListener('step', handleStepEvent);
     eventSource.addEventListener('done', handleDoneEvent);
     eventSource.addEventListener('error', handleErrorEvent); // Custom error from simulation
     eventSource.onerror = handleGenericErrorEvent; // SSE connection error

     console.log("Connecting to SSE stream...");
 }

function handleResultEvent(event) {
    try {
        const resultData = JSON.parse(event.data);
        resultsStore[resultData.id] = resultData;
        const finalRow = createOrUpdateResultRow(resultData, 'result');

        const isComplexWorkflow = resultData.method?.startsWith('WORKFLOW');
        if (finalRow && isComplexWorkflow) {
            const toggleCell = finalRow.cells[0];
            const chevron = toggleCell?.querySelector('.chevron');
            collapseSteps(finalRow, toggleCell, chevron, resultData.id);
        }
    } catch (e) {
        console.error("Failed to parse result data:", event.data, e);
    }
}

function handleStepEvent(event) {
    try {
        const stepData = JSON.parse(event.data);
        const requestId = stepData.id;

        stepCounters[requestId] = (stepCounters[requestId] || 0) + 1;
        const uniqueStepId = `step-${requestId}-${stepCounters[requestId]}`;
        stepData.uniqueStepId = uniqueStepId;

        if (stepData.details) {
            stepDetailsStore[uniqueStepId] = stepData;
            console.log(`Stored details for step ${uniqueStepId}`);
        }

        stepData.timestamp = Date.now();
        createOrUpdateResultRow(stepData, 'step');
    } catch (e) {
        console.error("Failed to parse step data:", event.data, e);
    }
}


function handleDoneEvent(event) {
    console.log('Received done event:', event.data);
    const doneData = JSON.parse(event.data);
    showStatus(doneData.message || 'Simulation complete or stopped.', 'success');
    closeEventSource();
    resetButtonsOnFinish();
}

function handleErrorEvent(event) { // Custom error from simulation logic
     try {
        const errorData = JSON.parse(event.data);
        console.error('Received simulation error event:', errorData);
        showStatus(`Simulation Error: ${errorData.message || 'Unknown error from simulation.'}`, 'error');
     } catch (e) {
         console.error("Failed to parse simulation error event data:", event.data, e);
         showStatus('Received an unparseable error from the server simulation.', 'error');
     }
     // Consider if simulation is over on this type of error
     // closeEventSource(); // uncomment if these errors are terminal for the stream
     // resetButtonsOnFinish(); // uncomment if UI should reset
}

function handleGenericErrorEvent(err) { // SSE connection error
    console.error('EventSource failed:', err);
    if (eventSource && eventSource.readyState !== EventSource.CLOSED) {
         showStatus('Error connecting to results stream. Server might be down or restarting. Please try again.', 'error');
    }
    closeEventSource();
    resetButtonsOnError(); // Reset UI as if launch failed or connection was lost
}

function closeEventSource() {
    if (eventSource) {
        eventSource.close();
        eventSource = null;
        console.log("SSE connection closed.");
    }
}

function clearResultsTable() {
    resultsList.innerHTML = '';
    stepCounters = {};
    stepDetailsStore = {};
    resultsStore = {};

    const table = document.createElement('table');
    table.className = 'min-w-full divide-y divide-gray-200 border border-gray-200';
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
    resultsTableBody = table.querySelector('tbody');
}

function ensurePlaceholderFinalRow(requestId) {
    if (!resultsTableBody) return null;

    const finalRowId = `result-${requestId}`;
    let finalRow = resultsTableBody.querySelector(`#${finalRowId}`);

    if (!finalRow) {
        finalRow = document.createElement('tr');
        finalRow.id = finalRowId;
        finalRow.setAttribute('data-request-id', requestId);
        finalRow.classList.add('result-row', 'final-row', 'final-workflow-row');
        finalRow.setAttribute('data-expanded', 'true');

        for (let i = 0; i < 6; i++) {
            const cell = document.createElement('td');
            cell.className = 'px-4 py-2 text-sm text-gray-500';
            cell.textContent = '...';
            finalRow.appendChild(cell);
        }

        const endpointName = currentConfig.endpoint?.split('/').pop() || `Workflow ${requestId}`;
        const firstCell = finalRow.cells[0];
        firstCell.className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-700 toggle-cell';
        // Ensure textNode is created for endpointName, then append chevron
        firstCell.appendChild(document.createTextNode(endpointName + " "));
        const chevronSpan = document.createElement('span');
        chevronSpan.className = 'chevron';
        firstCell.appendChild(chevronSpan);

        firstCell.addEventListener('click', handleToggleClick);

        finalRow.addEventListener('click', (event) => {
            if (!firstCell.contains(event.target)) {
                showDetails(requestId, 'result');
            }
        });

        let insertBeforeElement = resultsTableBody.querySelector(`tr[data-request-id="${requestId + 1}"]`);
        if (insertBeforeElement) {
            resultsTableBody.insertBefore(finalRow, insertBeforeElement);
        } else {
            resultsTableBody.appendChild(finalRow);
        }
    }
    return finalRow;
}


function createOrUpdateResultRow(data, type) {
    if (!resultsTableBody) return null;

    const requestId = data.id;
    const finalRowId = `result-${requestId}`;
    let finalRow = resultsTableBody.querySelector(`#${finalRowId}`);
    let rowToModify = null;

    const isComplex = data.method?.startsWith('WORKFLOW') || type === 'step';
    if (isComplex && !finalRow) {
        finalRow = ensurePlaceholderFinalRow(requestId);
        if (!finalRow) return null;
    }

    if (type === 'step') {
        const stepRow = document.createElement('tr');
        stepRow.id = data.uniqueStepId;
        stepRow.setAttribute('data-request-id', requestId);
        stepRow.classList.add('result-row', 'step-row', `step-row-for-${requestId}`);

        const stepCells = [];
        for (let i = 0; i < 6; i++) {
            const cell = document.createElement('td');
            cell.className = 'px-4 py-2 text-xs';
            stepRow.appendChild(cell);
            stepCells.push(cell);
        }

        stepCells[0].textContent = `└─ Step`;
        stepCells[0].className = 'px-4 py-2 whitespace-nowrap text-xs pl-6 text-gray-500';

        stepCells[1].className = 'px-4 py-2 whitespace-nowrap text-xs';
        if (data.details?.responseStatus !== undefined && data.details?.responseStatus !== null) {
            const status = data.details.responseStatus;
            const statusText = data.details.responseStatusText || '';
            let statusClass = 'status-other';
            if (status >= 200 && status < 300) statusClass = 'status-success';
            else if (status >= 300 && status < 400) statusClass = 'status-redirect';
            else if (status >= 400 && status < 500) statusClass = 'status-client-error';
            else if (status >= 500) statusClass = 'status-server-error';
            else if (status === 'Error' || data.details.error) statusClass = 'status-client-error';
            stepCells[1].textContent = `${status} ${statusText}`;
            stepCells[1].classList.add(statusClass);
        } else {
            stepCells[1].textContent = '-';
            stepCells[1].classList.add('text-gray-500');
        }

        stepCells[2].textContent = data.details?.method || '-';
        stepCells[2].className = 'px-4 py-2 whitespace-nowrap text-xs text-gray-500';

        stepCells[3].textContent = data.message;
        stepCells[3].className = 'px-4 py-2 text-xs text-gray-600 italic whitespace-normal';
        stepCells[3].title = data.details?.url || data.message;

        stepCells[4].textContent = data.timestamp ? formatTimestamp(data.timestamp) : '-';
        stepCells[4].className = 'px-4 py-2 whitespace-nowrap text-xs text-gray-500';

        const stepResponseContent = data.details?.error || data.details?.responseBodySnippet || (data.details ? '(No Body)' : '-');
        stepCells[5].textContent = stepResponseContent;
        stepCells[5].className = 'px-4 py-2 text-xs text-gray-500 truncate';
        stepCells[5].title = stepResponseContent;

        if (stepDetailsStore[data.uniqueStepId]) {
            stepRow.classList.add('clickable-step');
            stepRow.setAttribute('data-step-id', data.uniqueStepId);
            stepRow.addEventListener('click', handleStepClick);
            stepCells[3].innerHTML += ` <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 inline-block text-blue-500 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>`;
        }

        const allRelatedRows = resultsTableBody.querySelectorAll(`tr[data-request-id="${requestId}"]`);
        const lastRelatedRow = allRelatedRows[allRelatedRows.length - 1];
        lastRelatedRow.insertAdjacentElement('afterend', stepRow);

        if (finalRow && finalRow.getAttribute('data-expanded') === 'false') {
            stepRow.classList.add('hidden');
        }
        rowToModify = stepRow;

    } else { // type === 'result'
        if (!finalRow) {
            finalRow = document.createElement('tr');
            finalRow.id = finalRowId;
            finalRow.setAttribute('data-request-id', requestId);
            finalRow.classList.add('result-row', 'final-row');
             for (let i = 0; i < 6; i++) finalRow.appendChild(document.createElement('td'));
             resultsTableBody.appendChild(finalRow);
             finalRow.addEventListener('click', () => showDetails(requestId, 'result'));
        }

        rowToModify = finalRow;
        const cells = Array.from(finalRow.cells);

        cells[0].className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-700';
        if (isComplex) {
             const endpointName = data.url.split('/').pop() || `Workflow ${data.id}`;
             // Ensure only one text node for the name and one span for chevron
             cells[0].innerHTML = ''; // Clear previous content
             cells[0].appendChild(document.createTextNode(endpointName + " "));
             const chevronSpan = document.createElement('span');
             chevronSpan.className = 'chevron';
             if (finalRow.getAttribute('data-expanded') === 'false') {
                chevronSpan.classList.add('collapsed');
             }
             cells[0].appendChild(chevronSpan);
             cells[0].classList.add('toggle-cell');
             // Toggle click listener is added in ensurePlaceholderFinalRow
        } else {
            cells[0].textContent = requestId;
            cells[0].classList.remove('toggle-cell');
            cells[0].innerHTML = requestId; // Remove chevron if it was there
        }

        let statusClass = 'status-other';
        if (typeof data.status === 'number') {
             if (data.status >= 200 && data.status < 300) statusClass = 'status-success';
             else if (data.status >= 300 && data.status < 400) statusClass = 'status-redirect';
             else if (data.status >= 400 && data.status < 500) statusClass = 'status-client-error';
             else if (data.status >= 500) statusClass = 'status-server-error';
        } else if (data.error || data.status === 'Error') {
            statusClass = 'status-client-error';
        }
        cells[1].textContent = `${data.status} ${data.statusText || ''}`;
        cells[1].className = `px-4 py-2 whitespace-nowrap text-sm ${statusClass}`;

        cells[2].textContent = data.method;
        cells[2].className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-500';

        cells[3].textContent = data.url;
        cells[3].className = 'px-4 py-2 text-sm text-gray-500 truncate';
        cells[3].title = data.url;

        cells[4].textContent = data.timestamp ? formatTimestamp(data.timestamp) : 'N/A';
        cells[4].className = 'px-4 py-2 whitespace-nowrap text-sm text-gray-500';

        const finalContent = data.error || data.responseDataSnippet || '(No response body)';
        cells[5].textContent = finalContent;
        cells[5].className = 'px-4 py-2 text-sm text-gray-500 truncate';
        cells[5].title = finalContent;
    }

    if (rowToModify) {
        rowToModify.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    return rowToModify;
}


function handleToggleClick(event) {
    event.stopPropagation();

    const toggleCell = event.currentTarget;
    const finalRow = toggleCell.closest('tr');
    if (!finalRow) return;

    const requestId = finalRow.getAttribute('data-request-id');
    const isExpanded = finalRow.getAttribute('data-expanded') === 'true';
    const chevron = toggleCell.querySelector('.chevron');

    const stepRows = resultsTableBody.querySelectorAll(`.step-row-for-${requestId}`);
    stepRows.forEach(stepRow => {
        stepRow.classList.toggle('hidden', isExpanded);
    });

    finalRow.setAttribute('data-expanded', !isExpanded);
    chevron?.classList.toggle('collapsed', isExpanded);
}

function handleStepClick(event) {
    const stepRow = event.currentTarget;
    const stepId = stepRow.dataset.stepId;
    if (stepId) {
        showDetails(stepId, 'step');
    } else {
        console.warn("Clicked step row missing data-step-id attribute.");
    }
}


function collapseSteps(finalRow, toggleCell, chevron, requestId) {
    const stepRows = resultsTableBody.querySelectorAll(`.step-row-for-${requestId}`);
    stepRows.forEach(stepRow => {
        stepRow.classList.add('hidden');
    });
    finalRow.setAttribute('data-expanded', 'false');
    chevron?.classList.add('collapsed');
}

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

function showDetails(identifier, type = 'result') {
    let data;
    let details;
    let titlePrefix;
    let reqHeadingText;
    let resHeadingText;

    if (type === 'result') {
        data = resultsStore[identifier];
        if (!data) return console.error("Details not found for result ID:", identifier);
        details = data; // For final results, the main data object has the net details
        titlePrefix = `Details for Request #${identifier}`;
        reqHeadingText = 'Request (Final API Call or Simple/Medium Bot)';
        resHeadingText = 'Response (Final API Call or Simple/Medium Bot)';
    } else { // type === 'step'
        data = stepDetailsStore[identifier];
        if (!data) return console.error("Details not found for step ID:", identifier);
        details = data.details; // Network details are nested for steps
        if (!details) return console.warn("Step data found, but no network details for step ID:", identifier);
        titlePrefix = `Details for Step: ${data.message}`;
        reqHeadingText = 'Request (Step Network Call)';
        resHeadingText = 'Response (Step Network Call)';
    }

    modalTitle.textContent = titlePrefix;
    modalReqHeading.textContent = reqHeadingText;
    modalResHeading.textContent = resHeadingText;

    modalReqUrl.textContent = details.url || 'N/A';
    modalReqMethod.textContent = details.method || 'N/A';
    modalReqHeaders.textContent = details.requestHeaders ? JSON.stringify(details.requestHeaders, null, 2) : '(Not captured/available)';

    let reqBodyText = '(Not captured/available)';
    if (details.requestBody !== null && details.requestBody !== undefined) {
        if (typeof details.requestBody === 'object') {
            reqBodyText = JSON.stringify(details.requestBody, null, 2);
        } else {
            try { reqBodyText = String(details.requestBody); } catch { reqBodyText = '(Cannot display body)'; }
        }
    }
    modalReqBody.textContent = reqBodyText;

    const status = type === 'step' ? details.responseStatus : details.status;
    const statusText = type === 'step' ? details.responseStatusText : details.statusText;
    modalResStatus.textContent = status !== null && status !== undefined ? `${status} ${statusText || ''}` : 'N/A';

    modalResHeaders.textContent = details.responseHeaders ? JSON.stringify(details.responseHeaders, null, 2) : 'N/A';
    const bodySnippet = type === 'step' ? details.responseBodySnippet : details.responseDataSnippet;
    modalResBody.textContent = bodySnippet || '(No response body snippet captured)';

    modalResError.textContent = details.error ? `Error: ${details.error}` : '';
    modalResError.classList.toggle('hidden', !details.error);

    detailModal.classList.remove('hidden');
}


function hideModal() {
    detailModal.classList.add('hidden');
}

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

function hideStatus() {
    statusMessage.textContent = '';
    statusMessage.classList.add('hidden');
}
