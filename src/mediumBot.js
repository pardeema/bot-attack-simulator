// src/mediumBot.js
const axios = require('axios');
const crypto = require('crypto');

const USER_AGENTS = [ // Shortened list for brevity
     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
     'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
     'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
     'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
 ];
const ACCEPT_LANGUAGE = 'en-US,en;q=0.9';

function generateRandomPassword() { return crypto.randomBytes(8).toString('hex'); }
function getRandomUserAgent() { const index = Math.floor(Math.random() * USER_AGENTS.length); return USER_AGENTS[index]; }

/**
 * Runs medium bot requests sequentially, checking for stop signal.
 * Obfuscates the known password in the result data sent to the frontend.
 * @param {object} config
 * @param {string} config.targetUrl
 * @param {string} config.endpoint
 * @param {number} config.numRequests
 * @param {EventEmitter} config.eventEmitter
 * @param {string|null} config.cookieString
 * @param {function} config.shouldStop - Function that returns true if stop is requested.
 * @returns {Promise<void>}
 */
async function runMediumBots({ targetUrl, endpoint, numRequests, eventEmitter, cookieString, shouldStop }) {
    return new Promise(async (resolve) => {
        const fullUrl = targetUrl.endsWith('/') ? targetUrl.slice(0, -1) + endpoint : targetUrl + endpoint;
        const knownPassword = "K4sad@!";
        const isLogin = endpoint.includes('login');
        const knownPasswordRequestIndex = isLogin ? (Math.floor(Math.random() * numRequests) + 1) : -1;
        const refererUrl = targetUrl + (isLogin ? '/login' : '/cart');

        console.log(`[MediumBot] Starting ${numRequests} SEQUENTIAL requests to ${fullUrl}`);
        if (isLogin) console.log(`[MediumBot] Request #${knownPasswordRequestIndex} will use the known password.`);
        if (cookieString) console.log(`[MediumBot] Using provided cookie string.`);

        for (let i = 1; i <= numRequests; i++) {
            if (shouldStop()) {
                console.log(`[MediumBot] Stop requested at iteration ${i}. Exiting loop.`);
                break;
            }

            const startTime = Date.now();
            let requestBody = {};
            let passwordUsed = null; // Store the actual password used

            // Determine request body
             if (isLogin) {
                 passwordUsed = (i === knownPasswordRequestIndex) ? knownPassword : generateRandomPassword();
                 requestBody = { email: "user@example.com", password: passwordUsed };
             } else if (endpoint.includes('checkout')) {
                 requestBody = { /* Static checkout payload */ };
             } else {
                 requestBody = {};
             }

            // Construct Headers
            const requestHeaders = {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': ACCEPT_LANGUAGE,
                'Content-Type': 'application/json',
                'Origin': targetUrl,
                'Referer': refererUrl,
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
            };
            if (cookieString && cookieString.trim() !== '') {
                requestHeaders['Cookie'] = cookieString.trim();
            }

            let status = null, statusText = '', error = null, responseDataSnippet = null, responseHeaders = null;

            try {
                console.log(`[MediumBot] Sending request ${i}...`);
                const response = await axios.post(fullUrl, requestBody, {
                    timeout: 10000,
                    headers: requestHeaders,
                    validateStatus: function (status) { return true; }
                });                // Process response
                 status = response.status; statusText = response.statusText; responseHeaders = response.headers;
                 if (response.data) responseDataSnippet = (typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data)).substring(0, 100);
                 console.log(`[MediumBot] Request ${i} completed: Status ${status}`);
            } catch (err) {
                // Handle error
                 console.error(`[MediumBot] Request ${i} failed: ${err.message}`); error = err.message; responseHeaders = err.response?.headers || null;
                 if (err.response) { status = err.response.status; statusText = err.response.statusText; } else { status = 'Error'; statusText = err.code || 'Network Error'; }
            }

            // *** OBFUSCATION LOGIC ***
            let displayRequestBody = { ...requestBody };
            if (isLogin && passwordUsed === knownPassword) {
                 displayRequestBody.password = '********'; // Obfuscate
            }
            // *** END OBFUSCATION LOGIC ***

            // Prepare result data
            const resultData = {
                 id: i, url: fullUrl, method: 'POST', status: status, statusText: statusText,
                 timestamp: startTime,
                 requestBody: displayRequestBody, // Use display version
                 requestHeaders: requestHeaders,
                 responseHeaders: responseHeaders, responseDataSnippet: responseDataSnippet, error: error,
            };
            // Emit result
            eventEmitter.emit('result', resultData);

        } // End loop

        console.log(`[MediumBot] Loop finished or stopped.`);
        eventEmitter.emit('done');
        resolve();
    });
}

module.exports = { runMediumBots };
