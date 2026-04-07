// ============================================================
// GameScene.js — Main game scene
// ============================================================

class GameScene extends Phaser.Scene {

    constructor() { super({ key: 'GameScene' }); }

    create() {
        const W = 1600, H = 1200;

        this.collected         = new Set();
        this._gateOpen         = false;
        this._actionWasPressed = false;
        this._autoQuestZones   = [];
        this._footstepTimer    = 0;

        this.physics.world.setBounds(0, 0, W, H);

        // 1×1 pixel texture — required for all static physics bodies
        const pg = this.make.graphics({ x: 0, y: 0, add: false });
        pg.fillStyle(0xffffff, 1); pg.fillRect(0, 0, 1, 1);
        pg.generateTexture('pixel', 1, 1); pg.destroy();

        this._createGround(W, H);

        this.obstacles = this.physics.add.staticGroup();

        this._createCabin();
        this._createShed();
        this._createTrees();
        this._createFence();
        this._createBushes();
        this._createStumps();

        this._createPlayer();

        this.cameras.main.setBounds(0, 0, W, H);
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this.cameras.main.fadeIn(800, 0, 0, 0);

        this.physics.add.collider(this.player, this.obstacles);

        this.dialogue = new DialogueBox(this);
        this.quest    = new QuestTracker(this);

        this._createCampfire();
        this._createTent();
        this._createSign();
        this._createGlowingClue();
        this._createBoltCutters();
        this._createPicnicTable();
        this._createControlPanel();

        this._buildInteractables();
        this._setupInput();

        this.interactHint = this.add.text(0, 0, '', {
            fontSize: '9px', fill: '#ffffff', fontFamily: 'monospace',
            backgroundColor: '#000000bb', padding: { x: 5, y: 3 }
        }).setDepth(50).setVisible(false);
    }

    update() {
        if (this.dialogue.isVisible()) {
            this.player.setVelocity(0, 0);
            this._handleActionPress(() => this.dialogue.tryDismiss());
            return;
        }

        const speed = 160;
        const goUp    = this.cursors.up.isDown    || this.wasd.up.isDown    || window.virtualKeys.up;
        const goDown  = this.cursors.down.isDown  || this.wasd.down.isDown  || window.virtualKeys.down;
        const goLeft  = this.cursors.left.isDown  || this.wasd.left.isDown  || window.virtualKeys.left;
        const goRight = this.cursors.right.isDown || this.wasd.right.isDown || window.virtualKeys.right;

        let vx = 0, vy = 0;
        if (goLeft)  vx = -speed;
        if (goRight) vx =  speed;
        if (goUp)    vy = -speed;
        if (goDown)  vy =  speed;
        if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }
        this.player.setVelocity(vx, vy);

        // Footstep sound
        if (vx !== 0 || vy !== 0) {
            this._footstepTimer -= 16;
            if (this._footstepTimer <= 0) {
                this._footstepTimer = 340;
                if (window.soundManager && window.soundManager.ready) window.soundManager.playFootstep();
            }
        } else { this._footstepTimer = 0; }

        // Floating hint above nearest interactable
        const nearest = this._nearestInteractable();
        if (nearest) {
            this.interactHint.setText('[ E ] ' + (nearest.hintLabel || 'Examine'));
            this.interactHint.setPosition(nearest.x - this.interactHint.width / 2, nearest.y - 42);
            this.interactHint.setVisible(true);
        } else { this.interactHint.setVisible(false); }

