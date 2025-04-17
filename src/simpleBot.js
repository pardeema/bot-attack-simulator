// src/simpleBot.js
const axios = require('axios');
const crypto = require('crypto');

function generateRandomPassword() { /* ... */ }

/**
 * Runs simple bot requests sequentially, checking for stop signal.
 * @param {object} config
 * @param {string} config.targetUrl
 * @param {string} config.endpoint
 * @param {number} config.numRequests
 * @param {EventEmitter} config.eventEmitter
 * @param {function} config.shouldStop - Function that returns true if stop is requested.
 * @returns {Promise<void>}
 */
async function runSimpleBots({ targetUrl, endpoint, numRequests, eventEmitter, shouldStop }) { // Added shouldStop
    return new Promise(async (resolve) => {
        const fullUrl = /* ... */ ;
        const knownPassword = "K4sad@!";
        const isLogin = endpoint.includes('login');
        const knownPasswordRequestIndex = isLogin ? (Math.floor(Math.random() * numRequests) + 1) : -1;

        console.log(`[SimpleBot] Starting ${numRequests} SEQUENTIAL requests to ${fullUrl}`);
        if (isLogin) console.log(`[SimpleBot] Request #${knownPasswordRequestIndex} will use the known password.`);

        for (let i = 1; i <= numRequests; i++) {
            // *** ADDED: Check if stop was requested before starting iteration ***
            if (shouldStop()) {
                console.log(`[SimpleBot] Stop requested at iteration ${i}. Exiting loop.`);
                break; // Exit the loop
            }

            const startTime = Date.now();
            let requestBody = {};
            // ... (determine request body based on endpoint) ...
             if (isLogin) { const password = (i === knownPasswordRequestIndex) ? knownPassword : generateRandomPassword(); requestBody = { email: "user@example.com", password: password }; }
             else if (endpoint.includes('checkout')) { requestBody = { /* Static checkout payload */ }; }
             else { requestBody = {}; }

            const requestHeaders = { /* ... */ };
            let status = null, statusText = '', error = null, responseDataSnippet = null, responseHeaders = null;

            try {
                console.log(`[SimpleBot] Sending request ${i}...`);
                const response = await axios.post(fullUrl, requestBody, { /* ... config ... */ });
                // ... (process response) ...
                 status = response.status; statusText = response.statusText; responseHeaders = response.headers;
                 if (response.data) responseDataSnippet = (typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data)).substring(0, 100);
                 console.log(`[SimpleBot] Request ${i} completed: Status ${status}`);
            } catch (err) {
                // ... (handle error) ...
                 console.error(`[SimpleBot] Request ${i} failed: ${err.message}`); error = err.message; responseHeaders = err.response?.headers || null;
                 if (err.response) { status = err.response.status; statusText = err.response.statusText; } else { status = 'Error'; statusText = err.code || 'Network Error'; }
            }

            const resultData = { /* ... populate resultData ... */
                 id: i, url: fullUrl, method: 'POST', status: status, statusText: statusText,
                 timestamp: startTime, requestBody: requestBody, requestHeaders: requestHeaders,
                 responseHeaders: responseHeaders, responseDataSnippet: responseDataSnippet, error: error,
            };
            eventEmitter.emit('result', resultData);

        } // End of for loop

        console.log(`[SimpleBot] Loop finished or stopped.`);
        eventEmitter.emit('done'); // Emit done regardless of whether loop finished or broke
        resolve();
    });
}

module.exports = { runSimpleBots };
