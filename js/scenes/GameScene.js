// ============================================================
// GameScene.js
// The main (and only) game scene.
// Handles: map creation, player movement, collisions,
// interactions, dialogue, quest progression, and all visuals.
// ============================================================

class GameScene extends Phaser.Scene {

    constructor() {
        super({ key: 'GameScene' });
    }

    // ----------------------------------------------------------
    // CREATE — runs once when the scene starts
    // ----------------------------------------------------------
    create() {
        // World is larger than the screen so there's space to explore
        const WORLD_W = 1600;
        const WORLD_H = 1200;

        this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

        // --- Draw the ground and decorations ---
        this._createGround(WORLD_W, WORLD_H);

        // --- Static physics group — everything the player bumps into ---
        this.obstacles = this.physics.add.staticGroup();

        // --- Build all map objects ---
        this._createCabin();
        this._createTrees();
        this._createFence();

        // --- Create the player ---
        this._createPlayer();

        // --- Camera follows the player smoothly ---
        this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

        // Player collides with all obstacles
        this.physics.add.collider(this.player, this.obstacles);

        // --- UI (drawn on top, fixed to camera) ---
        this.dialogue = new DialogueBox(this);
        this.quest    = new QuestTracker(this);

        // --- Decorative objects (no collision, just interaction) ---
        this._createCampfire();
        this._createSign();
        this._createGlowingClue();

        // --- Interactables list ---
        // Each entry: { x, y, range, speaker, text, questEffect }
        this.interactables = [
            {
                id: 'campfire',
                x: 500, y: 520,
                range: 70,
                speaker: '',
                text: '...The fire crackles softly. Ash still warm. Someone was here not long ago.',
                questEffect: null
            },
            {
                id: 'sign',
                x: 910, y: 490,
                range: 70,
                speaker: 'SIGN',
                text: 'RESTRICTED AREA. No trespassing. Violators will be reported to facility security.',
                questEffect: null
            },
            {
                id: 'cabin',
                x: 180, y: 170,
                range: 70,
                speaker: '',
                text: 'The cabin door is locked. A rusted padlock hangs from the handle. Nobody answers.',
                questEffect: null
            },
            {
                id: 'clue',
                x: 1050, y: 760,
                range: 80,
                speaker: '???',
                text: 'A metallic cylinder, half-buried in the dirt. It hums faintly and glows a cold cyan. This definitely shouldn\'t be out here.',
                questEffect: QUEST_STATES.FIND_WAY_IN
            }
        ];

        // --- Input ---
        this._setupInput();

        // --- Interaction hint text (fixed to camera) ---
        this.hintText = this.add.text(240, 198, 'Press [A] to interact', {
            fontSize: '10px',
            fill: '#ffffff',
            fontFamily: 'monospace',
            backgroundColor: '#00000088',
            padding: { x: 6, y: 3 }
        }).setScrollFactor(0).setDepth(95).setVisible(false);

        // Track whether we've already triggered the "approach fence" quest step
        this._fenceQuestTriggered = false;

        // Track A-button state to avoid repeat triggers on hold
        this._actionWasPressed = false;
    }

    // ----------------------------------------------------------
    // UPDATE — runs every frame
    // ----------------------------------------------------------
    update() {
        // While dialogue is open: freeze the player, handle dismiss
        if (this.dialogue.isVisible()) {
            this.player.setVelocity(0, 0);
            this._handleActionPress(() => {
                this.dialogue.tryDismiss();
            });
            return;
        }

        // --- Movement ---
        const speed = 160;
        const goUp    = this.cursors.up.isDown    || this.wasd.up.isDown    || window.virtualKeys.up;
        const goDown  = this.cursors.down.isDown  || this.wasd.down.isDown  || window.virtualKeys.down;
        const goLeft  = this.cursors.left.isDown  || this.wasd.left.isDown  || window.virtualKeys.left;
        const goRight = this.cursors.right.isDown || this.wasd.right.isDown || window.virtualKeys.right;

        let vx = 0;
        let vy = 0;
        if (goLeft)  vx = -speed;
        if (goRight) vx =  speed;
        if (goUp)    vy = -speed;
        if (goDown)  vy =  speed;

        // Normalise diagonal speed
        if (vx !== 0 && vy !== 0) {
            vx *= 0.707;
            vy *= 0.707;
        }

        this.player.setVelocity(vx, vy);

        // --- Interaction hint ---
        const nearest = this._nearestInteractable();
        this.hintText.setVisible(nearest !== null);

        // --- E / A key: open interaction ---
        this._handleActionPress(() => {
            if (nearest) {
                this._triggerInteraction(nearest);
            }
        });

        // --- Quest trigger: player approaches the restricted fence area ---
        if (!this._fenceQuestTriggered && this.quest.is('EXPLORE')) {
            if (this.player.x > 870) {
                this._fenceQuestTriggered = true;
                this.quest.advance(QUEST_STATES.FOUND_CLUE);
            }
        }
    }

