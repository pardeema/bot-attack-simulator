// src/complexBot.js
const { chromium } = require('playwright');
const crypto = require('crypto');

// --- Selectors ---
// ... (Keep all your verified selectors here) ...
const LOGIN_PAGE_URL_SUFFIX = '/login';
const USERNAME_SELECTOR = '#email';
const PASSWORD_SELECTOR = '#password';
const SUBMIT_BUTTON_SELECTOR = 'button[type="submit"]';
const LOGIN_API_ENDPOINT_PATH = '/api/auth/login';
const ADD_TO_CART_SELECTOR = '.add-to-cart-btn';
const VIEW_CART_SELECTOR = 'a[href="/cart"]'; // Placeholder
const PROCEED_TO_CHECKOUT_SELECTOR = 'button:has-text("Proceed to Checkout")'; // Placeholder
const CHECKOUT_FORM_SELECTORS = { /* ... Keep verified selectors ... */
    name: '#fullName', email: '#email', address: '#address', city: '#city',
    state: '#state', zipCode: '#zipCode', country: '#country',
};
const FINAL_SUBMIT_SELECTOR = 'button:has-text("Place Order")'; // Placeholder
const CHECKOUT_API_ENDPOINT_PATH = '/api/checkout';
// --- End Selectors ---

function generateRandomPassword() { return crypto.randomBytes(8).toString('hex'); }
function emitStep(emitter, id, message) { console.log(`[ComplexBot] Req ${id}: ${message}`); emitter.emit('step', { id, message }); }

/**
 * Runs complex bot workflows sequentially, checking for stop signal.
 * @param {object} config
 * @param {string} config.targetUrl
 * @param {string} config.endpoint
 * @param {number} config.numRequests
 * @param {EventEmitter} config.eventEmitter
 * @param {string|null} config.cookieString
 * @param {function} config.shouldStop - Function that returns true if stop is requested.
 * @returns {Promise<void>}
 */
