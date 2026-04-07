// ============================================================
// GameScene.js — Main game scene
// Map, player, movement, collisions, interactions, quests.
// ============================================================

class GameScene extends Phaser.Scene {

    constructor() {
        super({ key: 'GameScene' });
    }

    // ----------------------------------------------------------
    // CREATE
    // ----------------------------------------------------------
    create() {
        const W = 1600, H = 1200;

        // Game-state flags
        this.collected         = new Set(); // item IDs the player has picked up
        this._gateOpen         = false;
        this._actionWasPressed = false;
        this._autoQuestZones   = [];
        this._footstepTimer    = 0;

        this.physics.world.setBounds(0, 0, W, H);

        // Generate a 1×1 pixel texture used by every invisible static body.
        // Passing null to obstacles.create() produces a zero-size body that
        // never collides — this single fix makes ALL collisions work correctly.
        const pg = this.make.graphics({ x: 0, y: 0, add: false });
        pg.fillStyle(0xffffff, 1);
        pg.fillRect(0, 0, 1, 1);
        pg.generateTexture('pixel', 1, 1);
        pg.destroy();

        // Ground + paths (drawn first, lowest depth)
        this._createGround(W, H);

        // Static physics group for all collidable objects
        this.obstacles = this.physics.add.staticGroup();

        // Map objects — each adds its own body to this.obstacles
        this._createCabin();
        this._createShed();
        this._createTrees();
        this._createFence();   // also sets this._gateBody + this._gateGfx

        // Player sprite
        this._createPlayer();

        // Camera
        this.cameras.main.setBounds(0, 0, W, H);
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this.cameras.main.fadeIn(800, 0, 0, 0);

        // Collider
        this.physics.add.collider(this.player, this.obstacles);

        // UI (fixed to camera via setScrollFactor(0) inside each class)
        this.dialogue = new DialogueBox(this);
        this.quest    = new QuestTracker(this);

        // Decorative / interactable world objects (no physics bodies)
        this._createCampfire();
        this._createSign();
        this._createGlowingClue();
        this._createBoltCutters();
        this._createControlPanel();

        // Interactables data array + auto-trigger zones
        this._buildInteractables();

        // Keyboard input
        this._setupInput();

        // Floating world-space hint above nearest interactable
        this.interactHint = this.add.text(0, 0, '', {
            fontSize: '9px',
            fill: '#ffffff',
            fontFamily: 'monospace',
            backgroundColor: '#000000bb',
            padding: { x: 5, y: 3 }
        }).setDepth(50).setVisible(false);
    }

    // ----------------------------------------------------------
    // UPDATE — every frame
    // ----------------------------------------------------------
    update() {
        // Dialogue open: freeze player, handle dismiss only
        if (this.dialogue.isVisible()) {
            this.player.setVelocity(0, 0);
            this._handleActionPress(() => this.dialogue.tryDismiss());
            return;
        }

        // Movement
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

        // Footstep sound every ~340 ms while moving
        if (vx !== 0 || vy !== 0) {
            this._footstepTimer -= 16; // ~1 frame at 60fps
            if (this._footstepTimer <= 0) {
                this._footstepTimer = 340;
                if (window.soundManager && window.soundManager.ready) {
                    window.soundManager.playFootstep();
                }
            }
        } else {
            this._footstepTimer = 0;
        }

        // Floating hint above nearest interactable
        const nearest = this._nearestInteractable();
        if (nearest) {
            this.interactHint.setText('[ E ] ' + (nearest.hintLabel || 'Examine'));
            this.interactHint.setPosition(
                nearest.x - this.interactHint.width / 2,
                nearest.y - 40
            );
            this.interactHint.setVisible(true);
        } else {
            this.interactHint.setVisible(false);
        }

        // E / A button
        this._handleActionPress(() => {
            if (nearest) this._triggerInteraction(nearest);
        });

        // Auto-zone quest triggers
        this._checkAutoZones();
    }

    // ----------------------------------------------------------
    // CORE HELPERS
    // ----------------------------------------------------------

