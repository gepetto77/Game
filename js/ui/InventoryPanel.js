// ============================================================
// InventoryPanel.js
// Press I in any gameplay scene to open/close an overlay
// showing current items, quest stage, and HP.
// Depth 200 — sits above everything including HeartsHUD.
// ============================================================

const ITEM_NAMES = {
    walking_stick:      'Walking Stick',
    ember_stick:        'Ember Stick \u2605',   // ★
    bolt_cutters:       'Bolt Cutters',
    flashlight:         'Flashlight',
    cabin_key:          'Cabin Key',
    respirator:         'Respirator',
    copper_wire:        'Copper Wire',
    facility_log:       'Facility Log',
    survey_map:         'Survey Map',
    boat_key:           'Boat Key',
    chen_disk:          "Chen's Disk",
    cave_crystal_shard: 'Crystal Shard',
};

class InventoryPanel {
    constructor(scene) {
        this._scene   = scene;
        this._visible = false;

        const W = 480, H = 320;
        const pw = 380, ph = 220;
        const px = (W - pw) / 2, py = (H - ph) / 2;

        // Background overlay
        this._bg = scene.add.graphics().setDepth(200).setScrollFactor(0).setVisible(false);
        this._bg.fillStyle(0x000000, 0.78);
        this._bg.fillRect(0, 0, W, H);

        // Panel border
        const panel = scene.add.graphics().setDepth(201).setScrollFactor(0).setVisible(false);
        panel.fillStyle(0x0a0f0a, 0.95);
        panel.fillRect(px, py, pw, ph);
        panel.lineStyle(1, 0x44aa44, 0.7);
        panel.strokeRect(px, py, pw, ph);
        // Divider line between columns
        panel.lineStyle(1, 0x224422, 0.5);
        panel.lineBetween(px + pw * 0.46, py + 28, px + pw * 0.46, py + ph - 28);
        // Bottom separator
        panel.lineBetween(px + 8, py + ph - 30, px + pw - 8, py + ph - 30);
        this._panel = panel;

        const ts = {fontSize:'8px', fill:'#88cc88', fontFamily:'monospace'};
        const th = {fontSize:'8px', fill:'#44ff44', fontFamily:'monospace', fontStyle:'bold'};
        const td = {fontSize:'8px', fill:'#aaddaa', fontFamily:'monospace'};
        const tf = {fontSize:'7px', fill:'#446644', fontFamily:'monospace'};

        // Header
        this._header = scene.add.text(px + pw/2, py + 8, 'PINEBROOK MYSTERY  \u2014  INVENTORY', th)
            .setDepth(202).setScrollFactor(0).setOrigin(0.5, 0).setVisible(false);

        // Column headers
        this._questLabel = scene.add.text(px + 10, py + 30, 'QUEST', ts)
            .setDepth(202).setScrollFactor(0).setVisible(false);
        this._itemsLabel = scene.add.text(px + pw * 0.46 + 10, py + 30, 'ITEMS', ts)
            .setDepth(202).setScrollFactor(0).setVisible(false);

        // Quest text (multi-line)
        this._questText = scene.add.text(px + 10, py + 46, '', td)
            .setDepth(202).setScrollFactor(0).setVisible(false)
            .setWordWrapWidth(pw * 0.42).setLineSpacing(4);

        // Items list
        this._itemsText = scene.add.text(px + pw * 0.46 + 10, py + 46, '', td)
            .setDepth(202).setScrollFactor(0).setVisible(false).setLineSpacing(4);

        // Footer: HP + artifacts + hint
        this._footerText = scene.add.text(px + pw/2, py + ph - 22, '', tf)
            .setDepth(202).setScrollFactor(0).setOrigin(0.5, 0).setVisible(false);

        this._objects = [this._bg, this._panel, this._header,
            this._questLabel, this._itemsLabel,
            this._questText, this._itemsText, this._footerText];
    }

    toggle() {
        this._visible ? this.hide() : this.show();
    }

    isOpen() { return this._visible; }

    show() {
        this._refresh();
        this._objects.forEach(o => o.setVisible(true));
        this._visible = true;
    }

    hide() {
        this._objects.forEach(o => o.setVisible(false));
        this._visible = false;
    }

    _refresh() {
        const gs  = window.gameState || {};
        const col = gs.collected || [];
        const qs  = gs.questState || 0;
        const hp  = gs.hp != null ? gs.hp : 5;
        const maxHp = gs.maxHp != null ? gs.maxHp : 5;
        const ac  = gs.artifactCounts || {arrowheads:0,pottery:0,tools:0};
        const arts = (ac.arrowheads||0) + (ac.pottery||0) + (ac.tools||0);
        const fishCount = (gs.fishLog||[]).length;

        // Quest section
        const stage = `Stage ${qs + 1}/8`;
        const label = (typeof QUEST_LABELS !== 'undefined' && QUEST_LABELS[qs])
            ? QUEST_LABELS[qs] : '...';
        // Wrap label at ~22 chars manually
        const words = label.split(' ');
        let lines = [], cur = '';
        words.forEach(w => {
            if ((cur + ' ' + w).trim().length > 22) { lines.push(cur.trim()); cur = w; }
            else cur = (cur + ' ' + w).trim();
        });
        if (cur) lines.push(cur);
        this._questText.setText(stage + '\n' + lines.join('\n'));

        // Items section
        const carried = col.filter(id => ITEM_NAMES[id]);
        const itemLines = carried.length
            ? carried.map(id => '\u25c6 ' + ITEM_NAMES[id]).join('\n')  // ◆
            : '(nothing yet)';
        this._itemsText.setText(itemLines);

        // Footer: HP hearts + artifacts
        const hearts = '\u2665'.repeat(hp) + '\u2661'.repeat(Math.max(0, maxHp - hp));
        const footerStr = `HP: ${hearts}    Artifacts: ${arts}    Fish: ${fishCount}/4    [ I ] to close`;
        this._footerText.setText(footerStr);
    }
}
