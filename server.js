import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 10001;

// Silence the browser's automatic favicon request rather than 404 on it.
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Probe harness — a tool, not app code. Served, never bundled.
app.use('/probe.js', express.static(path.join(__dirname, 'tools/browser/probe.js')));

// Route static assets for the client
app.use(express.static(path.join(__dirname, 'public')));

// Authorize the data directory route for the JSON codex payloads
app.use('/data', express.static(path.join(__dirname, 'data')));

app.listen(PORT, () => {
    console.log(`\n/// 0KEY RUNNING ON PORT ${PORT} ///\n`);
});
