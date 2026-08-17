export class Lattice {
    constructor() {
        this.listeners = new Map();
    }
    
    on(event, callback) {
        if (!this.listeners.has(event)) this.listeners.set(event, []);
        this.listeners.get(event).push(callback);
    }
    
    dispatch(event, payload) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(cb => cb(payload));
        }
    }
}
export const lattice = new Lattice();
