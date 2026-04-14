// ============================================================
// SaveManager.js
// Thin wrapper around localStorage for game state persistence.
// Loaded before all scenes so it's available everywhere.
// ============================================================

window.SaveManager = {
    KEY: 'pinebrook_save',

    save(state) {
        try {
            // Strip transient navigation fields before saving
            const toSave = Object.assign({}, state);
            delete toSave.entryX;
            delete toSave.entryY;
            localStorage.setItem(this.KEY, JSON.stringify(toSave));
        } catch (e) {
            console.warn('SaveManager: could not save', e);
        }
    },

    load() {
        try {
            const s = localStorage.getItem(this.KEY);
            return s ? JSON.parse(s) : null;
        } catch (e) {
            console.warn('SaveManager: could not load', e);
            return null;
        }
    },

    hasSave() {
        return !!localStorage.getItem(this.KEY);
    },

    clear() {
        localStorage.removeItem(this.KEY);
    }
};
