// src/mediumBot.js
const axios = require('axios');
const crypto = require('crypto');

const USER_AGENTS = [ /* ... */ ];
const ACCEPT_LANGUAGE = 'en-US,en;q=0.9';

function generateRandomPassword() { /* ... */ }
function getRandomUserAgent() { /* ... */ }

/**
 * Runs medium bot requests sequentially, checking for stop signal.
 * @param {object} config
 * @param {string} config.targetUrl
 * @param {string} config.endpoint
 * @param {number} config.numRequests
 * @param {EventEmitter} config.eventEmitter
 * @param {string|null} config.cookieString
 * @param {function} config.shouldStop - Function that returns true if stop is requested.
 * @returns {Promise<void>}
 */
async function runMediumBots({ targetUrl, endpoint, numRequests, eventEmitter, cookieString, shouldStop }) { // Added shouldStop
    return new Promise(async (resolve) => {
        const fullUrl = /* ... */ ;
        const knownPassword = "K4sad@!";
        const isLogin = endpoint.includes('login');
        const knownPasswordRequestIndex = isLogin ? (Math.floor(Math.random() * numRequests) + 1) : -1;
        const refererUrl = targetUrl + (isLogin ? '/login' : '/cart');

        console.log(`[MediumBot] Starting ${numRequests} SEQUENTIAL requests to ${fullUrl}`);
        if (isLogin) console.log(`[MediumBot] Request #${knownPasswordRequestIndex} will use the known password.`);
        if (cookieString) console.log(`[MediumBot] Using provided cookie string.`);

        for (let i = 1; i <= numRequests; i++) {
             // *** ADDED: Check if stop was requested before starting iteration ***
            if (shouldStop()) {
                console.log(`[MediumBot] Stop requested at iteration ${i}. Exiting loop.`);
                break; // Exit the loop
            }

            const startTime = Date.now();
            let requestBody = {};
             // ... (determine request body based on endpoint) ...
             if (isLogin) { const password = (i === knownPasswordRequestIndex) ? knownPassword : generateRandomPassword(); requestBody = { email: "user@example.com", password: password }; }
             else if (endpoint.includes('checkout')) { requestBody = { /* Static checkout payload */ }; }
             else { requestBody = {}; }

            const requestHeaders = { /* ... construct headers ... */ };
            if (cookieString && cookieString.trim() !== '') {
                requestHeaders['Cookie'] = cookieString.trim();
            }
            // ...

            let status = null, statusText = '', error = null, responseDataSnippet = null, responseHeaders = null;

            try {
                console.log(`[MediumBot] Sending request ${i}...`);
                const response = await axios.post(fullUrl, requestBody, { /* ... config ... */ });
                // ... (process response) ...
                 status = response.status; statusText = response.statusText; responseHeaders = response.headers;
                 if (response.data) responseDataSnippet = (typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data)).substring(0, 100);
                 console.log(`[MediumBot] Request ${i} completed: Status ${status}`);
            } catch (err) {
                // ... (handle error) ...
                 console.error(`[MediumBot] Request ${i} failed: ${err.message}`); error = err.message; responseHeaders = err.response?.headers || null;
                 if (err.response) { status = err.response.status; statusText = err.response.statusText; } else { status = 'Error'; statusText = err.code || 'Network Error'; }
            }

            const resultData = { /* ... populate resultData ... */
                 id: i, url: fullUrl, method: 'POST', status: status, statusText: statusText,
                 timestamp: startTime, requestBody: requestBody, requestHeaders: requestHeaders,
                 responseHeaders: responseHeaders, responseDataSnippet: responseDataSnippet, error: error,
            };
            eventEmitter.emit('result', resultData);

        } // End loop

        console.log(`[MediumBot] Loop finished or stopped.`);
        eventEmitter.emit('done'); // Emit done regardless
        resolve();
    });
}

module.exports = { runMediumBots };
