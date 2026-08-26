// ============================================================
// PieMinigame.js
// Campfire pie making: pick a filling, then pull the pie iron
// off the fire at the right moment. Too early is undercooked,
// too late is burnt -- there's a sweet spot in between. Uses
// only D-pad up/down + [A], matching the other camp minigames.
// ============================================================

const PIE_FILLINGS = ['Apple', 'Cherry', 'Chocolate'];

class PieMinigame {
    constructor(scene) {
        this.scene = scene;
        this._open = false;
        this._container = null;
        this._actionWasDown = false;
        this._upWasDown = false;
        this._downWasDown = false;
    }

    isOpen() { return this._open; }

    open(onComplete) {
        if (this._open) return;
        this._open = true;
        this._onComplete = onComplete || null;
        this._state = 'CHOOSE';
        this._cursor = 0;
        this._cookProgress = 0;
        this._timer = 0;
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
        bg.fillRect(70, 60, 340, 200);
        bg.lineStyle(2, 0xd4864a, 1);
        bg.strokeRect(70, 60, 340, 200);
        c.add(bg);

        c.add(s.add.text(240, 74, 'CAMPFIRE PIE', {
            fontSize: '11px', fill: '#d4864a', fontFamily: 'monospace'
        }).setOrigin(0.5));

        this._chooseTexts = PIE_FILLINGS.map((name, i) => {
            const t = s.add.text(240, 100 + i * 20, name.toUpperCase(), {
                fontSize: '10px', fill: '#e8c878', fontFamily: 'monospace'
            }).setOrigin(0.5);
            c.add(t);
            return t;
        });
        this._chooseCursor = s.add.graphics();
        c.add(this._chooseCursor);

        this._mainText = s.add.text(240, 130, '', {
            fontSize: '10px', fill: '#e0e0e0', fontFamily: 'monospace', align: 'center', wordWrap: { width: 300 }
        }).setOrigin(0.5);
        c.add(this._mainText);

        this._barGfx = s.add.graphics();
        c.add(this._barGfx);

        this._hintText = s.add.text(240, 236, '', {
            fontSize: '7px', fill: '#888888', fontFamily: 'monospace'
        }).setOrigin(0.5);
        c.add(this._hintText);

        this._render();
    }

    _render() {
        this._barGfx.clear();
        const choosing = this._state === 'CHOOSE';
        this._chooseTexts.forEach(t => t.setVisible(choosing));
        this._chooseCursor.setVisible(choosing);
        this._mainText.setVisible(!choosing);

        if (choosing) {
            this._chooseCursor.fillStyle(0xffffff, 1);
            const cy = 100 + this._cursor * 20;
            this._chooseCursor.fillTriangle(180, cy - 5, 180, cy + 5, 190, cy);
            this._hintText.setText('[▲▼] Choose filling   [A] Select');
            return;
        }

        if (this._state === 'COOKING') {
            this._mainText.setText(`${this._filling} pie, over the fire.`);
            this._hintText.setText('[A] Pull it off the fire!');
            const bx = 110, by = 165, bw = 260, bh = 16;
            const zones = [
                { from: 0,    to: 0.35, color: 0x8a6a3a },  // undercooked
                { from: 0.35, to: 0.65, color: 0x4a9a3a },  // good
                { from: 0.65, to: 0.80, color: 0xd4a840 },  // perfect
                { from: 0.80, to: 1,    color: 0x8a2a1a },  // burnt
            ];
            zones.forEach(z => {
                this._barGfx.fillStyle(z.color, 0.55);
                this._barGfx.fillRect(bx + z.from * bw, by, (z.to - z.from) * bw, bh);
            });
            this._barGfx.lineStyle(1, 0xffffff, 0.6); this._barGfx.strokeRect(bx, by, bw, bh);
            const px = bx + (this._cookProgress / 100) * bw;
            this._barGfx.fillStyle(0xffffff, 1); this._barGfx.fillRect(px - 2, by - 6, 4, bh + 12);
        } else if (this._state === 'DONE') {
            this._mainText.setText(this._resultMessage || '');
            this._hintText.setText('');
        }
    }

    update(dt) {
        if (!this._open) return;
        const s = this.scene;
        const vk = window.virtualKeys || {};
        const upDown    = (s.cursors && s.cursors.up.isDown)   || (s.wasd && s.wasd.up.isDown)   || vk.up;
        const downDown  = (s.cursors && s.cursors.down.isDown) || (s.wasd && s.wasd.down.isDown) || vk.down;
        const actionDown = (s.eKey && s.eKey.isDown) || vk.action;
        const actionPressed = actionDown && !this._actionWasDown;
        this._actionWasDown = !!actionDown;

        if (this._state === 'CHOOSE') {
            if (upDown && !this._upWasDown) this._cursor = Phaser.Math.Clamp(this._cursor - 1, 0, PIE_FILLINGS.length - 1);
            this._upWasDown = !!upDown;
            if (downDown && !this._downWasDown) this._cursor = Phaser.Math.Clamp(this._cursor + 1, 0, PIE_FILLINGS.length - 1);
            this._downWasDown = !!downDown;
            if (actionPressed) {
                this._filling = PIE_FILLINGS[this._cursor];
                this._state = 'COOKING';
                this._cookProgress = 0;
                if (window.soundManager && window.soundManager.ready) window.soundManager.playInteract();
            }
        } else if (this._state === 'COOKING') {
            this._cookProgress += dt * 0.0165; // ~100 over 6s
            if (actionPressed || this._cookProgress >= 100) {
                this._cookProgress = Math.min(this._cookProgress, 100);
                this._finish();
            }
        } else if (this._state === 'DONE') {
            this._timer += dt;
            if (this._timer >= 1800) { this._close(); return; }
        }

        this._render();
    }

    _finish() {
        const p = this._cookProgress;
        let quality;
        if (p < 35) quality = 'undercooked';
        else if (p < 65) quality = 'good';
        else if (p < 80) quality = 'perfect';
        else quality = 'burnt';

        const messages = {
            undercooked: `Pulled it too early.\nThe ${this._filling.toLowerCase()} pie is doughy in the middle.`,
            good:        `A solid ${this._filling.toLowerCase()} pie. Warm and gooey.`,
            perfect:     `PERFECT! Golden crust, ${this._filling.toLowerCase()} filling just right.`,
            burnt:       `Left it too long.\nThe ${this._filling.toLowerCase()} pie is burnt to the iron.`,
        };
        this._quality = quality;
        this._resultMessage = messages[quality];
        this._state = 'DONE';
        this._timer = 0;
        if (window.soundManager && window.soundManager.ready) window.soundManager.playDiscovery();
    }

    _close() {
        this._open = false;
        if (this._container) { this._container.destroy(); this._container = null; }
        if (this._onComplete) this._onComplete({ filling: this._filling, quality: this._quality });
    }
}