async function runComplexBots({ targetUrl, endpoint, numRequests, eventEmitter, cookieString, shouldStop }) { // Added shouldStop
    return new Promise(async (resolve) => {
        const isLogin = endpoint.includes('login');
        const isCheckout = endpoint.includes('checkout');
        // ... (Initial checks and setup) ...
        if (!isLogin && !isCheckout) { /* ... skip ... */ }

        const knownPassword = "K4sad@!";
        const knownPasswordRequestIndex = isLogin ? (Math.floor(Math.random() * numRequests) + 1) : -1;
        console.log(`[ComplexBot] Starting ${numRequests} SEQUENTIAL Playwright ${isLogin ? 'Login' : 'Checkout'} workflows...`);
        if (isLogin) console.log(`[ComplexBot] Request #${knownPasswordRequestIndex} will use the known password.`);


        for (let i = 1; i <= numRequests; i++) {
             // *** ADDED: Check if stop was requested before starting iteration ***
            if (shouldStop()) {
                console.log(`[ComplexBot] Stop requested at iteration ${i}. Exiting loop.`);
                emitStep(eventEmitter, i, 'Stop requested by user.'); // Inform UI
                break; // Exit the loop
            }

            const startTime = Date.now();
            let browser = null;
            let resultData = { /* ... initial structure ... */
                 id: i, url: targetUrl + endpoint, method: `WORKFLOW (${isLogin ? 'Login' : 'Checkout'})`,
                 status: null, statusText: '', timestamp: startTime, requestBody: null,
                 requestHeaders: null, responseHeaders: null, responseDataSnippet: null, error: null,
            };

            try {
                emitStep(eventEmitter, i, 'Launching browser...');
                browser = await chromium.launch({ headless: true });
                const context = await browser.newContext();
                const page = await context.newPage();

                // === LOGIN WORKFLOW ===
                if (isLogin) {
                    // ... (login workflow logic as before) ...
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
                     emitStep(eventEmitter, i, 'Processing API response...');
                     // ... process apiResponse into resultData ...
                     resultData.status = apiResponse.status(); resultData.statusText = apiResponse.statusText(); resultData.responseHeaders = apiResponse.headers();
                     const bodyBuffer = await apiResponse.body(); resultData.responseDataSnippet = bodyBuffer.toString('utf-8').substring(0, 150);
                     const apiRequest = apiResponse.request(); resultData.requestHeaders = apiRequest.headers();
                     try { resultData.requestBody = apiRequest.postDataJSON(); } catch { resultData.requestBody = apiRequest.postData(); }

                // === CHECKOUT WORKFLOW ===
                } else if (isCheckout) {
                    // ... (checkout workflow logic as before) ...
                     emitStep(eventEmitter, i, `Navigating to Home: ${targetUrl}...`);
                     await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 20000 });
                     emitStep(eventEmitter, i, `Clicking first '${ADD_TO_CART_SELECTOR}' button...`);
                     await page.locator(ADD_TO_CART_SELECTOR).first().click(); await page.waitForTimeout(500);
                     emitStep(eventEmitter, i, `Navigating to Cart via '${VIEW_CART_SELECTOR}'...`);
                     await page.locator(VIEW_CART_SELECTOR).click(); await page.waitForURL('**/cart', { timeout: 10000 });
                     emitStep(eventEmitter, i, `Clicking '${PROCEED_TO_CHECKOUT_SELECTOR}'...`);
                     await page.locator(PROCEED_TO_CHECKOUT_SELECTOR).click(); await page.waitForURL('**/checkout', { timeout: 10000 });
                     emitStep(eventEmitter, i, 'Filling checkout form...');
                     await page.waitForSelector(CHECKOUT_FORM_SELECTORS.name, { state: 'visible', timeout: 15000 });
                     await page.locator(CHECKOUT_FORM_SELECTORS.name).fill(`Bot User ${i}`);
                     await page.locator(CHECKOUT_FORM_SELECTORS.email).fill(`bot${i}@test.com`);
                     // ... fill other fields ...
                     await page.locator(CHECKOUT_FORM_SELECTORS.address).fill(`${i} Automation Lane`);
                     await page.locator(CHECKOUT_FORM_SELECTORS.city).fill('BotCity');
                     await page.locator(CHECKOUT_FORM_SELECTORS.state).fill('BT');
                     await page.locator(CHECKOUT_FORM_SELECTORS.zipCode).fill('98765');
                     const apiResponsePromise = page.waitForResponse(/* ... */);
                     emitStep(eventEmitter, i, `Clicking final submit '${FINAL_SUBMIT_SELECTOR}'...`);
                     await page.locator(FINAL_SUBMIT_SELECTOR).click();
                     emitStep(eventEmitter, i, `Waiting for API response (${CHECKOUT_API_ENDPOINT_PATH})...`);
                     const apiResponse = await apiResponsePromise;
                     emitStep(eventEmitter, i, 'Processing API response...');
                      // ... process apiResponse into resultData ...
                     resultData.status = apiResponse.status(); resultData.statusText = apiResponse.statusText(); resultData.responseHeaders = apiResponse.headers();
                     const bodyBuffer = await apiResponse.body(); resultData.responseDataSnippet = bodyBuffer.toString('utf-8').substring(0, 150);
                     const apiRequest = apiResponse.request(); resultData.requestHeaders = apiRequest.headers();
                     try { resultData.requestBody = apiRequest.postDataJSON(); } catch { resultData.requestBody = apiRequest.postData(); }
                }

                emitStep(eventEmitter, i, `Workflow completed. Final API Status: ${resultData.status}`);

            } catch (err) {
                 // ... (error handling as before) ...
                 console.error(`[ComplexBot] Req ${i}: Workflow failed - ${err.message}`);
                 resultData.error = err.message.substring(0, 200);
                 resultData.status = 'Error';
                 resultData.statusText = 'Workflow Failed';
                 emitStep(eventEmitter, i, `Error: ${resultData.error}`);
            } finally {
                if (browser) {
                    // Ensure browser always closes, even if loop broken by 'stop'
                    emitStep(eventEmitter, i, 'Closing browser...');
                    await browser.close();
                    emitStep(eventEmitter, i, 'Browser closed.');
                }
            }

            // Emit final result only if workflow wasn't stopped *before* error handling finished
             eventEmitter.emit('result', resultData);

        } // End of for loop

        console.log(`[ComplexBot] Loop finished or stopped.`);
        eventEmitter.emit('done'); // Emit done regardless
        resolve();
    });
}

module.exports = { runComplexBots };
