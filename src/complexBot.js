    // src/complexBot.js
    const { chromium } = require('playwright');
    const crypto = require('crypto');

    // --- CSS Selectors for shop.botdemo.net ---

    // -- Login Workflow --
    const LOGIN_PAGE_URL_SUFFIX = '/login'; // Please verify this path
    const USERNAME_SELECTOR = '#email';     // Confirmed by user
    const PASSWORD_SELECTOR = '#password';  // Confirmed by user
    const SUBMIT_BUTTON_SELECTOR = 'button[type="submit"]'; // Confirmed by user
    const LOGIN_API_ENDPOINT_PATH = '/api/auth/login'; // Please verify this API path

    // -- Checkout Workflow --
    const ADD_TO_CART_SELECTOR = '.add-to-cart-btn'; // Using suggested selector
    // ** USER ACTION REQUIRED: Verify/Update remaining placeholders **
    const VIEW_CART_SELECTOR = 'a[href="/cart"]'; // Placeholder - e.g., link to cart
    const PROCEED_TO_CHECKOUT_SELECTOR = 'button:has-text("Proceed to Checkout")'; // Placeholder
    // Selectors for fields on the checkout page itself (Updated based on user input)
    const CHECKOUT_FORM_SELECTORS = {
        name: '#fullName',         // Updated
        email: '#email',           // Updated
        address: '#address',       // Updated
        city: '#city',             // Updated
        state: '#state',           // Updated
        zipCode: '#zipCode',       // Updated
        country: '#country',       // Updated (Assuming input, not select)
        // Add selectors for payment fields if necessary
    };
    const FINAL_SUBMIT_SELECTOR = 'button:has-text("Place Order")'; // Placeholder for final checkout button
    const CHECKOUT_API_ENDPOINT_PATH = '/api/checkout'; // Please verify this API path
    // --- End of Selectors ---


    function generateRandomPassword() {
        return crypto.randomBytes(8).toString('hex');
    }

    function emitStep(emitter, id, message) {
        console.log(`[ComplexBot] Req ${id}: ${message}`);
        emitter.emit('step', { id, message });
    }

    /**
     * Runs complex bot workflows (Login or Checkout) using Playwright.
     * Emits 'step', 'result', and 'done' events via SSE emitter.
     * Uses the default Playwright browser User-Agent for realism.
     *
     * @param {object} config - Configuration object.
     * @param {string} config.targetUrl
     * @param {string} config.endpoint - Determines workflow (/api/auth/login or /api/checkout).
     * @param {number} config.numRequests
     * @param {EventEmitter} config.eventEmitter
     * @param {string|null} config.cookieString
     * @returns {Promise<void>}
     */
    async function runComplexBots({ targetUrl, endpoint, numRequests, eventEmitter, cookieString }) {
        return new Promise(async (resolve) => {
            const isLogin = endpoint.includes('login');
            const isCheckout = endpoint.includes('checkout');

            if (!isLogin && !isCheckout) {
                 console.warn(`[ComplexBot] Workflow for endpoint "${endpoint}" not implemented. Skipping.`);
                 eventEmitter.emit('done'); return resolve();
            }

            // --- Workflow Setup ---
            const knownPassword = "K4sad@!"; // Used only for login workflow
            const knownPasswordRequestIndex = isLogin ? (Math.floor(Math.random() * numRequests) + 1) : -1;

            console.log(`[ComplexBot] Starting ${numRequests} SEQUENTIAL Playwright ${isLogin ? 'Login' : 'Checkout'} workflows...`);
            if (isLogin) console.log(`[ComplexBot] Request #${knownPasswordRequestIndex} will use the known password.`);

            // --- Main Loop for Each Bot Run ---
            for (let i = 1; i <= numRequests; i++) {
                const startTime = Date.now();
                let browser = null;
                let resultData = { // Initialize result structure
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
                        resultData.status = apiResponse.status();
                        resultData.statusText = apiResponse.statusText();
                        resultData.responseHeaders = apiResponse.headers();
                        const bodyBuffer = await apiResponse.body();
                        resultData.responseDataSnippet = bodyBuffer.toString('utf-8').substring(0, 150);
                        const apiRequest = apiResponse.request();
                        resultData.requestHeaders = apiRequest.headers();
                        try { resultData.requestBody = apiRequest.postDataJSON(); } catch { resultData.requestBody = apiRequest.postData(); }

                    // === CHECKOUT WORKFLOW ===
                    } else if (isCheckout) {
                        // ** USER ACTION REQUIRED: Verify/update remaining selectors **
                        emitStep(eventEmitter, i, `Navigating to Home: ${targetUrl}...`);
                        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 20000 });

                        emitStep(eventEmitter, i, `Clicking first '${ADD_TO_CART_SELECTOR}' button...`);
                        await page.locator(ADD_TO_CART_SELECTOR).first().click();
                        await page.waitForTimeout(500);

                        emitStep(eventEmitter, i, `Navigating to Cart via '${VIEW_CART_SELECTOR}'...`);
                        // ** Placeholder Interaction - Update VIEW_CART_SELECTOR **
                        await page.locator(VIEW_CART_SELECTOR).click();
                        await page.waitForURL('**/cart', { timeout: 10000 });

                        emitStep(eventEmitter, i, `Clicking '${PROCEED_TO_CHECKOUT_SELECTOR}'...`);
                         // ** Placeholder Interaction - Update PROCEED_TO_CHECKOUT_SELECTOR **
                        await page.locator(PROCEED_TO_CHECKOUT_SELECTOR).click();
                        await page.waitForURL('**/checkout', { timeout: 10000 });

                        emitStep(eventEmitter, i, 'Filling checkout form...');
                        // Using updated selectors for form fields
                        await page.waitForSelector(CHECKOUT_FORM_SELECTORS.name, { state: 'visible', timeout: 15000 }); // Added wait
                        await page.locator(CHECKOUT_FORM_SELECTORS.name).fill(`Bot User ${i}`);
                        await page.locator(CHECKOUT_FORM_SELECTORS.email).fill(`bot${i}@test.com`);
                        await page.locator(CHECKOUT_FORM_SELECTORS.address).fill(`${i} Automation Lane`);
                        await page.locator(CHECKOUT_FORM_SELECTORS.city).fill('BotCity');
                        await page.locator(CHECKOUT_FORM_SELECTORS.state).fill('BT');
                        await page.locator(CHECKOUT_FORM_SELECTORS.zipCode).fill('98765');
                        // Country field is assumed to be pre-filled or handled by default value

                        const apiResponsePromise = page.waitForResponse(
                            response => response.url().includes(CHECKOUT_API_ENDPOINT_PATH) && response.request().method() === 'POST',
                            { timeout: 20000 }
                        );

                        emitStep(eventEmitter, i, `Clicking final submit '${FINAL_SUBMIT_SELECTOR}'...`);
                         // ** Placeholder Interaction - Update FINAL_SUBMIT_SELECTOR **
                        await page.locator(FINAL_SUBMIT_SELECTOR).click();

                        emitStep(eventEmitter, i, `Waiting for API response (${CHECKOUT_API_ENDPOINT_PATH})...`);
                        const apiResponse = await apiResponsePromise;

                        emitStep(eventEmitter, i, 'Processing API response...');
                        resultData.status = apiResponse.status();
                        resultData.statusText = apiResponse.statusText();
                        resultData.responseHeaders = apiResponse.headers();
                        const bodyBuffer = await apiResponse.body();
                        resultData.responseDataSnippet = bodyBuffer.toString('utf-8').substring(0, 150);
                        const apiRequest = apiResponse.request();
                        resultData.requestHeaders = apiRequest.headers();
                         try { resultData.requestBody = apiRequest.postDataJSON(); } catch { resultData.requestBody = apiRequest.postData(); }
                    }

                    // --- Workflow Completion ---
                    emitStep(eventEmitter, i, `Workflow completed. Final API Status: ${resultData.status}`);

                } catch (err) {
                    // --- Error Handling ---
                    console.error(`[ComplexBot] Req ${i}: Workflow failed - ${err.message}`);
                    resultData.error = err.message.substring(0, 200);
                    resultData.status = 'Error';
                    resultData.statusText = 'Workflow Failed';
                    emitStep(eventEmitter, i, `Error: ${resultData.error}`); // Send error step to UI
                } finally {
                    // --- Browser Cleanup ---
                    if (browser) {
                        emitStep(eventEmitter, i, 'Closing browser...');
                        await browser.close();
                        emitStep(eventEmitter, i, 'Browser closed.');
                    }
                }

                // Emit the final result data for this workflow run
                eventEmitter.emit('result', resultData);

            } // End of for loop

            console.log(`[ComplexBot] Completed all ${numRequests} complex workflows.`);
            eventEmitter.emit('done');
            resolve();
        });
    }

    module.exports = { runComplexBots };
    