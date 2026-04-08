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
        this._walkFrame        = 0;
        this._walkTimer        = 0;
        this._endingPlayed     = false;
        this._artifactCounts   = { arrowheads: 0, pottery: 0, tools: 0 };

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

        this._createLakeShore();
        this._createDad();
        this._createSpecialStick();
        this._createIceCreamShack();
        this._createBulletinBoard();
        this._createFranksCamp();
        this._createCounselor();
        this._createGoofyKid();
        this._createCampfire();
        this._createTent();
        this._createSign();
        this._createGlowingClue();
        this._createBoltCutters();
        this._createPicnicTable();
        this._createControlPanel();

        this._buildInteractables();
        this._createArtifacts();   // must be after _buildInteractables so this.interactables exists
        this._createCaveEntrance();
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

        // Walk animation
        if (vx !== 0 || vy !== 0) {
            this._walkTimer -= 16;
            if (this._walkTimer <= 0) {
                this._walkTimer = 180;
                this._walkFrame = this._walkFrame === 0 ? 1 : 0;
            }
            // Facing up with no horizontal: show back-of-head frame
            const tex = (vy < 0 && vx === 0)
                ? 'player_back'
                : (this._walkFrame === 0 ? 'player_walkA' : 'player_walkB');
            this.player.setTexture(tex);
            if (vx < 0) this.player.setFlipX(true);
            else if (vx > 0) this.player.setFlipX(false);
        } else {
            this.player.setTexture('player_idle');
            this._walkFrame = 0;
            this._walkTimer = 0;
        }

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
        this._checkEndingInput();
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
                id: 'bolt_cutters', x: 240, y: 960, range: 80, hintLabel: 'Take',
                getSpeaker: () => '',
                getText: () => 'Heavy bolt cutters leaning against the shed wall. Red grips, rusted jaw. These could cut a padlock.',
                onInteract: (s) => {
                    s.collected.add('bolt_cutters');
                    if (s._boltCuttersGfx)    s._boltCuttersGfx.setVisible(false);
                    if (s._boltCuttersGlow)   s._boltCuttersGlow.setVisible(false);
                    if (s._boltCuttersMarker) s._boltCuttersMarker.setVisible(false);
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
            // ---- Dad + walking stick quest ----
            {
                id: 'dad', x: 515, y: 548, range: 70, hintLabel: 'Talk to Dad',
                speaker: 'DAD',
                getText: (s) => {
                    if (s.collected.has('walking_stick'))
                        return 'Treat that stick well.\nYour grandfather had one just like it.\nGood wood remembers the hands that hold it.';
                    if (s.collected.has('stick_raw'))
                        return 'Hey — let me see that one.\n...\nYeah. That\'s a good piece of wood, right there.\nGive me a few minutes.';
                    return 'Hey explorer! Nice evening huh?\nListen — could you grab me some sticks for the fire?\nGood ones. Wander toward the north trail if you need to.';
                },
                onInteract: (s) => {
                    if (s.collected.has('stick_raw') && !s.collected.has('walking_stick')) {
                        // Dad carves the stick on the spot
                        s.time.delayedCall(400, () => {
                            s.dialogue.show('DAD',
                                '*takes out his knife and works quietly for a moment*\n\n...\n\nHere.\nI carved your name into it. Every explorer needs a good walking stick.',
                                () => {
                                    s.collected.delete('stick_raw');
                                    s.collected.add('walking_stick');
                                    if (s._stickRawGfx) s._stickRawGfx.setVisible(false);
                                    s._showWalkingStickHUD();
                                }
                            );
                        });
                    }
                }
            },
            {
                id: 'special_stick', x: 388, y: 248, range: 60, hintLabel: 'Pick up',
                speaker: '',
                getText: (s) => s.collected.has('stick_raw') || s.collected.has('walking_stick')
                    ? '(You already have the good stick.)'
                    : 'A gnarled branch half-buried in the moss.\nHeavier than it looks. The grain twists in a spiral.\nThere\'s something right about it.',
                onInteract: (s) => {
                    if (!s.collected.has('stick_raw') && !s.collected.has('walking_stick')) {
                        s.collected.add('stick_raw');
                        s.interactables.find(o => o.id === 'special_stick').disabled = true;
                        if (s._stickMarker) s._stickMarker.setVisible(false);
                        s.dialogue.show('', 'You picked up the stick.\n\nMaybe Dad would know what to do with it.');
                    }
                }
            },
            // ---- NPCs & world objects ----
            {
                id: 'bulletin_board', x: 490, y: 415, range: 70, hintLabel: 'Read board',
                speaker: 'BULLETIN BOARD',
                text: 'PINEBROOK CAMPGROUND — WELCOME!\n\nSite Map posted at the entrance.\nReport wildlife sightings to the ranger cabin.\n\n[handwritten sticky note]\n"Has anyone seen my bolt cutters?\nLeft them leaning by the shed. — SITE 4"'
            },
            {
                id: 'counselor', x: 420, y: 380, range: 65, hintLabel: 'Talk',
                speaker: 'COUNSELOR DANA',
                getText: (s) => s.quest.atLeast('INSIDE')
                    ? 'I don\'t know how you got in there. Please stay safe — that fence is posted for a reason.'
                    : s.quest.atLeast('NEED_TOOL')
                    ? 'You\'re looking for something to cut a lock? Try the maintenance shed — site 4 camper was griping about missing cutters just yesterday.'
                    : 'Welcome to Pinebrook! Explore, have fun, but stay out of the restricted zone past the east fence. Seriously.'
            },
            {
                id: 'goofy_kid', x: 560, y: 535, range: 60, hintLabel: 'Talk',
                speaker: 'KID',
                getText: (s) => s.quest.atLeast('DISCOVERED_CLUE')
                    ? 'See? Told you something was out there! You should find a way past that fence...'
                    : 'Dude. Last night, around 2am, I saw this green glow by the east fence.\nMy parents said I was dreaming. I wasn\'t dreaming.'
            },
            {
                id: 'fisherman', x: 490, y: 1110, range: 75, hintLabel: 'Talk',
                speaker: 'OLD PETE',
                getText: (s) => s.quest.atLeast('INSIDE')
                    ? 'You found something in there, didn\'t you. I can see it in your face.\nSame look I had in \'89.'
                    : 'Been fishin\' this lake forty years. Used to be you could eat what you caught.\n...Not anymore.'
            },
            {
                id: 'ice_cream', x: 350, y: 345, range: 65, hintLabel: 'Order',
                speaker: 'MRS. DOTTIE',
                getText: (s) => s.collected.has('bolt_cutters')
                    ? 'Back again? You look like you\'ve been busy. The Fudge Avalanche is on me. You\'ve earned it!'
                    : 'What\'ll it be, sweetheart? We\'ve got Fudge Avalanche, Maple Melt, Campfire Crunch... and the Sasquatch Surprise — though I can\'t promise what\'s in it.'
            },
            {
                id: 'frank_campfire', x: 668, y: 795, range: 80, hintLabel: 'Approach fire',
                speaker: 'OLD FRANK',
                getText: (s) => {
                    const n = s._artifactCounts.arrowheads + s._artifactCounts.pottery + s._artifactCounts.tools;
                    if (n === 0 && !s.quest.atLeast('DISCOVERED_CLUE'))
                        return 'Heh. Thought I heard new footsteps.\nNot many people find this spot.\nName\'s Frank. Sit a spell.\n\n...Bring me pieces of the past if you find them.\nArrowheads, pottery, old tools. I\'ll make it worth your while.';
                    if (n === 0)
                        return 'You found something out there, didn\'t you. Good.\nThe land\'s been talking for years — most people don\'t listen.\nFind me some artifacts while you\'re exploring. I\'ll trade.';
                    if (n >= 10 && !s.collected.has('frank_lore_3'))
                        return `${n} pieces. You\'ve been listening.\nSit down. There\'s something I need to tell you about the cave.`;
                    if (n >= 6 && !s.collected.has('frank_lore_2'))
                        return `Six pieces. That\'s not luck — that\'s respect for the land.\nHere\'s something worth knowing: "Project Emberlight."\nWrite that down.`;
                    if (n >= 3 && !s.collected.has('frank_lore_1'))
                        return `Three pieces already. Good eye.\nAlright — I\'ll tell you about the cave to the west. You\'ve earned it.`;
                    return `You\'ve found ${n} piece${n > 1 ? 's' : ''} so far.\nKeep looking — the land gives up its secrets slowly.\nThree pieces earns you my first story.`;
                },
                onInteract: (s) => {
                    const n = s._artifactCounts.arrowheads + s._artifactCounts.pottery + s._artifactCounts.tools;
                    if (n >= 3 && !s.collected.has('frank_lore_1')) {
                        s.collected.add('frank_lore_1');
                        s.time.delayedCall(200, () => s.dialogue.show('OLD FRANK',
                            'The cave entrance — west side of the park, just past the old trail.\nThe research team used those tunnels to access the site underground.\nI mapped them myself, back in \'78.\n\nSomething stopped them from going all the way down.\nThey never told me what.'));
                    } else if (n >= 6 && !s.collected.has('frank_lore_2')) {
                        s.collected.add('frank_lore_2');
                        s.time.delayedCall(200, () => s.dialogue.show('OLD FRANK',
                            '"Project Emberlight."\nThat\'s what they called it. Energy research, officially.\nBut the emissions... the readings they were getting...\nThat wasn\'t standard physics.\n\nI walked away. Should\'ve spoken up instead.'));
                    } else if (n >= 10 && !s.collected.has('frank_lore_3')) {
                        s.collected.add('frank_lore_3');
                        s.time.delayedCall(200, () => s.dialogue.show('OLD FRANK',
                            'There\'s a lower chamber in that cave.\nSealed from the inside.\nI have a feeling you already know what\'s down there.\n\n*slides something across the log*\n\nThat\'s the original survey map. Don\'t lose it.'));
                    }
                }
            },
            {
                id: 'control_panel', x: 1200, y: 580, range: 70, hintLabel: 'Access terminal',
                speaker: 'TERMINAL',
                getText: (s) => s._endingPlayed
                    ? '[SIGNAL LOST]\n[SIGNAL LOST]\n[SIGNAL LOST]'
                    : 'PINEBROOK NUCLEAR RESERVE\nFACILITY LOG — SECTOR 7\n\nBreach: coolant line fracture\nDay 14 — Status: UNRESOLVED\n[Press again to continue...]',
                onInteract: (s) => { if (!s._endingPlayed) s._triggerEnding(); }
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

    // Draw one player animation frame into a named texture.
    // legLX/legRX: x offset of left/right leg (controls stride spread).
    // showFace: false for the back-facing (walking up) frame.
    _makePlayerFrame(key, legLX, legRX, showFace) {
        const rt = this.add.renderTexture(0, 0, 18, 30);
        const g  = this.make.graphics({ x: 0, y: 0, add: false });

        // Shoes
        g.fillStyle(0x2a1a0a);
        g.fillRect(legLX, 27, 6, 3); g.fillRect(legRX, 27, 6, 3);

        // Legs — jeans blue
        g.fillStyle(0x2244aa);
        g.fillRect(legLX, 20, 5, 8); g.fillRect(legRX, 20, 5, 8);
        g.fillStyle(0x3355cc, 0.5);
        g.fillRect(legLX + 1, 21, 2, 6); g.fillRect(legRX + 1, 21, 2, 6);

        // Body — red jacket
        g.fillStyle(0xbb2222); g.fillRect(2, 10, 14, 11);
        g.fillStyle(0xdd3333); g.fillRect(3, 10, 5, 4);

        // Backpack
        g.fillStyle(0x8b5e20); g.fillRect(13, 11, 5, 10);
        g.fillStyle(0x7a5010); g.fillRect(14, 12, 3, 8);

        // Arms
        g.fillStyle(0xbb2222);
        g.fillRect(0, 11, 3, 7); g.fillRect(15, 11, 3, 7);

        // Neck
        g.fillStyle(0xe8c090); g.fillRect(7, 7, 4, 4);

        // Head
        g.fillStyle(0xe8c090); g.fillRect(3, 1, 12, 9);

        // Hair
        g.fillStyle(0x6b3318);
        g.fillRect(3, 0, 12, 4);
        g.fillRect(3, 4, 2, 3); g.fillRect(13, 4, 2, 3);

        if (showFace) {
            // Eyes
            g.fillStyle(0x1a1a1a);
            g.fillRect(5, 5, 2, 2); g.fillRect(11, 5, 2, 2);
            // Mouth
            g.fillStyle(0xb06040); g.fillRect(7, 8, 4, 1);
        } else {
            // Back of head — just hair, no face
            g.fillStyle(0x6b3318); g.fillRect(3, 1, 12, 8);
        }

        rt.draw(g, 0, 0);
        rt.saveTexture(key);
        g.destroy(); rt.destroy();
    }

    _createPlayer() {
        // idle: legs level
        this._makePlayerFrame('player_idle',  2, 10, true);
        // walkA: left leg forward (wider left), right leg back (closer center)
        this._makePlayerFrame('player_walkA', 0, 11, true);
        // walkB: right leg forward (wider right), left leg back (closer center)
        this._makePlayerFrame('player_walkB', 3,  9, true);
        // back: facing up — hair covers face
        this._makePlayerFrame('player_back',  2, 10, false);

        this.player = this.physics.add.sprite(280, 580, 'player_idle');
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

        // Glow indicator (bright collectible highlight so player can spot it)
        this._boltCuttersGlow = this.add.graphics().setDepth(3);
        this._boltCuttersGlow.fillStyle(0xffee55, 0.35);
        this._boltCuttersGlow.fillCircle(bx, by, 32);
        this.tweens.add({
            targets: this._boltCuttersGlow,
            alpha: { from: 0.5, to: 1 }, yoyo: true, repeat: -1, duration: 600
        });

        // Floating "!" pickup marker
        this._boltCuttersMarker = this.add.text(bx, by - 38, '!', {
            fontSize: '18px', fill: '#ffee55', fontFamily: 'monospace', fontStyle: 'bold'
        }).setDepth(6).setOrigin(0.5);
        this.tweens.add({
            targets: this._boltCuttersMarker,
            y: by - 44, yoyo: true, repeat: -1, duration: 500, ease: 'Sine.easeInOut'
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

    // ----------------------------------------------------------
    // ENDING SEQUENCE
    // ----------------------------------------------------------

    _triggerEnding() {
        this._endingPlayed = true;

        const seq = [
            ['TERMINAL', 'PINEBROOK NUCLEAR RESERVE\nFACILITY LOG — SECTOR 7\n\nCoolant line fracture — Reactor 7\nLeak duration: 14+ days\nContainment status: FAILED'],
            ['TERMINAL', 'Personnel log:\n  23 evacuated  /  21 accounted for\n\n  MARCUS COLE  [NR-4471] — UNKNOWN\n  R. DARNELL   [NR-3382] — EVACUATED'],
            ['TERMINAL', '[WARNING] Radiation level: CRITICAL\n[WARNING] Do not enter Sector 7\n\nAll remaining personnel:\nEVACUATE IMMEDIATELY'],
            ['NOTE', '"Marcus — if you\'re reading this,\nI couldn\'t wait any longer.\nI left the truck at site 4.\nPlease just go home.  — R.D."'],
            ['', 'The terminal flickers. Somewhere behind you,\nthe fire is still burning at Marcus\'s camp.\n\nNobody has come back for it.'],
        ];

        let i = 0;
        const showNext = () => {
            if (i >= seq.length) { this._showEnding(); return; }
            const [spk, txt] = seq[i++];
            this.dialogue.show(spk, txt, showNext);
        };
        showNext();
    }

    _showEnding() {
        // Stop player movement
        this.player.setVelocity(0, 0);

        // Fade to black over 2.5 seconds
        this.cameras.main.fade(2500, 0, 0, 0);

        this.time.delayedCall(2700, () => {
            // Black overlay to keep screen dark
            const overlay = this.add.graphics().setScrollFactor(0).setDepth(500);
            overlay.fillStyle(0x000000, 1);
            overlay.fillRect(0, 0, 480, 320);

            const cx = 240, style = (sz, col) => ({
                fontSize: sz + 'px', fill: col, fontFamily: 'monospace',
                align: 'center'
            });

            // Facility header (green, monospace terminal feel)
            this.add.text(cx, 60, 'PINEBROOK NUCLEAR RESERVE', style(9, '#00cc44'))
                .setScrollFactor(0).setDepth(501).setOrigin(0.5).setAlpha(0);
            this.add.text(cx, 76, 'SECTOR 7  —  COOLANT BREACH', style(8, '#008833'))
                .setScrollFactor(0).setDepth(501).setOrigin(0.5).setAlpha(0);

            // Status line
            this.add.text(cx, 108, 'STATUS: UNRESOLVED', style(10, '#ff4444'))
                .setScrollFactor(0).setDepth(501).setOrigin(0.5).setAlpha(0);

            // Story beat
            const storyLines = [
                'Marcus Cole was never found.',
                'R. Darnell reported the breach three days later.',
                'The campfire burned out on its own.',
            ];
            storyLines.forEach((line, i) => {
                this.add.text(cx, 148 + i * 18, line, style(8, '#aaaaaa'))
                    .setScrollFactor(0).setDepth(501).setOrigin(0.5).setAlpha(0);
            });

            // Title card
            this.add.text(cx, 240, 'CAMPING PARK MYSTERY', style(13, '#ffffff'))
                .setScrollFactor(0).setDepth(501).setOrigin(0.5).setAlpha(0);
            this.add.text(cx, 260, 'THE END', style(9, '#888888'))
                .setScrollFactor(0).setDepth(501).setOrigin(0.5).setAlpha(0);

            // Restart prompt
            const restartPrompt = this.add.text(cx, 294, '[ A ] Play again', style(8, '#555555'))
                .setScrollFactor(0).setDepth(501).setOrigin(0.5).setAlpha(0);

            // Fade all text in sequentially
            const allTexts = this.children.list
                .filter(o => o.depth === 501 && o.alpha === 0);
            allTexts.forEach((t, i) => {
                this.tweens.add({
                    targets: t, alpha: 1,
                    delay: 400 + i * 300, duration: 600, ease: 'Sine.easeIn'
                });
            });

            // Blink restart prompt after 3s
            this.time.delayedCall(3200, () => {
                this.tweens.add({
                    targets: restartPrompt, alpha: { from: 1, to: 0.2 },
                    yoyo: true, repeat: -1, duration: 700
                });
                // Listen for restart
                this._actionWasPressed = false;
                this._endingListening = true;
            });
        });
    }

    // Override update to handle ending restart
    _checkEndingInput() {
        if (!this._endingListening) return;
        const down = (this.eKey && this.eKey.isDown) || window.virtualKeys.action;
        if (down && !this._actionWasPressed) {
            this._actionWasPressed = true;
            this._endingListening  = false;
            this.cameras.main.fadeIn(800, 0, 0, 0);
            this.time.delayedCall(900, () => this.scene.start('TitleScene'));
        }
        if (!down) this._actionWasPressed = false;
    }
}

    // ---- NEW MAP SECTIONS ----------------------------------------

    _createIceCreamShack() {
        const sx = 310, sy = 290;
        const g = this.add.graphics().setDepth(4);

        // Shadow
        g.fillStyle(0x000000, 0.15); g.fillRect(sx+6, sy+72, 90, 10);

        // Main body — bright white/cream
        g.fillStyle(0xfff8ee); g.fillRect(sx, sy, 90, 65);
        g.lineStyle(2, 0xddccaa); g.strokeRect(sx, sy, 90, 65);

        // Roof — candy-stripe awning (pink + white alternating)
        for (let i = 0; i < 6; i++) {
            g.fillStyle(i % 2 === 0 ? 0xff88aa : 0xffffff);
            g.fillRect(sx + i * 15, sy - 14, 15, 14);
        }
        g.lineStyle(2, 0xcc6688); g.strokeRect(sx, sy - 14, 90, 14);

        // Sign
        this.add.text(sx + 45, sy + 6, "DOTTIE'S", {
            fontSize: '8px', fill: '#cc4466', fontFamily: 'monospace', fontStyle: 'bold'
        }).setDepth(5).setOrigin(0.5);
        this.add.text(sx + 45, sy + 18, 'ICE CREAM', {
            fontSize: '7px', fill: '#884422', fontFamily: 'monospace'
        }).setDepth(5).setOrigin(0.5);

        // Service window
        g.fillStyle(0x88ccee); g.fillRect(sx + 22, sy + 30, 46, 28);
        g.lineStyle(2, 0x446688); g.strokeRect(sx + 22, sy + 30, 46, 28);

        // Cone decoration in window
        g.fillStyle(0xf4c060); g.fillTriangle(sx+45, sy+55, sx+38, sy+32, sx+52, sy+32);
        g.fillStyle(0xff88aa); g.fillCircle(sx+45, sy+33, 8);
        g.fillStyle(0xffffff, 0.4); g.fillCircle(sx+42, sy+31, 4);

        // Physics body
        const b = this.obstacles.create(sx+45, sy+32, 'pixel');
        b.setVisible(false); b.setDisplaySize(90, 65); b.body.setSize(90, 65); b.refreshBody();
    }

    _createLakeShore() {
        const g = this.add.graphics().setDepth(1);

        // Lake body — deep blue-green
        g.fillStyle(0x1a5f8a);
        g.fillRect(80, 1040, 620, 140);

        // Shallows (lighter near edge)
        g.fillStyle(0x2a7aaa, 0.6);
        g.fillRect(80, 1040, 620, 25);
        g.fillRect(80, 1150, 620, 10);

        // Shoreline sand strip
        g.fillStyle(0xc8a86e);
        g.fillRect(80, 1032, 620, 14);

        // Water ripple lines (animated in update would be complex — static for now)
        g.lineStyle(1, 0x3a8fbf, 0.3);
        for (let y = 1058; y < 1170; y += 18) {
            for (let x = 100; x < 680; x += 60) {
                g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30, y); g.strokePath();
            }
        }

        // Dock
        g.fillStyle(0x8b5e20);
        g.fillRect(340, 1032, 8, 55);    // left post
        g.fillRect(410, 1032, 8, 55);    // right post
        g.fillRect(330, 1035, 100, 8);   // deck plank 1
        g.fillRect(330, 1048, 100, 8);   // deck plank 2
        g.fillRect(330, 1061, 100, 8);   // deck plank 3

        // Old Pete (fisherman figure at end of dock)
        const fg = this.add.graphics().setDepth(5);
        fg.fillStyle(0x3a5a3a); fg.fillRect(375, 1058, 10, 20); // body
        fg.fillStyle(0xe8c090); fg.fillRect(376, 1050, 8, 9);    // head
        fg.fillStyle(0x4a3010); fg.fillRect(373, 1048, 14, 4);   // hat brim
        fg.fillStyle(0x1a2a1a); fg.fillRect(374, 1044, 11, 5);   // hat top
        // Fishing rod
        fg.lineStyle(1, 0x6b3a18);
        fg.beginPath(); fg.moveTo(385, 1056); fg.lineTo(395, 1020); fg.strokePath();
        fg.lineStyle(1, 0x888888, 0.5);
        fg.beginPath(); fg.moveTo(395, 1020); fg.lineTo(400, 1050); fg.strokePath();
    }

    _createBulletinBoard() {
        const bx = 490, by = 370;
        const g = this.add.graphics().setDepth(4);

        // Post
        g.fillStyle(0x7a4a18); g.fillRect(bx - 3, by + 30, 6, 32);

        // Board backing (cork brown)
        g.fillStyle(0xb87840); g.fillRect(bx - 42, by - 28, 84, 62);
        g.lineStyle(3, 0x7a4a18); g.strokeRect(bx - 42, by - 28, 84, 62);

        // Paper pinned to board
        g.fillStyle(0xf8f4e0); g.fillRect(bx - 36, by - 22, 72, 50);

        // "PINEBROOK" text
        this.add.text(bx, by - 16, 'PINEBROOK', {
            fontSize: '7px', fill: '#442200', fontFamily: 'monospace', fontStyle: 'bold'
        }).setDepth(5).setOrigin(0.5);
        this.add.text(bx, by - 6, 'CAMPGROUND', {
            fontSize: '6px', fill: '#442200', fontFamily: 'monospace'
        }).setDepth(5).setOrigin(0.5);

        // Pinned note (yellow sticky)
        g.fillStyle(0xffee88); g.fillRect(bx + 4, by + 4, 28, 20);
        g.fillStyle(0xff4444); g.fillCircle(bx + 18, by + 4, 2); // pin

        // Push pins on corners
        g.fillStyle(0xff4444);
        g.fillCircle(bx - 34, by - 20, 2); g.fillCircle(bx + 34, by - 20, 2);
        g.fillCircle(bx - 34, by + 22, 2); g.fillCircle(bx + 34, by + 22, 2);

        // Physics body (just the post — board is above player path)
        const b = this.obstacles.create(bx, by + 46, 'pixel');
        b.setVisible(false); b.setDisplaySize(10, 32); b.body.setSize(10, 32); b.refreshBody();
    }

    _createFranksCamp() {
        const fx = 640, fy = 760;
        const g = this.add.graphics().setDepth(3);

        // Hidden campfire (Frank's)
        // Stone ring
        g.fillStyle(0x555555);
        for (let i = 0; i < 7; i++) {
            const a = (i / 7) * Math.PI * 2;
            g.fillCircle(fx + Math.cos(a) * 13, fy + Math.sin(a) * 9, 4);
        }
        g.fillStyle(0x1a0a04); g.fillEllipse(fx, fy, 16, 10);

        // Embers glow (warm orange)
        const ember = this.add.graphics().setDepth(4);
        ember.fillStyle(0xff6600, 0.7); ember.fillEllipse(fx, fy, 10, 6);
        this.tweens.add({
            targets: ember, alpha: { from: 0.4, to: 1 }, yoyo: true, repeat: -1, duration: 1100
        });

        // Frank's chair (log stump seat)
        g.fillStyle(0x5c3d11); g.fillEllipse(fx + 22, fy + 14, 18, 12);
        g.fillStyle(0x7a5520); g.fillEllipse(fx + 22, fy + 11, 16, 10);

        // Frank's pack leaning on a tree stub
        g.fillStyle(0x4a3820); g.fillRect(fx - 28, fy - 8, 14, 20);
        g.fillStyle(0x3a2810); g.fillRect(fx - 25, fy - 4, 8, 12);

        // Small note/map on the ground
        g.fillStyle(0xf0e8c0); g.fillRect(fx + 8, fy + 8, 12, 10);
        g.lineStyle(1, 0xaa8840, 0.4);
        g.lineBetween(fx+10, fy+11, fx+18, fy+11);
        g.lineBetween(fx+10, fy+14, fx+16, fy+14);

        // Ambient glow so player can spot the fire from a distance
        const glow = this.add.graphics().setDepth(2);
        glow.fillStyle(0xff7700, 0.08); glow.fillCircle(fx, fy, 55);
        this.tweens.add({
            targets: glow, alpha: { from: 0.3, to: 0.8 }, yoyo: true, repeat: -1, duration: 1400
        });
    }

    _createCounselor() {
        // Camp counselor NPC figure near bulletin board area
        const cx = 422, cy = 352;
        const g = this.add.graphics().setDepth(5);

        // Body (green camp shirt)
        g.fillStyle(0x3a7a3a); g.fillRect(cx - 7, cy - 10, 14, 16);
        // Shorts (khaki)
        g.fillStyle(0xb8a060); g.fillRect(cx - 6, cy + 4, 12, 10);
        // Skin
        g.fillStyle(0xe8c090); g.fillRect(cx - 4, cy - 20, 8, 10);
        // Hair (dark)
        g.fillStyle(0x3a2010); g.fillRect(cx - 4, cy - 22, 8, 4);
        // Cap
        g.fillStyle(0x3a7a3a); g.fillRect(cx - 5, cy - 26, 10, 6);
        g.fillStyle(0x2a5a2a); g.fillRect(cx - 7, cy - 22, 14, 3);
        // Clipboard
        g.fillStyle(0xddcc88); g.fillRect(cx + 6, cy - 8, 8, 12);
        g.fillStyle(0xffffff); g.fillRect(cx + 7, cy - 7, 6, 10);
        g.lineStyle(1, 0x888866, 0.5);
        g.lineBetween(cx+8, cy-5, cx+12, cy-5);
        g.lineBetween(cx+8, cy-2, cx+12, cy-2);
        g.lineBetween(cx+8, cy+1, cx+11, cy+1);
    }

    _createGoofyKid() {
        const kx = 555, ky = 508;
        const g = this.add.graphics().setDepth(5);

        // Body (orange shirt)
        g.fillStyle(0xee7722); g.fillRect(kx - 6, ky - 8, 12, 14);
        // Shorts (blue)
        g.fillStyle(0x334488); g.fillRect(kx - 5, ky + 4, 10, 10);
        // Shoes
        g.fillStyle(0x221100); g.fillRect(kx - 5, ky + 12, 5, 3); g.fillRect(kx + 1, ky + 12, 5, 3);
        // Skin
        g.fillStyle(0xe8c090); g.fillRect(kx - 4, ky - 18, 8, 10);
        // Hair (messy, spiky)
        g.fillStyle(0xcc6600); g.fillRect(kx - 4, ky - 22, 8, 6);
        g.fillStyle(0xdd7700); g.fillTriangle(kx-4, ky-22, kx-2, ky-28, kx, ky-22);
        g.fillTriangle(kx, ky-22, kx+2, ky-28, kx+4, ky-22);
        // Binoculars (he's been watching)
        g.fillStyle(0x333333); g.fillRect(kx + 5, ky - 4, 12, 6);
        g.fillStyle(0x6688aa); g.fillCircle(kx+9, ky-1, 3); g.fillCircle(kx+14, ky-1, 3);
    }

    _createDad() {
        const dx = 515, dy = 528;
        const g = this.add.graphics().setDepth(5);

        // Ground shadow
        g.fillStyle(0x000000, 0.15); g.fillEllipse(dx, dy + 24, 30, 10);

        // Shoes (brown boots)
        g.fillStyle(0x5a3010); g.fillRect(dx-7, dy+20, 6, 4); g.fillRect(dx+2, dy+20, 6, 4);
        // Pants (dark khaki)
        g.fillStyle(0x8a7040); g.fillRect(dx-6, dy+8, 5, 13); g.fillRect(dx+2, dy+8, 5, 13);
        // Shirt (warm blue-gray flannel)
        g.fillStyle(0x5a6a8a); g.fillRect(dx-7, dy-6, 15, 15);
        // Shirt detail (plaid stripe)
        g.fillStyle(0x7a8aaa, 0.5); g.fillRect(dx-7, dy-3, 15, 3); g.fillRect(dx-7, dy+3, 15, 3);
        // Arms (down, relaxed — holding a coffee mug)
        g.fillStyle(0x5a6a8a); g.fillRect(dx-10, dy-4, 4, 10); g.fillRect(dx+7, dy-4, 4, 10);
        // Coffee mug in right hand
        g.fillStyle(0x8c6040); g.fillRect(dx+9, dy+2, 6, 7);
        g.fillStyle(0x1a0a08); g.fillRect(dx+10, dy+3, 4, 3);
        g.lineStyle(1, 0x7a5030); g.strokeRect(dx+14, dy+4, 3, 5); // mug handle
        // Neck + head (skin)
        g.fillStyle(0xe8c090); g.fillRect(dx-3, dy-17, 7, 12);
        g.fillStyle(0xe8c090); g.fillRect(dx-4, dy-6, 9, 3); // chin wider
        // Hair (salt-and-pepper, slightly unkempt)
        g.fillStyle(0x887878); g.fillRect(dx-4, dy-22, 9, 6);
        g.fillStyle(0xaaaaaa, 0.5); g.fillRect(dx-4, dy-22, 5, 3); // gray streak
        // Slight smile / face detail
        g.fillStyle(0xc89070); g.fillRect(dx-1, dy-11, 3, 1); // mouth
        g.fillStyle(0x2a1a1a); g.fillRect(dx-2, dy-15, 2, 2); g.fillRect(dx+1, dy-15, 2, 2); // eyes
        // Name label (subtle, floating)
        this.add.text(dx, dy - 34, 'DAD', {
            fontSize: '7px', fill: '#ffd07088', fontFamily: 'monospace'
        }).setDepth(5).setOrigin(0.5);
    }

    _createSpecialStick() {
        const sx = 388, sy = 248;
        this._stickRawGfx = this.add.graphics().setDepth(4);
        const g = this._stickRawGfx;

        // The gnarled branch on the ground
        g.lineStyle(3, 0x7a4810);
        g.beginPath(); g.moveTo(sx - 18, sy + 6); g.lineTo(sx + 16, sy - 8); g.strokePath();
        g.lineStyle(2, 0x9a6030, 0.6);
        g.beginPath(); g.moveTo(sx - 14, sy + 4); g.lineTo(sx - 4, sy - 10); g.strokePath(); // small twig
        g.lineStyle(2, 0x9a6030, 0.6);
        g.beginPath(); g.moveTo(sx + 8, sy - 4); g.lineTo(sx + 20, sy + 4); g.strokePath(); // small twig

        // Soft golden glow (this is special)
        const glow = this.add.graphics().setDepth(3);
        glow.fillStyle(0xffdd88, 0.15); glow.fillEllipse(sx, sy, 48, 22);
        this.tweens.add({
            targets: glow, alpha: { from: 0.3, to: 0.9 }, yoyo: true, repeat: -1, duration: 1100
        });

        // Floating "!" marker
        this._stickMarker = this.add.text(sx, sy - 24, '!', {
            fontSize: '14px', fill: '#ffdd44', fontFamily: 'monospace', fontStyle: 'bold'
        }).setDepth(6).setOrigin(0.5);
        this.tweens.add({
            targets: this._stickMarker,
            y: sy - 30, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.easeInOut'
        });
    }

    _showWalkingStickHUD() {
        // Small walking stick icon in top-right corner of screen
        const hudGfx = this.add.graphics().setScrollFactor(0).setDepth(95);
        hudGfx.fillStyle(0x000000, 0.6); hudGfx.fillRect(430, 40, 44, 22);
        hudGfx.lineStyle(1, 0x7a4810, 0.7); hudGfx.strokeRect(430, 40, 44, 22);
        hudGfx.lineStyle(2, 0x9a6030);
        hudGfx.beginPath(); hudGfx.moveTo(436, 57); hudGfx.lineTo(466, 46); hudGfx.strokePath();

        this.add.text(446, 43, 'STICK', {
            fontSize: '7px', fill: '#c8a060', fontFamily: 'monospace'
        }).setScrollFactor(0).setDepth(96);

        // Flash in
        hudGfx.setAlpha(0);
        this.tweens.add({ targets: hudGfx, alpha: 1, duration: 600, ease: 'Back.easeOut' });

        // Celebration shake
        this.cameras.main.shake(400, 0.004);
        if (window.soundManager && window.soundManager.ready) window.soundManager.playDiscovery();
    }

    // ----------------------------------------------------------
    // ARTIFACT COLLECTION SYSTEM
    // ----------------------------------------------------------

    _createArtifacts() {
        // Arrowheads — dark flint triangles (6 total)
        [
            [185, 448], [432, 684], [596, 350],
            [330, 916], [546, 1054], [674, 476]
        ].forEach(([x, y], i) => this._placeArtifact(x, y, 'arrowhead', i));

        // Pottery shards — curved reddish clay (3 total)
        [
            [158, 746], [476, 284], [726, 628]
        ].forEach(([x, y], i) => this._placeArtifact(x, y, 'pottery', i));

        // Stone tools — green-gray scrapers (2 total)
        [
            [296, 1096], [618, 172]
        ].forEach(([x, y], i) => this._placeArtifact(x, y, 'tool', i));
    }

    _placeArtifact(x, y, type, idx) {
        const key = `${type}_${idx}`;
        const g   = this.add.graphics().setDepth(4);

        // Soft glow beneath
        const glow = this.add.graphics().setDepth(3);
        glow.fillStyle(0xffdd88, 0.1); glow.fillEllipse(x, y, 34, 18);
        this.tweens.add({
            targets: glow, alpha: { from: 0.2, to: 0.75 },
            yoyo: true, repeat: -1, duration: 1200 + idx * 180, ease: 'Sine.easeInOut'
        });

        // Artifact shape
        if (type === 'arrowhead') {
            g.fillStyle(0x5a5060);  // dark flint
            g.fillTriangle(x, y - 7, x - 5, y + 5, x + 5, y + 5);
            g.fillStyle(0x8a8090, 0.5);
            g.fillTriangle(x - 1, y - 6, x - 2, y, x + 2, y - 2); // knap highlight
        } else if (type === 'pottery') {
            g.fillStyle(0x8a4030);  // red clay
            g.fillRect(x - 7, y - 3, 14, 7);
            g.fillStyle(0x000000, 0); g.lineStyle(1, 0xaa6050, 0.7);
            g.lineBetween(x - 5, y - 1, x + 5, y - 1);   // incised line
            g.lineBetween(x - 3, y + 2, x + 3, y + 2);
        } else {                    // stone tool
            g.fillStyle(0x5a6a50);  // greenish quartzite
            g.fillTriangle(x - 5, y + 4, x, y - 8, x + 5, y + 4); // blade
            g.fillStyle(0x3a4a38, 0.5);
            g.fillTriangle(x - 2, y + 2, x, y - 4, x + 2, y + 2);
        }

        // Store gfx refs for hiding on pickup
        this[`_agfx_${key}`]  = g;
        this[`_aglow_${key}`] = glow;

        // Labels
        const labels = { arrowhead: 'Pick up arrowhead', pottery: 'Pick up shard', tool: 'Pick up stone tool' };
        const descs  = {
            arrowhead: 'A chipped flint arrowhead. Smooth edges, deliberate knapping.\nSomebody made this a long, long time ago.\n\n[Artifact: 1 of 6 arrowheads]',
            pottery:   'A curved pottery shard — red clay, incised geometric marks.\nPart of something larger, once.\n\n[Artifact: 1 of 3 pottery shards]',
            tool:      'A stone scraper, edge still sharp after centuries.\nThis wasn\'t made quickly.\n\n[Artifact: 1 of 2 stone tools]'
        };

        // Push interactable onto the existing array
        this.interactables.push({
            id: key, x, y, range: 48, hintLabel: labels[type],
            speaker: '',
            getText: () => descs[type],
            onInteract: (s) => {
                if (s.collected.has(key)) return;
                s.collected.add(key);
                // Count
                const cat = type === 'arrowhead' ? 'arrowheads' : type === 'pottery' ? 'pottery' : 'tools';
                s._artifactCounts[cat]++;
                const total = s._artifactCounts.arrowheads + s._artifactCounts.pottery + s._artifactCounts.tools;
                // Hide graphics
                if (s[`_agfx_${key}`])  s[`_agfx_${key}`].setVisible(false);
                if (s[`_aglow_${key}`]) s[`_aglow_${key}`].setVisible(false);
                s.interactables.find(o => o.id === key).disabled = true;
                // Brief counter flash
                const flash = s.add.text(x, y - 28, `Artifact ${total}/11`, {
                    fontSize: '8px', fill: '#ffdd88', fontFamily: 'monospace'
                }).setDepth(60).setOrigin(0.5);
                s.tweens.add({ targets: flash, y: y - 48, alpha: 0, duration: 1400, onComplete: () => flash.destroy() });
                if (window.soundManager && window.soundManager.ready) window.soundManager.playInteract();
            }
        });
    }

    // ----------------------------------------------------------
    // CAVE ENTRANCE
    // ----------------------------------------------------------

    _createCaveEntrance() {
        const cx = 92, cy = 692;
        const g = this.add.graphics().setDepth(3);

        // Hillside / rocky outcrop
        g.fillStyle(0x606055); g.fillEllipse(cx + 10, cy - 18, 130, 70);
        g.fillStyle(0x505048); g.fillEllipse(cx + 18, cy - 32, 90, 46);

        // Rock texture marks
        g.lineStyle(1, 0x404038, 0.5);
        g.lineBetween(cx - 20, cy - 28, cx - 8, cy - 18);
        g.lineBetween(cx + 30, cy - 40, cx + 44, cy - 28);

        // Cave opening — dark oval
        g.fillStyle(0x080606); g.fillEllipse(cx, cy, 52, 38);
        g.fillStyle(0x120e0c, 0.7); g.fillEllipse(cx - 4, cy - 5, 38, 26);

        // Debris blocking entrance (rocks + roots)
        g.fillStyle(0x6a6558); g.fillCircle(cx - 14, cy + 12, 9);
        g.fillStyle(0x585248); g.fillCircle(cx + 10, cy + 14, 7);
        g.fillStyle(0x706858); g.fillCircle(cx + 1,  cy + 16, 6);
        g.fillStyle(0x2a5a1a, 0.55); g.fillEllipse(cx - 22, cy - 2, 22, 10); // moss

        // Fern fronds (decorative)
        g.lineStyle(2, 0x2a6a1a, 0.6);
        [[-30, -8], [-26, -14], [-34, -4]].forEach(([ox, oy]) => {
            g.beginPath(); g.moveTo(cx + ox, cy + oy); g.lineTo(cx + ox - 8, cy + oy - 14); g.strokePath();
        });

        // "CAVE" label
        this.add.text(cx, cy - 56, '[ CAVE ]', {
            fontSize: '7px', fill: '#88887866', fontFamily: 'monospace'
        }).setDepth(5).setOrigin(0.5);

        // Small warning stake
        g.fillStyle(0xaa8830); g.fillRect(cx + 30, cy - 50, 4, 30);
        g.fillStyle(0xddaa20); g.fillRect(cx + 24, cy - 56, 16, 10);
        this.add.text(cx + 32, cy - 54, '!', {
            fontSize: '8px', fill: '#1a1a00', fontFamily: 'monospace'
        }).setDepth(5).setOrigin(0.5);

        // Physics body — rocky outcrop blocks passage
        const b = this.obstacles.create(cx + 10, cy - 22, 'pixel');
        b.setVisible(false); b.setDisplaySize(130, 46); b.body.setSize(130, 46); b.refreshBody();

        // Interactable
        this.interactables.push({
            id: 'cave_entrance', x: cx, y: cy, range: 72, hintLabel: 'Examine cave',
            speaker: '',
            getText: (s) => {
                if (s.collected.has('frank_lore_1'))
                    return 'This is the cave Frank mentioned.\nThe entrance is blocked — rocks and overgrown roots.\nYou\'d need something to clear it. The walking stick, maybe?\n\n[Return when you\'re better prepared]';
                return 'A natural cave entrance, half-buried in the hillside.\nBlocked by rocks and years of growth.\nThere\'s cold air coming from inside.\nSomebody has been here before — the stones are too neat to be natural.';
            }
        });
    }
