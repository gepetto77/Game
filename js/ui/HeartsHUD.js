// ============================================================
// HeartsHUD.js
// HP hearts displayed top-right of screen. Depth 96.
// Pattern mirrors QuestTracker — takes a scene, draws with Graphics.
// ============================================================

class HeartsHUD {
    constructor(scene, maxHp) {
        this._scene = scene;
        this._maxHp = maxHp || 5;
        this._hp    = this._maxHp;
        this._gfx   = scene.add.graphics();
        this._gfx.setScrollFactor(0).setDepth(96);
        this._draw();
    }

    _draw() {
        const g = this._gfx;
        g.clear();
        for (let i = 0; i < this._maxHp; i++) {
            // Right-align: rightmost heart at x=470, spaced 14px apart
            const x = 470 - (this._maxHp - 1 - i) * 14;
            const y = 10;
            const filled = i < this._hp;

            // Heart: two small circles + downward triangle
            g.fillStyle(filled ? 0xdd2222 : 0x330000, 1);
            g.fillCircle(x - 3, y - 1, 4);
            g.fillCircle(x + 3, y - 1, 4);
            g.fillTriangle(x - 6, y + 1, x + 6, y + 1, x, y + 8);

            // Bright highlight on filled hearts
            if (filled) {
                g.fillStyle(0xff6666, 0.5);
                g.fillCircle(x - 2, y - 2, 2);
            }
        }
    }

    setHp(hp) {
        this._hp = Phaser.Math.Clamp(hp, 0, this._maxHp);
        this._draw();
        if (this._hp <= 0) this._scene.events.emit('player_dead');
    }

    getHp() { return this._hp; }

    // Flash the HUD to indicate damage taken
    flashDamage() {
        this._scene.tweens.add({
            targets: this._gfx,
            alpha: { from: 0.2, to: 1 },
            yoyo: true,
            repeat: 3,
            duration: 80,
            ease: 'Linear'
        });
    }
}