        this._handleActionPress(() => { if (nearest) this._triggerInteraction(nearest); });
        this._checkAutoZones();
    }

    _handleActionPress(cb) {
        const down = this.eKey.isDown || window.virtualKeys.action;
        if (down && !this._actionWasPressed) { this._actionWasPressed = true; cb(); }
        if (!down) this._actionWasPressed = false;
    }

    _nearestInteractable() {
        let best = null, bestDist = Infinity;
        const px = this.player.x, py = this.player.y;
        for (const obj of this.interactables) {
            if (obj.disabled) continue;
            const d = Phaser.Math.Distance.Between(px, py, obj.x, obj.y);
            if (d <= obj.range && d < bestDist) { bestDist = d; best = obj; }
        }
        return best;
    }

    _triggerInteraction(obj) {
        const text    = typeof obj.getText    === 'function' ? obj.getText(this)    : (obj.text    || '');
        const speaker = typeof obj.getSpeaker === 'function' ? obj.getSpeaker(this) : (obj.speaker || '');
        if (!text) return;
        if (window.soundManager && window.soundManager.ready) window.soundManager.playInteract();
        const firstClue = obj.id === 'glowing_clue' && !this.quest.atLeast('NEED_TOOL');
        if (firstClue) {
            this._showDiscovery(speaker, text, () => { if (obj.onInteract) obj.onInteract(this); });
        } else {
            this.dialogue.show(speaker, text, () => { if (obj.onInteract) obj.onInteract(this); });
        }
    }

    _showDiscovery(speaker, text, onDone) {
        this.cameras.main.shake(500, 0.005);
        if (window.soundManager && window.soundManager.ready) window.soundManager.playDiscovery();
        const flash = this.add.graphics();
        flash.fillStyle(0xffffff, 1); flash.fillRect(0, 0, 480, 320);
        flash.setScrollFactor(0).setDepth(200);
        this.tweens.add({
            targets: flash, alpha: { from: 0.7, to: 0 }, duration: 900, ease: 'Sine.easeOut',
            onComplete: () => { flash.destroy(); this.dialogue.show(speaker, text, onDone); }
        });
    }

    _checkAutoZones() {
        const px = this.player.x, py = this.player.y;
        for (const z of this._autoQuestZones) {
            if (z.triggered) continue;
            const inside = (z.radius !== undefined)
                ? Phaser.Math.Distance.Between(px, py, z.x, z.y) <= z.radius
                : (px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h);
            if (inside) {
                z.triggered = true;
                const stateVal = (typeof z.questState === 'string') ? QUEST_STATES[z.questState] : z.questState;
                this.quest.advance(stateVal);
            }
        }
    }

    _setupInput() {
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd    = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W, down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A, right: Phaser.Input.Keyboard.KeyCodes.D
        });
        this.eKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    }

    // ----------------------------------------------------------
    // INTERACTABLES + GATE
    // ----------------------------------------------------------
    _buildInteractables() {
        this.interactables = [
            {
                id: 'campfire', x: 500, y: 470, range: 65, hintLabel: 'Examine',
                speaker: '',
                text: '...The fire is still going. Ash not yet cold. Someone lit this recently.'
            },
            {
                id: 'mug', x: 460, y: 500, range: 50, hintLabel: 'Examine',
                speaker: '',
                text: 'A tin mug, still half-full of coffee. Cold now. Whoever left this didn\'t plan to be gone long.'
            },
            {
                id: 'tent', x: 340, y: 490, range: 60, hintLabel: 'Look inside',
                speaker: '',
                text: 'A small camping tent. Sleeping bag inside, unzipped. A flashlight, dead batteries. Nobody\'s been back to this.'
            },
            {
                id: 'cabin', x: 155, y: 232, range: 60, hintLabel: 'Try door',
                getSpeaker: () => '',
                getText: (s) => s.collected.has('bolt_cutters')
                    ? 'The cabin is padlocked — a keyed lock. The bolt cutters won\'t fit.'
                    : 'Padlocked. A hand-painted sign: RANGERS ONLY.\nThe curtains inside are drawn.'
            },
            {
                id: 'shed', x: 170, y: 900, range: 60, hintLabel: 'Examine',
                speaker: '',
                text: 'A maintenance shed. Locked. Through the gap you can see tools, rope, a few paint cans.'
            },
            {
                id: 'bolt_cutters', x: 240, y: 960, range: 55, hintLabel: 'Take',
                getSpeaker: () => '',
                getText: () => 'Heavy bolt cutters leaning against the shed wall. Red grips, rusted jaw. These could cut a padlock.',
                onInteract: (s) => {
                    s.collected.add('bolt_cutters');
                    if (s._boltCuttersGfx) s._boltCuttersGfx.setVisible(false);
                    if (s._boltCuttersGlow) s._boltCuttersGlow.setVisible(false);
                    s.interactables.find(o => o.id === 'bolt_cutters').disabled = true;
                    s.quest.advance(QUEST_STATES.HAS_TOOL);
                }
            },
            {
                id: 'picnic_note', x: 720, y: 548, range: 60, hintLabel: 'Read note',
                speaker: 'NOTE',
                text: '"Marcus — stay at site 4 until I get back.\nChecked Sector 7 this morning. Something\'s wrong with the east containment wall.\nDon\'t touch anything. — R.D."'
            },
            {
                id: 'sign', x: 820, y: 510, range: 65, hintLabel: 'Read',
                speaker: 'SIGN',
                text: 'DANGER — RADIATION\nRESTRICTED AREA — PINEBROOK NUCLEAR RESERVE\nNo trespassing. Authorized personnel only.'
            },
            {
                id: 'glowing_clue', x: 870, y: 650, range: 72, hintLabel: '???',
                getSpeaker: () => '???',
                getText: (s) => s.quest.atLeast('NEED_TOOL')
                    ? 'The cylinder still hums. A hazard symbol on the casing. Whatever is leaking from inside that fence has been leaking a while.'
                    : 'A metallic cylinder half-buried at the fence post. Cold. It hums. A crack along the casing bleeds pale light.',
                onInteract: (s) => { if (!s.quest.atLeast('NEED_TOOL')) s.quest.advance(QUEST_STATES.NEED_TOOL); }
            },
            {
                id: 'gate', x: 950, y: 580, range: 55, hintLabel: 'Examine',
                getSpeaker: () => '',
                getText: (s) => s.collected.has('bolt_cutters')
                    ? 'You slip the jaws around the shackle and squeeze.\n*SNAP*\nThe padlock drops. The gate groans open.'
                    : 'A chain-link gate. Heavy padlock. No getting through without something to cut it.',
                onInteract: (s) => { if (!s._gateOpen && s.collected.has('bolt_cutters')) s._openGate(); }
            },
            {
                id: 'worker_badge', x: 1100, y: 660, range: 60, hintLabel: 'Examine',
                speaker: 'ID BADGE',
                text: 'PINEBROOK NUCLEAR RESERVE\nEMPLOYEE: MARCUS COLE\nID: NR-4471  CLEARANCE: LEVEL 2\n\n[EXPIRED]'
            },
            {
                id: 'control_panel', x: 1200, y: 580, range: 70, hintLabel: 'Read',
                speaker: 'TERMINAL',
                getText: () => 'FACILITY LOG — SECTOR 7\nBreach detected: Day 14 — Status: UNRESOLVED\nPersonnel: 23 evacuated / 21 accounted for\n[Further records corrupted]',
                onInteract: null
            }
        ];

        this._autoQuestZones = [{
            x: 720, y: 360, w: 200, h: 500,
            questState: QUEST_STATES.DISCOVERED_CLUE, triggered: false
        }];
    }

    _openGate() {
        if (this._gateOpen) return;
        this._gateOpen = true;
        if (this._gateBody) { this._gateBody.body.enable = false; }
        if (this._gateGfx) { this._gateGfx.setVisible(false); }
        if (this._gateLockGfx) { this._gateLockGfx.setVisible(false); }
        const gateObj = this.interactables && this.interactables.find(o => o.id === 'gate');
        if (gateObj) gateObj.disabled = true;
        this.cameras.main.flash(300, 255, 255, 200, false);
        if (window.soundManager && window.soundManager.ready) window.soundManager.playInteract();
        this.quest.advance(QUEST_STATES.INSIDE);
    }

    // ----------------------------------------------------------
    // MAP CREATION
    // ----------------------------------------------------------

    _createGround(w, h) {
        const g = this.add.graphics();

        // Base grass — earthy mid-green matching reference
        g.fillStyle(0x3d6b2e);
        g.fillRect(0, 0, w, h);

        // Darker patches for natural variation
        const dark = [[60,200,130,90],[350,85,170,75],[570,210,120,90],[770,310,130,85],[940,115,110,75],
            [210,720,140,85],[500,840,120,105],[700,975,125,85],[1060,190,145,95],[1250,390,115,85],[1440,700,105,90],[390,1055,155,75]];
        g.fillStyle(0x2d5a22);
        for (const [px,py,pw,ph] of dark) g.fillRect(px,py,pw,ph);

        // Light highlight patches
        g.fillStyle(0x4a7a35);
        [[180,380,80,50],[450,260,70,45],[750,180,90,55],[600,650,80,50],[1100,500,90,55]].forEach(
            ([px,py,pw,ph]) => g.fillRect(px,py,pw,ph));

        // Dirt paths — sandy beige (matching reference ground colour)
        g.fillStyle(0x8b7355);
        g.fillRect(80, 560, 870, 44);    // main E-W path
        g.fillRect(140, 235, 44, 325);   // N branch to cabin
        g.fillRect(140, 604, 44, 355);   // S branch to shed
        g.fillRect(184, 432, 270, 44);   // campfire spur

        // Path edges — slightly lighter to give depth
        g.fillStyle(0x9a8465, 0.5);
        g.fillRect(80, 558, 870, 4);
        g.fillRect(80, 600, 870, 4);

        // Inside fence — subtly wrong-feeling green
        g.fillStyle(0x2c4228);
        g.fillRect(952, 344, 546, 716);

        // Contamination near control panel (purple-grey tint)
        g.fillStyle(0x2a2836);
        g.fillRect(1100, 480, 250, 210);

        // Yellowing grass right by fence (decay marker)
        g.fillStyle(0x4e5e28);
        g.fillRect(858, 490, 92, 330);

        g.fillStyle(0x1e3018);
        g.fillRect(0, 1152, w, 48);
        g.fillRect(0, 0, w, 20);
    }

    _createPlayer() {
        // 18×30 detailed sprite matching reference art style
        const rt = this.add.renderTexture(0, 0, 18, 30);
        const g  = this.make.graphics({ x: 0, y: 0, add: false });

        // Shoes
        g.fillStyle(0x2a1a0a);
        g.fillRect(1, 27, 7, 3); g.fillRect(10, 27, 7, 3);

        // Legs — jeans blue
        g.fillStyle(0x2244aa);
        g.fillRect(2, 20, 6, 8); g.fillRect(10, 20, 6, 8);

        // Jeans highlight
        g.fillStyle(0x3355cc, 0.5);
        g.fillRect(3, 21, 2, 6); g.fillRect(11, 21, 2, 6);

        // Body — red jacket
        g.fillStyle(0xbb2222);
        g.fillRect(2, 10, 14, 11);

        // Jacket highlight / lapel
        g.fillStyle(0xdd3333);
        g.fillRect(3, 10, 5, 4);

        // Backpack (brown, on right shoulder)
        g.fillStyle(0x8b5e20);
        g.fillRect(13, 11, 5, 10);
        g.fillStyle(0x7a5010);
        g.fillRect(14, 12, 3, 8);

        // Arms
        g.fillStyle(0xbb2222);
        g.fillRect(0, 11, 3, 7); g.fillRect(15, 11, 3, 7);

        // Neck skin
        g.fillStyle(0xe8c090);
        g.fillRect(7, 7, 4, 4);

        // Head — skin
        g.fillStyle(0xe8c090);
        g.fillRect(3, 1, 12, 9);

        // Hair — warm brown like reference
        g.fillStyle(0x6b3318);
        g.fillRect(3, 0, 12, 4);
        g.fillRect(3, 4, 2, 3);
        g.fillRect(13, 4, 2, 3);

        // Eyes
        g.fillStyle(0x1a1a1a);
        g.fillRect(5, 5, 2, 2); g.fillRect(11, 5, 2, 2);

        // Mouth
        g.fillStyle(0xb06040);
        g.fillRect(7, 8, 4, 1);

        rt.draw(g, 0, 0);
        rt.saveTexture('player_tex');
        g.destroy(); rt.destroy();

        this.player = this.physics.add.sprite(280, 580, 'player_tex');
        this.player.setCollideWorldBounds(true);
        this.player.setDepth(10);
    }

    _createCabin() {
        const x = 80, y = 120, w = 150, h = 110;
        const g = this.add.graphics().setDepth(4);

        g.fillStyle(0x000000, 0.22); g.fillRect(x+8, y+h+2, w, 10);  // shadow

        g.fillStyle(0x7a3d0e); g.fillRect(x, y, w, h);
        g.lineStyle(1, 0x5c2d0a, 0.35);
        for (let yi = y+14; yi < y+h; yi += 14) g.lineBetween(x, yi, x+w, yi);

        g.fillStyle(0x4a2009); g.fillRect(x-10, y, w+20, 16);
        g.fillStyle(0x351506); g.fillTriangle(x-10, y+16, x+w/2, y-28, x+w+10, y+16);

        g.fillStyle(0x2a1005); g.fillRect(x+55, y+62, 40, 48);
        g.fillStyle(0xbbbbbb); g.fillRect(x+71, y+84, 5, 5);

        g.fillStyle(0x6699bb); g.fillRect(x+10, y+26, 28, 22); g.fillRect(x+112, y+26, 28, 22);
        g.lineStyle(2, 0x2a1005,1); g.strokeRect(x+10,y+26,28,22); g.strokeRect(x+112,y+26,28,22);

        const b = this.obstacles.create(x+w/2, y+h/2, 'pixel');
        b.setVisible(false); b.setDisplaySize(w,h); b.body.setSize(w,h); b.refreshBody();
    }

    _createShed() {
        const x = 110, y = 860, w = 100, h = 80;
        const g = this.add.graphics().setDepth(3);
        g.fillStyle(0x42280c); g.fillRect(x, y, w, h);
        g.lineStyle(1, 0x2e1a08, 0.7);
        for (let yi = y+12; yi < y+h; yi += 12) g.lineBetween(x, yi, x+w, yi);
        g.fillStyle(0x2a1508); g.fillRect(x-6, y, w+12, 14);
        g.fillStyle(0x1e1006); g.fillTriangle(x-6, y+14, x+w/2, y-16, x+w+6, y+14);
        g.fillStyle(0x180c04); g.fillRect(x+34, y+36, 32, 44);

        const b = this.obstacles.create(x+w/2, y+h/2, 'pixel');
        b.setVisible(false); b.setDisplaySize(w,h); b.body.setSize(w,h); b.refreshBody();
    }

    _createTrees() {
        [
            // North border
            [80,76],[244,60],[404,76],[584,66],[744,74],[904,60],[1084,76],[1264,66],[1434,76],
            // NW cluster (around cabin)
            [65,292],[308,160],[66,438],[325,375],
            // West edge
            [54,700],[62,924],[67,1092],
            // South border
            [202,1110],[424,1094],[644,1114],[824,1096],
            // Interior scattered
            [560,295],[698,385],[412,754],[622,820],
            // Beyond fence (unreachable, mysterious)
            [1158,176],[1365,156],[1475,316],[1482,908]
        ].forEach(([tx,ty]) => this._drawTree(tx, ty));
    }

    // Pine/fir tree — triangular layered style matching the reference image
    _drawTree(tx, ty) {
        const g = this.add.graphics().setDepth(3);

        // Ground shadow ellipse
        g.fillStyle(0x000000, 0.18); g.fillEllipse(tx, ty+20, 38, 12);

        // Trunk — warm brown
        g.fillStyle(0x6b3a18); g.fillRect(tx-5, ty+2, 10, 22);
        g.fillStyle(0x8b4e22); g.fillRect(tx-4, ty+2, 4, 20); // highlight

        // Three stacked triangle layers (bottom to top)
        g.fillStyle(0x1a3d18); g.fillTriangle(tx-22, ty+4, tx, ty-18, tx+22, ty+4);
        g.fillStyle(0x1e5220); g.fillTriangle(tx-17, ty-8, tx, ty-28, tx+17, ty-8);
        g.fillStyle(0x246628); g.fillTriangle(tx-11, ty-20, tx, ty-40, tx+11, ty-20);

        // Highlight flecks — lighter green on left face
        g.fillStyle(0x3a8830, 0.55);
        g.fillTriangle(tx-22, ty+4, tx-8, ty-10, tx-4, ty+4);
        g.fillTriangle(tx-17, ty-8, tx-6, ty-20, tx-2, ty-8);

        // Physics box (trunk area)
        const b = this.obstacles.create(tx, ty+10, 'pixel');
        b.setVisible(false); b.setDisplaySize(20, 24); b.body.setSize(20, 24); b.refreshBody();
    }

    _createBushes() {
        [[210,545],[345,622],[625,558],[688,485],[526,432],[162,610]].forEach(([bx,by]) => {
            const g = this.add.graphics().setDepth(3);
            g.fillStyle(0x2d6a2a); g.fillCircle(bx, by, 13);
            g.fillStyle(0x358030); g.fillCircle(bx+11, by+3, 11);
            g.fillStyle(0x2d6a2a); g.fillCircle(bx-9, by+4, 10);
            g.fillStyle(0x42943e, 0.6); g.fillCircle(bx-2, by-5, 7); g.fillCircle(bx+7, by-3, 6);
        });
    }

    _createStumps() {
        [[302,705],[585,825],[454,904]].forEach(([sx,sy]) => {
            const g = this.add.graphics().setDepth(3);
            g.fillStyle(0x5c3d11); g.fillEllipse(sx, sy, 26, 15);
            g.fillStyle(0x8b5e2a); g.fillEllipse(sx, sy-3, 24, 13);
            g.lineStyle(1, 0x6b4a1a, 0.5); g.strokeEllipse(sx, sy-3, 17, 9);
            g.lineStyle(1, 0x6b4a1a, 0.3); g.strokeEllipse(sx, sy-3, 10, 5);
        });
    }


    _createFence() {
        const g = this.add.graphics().setDepth(4);

        // Fence segments — chain-link style dark gray metal
        const segments = [
            // Top rail: y=560, x=840–1490
            { x1: 840, y1: 560, x2: 1490, y2: 560 },
            // Right rail: x=1490, y=560–1060
            { x1: 1490, y1: 560, x2: 1490, y2: 1060 },
            // Bottom rail: y=1060, x=840–1490
            { x1: 840, y1: 1060, x2: 1490, y2: 1060 },
            // Left rail: x=840, y=560–1060 (excluding gate gap 560–620)
            { x1: 840, y1: 620, x2: 840, y2: 1060 },
        ];

        // Draw rails
        g.lineStyle(4, 0x445544, 1);
        segments.forEach(s => { g.beginPath(); g.moveTo(s.x1, s.y1); g.lineTo(s.x2, s.y2); g.strokePath(); });

        // Fence posts every 80px
        g.fillStyle(0x556655);
        // Top row
        for (let x = 840; x <= 1490; x += 80) {
            g.fillRect(x - 3, 555, 6, 18);
        }
        // Bottom row
        for (let x = 840; x <= 1490; x += 80) {
            g.fillRect(x - 3, 1055, 6, 18);
        }
        // Left side posts (skip gate gap)
        for (let y = 620; y <= 1060; y += 80) {
            g.fillRect(835, y, 10, 6);
        }
        // Right side posts
        for (let y = 560; y <= 1060; y += 80) {
            g.fillRect(1485, y, 10, 6);
        }

        // Cross-hatch mesh pattern on top section (visual only)
        g.lineStyle(1, 0x3a4a3a, 0.4);
        for (let x = 840; x < 1490; x += 20) {
            for (let y = 560; y < 1060; y += 20) {
                g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20, y + 20); g.strokePath();
                g.beginPath(); g.moveTo(x + 20, y); g.lineTo(x, y + 20); g.strokePath();
            }
        }

        // Barbed wire top (three dots along rail)
        g.fillStyle(0x889988, 0.8);
        for (let x = 860; x <= 1470; x += 40) {
            g.fillCircle(x, 558, 2);
        }

        // === Physics bodies ===
        // Top wall
        const top = this.obstacles.create(1165, 560, 'pixel');
        top.setVisible(false); top.setDisplaySize(650, 8); top.body.setSize(650, 8); top.refreshBody();
        // Right wall
        const right = this.obstacles.create(1490, 810, 'pixel');
        right.setVisible(false); right.setDisplaySize(8, 500); right.body.setSize(8, 500); right.refreshBody();
        // Bottom wall
        const bot = this.obstacles.create(1165, 1060, 'pixel');
        bot.setVisible(false); bot.setDisplaySize(650, 8); bot.body.setSize(650, 8); bot.refreshBody();
        // Left wall upper (above gate)
        const leftTop = this.obstacles.create(840, 562, 'pixel');
        leftTop.setVisible(false); leftTop.setDisplaySize(8, 4); leftTop.body.setSize(8, 4); leftTop.refreshBody();
        // Left wall lower (below gate)
        const leftBot = this.obstacles.create(840, 840, 'pixel');
        leftBot.setVisible(false); leftBot.setDisplaySize(8, 440); leftBot.body.setSize(8, 440); leftBot.refreshBody();

        // Gate visual (will be hidden on open)
        this._gateGfx = this.add.graphics().setDepth(4);
        this._gateGfx.lineStyle(3, 0x889988, 1);
        this._gateGfx.fillStyle(0x445544, 0.5);
        this._gateGfx.fillRect(836, 562, 8, 58);
        this._gateGfx.strokeRect(836, 562, 8, 58);
        // Gate cross bar
        this._gateGfx.lineStyle(2, 0x889988, 0.6);
        this._gateGfx.beginPath(); this._gateGfx.moveTo(836, 562); this._gateGfx.lineTo(844, 620); this._gateGfx.strokePath();
        this._gateGfx.beginPath(); this._gateGfx.moveTo(844, 562); this._gateGfx.lineTo(836, 620); this._gateGfx.strokePath();

        // Gate lock icon
        this._gateLockGfx = this.add.graphics().setDepth(5);
        this._gateLockGfx.fillStyle(0xd4a040);
        this._gateLockGfx.fillRect(838, 587, 8, 7);
        this._gateLockGfx.lineStyle(2, 0xd4a040);
        this._gateLockGfx.strokeCircle(842, 587, 4);

        // Gate physics body (stored so we can disable it on open)
        this._gateBody = this.obstacles.create(840, 591, 'pixel');
        this._gateBody.setVisible(false);
        this._gateBody.setDisplaySize(8, 58);
        this._gateBody.body.setSize(8, 58);
        this._gateBody.refreshBody();

    }

    _createCampfire() {
        const cx = 500, cy = 472;

        const g = this.add.graphics().setDepth(3);
        // Stone ring
        g.fillStyle(0x666666);
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            g.fillCircle(cx + Math.cos(a) * 16, cy + Math.sin(a) * 10, 5);
        }
        // Ash/embers base
        g.fillStyle(0x2a1a0a); g.fillEllipse(cx, cy, 20, 12);

        // Log cross
        g.fillStyle(0x4a2a0a);
        g.fillRect(cx - 14, cy - 3, 28, 6);
        g.fillRect(cx - 3, cy - 14, 6, 28);

        // Flame layers — drawn as overlapping triangles
        const flameGfx = this.add.graphics().setDepth(4);
        const drawFlame = () => {
            flameGfx.clear();
            const t = this.time.now * 0.003;
            const flicker = Math.sin(t * 4.7) * 3;
            // Outer flame (orange)
            flameGfx.fillStyle(0xe06010, 0.85);
            flameGfx.fillTriangle(cx - 10, cy, cx + flicker, cy - 28, cx + 10, cy);
            // Inner flame (yellow)
            flameGfx.fillStyle(0xffe040, 0.9);
            flameGfx.fillTriangle(cx - 6, cy, cx + flicker * 0.5, cy - 18, cx + 6, cy);
            // Core (white-hot)
            flameGfx.fillStyle(0xffffff, 0.6);
            flameGfx.fillTriangle(cx - 3, cy, cx, cy - 9, cx + 3, cy);
        };
        this.time.addEvent({ delay: 50, callback: drawFlame, loop: true });
        drawFlame();

        // Glow halo
        const glow = this.add.graphics().setDepth(2);
        glow.fillStyle(0xff8800, 0.12);
        glow.fillCircle(cx, cy, 40);
        this.tweens.add({
            targets: glow, alpha: { from: 0.5, to: 1 },
            yoyo: true, repeat: -1, duration: 800, ease: 'Sine.easeInOut'
        });
    }

    _createSign() {
        const sx = 820, sy = 512;
        const g = this.add.graphics().setDepth(4);

        // Post
        g.fillStyle(0x8b6914); g.fillRect(sx - 3, sy, 6, 36);

        // Sign board — yellow/orange warning background
        g.fillStyle(0xf0c030); g.fillRect(sx - 36, sy - 36, 72, 38);
        g.lineStyle(3, 0xcc7700); g.strokeRect(sx - 36, sy - 36, 72, 38);

        // Radiation symbol (three arcs = 3 filled sectors)
        g.fillStyle(0x1a1a1a);
        g.fillCircle(sx, sy - 17, 5); // center dot
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
            const r1 = 8, r2 = 16;
            g.fillStyle(0x1a1a1a);
            // Draw a "blade" as a filled triangle approximation
            g.fillTriangle(
                sx + Math.cos(a + 0.4) * r1, sy - 17 + Math.sin(a + 0.4) * r1,
                sx + Math.cos(a - 0.4) * r1, sy - 17 + Math.sin(a - 0.4) * r1,
                sx + Math.cos(a) * r2, sy - 17 + Math.sin(a) * r2
            );
        }

        // "DANGER" text is handled by add.text (more readable)
        this.add.text(sx - 28, sy - 12, 'DANGER', {
            fontSize: '7px', fill: '#1a1a1a', fontFamily: 'monospace', fontStyle: 'bold'
        }).setDepth(5);
        this.add.text(sx - 28, sy - 4, 'RADIATION', {
            fontSize: '6px', fill: '#1a1a1a', fontFamily: 'monospace'
        }).setDepth(5);

        // Physics body for sign post
        const b = this.obstacles.create(sx, sy + 18, 'pixel');
        b.setVisible(false); b.setDisplaySize(10, 36); b.body.setSize(10, 36); b.refreshBody();
    }

    _createGlowingClue() {
        const cx = 870, cy = 655;

        // Glow halo
        this._clueGlow = this.add.graphics().setDepth(3);
        this._clueGlow.fillStyle(0x00ffcc, 0.18);
        this._clueGlow.fillCircle(cx, cy, 28);

        // Device body — small rectangular gadget
        const g = this.add.graphics().setDepth(4);
        g.fillStyle(0x1a2a1a); g.fillRect(cx - 10, cy - 7, 20, 14);
        g.lineStyle(1, 0x00ffcc, 0.8); g.strokeRect(cx - 10, cy - 7, 20, 14);

        // Screen glow on device
        g.fillStyle(0x00ffcc, 0.6); g.fillRect(cx - 7, cy - 4, 10, 8);

        // Pulse tween on the glow halo
        this.tweens.add({
            targets: this._clueGlow,
            alpha: { from: 0.4, to: 1 },
            scaleX: { from: 0.85, to: 1.15 },
            scaleY: { from: 0.85, to: 1.15 },
            yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut'
        });

        // Particle-like sparkle dots
        const sparkles = this.add.graphics().setDepth(5);
        const sparklePositions = [
            [cx - 18, cy - 12], [cx + 14, cy - 8],
            [cx - 8, cy + 18], [cx + 20, cy + 6],
        ];
        let sparklePhase = 0;
        this.time.addEvent({
            delay: 200, loop: true,
            callback: () => {
                sparkles.clear();
                sparklePhase++;
                sparklePositions.forEach(([sx, sy], i) => {
                    const visible = ((sparklePhase + i) % 3) !== 0;
                    if (visible) { sparkles.fillStyle(0x00ffcc, 0.7); sparkles.fillCircle(sx, sy, 2); }
                });
            }
        });
    }

    _createBoltCutters() {
        const bx = 240, by = 962;
        this._boltCuttersGfx = this.add.graphics().setDepth(4);
        const g = this._boltCuttersGfx;

        // Tool silhouette — two handle bars with jaws
        // Handles (red rubber grip)
        g.fillStyle(0xcc2222); g.fillRect(bx - 14, by - 3, 28, 6);
        g.fillStyle(0xcc2222); g.fillRect(bx - 4, by - 15, 8, 12);

        // Metal pivot
        g.fillStyle(0x888888); g.fillCircle(bx, by, 4);

        // Jaws (dark metal)
        g.fillStyle(0x444444);
        g.fillTriangle(bx - 4, by, bx - 18, by + 8, bx - 4, by + 8);
        g.fillTriangle(bx + 4, by, bx + 18, by + 8, bx + 4, by + 8);

        // Shimmer/highlight
        g.fillStyle(0xaaaaaa, 0.3); g.fillRect(bx - 12, by - 2, 24, 2);

        // Glow indicator (collectible highlight)
        this._boltCuttersGlow = this.add.graphics().setDepth(3);
        this._boltCuttersGlow.fillStyle(0xffffaa, 0.15);
        this._boltCuttersGlow.fillCircle(bx, by, 22);
        this.tweens.add({
            targets: this._boltCuttersGlow,
            alpha: { from: 0.3, to: 0.8 }, yoyo: true, repeat: -1, duration: 700
        });
    }

    _createPicnicTable() {
        const tx = 720, ty = 550;
        const g = this.add.graphics().setDepth(3);

        // Table top — wooden planks
        g.fillStyle(0xa0714a); g.fillRect(tx - 34, ty - 8, 68, 16);
        // Plank lines
        g.lineStyle(1, 0x7a5030, 0.5);
        g.beginPath(); g.moveTo(tx - 34, ty - 2); g.lineTo(tx + 34, ty - 2); g.strokePath();
        g.beginPath(); g.moveTo(tx - 34, ty + 4); g.lineTo(tx + 34, ty + 4); g.strokePath();

        // Bench seats (left and right)
        g.fillStyle(0x886040);
        g.fillRect(tx - 42, ty + 12, 84, 8);  // front bench

        // Table legs (X cross-brace style)
        g.lineStyle(3, 0x7a5030);
        g.beginPath(); g.moveTo(tx - 26, ty + 8);  g.lineTo(tx - 26, ty + 30); g.strokePath();
        g.beginPath(); g.moveTo(tx + 26, ty + 8);  g.lineTo(tx + 26, ty + 30); g.strokePath();

        // Mug on table
        g.fillStyle(0x8c6040); g.fillRect(tx + 8, ty - 6, 8, 10);
        g.fillStyle(0x1a0a08); g.fillRect(tx + 9, ty - 5, 6, 4); // coffee surface

        // Physics body for table
        const b = this.obstacles.create(tx, ty, 'pixel');
        b.setVisible(false); b.setDisplaySize(68, 28); b.body.setSize(68, 28); b.refreshBody();
    }

    _createControlPanel() {
        const cx = 1200, cy = 582;
        const g = this.add.graphics().setDepth(4);

        // Main housing — dark metal console
        g.fillStyle(0x1a1e22); g.fillRect(cx - 40, cy - 28, 80, 56);
        g.lineStyle(2, 0x334433); g.strokeRect(cx - 40, cy - 28, 80, 56);

        // Terminal screen (green phosphor)
        g.fillStyle(0x0a1a0a); g.fillRect(cx - 30, cy - 22, 60, 30);
        g.fillStyle(0x00cc44, 0.2); g.fillRect(cx - 30, cy - 22, 60, 30);
        g.lineStyle(1, 0x00cc44, 0.5); g.strokeRect(cx - 30, cy - 22, 60, 30);

        // Screen text lines (scan lines)
        g.lineStyle(1, 0x00cc44, 0.3);
        for (let ly = cy - 18; ly < cy + 8; ly += 4) {
            g.beginPath(); g.moveTo(cx - 28, ly); g.lineTo(cx + 28, ly); g.strokePath();
        }

        // Control knobs (row of circles)
        g.fillStyle(0x556644);
        [-20, -6, 8, 22].forEach(ox => g.fillCircle(cx + ox, cy + 18, 4));

        // Status light (blinking)
        this._statusLight = this.add.graphics().setDepth(5);
        this._statusLight.fillStyle(0x00ff44); this._statusLight.fillCircle(cx + 32, cy - 22, 4);
        this.tweens.add({
            targets: this._statusLight,
            alpha: { from: 1, to: 0.1 }, yoyo: true, repeat: -1, duration: 1200
        });

        // Panel glow
        const panelGlow = this.add.graphics().setDepth(3);
        panelGlow.fillStyle(0x00cc44, 0.06); panelGlow.fillRect(cx - 50, cy - 38, 100, 76);
        this.tweens.add({
            targets: panelGlow, alpha: { from: 0.4, to: 1 }, yoyo: true, repeat: -1, duration: 2000
        });

        // Physics body
        const b = this.obstacles.create(cx, cy, 'pixel');
        b.setVisible(false); b.setDisplaySize(80, 56); b.body.setSize(80, 56); b.refreshBody();
    }

    _createTent() {
        const tx = 340, ty = 495;
        const g = this.add.graphics().setDepth(3);

        // Ground shadow
        g.fillStyle(0x000000, 0.15); g.fillEllipse(tx, ty + 28, 80, 20);

        // Tent body — orange triangular shape
        g.fillStyle(0xdd6612);
        g.fillTriangle(tx - 44, ty + 22, tx, ty - 28, tx + 44, ty + 22);

        // Tent shading (darker right side)
        g.fillStyle(0x994408, 0.45);
        g.fillTriangle(tx, ty - 28, tx + 44, ty + 22, tx + 10, ty + 22);

        // Tent highlight (lighter left side)
        g.fillStyle(0xff8822, 0.3);
        g.fillTriangle(tx - 44, ty + 22, tx, ty - 28, tx - 20, ty + 22);

        // Tent entrance / dark opening
        g.fillStyle(0x1a0a00, 0.7);
        g.fillTriangle(tx - 12, ty + 22, tx, ty + 2, tx + 12, ty + 22);

        // Tent poles (visible ridge line)
        g.lineStyle(2, 0xcc5500, 0.6);
        g.beginPath(); g.moveTo(tx - 44, ty + 22); g.lineTo(tx, ty - 28); g.strokePath();
        g.beginPath(); g.moveTo(tx + 44, ty + 22); g.lineTo(tx, ty - 28); g.strokePath();

        // Guy ropes
        g.lineStyle(1, 0x886644, 0.4);
        g.beginPath(); g.moveTo(tx - 30, ty + 18); g.lineTo(tx - 60, ty + 30); g.strokePath();
        g.beginPath(); g.moveTo(tx + 30, ty + 18); g.lineTo(tx + 60, ty + 30); g.strokePath();

        // Physics body
        const b = this.obstacles.create(tx, ty + 10, 'pixel');
        b.setVisible(false); b.setDisplaySize(70, 30); b.body.setSize(70, 30); b.refreshBody();
    }
}
