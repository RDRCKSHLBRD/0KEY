import { lattice } from './Lattice.js';

class KataEngine {
    constructor() {
        this.state = {
            forms: [],
            currentFormIdx: 0,
            currentCharIdx: 0,
            mode: 'shaolin',
            repsRequired: 0,
            totalMistakes: 0,
            isActive: false
        };
        
        lattice.on('INIT_DOJO', (forms) => this.init(forms));
        lattice.on('KEY_PRESS', (key) => this.handleKey(key));
        lattice.on('SET_MODE', (mode) => { this.state.mode = mode; lattice.dispatch('KATA_STATE', this.state); });
    }

    init(forms) {
        this.state.forms = forms;
        this.state.currentFormIdx = 0;
        this.state.currentCharIdx = 0;
        this.state.repsRequired = 0;
        this.state.totalMistakes = 0;
        this.state.isActive = true;
        lattice.dispatch('KATA_STATE', this.state);
    }

    handleKey(key) {
        if (!this.state.isActive || this.state.forms.length === 0) return;
        
        if (key.length > 1) return;

        const form = this.state.forms[this.state.currentFormIdx];
        const expected = form[this.state.currentCharIdx];

        if (key === expected) {
            this.state.currentCharIdx++;
            lattice.dispatch('KEY_HIT', key);

            if (this.state.currentCharIdx >= form.length) {
                this.completeForm();
            }
        } else {
            this.state.totalMistakes++;
            lattice.dispatch('KEY_MISS', { expected, got: key });

            if (this.state.mode === 'shaolin') {
                this.state.currentCharIdx = 0;
                this.state.repsRequired = 4;
            }
        }
        lattice.dispatch('KATA_STATE', this.state);
    }

    completeForm() {
        this.state.currentCharIdx = 0;
        if (this.state.repsRequired > 0) {
            this.state.repsRequired--;
            if (this.state.repsRequired === 0) {
                this.state.currentFormIdx++;
            }
        } else {
            this.state.currentFormIdx++;
        }

        if (this.state.currentFormIdx >= this.state.forms.length) {
            this.state.isActive = false;
            lattice.dispatch('DOJO_COMPLETE', this.state);
        }
    }
}
export const kataEngine = new KataEngine();
