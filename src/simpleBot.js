// src/simpleBot.js
const axios = require('axios');
const crypto = require('crypto');

/**
 * Generates a random password string.
 */
function generateRandomPassword() {
    return crypto.randomBytes(8).toString('hex');
}

/**
 * Runs simple bot requests sequentially, checking for stop signal.
 * Obfuscates the known password in the result data sent to the frontend.
 * @param {object} config
 * @param {string} config.targetUrl
 * @param {string} config.endpoint
 * @param {number} config.numRequests
 * @param {EventEmitter} config.eventEmitter
 * @param {function} config.shouldStop - Function that returns true if stop is requested.
 * @returns {Promise<void>}
 */
async function runSimpleBots({ targetUrl, endpoint, numRequests, eventEmitter, shouldStop }) {
    return new Promise(async (resolve) => {
        const fullUrl = targetUrl.endsWith('/') ? targetUrl.slice(0, -1) + endpoint : targetUrl + endpoint;
        const knownPassword = "K4sad@!";
        const isLogin = endpoint.includes('login');
        const knownPasswordRequestIndex = isLogin ? (Math.floor(Math.random() * numRequests) + 1) : -1;

        console.log(`[SimpleBot] Starting ${numRequests} SEQUENTIAL requests to ${fullUrl}`);
        if (isLogin) console.log(`[SimpleBot] Request #${knownPasswordRequestIndex} will use the known password.`);

        for (let i = 1; i <= numRequests; i++) {
            if (shouldStop()) {
                console.log(`[SimpleBot] Stop requested at iteration ${i}. Exiting loop.`);
                break;
            }

            const startTime = Date.now();
            let requestBody = {};
            let passwordUsed = null; // Store the actual password used for the request

            // Determine request body based on endpoint
             if (isLogin) {
                 passwordUsed = (i === knownPasswordRequestIndex) ? knownPassword : generateRandomPassword();
                 requestBody = { email: "user@example.com", password: passwordUsed };
             } else if (endpoint.includes('checkout')) {
                 requestBody = { /* Static checkout payload */
                    items: [{ id: (i % 5) + 1, name: `Dummy Item ${i % 5 + 1}`, price: (Math.random() * 50 + 10).toFixed(2), quantity: 1 }],
                    shippingAddress: { name: `Test Bot ${i}`, email: `bot${i}@example.com`, address: `${i} Bot St`, city: "Botville", state: "BT", zipCode: "12345", country: "Botland" },
                    paymentMethod: (i % 2 === 0) ? "credit-card" : "paypal"
                 };
             } else {
                 requestBody = {};
             }

            const requestHeaders = { /* Define headers */
                'User-Agent': `BotSim/1.0 (Req ${i})`, 'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json'
            };
            let status = null, statusText = '', error = null, responseDataSnippet = null, responseHeaders = null;

            try {
                console.log(`[SimpleBot] Sending request ${i}...`);
                const response = await axios.post(fullUrl, requestBody, { /* axios config */
                     timeout: 10000, headers: requestHeaders, validateStatus: function (status) { return true; }
                 });
                 // Process response
                 status = response.status; statusText = response.statusText; responseHeaders = response.headers;
                 if (response.data) responseDataSnippet = (typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data)).substring(0, 100);
                 console.log(`[SimpleBot] Request ${i} completed: Status ${status}`);
            } catch (err) {
                // Handle error
                 console.error(`[SimpleBot] Request ${i} failed: ${err.message}`); error = err.message; responseHeaders = err.response?.headers || null;
                 if (err.response) { status = err.response.status; statusText = err.response.statusText; } else { status = 'Error'; statusText = err.code || 'Network Error'; }
            }

            // *** OBFUSCATION LOGIC ***
            // Create a copy of the request body to potentially modify for logging/UI display
            let displayRequestBody = { ...requestBody };
            // If this was a login request using the known password, obfuscate it
            if (isLogin && passwordUsed === knownPassword) {
                 displayRequestBody.password = '********'; // Obfuscate
            }
            // *** END OBFUSCATION LOGIC ***

            // Prepare result data using the potentially obfuscated body
            const resultData = {
                 id: i, url: fullUrl, method: 'POST', status: status, statusText: statusText,
                 timestamp: startTime,
                 requestBody: displayRequestBody, // Use the display version
                 requestHeaders: requestHeaders,
                 responseHeaders: responseHeaders, responseDataSnippet: responseDataSnippet, error: error,
            };
            // Emit result
            eventEmitter.emit('result', resultData);

        } // End of for loop

        console.log(`[SimpleBot] Loop finished or stopped.`);
        eventEmitter.emit('done');
        resolve();
    });
}

module.exports = { runSimpleBots };
