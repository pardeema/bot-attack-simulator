// src/complexBot.js
const { chromium } = require('playwright');
const crypto = require('crypto');

// --- Selectors ---
// Ensure these selectors match your target application
const LOGIN_PAGE_URL_SUFFIX = '/login';
const USERNAME_SELECTOR = '#email';
const PASSWORD_SELECTOR = '#password';
const SUBMIT_BUTTON_SELECTOR = 'button[type="submit"]';
const LOGIN_API_ENDPOINT_PATH = '/api/auth/login'; // Example API path
const ADD_TO_CART_SELECTOR = '.add-to-cart-btn'; // Example selector
const VIEW_CART_SELECTOR = 'a[href="/cart"]'; // Example selector
const PROCEED_TO_CHECKOUT_SELECTOR = 'button:has-text("Proceed to Checkout")'; // Example selector
const CHECKOUT_FORM_SELECTORS = { // Example selectors
    name: '#fullName', email: '#email', address: '#address', city: '#city',
    state: '#state', zipCode: '#zipCode', country: '#country',
};
const FINAL_SUBMIT_SELECTOR = 'button:has-text("Place Order")'; // Example selector
const CHECKOUT_API_ENDPOINT_PATH = '/api/checkout'; // Example API path
// --- End Selectors ---

function generateRandomPassword() { return crypto.randomBytes(8).toString('hex'); }

/**
 * Emits a step event, potentially including network details.
 * @param {EventEmitter} emitter - The event emitter.
 * @param {number} id - The request ID (identifies the overall workflow run).
 * @param {string} message - The step description message.
 * @param {object|null} details - Optional network details object containing request/response info.
 */
function emitStep(emitter, id, message, details = null) {
    console.log(`[ComplexBot] Req ${id}: ${message}`);
    // Emit the step data including the optional details payload
    emitter.emit('step', { id, message, details });
}

/**
 * Extracts relevant details from a Playwright Request object.
 * Handles potential errors during post data parsing.
 * @param {import('playwright').Request} request - The Playwright request object.
 * @returns {Promise<object>} - An object containing extracted request details.
 */
async function getRequestDetails(request) {
    if (!request) return {}; // Return empty object if no request provided

    let requestBody = null;
    try {
        // Try parsing as JSON first
        requestBody = request.postDataJSON();
    } catch {
        // Fallback to plain text/buffer if not JSON
        requestBody = request.postData();
    }

    return {
        url: request.url(),
        method: request.method(),
        // Use allHeaders() to get a comprehensive header object
        requestHeaders: await request.allHeaders(),
        requestBody: requestBody, // Contains parsed JSON or raw buffer/string
    };
}

/**
 * Extracts relevant details from a Playwright Response object.
 * Handles potential errors during body reading.
 * @param {import('playwright').Response} response - The Playwright response object.
 * @returns {Promise<object>} - An object containing extracted response details.
 */
async function getResponseDetails(response) {
    // Handle cases where the response might be null (e.g., request failed before response)
    if (!response) return { responseStatus: null, responseHeaders: null, responseBodySnippet: null, error: 'No response object provided' };

    let bodySnippet = null;
    let error = null; // To capture errors specifically during body reading

    try {
        // Attempt to read the response body
        const buffer = await response.body();
        // Convert buffer to string and take a snippet
        bodySnippet = buffer.toString('utf-8').substring(0, 150); // Limit snippet length
    } catch (e) {
        // Log a warning if body reading fails (common for non-HTML/JSON responses or redirects)
        console.warn(`[ComplexBot] Warn: Could not get response body for ${response.url()}: ${e.message}`);
        error = `Could not read response body: ${e.message.substring(0, 100)}`; // Store snippet of error
        bodySnippet = '(Error reading body)';
    }

    return {
        responseStatus: response.status(),
        responseStatusText: response.statusText(),
        // Use allHeaders() for complete response headers
        responseHeaders: await response.allHeaders(),
        responseBodySnippet: bodySnippet,
        error: error // Include error if body reading specifically failed
    };
}


