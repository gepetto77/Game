// ============================================================
// FrisbeeMinigame.js
// Toss a frisbee at a target: a marker sweeps across a bar,
// press [A] to throw. Closer to center scores higher. Three
// throws, a final score, [B] leaves early. Same shape as the
// cornhole minigame -- the brief calls for a reusable mini-game
// framework, and this is that framework wearing different flavor.
// ============================================================

class FrisbeeMinigame {
    constructor(scene) {
        this.scene = scene;
        this._open = false;
        this._container = null;
        this._actionWasDown = false;
        this._attackWasDown = false;
    }

    isOpen() { return this._open; }

    open(onComplete) {
        if (this._open) return;
        this._open = true;
        this._onComplete = onComplete || null;
        this._throwsLeft = 3;
        this._score = 0;
        this._markerPos = 0;
        this._markerDir = 1;
        this._locked = false;
        this._actionWasDown = true;  // swallow the press that opened us
        this._attackWasDown = true;
        this._build();
    }

    _build() {
        const s = this.scene;
        const c = this._container = s.add.container(0, 0).setScrollFactor(0).setDepth(300);

        const bg = s.add.graphics();
        bg.fillStyle(0x000000, 0.85);
        bg.fillRect(60, 70, 360, 170);
        bg.lineStyle(2, 0xd4a840, 1);
        bg.strokeRect(60, 70, 360, 170);
        c.add(bg);

        c.add(s.add.text(240, 84, 'FRISBEE', {
            fontSize: '12px', fill: '#ffd700', fontFamily: 'monospace'
        }).setOrigin(0.5));

        this._throwsText = s.add.text(240, 104, '', {
            fontSize: '9px', fill: '#cccccc', fontFamily: 'monospace'
        }).setOrigin(0.5);
        c.add(this._throwsText);

        this._barX = 100; this._barW = 280; this._barY = 152;
        this._barGfx = s.add.graphics();
        c.add(this._barGfx);
        this._markerGfx = s.add.graphics();
        c.add(this._markerGfx);

        this._resultText = s.add.text(240, 190, '', {
            fontSize: '10px', fill: '#88ccff', fontFamily: 'monospace', align: 'center'
        }).setOrigin(0.5);
        c.add(this._resultText);

        c.add(s.add.text(240, 216, '[A] Throw   [B] Leave', {
            fontSize: '8px', fill: '#888888', fontFamily: 'monospace'
        }).setOrigin(0.5));

        this._drawBar();
        this._updateThrowsText();
    }

    _updateThrowsText() {
        this._throwsText.setText(`Throws left: ${this._throwsLeft}    Score: ${this._score}`);
    }

    _drawBar() {
        const g = this._barGfx;
        g.clear();
        const { _barX: barX, _barW: barW, _barY: barY } = this;
        const zones = [
            { from: 0,    to: 0.2,  color: 0x552222 },
            { from: 0.2,  to: 0.4,  color: 0x775522 },
            { from: 0.4,  to: 0.6,  color: 0x22aa44 },
            { from: 0.6,  to: 0.8,  color: 0x775522 },
            { from: 0.8,  to: 1,    color: 0x552222 },
        ];
        zones.forEach(z => {
            g.fillStyle(z.color, 1);
            g.fillRect(barX + z.from * barW, barY, (z.to - z.from) * barW, 16);
        });
        g.lineStyle(1, 0xffffff, 0.6);
        g.strokeRect(barX, barY, barW, 16);
    }

    update(dt) {
        if (!this._open) return;
        const s = this.scene;
        const vk = window.virtualKeys || {};
        const actionDown = (s.eKey && s.eKey.isDown) || vk.action;
        const attackDown = (s.xKey && s.xKey.isDown) || (s.spaceKey && s.spaceKey.isDown) || vk.attack;

        if (!this._locked) {
            this._markerPos += this._markerDir * dt * 0.0013;
            if (this._markerPos >= 1) { this._markerPos = 1; this._markerDir = -1; }
            if (this._markerPos <= 0) { this._markerPos = 0; this._markerDir = 1; }
            this._markerGfx.clear();
            const mx = this._barX + this._markerPos * this._barW;
            this._markerGfx.fillStyle(0xffffff, 1);
            this._markerGfx.fillRect(mx - 2, this._barY - 6, 4, 28);
        }

        if (actionDown && !this._actionWasDown && !this._locked && this._throwsLeft > 0) {
            this._throw();
        }
        this._actionWasDown = !!actionDown;

        if (attackDown && !this._attackWasDown && !this._locked) {
            this._close(null);
        }
        this._attackWasDown = !!attackDown;
    }

    _throw() {
        this._locked = true;
        const p = this._markerPos;
        let result, pts;
        if (p >= 0.4 && p <= 0.6) { result = 'BULLSEYE! +3'; pts = 3; }
        else if ((p >= 0.2 && p < 0.4) || (p > 0.6 && p <= 0.8)) { result = 'Close — +1'; pts = 1; }
        else { result = 'Way off!'; pts = 0; }

        this._score += pts;
        this._resultText.setText(result);
        this._throwsLeft--;
        this._updateThrowsText();
        if (window.soundManager && window.soundManager.ready) window.soundManager.playInteract();

        this.scene.time.delayedCall(900, () => {
            this._locked = false;
            this._resultText.setText('');
            if (this._throwsLeft <= 0) this._finish();
        });
    }

    _finish() {
        this._locked = true;
        let msg;
        if (this._score >= 8) msg = 'Perfect arm! You could do this all day.';
        else if (this._score >= 4) msg = 'Solid throws.';
        else msg = 'Ah well — the wind was against you.';
        this._resultText.setText(`Final score: ${this._score}\n${msg}`);
        if (window.soundManager && window.soundManager.ready) window.soundManager.playDiscovery();
        this.scene.time.delayedCall(1800, () => this._close(this._score));
    }

    _close(score) {
        this._open = false;
        if (this._container) { this._container.destroy(); this._container = null; }
        if (this._onComplete) this._onComplete(score);
    }
}
