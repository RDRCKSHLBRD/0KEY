import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 10001;

// Route static assets for the client
app.use(express.static(path.join(__dirname, 'public')));

// Authorize the data directory route for the JSON codex payloads
app.use('/data', express.static(path.join(__dirname, 'data')));

app.listen(PORT, () => {
    console.log(`\n/// 0KEY RUNNING ON PORT ${PORT} ///\n`);
});
