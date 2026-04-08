// ============================================================
// GameScene.js — Main game scene
// ============================================================

class GameScene extends Phaser.Scene {

    constructor() { super({ key: 'GameScene' }); }

    create() {
        const W = 2400, H = 1800;

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
        this._createRegistrationOffice();
        this._createShed();
        this._createBathHouse();
        this._createTrees();
        this._createFence();
        this._createBushes();
        this._createRocks();
        this._createStumps();

        this._createPlayer();

        this.cameras.main.setBounds(0, 0, W, H);
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this.cameras.main.fadeIn(800, 0, 0, 0);

        this.physics.add.collider(this.player, this.obstacles);

        this.dialogue = new DialogueBox(this);
        this.quest    = new QuestTracker(this);

        this._createLakeShore();
        this._createDock();

        // Named camp sites
        this._createCampsiteMaple();    // Site A — Ben's camp
        this._createCampsitePine();     // Site B — Hamilton family
        this._createCampsiteBirch();    // Site C — Harold
        this._createCampsiteCedar();    // Site D — Mia
        this._createCampsiteOak();      // Site E — Group / Counselor
        this._createCampsiteWillow();   // Site F — Frank's wilderness

        this._createIceCreamShack();
        this._createRecArea();
        this._createBulletinBoard();
        this._createDad();
        this._createSpecialStick();
        this._createGlowingClue();
        this._createBoltCutters();
        this._createControlPanel();

        this._buildInteractables();
        this._createArtifacts();   // must be after _buildInteractables so this.interactables exists
        this._createCaveEntrance();
        this._setupInput();

        this.interactHint = this.add.text(0, 0, '', {
            fontSize: '9px', fill: '#ffffff', fontFamily: 'monospace',
            backgroundColor: '#000000bb', padding: { x: 5, y: 3 }
        }).setDepth(50).setVisible(false);

        // Restore state if returning from CaveScene
        if (window.gameState) this._loadFromGameState();
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
                id: 'campfire', x: 352, y: 479, range: 65, hintLabel: 'Examine',
                speaker: '',
                text: '...The fire is still going. Ash not yet cold. Someone lit this recently.'
            },
            {
                id: 'mug', x: 318, y: 498, range: 50, hintLabel: 'Examine',
                speaker: '',
                text: 'A tin mug, still half-full of coffee. Cold now. Whoever left this didn\'t plan to be gone long.'
            },
            {
                id: 'tent', x: 282, y: 435, range: 60, hintLabel: 'Look inside',
                speaker: '',
                text: 'A small camping tent. Sleeping bag inside, unzipped. A flashlight, dead batteries. Nobody\'s been back to this.'
            },
            {
                id: 'cabin', x: 147, y: 376, range: 60, hintLabel: 'Try door',
                getSpeaker: () => '',
                getText: (s) => s.collected.has('bolt_cutters')
                    ? 'The cabin is padlocked — a keyed lock. The bolt cutters won\'t fit.'
                    : 'Padlocked. A hand-painted sign: RANGERS ONLY.\nThe curtains inside are drawn.'
            },
            {
                id: 'shed', x: 118, y: 1088, range: 60, hintLabel: 'Examine',
                speaker: '',
                text: 'A maintenance shed. Locked. Through the gap you can see tools, rope, a few paint cans.'
            },
            {
                id: 'bolt_cutters', x: 186, y: 1138, range: 80, hintLabel: 'Take',
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
                id: 'picnic_note', x: 610, y: 745, range: 60, hintLabel: 'Read note',
                speaker: 'NOTE',
                text: '"Marcus — stay at site 4 until I get back.\nChecked Sector 7 this morning. Something\'s wrong with the east containment wall.\nDon\'t touch anything. — R.D."'
            },
            {
                id: 'sign', x: 1830, y: 748, range: 65, hintLabel: 'Read',
                speaker: 'SIGN',
                text: 'DANGER — RADIATION\nRESTRICTED AREA — PINEBROOK NUCLEAR RESERVE\nNo trespassing. Authorized personnel only.'
            },
            {
                id: 'glowing_clue', x: 1848, y: 842, range: 72, hintLabel: '???',
                getSpeaker: () => '???',
                getText: (s) => s.quest.atLeast('NEED_TOOL')
                    ? 'The cylinder still hums. A hazard symbol on the casing. Whatever is leaking from inside that fence has been leaking a while.'
                    : 'A metallic cylinder half-buried at the fence post. Cold. It hums. A crack along the casing bleeds pale light.',
                onInteract: (s) => { if (!s.quest.atLeast('NEED_TOOL')) s.quest.advance(QUEST_STATES.NEED_TOOL); }
            },
            {
                id: 'gate', x: 1876, y: 834, range: 55, hintLabel: 'Examine',
                getSpeaker: () => '',
                getText: (s) => s.collected.has('bolt_cutters')
                    ? 'You slip the jaws around the shackle and squeeze.\n*SNAP*\nThe padlock drops. The gate groans open.'
                    : 'A chain-link gate. Heavy padlock. No getting through without something to cut it.',
                onInteract: (s) => { if (!s._gateOpen && s.collected.has('bolt_cutters')) s._openGate(); }
            },
            {
                id: 'worker_badge', x: 1940, y: 876, range: 60, hintLabel: 'Examine',
                speaker: 'ID BADGE',
                text: 'PINEBROOK NUCLEAR RESERVE\nEMPLOYEE: MARCUS COLE\nID: NR-4471  CLEARANCE: LEVEL 2\n\n[EXPIRED]'
            },
            // ---- Dad + walking stick quest ----
            {
                id: 'dad', x: 348, y: 496, range: 70, hintLabel: 'Talk to Dad',
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
                id: 'special_stick', x: 166, y: 338, range: 60, hintLabel: 'Pick up',
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
                id: 'bulletin_board', x: 456, y: 602, range: 70, hintLabel: 'Read board',
                speaker: 'BULLETIN BOARD',
                text: 'PINEBROOK CAMPGROUND — WELCOME!\n\nSite Map posted at the entrance.\nReport wildlife sightings to the ranger cabin.\n\n[handwritten sticky note]\n"Has anyone seen my bolt cutters?\nLeft them leaning by the shed. — SITE 4"'
            },
            {
                id: 'counselor', x: 882, y: 1042, range: 65, hintLabel: 'Talk',
                speaker: 'COUNSELOR DANA',
                getText: (s) => s.quest.atLeast('INSIDE')
                    ? 'I don\'t know how you got in there. Please stay safe — that fence is posted for a reason.'
                    : s.quest.atLeast('NEED_TOOL')
                    ? 'You\'re looking for something to cut a lock? Try the maintenance shed — site 4 camper was griping about missing cutters just yesterday.'
                    : 'Welcome to Pinebrook! Explore, have fun, but stay out of the restricted zone past the east fence. Seriously.'
            },
            {
                id: 'goofy_kid', x: 960, y: 1014, range: 60, hintLabel: 'Talk',
                speaker: 'KID',
                getText: (s) => s.quest.atLeast('DISCOVERED_CLUE')
                    ? 'See? Told you something was out there! You should find a way past that fence...'
                    : 'Dude. Last night, around 2am, I saw this green glow by the east fence.\nMy parents said I was dreaming. I wasn\'t dreaming.'
            },
            {
                id: 'fisherman', x: 2038, y: 678, range: 75, hintLabel: 'Talk',
                speaker: 'OLD PETE',
                getText: (s) => s.quest.atLeast('INSIDE')
                    ? 'You found something in there, didn\'t you. I can see it in your face.\nSame look I had in \'89.'
                    : 'Been fishin\' this lake forty years. Used to be you could eat what you caught.\n...Not anymore.'
            },
            {
                id: 'ice_cream', x: 1058, y: 1770, range: 65, hintLabel: 'Order',
                speaker: 'MRS. DOTTIE',
                getText: (s) => s.collected.has('bolt_cutters')
                    ? 'Back again? You look like you\'ve been busy. The Fudge Avalanche is on me. You\'ve earned it!'
                    : 'What\'ll it be, sweetheart? We\'ve got Fudge Avalanche, Maple Melt, Campfire Crunch... and the Sasquatch Surprise — though I can\'t promise what\'s in it.'
            },
            // ---- New NPCs (expanded cast) ----
            {
                id: 'reg_clerk', x: 432, y: 650, range: 65, hintLabel: 'Talk',
                speaker: 'CAMP CLERK',
                getText: (s) => s.quest.atLeast('INSIDE')
                    ? 'The ranger still hasn\'t checked in. Filing a report today.\nWhatever you found in there — please be careful.'
                    : 'Welcome to Pinebrook! Maps at the desk. Oh — Ranger Thompson hasn\'t checked in for two days.\nProbably on patrol... probably.'
            },
            {
                id: 'dave_hamilton', x: 802, y: 466, range: 65, hintLabel: 'Talk',
                speaker: 'DAVE (SITE B)',
                getText: (s) => s.quest.atLeast('INSIDE')
                    ? 'You were inside that compound?\nMy wife\'s been getting headaches all week. The water here isn\'t right.\nIf you found proof — make sure people know.'
                    : s.quest.atLeast('DISCOVERED_CLUE')
                    ? 'You noticed that fence too? The metallic taste in the water started the day we arrived.\nKids won\'t drink it now. Something is wrong here.'
                    : 'Beautiful spot, but my kids won\'t drink the tap water.\nTastes metallic. Thought it was old pipes at first.'
            },
            {
                id: 'harold', x: 1252, y: 432, range: 65, hintLabel: 'Talk',
                speaker: 'HAROLD',
                getText: (s) => s.quest.atLeast('INSIDE')
                    ? 'You got in there? Lord.\nWhatever you found — write it down and get it out.\nDon\'t let them bury it again.'
                    : s.quest.atLeast('NEED_TOOL')
                    ? 'Trying to get past that fence? I tried in \'92.\nThey had a man watching. Be careful.\nThis was public land until 1989 — they signed it away overnight.'
                    : 'Name\'s Harold. Retired ranger — twenty-two years on this route.\nIn 1989 they told me the east section was "private leasehold." Overnight.\nFish started dying that summer.'
            },
            {
                id: 'mia', x: 1712, y: 458, range: 65, hintLabel: 'Talk',
                speaker: 'MIA',
                getText: (s) => s.quest.atLeast('INSIDE')
                    ? 'You actually went in. I knew it.\nI wrote down everything — the workers, the lake readings.\nI\'ll back you up if you need a witness.'
                    : s.quest.atLeast('DISCOVERED_CLUE')
                    ? 'That glow? I think it\'s Cherenkov radiation.\nLeaks from certain reactor-adjacent materials.\nMy chemistry teacher would call this a serious incident.'
                    : 'I heard facility workers talking last night.\nThey didn\'t see me.\n"Evacuation window." "They\'ll never check the lake readings."\nI wrote it all down.'
            },
            {
                id: 'frank_campfire', x: 270, y: 1634, range: 80, hintLabel: 'Approach fire',
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
                id: 'control_panel', x: 2120, y: 1160, range: 70, hintLabel: 'Access terminal',
                speaker: 'TERMINAL',
                getText: (s) => {
                    if (s._endingPlayed) return '[SIGNAL LOST]\n[SIGNAL LOST]\n[SIGNAL LOST]';
                    if (s.collected.has('facility_log'))
                        return 'PINEBROOK NUCLEAR RESERVE\nFACILITY LOG — SECTOR 7\n\nCoolant loop: OFFLINE (14d 11h)\nCore temp: CRITICAL\nContainment: PARTIAL\n\nDr. Chen\'s log confirms everything.\nThis needs to get out.\n\n[ You have all the evidence. ]';
                    return 'PINEBROOK NUCLEAR RESERVE\nFACILITY LOG — SECTOR 7\n\nBreach: coolant line fracture\nDay 14 — Status: UNRESOLVED\n\nThis terminal is live. Something is very wrong.\nYou need the full picture before you act.';
                },
                onInteract: (s) => {
                    if (!s._endingPlayed && s.collected.has('facility_log')) s._triggerEnding();
                }
            }
        ];

        this._autoQuestZones = [{
            x: 1600, y: 680, w: 300, h: 1120,
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

        // ---- Base grass ----
        g.fillStyle(0x3d6b2e); g.fillRect(0, 0, w, h);

        // Darker variation patches
        g.fillStyle(0x2d5a22);
        [[80,200,180,110],[420,120,200,100],[720,280,160,120],[1050,180,190,110],
         [1380,340,170,100],[1700,200,160,120],[2050,600,180,110],[2250,350,140,100],
         [300,1200,190,120],[620,1450,170,110],[950,1060,160,100],[1350,1200,180,120],
         [1700,1500,160,110],[400,800,140,90],[800,900,150,100],[1600,900,140,100]
        ].forEach(([x,y,pw,ph]) => g.fillRect(x,y,pw,ph));

        // Lighter highlight patches
        g.fillStyle(0x4a7a35);
        [[220,580,100,60],[560,820,110,65],[1000,740,100,60],[1450,700,110,65],
         [800,1180,100,60],[1200,1100,90,55],[600,400,90,55],[1600,500,100,60]
        ].forEach(([x,y,pw,ph]) => g.fillRect(x,y,pw,ph));

        // ---- Dense forest zones (corners) ----
        g.fillStyle(0x1e3818);
        g.fillRect(0, 0, 380, 430);       // NW forest behind cabin
        g.fillRect(0, 1500, 55, 300);     // SW forest edge (beside cave trail)
        g.fillStyle(0x223820);
        g.fillRect(2050, 0, 350, 580);    // NE forest above lake

        // ---- DIRT PATHS (sandy beige) ----
        const dirt = 0x8b7355, dirtE = 0x9a8465;

        g.fillStyle(dirt);
        // Main N spine road (primary E-W artery)
        g.fillRect(60, 680, 1860, 44);
        // Main S loop road
        g.fillRect(60, 1380, 1800, 44);
        // West N-S connector (left side of loop)
        g.fillRect(60, 680, 44, 744);
        // Center N-S cross road
        g.fillRect(950, 680, 44, 744);
        // Cabin spur (north from main road to cabin)
        g.fillRect(60, 440, 44, 244);
        // Lake trail (east from main road to lake shore)
        g.fillRect(1860, 590, 260, 40);
        // Cave trail (south from loop-bottom, follows west road down)
        g.fillRect(60, 1424, 44, 380);
        // Rec spur (south from center cross to ice cream + rec area)
        g.fillRect(950, 1424, 44, 340);
        // Frank's spur (south-west branch to wilderness camp)
        g.fillRect(200, 1424, 44, 220);
        // Campsite spurs (short N paths from main road to each site)
        g.fillRect(290, 490, 44, 194);   // Maple spur
        g.fillRect(755, 490, 44, 194);   // Pine spur
        g.fillRect(1210, 490, 44, 194);  // Birch spur
        g.fillRect(1670, 490, 44, 194);  // Cedar spur

        // Path edge highlights
        g.fillStyle(dirtE, 0.35);
        g.fillRect(60, 678, 1860, 4);    // N road top edge
        g.fillRect(60, 720, 1860, 4);    // N road bottom edge
        g.fillRect(60, 1378, 1800, 4);   // S road top edge
        g.fillRect(60, 1420, 1800, 4);   // S road bottom edge

        // Gravel clearings at main junctions
        g.fillStyle(0x7a6848, 0.6);
        g.fillEllipse(104, 702, 60, 40); // W junction
        g.fillEllipse(994, 702, 60, 40); // Center junction
        g.fillEllipse(104, 1402, 60, 40); // SW junction
        g.fillEllipse(994, 1402, 60, 40); // S-center junction

        // ---- LAKE (north-east) ----
        g.fillStyle(0x1e5a8a); g.fillRect(1860, 60, 520, 640);
        // Shoreline shallows (lighter near edges)
        g.fillStyle(0x2e7aaa, 0.6); g.fillRect(1860, 60, 520, 40);
        g.fillStyle(0x2e7aaa, 0.5); g.fillRect(1860, 60, 40, 640);
        // Water shimmer lines
        g.lineStyle(1, 0x4090cc, 0.25);
        for (let ry = 100; ry < 680; ry += 50) g.lineBetween(1900, ry, 1900 + 80 + (ry % 100), ry + 4);
        // Dark deep zone
        g.fillStyle(0x12395a, 0.5); g.fillRect(1980, 130, 340, 400);
        // Sandy beach strip
        g.fillStyle(0xb8a870); g.fillRect(1820, 620, 580, 50);
        g.fillStyle(0xc8b880, 0.6); g.fillRect(1820, 620, 580, 20);

        // ---- FACILITY ZONE (east, behind fence) ----
        g.fillStyle(0x283a24); g.fillRect(1860, 760, 540, 1020); // dark wrong-feeling grass
        g.fillStyle(0x282030); g.fillRect(1960, 1000, 380, 500);  // contamination tint
        g.fillStyle(0x4a5a20); g.fillRect(1820, 800, 80, 700);    // yellowing at fence edge
        // Service road inside facility
        g.fillStyle(0x686054); g.fillRect(1860, 900, 540, 28);
        g.fillRect(1940, 760, 28, 1020);

        // ---- CREEK (visual only, runs N-S through west-center area) ----
        g.fillStyle(0x356a80, 0.8);
        g.fillRect(298, 820, 14, 560);  // N-S segment
        g.fillRect(298, 820, 180, 14);  // E spur
        g.fillStyle(0x4a80a0, 0.35);
        g.fillRect(300, 822, 10, 556);  // inner highlight

        // Creek banks (mud)
        g.fillStyle(0x6a5a3a, 0.4);
        g.fillRect(290, 820, 26, 562);

        // ---- ROCKY OUTCROPS near cave trail ----
        g.fillStyle(0x504840);
        [[108,1570,55,32],[175,1660,48,28],[240,1730,52,30],[90,1710,44,26]
        ].forEach(([x,y,rw,rh]) => g.fillEllipse(x+rw/2, y+rh/2, rw, rh));

        // ---- Campsite clearing patches (faint dirt clearing at each site) ----
        g.fillStyle(0x4a6a30);  // slightly lighter green = mowed clearing
        [[250,390,170,110],[730,370,170,110],[1185,355,170,110],
         [1650,370,170,110],[790,970,200,130],[195,1530,160,100]
        ].forEach(([x,y,pw,ph]) => g.fillEllipse(x+pw/2, y+ph/2, pw, ph));

        // ---- Border strips ----
        g.fillStyle(0x1a2c14);
        g.fillRect(0, 0, w, 20);
        g.fillRect(0, h-20, w, 20);
        g.fillRect(0, 0, 20, h);
        g.fillRect(w-20, 0, 20, h);
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

        this.player = this.physics.add.sprite(310, 710, 'player_idle');
        this.player.setCollideWorldBounds(true);
        this.player.setDepth(10);
    }

    _createCabin() {
        const x = 70, y = 285, w = 155, h = 120;
        const g = this.add.graphics().setDepth(4);

        g.fillStyle(0x000000, 0.22); g.fillRect(x+8, y+h+2, w, 10);

        g.fillStyle(0x7a3d0e); g.fillRect(x, y, w, h);
        g.lineStyle(1, 0x5c2d0a, 0.35);
        for (let yi = y+14; yi < y+h; yi += 14) g.lineBetween(x, yi, x+w, yi);

        g.fillStyle(0x4a2009); g.fillRect(x-10, y, w+20, 16);
        g.fillStyle(0x351506); g.fillTriangle(x-10, y+16, x+w/2, y-30, x+w+10, y+16);

        g.fillStyle(0x2a1005); g.fillRect(x+55, y+68, 44, 52);
        g.fillStyle(0xbbbbbb); g.fillRect(x+73, y+90, 6, 6);

        g.fillStyle(0x6699bb); g.fillRect(x+10, y+28, 30, 24); g.fillRect(x+115, y+28, 30, 24);
        g.lineStyle(2, 0x2a1005, 1); g.strokeRect(x+10,y+28,30,24); g.strokeRect(x+115,y+28,30,24);

        // RANGERS ONLY sign
        g.fillStyle(0xddaa30); g.fillRect(x+46, y+56, 62, 10);
        this.add.text(x+77, y+60, 'RANGERS ONLY', {
            fontSize: '5px', fill: '#2a1005', fontFamily: 'monospace'
        }).setDepth(5).setOrigin(0.5);

        const b = this.obstacles.create(x+w/2, y+h/2, 'pixel');
        b.setVisible(false); b.setDisplaySize(w,h); b.body.setSize(w,h); b.refreshBody();
    }

    _createRegistrationOffice() {
        const x = 375, y = 612, w = 115, h = 90;
        const g = this.add.graphics().setDepth(4);

        g.fillStyle(0x000000, 0.18); g.fillRect(x+6, y+h+2, w, 9);  // shadow

        // Main body — cream/tan
        g.fillStyle(0xd4c490); g.fillRect(x, y, w, h);
        g.lineStyle(1, 0xb8a870, 0.5);
        for (let yi = y+12; yi < y+h; yi += 12) g.lineBetween(x, yi, x+w, yi);

        // Roof
        g.fillStyle(0x6a4820); g.fillRect(x-8, y, w+16, 14);
        g.fillStyle(0x4a3010); g.fillTriangle(x-8, y+14, x+w/2, y-18, x+w+8, y+14);

        // Door
        g.fillStyle(0x4a3010); g.fillRect(x+42, y+56, 30, 34);
        g.fillStyle(0xddcc88); g.fillRect(x+68, y+71, 3, 5);

        // Windows
        g.fillStyle(0x88aacc); g.fillRect(x+8, y+22, 24, 20); g.fillRect(x+83, y+22, 24, 20);
        g.lineStyle(1, 0x4a3010); g.strokeRect(x+8,y+22,24,20); g.strokeRect(x+83,y+22,24,20);
        g.lineStyle(1, 0x4a3010, 0.5);
        g.lineBetween(x+20, y+22, x+20, y+42); g.lineBetween(x+95, y+22, x+95, y+42);

        // Sign above door
        g.fillStyle(0x225a22); g.fillRect(x+10, y-2, 95, 12);
        this.add.text(x+57, y+3, 'CAMP REGISTRATION', {
            fontSize: '5px', fill: '#ccffaa', fontFamily: 'monospace'
        }).setDepth(5).setOrigin(0.5);

        const b = this.obstacles.create(x+w/2, y+h/2, 'pixel');
        b.setVisible(false); b.setDisplaySize(w,h); b.body.setSize(w,h); b.refreshBody();
    }

    _createShed() {
        const x = 66, y = 1046, w = 104, h = 84;
        const g = this.add.graphics().setDepth(3);
        g.fillStyle(0x42280c); g.fillRect(x, y, w, h);
        g.lineStyle(1, 0x2e1a08, 0.7);
        for (let yi = y+12; yi < y+h; yi += 12) g.lineBetween(x, yi, x+w, yi);
        g.fillStyle(0x2a1508); g.fillRect(x-6, y, w+12, 14);
        g.fillStyle(0x1e1006); g.fillTriangle(x-6, y+14, x+w/2, y-18, x+w+6, y+14);
        g.fillStyle(0x180c04); g.fillRect(x+34, y+38, 36, 46);
        // Lock
        g.fillStyle(0xaaaaaa); g.fillRect(x+49, y+46, 6, 5);
        g.lineStyle(1, 0x888888); g.strokeCircle(x+52, y+44, 4);

        const b = this.obstacles.create(x+w/2, y+h/2, 'pixel');
        b.setVisible(false); b.setDisplaySize(w,h); b.body.setSize(w,h); b.refreshBody();
    }

    _createBathHouse() {
        const x = 988, y = 1306, w = 88, h = 72;
        const g = this.add.graphics().setDepth(3);
        g.fillStyle(0x000000, 0.14); g.fillRect(x+5, y+h+1, w, 8);

        // Cinder block walls
        g.fillStyle(0xd0cfc8); g.fillRect(x, y, w, h);
        g.lineStyle(1, 0xb8b7b0, 0.5);
        for (let yi = y+16; yi < y+h; yi += 16) g.lineBetween(x, yi, x+w, yi);
        for (let xi = x+22; xi < x+w; xi += 22) g.lineBetween(xi, y, xi, y+h);

        // Roof
        g.fillStyle(0x888880); g.fillRect(x-4, y, w+8, 12);
        g.fillStyle(0x666660); g.fillTriangle(x-4, y+12, x+w/2, y-14, x+w+4, y+12);

        // Two doors (M/W)
        g.fillStyle(0x446644); g.fillRect(x+10, y+40, 28, 32);
        g.fillStyle(0x336633); g.fillRect(x+50, y+40, 28, 32);
        g.fillStyle(0xccffcc, 0.7); g.fillRect(x+34, y+26, 20, 12);
        this.add.text(x+24, y+52, 'M', { fontSize: '9px', fill: '#ccffcc', fontFamily: 'monospace' }).setDepth(5).setOrigin(0.5);
        this.add.text(x+64, y+52, 'W', { fontSize: '9px', fill: '#ccffcc', fontFamily: 'monospace' }).setDepth(5).setOrigin(0.5);

        const b = this.obstacles.create(x+w/2, y+h/2, 'pixel');
        b.setVisible(false); b.setDisplaySize(w,h); b.body.setSize(w,h); b.refreshBody();
    }

    _createTrees() {
        [
            // North border — dense line
            [80,54],[168,42],[256,58],[354,44],[452,56],[562,42],[672,58],[782,44],[892,56],
            [1000,42],[1110,58],[1220,44],[1340,56],[1460,42],[1570,58],[1700,44],[1820,56],
            // NW dense forest (behind cabin)
            [38,130],[98,190],[158,140],[218,200],[48,270],[108,250],[168,300],[230,160],
            [55,380],[110,340],[170,420],[220,340],[38,460],[105,480],[168,510],[228,440],
            // Cabin spur — trees flanking the path
            [42,490],[42,558],[42,616],[42,644],
            // West edge trees
            [38,740],[38,820],[38,900],[38,980],[38,1060],[38,1140],[38,1220],[38,1300],
            [38,1450],[38,1520],[38,1600],[38,1680],[38,1750],
            // Between campsites (north zone between path and top border)
            [480,130],[540,200],[620,150],[700,130],[820,180],[910,130],[1040,180],[1130,130],
            [1300,180],[1380,130],[1490,200],[1560,140],[1760,180],[1820,130],
            // Between Maple and Pine spur
            [510,360],[548,420],[512,480],
            // Between Pine and Birch spur
            [1010,380],[1050,440],[1090,390],
            // Between Birch and Cedar spur
            [1480,360],[1530,430],[1490,490],
            // East of Cedar (beyond lake trail junction)
            [1820,380],[1820,460],[1820,530],
            // Interior loop scattered trees
            [158,780],[158,860],[158,940],[158,1020],
            [440,800],[480,870],[520,830],[440,960],[490,1000],
            [740,820],[780,870],[740,950],[790,1000],
            [1100,800],[1140,870],[1080,940],[1150,1000],
            [1440,820],[1480,870],[1440,960],[1480,1030],
            // Center cross flanking trees
            [900,750],[1050,750],[900,1000],[1050,1000],[900,1200],[1050,1200],[900,1350],[1050,1350],
            // South of main S road — rec area edges
            [38,1680],[450,1520],[520,1600],[600,1500],[680,1540],[800,1480],[850,1550],
            [1100,1480],[1150,1540],[1200,1480],[1350,1500],[1420,1560],[1500,1500],
            [1550,1480],[1620,1550],[1680,1480],[1740,1540],[1800,1480],
            // Bottom border
            [80,1762],[200,1750],[320,1762],[460,1750],[600,1762],[740,1750],[900,1762],
            [1060,1750],[1200,1762],[1380,1750],[1520,1762],[1680,1750],[1800,1762],
            // Far east — mysterious trees beyond/inside facility
            [2150,80],[2250,140],[2300,80],[2200,200],[2350,180],
            [2100,1800],[2250,1750],[2350,1800],
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
        [
            [230,740],[380,760],[560,750],[720,760],[880,730],[1040,748],[1200,730],[1360,752],
            [1560,740],[1720,758],[170,750],[170,840],[170,930],[170,1020],[170,1110],[170,1200],
            [450,1000],[600,1080],[720,1000],[880,1080],[1100,1020],[1280,980],[1450,1050],
            [360,1400],[500,1420],[650,1400],[850,1420],[1050,1400],[1250,1420],[1450,1400],
            [230,1530],[320,1560],[430,1500],[1700,900],[1800,950],[1780,1100],[1800,1200],
            [350,330],[420,280],[480,330],[200,810],[240,860],[284,800]
        ].forEach(([bx,by]) => {
            const g = this.add.graphics().setDepth(3);
            g.fillStyle(0x2d6a2a); g.fillCircle(bx, by, 13);
            g.fillStyle(0x358030); g.fillCircle(bx+11, by+3, 11);
            g.fillStyle(0x2d6a2a); g.fillCircle(bx-9, by+4, 10);
            g.fillStyle(0x42943e, 0.6); g.fillCircle(bx-2, by-5, 7); g.fillCircle(bx+7, by-3, 6);
        });
    }

    _createRocks() {
        // Rocky outcrops scattered across the world
        [
            // Near cave trail (SW)
            [112,1540,44,26],[184,1620,38,22],[250,1700,46,28],[90,1680,40,24],
            // Near fence exterior
            [1780,848],[1780,920],[1780,1050],[1780,1180],[1780,1340],
            // North forest floor
            [190,220],[280,280],[350,230],[120,310],[420,350],
            // Near creek
            [284,860],[276,960],[286,1040],[278,1120],
            // Lake shore rocks
            [1838,638],[1846,656],[1852,672],
        ].forEach(([rx,ry,rw,rh]) => {
            if (!rw) { rw = 24 + Math.floor(Math.random()*14); rh = 14 + Math.floor(Math.random()*8); }
            const g = this.add.graphics().setDepth(3);
            g.fillStyle(0x5a5248); g.fillEllipse(rx, ry, rw, rh);
            g.fillStyle(0x7a7068, 0.6); g.fillEllipse(rx-rw*0.12, ry-rh*0.2, rw*0.65, rh*0.55);
        });
    }

    _createStumps() {
        [
            [165,730],[280,810],[450,880],[620,960],[750,860],[900,1180],[1100,1100],
            [1280,860],[1460,980],[320,1450],[480,1520],[220,1480]
        ].forEach(([sx,sy]) => {
            const g = this.add.graphics().setDepth(3);
            g.fillStyle(0x5c3d11); g.fillEllipse(sx, sy, 26, 15);
            g.fillStyle(0x8b5e2a); g.fillEllipse(sx, sy-3, 24, 13);
            g.lineStyle(1, 0x6b4a1a, 0.5); g.strokeEllipse(sx, sy-3, 17, 9);
            g.lineStyle(1, 0x6b4a1a, 0.3); g.strokeEllipse(sx, sy-3, 10, 5);
        });
    }


    // ----------------------------------------------------------
    // CAMPSITE HELPERS + NAMED SITES
    // ----------------------------------------------------------

    _drawFire(g, fx, fy) {
        g.fillStyle(0x3a2818); g.fillEllipse(fx, fy+6, 32, 16);           // stone ring
        for (let i = 0; i < 6; i++) {                                       // logs
            const a = (i/6)*Math.PI*2;
            g.fillStyle(0x5a3818); g.fillRect(fx+Math.cos(a)*9-3, fy+Math.sin(a)*5+2, 6, 4);
        }
        g.fillStyle(0xff6600, 0.85); g.fillTriangle(fx, fy-6, fx-6, fy+4, fx+6, fy+4);
        g.fillStyle(0xff9900, 0.7);  g.fillTriangle(fx, fy-3, fx-4, fy+3, fx+4, fy+3);
        g.fillStyle(0xffdd44, 0.5);  g.fillTriangle(fx, fy-1, fx-2, fy+2, fx+2, fy+2);
        g.fillStyle(0xff4400, 0.3);  g.fillCircle(fx, fy+1, 10);           // glow
    }

    _drawTent(g, tx, ty, mainColor, accentColor) {
        g.fillStyle(0x000000, 0.2); g.fillEllipse(tx, ty+22, 56, 14);       // shadow
        g.fillStyle(mainColor);
        g.fillTriangle(tx, ty-24, tx-26, ty+12, tx+26, ty+12);              // front face
        g.fillStyle(accentColor);
        g.fillTriangle(tx, ty-24, tx-8, ty+12, tx+8, ty+12);                // centre stripe
        g.fillStyle(0x1a1200);
        g.fillRect(tx-7, ty+2, 14, 12);                                      // door
        g.fillStyle(0x4a3800, 0.5);
        g.fillRect(tx, ty+2, 7, 12);                                         // door shading
        // Guy ropes
        g.lineStyle(1, 0x8a7040, 0.5);
        g.lineBetween(tx-26, ty+12, tx-34, ty+20);
        g.lineBetween(tx+26, ty+12, tx+34, ty+20);
    }

    _drawTable(g, px, py) {
        g.fillStyle(0x8b5e30);
        g.fillRect(px-22, py-3, 44, 7);     // tabletop
        g.fillRect(px-26, py+5, 52, 4);     // bench 1
        g.fillRect(px-26, py-11, 52, 4);    // bench 2
        g.fillStyle(0x6b4820);
        g.fillRect(px-18, py-3, 4, 16);     // legs
        g.fillRect(px+14, py-3, 4, 16);
    }

    _drawSiteSign(g, sx, sy, label) {
        g.fillStyle(0x6b3a10); g.fillRect(sx-1, sy, 3, 18);   // post
        g.fillStyle(0xd4b870); g.fillRect(sx-20, sy-14, 40, 14);
        this.add.text(sx, sy-8, label, {
            fontSize: '6px', fill: '#3a1e06', fontFamily: 'monospace'
        }).setDepth(5).setOrigin(0.5);
    }

    _createCampsiteMaple() {
        // Site A — Ben's camp. NW of main road, near cabin spur.
        const cx = 312, cy = 465;
        const g = this.add.graphics().setDepth(3);
        this._drawTent(g, cx-30, cy-30, 0x226688, 0x3388aa);   // blue-grey tent
        this._drawFire(g, cx+40, cy-10);
        this._drawTable(g, cx+5, cy+55);
        this._drawSiteSign(g, cx-5, cy+75, 'SITE A — MAPLE');
        // Lantern post
        g.fillStyle(0x6b4820); g.fillRect(cx+75, cy-40, 4, 36);
        g.fillStyle(0xddcc60, 0.8); g.fillCircle(cx+77, cy-44, 6);
        this.tweens.add({ targets: g, alpha: {from:0.9,to:1}, yoyo:true, repeat:-1, duration:1800 });
    }

    _createCampsitePine() {
        // Site B — Hamilton family. Center-W of north zone.
        const cx = 777, cy = 445;
        const g = this.add.graphics().setDepth(3);
        this._drawTent(g, cx-32, cy-28, 0x884422, 0xaa5533);   // orange tent
        // Second small tent (kids)
        g.fillStyle(0xaacc44, 0.9);
        g.fillTriangle(cx+32, cy-28, cx+14, cy-2, cx+50, cy-2);
        g.fillStyle(0x1a1200); g.fillRect(cx+28, cy-10, 10, 12);
        this._drawFire(g, cx+2, cy+18);
        this._drawTable(g, cx-18, cy+60);
        this._drawSiteSign(g, cx, cy+80, 'SITE B — PINE');
        // Clothesline
        g.lineStyle(1, 0x888870, 0.6);
        g.lineBetween(cx-50, cy-15, cx+65, cy-15);
        [[cx-38,cy-16],[cx-20,cy-16],[cx+2,cy-16],[cx+28,cy-16]].forEach(([hx,hy]) => {
            g.fillStyle(0xcc6644+Math.random()*0x003300|0, 0.7); g.fillRect(hx, hy, 10, 14);
        });
    }

    _createCampsiteBirch() {
        // Site C — Harold, retired ranger. Center of north zone.
        const cx = 1224, cy = 420;
        const g = this.add.graphics().setDepth(3);
        this._drawTent(g, cx-28, cy-26, 0x446644, 0x558855);   // forest green tent
        this._drawFire(g, cx+36, cy-5);
        this._drawTable(g, cx+8, cy+52);
        this._drawSiteSign(g, cx-2, cy+74, 'SITE C — BIRCH');
        // Old ranger gear: axe leaning on tree stub
        g.fillStyle(0x5a3010); g.fillRect(cx-60, cy+10, 4, 30);
        g.fillStyle(0x888888); g.fillTriangle(cx-66, cy+10, cx-56, cy+10, cx-58, cy+25);
        // Coffee pot on fire grate
        g.fillStyle(0x333333); g.fillRect(cx+30, cy-15, 12, 14);
        g.fillStyle(0x555555); g.fillRect(cx+34, cy-20, 4, 6);
    }

    _createCampsiteCedar() {
        // Site D — Mia. NE of north zone, near lake trail.
        const cx = 1683, cy = 445;
        const g = this.add.graphics().setDepth(3);
        this._drawTent(g, cx-30, cy-28, 0x8844aa, 0xaa66cc);   // purple tent
        this._drawFire(g, cx+38, cy-8);
        this._drawTable(g, cx+4, cy+52);
        this._drawSiteSign(g, cx-4, cy+74, 'SITE D — CEDAR');
        // Fairy lights string
        g.lineStyle(1, 0x888860, 0.5);
        g.lineBetween(cx-45, cy-20, cx+68, cy-20);
        for (let lx = cx-40; lx < cx+65; lx += 12) {
            g.fillStyle(0xffff00, 0.6); g.fillCircle(lx, cy-20, 2);
        }
        // Chemistry notebook on table
        g.fillStyle(0x2244aa); g.fillRect(cx-5, cy+45, 14, 18);
        g.fillStyle(0xddddff, 0.7);
        for (let ln = 0; ln < 3; ln++) g.fillRect(cx-2, cy+48+ln*5, 8, 2);
    }

    _createCampsiteOak() {
        // Site E — Group campsite / Counselor Dana. Center of main loop.
        const cx = 860, cy = 1048;
        const g = this.add.graphics().setDepth(3);

        // Large open shelter
        g.fillStyle(0x4a3010); g.fillRect(cx-70, cy-60, 6, 50);   // posts
        g.fillRect(cx+64, cy-60, 6, 50);
        g.fillRect(cx-70, cy-60, 140, 6);                            // roof beam
        g.fillStyle(0x6a4018, 0.6); g.fillRect(cx-70, cy-60, 140, 10); // roof
        // Group fire
        this._drawFire(g, cx-30, cy+28);
        // Three picnic tables
        this._drawTable(g, cx+30, cy-30);
        this._drawTable(g, cx-35, cy-28);
        this._drawTable(g, cx+2, cy+65);
        this._drawSiteSign(g, cx+75, cy-45, 'GROUP SITE E — OAK');
        // Bulletin board on post
        g.fillStyle(0x6b4010); g.fillRect(cx-90, cy-30, 4, 40);
        g.fillStyle(0xddbb88); g.fillRect(cx-102, cy-50, 26, 22);
        g.fillStyle(0x888860); g.fillRect(cx-100, cy-48, 10, 8); g.fillRect(cx-88, cy-48, 10, 8);
        g.fillRect(cx-100, cy-38, 10, 8); g.fillRect(cx-88, cy-38, 10, 8);
    }

    _createCampsiteWillow() {
        // Site F — Frank's wilderness camp. SW, off cave trail.
        const cx = 238, cy = 1614;
        const g = this.add.graphics().setDepth(3);

        // Lean-to shelter instead of dome tent
        g.fillStyle(0x4a3010); g.fillRect(cx-45, cy-30, 4, 42);   // front post
        g.fillRect(cx+35, cy-30, 4, 42);
        g.lineStyle(2, 0x6b4818);
        g.lineBetween(cx-41, cy-30, cx+39, cy-30);                  // ridge pole
        g.fillStyle(0x5a3a10, 0.7);                                  // canvas lean-to
        [[cx-41,cy-30],[cx+39,cy-30],[cx+39,cy+12],[cx-41,cy+12]].forEach((p,i,arr) => {
            if (i===0) return;
            const prev = arr[i-1];
        });
        g.fillTriangle(cx-41, cy-30, cx-41, cy+12, cx+39, cy-30);
        g.fillTriangle(cx+39, cy-30, cx+39, cy+12, cx-41, cy+12);

        this._drawFire(g, cx+6, cy+32);
        this._drawSiteSign(g, cx+50, cy+20, 'SITE F — WILLOW');
        // Survey map pinned to post
        g.fillStyle(0xd4c890); g.fillRect(cx-58, cy-28, 18, 24);
        g.fillStyle(0x888860, 0.6);
        [[cx-54,cy-24,14,2],[cx-54,cy-20,10,2],[cx-54,cy-16,12,2],[cx-54,cy-12,8,2]
        ].forEach(([rx,ry,rw,rh]) => g.fillRect(rx,ry,rw,rh));
        // Artifact crates
        g.fillStyle(0x6b4010); g.fillRect(cx+50, cy+10, 24, 20);
        g.fillStyle(0x8b5818); g.fillRect(cx+52, cy+8, 24, 20);
        g.lineStyle(1, 0x6b4010);
        g.lineBetween(cx+52, cy+18, cx+76, cy+18);
        g.lineBetween(cx+64, cy+8, cx+64, cy+28);
    }

    _createDock() {
        const dx = 1922, dy = 660;
        const g  = this.add.graphics().setDepth(3);
        // Pier planks
        g.fillStyle(0x8b6030);
        g.fillRect(dx-14, dy-8, 28, 90);
        g.fillStyle(0x6b4820);
        for (let py = dy-4; py < dy+86; py += 14) g.fillRect(dx-14, py, 28, 4);
        // Pilings
        g.fillStyle(0x4a2c10);
        [[dx-10,dy+82],[dx+6,dy+82],[dx-10,dy+60],[dx+6,dy+60]].forEach(([px,py]) => g.fillCircle(px, py, 4));
        // Rope post
        g.fillStyle(0x6b4820); g.fillRect(dx+16, dy-8, 5, 30);
        g.lineStyle(1, 0x8a7040, 0.6);
        g.lineBetween(dx+18, dy-6, dx+30, dy+2);
        // Fishing sign
        g.fillStyle(0xddcc80); g.fillRect(dx-22, dy-26, 44, 16);
        this.add.text(dx, dy-18, 'FISHING DOCK', {
            fontSize: '5px', fill: '#3a2010', fontFamily: 'monospace'
        }).setDepth(5).setOrigin(0.5);
        // Physics body for dock edge/pilings
        const b = this.obstacles.create(dx, dy+78, 'pixel');
        b.setVisible(false); b.setDisplaySize(28, 8); b.body.setSize(28, 8); b.refreshBody();
    }

    _createRecArea() {
        const rx = 1260, ry = 1742;
        const g  = this.add.graphics().setDepth(3);
        // Volleyball net posts + net
        g.fillStyle(0x4a3810); g.fillRect(rx-50, ry-4, 5, 40); g.fillRect(rx+45, ry-4, 5, 40);
        g.lineStyle(2, 0xddcc88, 0.8);
        g.lineBetween(rx-48, ry+4, rx+48, ry+4);
        g.lineStyle(1, 0xddcc88, 0.4);
        for (let nx = rx-46; nx < rx+46; nx += 10) g.lineBetween(nx, ry+4, nx+10, ry+30);
        for (let ny = ry+4; ny < ry+30; ny += 8) g.lineBetween(rx-46, ny, rx+46, ny);
        // Horseshoe pit
        g.fillStyle(0x9a8460); g.fillRect(rx+70, ry+10, 36, 28);
        g.fillStyle(0x7a6440); g.fillRect(rx+72, ry+12, 32, 24);
        g.fillStyle(0x8a6030); g.fillCircle(rx+88, ry+24, 3); // stake
        // Ground sign
        g.fillStyle(0x4a6a30); g.fillRect(rx-70, ry-20, 140, 14);
        this.add.text(rx, ry-13, 'REC AREA', {
            fontSize: '7px', fill: '#ccffaa', fontFamily: 'monospace'
        }).setDepth(5).setOrigin(0.5);
    }

    _createFence() {
        // Fence: left x=1860, top y=760, right x=2370, bottom y=1760
        // Gate gap on left wall: y=800–868
        const FL=1860, FT=760, FR=2370, FB=1760;
        const GT=800, GB=868;  // gate top/bottom
        const g = this.add.graphics().setDepth(4);

        // Rails
        g.lineStyle(4, 0x445544, 1);
        g.beginPath(); g.moveTo(FL, FT); g.lineTo(FR, FT); g.strokePath(); // top
        g.beginPath(); g.moveTo(FR, FT); g.lineTo(FR, FB); g.strokePath(); // right
        g.beginPath(); g.moveTo(FL, FB); g.lineTo(FR, FB); g.strokePath(); // bottom
        g.beginPath(); g.moveTo(FL, GB); g.lineTo(FL, FB); g.strokePath(); // left (below gate)

        // Posts every 80px
        g.fillStyle(0x556655);
        for (let x = FL; x <= FR; x += 80) { g.fillRect(x-3, FT-5, 6, 18); g.fillRect(x-3, FB-5, 6, 18); }
        for (let y = GB; y <= FB; y += 80) { g.fillRect(FL-5, y, 10, 6); }
        for (let y = FT; y <= FB; y += 80) { g.fillRect(FR-5, y, 10, 6); }

        // Cross-hatch mesh
        g.lineStyle(1, 0x3a4a3a, 0.35);
        for (let x = FL; x < FR; x += 22) {
            for (let y = FT; y < FB; y += 22) {
                g.beginPath(); g.moveTo(x, y); g.lineTo(x+22, y+22); g.strokePath();
                g.beginPath(); g.moveTo(x+22, y); g.lineTo(x, y+22); g.strokePath();
            }
        }

        // Barbed wire
        g.fillStyle(0x889988, 0.8);
        for (let x = FL+20; x <= FR-20; x += 40) g.fillCircle(x, FT+2, 2);

        // WARNING signs along fence exterior
        g.fillStyle(0xddbb00);
        [[FL+60,FT-6],[FL+220,FT-6],[FL+420,FT-6],[FL+620,FT-6]].forEach(([sx,sy]) => {
            g.fillRect(sx, sy, 50, 12);
            this.add.text(sx+25, sy+5, '⚠ DANGER', {
                fontSize: '5px', fill: '#1a1a00', fontFamily: 'monospace'
            }).setDepth(5).setOrigin(0.5);
        });

        // === Physics bodies ===
        const mk = (x,y,bw,bh) => {
            const b = this.obstacles.create(x,y,'pixel');
            b.setVisible(false); b.setDisplaySize(bw,bh); b.body.setSize(bw,bh); b.refreshBody();
            return b;
        };
        mk(FL+(FR-FL)/2, FT, FR-FL, 8);            // top wall
        mk(FR, FT+(FB-FT)/2, 8, FB-FT);            // right wall
        mk(FL+(FR-FL)/2, FB, FR-FL, 8);            // bottom wall
        mk(FL, (GB+FB)/2, 8, FB-GB);               // left wall below gate

        // Gate visual
        this._gateGfx = this.add.graphics().setDepth(4);
        this._gateGfx.lineStyle(3, 0x889988, 1);
        this._gateGfx.fillStyle(0x445544, 0.5);
        this._gateGfx.fillRect(FL-4, GT, 8, GB-GT);
        this._gateGfx.strokeRect(FL-4, GT, 8, GB-GT);
        this._gateGfx.lineStyle(2, 0x889988, 0.6);
        this._gateGfx.beginPath(); this._gateGfx.moveTo(FL-4, GT); this._gateGfx.lineTo(FL+4, GB); this._gateGfx.strokePath();
        this._gateGfx.beginPath(); this._gateGfx.moveTo(FL+4, GT); this._gateGfx.lineTo(FL-4, GB); this._gateGfx.strokePath();

        // Gate lock
        this._gateLockGfx = this.add.graphics().setDepth(5);
        this._gateLockGfx.fillStyle(0xd4a040);
        const lx = FL-2, ly = GT+(GB-GT)/2;
        this._gateLockGfx.fillRect(lx, ly, 8, 7);
        this._gateLockGfx.lineStyle(2, 0xd4a040);
        this._gateLockGfx.strokeCircle(lx+4, ly, 4);

        // Gate body
        this._gateBody = this.obstacles.create(FL, GT+(GB-GT)/2, 'pixel');
        this._gateBody.setVisible(false);
        this._gateBody.setDisplaySize(8, GB-GT);
        this._gateBody.body.setSize(8, GB-GT);
        this._gateBody.refreshBody();
    }

    _createCampfire() {
        const cx = 352, cy = 479;  // Ben's fire at Maple campsite

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
        const sx = 1830, sy = 750;
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
        const cx = 1848, cy = 842;

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
        const bx = 186, by = 1140;
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
        const cx = 2120, cy = 1162;
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
        const tx = 282, ty = 435;  // Ben's tent at Maple campsite
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

    // ---- NEW MAP SECTIONS ----------------------------------------

    _createIceCreamShack() {
        const sx = 1008, sy = 1725;
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
        // Lake body is drawn in _createGround(). This adds Old Pete + shore details.
        const g = this.add.graphics().setDepth(2);
        // Animated ripple shimmer on lake
        g.fillStyle(0x4a90cc, 0.12);
        for (let ry = 100; ry < 660; ry += 60) {
            g.fillRect(1870, ry, 60 + (ry % 80), 6);
        }
        // Shore reeds along beach
        g.lineStyle(2, 0x4a6030, 0.7);
        [[1828,640],[1834,630],[1840,638],[1848,628],[1858,636],[1865,625],[1872,634]].forEach(([rx,ry]) => {
            g.beginPath(); g.moveTo(rx, ry+20); g.lineTo(rx+2, ry); g.strokePath();
        });
        // Old Pete fisherman figure at dock
        const fx = 2024, fy = 668;
        const fg = this.add.graphics().setDepth(5);
        fg.fillStyle(0x3a5a3a); fg.fillRect(fx, fy, 10, 20);
        fg.fillStyle(0xe8c090); fg.fillRect(fx+1, fy-8, 8, 9);
        fg.fillStyle(0x4a3010); fg.fillRect(fx-2, fy-10, 14, 4);
        fg.fillStyle(0x1a2a1a); fg.fillRect(fx, fy-14, 11, 5);
        fg.lineStyle(1, 0x6b3a18);
        fg.beginPath(); fg.moveTo(fx+10, fy+2); fg.lineTo(fx+34, fy-30); fg.strokePath();
        fg.lineStyle(1, 0x888888, 0.5);
        fg.beginPath(); fg.moveTo(fx+34, fy-30); fg.lineTo(fx+42, fy+2); fg.strokePath();
    }

    _createBulletinBoard() {
        const bx = 456, by = 602;
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
        const cx = 880, cy = 1038;
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
        const dx = 348, dy = 496;
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
        const sx = 166, sy = 338;
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
        // Arrowheads (6) — spread across the larger world
        [
            [165, 432],   // NW forest near cabin
            [492, 760],   // south of main road, west
            [670, 558],   // mid-north zone
            [448, 1456],  // SW area near Frank's camp
            [1784, 896],  // outside facility fence
            [2192, 1284]  // inside facility (needs gate open)
        ].forEach(([x, y], i) => this._placeArtifact(x, y, 'arrowhead', i));

        // Pottery shards (3) — lakes, trails, camp areas
        [
            [204, 750],   // near creek
            [1014, 768],  // center camp area
            [2022, 386]   // lake shore NE
        ].forEach(([x, y], i) => this._placeArtifact(x, y, 'pottery', i));

        // Stone tools (2) — cave trail and south camp
        [
            [318, 1482],  // cave trail area
            [668, 1148]   // south loop area
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
        const cx = 130, cy = 1762;
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
                if (s.collected.has('walking_stick') && s.collected.has('frank_lore_1'))
                    return 'The cave Frank told you about.\nYou use the walking stick to shift the debris.\nThe opening is just wide enough.\n\n[ E ] Enter the cave';
                if (s.collected.has('frank_lore_1'))
                    return 'This is the cave Frank mentioned.\nThe entrance is still blocked.\nYou\'ll need something to shift the rocks — the walking stick might work.';
                return 'A natural cave entrance, half-buried in the hillside.\nBlocked by rocks and years of growth.\nThere\'s cold air coming from inside.\nSomebody has been here before — the stones are too neat to be natural.';
            },
            onInteract: (s) => {
                if (s.collected.has('walking_stick') && s.collected.has('frank_lore_1')) {
                    s._saveGameState();
                    s.cameras.main.fade(900, 0, 0, 0);
                    s.time.delayedCall(950, () => s.scene.start('CaveScene'));
                }
            }
        });
    }

    // ----------------------------------------------------------
    // GAME STATE PERSISTENCE (used when entering/leaving CaveScene)
    // ----------------------------------------------------------

    _saveGameState() {
        window.gameState = {
            collected:     Array.from(this.collected),
            questState:    this.quest.state,
            artifactCounts: { ...this._artifactCounts },
            gateOpen:      this._gateOpen,
            endingPlayed:  this._endingPlayed,
            // Return player near cave entrance
            playerX: 188, playerY: 1740
        };
    }

    _loadFromGameState() {
        const gs = window.gameState;
        if (!gs) return;

        // Restore collections
        this.collected         = new Set(gs.collected);
        this._artifactCounts   = { ...gs.artifactCounts };
        this._gateOpen         = gs.gateOpen;
        this._endingPlayed     = gs.endingPlayed;

        // Restore quest display (QuestTracker was already created fresh)
        if (gs.questState > 0) {
            this.quest.state = gs.questState;
            const label = ['Explore Pinebrook Campground','Investigate the glow near the east fence',
                'Gate is locked. Check the shed on the west path for tools',
                'Use the bolt cutters on the facility gate','Find the source of the signal'][gs.questState] || '';
            if (label) { this.quest.label.setText(label); this.quest._drawBg(label); }
        }

        // Restore player position
        if (gs.playerX) this.player.setPosition(gs.playerX, gs.playerY);

        // Hide bolt cutters if collected
        if (this.collected.has('bolt_cutters') || gs.collected.includes('bolt_cutters')) {
            if (this._boltCuttersGfx)    this._boltCuttersGfx.setVisible(false);
            if (this._boltCuttersGlow)   this._boltCuttersGlow.setVisible(false);
            if (this._boltCuttersMarker) this._boltCuttersMarker.setVisible(false);
        }

        // Hide walking stick raw if taken by Dad
        if (this.collected.has('walking_stick') || this.collected.has('stick_raw')) {
            if (this._stickRawGfx)  this._stickRawGfx.setVisible(false);
            if (this._stickMarker)  this._stickMarker.setVisible(false);
        }

        // Restore walking stick HUD
        if (this.collected.has('walking_stick')) this._showWalkingStickHUD();

        // Hide collected artifacts
        for (const key of this.collected) {
            if (this[`_agfx_${key}`])  this[`_agfx_${key}`].setVisible(false);
            if (this[`_aglow_${key}`]) this[`_aglow_${key}`].setVisible(false);
        }

        // Disable interactables for everything already collected
        for (const obj of this.interactables) {
            if (this.collected.has(obj.id)) obj.disabled = true;
        }

        // Restore open gate
        if (this._gateOpen) {
            if (this._gateBody)     this._gateBody.body.enable = false;
            if (this._gateGfx)      this._gateGfx.setVisible(false);
            if (this._gateLockGfx)  this._gateLockGfx.setVisible(false);
        }
    }
}
