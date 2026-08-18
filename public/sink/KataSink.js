// ---------------------------------------------------------------------------
// 0KEY — KataSink
// path: public/sink/KataSink.js
//
// Orchestrator for the dojo. Reads KataEngine, hands values to CSSVarSink.
// Makes no DOM writes of its own and holds no kata state.
//
// The rep counter's visibility is a data-* state, not a style write. CSS
// decides what data-visible="0" looks like; this file only reports it.
// ---------------------------------------------------------------------------

import { lattice } from '../core/Lattice.js';
import { boot, stampState, stampText, stampClass } from './CSSVarSink.js';
import '../core/KataEngine.js';

const KATA_SOURCE = '/data/bash_kata.json';

const ready = new Promise(r => document.addEventListener('DOMContentLoaded', r));

await boot('dojo');
await ready;

const uiMistakes = document.getElementById('ui-mistakes');
const uiReps = document.getElementById('ui-reps');
const repLabel = document.getElementById('rep-label');
const typedSpan = document.getElementById('text-typed');
const cursorSpan = document.getElementById('text-cursor');
const untypedSpan = document.getElementById('text-untyped');
const overlay = document.getElementById('overlay');
const overlayTitle = overlay.querySelector('.title');
const viewport = document.getElementById('viewport');
const modeToggle = document.getElementById('mode-toggle');
const btnInit = document.getElementById('btn-init');

window.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === '/') e.preventDefault();
    lattice.dispatch('KEY_PRESS', e.key);
});

modeToggle.addEventListener('change', (e) => {
    lattice.dispatch('SET_MODE', e.target.checked ? 'shaolin' : 'forgiving');
});

lattice.on('KATA_STATE', (state) => {
    stampText(uiMistakes, state.totalMistakes.toString().padStart(3, '0'));

    const owed = state.repsRequired > 0;
    stampState(uiReps, 'visible', owed ? 1 : 0);
    stampState(repLabel, 'visible', owed ? 1 : 0);
    if (owed) stampText(uiReps, state.repsRequired);

    if (state.isActive && state.forms.length > 0) {
        stampClass(overlay, 'active', false);

        const form = state.forms[state.currentFormIdx];
        const idx = state.currentCharIdx;

        stampText(typedSpan, form.slice(0, idx));
        stampText(cursorSpan, form[idx] || '');
        stampText(untypedSpan, form.slice(idx + 1));
    }
});

lattice.on('KEY_MISS', () => {
    stampClass(viewport, 'error-flash', true);
    setTimeout(() => stampClass(viewport, 'error-flash', false), 100);
});

lattice.on('DOJO_COMPLETE', () => {
    stampClass(overlay, 'active', true);
    stampText(overlayTitle, 'KATA_MASTERED');
    stampText(btnInit, 'RESTART DOJO');
});

btnInit.addEventListener('click', async () => {
    try {
        const res = await fetch(KATA_SOURCE);
        const codex = await res.json();
        lattice.dispatch('INIT_DOJO', codex.forms);
    } catch (err) {
        console.error('KATA INGESTION FAILED', err);
    }
});
