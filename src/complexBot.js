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

// List of realistic User Agents to mimic non-headless browsers
const USER_AGENTS_LIST = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15', // Safari
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/123.0.2420.97' // Edge
];

/**
 * Gets a random User-Agent string from the USER_AGENTS_LIST.
 * @returns {string} A randomly selected User-Agent string.
 */
const getRandomRealisticUA = () => USER_AGENTS_LIST[Math.floor(Math.random() * USER_AGENTS_LIST.length)];


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
        const buffer = request.postDataBuffer(); // Get as buffer
        if (buffer) {
            // Attempt to convert to string if it's likely text-based
            const headers = await request.allHeaders();
            const contentType = headers['content-type'];
            if (contentType && (contentType.includes('text') || contentType.includes('json') || contentType.includes('xml') || contentType.includes('x-www-form-urlencoded'))) {
                requestBody = buffer.toString('utf-8');
            } else {
                // For other binary types, you might represent it as a placeholder or base64
                 requestBody = `(Binary data: ${buffer.length} bytes)`;
            }
        }
    }

    return {
        url: request.url(),
        method: request.method(),
        // Use allHeaders() to get a comprehensive header object
        requestHeaders: await request.allHeaders(),
        requestBody: requestBody, // Contains parsed JSON, string, or placeholder
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
        const buffer = await response.body(); // This always returns a Buffer
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
 * Uses a randomly selected realistic User-Agent.
 * @param {object} config - Configuration object.
 * @param {string} config.targetUrl - Base URL of the target site.
 * @param {string} config.endpoint - Target API endpoint path (determines workflow).
 * @param {number} config.numRequests - Number of workflow iterations to run.
 * @param {EventEmitter} config.eventEmitter - Emitter for sending progress/results.
 * @param {string|null} config.cookieString - Optional cookie string (not actively used by Playwright here).
 * @param {function} config.shouldStop - Function returning true if the simulation should stop.
 * @returns {Promise<void>}
 */
async function runComplexBots({ targetUrl, endpoint, numRequests, eventEmitter, cookieString, shouldStop }) {
    return new Promise(async (resolve) => {
        const isLogin = endpoint.includes('login');
        const isCheckout = endpoint.includes('checkout');

        if (!isLogin && !isCheckout) {
            console.warn(`[ComplexBot] Endpoint "${endpoint}" does not correspond to a known complex workflow.`);
            eventEmitter.emit('error', { message: `Complex bot workflow for "${endpoint}" not implemented.` });
            eventEmitter.emit('done');
            return resolve();
        }

        const knownPassword = "K4sad@!";
        const knownPasswordRequestIndex = isLogin ? (Math.floor(Math.random() * numRequests) + 1) : -1;
        console.log(`[ComplexBot] Starting ${numRequests} SEQUENTIAL Playwright ${isLogin ? 'Login' : 'Checkout'} workflows...`);
        if (isLogin) console.log(`[ComplexBot] Request #${knownPasswordRequestIndex} will use the known password.`);

        for (let i = 1; i <= numRequests; i++) {
            if (shouldStop()) {
                console.log(`[ComplexBot] Stop requested at iteration ${i}. Exiting loop.`);
                emitStep(eventEmitter, i, 'Stop requested by user.');
                break;
            }

            const startTime = Date.now();
            let browser = null;
            let finalApiRequestDetails = {};
            let finalApiResponseDetails = {};
            let resultData = {
                 id: i, url: targetUrl + endpoint, method: `WORKFLOW (${isLogin ? 'Login' : 'Checkout'})`,
                 status: null, statusText: '', timestamp: startTime,
                 requestBody: null, requestHeaders: null, responseHeaders: null,
                 responseDataSnippet: null, error: null,
            };
            // Select a random User-Agent for this iteration
            const currentRealisticUA = getRandomRealisticUA();

            try {
                emitStep(eventEmitter, i, 'Launching browser...');
                const launchOptions = {
                    headless: true,
                    // Consider adding args for further stealth if needed, e.g., disabling certain Chrome features
                    // args: ['--disable-blink-features=AutomationControlled']
                };
                browser = await chromium.launch(launchOptions);

                const context = await browser.newContext({
                    userAgent: currentRealisticUA, // Use the randomly selected User-Agent
                    // viewport: { width: 1920, height: 1080 }, // Example: Mimic common desktop resolution
                    // locale: 'en-US',
                    // timezoneId: 'America/New_York',
                });
                emitStep(eventEmitter, i, `Browser context created with User-Agent: ${currentRealisticUA}`);

                const page = await context.newPage();
                const pendingRequests = new Map();

                page.on('request', request => {
                    const url = request.url();
                    if (new URL(url).pathname.startsWith('/149')) {
                        pendingRequests.set(url, { request });
                    }
                });

                page.on('response', async response => {
                    const request = response.request();
                    const url = response.url();
                    if (new URL(url).pathname.startsWith('/149') && pendingRequests.has(url)) {
                        const { request: originalRequest } = pendingRequests.get(url);
                        pendingRequests.delete(url);
                        const reqDetails = await getRequestDetails(originalRequest);
                        const resDetails = await getResponseDetails(response);
                        const filename = new URL(url).pathname.split('/').pop();
                        emitStep(eventEmitter, i, `JS Exec: /149.../${filename}`, { ...reqDetails, ...resDetails });
                    }
                });

                if (isLogin) {
                     const loginPageUrl = targetUrl + LOGIN_PAGE_URL_SUFFIX;
                     const password = (i === knownPasswordRequestIndex) ? knownPassword : generateRandomPassword();
                     const email = `user${crypto.randomBytes(4).toString('hex')}@example.com`;

                     emitStep(eventEmitter, i, `Navigating to ${loginPageUrl}...`);
                     await page.goto(loginPageUrl, { waitUntil: 'networkidle', timeout: 20000 });

                     emitStep(eventEmitter, i, 'Filling login form...');
                     await page.locator(USERNAME_SELECTOR).fill(email);
                     await page.locator(PASSWORD_SELECTOR).fill(password);

                     const apiResponsePromise = page.waitForResponse(
                             resp => resp.url().includes(LOGIN_API_ENDPOINT_PATH) && resp.request().method() === 'POST',
                             { timeout: 15000 }
                         );

                     emitStep(eventEmitter, i, 'Clicking submit...');
                     await page.locator(SUBMIT_BUTTON_SELECTOR).click();

                     emitStep(eventEmitter, i, `Waiting for API response (${LOGIN_API_ENDPOINT_PATH})...`);
                     const apiResponse = await apiResponsePromise;
                     const apiRequest = apiResponse.request();

                     finalApiRequestDetails = await getRequestDetails(apiRequest);
                     finalApiResponseDetails = await getResponseDetails(apiResponse);

                     emitStep(eventEmitter, i, `API Call: ${LOGIN_API_ENDPOINT_PATH}`, {
                         ...finalApiRequestDetails, ...finalApiResponseDetails
                     });

                     resultData.status = finalApiResponseDetails.responseStatus;
                     resultData.statusText = finalApiResponseDetails.responseStatusText;
                } else if (isCheckout) {
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
                     // ... (fill other checkout fields) ...
                     await page.locator(CHECKOUT_FORM_SELECTORS.address).fill(`${i} Automation Lane`);
                     await page.locator(CHECKOUT_FORM_SELECTORS.city).fill('BotCity');
                     await page.locator(CHECKOUT_FORM_SELECTORS.state).fill('BT');
                     await page.locator(CHECKOUT_FORM_SELECTORS.zipCode).fill('98765');


                     const apiResponsePromise = page.waitForResponse(
                             resp => resp.url().includes(CHECKOUT_API_ENDPOINT_PATH) && resp.request().method() === 'POST',
                             { timeout: 20000 }
                         );

                     emitStep(eventEmitter, i, `Clicking final submit '${FINAL_SUBMIT_SELECTOR}'...`);
                     await page.locator(FINAL_SUBMIT_SELECTOR).click();

                     emitStep(eventEmitter, i, `Waiting for API response (${CHECKOUT_API_ENDPOINT_PATH})...`);
                     const apiResponse = await apiResponsePromise;
                     const apiRequest = apiResponse.request();

                     finalApiRequestDetails = await getRequestDetails(apiRequest);
                     finalApiResponseDetails = await getResponseDetails(apiResponse);

                     emitStep(eventEmitter, i, `API Call: ${CHECKOUT_API_ENDPOINT_PATH}`, {
                         ...finalApiRequestDetails, ...finalApiResponseDetails
                     });

                     resultData.status = finalApiResponseDetails.responseStatus;
                     resultData.statusText = finalApiResponseDetails.responseStatusText;
                }

                emitStep(eventEmitter, i, `Workflow completed. Final API Status: ${resultData.status}`);

            } catch (err) {
                 console.error(`[ComplexBot] Req ${i}: Workflow failed - ${err.message.split('\n')[0]}`);
                 resultData.error = err.message.substring(0, 250);
                 resultData.status = 'Error';
                 resultData.statusText = 'Workflow Operation Failed';
                 emitStep(eventEmitter, i, `Error: ${resultData.error}`);
            } finally {
                if (browser) {
                    emitStep(eventEmitter, i, 'Closing browser...');
                    await browser.close();
                    emitStep(eventEmitter, i, 'Browser closed.');
                }
            }

            resultData.requestHeaders = finalApiRequestDetails.requestHeaders;
            resultData.responseHeaders = finalApiResponseDetails.responseHeaders;
            resultData.responseDataSnippet = finalApiResponseDetails.responseBodySnippet;

            let displayRequestBody = finalApiRequestDetails.requestBody;
            if (isLogin && i === knownPasswordRequestIndex && displayRequestBody && typeof displayRequestBody === 'object') {
                console.log(`[ComplexBot] Req ${i}: Obfuscating known password for final result event.`);
                try {
                    const tempBody = JSON.parse(JSON.stringify(displayRequestBody));
                    if (tempBody.password) {
                        tempBody.password = '********';
                    }
                    displayRequestBody = tempBody;
                } catch (e) {
                    console.warn(`[ComplexBot] Req ${i}: Could not obfuscate password, request body not a simple object.`);
                }
            }
            resultData.requestBody = displayRequestBody;

            if (resultData.error && resultData.status !== 'Error') {
                 resultData.status = 'Error';
                 resultData.statusText = resultData.statusText || 'Workflow Incomplete';
            } else if (resultData.status === null) {
                 resultData.status = 'Unknown';
                 resultData.statusText = 'Workflow ended without tracked API call status';
            }

            eventEmitter.emit('result', resultData);
        }

        console.log(`[ComplexBot] Loop finished or stopped.`);
        eventEmitter.emit('done');
        resolve();
    });
}

module.exports = { runComplexBots };
