// ============================================================
// ColdOpenScene.js
// Atmospheric intro cutscene. Plays once after TitleScene.
// Ben is on a forest trail near the campground — solo, curious.
// Dad calls on the walkie, Ben heads back. Scene fades to game.
// ============================================================

class ColdOpenScene extends Phaser.Scene {

    constructor() { super({ key: 'ColdOpenScene' }); }

    create() {
        this._idx     = 0;
        this._pressed = false;
        this._canNext = false;

        this._drawForest();
        this._drawBenFigure();

        this._cards = [
            { speaker: '',         text: 'PINEBROOK CAMPGROUND\nInverwood Provincial Park\n\nSummer.' },
            { speaker: 'BEN',      text: 'Third summer here.\nI know every trail. Every hollow tree.\nEvery place Dad told me not to go.' },
            { speaker: 'BEN',      text: 'There\'s still corners of this park I haven\'t seen, though.\nDad says the trails go on for miles,\nif you know where to look.' },
            { speaker: 'BEN',      text: 'Frank used to camp out here too, Dad says.\nHaven\'t seen him yet this summer.\nMaybe he\'s still around somewhere.' },
            { speaker: '[ WALKIE ]', text: '*krrrzzt*\nBen! Dinner\'s almost on the fire.\nDon\'t make me come find you.\n*krrrzzt*' },
            { speaker: 'BEN',      text: 'Guess I\'d better head back.\n\nBut I\'ll come back to this trail.\nI always do.' },
        ];

        this._boxGfx  = null;
        this._boxText = null;
        this._boxSpkr = null;
        this._prompt  = null;

        this._showCard();
        this.cameras.main.fadeIn(1600, 0, 0, 0);

        // Keyboard: any key advances (debounced in _next)
        this.input.keyboard.on('keydown', () => this._next());
    }

    _drawForest() {
        const g = this.add.graphics();

        // Sky — late afternoon blue-green gradient
        g.fillGradientStyle(0x3a7fa8, 0x3a7fa8, 0x7fbfd0, 0x7fbfd0, 1);
        g.fillRect(0, 0, 480, 160);

        // Far ground plane
        g.fillStyle(0x2a5a22); g.fillRect(0, 140, 480, 60);
        // Mid ground
        g.fillStyle(0x357a2a); g.fillRect(0, 175, 480, 60);
        // Near ground
        g.fillStyle(0x3d8030); g.fillRect(0, 220, 480, 100);

        // Dirt path — trapezoidal, converging toward horizon
        g.fillStyle(0x9a7a50);
        g.fillTriangle(215, 148, 265, 148, 380, 320);
        g.fillTriangle(215, 148, 100, 320, 380, 320);
        // Path edge shadows
        g.fillStyle(0x7a5a38, 0.5);
        g.fillTriangle(215, 148, 100, 320, 140, 320);
        g.fillTriangle(265, 148, 380, 320, 340, 320);

        // Trees — left side (bigger = closer to camera = lower on screen)
        [[80, 240], [50, 180], [120, 155], [30, 120]].forEach(([tx, ty]) => {
            this._drawMiniTree(g, tx, ty);
        });
        // Trees — right side
        [[400, 250], [440, 185], [360, 158], [460, 115]].forEach(([tx, ty]) => {
            this._drawMiniTree(g, tx, ty);
        });

        // Light beams through canopy (subtle)
        g.fillStyle(0xfff8cc, 0.04);
        [[160, 80, 40, 200], [310, 60, 35, 220], [240, 50, 25, 160]].forEach(([x, y, w, h]) => {
            g.fillRect(x, y, w, h);
        });

        // Ground foliage patches
        g.fillStyle(0x2d6a20, 0.6);
        [[95, 270, 50, 20], [370, 265, 55, 18], [45, 295, 40, 15], [420, 290, 45, 14]].forEach(
            ([x, y, w, h]) => g.fillEllipse(x, y, w, h)
        );

        // Atmosphere haze
        const atm = this.add.graphics();
        atm.fillStyle(0x001a08, 0.25); atm.fillRect(0, 0, 480, 320);
        atm.setDepth(1);
    }

