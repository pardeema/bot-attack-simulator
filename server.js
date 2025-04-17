// server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const EventEmitter = require('events');
const { runSimpleBots } = require('./src/simpleBot');
const { runMediumBots } = require('./src/mediumBot');
const { runComplexBots } = require('./src/complexBot');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const attackEmitter = new EventEmitter();
attackEmitter.setMaxListeners(20);

// --- Global flag to signal stop ---
let stopRequested = false;

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/launch-attack', (req, res) => {
    const { targetUrl, endpoint, numRequests, botType, cookieString } = req.body;

    if (!targetUrl || !endpoint || !numRequests || !botType) {
        return res.status(400).json({ message: 'Missing required parameters.' });
    }
    const count = parseInt(numRequests, 10);
    if (isNaN(count) || count <= 0 || count > 1000) {
        return res.status(400).json({ message: 'Invalid number of requests (must be 1-1000).' });
    }

    console.log(`[Server] Received launch request: ${botType} bots, ${count} times to ${targetUrl}${endpoint}`);
    if (botType === 'Medium' && cookieString) console.log(`[Server] Using provided cookie string.`);

    // --- Reset stop flag before starting ---
    stopRequested = false;

    const botConfig = {
         targetUrl, endpoint, numRequests: count,
         eventEmitter: attackEmitter, cookieString: cookieString || null,
         // --- Pass a function to check the stop flag ---
         shouldStop: () => stopRequested
    };

    let botRunnerPromise;
    if (botType === 'Simple') botRunnerPromise = runSimpleBots(botConfig);
    else if (botType === 'Medium') botRunnerPromise = runMediumBots(botConfig);
    else if (botType === 'Complex') botRunnerPromise = runComplexBots(botConfig);
    else {
        console.warn(`[Server] Bot type "${botType}" not implemented.`);
        return res.status(400).json({ message: `Bot type "${botType}" not implemented yet.` });
    }

    botRunnerPromise.catch(error => {
        console.error(`[Server] Error during background ${botType} bot simulation:`, error);
        attackEmitter.emit('error', { message: `${botType} bot simulation failed`, error: error.message });
        // Ensure 'done' is emitted if the runner promise rejects unexpectedly
        // This might be redundant if bot logic's finally block handles it, but safe to add
        if (!stopRequested) { // Avoid emitting done if already stopped and emitted
             attackEmitter.emit('done');
        }
    });

    res.status(202).json({ message: `${botType} attack initiated. Connect to /attack-stream for results.` });
});

// --- ADDED: Endpoint to handle stop requests ---
app.post('/stop-attack', (req, res) => {
    console.log('[Server] Received stop request.');
    stopRequested = true; // Set the flag
    res.status(200).json({ message: 'Stop request received. Attempting to halt simulation.' });
});


app.get('/attack-stream', (req, res) => { /* ... SSE handling logic (same as before) ... */
    console.log('[Server] SSE client connected.');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const resultListener = (resultData) => { res.write(`event: result\ndata: ${JSON.stringify(resultData)}\n\n`); };
    const stepListener = (stepData) => { res.write(`event: step\ndata: ${JSON.stringify(stepData)}\n\n`); };
    const doneListener = () => { res.write(`event: done\ndata: ${JSON.stringify({ message: "Stream finished" })}\n\n`); cleanup(); };
    const errorListener = (errorData) => { res.write(`event: error\ndata: ${JSON.stringify(errorData)}\n\n`); };

    attackEmitter.on('result', resultListener);
    attackEmitter.on('step', stepListener);
    attackEmitter.on('done', doneListener);
    attackEmitter.on('error', errorListener);

    const cleanup = () => {
        console.log('[Server] SSE client cleaning up listeners.');
        attackEmitter.off('result', resultListener);
        attackEmitter.off('step', stepListener);
        attackEmitter.off('done', doneListener);
        attackEmitter.off('error', errorListener);
        if (!res.writableEnded) { res.end(); console.log('[Server] SSE connection closed.'); }
    };

    req.on('close', () => { console.log('[Server] SSE client disconnected.'); cleanup(); });
});

app.listen(port, () => {
  console.log(`Bot Attack Simulator server running at http://localhost:${port}`);
});