    // ----------------------------------------------------------
    // PRIVATE HELPERS
    // ----------------------------------------------------------

    // Handles "press once" action — works for both keyboard and virtual button
    _handleActionPress(callback) {
        const actionDown = this.eKey.isDown || window.virtualKeys.action;

        if (actionDown && !this._actionWasPressed) {
            this._actionWasPressed = true;
            callback();
        }
        if (!actionDown) {
            this._actionWasPressed = false;
        }
    }

    // Find the closest interactable within its interaction range
    _nearestInteractable() {
        let best     = null;
        let bestDist = Infinity;
        const px = this.player.x;
        const py = this.player.y;

        for (const obj of this.interactables) {
            const dist = Phaser.Math.Distance.Between(px, py, obj.x, obj.y);
            if (dist <= obj.range && dist < bestDist) {
                bestDist = dist;
                best     = obj;
            }
        }
        return best;
    }

    // Open dialogue for an interactable, then handle quest effect on dismiss
    _triggerInteraction(obj) {
        this.dialogue.show(obj.speaker, obj.text, () => {
            if (obj.questEffect !== null) {
                this.quest.advance(obj.questEffect);
            }
        });
    }

    // --- Input setup ---
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

    // --- Ground and path ---
    _createGround(w, h) {
        const g = this.add.graphics();

        // Base grass
        g.fillStyle(0x2d5a27);
        g.fillRect(0, 0, w, h);

        // Darker grass patches for texture
        const patches = [
            [80, 300, 140, 90], [400, 100, 180, 80], [700, 200, 120, 100],
            [1100, 150, 160, 90], [1300, 400, 140, 110], [200, 800, 160, 80],
            [600, 900, 130, 100], [1000, 950, 150, 90], [350, 400, 100, 70],
            [800, 700, 120, 80], [1400, 800, 130, 100]
        ];
        g.fillStyle(0x234d1e);
        for (const [px, py, pw, ph] of patches) {
            g.fillRect(px, py, pw, ph);
        }

        // Dirt path — horizontal main road
        g.fillStyle(0x7a5c2a);
        g.fillRect(200, 575, 800, 50);   // horizontal path
        g.fillRect(560, 400, 50, 230);   // vertical spur up to campfire area

        // Dock/boardwalk feeling near the bottom edge (just decorative strips)
        g.fillStyle(0x5c4020);
        g.fillRect(0, 1160, w, 40);
    }

    // --- Player sprite (colored rectangles, no image needed) ---
    _createPlayer() {
        // Draw onto a RenderTexture so Phaser physics can use it
        const rt = this.add.renderTexture(0, 0, 16, 26);

        const g = this.make.graphics({ x: 0, y: 0, add: false });
        // Body: blue
        g.fillStyle(0x4488ff);
        g.fillRect(0, 8, 16, 18);
        // Hat: darker blue
        g.fillStyle(0x224499);
        g.fillRect(3, 0, 10, 10);
        // Eyes: white dots
        g.fillStyle(0xffffff);
        g.fillRect(3, 11, 3, 3);
        g.fillRect(10, 11, 3, 3);

        rt.draw(g, 0, 0);
        rt.saveTexture('player_tex');
        g.destroy();
        rt.destroy();

        // Physics sprite using that texture
        this.player = this.physics.add.sprite(400, 600, 'player_tex');
        this.player.setCollideWorldBounds(true);
        this.player.setDepth(10);
    }