    // Fire callback once per button press (not on hold)
    _handleActionPress(callback) {
        const down = this.eKey.isDown || window.virtualKeys.action;
        if (down && !this._actionWasPressed) {
            this._actionWasPressed = true;
            callback();
        }
        if (!down) this._actionWasPressed = false;
    }

    // Return the closest enabled interactable within range, or null
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

    // Open dialogue for an object, resolving dynamic text/speaker functions
    _triggerInteraction(obj) {
        const text    = typeof obj.getText    === 'function' ? obj.getText(this)    : (obj.text    || '');
        const speaker = typeof obj.getSpeaker === 'function' ? obj.getSpeaker(this) : (obj.speaker || '');
        if (!text) return;

        // Play a short blip on every interaction
        if (window.soundManager && window.soundManager.ready) {
            window.soundManager.playInteract();
        }

        // First-time clue discovery gets a camera shake + flash
        const firstClue = obj.id === 'glowing_clue' && !this.quest.atLeast('NEED_TOOL');
        if (firstClue) {
            this._showDiscovery(speaker, text, () => {
                if (obj.onInteract) obj.onInteract(this);
            });
        } else {
            this.dialogue.show(speaker, text, () => {
                if (obj.onInteract) obj.onInteract(this);
            });
        }
    }

    // Camera shake + white flash + discovery sting, then show dialogue
    _showDiscovery(speaker, text, onDone) {
        this.cameras.main.shake(500, 0.005);
        if (window.soundManager && window.soundManager.ready) {
            window.soundManager.playDiscovery();
        }
        const flash = this.add.graphics();
        flash.fillStyle(0xffffff, 1);
        flash.fillRect(0, 0, 480, 320);
        flash.setScrollFactor(0).setDepth(200);
        this.tweens.add({
            targets: flash,
            alpha: { from: 0.7, to: 0 },
            duration: 900,
            ease: 'Sine.easeOut',
            onComplete: () => { flash.destroy(); this.dialogue.show(speaker, text, onDone); }
        });
    }

    // Check rectangular zones that auto-advance quest when player walks into them
    _checkAutoZones() {
        const px = this.player.x, py = this.player.y;
        for (const z of this._autoQuestZones) {
            if (z.triggered) continue;
            if (px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h) {
                z.triggered = true;
                this.quest.advance(z.questState);
            }
        }
    }

    _setupInput() {
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd    = this.input.keyboard.addKeys({
            up:    Phaser.Input.Keyboard.KeyCodes.W,
            down:  Phaser.Input.Keyboard.KeyCodes.S,
            left:  Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D
        });
        this.eKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    }

