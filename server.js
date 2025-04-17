// server.js
const express = require('express');
const cors = require('cors');
const path =  require('path');
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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/launch-attack', (req, res) => {
    const { targetUrl, endpoint, numRequests, botType, cookieString } = req.body;

    if (!targetUrl || !endpoint || !numRequests || !botType) {
        return res.status(400).json({ message: 'Missing required parameters.' });
    }
    const count = parseInt(numRequests, 10);
    if (isNaN(count) || count <= 0 || count > 1000) { // Adjusted max limit back
        return res.status(400).json({ message: 'Invalid number of requests (must be 1-1000).' });
    }

    console.log(`[Server] Received launch request: ${botType} bots, ${count} times to ${targetUrl}${endpoint}`);
    if (botType === 'Medium' && cookieString) console.log(`[Server] Using provided cookie string.`);

    const botConfig = {
         targetUrl, endpoint, numRequests: count,
         eventEmitter: attackEmitter, cookieString: cookieString || null
    };

    let botRunnerPromise;
    if (botType === 'Simple') botRunnerPromise = runSimpleBots(botConfig);
    else if (botType === 'Medium') botRunnerPromise = runMediumBots(botConfig);
    else if (botType === 'Complex') botRunnerPromise = runComplexBots(botConfig);
    else {
        console.warn(`[Server] Bot type "${botType}" not implemented.`);
        return res.status(400).json({ message: `Bot type "${botType}" not implemented yet.` });
    }

    botRunnerPromise.catch(error => { // Catch errors from the runner promise itself
        console.error(`[Server] Error during background ${botType} bot simulation:`, error);
        attackEmitter.emit('error', { message: `${botType} bot simulation failed`, error: error.message });
        // Ensure 'done' is emitted if the runner promise rejects unexpectedly
        // Note: Bot logic should ideally emit 'done' in its own finally block or similar
        // attackEmitter.emit('done'); // Consider if needed based on bot logic's robustness
    });

    res.status(202).json({ message: `${botType} attack initiated. Connect to /attack-stream for results.` });
});

app.get('/attack-stream', (req, res) => {
    console.log('[Server] SSE client connected.');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Listener for individual final results
    const resultListener = (resultData) => {
        res.write(`event: result\ndata: ${JSON.stringify(resultData)}\n\n`);
    };
    // *** ADDED: Listener for intermediate steps ***
    const stepListener = (stepData) => {
        res.write(`event: step\ndata: ${JSON.stringify(stepData)}\n\n`);
    };
    // Listener for completion signal
    const doneListener = () => {
        res.write(`event: done\ndata: ${JSON.stringify({ message: "Stream finished" })}\n\n`);
        cleanup();
    };
     // Listener for errors during simulation
    const errorListener = (errorData) => {
        res.write(`event: error\ndata: ${JSON.stringify(errorData)}\n\n`);
    };

    // Attach listeners
    attackEmitter.on('result', resultListener);
    attackEmitter.on('step', stepListener); // Attach step listener
    attackEmitter.on('done', doneListener);
    attackEmitter.on('error', errorListener);

    // Cleanup function
    const cleanup = () => {
        console.log('[Server] SSE client cleaning up listeners.');
        attackEmitter.off('result', resultListener);
        attackEmitter.off('step', stepListener); // Detach step listener
        attackEmitter.off('done', doneListener);
        attackEmitter.off('error', errorListener);
        if (!res.writableEnded) {
             res.end();
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
