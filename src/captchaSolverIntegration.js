// src/captchaSolverIntegration.js
// This file demonstrates how to integrate with external CAPTCHA solving services
// Note: This is for educational purposes and requires API keys from the respective services

const axios = require('axios');

/**
 * 2captcha.com CAPTCHA solving integration
 * Website: https://2captcha.com/
 * Pricing: ~$3 per 1000 CAPTCHAs
 */
class TwoCaptchaSolver {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'http://2captcha.com';
    }

    async solveTurnstile(siteKey, pageUrl, action = 'verify') {
        try {
            // Submit CAPTCHA for solving
            const submitResponse = await axios.post(`${this.baseUrl}/in.php`, {
                method: 'turnstile',
                key: this.apiKey,
                sitekey: siteKey,
                pageurl: pageUrl,
                action: action,
                json: 1
            });

            if (submitResponse.data.status !== 1) {
                throw new Error(`2captcha submit error: ${submitResponse.data.error_text}`);
            }

            const captchaId = submitResponse.data.request;
            console.log(`[2captcha] CAPTCHA submitted with ID: ${captchaId}`);

            // Wait for solution (poll every 5 seconds)
            for (let i = 0; i < 60; i++) { // Wait up to 5 minutes
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                const resultResponse = await axios.get(`${this.baseUrl}/res.php`, {
                    params: {
                        key: this.apiKey,
                        action: 'get',
                        id: captchaId,
                        json: 1
                    }
                });

                if (resultResponse.data.status === 1) {
                    console.log(`[2captcha] CAPTCHA solved: ${resultResponse.data.request}`);
                    return resultResponse.data.request; // This is the token
                }
            }

            throw new Error('2captcha timeout - CAPTCHA not solved within 5 minutes');
        } catch (error) {
            console.error(`[2captcha] Error: ${error.message}`);
            throw error;
        }
    }
}

/**
 * Anti-Captcha.com CAPTCHA solving integration
 * Website: https://anti-captcha.com/
 * Pricing: ~$2.99 per 1000 CAPTCHAs
 */
class AntiCaptchaSolver {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.anti-captcha.com';
    }

    async solveTurnstile(siteKey, pageUrl, action = 'verify') {
        try {
            // Submit CAPTCHA for solving
            const submitResponse = await axios.post(`${this.baseUrl}/createTask`, {
                clientKey: this.apiKey,
                task: {
                    type: 'TurnstileTaskProxyless',
                    websiteURL: pageUrl,
                    websiteKey: siteKey,
                    action: action
                }
            });

            if (submitResponse.data.errorId !== 0) {
                throw new Error(`Anti-captcha submit error: ${submitResponse.data.errorDescription}`);
            }

            const taskId = submitResponse.data.taskId;
            console.log(`[Anti-captcha] CAPTCHA submitted with task ID: ${taskId}`);

            // Wait for solution (poll every 5 seconds)
            for (let i = 0; i < 60; i++) { // Wait up to 5 minutes
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                const resultResponse = await axios.post(`${this.baseUrl}/getTaskResult`, {
                    clientKey: this.apiKey,
                    taskId: taskId
                });

                if (resultResponse.data.status === 'ready') {
                    console.log(`[Anti-captcha] CAPTCHA solved: ${resultResponse.data.solution.token}`);
                    return resultResponse.data.solution.token;
                }
            }

            throw new Error('Anti-captcha timeout - CAPTCHA not solved within 5 minutes');
        } catch (error) {
            console.error(`[Anti-captcha] Error: ${error.message}`);
            throw error;
        }
    }
}

/**
 * CapMonster.cloud CAPTCHA solving integration
 * Website: https://capmonster.cloud/
 * Pricing: ~$2.99 per 1000 CAPTCHAs
 */
class CapMonsterSolver {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.capmonster.cloud';
    }

    async solveTurnstile(siteKey, pageUrl, action = 'verify') {
        try {
            // Submit CAPTCHA for solving
            const submitResponse = await axios.post(`${this.baseUrl}/createTask`, {
                clientKey: this.apiKey,
                task: {
                    type: 'TurnstileTaskProxyless',
                    websiteURL: pageUrl,
                    websiteKey: siteKey,
                    action: action
                }
            });

            if (submitResponse.data.errorId !== 0) {
                throw new Error(`CapMonster submit error: ${submitResponse.data.errorDescription}`);
            }

            const taskId = submitResponse.data.taskId;
            console.log(`[CapMonster] CAPTCHA submitted with task ID: ${taskId}`);

            // Wait for solution (poll every 5 seconds)
            for (let i = 0; i < 60; i++) { // Wait up to 5 minutes
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                const resultResponse = await axios.post(`${this.baseUrl}/getTaskResult`, {
                    clientKey: this.apiKey,
                    taskId: taskId
                });

                if (resultResponse.data.status === 'ready') {
                    console.log(`[CapMonster] CAPTCHA solved: ${resultResponse.data.solution.token}`);
                    return resultResponse.data.solution.token;
                }
            }

            throw new Error('CapMonster timeout - CAPTCHA not solved within 5 minutes');
        } catch (error) {
            console.error(`[CapMonster] Error: ${error.message}`);
            throw error;
        }
    }
}