    _drawMiniTree(g, tx, ty) {
        const scale = 0.5 + (ty - 100) / 280; // closer = bigger
        const s = scale;
        g.fillStyle(0x5a3010); g.fillRect(tx - 4*s, ty, 8*s, 18*s);         // trunk
        g.fillStyle(0x0e2e0e); g.fillTriangle(tx-20*s, ty+4*s, tx, ty-18*s, tx+20*s, ty+4*s);
        g.fillStyle(0x163a16); g.fillTriangle(tx-15*s, ty-8*s, tx, ty-28*s, tx+15*s, ty-8*s);
        g.fillStyle(0x1e5020); g.fillTriangle(tx-9*s,  ty-20*s, tx, ty-38*s, tx+9*s,  ty-20*s);
    }

    _drawBenFigure() {
        // Ben standing on the path, facing away (he was exploring, now turning back)
        const g = this.add.graphics().setDepth(5);
        const bx = 240, by = 250;
        g.fillStyle(0x2a1a0a); g.fillRect(bx-4, by+18, 5, 4); g.fillRect(bx+1, by+18, 5, 4);
        g.fillStyle(0x2244aa); g.fillRect(bx-4, by+8, 4, 11); g.fillRect(bx+1, by+8, 4, 11);
        g.fillStyle(0xbb2222); g.fillRect(bx-5, by-3, 11, 12);
        g.fillStyle(0x8b5e20); g.fillRect(bx+5, by-2, 5, 10); // backpack
        g.fillStyle(0xe8c090); g.fillRect(bx-3, by-12, 7, 9);
        g.fillStyle(0x6b3318); g.fillRect(bx-3, by-15, 7, 5); // hair (back of head)
        // Walking stick in hand
        g.lineStyle(2, 0x7a4810);
        g.beginPath(); g.moveTo(bx+6, by-2); g.lineTo(bx+14, by+22); g.strokePath();
    }

    _showCard() {
        // Destroy previous card elements
        [this._boxGfx, this._boxText, this._boxSpkr, this._prompt].forEach(o => o && o.destroy());

        if (this._idx >= this._cards.length) { this._finish(); return; }

        const card = this._cards[this._idx];
        const isWalkie = card.speaker === '[ WALKIE ]';

        // Box background
        this._boxGfx = this.add.graphics().setDepth(10);
        this._boxGfx.fillStyle(isWalkie ? 0x001a00 : 0x000000, 0.82);
        this._boxGfx.fillRect(18, 200, 444, 106);
        this._boxGfx.lineStyle(1, isWalkie ? 0x44aa44 : 0x334433, 0.6);
        this._boxGfx.strokeRect(18, 200, 444, 106);

        // Speaker label
        if (card.speaker) {
            this._boxSpkr = this.add.text(28, 206, card.speaker, {
                fontSize: '9px', fill: isWalkie ? '#44dd44' : '#88ccaa', fontFamily: 'monospace'
            }).setDepth(11);
        } else {
            this._boxSpkr = null;
        }

        // Card text
        this._boxText = this.add.text(28, card.speaker ? 220 : 212, card.text, {
            fontSize: '10px', fill: isWalkie ? '#aaffaa' : '#e8e8e8', fontFamily: 'monospace',
            wordWrap: { width: 424 }, lineSpacing: 3
        }).setDepth(11);

        // [A] prompt
        this._prompt = this.add.text(436, 292, '[A]', {
            fontSize: '8px', fill: '#556655', fontFamily: 'monospace'
        }).setDepth(11);
        this.tweens.add({
            targets: this._prompt, alpha: { from: 1, to: 0.2 }, yoyo: true, repeat: -1, duration: 650
        });

        // Short debounce so holding A doesn't skip cards instantly
        this._canNext = false;
        this.time.delayedCall(350, () => { this._canNext = true; });
    }

    update() {
        const down = (window.virtualKeys && window.virtualKeys.action);
        if (down && !this._pressed && this._canNext) { this._pressed = true; this._next(); }
        if (!down) this._pressed = false;
    }

    _next() {
        if (!this._canNext) return;
        this._idx++;
        this._showCard();
    }

    _finish() {
        [this._boxGfx, this._boxText, this._boxSpkr, this._prompt].forEach(o => o && o.destroy());
        this.cameras.main.fade(1400, 0, 0, 0);
        this.time.delayedCall(1500, () => this.scene.start('GameScene'));
    }
}
