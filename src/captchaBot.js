// src/captchaBot.js
const { chromium } = require('playwright');
const crypto = require('crypto');

// --- Selectors ---
const CAPTCHA_LOGIN_PAGE_URL_SUFFIX = '/captcha-login';
const USERNAME_SELECTOR = '#email';
const PASSWORD_SELECTOR = '#password';
const SUBMIT_BUTTON_SELECTOR = 'button[type="submit"]';
const CAPTCHA_LOGIN_API_ENDPOINT_PATH = '/api/auth/captcha-login';

// CAPTCHA-specific selectors (these may need adjustment based on the actual CAPTCHA implementation)
const CAPTCHA_IFRAME_SELECTOR = 'iframe[src*="turnstile"]'; // Cloudflare Turnstile
const CAPTCHA_CHECKBOX_SELECTOR = '.cf-turnstile-response';
const CAPTCHA_CHALLENGE_SELECTOR = '.cf-turnstile-challenge';

// List of realistic User Agents
const USER_AGENTS_LIST = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/123.0.2420.97'
];

/**
 * Gets a random User-Agent string.
 */
const getRandomRealisticUA = () => USER_AGENTS_LIST[Math.floor(Math.random() * USER_AGENTS_LIST.length)];

function generateRandomPassword() { 
    return crypto.randomBytes(8).toString('hex'); 
}

/**
 * Emits a step event with optional network details.
 */
function emitStep(emitter, id, message, details = null) {
    console.log(`[CaptchaBot] Req ${id}: ${message}`);
    emitter.emit('step', { id, message, details });
}

/**
 * Extracts request details from a Playwright Request object.
 */
async function getRequestDetails(request) {
    if (!request) return {};

    let requestBody = null;
    try {
        requestBody = request.postDataJSON();
    } catch {
        const buffer = request.postDataBuffer();
        if (buffer) {
            const headers = await request.allHeaders();
            const contentType = headers['content-type'];
            if (contentType && (contentType.includes('text') || contentType.includes('json') || contentType.includes('xml') || contentType.includes('x-www-form-urlencoded'))) {
                requestBody = buffer.toString('utf-8');
            } else {
                requestBody = `(Binary data: ${buffer.length} bytes)`;
            }
        }
    }

    return {
        url: request.url(),
        method: request.method(),
        requestHeaders: await request.allHeaders(),
        requestBody: requestBody,
    };
}

/**
 * Extracts response details from a Playwright Response object.
 */
async function getResponseDetails(response) {
    if (!response) return { responseStatus: null, responseHeaders: null, responseBodySnippet: null, error: 'No response object provided' };

    let bodySnippet = null;
    let error = null;

    try {
        const buffer = await response.body();
        bodySnippet = buffer.toString('utf-8').substring(0, 150);
    } catch (e) {
        console.warn(`[CaptchaBot] Warn: Could not get response body for ${response.url()}: ${e.message}`);
        error = `Could not read response body: ${e.message.substring(0, 100)}`;
        bodySnippet = '(Error reading body)';
    }

    return {
        responseStatus: response.status(),
        responseStatusText: response.statusText(),
        responseHeaders: await response.allHeaders(),
        responseBodySnippet: bodySnippet,
        error: error
    };
}

/**
 * Attempts to solve CAPTCHA challenges using various techniques.
 */
async function attemptCaptchaSolve(page, eventEmitter, requestId) {
    emitStep(eventEmitter, requestId, 'Attempting to solve CAPTCHA challenge...');

    try {
        // Method 1: Look for CAPTCHA iframe and interact with it
        const captchaIframe = await page.locator(CAPTCHA_IFRAME_SELECTOR).first();
        if (await captchaIframe.count() > 0) {
            emitStep(eventEmitter, requestId, 'Found CAPTCHA iframe, attempting interaction...');
            
            // Switch to iframe context
            const frame = await captchaIframe.elementHandle();
            if (frame) {
                const iframe = await frame.contentFrame();
                if (iframe) {
                    // Try to find and click the CAPTCHA checkbox
                    const checkbox = await iframe.locator('input[type="checkbox"]').first();
                    if (await checkbox.count() > 0) {
                        emitStep(eventEmitter, requestId, 'Clicking CAPTCHA checkbox...');
                        await checkbox.click();
                        await page.waitForTimeout(2000); // Wait for CAPTCHA to process
                    }
                }
            }
        }

        // Method 2: Look for any CAPTCHA-related elements on the page
        const captchaElements = await page.locator('[class*="captcha"], [class*="turnstile"], [id*="captcha"], [id*="turnstile"]').all();
        if (captchaElements.length > 0) {
            emitStep(eventEmitter, requestId, `Found ${captchaElements.length} CAPTCHA-related elements, attempting interaction...`);
            
            for (let i = 0; i < captchaElements.length; i++) {
                try {
                    await captchaElements[i].click();
                    emitStep(eventEmitter, requestId, `Clicked CAPTCHA element ${i + 1}`);
                    await page.waitForTimeout(1000);
                } catch (e) {
                    console.warn(`[CaptchaBot] Could not click CAPTCHA element ${i + 1}: ${e.message}`);
                }
            }
        }

        // Method 3: Try to find and interact with any interactive elements that might be CAPTCHA
        const interactiveElements = await page.locator('button, input[type="checkbox"], .clickable, [role="button"]').all();
        let captchaInteractions = 0;
        
        for (let element of interactiveElements) {
            try {
                const text = await element.textContent();
                const className = await element.getAttribute('class') || '';
                const id = await element.getAttribute('id') || '';
                
                // Look for CAPTCHA-related text or attributes
                if (text && (text.toLowerCase().includes('captcha') || text.toLowerCase().includes('verify') || 
                    className.toLowerCase().includes('captcha') || id.toLowerCase().includes('captcha'))) {
                    emitStep(eventEmitter, requestId, `Interacting with potential CAPTCHA element: "${text}"`);
                    await element.click();
                    captchaInteractions++;
                    await page.waitForTimeout(1000);
                }
            } catch (e) {
                // Ignore errors for individual elements
            }
        }

        if (captchaInteractions > 0) {
            emitStep(eventEmitter, requestId, `Completed ${captchaInteractions} CAPTCHA interactions`);
        } else {
            emitStep(eventEmitter, requestId, 'No specific CAPTCHA elements found, proceeding with form submission');
        }

        // Wait a bit for any CAPTCHA processing
        await page.waitForTimeout(3000);

    } catch (error) {
        emitStep(eventEmitter, requestId, `CAPTCHA interaction error: ${error.message}`);
        console.warn(`[CaptchaBot] CAPTCHA interaction failed: ${error.message}`);
    }
}

