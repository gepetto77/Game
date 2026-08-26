// ============================================================
// ObjectiveBar.js
// Read-only current-objective strip, mirroring QuestTracker's
// look. GameScene owns the real QuestTracker (it's the only scene
// that ever advances quest state); every other scene just needs
// to keep showing the player what they're currently trying to do,
// so it stays visible after they leave camp instead of vanishing
// the moment they cross into the wilderness, lake, or facility.
// ============================================================

class ObjectiveBar {
    constructor(scene) {
        this.scene = scene;
        this._lastState = -1;

        this.bg = scene.add.graphics().setScrollFactor(0).setDepth(94);

        this.header = scene.add.text(10, 7, 'OBJECTIVE', {
            fontSize: '8px', fill: '#888888', fontFamily: 'monospace', letterSpacing: 2
        }).setScrollFactor(0).setDepth(95);

        this.label = scene.add.text(10, 17, '', {
            fontSize: '11px', fill: '#ffd700', fontFamily: 'monospace'
        }).setScrollFactor(0).setDepth(95);

        this.refresh();
    }

    _drawBg(text) {
        this.bg.clear();
        const w = Math.min(text.length * 7 + 20, 470);
        this.bg.fillStyle(0x000000, 0.65);
        this.bg.fillRect(5, 5, w, 32);
    }

    // Cheap to call every frame — only redraws when quest state actually changed.
    refresh() {
        const qs = (window.gameState && window.gameState.questState) || 0;
        if (qs === this._lastState) return;
        this._lastState = qs;
        const text = (typeof QUEST_LABELS !== 'undefined' && QUEST_LABELS[qs]) || '';
        this._drawBg(text);
        this.label.setText(text);
    }
}
