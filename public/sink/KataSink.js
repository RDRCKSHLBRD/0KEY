import { lattice } from '../core/Lattice.js';
import '../core/KataEngine.js';

document.addEventListener('DOMContentLoaded', () => {
    const uiMistakes = document.getElementById('ui-mistakes');
    const uiReps = document.getElementById('ui-reps');
    const repLabel = document.getElementById('rep-label');
    const typedSpan = document.getElementById('text-typed');
    const cursorSpan = document.getElementById('text-cursor');
    const untypedSpan = document.getElementById('text-untyped');
    const overlay = document.getElementById('overlay');
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
        uiMistakes.textContent = state.totalMistakes.toString().padStart(3, '0');
        
        if (state.repsRequired > 0) {
            uiReps.style.display = 'inline';
            repLabel.style.display = 'inline';
            uiReps.textContent = state.repsRequired;
        } else {
            uiReps.style.display = 'none';
            repLabel.style.display = 'none';
        }

        if (state.isActive && state.forms.length > 0) {
            overlay.classList.remove('active');
            const form = state.forms[state.currentFormIdx];
            const idx = state.currentCharIdx;
            
            typedSpan.textContent = form.slice(0, idx);
            cursorSpan.textContent = form[idx] || '';
            untypedSpan.textContent = form.slice(idx + 1);
        }
    });

    lattice.on('KEY_MISS', () => {
        viewport.classList.add('error-flash');
        setTimeout(() => viewport.classList.remove('error-flash'), 100);
    });

    lattice.on('DOJO_COMPLETE', () => {
        overlay.classList.add('active');
        overlay.querySelector('.title').textContent = 'KATA_MASTERED';
        btnInit.textContent = 'RESTART DOJO';
    });

    btnInit.addEventListener('click', async () => {
        try {
            const res = await fetch('../data/bash_kata.json');
            const codex = await res.json();
            lattice.dispatch('INIT_DOJO', codex.forms);
        } catch (err) {
            console.error('CODEX INGESTION FAILED', err);
        }
    });
});
