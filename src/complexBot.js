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
const CHECKOUT_FORM_SELECTORS = { /* ... */ }; // Keep verified selectors
const FINAL_SUBMIT_SELECTOR = 'button:has-text("Place Order")'; // Placeholder
const CHECKOUT_API_ENDPOINT_PATH = '/api/checkout';
// --- End Selectors ---

function generateRandomPassword() { /* ... */ }
function emitStep(emitter, id, message) { /* ... */ }

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
            let resultData = { /* ... initial structure ... */ };

            try {
                emitStep(eventEmitter, i, 'Launching browser...');
                browser = await chromium.launch({ headless: true });
                const context = await browser.newContext();
                const page = await context.newPage();

                // === LOGIN WORKFLOW ===
                if (isLogin) {
                    // ... (login workflow logic as before) ...
                // === CHECKOUT WORKFLOW ===
                } else if (isCheckout) {
                    // ... (checkout workflow logic as before) ...
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
            // (It will be emitted even if an error occurred within the try block)
             eventEmitter.emit('result', resultData);

        } // End of for loop

        console.log(`[ComplexBot] Loop finished or stopped.`);
        eventEmitter.emit('done'); // Emit done regardless
        resolve();
    });
}

module.exports = { runComplexBots };
