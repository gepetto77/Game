// ============================================================
// FishingMinigame.js
// Cast -> wait for a bite -> react in time -> reel it in.
// Uses only [A]/[B] so it matches the campfire/cornhole minigames.
// No fail state costs anything -- a missed bite or a snapped line
// just means "try again," matching the game's forgiving tone.
// ============================================================

const FISH_SPECIES = [
    { id: 'yellow_perch',    name: 'Yellow Perch',    weight: 4 },
    { id: 'smallmouth_bass', name: 'Smallmouth Bass', weight: 4 },
    { id: 'rock_bass',       name: 'Rock Bass',       weight: 3 },
    { id: 'lake_trout',      name: 'Lake Trout',      weight: 1 },
];

class FishingMinigame {
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
        this._state = 'CAST';
        this._timer = 0;
        this._reelProgress = 50;
        this._reelCooldown = 0;
        this._actionWasDown = true;  // swallow the press that opened us
        this._attackWasDown = true;
        this._build();
    }

    _build() {
        const s = this.scene;
        const c = this._container = s.add.container(0, 0).setScrollFactor(0).setDepth(300);

        const bg = s.add.graphics();
        bg.fillStyle(0x000000, 0.85);
        bg.fillRect(80, 90, 320, 150);
        bg.lineStyle(2, 0x4ab0d4, 1);
        bg.strokeRect(80, 90, 320, 150);
        c.add(bg);

        c.add(s.add.text(240, 104, 'FISHING', {
            fontSize: '11px', fill: '#4ab0d4', fontFamily: 'monospace'
        }).setOrigin(0.5));

        this._mainText = s.add.text(240, 140, '', {
            fontSize: '10px', fill: '#e0e0e0', fontFamily: 'monospace', align: 'center', wordWrap: { width: 280 }
        }).setOrigin(0.5);
        c.add(this._mainText);

        this._barGfx = s.add.graphics();
        c.add(this._barGfx);

        this._hintText = s.add.text(240, 216, '', {
            fontSize: '8px', fill: '#888888', fontFamily: 'monospace'
        }).setOrigin(0.5);
        c.add(this._hintText);

        this._render();
    }

    _render() {
        this._barGfx.clear();
        switch (this._state) {
            case 'CAST':
                this._mainText.setText('Line\'s in your hand.');
                this._hintText.setText('[A] Cast   [B] Leave');
                break;
            case 'WAIT': {
                const dots = '.'.repeat(1 + Math.floor(this._timer / 400) % 3);
                this._mainText.setText('Watching the line' + dots);
                this._hintText.setText('[B] Reel in and leave');
                break;
            }
            case 'BITE':
                this._mainText.setText('Something\'s biting!!');
                this._hintText.setText('[A] Set the hook!');
                break;
            case 'MISSED':
                this._mainText.setText('The fish got away.');
                this._hintText.setText('');
                break;
            case 'REEL': {
                this._mainText.setText('Reeling it in...');
                this._hintText.setText('[A] Reel!');
                const bx = 130, by = 180, bw = 220, bh = 16;
                this._barGfx.fillStyle(0x222222, 1); this._barGfx.fillRect(bx, by, bw, bh);
                this._barGfx.fillStyle(0x4ab0d4, 1); this._barGfx.fillRect(bx, by, bw * (this._reelProgress / 100), bh);
                this._barGfx.lineStyle(1, 0xffffff, 0.6); this._barGfx.strokeRect(bx, by, bw, bh);
                break;
            }
            case 'SNAPPED':
                this._mainText.setText('The line snapped!\nIt got away.');
                this._hintText.setText('');
                break;
            case 'CAUGHT':
                this._mainText.setText(this._catchMessage || '');
                this._hintText.setText('');
                break;
        }
    }

    update(dt) {
        if (!this._open) return;
        const s = this.scene;
        const vk = window.virtualKeys || {};
        const actionDown = (s.eKey && s.eKey.isDown) || vk.action;
        const attackDown = (s.xKey && s.xKey.isDown) || (s.spaceKey && s.spaceKey.isDown) || vk.attack;
        const actionPressed = actionDown && !this._actionWasDown;
        this._actionWasDown = !!actionDown;
        const attackPressed = attackDown && !this._attackWasDown;
        this._attackWasDown = !!attackDown;

        if (attackPressed && (this._state === 'CAST' || this._state === 'WAIT')) {
            this._close(null);
            return;
        }

        this._timer += dt;

        if (this._state === 'CAST') {
            if (actionPressed) {
                this._state = 'WAIT';
                this._timer = 0;
                this._biteAt = 1500 + Math.random() * 2000;
                if (window.soundManager && window.soundManager.ready) window.soundManager.playInteract();
            }
        } else if (this._state === 'WAIT') {
            if (this._timer >= this._biteAt) {
                this._state = 'BITE';
                this._timer = 0;
                if (window.soundManager && window.soundManager.ready) window.soundManager.playDiscovery();
            }
        } else if (this._state === 'BITE') {
            if (actionPressed) {
                this._state = 'REEL';
                this._timer = 0;
                this._reelProgress = 50;
                this._reelCooldown = 0;
            } else if (this._timer >= 900) {
                this._state = 'MISSED';
                this._timer = 0;
            }
        } else if (this._state === 'MISSED') {
            if (this._timer >= 1400) { this._close(null); return; }
        } else if (this._state === 'REEL') {
            this._reelProgress -= dt * 0.012;
            if (this._reelCooldown > 0) this._reelCooldown -= dt;
            if (actionPressed && this._reelCooldown <= 0) {
                this._reelProgress += 14;
                this._reelCooldown = 150;
                if (window.soundManager && window.soundManager.ready) window.soundManager.playInteract();
            }
            this._reelProgress = Phaser.Math.Clamp(this._reelProgress, 0, 100);
            if (this._reelProgress >= 100) {
                this._land();
            } else if (this._reelProgress <= 0) {
                this._state = 'SNAPPED';
                this._timer = 0;
            }
        } else if (this._state === 'SNAPPED') {
            if (this._timer >= 1600) { this._close(null); return; }
        } else if (this._state === 'CAUGHT') {
            if (this._timer >= 2000) { this._close(this._caughtSpecies); return; }
        }

        this._render();
    }

    _land() {
        this._state = 'CAUGHT';
        this._timer = 0;
        const totalWeight = FISH_SPECIES.reduce((sum, f) => sum + f.weight, 0);
        let roll = Math.random() * totalWeight;
        let picked = FISH_SPECIES[0];
        for (const f of FISH_SPECIES) {
            if (roll < f.weight) { picked = f; break; }
            roll -= f.weight;
        }
        this._caughtSpecies = picked.id;
        const gs = window.gameState || {};
        const fishLog = gs.fishLog || [];
        const isNew = !fishLog.includes(picked.id);
        this._catchMessage = isNew
            ? `You landed a ${picked.name}!\nNEW! Added to your fish log.`
            : `You landed a ${picked.name}!`;
        if (window.soundManager && window.soundManager.ready) window.soundManager.playDiscovery();
    }

    _close(caughtSpeciesId) {
        this._open = false;
        if (this._container) { this._container.destroy(); this._container = null; }
        if (this._onComplete) this._onComplete(caughtSpeciesId);
    }
}
