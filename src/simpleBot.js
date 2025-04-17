// src/simpleBot.js
const axios = require('axios');
const crypto = require('crypto'); // Import crypto module for random password generation

/**
 * Generates a random password string.
 * @returns {string} A random hexadecimal string.
 */
function generateRandomPassword() {
    return crypto.randomBytes(8).toString('hex'); // Generate 16 hex characters
}

/**
 * Runs a batch of simple bot requests SEQUENTIALLY against a target endpoint.
 * Sends appropriate request body based on endpoint ('login' vs 'checkout').
 * Emits 'result' events via the provided emitter immediately after each request settles,
 * and a 'done' event when all requests are processed.
 * Captures request and response headers, and the request start timestamp in the result data.
 * One login request uses a specific known password at a random index.
 *
 * @param {object} config - Configuration object.
 * @param {string} config.targetUrl - The base URL of the target site.
 * @param {string} config.endpoint - The specific API endpoint (e.g., /api/auth/login or /api/checkout).
 * @param {number} config.numRequests - The number of sequential requests to send.
 * @param {EventEmitter} config.eventEmitter - Node.js EventEmitter instance to emit results.
 * @returns {Promise<void>} - A promise that resolves when all processing is complete.
 */
async function runSimpleBots({ targetUrl, endpoint, numRequests, eventEmitter }) {
    return new Promise(async (resolve) => { // Wrap in promise to resolve when 'done' is emitted
        const fullUrl = targetUrl.endsWith('/') ? targetUrl.slice(0, -1) + endpoint : targetUrl + endpoint;
        const knownPassword = "K4sad@!";
        // Determine random index ONLY if the target is login
        const isLogin = endpoint.includes('login');
        const knownPasswordRequestIndex = isLogin ? (Math.floor(Math.random() * numRequests) + 1) : -1; // -1 if not login

        console.log(`[SimpleBot] Starting ${numRequests} SEQUENTIAL requests to ${fullUrl}`);
        if (isLogin) {
            console.log(`[SimpleBot] Request #${knownPasswordRequestIndex} will use the known password for login.`);
        }

        // --- Process requests sequentially in a loop ---
        for (let i = 1; i <= numRequests; i++) {
            const startTime = Date.now(); // Capture timestamp when request prep begins
            let requestBody = {}; // Initialize empty body

            const requestHeaders = { // Define common headers
                'User-Agent': `BotSim/1.0 (Req ${i})`,
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json'
            };

            // --- Determine request body based on endpoint ---
            if (isLogin) {
                const password = (i === knownPasswordRequestIndex) ? knownPassword : generateRandomPassword();
                requestBody = {
                    email: "user@example.com",
                    password: password
                };
            } else if (endpoint.includes('checkout')) {
                // Use static dummy data based on the sample for the "Simple Bot" checkout
                requestBody = {
                    items: [{ id: (i % 5) + 1, name: `Dummy Item ${i % 5 + 1}`, price: (Math.random() * 50 + 10).toFixed(2), quantity: 1 }], // Vary item slightly
                    shippingAddress: { name: `Test Bot ${i}`, email: `bot${i}@example.com`, address: `${i} Bot St`, city: "Botville", state: "BT", zipCode: "12345", country: "Botland" },
                    paymentMethod: (i % 2 === 0) ? "credit-card" : "paypal" // Alternate payment method
                };
            } else {
                // Default case for unknown endpoints
                console.warn(`[SimpleBot] Unknown endpoint type (${endpoint}) for request ${i}. Sending empty body.`);
                requestBody = {};
            }

            let status = null;
            let statusText = '';
            let error = null;
            let responseDataSnippet = null;
            let responseHeaders = null;

            try {
                // --- Make the HTTP POST request and AWAIT its completion ---
                console.log(`[SimpleBot] Sending request ${i} to ${endpoint}...`);
                const response = await axios.post(fullUrl, requestBody, {
                    timeout: 10000, // Timeout per individual request
                    headers: requestHeaders,
                    validateStatus: function (status) { return true; } // Accept any status code
                });

                status = response.status;
                statusText = response.statusText;
                responseHeaders = response.headers; // Capture response headers

                if (response.data) {
                    if (typeof response.data === 'object') {
                        responseDataSnippet = JSON.stringify(response.data).substring(0, 100);
                    } else {
                        responseDataSnippet = String(response.data).substring(0, 100);
                    }
                }
                 console.log(`[SimpleBot] Request ${i} completed: Status ${status}`);

            } catch (err) {
                // Handle errors for this specific request
                console.error(`[SimpleBot] Request ${i} failed: ${err.message}`);
                error = err.message;
                responseHeaders = err.response?.headers || null; // Capture headers even from error response

                if (err.response) {
                    status = err.response.status;
                    statusText = err.response.statusText;
                } else {
                    status = 'Error';
                    statusText = err.code || 'Network Error';
                }
            }

            // --- Prepare result data for this single request ---
            const resultData = {
                id: i, // Use loop counter as ID
                url: fullUrl,
                method: 'POST', // Assuming POST for both for now
                status: status,
                statusText: statusText,
                timestamp: startTime, // Use the start time captured before the request
                requestBody: requestBody, // Include the actual body sent
                requestHeaders: requestHeaders,
                responseHeaders: responseHeaders,
                responseDataSnippet: responseDataSnippet,
                error: error,
            };

            // --- Emit the individual result immediately ---
            eventEmitter.emit('result', resultData);

        } // End of for loop

        console.log(`[SimpleBot] Completed all ${numRequests} sequential requests.`);
        // Emit 'done' event after the loop finishes
        eventEmitter.emit('done');
        resolve(); // Resolve the promise returned by runSimpleBots
    }); // End of Promise wrapper
}

module.exports = { runSimpleBots };