    // --- Cabin ---
    _createCabin() {
        const x = 100, y = 80, w = 160, h = 120;

        const g = this.add.graphics();

        // Walls
        g.fillStyle(0x8b4513);
        g.fillRect(x, y, w, h);

        // Roof (triangle-ish with two filled rects)
        g.fillStyle(0x5c2d0e);
        g.fillRect(x - 10, y, w + 20, 20);  // overhang
        g.fillStyle(0x4a2409);
        g.fillTriangle(
            x - 10, y + 20,
            x + w / 2, y - 20,
            x + w + 10, y + 20
        );

        // Door
        g.fillStyle(0x2a1505);
        g.fillRect(x + 60, y + 70, 40, 50);

        // Window
        g.fillStyle(0x88aacc);
        g.fillRect(x + 15, y + 40, 30, 25);
        g.lineStyle(2, 0x2a1505);
        g.strokeRect(x + 15, y + 40, 30, 25);

        // Add collision body (invisible rectangle)
        const body = this.obstacles.create(x + w / 2, y + h / 2, null);
        body.setVisible(false);
        body.body.setSize(w, h);
        body.refreshBody();
    }

    // --- Trees (12 trees at varied positions) ---
    _createTrees() {
        const positions = [
            [150, 350], [250, 220], [80, 500], [350, 150],
            [600, 300], [750, 120], [450, 780], [650, 850],
            [1200, 300], [1350, 200], [1450, 500], [1100, 900],
            [300, 950], [800, 400]
        ];

        for (const [tx, ty] of positions) {
            this._drawTree(tx, ty);
        }
    }

    _drawTree(tx, ty) {
        const g = this.add.graphics();

        // Trunk
        g.fillStyle(0x5c3d11);
        g.fillRect(tx - 5, ty - 5, 10, 20);

        // Canopy layers (darker bottom, lighter top for depth)
        g.fillStyle(0x1a4a1a);
        g.fillCircle(tx, ty - 10, 22);
        g.fillStyle(0x226622);
        g.fillCircle(tx, ty - 18, 16);
        g.fillStyle(0x2e8b2e);
        g.fillCircle(tx, ty - 24, 10);

        // Collision circle body
        const body = this.obstacles.create(tx, ty, null);
        body.setVisible(false);
        body.body.setCircle(18, -18, -18);
        body.refreshBody();
    }

    // --- Fence around the restricted zone ---
    _createFence() {
        // Fence bounds: top y=700, x from 950 to 1500, bottom y=1100
        // Four segments: top, bottom, left side, right side

        const segments = [
            // x, y, width, height
            { x: 1225, y: 703,  w: 550, h: 12 },  // top rail
            { x: 1225, y: 1097, w: 550, h: 12 },  // bottom rail
            { x: 953,  y: 900,  w: 12,  h: 400 }, // left side
            { x: 1497, y: 900,  w: 12,  h: 400 }, // right side
        ];

        const g = this.add.graphics();

        for (const seg of segments) {
            // Draw fence visuals
            g.fillStyle(0x999999);
            g.fillRect(seg.x - seg.w / 2, seg.y - seg.h / 2, seg.w, seg.h);

            // Add fence posts at intervals
            if (seg.w > seg.h) {
                // Horizontal — add vertical posts
                for (let px = seg.x - seg.w / 2; px <= seg.x + seg.w / 2; px += 60) {
                    g.fillStyle(0x777777);
                    g.fillRect(px - 4, seg.y - 20, 8, 40);
                }
            } else {
                // Vertical — add horizontal rails
                for (let py = seg.y - seg.h / 2; py <= seg.y + seg.h / 2; py += 50) {
                    g.fillStyle(0x888888);
                    g.fillRect(seg.x - 15, py - 4, 30, 8);
                }
            }

            // Physics body for each fence segment
            const body = this.obstacles.create(seg.x, seg.y, null);
            body.setVisible(false);
            body.body.setSize(seg.w, seg.h);
            body.refreshBody();
        }

        // Warning "DANGER" text on the fence
        this.add.text(1180, 680, '⚠ RESTRICTED ⚠', {
            fontSize: '12px',
            fill: '#ffdd00',
            fontFamily: 'monospace',
            fontStyle: 'bold',
            backgroundColor: '#00000099',
            padding: { x: 4, y: 2 }
        }).setDepth(5);
    }