    // ----------------------------------------------------------
    // INTERACTABLES + GATE
    // ----------------------------------------------------------
    _buildInteractables() {
        this.interactables = [
            {
                id: 'campfire', x: 420, y: 440, range: 65, hintLabel: 'Examine',
                speaker: '',
                text: '...The fire is still going. Ash not yet cold. Someone lit this recently and left in a hurry.'
            },
            {
                id: 'cabin', x: 155, y: 232, range: 60, hintLabel: 'Try door',
                getSpeaker: () => '',
                getText: (s) => s.collected.has('bolt_cutters')
                    ? 'The cabin is padlocked — a keyed lock, not a shackle. The bolt cutters are useless here.'
                    : 'Padlocked. A hand-painted sign reads: RANGERS ONLY.\nThe curtains are drawn tight.'
            },
            {
                id: 'shed', x: 170, y: 900, range: 60, hintLabel: 'Examine',
                speaker: '',
                text: 'A maintenance shed. Locked. Through a gap in the boards you can make out tools — a shovel, rope, paint cans.'
            },
            {
                id: 'bolt_cutters', x: 240, y: 960, range: 55, hintLabel: 'Take',
                getSpeaker: () => '',
                getText: () => 'Heavy-duty bolt cutters leaning against the shed wall. Red grips, rusted jaw. These could cut through a padlock.',
                onInteract: (s) => {
                    s.collected.add('bolt_cutters');
                    if (s._boltCuttersGfx) s._boltCuttersGfx.setVisible(false);
                    s.interactables.find(o => o.id === 'bolt_cutters').disabled = true;
                    s.quest.advance(QUEST_STATES.HAS_TOOL);
                }
            },
            {
                id: 'sign', x: 820, y: 510, range: 65, hintLabel: 'Read',
                speaker: 'SIGN',
                text: 'RESTRICTED AREA — PINEBROOK NUCLEAR RESERVE\nNo trespassing. Authorized personnel only.\nViolators subject to federal prosecution.'
            },
            {
                id: 'glowing_clue', x: 870, y: 650, range: 72, hintLabel: '???',
                getSpeaker: () => '???',
                getText: (s) => s.quest.atLeast('NEED_TOOL')
                    ? 'The cylinder still hums. A hazard symbol pressed into the casing — three interlocking triangles. Whatever is leaking from inside that fence has been leaking a while.'
                    : 'A metallic cylinder, half-buried at the base of a fence post. Cold to the touch. It hums. A hairline crack runs along the casing and pale light bleeds out.',
                onInteract: (s) => { if (!s.quest.atLeast('NEED_TOOL')) s.quest.advance(QUEST_STATES.NEED_TOOL); }
            },
            {
                id: 'gate', x: 950, y: 580, range: 55, hintLabel: 'Examine',
                getSpeaker: () => '',
                getText: (s) => s.collected.has('bolt_cutters')
                    ? 'You slip the jaws around the shackle and squeeze.\n*SNAP*\nThe padlock drops. The gate groans open.'
                    : 'A chain-link gate sealed with a heavy padlock. You need something to cut through it.',
                onInteract: (s) => { if (!s._gateOpen && s.collected.has('bolt_cutters')) s._openGate(); }
            },
            {
                id: 'control_panel', x: 1200, y: 580, range: 70, hintLabel: 'Read',
                speaker: 'TERMINAL',
                getText: () => 'FACILITY LOG — SECTOR 7\nBreach detected: Day 14 — Status: UNRESOLVED\nPersonnel: 23 evacuated / 21 accounted for\n[Further records corrupted]',
                onInteract: null  // quest already advanced to INSIDE when gate opened
            }
        ];

        // Auto-zone: walking east of x=720 reveals the clue (once)
        this._autoQuestZones = [{
            x: 720, y: 360, w: 200, h: 500,
            questState: QUEST_STATES.DISCOVERED_CLUE,
            triggered: false
        }];
    }

    _openGate() {
        this._gateOpen = true;
        if (this._gateBody) {
            this.obstacles.remove(this._gateBody, true, true);
            this._gateBody = null;
        }
        if (this._gateGfx) {
            this.tweens.add({
                targets: this._gateGfx,
                alpha: 0.2,
                x: this._gateGfx.x - 24,
                duration: 350,
                ease: 'Sine.easeOut'
            });
        }
        this.interactables.find(o => o.id === 'gate').disabled = true;
        // Advance quest — player is now inside
        this.quest.advance(QUEST_STATES.INSIDE);
    }

    // ----------------------------------------------------------
    // MAP CREATION
    // ----------------------------------------------------------

    _createGround(w, h) {
        const g = this.add.graphics();

        // Base grass
        g.fillStyle(0x2d5a27);
        g.fillRect(0, 0, w, h);

        // Darker texture patches
        const patches = [
            [60,200,130,80],[340,80,160,70],[560,200,110,90],
            [760,300,120,80],[920,110,100,70],[200,700,130,80],
            [480,820,110,100],[680,960,120,80],[1050,180,140,90],
            [1240,380,110,80],[1420,680,100,90],[380,1040,150,70]
        ];
        g.fillStyle(0x1f4719);
        for (const [px,py,pw,ph] of patches) g.fillRect(px,py,pw,ph);

        // --- Paths (dirt brown) ---
        g.fillStyle(0x7a5c2a);
        g.fillRect(80, 560, 870, 40);   // main E-W path (stops at fence)
        g.fillRect(140, 232, 40, 328);  // N branch up to cabin door
        g.fillRect(140, 600, 40, 350);  // S branch down to shed
        g.fillRect(180, 430, 260, 40);  // short spur east to campfire

        // Inside-fence: slightly wrong green, eerie feel
        g.fillStyle(0x263825);
        g.fillRect(952, 342, 546, 720);

        // Contamination patch near control panel
        g.fillStyle(0x252535);
        g.fillRect(1100, 480, 240, 200);

        // Dead/yellowing grass near fence (environmental storytelling)
        g.fillStyle(0x4a5c22);
        g.fillRect(860, 480, 90, 320);

        // World edges
        g.fillStyle(0x1a2e17);
        g.fillRect(0, 1150, w, 50);
        g.fillRect(0, 0, w, 18);
    }