/**
 * Example integration with Playwright
 * This shows how to use external CAPTCHA solving services with our bot
 */
async function solveCaptchaWithExternalService(page, eventEmitter, requestId, serviceType = '2captcha') {
    try {
        // Extract CAPTCHA sitekey from the page
        const sitekeyElement = await page.locator('[data-sitekey]').first();
        if (await sitekeyElement.count() === 0) {
            throw new Error('No CAPTCHA sitekey found on page');
        }

        const sitekey = await sitekeyElement.getAttribute('data-sitekey');
        const pageUrl = page.url();
        
        emitStep(eventEmitter, requestId, `Found CAPTCHA sitekey: ${sitekey}`);
        emitStep(eventEmitter, requestId, `Submitting to ${serviceType} for solving...`);

        // Initialize the appropriate solver
        let solver;
        const apiKey = process.env[`${serviceType.toUpperCase()}_API_KEY`];
        
        if (!apiKey) {
            throw new Error(`${serviceType} API key not found in environment variables`);
        }

        switch (serviceType.toLowerCase()) {
            case '2captcha':
                solver = new TwoCaptchaSolver(apiKey);
                break;
            case 'anticaptcha':
                solver = new AntiCaptchaSolver(apiKey);
                break;
            case 'capmonster':
                solver = new CapMonsterSolver(apiKey);
                break;
            default:
                throw new Error(`Unknown service type: ${serviceType}`);
        }

        // Solve the CAPTCHA
        const token = await solver.solveTurnstile(sitekey, pageUrl);
        
        emitStep(eventEmitter, requestId, `CAPTCHA solved by ${serviceType}: ${token.substring(0, 20)}...`);

        // Inject the token into the page
        await page.evaluate((token) => {
            // Find the CAPTCHA response field and set the token
            const responseField = document.querySelector('[name="cf-turnstile-response"]') || 
                                document.querySelector('[name="g-recaptcha-response"]') ||
                                document.querySelector('input[name*="captcha"]');
            
            if (responseField) {
                responseField.value = token;
                // Trigger change event
                responseField.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, token);

        emitStep(eventEmitter, requestId, 'CAPTCHA token injected into form');
        return true;

    } catch (error) {
        emitStep(eventEmitter, requestId, `External CAPTCHA solving failed: ${error.message}`);
        console.error(`[External CAPTCHA Solver] Error: ${error.message}`);
        return false;
    }
}

/**
 * Free CAPTCHA solving alternatives (for educational purposes)
 */
class FreeCaptchaAlternatives {
    
    /**
     * Use browser automation to solve simple CAPTCHAs
     * This is what we're already doing in captchaBot.js
     */
    static async solveWithAutomation(page, eventEmitter, requestId) {
        // This is essentially what our current captchaBot.js does
        emitStep(eventEmitter, requestId, 'Using browser automation for CAPTCHA solving...');
        return true;
    }

    /**
     * Use OCR to solve text-based CAPTCHAs
     * Requires: tesseract-ocr or similar OCR library
     */
    static async solveWithOCR(page, eventEmitter, requestId) {
        try {
            emitStep(eventEmitter, requestId, 'Attempting OCR-based CAPTCHA solving...');
            
            // This would require additional setup with OCR libraries
            // For now, just log the attempt
            emitStep(eventEmitter, requestId, 'OCR solving not implemented (requires tesseract-ocr)');
            return false;
        } catch (error) {
            emitStep(eventEmitter, requestId, `OCR solving failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Use machine learning models for CAPTCHA solving
     * This is more advanced and requires trained models
     */
    static async solveWithML(page, eventEmitter, requestId) {
        try {
            emitStep(eventEmitter, requestId, 'Attempting ML-based CAPTCHA solving...');
            
            // This would require trained ML models
            // For now, just log the attempt
            emitStep(eventEmitter, requestId, 'ML solving not implemented (requires trained models)');
            return false;
        } catch (error) {
            emitStep(eventEmitter, requestId, `ML solving failed: ${error.message}`);
            return false;
        }
    }
}

module.exports = {
    TwoCaptchaSolver,
    AntiCaptchaSolver,
    CapMonsterSolver,
    solveCaptchaWithExternalService,
    FreeCaptchaAlternatives
}; 