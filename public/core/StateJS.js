import { lattice } from './Lattice.js';

class StateJS {
    constructor() {
        this.state = {
            isPlaying: false,
            score: 0,
            missed: 0,
            maxMisses: 10,
            viewportWidth: 800,
            viewportHeight: 600 - 60,
            speed: 1.5,
            nodes: Array(10).fill(null).map(() => ({ 
                active: 0, char: '', x: 0, y: 0, status: 'falling' 
            }))
        };
        this.alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        
        lattice.on('INIT_GAME', () => this.start());
        lattice.on('TICK', (dt) => this.tick(dt));
        lattice.on('KEY_PRESS', (key) => this.handleKey(key));
        lattice.on('SPAWN', () => this.spawn());
        lattice.on('VIEWPORT_SYNC', (dim) => {
            this.state.viewportWidth = dim.w;
            this.state.viewportHeight = dim.h;
        });
    }

    start() {
        this.state.score = 0;
        this.state.missed = 0;
        this.state.nodes.forEach(n => n.active = 0);
        this.state.isPlaying = true;
        lattice.dispatch('STATE_UPDATE', this.state);
    }

    spawn() {
        if (!this.state.isPlaying) return;
        const inactiveNode = this.state.nodes.find(n => n.active === 0);
        if (inactiveNode) {
            inactiveNode.active = 1;
            inactiveNode.char = this.alphabet[Math.floor(Math.random() * this.alphabet.length)];
            inactiveNode.x = Math.floor(Math.random() * (this.state.viewportWidth - 40));
            inactiveNode.y = -40;
            inactiveNode.status = 'falling';
        }
    }

    tick(deltaTime) {
        if (!this.state.isPlaying) return;
        
        this.state.nodes.forEach(node => {
            if (node.active === 1 && node.status === 'falling') {
                node.y += this.state.speed * (deltaTime / 10);
                if (node.y > this.state.viewportHeight) {
                    node.active = 0;
                    this.state.missed++;
                    if (this.state.missed >= this.state.maxMisses) {
                        this.state.isPlaying = false;
                    }
                }
            }
        });
        
        lattice.dispatch('STATE_UPDATE', this.state);
    }

    handleKey(key) {
        if (!this.state.isPlaying) return;
        
        const target = this.state.nodes.find(n => n.active === 1 && n.char === key && n.status === 'falling');
        if (target) {
            target.status = 'hit';
            this.state.score += 10;
            setTimeout(() => {
                target.active = 0;
                target.status = 'falling';
            }, 50);
        }
        lattice.dispatch('STATE_UPDATE', this.state);
    }
}
export const stateJS = new StateJS();