    _createPlayer() {
        const rt = this.add.renderTexture(0, 0, 16, 28);
        const g  = this.make.graphics({ x: 0, y: 0, add: false });

        g.fillStyle(0x3d6dbb);  // jacket
        g.fillRect(0, 10, 16, 18);
        g.fillStyle(0x1a4a1a);  // cap brim
        g.fillRect(1, 6, 14, 5);
        g.fillStyle(0x236623);  // cap crown
        g.fillRect(3, 0, 10, 8);
        g.fillStyle(0xffffff);  // eyes
        g.fillRect(3, 13, 3, 3);
        g.fillRect(10, 13, 3, 3);
        g.fillStyle(0x2a2a2a);  // legs
        g.fillRect(2, 24, 5, 4);
        g.fillRect(9, 24, 5, 4);

        rt.draw(g, 0, 0);
        rt.saveTexture('player_tex');
        g.destroy();
        rt.destroy();

        this.player = this.physics.add.sprite(280, 580, 'player_tex');
        this.player.setCollideWorldBounds(true);
        this.player.setDepth(10);
    }

    _createCabin() {
        const x = 80, y = 120, w = 150, h = 110;
        const g = this.add.graphics().setDepth(4);

        // Drop shadow
        g.fillStyle(0x000000, 0.25);
        g.fillRect(x + 6, y + h + 2, w, 10);

        // Walls
        g.fillStyle(0x7a3d0e);
        g.fillRect(x, y, w, h);

        // Wood grain lines
        g.lineStyle(1, 0x5c2d0a, 0.4);
        for (let yi = y + 14; yi < y + h; yi += 14) g.lineBetween(x, yi, x + w, yi);

        // Roof overhang
        g.fillStyle(0x4a2009);
        g.fillRect(x - 10, y, w + 20, 16);

        // Roof peak
        g.fillStyle(0x351506);
        g.fillTriangle(x - 10, y + 16, x + w / 2, y - 30, x + w + 10, y + 16);

        // Door (centered at bottom)
        g.fillStyle(0x2a1005);
        g.fillRect(x + 55, y + 62, 40, 48);
        g.fillStyle(0xaaaaaa);
        g.fillRect(x + 71, y + 84, 5, 5);  // handle

        // Windows
        g.fillStyle(0x6688aa);
        g.fillRect(x + 10, y + 26, 28, 22);
        g.fillRect(x + 112, y + 26, 28, 22);
        g.lineStyle(2, 0x2a1005, 1);
        g.strokeRect(x + 10, y + 26, 28, 22);
        g.strokeRect(x + 112, y + 26, 28, 22);

        // Physics body
        const b = this.obstacles.create(x + w / 2, y + h / 2, 'pixel');
        b.setVisible(false); b.setDisplaySize(w, h); b.body.setSize(w, h); b.refreshBody();
    }

    _createShed() {
        const x = 110, y = 860, w = 100, h = 80;
        const g = this.add.graphics().setDepth(3);

        g.fillStyle(0x42280c);
        g.fillRect(x, y, w, h);
        g.lineStyle(1, 0x2e1a08, 0.7);
        for (let yi = y + 12; yi < y + h; yi += 12) g.lineBetween(x, yi, x + w, yi);

        // Roof
        g.fillStyle(0x2a1508);
        g.fillRect(x - 6, y, w + 12, 14);
        g.fillStyle(0x1e1006);
        g.fillTriangle(x - 6, y + 14, x + w / 2, y - 16, x + w + 6, y + 14);

        // Door
        g.fillStyle(0x180c04);
        g.fillRect(x + 34, y + 36, 32, 44);

        const b = this.obstacles.create(x + w / 2, y + h / 2, 'pixel');
        b.setVisible(false); b.setDisplaySize(w, h); b.body.setSize(w, h); b.refreshBody();
    }