/**
 * Runs complex bot workflows (Login or Checkout) sequentially using Playwright.
 * Captures detailed network steps (especially for /149* and API calls).
 * Emits 'step' events for progress and 'result' event for final outcome.
 * Checks for a stop signal before each iteration.
 * @param {object} config - Configuration object.
 * @param {string} config.targetUrl - Base URL of the target site.
 * @param {string} config.endpoint - Target API endpoint path (determines workflow).
 * @param {number} config.numRequests - Number of workflow iterations to run.
 * @param {EventEmitter} config.eventEmitter - Emitter for sending progress/results.
 * @param {string|null} config.cookieString - Optional cookie string (not used by Playwright directly here, but kept for consistency).
 * @param {function} config.shouldStop - Function returning true if the simulation should stop.
 * @returns {Promise<void>}
 */
async function runComplexBots({ targetUrl, endpoint, numRequests, eventEmitter, cookieString, shouldStop }) {
    return new Promise(async (resolve) => {
        const isLogin = endpoint.includes('login');
        const isCheckout = endpoint.includes('checkout');

        // Validate if the endpoint corresponds to a known workflow
        if (!isLogin && !isCheckout) {
            console.warn(`[ComplexBot] Endpoint "${endpoint}" does not correspond to a known complex workflow.`);
            eventEmitter.emit('error', { message: `Complex bot workflow for "${endpoint}" not implemented.` });
            eventEmitter.emit('done'); // Signal completion even if no work done
            return resolve();
        }

        const knownPassword = "K4sad@!"; // Example known password for testing detection
        // Determine if/when to use the known password during login attempts
        const knownPasswordRequestIndex = isLogin ? (Math.floor(Math.random() * numRequests) + 1) : -1;
        console.log(`[ComplexBot] Starting ${numRequests} SEQUENTIAL Playwright ${isLogin ? 'Login' : 'Checkout'} workflows...`);
        if (isLogin) console.log(`[ComplexBot] Request #${knownPasswordRequestIndex} will use the known password.`);


        // Main loop for running multiple workflow instances
        for (let i = 1; i <= numRequests; i++) {
             // *** Check stop signal BEFORE starting the iteration ***
            if (shouldStop()) {
                console.log(`[ComplexBot] Stop requested at iteration ${i}. Exiting loop.`);
                emitStep(eventEmitter, i, 'Stop requested by user.'); // Inform UI
                break; // Exit the loop immediately
            }

            const startTime = Date.now(); // Record start time for this iteration
            let browser = null; // Browser instance for this iteration
            let finalApiRequestDetails = {}; // Store details of the main API call for the final 'result' event
            let finalApiResponseDetails = {}; // Store response details of the main API call

            // Initialize the final result structure for this iteration
            let resultData = {
                 id: i, // Iteration ID
                 url: targetUrl + endpoint, // The target API endpoint for the workflow
                 method: `WORKFLOW (${isLogin ? 'Login' : 'Checkout'})`, // Indicate workflow type
                 status: null, // Will be updated with the final API call's status
                 statusText: '',
                 timestamp: startTime, // Start time of the workflow
                 // These fields will be populated from the final API call details
                 requestBody: null,
                 requestHeaders: null,
                 responseHeaders: null,
                 responseDataSnippet: null,
                 error: null, // Captures any overall workflow error
            };

            try {
                emitStep(eventEmitter, i, 'Launching browser...');
                // Launch a new browser instance for each iteration
                browser = await chromium.launch({ headless: true }); // Run headless
                const context = await browser.newContext();
                const page = await context.newPage();

                // --- Enhanced Network Listener Setup ---
                const pendingRequests = new Map();

                page.on('request', request => {
                    const url = request.url();
                    const urlPath = new URL(url).pathname;
                    if (urlPath.startsWith('/149')) {
                        pendingRequests.set(url, { request });
                        console.log(`[ComplexBot] Req ${i}: Detected Protection JS request (pending response): ${url}`);
                    }
                });

                page.on('response', async response => {
                    const request = response.request();
                    const url = response.url();
                    const urlPath = new URL(url).pathname;
                    if (urlPath.startsWith('/149') && pendingRequests.has(url)) {
                        const { request: originalRequest } = pendingRequests.get(url);
                        pendingRequests.delete(url);
                        const reqDetails = await getRequestDetails(originalRequest);
                        const resDetails = await getResponseDetails(response);
                        const filename = urlPath.split('/').pop();
                        emitStep(eventEmitter, i, `JS Exec: /149.../${filename}`, { ...reqDetails, ...resDetails });
                        console.log(`[ComplexBot] Req ${i}: Emitted step details for ${url}`);
                    }
                });
                // --- End Network Listener Setup ---


                // === LOGIN WORKFLOW LOGIC ===
                if (isLogin) {
                     const loginPageUrl = targetUrl + LOGIN_PAGE_URL_SUFFIX;
                     const password = (i === knownPasswordRequestIndex) ? knownPassword : generateRandomPassword();
                     const email = "user@example.com";

                     emitStep(eventEmitter, i, `Navigating to ${loginPageUrl}...`);
                     await page.goto(loginPageUrl, { waitUntil: 'networkidle', timeout: 20000 });

                     emitStep(eventEmitter, i, 'Filling login form...');
                     await page.locator(USERNAME_SELECTOR).fill(email);
                     await page.locator(PASSWORD_SELECTOR).fill(password);

                     const apiResponsePromise = page.waitForResponse(
                             response => response.url().includes(LOGIN_API_ENDPOINT_PATH) && response.request().method() === 'POST',
                             { timeout: 15000 }
                         );

                     emitStep(eventEmitter, i, 'Clicking submit...');
                     await page.locator(SUBMIT_BUTTON_SELECTOR).click();

                     emitStep(eventEmitter, i, `Waiting for API response (${LOGIN_API_ENDPOINT_PATH})...`);
                     const apiResponse = await apiResponsePromise;
                     const apiRequest = apiResponse.request();

                     // Capture details for the main API call
                     finalApiRequestDetails = await getRequestDetails(apiRequest);
                     finalApiResponseDetails = await getResponseDetails(apiResponse);

                     // Emit a detailed step for this API call (with potentially unobfuscated password)
                     emitStep(eventEmitter, i, `API Call: ${LOGIN_API_ENDPOINT_PATH}`, {
                         ...finalApiRequestDetails,
                         ...finalApiResponseDetails
                     });

                     resultData.status = finalApiResponseDetails.responseStatus;
                     resultData.statusText = finalApiResponseDetails.responseStatusText;
                }
                // === CHECKOUT WORKFLOW LOGIC ===
                else if (isCheckout) {
                     // Simulate checkout flow
                     emitStep(eventEmitter, i, `Navigating to Home: ${targetUrl}...`);
                     await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 20000 });

                     emitStep(eventEmitter, i, `Clicking first '${ADD_TO_CART_SELECTOR}' button...`);
                     await page.locator(ADD_TO_CART_SELECTOR).first().click();
                     await page.waitForTimeout(500);

                     emitStep(eventEmitter, i, `Navigating to Cart via '${VIEW_CART_SELECTOR}'...`);
                     await page.locator(VIEW_CART_SELECTOR).click();
                     await page.waitForURL('**/cart', { timeout: 10000 });

                     emitStep(eventEmitter, i, `Clicking '${PROCEED_TO_CHECKOUT_SELECTOR}'...`);
                     await page.locator(PROCEED_TO_CHECKOUT_SELECTOR).click();
                     await page.waitForURL('**/checkout', { timeout: 10000 });

                     emitStep(eventEmitter, i, 'Filling checkout form...');
                     await page.waitForSelector(CHECKOUT_FORM_SELECTORS.name, { state: 'visible', timeout: 15000 });
                     await page.locator(CHECKOUT_FORM_SELECTORS.name).fill(`Bot User ${i}`);
                     await page.locator(CHECKOUT_FORM_SELECTORS.email).fill(`bot${i}@test.com`);
                     await page.locator(CHECKOUT_FORM_SELECTORS.address).fill(`${i} Automation Lane`);
                     await page.locator(CHECKOUT_FORM_SELECTORS.city).fill('BotCity');
                     await page.locator(CHECKOUT_FORM_SELECTORS.state).fill('BT');
                     await page.locator(CHECKOUT_FORM_SELECTORS.zipCode).fill('98765');
                     // if (CHECKOUT_FORM_SELECTORS.country) { await page.locator(CHECKOUT_FORM_SELECTORS.country).fill('Botland'); }

                     const apiResponsePromise = page.waitForResponse(
                             response => response.url().includes(CHECKOUT_API_ENDPOINT_PATH) && response.request().method() === 'POST',
                             { timeout: 20000 }
                         );

                     emitStep(eventEmitter, i, `Clicking final submit '${FINAL_SUBMIT_SELECTOR}'...`);
                     await page.locator(FINAL_SUBMIT_SELECTOR).click();

                     emitStep(eventEmitter, i, `Waiting for API response (${CHECKOUT_API_ENDPOINT_PATH})...`);
                     const apiResponse = await apiResponsePromise;
                     const apiRequest = apiResponse.request();

                     // Capture details for the main API call
                     finalApiRequestDetails = await getRequestDetails(apiRequest);
                     finalApiResponseDetails = await getResponseDetails(apiResponse);

                     // Emit a detailed step for this API call
                     emitStep(eventEmitter, i, `API Call: ${CHECKOUT_API_ENDPOINT_PATH}`, {
                         ...finalApiRequestDetails,
                         ...finalApiResponseDetails
                     });

                     resultData.status = finalApiResponseDetails.responseStatus;
                     resultData.statusText = finalApiResponseDetails.responseStatusText;
                }

                emitStep(eventEmitter, i, `Workflow completed. Final API Status: ${resultData.status}`);

            } catch (err) {
                 console.error(`[ComplexBot] Req ${i}: Workflow failed - ${err.message}`);
                 resultData.error = err.message.substring(0, 200);
                 resultData.status = 'Error';
                 resultData.statusText = 'Workflow Failed';
                 emitStep(eventEmitter, i, `Error: ${resultData.error}`);
            } finally {
                if (browser) {
                    emitStep(eventEmitter, i, 'Closing browser...');
                    await browser.close();
                    emitStep(eventEmitter, i, 'Browser closed.');
                }
            }

            // --- Populate final resultData with details from the main API call ---
            resultData.requestHeaders = finalApiRequestDetails.requestHeaders;
            resultData.responseHeaders = finalApiResponseDetails.responseHeaders;
            resultData.responseDataSnippet = finalApiResponseDetails.responseBodySnippet;

            // *** OBFUSCATION LOGIC RE-ADDED HERE ***
            // Default to the captured request body
            let displayRequestBody = finalApiRequestDetails.requestBody;
            // Check if it was a login attempt using the known password
            if (isLogin && i === knownPasswordRequestIndex && displayRequestBody && typeof displayRequestBody === 'object') {
                console.log(`[ComplexBot] Req ${i}: Obfuscating known password for final result event.`);
                // Create a deep copy to avoid modifying the object used in the detailed step event
                displayRequestBody = JSON.parse(JSON.stringify(displayRequestBody));
                if (displayRequestBody.password) {
                    displayRequestBody.password = '********'; // Obfuscate password field
                }
            }
            // Assign the potentially obfuscated body to the final result data
            resultData.requestBody = displayRequestBody;
            // *** END OBFUSCATION LOGIC ***


            // Ensure final status reflects overall outcome
            if (resultData.error) {
                 resultData.status = 'Error';
                 resultData.statusText = 'Workflow Failed';
            } else if (resultData.status === null) {
                 resultData.status = 'Unknown';
                 resultData.statusText = 'Workflow ended without tracked API call status';
            }
            // --- End populating final resultData ---

            // Emit the final summary 'result' event for this workflow iteration
            eventEmitter.emit('result', resultData);

        } // End of the main 'for' loop (iterations)

        console.log(`[ComplexBot] Loop finished or stopped.`);
        eventEmitter.emit('done'); // Signal that all iterations are done or stopped
        resolve(); // Resolve the promise returned by runComplexBots
    });
}

module.exports = { runComplexBots };