    // --- Campfire (flickering orange glow) ---
    _createCampfire() {
        const cx = 500, cy = 520;

        // Logs
        const g = this.add.graphics();
        g.fillStyle(0x5c3d11);
        g.fillRect(cx - 16, cy + 2, 32, 8);
        g.fillRect(cx - 8, cy - 2, 16, 8);

        // Flame (a small circle we'll tween)
        const flame = this.add.graphics();
        flame.fillStyle(0xe8621a);
        flame.fillCircle(cx, cy - 4, 12);
        flame.fillStyle(0xffdd00);
        flame.fillCircle(cx, cy - 6, 6);

        // Glow ring
        const glow = this.add.graphics();
        glow.fillStyle(0xe8621a, 0.2);
        glow.fillCircle(cx, cy, 30);

        // Flicker tween on alpha
        this.tweens.add({
            targets: flame,
            alpha: { from: 0.75, to: 1 },
            scaleX: { from: 0.9, to: 1.1 },
            scaleY: { from: 0.85, to: 1.05 },
            yoyo: true,
            repeat: -1,
            duration: 350,
            ease: 'Sine.easeInOut'
        });
        this.tweens.add({
            targets: glow,
            alpha: { from: 0.15, to: 0.45 },
            yoyo: true,
            repeat: -1,
            duration: 500,
            ease: 'Sine.easeInOut'
        });

        // "Campfire" label
        this.add.text(cx - 22, cy - 30, 'campfire', {
            fontSize: '9px',
            fill: '#ff9944',
            fontFamily: 'monospace'
        }).setDepth(5);
    }

    // --- Warning sign ---
    _createSign() {
        const sx = 910, sy = 490;
        const g  = this.add.graphics();

        // Post
        g.fillStyle(0x7a5c2a);
        g.fillRect(sx - 4, sy - 10, 8, 50);

        // Sign board
        g.fillStyle(0xf0c040);
        g.fillRect(sx - 30, sy - 40, 60, 36);
        g.lineStyle(2, 0x8b6914);
        g.strokeRect(sx - 30, sy - 40, 60, 36);

        // Text on sign
        this.add.text(sx - 25, sy - 36, '! KEEP\n  OUT', {
            fontSize: '11px',
            fill: '#1a0a00',
            fontFamily: 'monospace',
            fontStyle: 'bold'
        }).setDepth(5);
    }

    // --- Glowing clue (pulsing cyan object near the fence) ---
    _createGlowingClue() {
        const cx = 1050, cy = 760;

        // Outer glow
        const outerGlow = this.add.graphics();
        outerGlow.fillStyle(0x00ffcc, 0.15);
        outerGlow.fillCircle(cx, cy, 28);

        // Inner body
        const body = this.add.graphics();
        body.fillStyle(0x00ffcc, 0.9);
        body.fillCircle(cx, cy, 10);
        body.fillStyle(0xffffff, 0.7);
        body.fillCircle(cx - 3, cy - 3, 4);  // specular highlight

        // Pulsing scale tween
        this.tweens.add({
            targets: body,
            scaleX: { from: 0.85, to: 1.2 },
            scaleY: { from: 0.85, to: 1.2 },
            alpha: { from: 0.75, to: 1 },
            yoyo: true,
            repeat: -1,
            duration: 800,
            ease: 'Sine.easeInOut'
        });
        this.tweens.add({
            targets: outerGlow,
            alpha: { from: 0.1, to: 0.35 },
            scaleX: { from: 0.9, to: 1.3 },
            scaleY: { from: 0.9, to: 1.3 },
            yoyo: true,
            repeat: -1,
            duration: 1000,
            ease: 'Sine.easeInOut'
        });

        // Small "???" label above it
        this.add.text(cx - 8, cy - 28, '???', {
            fontSize: '10px',
            fill: '#00ffcc',
            fontFamily: 'monospace',
            fontStyle: 'bold'
        }).setDepth(5);
    }
}
