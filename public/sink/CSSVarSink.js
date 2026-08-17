import { lattice } from '../core/Lattice.js';
import '../core/StateJS.js'; 

document.addEventListener('DOMContentLoaded', () => {
    const domNodes = document.querySelectorAll('.node');
    const uiScore = document.getElementById('ui-score');
    const uiMissed = document.getElementById('ui-missed');
    const overlay = document.getElementById('overlay');
    const btnInit = document.getElementById('btn-init');
    const viewport = document.getElementById('viewport');

    lattice.dispatch('VIEWPORT_SYNC', { 
        w: viewport.clientWidth, 
        h: viewport.clientHeight 
    });

    lattice.on('STATE_UPDATE', (state) => {
        state.nodes.forEach((node, idx) => {
            const el = domNodes[idx];
            el.style.setProperty('--x', node.x);
            el.style.setProperty('--y', node.y);
            el.style.setProperty('--active', node.active);
            el.style.setProperty('--char', `"${node.char}"`);
            
            if (el.dataset.status !== node.status) el.dataset.status = node.status;
        });

        uiScore.textContent = state.score.toString().padStart(3, '0');
        uiMissed.textContent = state.missed.toString().padStart(2, '0');

        if (!state.isPlaying && state.missed >= state.maxMisses) {
            overlay.classList.add('active');
            overlay.querySelector('.title').textContent = 'SYSTEM_FAILURE';
        } else if (state.isPlaying) {
            overlay.classList.remove('active');
        }
    });

    window.addEventListener('keydown', (e) => {
        const key = e.key.toUpperCase();
        if (/^[A-Z]$/.test(key)) lattice.dispatch('KEY_PRESS', key);
    });

    btnInit.addEventListener('click', () => {
        lattice.dispatch('INIT_GAME', null);
    });

    let lastTime = performance.now();
    function loop(timestamp) {
        const deltaTime = timestamp - lastTime;
        lastTime = timestamp;
        lattice.dispatch('TICK', deltaTime);
        requestAnimationFrame(loop);
    }
    
    setInterval(() => lattice.dispatch('SPAWN', null), 1000);
    requestAnimationFrame(loop);
});
