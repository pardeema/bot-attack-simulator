// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const EventEmitter = require('events');
const { runSimpleBots } = require('./src/simpleBot'); // Updated simpleBot
// const { runMediumBots } = require('./src/mediumBot'); // This line will be removed
const { runComplexBots } = require('./src/complexBot'); // This will be our new "Medium"

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const attackEmitter = new EventEmitter();
attackEmitter.setMaxListeners(20); // Increase listener limit if many clients connect

// Global flag to signal stop
let stopRequested = false;

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/launch-attack', (req, res) => {
    // Destructure all potential parameters from the request body
    const {
        targetUrl,
        endpoint,
        numRequests,
        botType,
        cookieString, // This was for the old Medium bot, now simpleBotCookies is used for Simple
        useRealUserAgents, // New for Simple Bot
        simpleBotCookies   // New for Simple Bot
    } = req.body;

    if (!targetUrl || !endpoint || !numRequests || !botType) {
        return res.status(400).json({ message: 'Missing required parameters.' });
    }
    const count = parseInt(numRequests, 10);
    if (isNaN(count) || count <= 0 || count > 1000) { // Max 1000 requests
        return res.status(400).json({ message: 'Invalid number of requests (must be 1-1000).' });
    }

    console.log(`[Server] Received launch request: ${botType} bots, ${count} times to ${targetUrl}${endpoint}`);

    // Reset stop flag before starting a new attack
    stopRequested = false;

    // Base bot configuration
    const botConfig = {
         targetUrl,
         endpoint,
         numRequests: count,
         eventEmitter: attackEmitter,
         shouldStop: () => stopRequested // Pass a function to check the stop flag
    };

    let botRunnerPromise;

    if (botType === 'Simple') {
        console.log(`[Server] SimpleBot options: Real UAs: ${useRealUserAgents}, Cookies: '${simpleBotCookies}'`);
        botRunnerPromise = runSimpleBots({
            ...botConfig,
            useRealUserAgents: !!useRealUserAgents, // Ensure boolean
            customCookies: simpleBotCookies || null
        });
    } else if (botType === 'Medium') { // This is the old "Complex" bot (Browser Emulation)
        // cookieString is part of req.body but runComplexBots doesn't actively use it.
        // If it were to use cookies, they'd need to be managed via Playwright's context.
        console.log(`[Server] MediumBot (Browser Emulation) selected.`);
        botRunnerPromise = runComplexBots({
            ...botConfig,
            cookieString: null // Explicitly not passing UI cookie string here, Playwright handles its own cookies
        });
    }
    // Removed old 'Medium' bot (runMediumBots)
    else {
        console.warn(`[Server] Bot type "${botType}" not implemented or unrecognized.`);
        return res.status(400).json({ message: `Bot type "${botType}" not implemented or unrecognized.` });
    }

    // Catch errors from the bot running process
    botRunnerPromise.catch(error => {
        console.error(`[Server] Error during background ${botType} bot simulation:`, error);
        // Emit a generic error event to the stream
        attackEmitter.emit('error', { message: `${botType} bot simulation failed`, error: error.message });
        // Ensure 'done' is emitted if the runner promise rejects unexpectedly,
        // but only if not already stopped (to avoid duplicate 'done' events).
        if (!stopRequested) {
             attackEmitter.emit('done');
        }
    });

    // Respond to the client that the attack has been initiated
    res.status(202).json({ message: `${botType} attack initiated. Connect to /attack-stream for results.` });
});

// Endpoint to handle stop requests
app.post('/stop-attack', (req, res) => {
    console.log('[Server] Received stop request.');
    stopRequested = true; // Set the global stop flag
    // Optionally, you could emit a 'stopping' event here if needed
    // attackEmitter.emit('statusUpdate', { message: 'Stopping simulation...' });
    res.status(200).json({ message: 'Stop request received. Attempting to halt simulation.' });
});


// Server-Sent Events stream for attack results
app.get('/attack-stream', (req, res) => {
    console.log('[Server] SSE client connected.');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // Send headers immediately

    // Define listeners for events from the attackEmitter
    const resultListener = (resultData) => {
        res.write(`event: result\ndata: ${JSON.stringify(resultData)}\n\n`);
    };
    const stepListener = (stepData) => { // For detailed steps from complex/workflow bots
        res.write(`event: step\ndata: ${JSON.stringify(stepData)}\n\n`);
    };
    const doneListener = () => {
        res.write(`event: done\ndata: ${JSON.stringify({ message: "Stream finished or simulation stopped" })}\n\n`);
        cleanup(); // Clean up this client's listeners
    };
    const errorListener = (errorData) => { // For errors emitted by bot runners
        res.write(`event: error\ndata: ${JSON.stringify(errorData)}\n\n`);
        // Optionally, you might want to also call cleanup() here if errors are always terminal for the stream
    };

    // Attach listeners
    attackEmitter.on('result', resultListener);
    attackEmitter.on('step', stepListener);
    attackEmitter.on('done', doneListener);
    attackEmitter.on('error', errorListener);

    // Cleanup function to remove listeners and end response
    const cleanup = () => {
        console.log('[Server] SSE client cleaning up listeners.');
        attackEmitter.off('result', resultListener);
        attackEmitter.off('step', stepListener);
        attackEmitter.off('done', doneListener);
        attackEmitter.off('error', errorListener);
        if (!res.writableEnded) {
            res.end(); // Close the connection
            console.log('[Server] SSE connection closed.');
        }
    };

    // Handle client disconnect
    req.on('close', () => {
        console.log('[Server] SSE client disconnected.');
        cleanup();
    });
});

app.listen(port, () => {
  console.log(`Bot Attack Simulator server running at http://localhost:${port}`);
});
