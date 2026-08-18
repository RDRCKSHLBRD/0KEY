// ---------------------------------------------------------------------------
// 0KEY — ArcadeSink
// path: public/sink/ArcadeSink.js
//
// Orchestrator for the arcade. Reads StateJS, hands values to CSSVarSink.
// Makes no DOM writes of its own and holds no game state.
// ---------------------------------------------------------------------------

import { lattice } from '../core/Lattice.js';
import { boot, stampVars, stampState, stampText, stampClass } from './CSSVarSink.js';
import '../core/StateJS.js';

const ready = new Promise(r => document.addEventListener('DOMContentLoaded', r));

await boot('arcade');
await ready;

const domNodes = document.querySelectorAll('.node');
const uiScore = document.getElementById('ui-score');
const uiMissed = document.getElementById('ui-missed');
const overlay = document.getElementById('overlay');
const overlayTitle = overlay.querySelector('.title');
const btnInit = document.getElementById('btn-init');
const viewport = document.getElementById('viewport');

// The viewport is the arcade's world. Keep it measured — spawn bounds and
// floor detection both read these numbers.
const syncViewport = () => lattice.dispatch('VIEWPORT_SYNC', {
    w: viewport.clientWidth,
    h: viewport.clientHeight
});

syncViewport();
window.addEventListener('resize', syncViewport);

lattice.on('STATE_UPDATE', (state) => {
    state.nodes.forEach((node, idx) => {
        const el = domNodes[idx];
        if (!el) return;

        stampVars(el, {
            '--x': `${node.x}px`,
            '--y': `${node.y}px`,
            '--active': node.active,
            '--char': `"${node.char}"`
        });

        stampState(el, 'status', node.status);
    });

    stampText(uiScore, state.score.toString().padStart(3, '0'));
    stampText(uiMissed, state.missed.toString().padStart(2, '0'));

    if (!state.isPlaying && state.missed >= state.maxMisses) {
        stampClass(overlay, 'active', true);
        stampText(overlayTitle, 'SYSTEM_FAILURE');
    } else if (state.isPlaying) {
        stampClass(overlay, 'active', false);
    }
});

window.addEventListener('keydown', (e) => {
    const key = e.key.toUpperCase();
    if (/^[A-Z]$/.test(key)) lattice.dispatch('KEY_PRESS', key);
});

btnInit.addEventListener('click', () => lattice.dispatch('INIT_GAME', null));

let lastTime = performance.now();
function loop(timestamp) {
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;
    lattice.dispatch('TICK', deltaTime);
    requestAnimationFrame(loop);
}

setInterval(() => lattice.dispatch('SPAWN', null), 1000);
requestAnimationFrame(loop);