    _createTrees() {
        [
            // North border
            [80,78],[240,62],[400,78],[580,68],[740,76],[900,62],[1080,78],[1260,68],[1430,78],
            // NW cluster (around cabin)
            [66,290],[305,162],[66,435],[322,372],
            // West edge
            [55,700],[62,920],[68,1090],
            // South border
            [200,1108],[420,1094],[640,1112],[820,1094],
            // Interior
            [558,292],[695,382],[408,752],[618,818],
            // Beyond fence (unreachable — adds mystery)
            [1155,178],[1362,158],[1472,318],[1478,905]
        ].forEach(([tx, ty]) => this._drawTree(tx, ty));
    }

    _drawTree(tx, ty) {
        const g = this.add.graphics().setDepth(3);

        // Ground shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(tx, ty + 14, 38, 13);

        // Trunk
        g.fillStyle(0x5c3d11);
        g.fillRect(tx - 5, ty - 6, 10, 22);

        // Canopy (3 layers)
        g.fillStyle(0x1a4a1a);
        g.fillCircle(tx, ty - 10, 24);
        g.fillStyle(0x236a23);
        g.fillCircle(tx, ty - 18, 17);
        g.fillStyle(0x2e8b2e);
        g.fillCircle(tx - 3, ty - 24, 11);

        // Physics body (circular, sized to trunk+lower canopy)
        const b = this.obstacles.create(tx, ty, 'pixel');
        b.setVisible(false);
        b.setDisplaySize(32, 32);
        b.body.setSize(32, 32);
        b.refreshBody();
    }

    _createFence() {
        const g = this.add.graphics().setDepth(5);

        // Helper: horizontal fence rail + posts
        const fenceH = (x1, y, x2) => {
            g.fillStyle(0x888888);
            g.fillRect(x1, y - 3, x2 - x1, 7);
            g.fillRect(x1, y + 10, x2 - x1, 5);
            g.fillStyle(0x666666);
            for (let px = x1; px <= x2; px += 55) g.fillRect(px - 4, y - 12, 8, 30);
        };

        // Helper: vertical fence post + cross rails
        const fenceV = (x, y1, y2) => {
            g.fillStyle(0x888888);
            g.fillRect(x - 3, y1, 7, y2 - y1);
            g.fillStyle(0x777777);
            for (let py = y1; py <= y2; py += 48) g.fillRect(x - 13, py, 27, 5);
            g.fillStyle(0x666666);
            for (let py = y1; py <= y2; py += 58) g.fillRect(x - 4, py - 2, 9, 48);
        };

        fenceH(950, 340, 1500);       // top wall
        fenceH(950, 1060, 1500);      // bottom wall
        fenceV(1500, 340, 1060);      // right wall
        fenceV(950, 340, 540);        // left wall — top segment (above gate)
        fenceV(950, 640, 1060);       // left wall — bottom segment (below gate)

        // Gate graphic (chain-link panel + padlock)
        this._gateGfx = this.add.graphics().setDepth(5);
        this._gateGfx.fillStyle(0x999999);
        this._gateGfx.fillRect(943, 540, 7, 100);
        this._gateGfx.lineStyle(1, 0x777777, 1);
        for (let py = 540; py < 640; py += 20) this._gateGfx.lineBetween(943, py, 950, py + 10);
        this._gateGfx.fillStyle(0xddaa00);  // padlock body
        this._gateGfx.fillRect(936, 583, 18, 13);
        this._gateGfx.lineStyle(3, 0xccaa00, 1);  // padlock shackle
        this._gateGfx.beginPath();
        this._gateGfx.arc(945, 583, 7, Math.PI, 0, false);
        this._gateGfx.strokePath();

        // Warning label
        this.add.text(1128, 320, '\u26a0  RESTRICTED AREA  \u26a0', {
            fontSize: '11px', fill: '#ffdd00', fontFamily: 'monospace',
            fontStyle: 'bold', backgroundColor: '#000000bb', padding: { x: 5, y: 3 }
        }).setDepth(6);

        // Physics bodies
        const mkBody = (cx, cy, bw, bh) => {
            const b = this.obstacles.create(cx, cy, 'pixel');
            b.setVisible(false); b.setDisplaySize(bw, bh); b.body.setSize(bw, bh); b.refreshBody();
            return b;
        };
        mkBody(1225, 340,  550, 12);   // top
        mkBody(1225, 1060, 550, 12);   // bottom
        mkBody(1500, 700,  12,  720);  // right
        mkBody(950,  440,  12,  200);  // left top segment (y=340–540)
        mkBody(950,  850,  12,  420);  // left bottom segment (y=640–1060)

        // Gate body — separate reference so _openGate() can destroy just this one
        this._gateBody = this.obstacles.create(950, 590, 'pixel');
        this._gateBody.setVisible(false);
        this._gateBody.setDisplaySize(12, 100);
        this._gateBody.body.setSize(12, 100);
        this._gateBody.refreshBody();
    }