/**
 * Runs CAPTCHA-solving bot workflows using Playwright.
 */
async function runCaptchaBots({ targetUrl, endpoint, numRequests, eventEmitter, shouldStop }) {
    return new Promise(async (resolve) => {
        const isCaptchaLogin = endpoint.includes('captcha-login');

        if (!isCaptchaLogin) {
            console.warn(`[CaptchaBot] Endpoint "${endpoint}" is not a CAPTCHA login endpoint. Falling back to regular login workflow.`);
            emitStep(eventEmitter, 1, `CAPTCHA bot used for non-CAPTCHA endpoint "${endpoint}". Falling back to regular login workflow.`);
        }

        const knownPassword = "K4sad@!";
        const knownPasswordRequestIndex = Math.floor(Math.random() * numRequests) + 1;
        console.log(`[CaptchaBot] Starting ${numRequests} ${isCaptchaLogin ? 'CAPTCHA-solving' : 'login'} workflows...`);
        console.log(`[CaptchaBot] Request #${knownPasswordRequestIndex} will use the known password.`);

        for (let i = 1; i <= numRequests; i++) {
            if (shouldStop()) {
                console.log(`[CaptchaBot] Stop requested at iteration ${i}. Exiting loop.`);
                emitStep(eventEmitter, i, 'Stop requested by user.');
                break;
            }

            const startTime = Date.now();
            let browser = null;
            let finalApiRequestDetails = {};
            let finalApiResponseDetails = {};
            let resultData = {
                id: i, 
                url: targetUrl + endpoint, 
                method: `WORKFLOW (${isCaptchaLogin ? 'CAPTCHA Login' : 'Login'})`,
                status: null, 
                statusText: '', 
                timestamp: startTime,
                requestBody: null, 
                requestHeaders: null, 
                responseHeaders: null,
                responseDataSnippet: null, 
                error: null,
            };

            const currentRealisticUA = getRandomRealisticUA();

            try {
                emitStep(eventEmitter, i, 'Launching browser for CAPTCHA solving...');
                const launchOptions = {
                    headless: true,
                    args: [
                        '--disable-blink-features=AutomationControlled',
                        '--disable-web-security',
                        '--disable-features=VizDisplayCompositor'
                    ]
                };
                browser = await chromium.launch(launchOptions);

                const context = await browser.newContext({
                    userAgent: currentRealisticUA,
                    viewport: { width: 1920, height: 1080 },
                    locale: 'en-US',
                    timezoneId: 'America/New_York',
                });
                emitStep(eventEmitter, i, `Browser context created with User-Agent: ${currentRealisticUA}`);

                const page = await context.newPage();
                const pendingRequests = new Map();

                // Monitor network requests
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

                // Navigate to login page
                const loginPageUrl = targetUrl + (isCaptchaLogin ? CAPTCHA_LOGIN_PAGE_URL_SUFFIX : '/login');
                const apiEndpointPath = isCaptchaLogin ? CAPTCHA_LOGIN_API_ENDPOINT_PATH : '/api/auth/login';
                
                emitStep(eventEmitter, i, `Navigating to ${loginPageUrl}...`);
                await page.goto(loginPageUrl, { 
                    waitUntil: 'domcontentloaded', 
                    timeout: 30000 
                });

                // Log page info
                const pageTitle = await page.title();
                const currentUrl = page.url();
                emitStep(eventEmitter, i, `Page loaded: "${pageTitle}" at ${currentUrl}`);

                // Fill login form
                emitStep(eventEmitter, i, 'Filling login form...');
                const password = (i === knownPasswordRequestIndex) ? knownPassword : generateRandomPassword();
                const email = "user@example.com";
                
                await page.locator(USERNAME_SELECTOR).fill(email);
                await page.locator(PASSWORD_SELECTOR).fill(password);

                // Attempt to solve CAPTCHA only for CAPTCHA login
                if (isCaptchaLogin) {
                    await attemptCaptchaSolve(page, eventEmitter, i);
                } else {
                    emitStep(eventEmitter, i, 'Skipping CAPTCHA solving for regular login endpoint');
                }

                // Set up API response monitoring
                const apiResponsePromise = page.waitForResponse(
                    resp => resp.url().includes(apiEndpointPath) && resp.request().method() === 'POST',
                    { timeout: 20000 }
                );

                // Submit the form
                emitStep(eventEmitter, i, `Submitting form${isCaptchaLogin ? ' with CAPTCHA solution' : ''}...`);
                await page.locator(SUBMIT_BUTTON_SELECTOR).click();

                emitStep(eventEmitter, i, `Waiting for API response (${apiEndpointPath})...`);
                
                let apiResponse, apiRequest;
                try {
                    apiResponse = await apiResponsePromise;
                    apiRequest = apiResponse.request();
                } catch (timeoutError) {
                    const timeoutMessage = isCaptchaLogin ? 
                        'CAPTCHA login timeout - CAPTCHA solving may have failed' : 
                        'Login timeout - request may have been blocked';
                    emitStep(eventEmitter, i, timeoutMessage);
                    finalApiRequestDetails = { url: apiEndpointPath, method: 'POST', requestHeaders: {}, requestBody: null };
                    finalApiResponseDetails = { 
                        responseStatus: 400, 
                        responseStatusText: 'Login Timeout', 
                        responseHeaders: {}, 
                        responseBodySnippet: `{"message":"${isCaptchaLogin ? 'CAPTCHA solving' : 'Login'} failed - timeout waiting for response"}`,
                        error: `API response timeout - ${isCaptchaLogin ? 'CAPTCHA solving' : 'Login'} may have been unsuccessful`
                    };
                    resultData.status = 400;
                    resultData.statusText = 'Login Timeout';
                }

                if (apiResponse && apiRequest) {
                    finalApiRequestDetails = await getRequestDetails(apiRequest);
                    finalApiResponseDetails = await getResponseDetails(apiResponse);

                    emitStep(eventEmitter, i, `API Call: ${apiEndpointPath}`, {
                        ...finalApiRequestDetails, ...finalApiResponseDetails
                    });

                    resultData.status = finalApiResponseDetails.responseStatus;
                    resultData.statusText = finalApiResponseDetails.responseStatusText;
                }

                emitStep(eventEmitter, i, `${isCaptchaLogin ? 'CAPTCHA solving' : 'Login'} workflow completed. Final API Status: ${resultData.status}`);

            } catch (err) {
                console.error(`[CaptchaBot] Req ${i}: Workflow failed - ${err.message.split('\n')[0]}`);
                resultData.error = err.message.substring(0, 250);
                resultData.status = 'Error';
                resultData.statusText = 'CAPTCHA Workflow Operation Failed';
                emitStep(eventEmitter, i, `Error: ${resultData.error}`);
            } finally {
                if (browser) {
                    emitStep(eventEmitter, i, 'Closing browser...');
                    await browser.close();
                    emitStep(eventEmitter, i, 'Browser closed.');
                }
            }

            // Set result data
            resultData.requestHeaders = finalApiRequestDetails?.requestHeaders || {};
            resultData.responseHeaders = finalApiResponseDetails?.responseHeaders || {};
            resultData.responseDataSnippet = finalApiResponseDetails?.responseBodySnippet || '';

            let displayRequestBody = finalApiRequestDetails?.requestBody || null;
            if (i === knownPasswordRequestIndex && displayRequestBody && typeof displayRequestBody === 'object') {
                console.log(`[CaptchaBot] Req ${i}: Obfuscating known password for final result event.`);
                try {
                    const tempBody = JSON.parse(JSON.stringify(displayRequestBody));
                    if (tempBody.password) {
                        tempBody.password = '********';
                    }
                    displayRequestBody = tempBody;
                } catch (e) {
                    console.warn(`[CaptchaBot] Req ${i}: Could not obfuscate password, request body not a simple object.`);
                }
            }
            resultData.requestBody = displayRequestBody;

            if (resultData.error && resultData.status !== 'Error') {
                resultData.status = 'Error';
                resultData.statusText = resultData.statusText || 'CAPTCHA Workflow Incomplete';
            } else if (resultData.status === null) {
                resultData.status = 'Unknown';
                resultData.statusText = 'CAPTCHA workflow ended without tracked API call status';
            }

            eventEmitter.emit('result', resultData);
        }

        console.log(`[CaptchaBot] Loop finished or stopped.`);
        eventEmitter.emit('done');
        resolve();
    });
}

module.exports = { runCaptchaBots }; 