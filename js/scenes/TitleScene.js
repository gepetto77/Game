// ============================================================
// TitleScene.js
// Shown before GameScene. Press any key or [A] button to start.
// Initialises the Web Audio context on first user interaction
// (browsers require a gesture before any audio can play).
// ============================================================

class TitleScene extends Phaser.Scene {

    constructor() {
        super({ key: 'TitleScene' });
    }

    create() {
        const W = 480, H = 320;

        // --- Background ---
        this.add.rectangle(W / 2, H / 2, W, H, 0x06060f);

        // Subtle grid lines (graph-paper feel)
        const grid = this.add.graphics();
        grid.lineStyle(1, 0x0f0f2a, 1);
        for (let x = 0; x < W; x += 32) grid.lineBetween(x, 0, x, H);
        for (let y = 0; y < H; y += 32) grid.lineBetween(0, y, W, y);

        // --- Glowing orb (mirrors the in-game clue) ---
        const outerGlow = this.add.graphics();
        outerGlow.fillStyle(0x00ffcc, 0.08);
        outerGlow.fillCircle(W / 2, 168, 60);

        const orb = this.add.graphics();
        orb.fillStyle(0x00ffcc, 0.85);
        orb.fillCircle(W / 2, 168, 14);
        orb.fillStyle(0xffffff, 0.5);
        orb.fillCircle(W / 2 - 4, 163, 5);

        this.tweens.add({
            targets: orb,
            scaleX: { from: 0.85, to: 1.15 },
            scaleY: { from: 0.85, to: 1.15 },
            alpha: { from: 0.7, to: 1 },
            yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut'
        });
        this.tweens.add({
            targets: outerGlow,
            alpha: { from: 0.5, to: 1 },
            scaleX: { from: 0.9, to: 1.2 },
            scaleY: { from: 0.9, to: 1.2 },
            yoyo: true, repeat: -1, duration: 1200, ease: 'Sine.easeInOut'
        });

        // --- Title text ---
        this.add.text(W / 2, 46, 'CAMPING PARK', {
            fontSize: '18px', fill: '#4af7c4',
            fontFamily: 'monospace', fontStyle: 'bold'
        }).setOrigin(0.5);

        this.add.text(W / 2, 70, 'MYSTERY', {
            fontSize: '30px', fill: '#ffffff',
            fontFamily: 'monospace', fontStyle: 'bold'
        }).setOrigin(0.5);

        // Thin separator line
        const sep = this.add.graphics();
        sep.lineStyle(1, 0x4af7c4, 0.4);
        sep.lineBetween(W / 2 - 120, 100, W / 2 + 120, 100);

        this.add.text(W / 2, 112, 'PINEBROOK NUCLEAR RESERVE', {
            fontSize: '9px', fill: '#556655',
            fontFamily: 'monospace', letterSpacing: 2
        }).setOrigin(0.5);

        // --- "Press A to start" prompt (blinking) ---
        const prompt = this.add.text(W / 2, 268, 'PRESS  [ A ]  TO  START', {
            fontSize: '11px', fill: '#ffd700', fontFamily: 'monospace'
        }).setOrigin(0.5);

        this.tweens.add({
            targets: prompt,
            alpha: { from: 0.15, to: 1 },
            yoyo: true, repeat: -1, duration: 650, ease: 'Sine.easeInOut'
        });

        // Small version label bottom-right
        this.add.text(W - 8, H - 10, 'v0.2', {
            fontSize: '8px', fill: '#333344', fontFamily: 'monospace'
        }).setOrigin(1, 1);

        // --- Fade in ---
        this.cameras.main.fadeIn(1000, 0, 0, 0);
        this._ready = false;
        this.time.delayedCall(1100, () => { this._ready = true; });

        // Keyboard: any key starts
        this.input.keyboard.on('keydown', () => this._start());
    }

    update() {
        // Virtual A button (on-screen D-pad) also starts the game
        if (this._ready && window.virtualKeys && window.virtualKeys.action) {
            window.virtualKeys.action = false;
            this._start();
        }
    }

    _start() {
        if (!this._ready) return;
        this._ready = false; // prevent double-fire

        // Initialise Web Audio here — browsers require a user gesture first
        if (window.soundManager) {
            window.soundManager.init();
        }

        this.cameras.main.fadeOut(700, 0, 0, 0);
        this.time.delayedCall(750, () => {
            this.scene.start('ColdOpenScene');
        });
    }
}