    _createCampfire() {
        const cx = 420, cy = 440;
        const g = this.add.graphics().setDepth(3);

        // Stone ring
        g.fillStyle(0x555555);
        [[0,-15],[11,-10],[15,0],[11,11],[0,15],[-11,11],[-15,0],[-11,-10]].forEach(([ox,oy]) => {
            g.fillCircle(cx + ox, cy + oy, 4);
        });

        // Logs
        g.fillStyle(0x5c3d11);
        g.fillRect(cx - 13, cy + 3, 26, 7);
        g.fillStyle(0x4a3010);
        g.fillRect(cx - 6, cy - 2, 12, 7);

        // Flame (tweened)
        const flame = this.add.graphics().setDepth(4);
        flame.fillStyle(0xdd5511); flame.fillCircle(cx, cy - 8, 11);
        flame.fillStyle(0xff8800); flame.fillCircle(cx - 2, cy - 13, 7);
        flame.fillStyle(0xffee00); flame.fillCircle(cx, cy - 16, 4);

        // Glow (tweened)
        const glow = this.add.graphics().setDepth(2);
        glow.fillStyle(0xff6600, 0.18); glow.fillCircle(cx, cy, 38);

        this.tweens.add({
            targets: flame, yoyo: true, repeat: -1, duration: 320, ease: 'Sine.easeInOut',
            alpha: { from: 0.72, to: 1 }, scaleX: { from: 0.88, to: 1.12 }, scaleY: { from: 0.84, to: 1.08 }
        });
        this.tweens.add({
            targets: glow, yoyo: true, repeat: -1, duration: 480, ease: 'Sine.easeInOut',
            alpha: { from: 0.12, to: 0.38 }
        });
    }

    _createSign() {
        const sx = 820, sy = 510;
        const g = this.add.graphics().setDepth(4);

        g.fillStyle(0x7a5c2a); g.fillRect(sx - 3, sy - 14, 7, 58);
        g.fillStyle(0xf0c040); g.fillRect(sx - 34, sy - 44, 68, 38);
        g.lineStyle(2, 0x8b6914, 1); g.strokeRect(sx - 34, sy - 44, 68, 38);
        g.fillStyle(0xcc2200);
        g.fillTriangle(sx - 8, sy - 40, sx, sy - 18, sx + 8, sy - 40);

        this.add.text(sx - 4, sy - 41, '!', {
            fontSize: '14px', fill: '#fff', fontFamily: 'monospace', fontStyle: 'bold'
        }).setDepth(5);
        this.add.text(sx - 30, sy - 28, 'KEEP\n OUT', {
            fontSize: '10px', fill: '#1a0a00', fontFamily: 'monospace', fontStyle: 'bold'
        }).setDepth(5);
    }

