// src/simpleBot.js
const axios = require('axios');
const crypto = require('crypto');

// User agents previously in mediumBot.js
const USER_AGENTS = [
     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
     'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
     'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
     'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
     'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
     'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/123.0.2420.65',
     'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Vivaldi/6.6.3271.57'
 ];
const ACCEPT_LANGUAGE = 'en-US,en;q=0.9'; // Common accept language header

/**
 * Generates a random password string.
 */
function generateRandomPassword() {
    return crypto.randomBytes(8).toString('hex');
}

/**
 * Gets a random User-Agent string.
 */
function getRandomUserAgent() {
    const index = Math.floor(Math.random() * USER_AGENTS.length);
    return USER_AGENTS[index];
}

/**
 * Runs simple bot requests sequentially, checking for stop signal.
 * Now includes options for realistic User-Agents and custom cookies.
 * Obfuscates the known password in the result data sent to the frontend.
 * @param {object} config
 * @param {string} config.targetUrl
 * @param {string} config.endpoint
 * @param {number} config.numRequests
 * @param {EventEmitter} config.eventEmitter
 * @param {function} config.shouldStop - Function that returns true if stop is requested.
 * @param {boolean} config.useRealUserAgents - Whether to use real User-Agent strings.
 * @param {string|null} config.customCookies - Custom cookie string to include in requests.
 * @returns {Promise<void>}
 */
async function runSimpleBots({ targetUrl, endpoint, numRequests, eventEmitter, shouldStop, useRealUserAgents, customCookies }) {
    return new Promise(async (resolve) => {
        const fullUrl = targetUrl.endsWith('/') ? targetUrl.slice(0, -1) + endpoint : targetUrl + endpoint;
        const knownPassword = "K4sad@!"; // Example known password for testing detection
        const isLogin = endpoint.includes('login');
        // Determine if/when to use the known password during login attempts
        const knownPasswordRequestIndex = isLogin ? (Math.floor(Math.random() * numRequests) + 1) : -1;
        const refererUrl = targetUrl + (isLogin ? '/login' : '/cart'); // Common referer

        console.log(`[SimpleBot] Starting ${numRequests} SEQUENTIAL requests to ${fullUrl}`);
        if (isLogin) console.log(`[SimpleBot] Request #${knownPasswordRequestIndex} will use the known password.`);
        if (useRealUserAgents) console.log(`[SimpleBot] Using real User Agents.`);
        if (customCookies) console.log(`[SimpleBot] Using custom cookies: ${customCookies}`);

        for (let i = 1; i <= numRequests; i++) {
            // *** Check stop signal BEFORE starting the iteration ***
            if (shouldStop()) {
                console.log(`[SimpleBot] Stop requested at iteration ${i}. Exiting loop.`);
                // Optionally emit a specific 'stopped' step if needed by UI
                // eventEmitter.emit('step', { id: i, message: 'Stopped by user.' });
                break; // Exit the loop immediately
            }

            const startTime = Date.now();
            let requestBody = {};
            let passwordUsed = null; // Store the actual password used for the request

            // Determine request body based on endpoint
             if (isLogin) {
                 passwordUsed = (i === knownPasswordRequestIndex) ? knownPassword : generateRandomPassword();
                 requestBody = { email: "user@example.com", password: passwordUsed };
             } else if (endpoint.includes('checkout')) {
                 // Example static checkout payload
                 requestBody = {
                    items: [{ id: (i % 5) + 1, name: `Dummy Item ${i % 5 + 1}`, price: (Math.random() * 50 + 10).toFixed(2), quantity: 1 }],
                    shippingAddress: { name: `Test Bot ${i}`, email: `bot${i}@example.com`, address: `${i} Bot St`, city: "Botville", state: "BT", zipCode: "12345", country: "Botland" },
                    paymentMethod: (i % 2 === 0) ? "credit-card" : "paypal"
                 };
             } else {
                 // Default empty body or specific payload for other endpoints
                 requestBody = {};
             }

            // Construct Headers
            const requestHeaders = {
                'User-Agent': useRealUserAgents ? getRandomUserAgent() : `BotSim/1.0 (Req ${i})`,
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': ACCEPT_LANGUAGE, // Added for more realism if real UAs are used
                'Content-Type': 'application/json',
                'Origin': targetUrl, // Added for more realism
                'Referer': refererUrl, // Added for more realism
                'Sec-Fetch-Dest': 'empty', // Common modern browser header
                'Sec-Fetch-Mode': 'cors',  // Common modern browser header
                'Sec-Fetch-Site': 'same-origin', // Common modern browser header
            };

            if (customCookies && customCookies.trim() !== '') {
                requestHeaders['Cookie'] = customCookies.trim();
            }

            let status = null, statusText = '', error = null, responseDataSnippet = null, responseHeaders = null;

            try {
                console.log(`[SimpleBot] Sending request ${i} with UA: ${requestHeaders['User-Agent']}`);
                const response = await axios.post(fullUrl, requestBody, {
                     timeout: 10000, // Request timeout
                     headers: requestHeaders,
                     validateStatus: function (status) {
                         return true; // Handle all statuses without throwing errors
                     }
                 });

                 // Process response
                 status = response.status;
                 statusText = response.statusText;
                 responseHeaders = response.headers;
                 if (response.data) {
                     responseDataSnippet = (typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data)).substring(0, 100);
                 }
                 console.log(`[SimpleBot] Request ${i} completed: Status ${status}`);

            } catch (err) {
                // Handle network errors or other issues with the request itself
                 console.error(`[SimpleBot] Request ${i} failed: ${err.message}`);
                 error = err.message;
                 responseHeaders = err.response?.headers || null; // Get headers if available on error
                 if (err.response) {
                     // Error with a response from server (e.g., 4xx, 5xx not caught by validateStatus if it were stricter)
                     status = err.response.status;
                     statusText = err.response.statusText;
                 } else if (err.request) {
                     // Request was made but no response received
                     status = 'Error';
                     statusText = 'No response received';
                 } else {
                     // Something else happened in setting up the request
                     status = 'Error';
                     statusText = 'Request setup error';
                 }
            }

            // *** OBFUSCATION LOGIC for known password ***
            // Create a copy of the request body to potentially modify for logging/UI display
            let displayRequestBody = { ...requestBody };
            // If this was a login request using the known password, obfuscate it in the displayed data
            if (isLogin && passwordUsed === knownPassword) {
                 console.log(`[SimpleBot] Req ${i}: Obfuscating known password for result event.`);
                 displayRequestBody.password = '********'; // Obfuscate
            }
            // *** END OBFUSCATION LOGIC ***

            // Prepare result data using the potentially obfuscated body
            const resultData = {
                 id: i, // Iteration ID
                 url: fullUrl,
                 method: 'POST', // Assuming POST, adjust if method varies
                 status: status,
                 statusText: statusText,
                 timestamp: startTime, // Timestamp of when the request attempt started
                 requestBody: displayRequestBody, // Use the (potentially obfuscated) display version
                 requestHeaders: requestHeaders,
                 responseHeaders: responseHeaders,
                 responseDataSnippet: responseDataSnippet,
                 error: error, // Include any error message
            };

            // Emit result event for the UI
            eventEmitter.emit('result', resultData);

        } // End of for loop

        console.log(`[SimpleBot] Loop finished or stopped.`);
        eventEmitter.emit('done'); // Signal that all iterations are done or stopped
        resolve(); // Resolve the promise returned by runSimpleBots
    });
}

module.exports = { runSimpleBots };
