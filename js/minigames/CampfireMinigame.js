// ============================================================
// CampfireMinigame.js
// Overlay minigame: layer tinder -> kindling -> wood, then
// strike the match. Uses only D-pad up/down + [A] action so it
// works identically on keyboard and the on-screen touch skin.
// Wrong order just resets the layers -- no fail state, no
// punishment, matches the "forgiving" tone from the design brief.
// ============================================================

class CampfireMinigame {
    constructor(scene) {
        this.scene = scene;
        this._open = false;
        this._container = null;
        this._actionWasDown = false;
        this._upWasDown = false;
        this._downWasDown = false;
    }

    isOpen() { return this._open; }

    open(onSuccess) {
        if (this._open) return;
        this._open = true;
        this._onSuccess = onSuccess || null;
        this._sequence = ['tinder', 'kindling', 'wood'];
        this._progress = [];
        this._cursor = 0;
        this._matchReady = false;
        this._locked = false;
        this._actionWasDown = true;  // swallow the press that opened us
        this._upWasDown = false;
        this._downWasDown = false;
        this._build();
    }

    _build() {
        const s = this.scene;
        const c = this._container = s.add.container(0, 0).setScrollFactor(0).setDepth(300);

        const bg = s.add.graphics();
        bg.fillStyle(0x000000, 0.85);
        bg.fillRect(70, 44, 340, 232);
        bg.lineStyle(2, 0xd4a840, 1);
        bg.strokeRect(70, 44, 340, 232);
        c.add(bg);

        c.add(s.add.text(240, 58, 'BUILD THE CAMPFIRE', {
            fontSize: '11px', fill: '#ffd700', fontFamily: 'monospace'
        }).setOrigin(0.5));

        c.add(s.add.text(240, 76, 'Layer it right: tinder, kindling, wood.\nThen strike the match.', {
            fontSize: '8px', fill: '#cccccc', fontFamily: 'monospace', align: 'center'
        }).setOrigin(0.5));

        this._rows = [
            { key: 'tinder',   label: 'TINDER' },
            { key: 'kindling', label: 'KINDLING' },
            { key: 'wood',     label: 'WOOD' },
            { key: 'match',    label: 'STRIKE MATCH' },
        ];
        this._rowTexts = this._rows.map((row, i) => {
            const t = s.add.text(240, 112 + i * 22, row.label, {
                fontSize: '11px', fill: '#e8c878', fontFamily: 'monospace'
            }).setOrigin(0.5);
            c.add(t);
            return t;
        });

        this._cursorGfx = s.add.graphics();
        c.add(this._cursorGfx);

        this._statusText = s.add.text(240, 216, '', {
            fontSize: '8px', fill: '#88ccff', fontFamily: 'monospace',
            align: 'center', wordWrap: { width: 300 }
        }).setOrigin(0.5);
        c.add(this._statusText);

        c.add(s.add.text(240, 254, '[▲▼] Choose   [A] Select', {
            fontSize: '7px', fill: '#666666', fontFamily: 'monospace'
        }).setOrigin(0.5));

        this._redraw();
    }

    _redraw() {
        this._rowTexts.forEach((t, i) => {
            const key = this._rows[i].key;
            const done = this._progress.includes(key);
            if (key === 'match') {
                t.setColor(this._matchReady ? '#ffe066' : '#555555');
            } else {
                t.setColor(done ? '#66ff66' : '#e8c878');
            }
        });
        const cg = this._cursorGfx;
        cg.clear();
        cg.fillStyle(0xffffff, 1);
        const cy = 112 + this._cursor * 22;
        cg.fillTriangle(150, cy - 5, 150, cy + 5, 160, cy);
    }

    update() {
        if (!this._open) return;
        const s = this.scene;
        const vk = window.virtualKeys || {};
        const upDown    = (s.cursors && s.cursors.up.isDown)   || (s.wasd && s.wasd.up.isDown)   || vk.up;
        const downDown  = (s.cursors && s.cursors.down.isDown) || (s.wasd && s.wasd.down.isDown) || vk.down;
        const actionDown = (s.eKey && s.eKey.isDown) || vk.action;

        if (upDown && !this._upWasDown) { this._moveCursor(-1); }
        this._upWasDown = !!upDown;

        if (downDown && !this._downWasDown) { this._moveCursor(1); }
        this._downWasDown = !!downDown;

        if (actionDown && !this._actionWasDown && !this._locked) { this._select(); }
        this._actionWasDown = !!actionDown;
    }

    _moveCursor(dir) {
        this._cursor = Phaser.Math.Clamp(this._cursor + dir, 0, this._rows.length - 1);
        this._redraw();
    }

    _select() {
        const key = this._rows[this._cursor].key;
        if (key === 'match') {
            if (this._matchReady) this._strike();
            return;
        }
        const expected = this._sequence[this._progress.length];
        if (key === expected) {
            this._progress.push(key);
            if (window.soundManager && window.soundManager.ready) window.soundManager.playInteract();
            if (this._progress.length === this._sequence.length) {
                this._matchReady = true;
                this._cursor = 3;
                this._statusText.setText("Everything's layered right. Strike the match.");
            } else {
                this._statusText.setText('Good. Keep going.');
                this._cursor = Math.min(this._cursor + 1, 2);
            }
        } else {
            this._progress = [];
            this._matchReady = false;
            this._statusText.setText("Heh, that's not gonna catch that way.\nStart with the tinder.");
            this._cursor = 0;
        }
        this._redraw();
    }

    _strike() {
        this._locked = true;
        this._statusText.setText('*strike*\nThe fire catches!');
        if (window.soundManager && window.soundManager.ready) window.soundManager.playDiscovery();
        this.scene.time.delayedCall(1200, () => this._close(true));
    }

    _close(success) {
        this._open = false;
        if (this._container) { this._container.destroy(); this._container = null; }
        if (success && this._onSuccess) this._onSuccess();
    }
}