    _createGlowingClue() {
        const cx = 870, cy = 650;

        const outerGlow = this.add.graphics().setDepth(4);
        outerGlow.fillStyle(0x00ffcc, 0.12); outerGlow.fillCircle(cx, cy, 32);

        const body = this.add.graphics().setDepth(5);
        body.fillStyle(0x00eecc, 0.9); body.fillCircle(cx, cy, 9);
        body.fillStyle(0xffffff, 0.6); body.fillCircle(cx - 3, cy - 3, 3);

        // Half-buried look
        const dirt = this.add.graphics().setDepth(6);
        dirt.fillStyle(0x7a5c2a, 0.65); dirt.fillRect(cx - 10, cy + 5, 20, 7);

        const label = this.add.text(cx - 8, cy - 28, '???', {
            fontSize: '9px', fill: '#00ffcc', fontFamily: 'monospace', fontStyle: 'bold'
        }).setDepth(7);

        this.tweens.add({
            targets: body, yoyo: true, repeat: -1, duration: 860, ease: 'Sine.easeInOut',
            scaleX: { from: 0.8, to: 1.2 }, scaleY: { from: 0.8, to: 1.2 }, alpha: { from: 0.68, to: 1 }
        });
        this.tweens.add({
            targets: [outerGlow, label], yoyo: true, repeat: -1, duration: 1100, ease: 'Sine.easeInOut',
            alpha: { from: 0.08, to: 0.55 }
        });
    }

    _createBoltCutters() {
        const bx = 240, by = 960;
        const g = this.add.graphics().setDepth(4);

        // Handles (red grips)
        g.lineStyle(4, 0xcc2222, 1);
        g.lineBetween(bx - 5, by - 18, bx - 7, by + 14);
        g.lineBetween(bx + 5, by - 18, bx + 7, by + 14);

        // Jaws (grey metal)
        g.lineStyle(5, 0x888888, 1);
        g.lineBetween(bx - 7, by + 13, bx, by + 3);
        g.lineBetween(bx + 7, by + 13, bx, by + 3);

        // Pivot
        g.fillStyle(0x666666); g.fillCircle(bx, by + 3, 5);

        this._boltCuttersGfx = g;
    }

    _createControlPanel() {
        const px = 1200, py = 580;
        const g = this.add.graphics().setDepth(4);

        // Panel body
        g.fillStyle(0x14142a); g.fillRect(px - 36, py - 52, 72, 104);
        g.lineStyle(2, 0x4af7c4, 1); g.strokeRect(px - 36, py - 52, 72, 104);

        // Screen
        g.fillStyle(0x080f08); g.fillRect(px - 28, py - 44, 56, 42);

        // Green terminal lines on screen
        g.fillStyle(0x00cc44, 0.55);
        [[0],[10],[20],[30]].forEach(([i]) => g.fillRect(px - 25, py - 40 + i, 48 - i * 3, 4));

        // Buttons
        g.fillStyle(0x334455);
        [-18, -4, 10].forEach(ox => g.fillRect(px + ox, py + 16, 10, 8));

        // Status light (tweened)
        const light = this.add.graphics().setDepth(5);
        light.fillStyle(0xff2222); light.fillCircle(px + 28, py + 36, 4);
        this.tweens.add({
            targets: light, yoyo: true, repeat: -1, duration: 720, ease: 'Sine.easeInOut',
            alpha: { from: 1, to: 0.1 }
        });

        // Outer glow
        const panelGlow = this.add.graphics().setDepth(2);
        panelGlow.fillStyle(0x4af7c4, 0.06); panelGlow.fillCircle(px, py, 65);
        this.tweens.add({
            targets: panelGlow, yoyo: true, repeat: -1, duration: 2200, ease: 'Sine.easeInOut',
            alpha: { from: 0.4, to: 1 }
        });

        this.add.text(px - 24, py + 46, 'TERMINAL', {
            fontSize: '8px', fill: '#4af7c4', fontFamily: 'monospace'
        }).setDepth(5);
    }
}
