// ============================================================
// QuestTracker.js
// Tracks quest state and shows the current objective on screen.
// Three states: EXPLORE → FOUND_CLUE → FIND_WAY_IN
// ============================================================

// Quest state constants (used by GameScene to advance progress)
const QUEST_STATES = {
    EXPLORE:     0,  // Starting state — just explore
    FOUND_CLUE:  1,  // Player approached the restricted area
    FIND_WAY_IN: 2   // Player interacted with the glowing clue
};

// Text shown for each quest state
const QUEST_LABELS = [
    'Objective: Explore the campground',
    'Objective: Investigate the glow near the fence',
    'Objective: Find a way inside the restricted area'
];

class QuestTracker {
    constructor(scene) {
        this.scene = scene;
        this.state = QUEST_STATES.EXPLORE;

        // Dark semi-transparent background strip
        this.bg = scene.add.graphics();
        this.bg.fillStyle(0x000000, 0.60);
        this.bg.fillRect(5, 5, 330, 22);
        this.bg.setScrollFactor(0).setDepth(90);

        // Gold objective text
        this.label = scene.add.text(10, 8, QUEST_LABELS[0], {
            fontSize: '11px',
            fill: '#ffd700',
            fontFamily: 'monospace'
        }).setScrollFactor(0).setDepth(91);
    }

    // -----------------------------------------------------------
    // advance(newState)
    // Call with a QUEST_STATES value to progress the quest.
    // Does nothing if newState is the same or lower than current.
    // -----------------------------------------------------------
    advance(newState) {
        if (newState <= this.state) return;

        this.state = newState;
        this.label.setText(QUEST_LABELS[newState]);

        // Brief scale-pop so the player notices the update
        this.scene.tweens.add({
            targets: this.label,
            scaleX: { from: 1.15, to: 1 },
            scaleY: { from: 1.15, to: 1 },
            duration: 300,
            ease: 'Back.easeOut'
        });
    }

    // Returns the current numeric state
    getState() {
        return this.state;
    }

    // Convenience: check by name, e.g. quest.is('EXPLORE')
    is(stateName) {
        return this.state === QUEST_STATES[stateName];
    }
}
