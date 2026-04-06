// ============================================================
// QuestTracker.js
// Five quest states with a clean UI strip at the top of screen.
// ============================================================

// ---- Quest state constants (used throughout GameScene) ------
const QUEST_STATES = {
    EXPLORE:          0,  // Just arrived — look around
    DISCOVERED_CLUE:  1,  // Saw something glowing near the fence
    NEED_TOOL:        2,  // Examined the clue — gate is locked
    HAS_TOOL:         3,  // Picked up the bolt cutters
    INSIDE:           4   // Entered the restricted area
};

// ---- One label per state ------------------------------------
const QUEST_LABELS = [
    'Explore the campground',
    'Investigate the glow near the fence',
    'The gate is locked — find something to open it',
    'Use the bolt cutters on the fence gate',
    'Find the source of the signal'
];

class QuestTracker {
    constructor(scene) {
        this.scene = scene;
        this.state = QUEST_STATES.EXPLORE;

        // Thin dark strip behind the text
        this.bg = scene.add.graphics();
        this._drawBg(QUEST_LABELS[0]);
        this.bg.setScrollFactor(0).setDepth(90);

        // Small "OBJECTIVE" header label
        this.header = scene.add.text(10, 7, 'OBJECTIVE', {
            fontSize: '8px',
            fill: '#888888',
            fontFamily: 'monospace',
            letterSpacing: 2
        }).setScrollFactor(0).setDepth(91);

        // Main objective text in gold
        this.label = scene.add.text(10, 17, QUEST_LABELS[0], {
            fontSize: '11px',
            fill: '#ffd700',
            fontFamily: 'monospace'
        }).setScrollFactor(0).setDepth(91);
    }

    // Redraw bg to fit text width
    _drawBg(text) {
        this.bg.clear();
        const w = Math.min(text.length * 7 + 20, 470);
        this.bg.fillStyle(0x000000, 0.65);
        this.bg.fillRect(5, 5, w, 32);
    }

    // -----------------------------------------------------------
    // advance(newState) — only moves forward, never back.
    // Plays a visual flash so the player notices.
    // -----------------------------------------------------------
    advance(newState) {
        if (newState <= this.state) return;
        this.state = newState;

        const text = QUEST_LABELS[newState];
        this._drawBg(text);
        this.label.setText(text);

        // Flash: pop in from faded
        this.label.setAlpha(0);
        this.scene.tweens.add({
            targets: this.label,
            alpha: { from: 0, to: 1 },
            scaleX: { from: 1.12, to: 1 },
            scaleY: { from: 1.12, to: 1 },
            duration: 450,
            ease: 'Back.easeOut'
        });
    }

    getState()        { return this.state; }
    is(name)          { return this.state === QUEST_STATES[name]; }
    atLeast(name)     { return this.state >= QUEST_STATES[name]; }
}
