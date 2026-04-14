// ============================================================
// CaveScene.js  —  Cave Level 1: "The Tunnels"
// Entered from the cave entrance in GameScene.
// Reuses player textures and DialogueBox from the main game.
// State persists via window.gameState.
// ============================================================

class CaveScene extends Phaser.Scene {

    constructor() { super({ key: 'CaveScene' }); }

    create() {
        const W = 800, H = 560;
        this.physics.world.setBounds(0, 0, W, H);

        this._actionWasPressed = false;
        this._walkFrame  = 0;
        this._walkTimer  = 0;
        this._footTimer  = 0;
        this._returning  = false;
        // Health
        this._hp      = (window.gameState&&window.gameState.hp    !=null)?window.gameState.hp    :5;
        this._maxHp   = (window.gameState&&window.gameState.maxHp !=null)?window.gameState.maxHp :5;
        this._iframes = 0;
        this._radDmgTimer  = 3000;
        this._darkDmgTimer = 3000;
        // Combat
        this._attacking=false; this._attackTimer=0; this._attackCooldown=0;
        this._attackDir={x:0,y:1}; this._attackWasPressed=false;
        this._enemies=[];

        // ---- World ----
        this._drawCave(W, H);

        // ---- Obstacles ----
        this.obstacles = this.physics.add.staticGroup();
        this._buildWalls(W, H);

        // ---- Player ----
        this.player = this.physics.add.sprite(400, 450, 'player_idle');
        this.player.setCollideWorldBounds(true).setDepth(10);
        this.physics.add.collider(this.player, this.obstacles);

        // ---- Camera ----
        this.cameras.main.setBounds(0, 0, W, H);
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this.cameras.main.fadeIn(1200, 0, 0, 0);

        // ---- UI ----
        this.dialogue = new DialogueBox(this);
        this._heartsHUD = new HeartsHUD(this, this._maxHp);
        this._heartsHUD._hp = this._hp; this._heartsHUD._draw();
        this._attackGfx = this.add.graphics().setDepth(11);
        this._invPanel  = new InventoryPanel(this); this._invWasPressed = false;

        this.interactHint = this.add.text(0, 0, '', {
            fontSize: '9px', fill: '#ccffcc', fontFamily: 'monospace',
            backgroundColor: '#000000cc', padding: { x: 5, y: 3 }
        }).setDepth(50).setVisible(false);

        // ---- Content ----
        this._createAtmosphere();
        this._createCrystalRoom();
        this._buildInteractables();

        // ---- Input ----
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd    = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W, down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A, right: Phaser.Input.Keyboard.KeyCodes.D
        });
        this.eKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.xKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
        this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.iKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I);

        // ---- Radiation zone + enemies ----
        this._radZones = [];
        this._createRadZone(640, 90, 200, 145, 'rect');
        const _qs = (window.gameState&&window.gameState.questState)||0;
        if (_qs >= QUEST_STATES.INSIDE) this._spawnEnemies();

        // ---- Player light (drawn every frame in update) ----
        this._playerLight = this.add.graphics().setDepth(9);

        // ---- Cave depth label ----
        this.add.text(400, 12, 'THE TUNNELS  —  LEVEL 1', {
            fontSize: '8px', fill: '#44664444', fontFamily: 'monospace'
        }).setScrollFactor(0).setDepth(20).setOrigin(0.5, 0);
    }

    // ----------------------------------------------------------
    update(time, delta) {
        const dt = delta || 16;
        const iDown = this.iKey && this.iKey.isDown;
        if (iDown && !this._invWasPressed) { this._invWasPressed = true; this._invPanel.toggle(); }
        if (!iDown) this._invWasPressed = false;
        if (this._invPanel.isOpen()) { this.player.setVelocity(0, 0); return; }
        if (this.dialogue.isVisible()) {
            this.player.setVelocity(0, 0);
            const down = this.eKey.isDown || window.virtualKeys.action;
            if (down && !this._actionWasPressed) { this._actionWasPressed = true; this.dialogue.tryDismiss(); }
            if (!down) this._actionWasPressed = false;
            return;
        }

        const spd = 140;
        const goU = this.cursors.up.isDown    || this.wasd.up.isDown    || window.virtualKeys.up;
        const goD = this.cursors.down.isDown  || this.wasd.down.isDown  || window.virtualKeys.down;
        const goL = this.cursors.left.isDown  || this.wasd.left.isDown  || window.virtualKeys.left;
        const goR = this.cursors.right.isDown || this.wasd.right.isDown || window.virtualKeys.right;

        let vx = 0, vy = 0;
        if (goL) vx = -spd;  if (goR) vx = spd;
        if (goU) vy = -spd;  if (goD) vy = spd;
        if (vx && vy) { vx *= 0.707; vy *= 0.707; }
        this.player.setVelocity(vx, vy);

        if (vx !== 0 || vy !== 0) this._attackDir = {x: vx>0?1:vx<0?-1:0, y: vy>0?1:vy<0?-1:0};

        // Walk animation
        if (vx || vy) {
            this._walkTimer -= dt;
            if (this._walkTimer <= 0) { this._walkTimer = 180; this._walkFrame ^= 1; }
            const tex = (vy < 0 && !vx) ? 'player_back'
                : (this._walkFrame ? 'player_walkA' : 'player_walkB');
            this.player.setTexture(tex);
            if (vx < 0) this.player.setFlipX(true);
            else if (vx > 0) this.player.setFlipX(false);
        } else {
            this.player.setTexture('player_idle');
            this._walkFrame = 0; this._walkTimer = 0;
        }

        // Footsteps
        if (vx || vy) {
            this._footTimer -= dt;
            if (this._footTimer <= 0) {
                this._footTimer = 360;
                if (window.soundManager && window.soundManager.ready) window.soundManager.playFootstep();
            }
        } else { this._footTimer = 0; }

        // Attack
        const col = (window.gameState&&window.gameState.collected)||[];
        const hasWeapon = col.includes('walking_stick') || col.includes('ember_stick');
        const atkDown = (this.xKey&&this.xKey.isDown)||(this.spaceKey&&this.spaceKey.isDown)||window.virtualKeys.attack;
        if (atkDown && !this._attackWasPressed && this._attackCooldown <= 0 && hasWeapon) {
            this._attackWasPressed = true; this._startAttack();
        }
        if (!atkDown) this._attackWasPressed = false;
        if (this._attackCooldown > 0) this._attackCooldown -= dt;
        if (this._attacking) this._updateAttack(dt);

        // iframes flash
        if (this._iframes > 0) { this._iframes -= dt; this.player.setAlpha(Math.sin(this._iframes * 0.025) > 0 ? 1 : 0.3); }
        else this.player.setAlpha(1);

        this._updateEnemies(dt);

        // Player light — radius depends on flashlight
        const hasLight = col.includes('flashlight');
        this._playerLight.clear();
        if (hasLight) {
            this._playerLight.fillStyle(0xffe8a0, 0.18); this._playerLight.fillCircle(this.player.x, this.player.y, 110);
            this._playerLight.fillStyle(0xffd060, 0.10); this._playerLight.fillCircle(this.player.x, this.player.y, 170);
        } else {
            this._playerLight.fillStyle(0xffe8a0, 0.14); this._playerLight.fillCircle(this.player.x, this.player.y, 40);
            // Dark damage without flashlight
            this._darkDmgTimer -= dt;
            if (this._darkDmgTimer <= 0) { this._darkDmgTimer = 3000; this._takeDamage(1); }
        }

        // Radiation zones
        this._checkRadZones(dt);

        // Interact hint
        const near = this._nearest();
        if (near) {
            this.interactHint.setText('[ E ]  ' + near.label);
            this.interactHint.setPosition(near.x - this.interactHint.width / 2, near.y - 44);
            this.interactHint.setVisible(true);
        } else { this.interactHint.setVisible(false); }

        // Action press
        const down = this.eKey.isDown || window.virtualKeys.action;
        if (down && !this._actionWasPressed) {
            this._actionWasPressed = true;
            if (near) this._interact(near);
        }
        if (!down) this._actionWasPressed = false;

        // Exit trigger — bottom of entry shaft
        if (!this._returning && this.player.y > 496 && this.player.x > 348 && this.player.x < 452) {
            this._returnSurface();
        }
    }

    // ----------------------------------------------------------
    _nearest() {
        let best = null, bd = Infinity;
        for (const o of this._objs) {
            if (o.done) continue;
            const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, o.x, o.y);
            if (d <= o.range && d < bd) { bd = d; best = o; }
        }
        return best;
    }

    _interact(obj) {
        const txt = typeof obj.text === 'function' ? obj.text() : obj.text;
        if (!txt) return;
        if (window.soundManager && window.soundManager.ready) window.soundManager.playInteract();
        this.dialogue.show(obj.speaker || '', txt, () => { if (obj.after) obj.after(this); });
    }

    // ----------------------------------------------------------
    _drawCave(W, H) {
        // Background — solid bedrock
        this.add.rectangle(W / 2, H / 2, W, H, 0x060504);

        const g = this.add.graphics().setDepth(1);

        // Entry shaft floor
        g.fillStyle(0x18120e); g.fillRect(348, 440, 104, 120);

        // Main chamber floor — earthy
        g.fillStyle(0x1e1812); g.fillRect(60, 160, 680, 300);

        // Crystal alcove floor — teal tinted
        g.fillStyle(0x0c1a18); g.fillRect(560, 30, 200, 145);

        // Rocky wall texture strips
        g.fillStyle(0x100e0c);
        g.fillRect(0, 0, 60, H);      // left rock
        g.fillRect(740, 0, 60, H);    // right rock
        g.fillRect(0, 0, W, 30);      // top rock
        g.fillRect(0, 440, 348, 120); // bottom-left (sides of entry shaft)
        g.fillRect(452, 440, W-452, 120); // bottom-right
        g.fillRect(0, 140, 560, 30);  // ceiling left of crystal passage

        // Ceiling passage marker (rock arch over crystal alcove entrance)
        g.fillStyle(0x0e0c0a);
        g.fillRect(740, 30, 20, 145); // right side of crystal room wall stub

        // Puddles (dark reflective)
        g.fillStyle(0x0a1820, 0.7);
        [[160,360,70,22],[500,430,90,25],[320,220,55,18],[640,280,50,16]].forEach(([x,y,w,h]) => g.fillEllipse(x,y,w,h));

        // Root tendrils from ceiling
        g.lineStyle(1, 0x2a1a08, 0.5);
        [[120,165,106,215],[250,162,238,208],[380,163,366,230],
         [520,164,510,202],[680,162,672,205],[200,162,192,240]].forEach(([x1,y1,x2,y2]) => {
            g.beginPath(); g.moveTo(x1,y1); g.lineTo(x2,y2); g.strokePath();
        });

        // Crack lines in floor
        g.lineStyle(1, 0x2a2010, 0.25);
        [[100,220,200,260],[380,340,440,310],[560,400,630,380]].forEach(([x1,y1,x2,y2]) => g.lineBetween(x1,y1,x2,y2));

        // Glowing mushroom clusters
        [[175,380,0xbb5500],[210,260,0xcc6600],[560,420,0xaa4400],[660,360,0xcc5500],[420,340,0xbb5000]].forEach(([x,y,col]) => {
            g.fillStyle(col, 0.5); g.fillCircle(x, y, 6);
            g.fillStyle(col, 0.25); g.fillCircle(x, y, 12);
        });

        // Sealed area hint — metal panels along ceiling (drawn as dark gray rectangles)
        g.fillStyle(0x1a2020); g.fillRect(210, 32, 300, 90); // old research console
        g.lineStyle(1, 0x2a3030); g.strokeRect(210, 32, 300, 90);
        g.fillStyle(0x0a1212); g.fillRect(220, 40, 100, 50); // screen
        g.fillStyle(0x001400); g.fillRect(222, 42, 96, 46);  // dark CRT
        g.lineStyle(1, 0x002200, 0.4);
        for (let ly = 46; ly < 86; ly += 6) g.lineBetween(222, ly, 318, ly); // scan lines
        g.fillStyle(0x001100, 0.3); g.fillCircle(320, 88, 4); // dead status light
        g.lineStyle(1, 0x334433);
        g.lineBetween(330, 50, 340, 45); g.lineBetween(340, 60, 352, 55); // knobs

        // SECTOR 7 sealed door — embedded in the ceiling wall at y≈150
        g.fillStyle(0x1c2828); g.fillRect(350, 130, 104, 32);   // door frame
        g.fillStyle(0x141e1e); g.fillRect(354, 133, 96, 26);    // door face
        g.lineStyle(1, 0x2a3838); g.strokeRect(354, 133, 96, 26);
        g.fillStyle(0x243030); g.fillRect(397, 140, 10, 12);    // handle recess
        g.fillStyle(0x0a1414); g.fillRect(399, 141, 6, 10);     // keypad dead
        g.fillStyle(0x550000, 0.7); g.fillCircle(402, 146, 2);  // dead red light
        this.add.text(400, 136, 'SECTOR 7', {
            fontSize: '5px', fill: '#2a4444', fontFamily: 'monospace'
        }).setDepth(5).setOrigin(0.5, 0);

        // Ventilation shaft grate (to the left of the door, at ceiling wall)
        g.fillStyle(0x1a2424); g.fillRect(318, 134, 22, 24);    // shaft frame
        g.lineStyle(1, 0x2a3434, 0.8);
        for (let ly = 136; ly < 156; ly += 5) g.lineBetween(320, ly, 338, ly); // grate bars
        g.lineBetween(329, 134, 329, 158); // vertical bar

        // Entry shaft visual (dark shaft going down)
        g.fillStyle(0x0a0806); g.fillRect(348, 480, 104, 80);
        g.lineStyle(1, 0x3a2a1a, 0.4);
        g.lineBetween(348, 450, 348, 560); g.lineBetween(452, 450, 452, 560);
        this.add.text(400, 472, '▲ SURFACE', {
            fontSize: '7px', fill: '#554433', fontFamily: 'monospace'
        }).setDepth(5).setOrigin(0.5);
    }

    _createAtmosphere() {
        // Drip particles
        const drips = [];
        [[200,164],[420,163],[580,164],[700,163]].forEach(([dx, dy]) => {
            const d = this.add.graphics().setDepth(6);
            drips.push({ g: d, x: dx, y: dy, speed: 0.4 + Math.random() * 0.4 });
        });
        this.time.addEvent({
            delay: 60, loop: true, callback: () => {
                drips.forEach(d => {
                    d.y += d.speed * 2;
                    d.g.clear();
                    if (d.y < 420) {
                        d.g.fillStyle(0x2a4a5a, 0.7); d.g.fillEllipse(d.x, d.y, 3, 5);
                    }
                    if (d.y > 430 + Math.random() * 30) {
                        d.y = 163 + Math.random() * 4;
                        d.x += (Math.random() - 0.5) * 8;
                    }
                });
            }
        });

        // Mushroom pulse tweens
        [[175,380],[210,260],[420,340]].forEach(([mx, my]) => {
            const mg = this.add.graphics().setDepth(3);
            mg.fillStyle(0xff6600, 0.08); mg.fillCircle(mx, my, 22);
            this.tweens.add({ targets: mg, alpha: {from: 0.3, to: 1}, yoyo: true, repeat: -1, duration: 1200 + mx % 500 });
        });
    }

    _createCrystalRoom() {
        const g = this.add.graphics().setDepth(4);
        // Crystal spires
        const spires = [
            [580,130,30],[608,100,40],[636,118,28],[664,90,45],[692,112,32],[718,98,38],[738,125,24]
        ];
        spires.forEach(([cx, cy, h]) => {
            g.fillStyle(0x00bbaa, 0.75);
            g.fillTriangle(cx - 9, cy, cx, cy - h, cx + 9, cy);
            g.fillStyle(0x00ffee, 0.45);
            g.fillTriangle(cx - 3, cy, cx, cy - h + 8, cx + 3, cy);
        });

        // Ambient teal glow
        const glow = this.add.graphics().setDepth(2);
        glow.fillStyle(0x00ccbb, 0.1); glow.fillRect(560, 30, 200, 145);
        this.tweens.add({ targets: glow, alpha: {from: 0.3, to: 0.9}, yoyo: true, repeat: -1, duration: 1800 });

        // One loose shard on the ground
        this._crystalShard = this.add.graphics().setDepth(5);
        this._crystalShard.fillStyle(0x00ffee, 0.8); this._crystalShard.fillTriangle(664, 148, 659, 134, 669, 134);
        this._crystalShard.fillStyle(0xaaffff, 0.5); this._crystalShard.fillTriangle(662, 147, 664, 136, 666, 147);
        this.tweens.add({ targets: this._crystalShard, alpha: {from: 0.6, to: 1}, yoyo: true, repeat: -1, duration: 700 });

        // Hide shard if already collected
        if (window.gameState && window.gameState.collected && window.gameState.collected.includes('cave_crystal_shard')) {
            this._crystalShard.setVisible(false);
        }
    }

    _buildInteractables() {
        this._objs = [
            {
                id: 'backpack', x: 220, y: 375, range: 62, label: 'Examine backpack',
                speaker: 'BACKPACK',
                text: '"PROPERTY OF PINEBROOK NUCLEAR RESERVE\nFIELD SURVEY UNIT 3"\n\nInside: a waterlogged notebook. One page still readable:\n"Day 3. Crystal formations too geometrical.\nNot natural. Unit chief says don\'t ask questions.\nSomebody excavated these tunnels on purpose."'
            },
            {
                id: 'fire_ring', x: 418, y: 418, range: 62, label: 'Examine fire ring',
                speaker: '',
                text: 'A stone fire ring. The charcoal is cold but not ancient.\nSomebody has been sleeping down here.\nA flattened sleeping area in the dirt next to it.\n\nRecently.'
            },
            {
                id: 'research_console', x: 358, y: 88, range: 70, label: 'Examine console',
                speaker: 'TERMINAL',
                text: '[NO POWER]\n\nA research terminal. The casing reads:\n"EMBERLIGHT FIELD STATION B-7"\n\nA handwritten note taped to the screen:\n"If power fails — fall back to Site B.\nDO NOT use north tunnel. — M.C."'
            },
            {
                id: 'crystal_shard', x: 664, y: 140, range: 65, label: 'Examine crystals',
                speaker: '',
                text: () => {
                    const col = window.gameState && window.gameState.collected ? window.gameState.collected : [];
                    return col.includes('cave_crystal_shard')
                        ? 'The crystal formations pulse faintly. Cold and symmetrical.\nDefinitely not natural.'
                        : 'Incredible formations — teal, geometric, cold to the touch.\nOne shard has worked loose. It\'s warm, almost alive.\n\n[You could take it]';
                },
                after: (s) => {
                    if (!window.gameState) return;
                    const col = window.gameState.collected || [];
                    if (!col.includes('cave_crystal_shard')) {
                        col.push('cave_crystal_shard');
                        window.gameState.collected = col;
                        window.gameState.artifactCounts = window.gameState.artifactCounts || {arrowheads:0,pottery:0,tools:0};
                        window.gameState.artifactCounts.pottery =
                            (window.gameState.artifactCounts.pottery || 0) + 1;
                        if (s._crystalShard) s._crystalShard.setVisible(false);
                        s.dialogue.show('', 'You pocketed the crystal shard.\nIt hums faintly in your hand.\n\n[Bonus artifact — Frank will want to see this]');
                    }
                }
            },
            {
                id: 'sealed_door', x: 400, y: 180, range: 72, label: 'Examine sealed door',
                speaker: '',
                text: () => {
                    const col = (window.gameState && window.gameState.collected) || [];
                    const qs  = (window.gameState && window.gameState.questState) || 0;
                    const canEnter = col.includes('frank_lore_3') || col.includes('survey_map') || qs >= QUEST_STATES.DEEP_CAVE;
                    if (qs >= QUEST_STATES.EXPOSED)
                        return 'The signal is out.\nEverything is in motion now.';
                    if (col.includes('facility_log') && qs < QUEST_STATES.DEEP_CAVE)
                        return 'You\'ve already been inside.\n\nDr. Chen\'s log is saved.\nFind Frank. He\'ll know what to do.';
                    if (canEnter)
                        return 'The door is sealed — but beside it, almost hidden by years of mineral growth, a ventilation shaft cover.\nLoose. Corroded.\n\nYou pull it free.\n\n[ You squeeze through into the darkness. ]';
                    return 'A heavy steel door set into the rock.\n"SECTOR 7 — AUTHORIZED PERSONNEL ONLY"\n\nBolted from inside. No power to the keypad.\nSomething important enough to seal permanently.\n\nNot yet. Come back when you know more.';
                },
                after: (s) => {
                    const col = (window.gameState && window.gameState.collected) || [];
                    const qs  = (window.gameState && window.gameState.questState) || 0;
                    const canEnter = col.includes('frank_lore_3') || col.includes('survey_map') || qs >= QUEST_STATES.DEEP_CAVE;
                    if (canEnter && qs < QUEST_STATES.EXPOSED) {
                        s._saveState();
                        s.cameras.main.fade(900, 0, 0, 0);
                        s.time.delayedCall(1000, () => s.scene.start('Sector7Scene'));
                    }
                }
            },
            {
                id: 'exit', x: 400, y: 486, range: 58, label: 'Return to surface',
                speaker: '',
                text: 'The entry shaft. Daylight above.\nYou could head back to the campground.',
                after: (s) => s._returnSurface()
            }
        ];
    }

    _buildWalls(W, H) {
        const add = (x, y, w, h) => {
            const b = this.obstacles.create(x, y, 'pixel');
            b.setVisible(false); b.setDisplaySize(w, h); b.body.setSize(w, h); b.refreshBody();
        };
        add(W/2, 15, W, 30);           // top border
        add(30, H/2, 60, H);           // left border
        add(770, H/2, 60, H);          // right border
        add(174, 500, 348, 120);        // bottom-left (beside entry shaft)
        add(626, 500, 348, 120);        // bottom-right
        add(275, 150, 550, 22);         // ceiling left (blocks sealed area)
        // Ceiling gap is at x:550-740 → crystal alcove passage is open there
        // Small ceiling stub right of crystal alcove
        add(750, 85, 20, 130);          // prevents slipping past right edge
    }

    // --- Combat ---
    _startAttack(){
        if(this._attacking)return;
        this._attacking=true; this._attackTimer=300; this._attackCooldown=500;
        if(window.soundManager&&window.soundManager.ready)window.soundManager.playSwing();
    }
    _updateAttack(delta){
        this._attackTimer-=delta;
        const hx=this.player.x+this._attackDir.x*50, hy=this.player.y+this._attackDir.y*50;
        this._attackGfx.clear();
        const p=1-(this._attackTimer/300), a=p<0.5?p*2:(1-p)*2;
        this._attackGfx.fillStyle(0xd4a840,a*0.7); this._attackGfx.fillRect(hx-20,hy-20,40,40);
        for(const e of this._enemies){
            if(e.isDead||e._hitThisSwing)continue;
            if(Phaser.Math.Distance.Between(hx,hy,e.x,e.y)<50){e._hitThisSwing=true; this._hitEnemy(e);}
        }
        if(this._attackTimer<=0){
            this._attacking=false; this._attackGfx.clear();
            this._enemies.forEach(e=>e._hitThisSwing=false);
        }
    }
    _hitEnemy(e){
        const col=(window.gameState&&window.gameState.collected)||[];
        e.hp-=col.includes('ember_stick')?2:1;
        e.state='STUNNED'; e.stunnedTimer=400;
        if(e.hp<=0)this._killEnemy(e);
    }
    _killEnemy(e){
        e.isDead=true; e.state='DEAD'; drawCreature(e);
        if(window.soundManager&&window.soundManager.ready)window.soundManager.playEnemyDie();
        this.time.delayedCall(500,()=>{e._gfx.destroy(); e._hpGfx.destroy();});
    }
    _spawnEnemies(){
        this._enemies.push(createCreature(this,'CAVE_CRAWLER',200,280));
        this._enemies.push(createCreature(this,'CAVE_CRAWLER',580,300));
    }
    _updateEnemies(delta){
        for(const e of this._enemies){
            const r=updateCreature(e,this.player.x,this.player.y,delta);
            drawCreature(e);
            if(r&&r.dealDamage)this._takeDamage(r.damage);
        }
    }

    // --- Health ---
    _takeDamage(amount){
        if(this._iframes>0)return;
        this._hp=Math.max(0,this._hp-amount);
        this._heartsHUD.setHp(this._hp); this._heartsHUD.flashDamage();
        this.cameras.main.shake(200,0.008);
        if(window.soundManager&&window.soundManager.ready)window.soundManager.playHurt();
        this._iframes=1200;
        if(this._hp<=0)this._handleDeath();
    }
    _handleDeath(){
        if(this._returning)return;
        this._returning=true;
        this.player.setVelocity(0,0);
        this._saveState(); window.gameState.hp=5; window.gameState.maxHp=5;
        this.cameras.main.fade(1200,180,0,0);
        this.time.delayedCall(1400,()=>this.scene.start('GameScene'));
    }

    // --- Radiation ---
    _createRadZone(x,y,w,h,shape){
        const gfx=this.add.graphics().setDepth(2.5);
        gfx.fillStyle(0xff4400,0.08);
        if(shape==='ellipse')gfx.fillEllipse(x,y,w,h); else gfx.fillRect(x-w/2,y-h/2,w,h);
        this.tweens.add({targets:gfx,alpha:{from:0.08,to:0.22},yoyo:true,repeat:-1,duration:1200});
        this._radZones.push({x,y,w,h,shape});
    }
    _checkRadZones(delta){
        const col=(window.gameState&&window.gameState.collected)||[];
        if(col.includes('respirator'))return;
        let inZone=false;
        for(const z of this._radZones){
            const inside=z.shape==='ellipse'
                ?Math.pow((this.player.x-z.x)/(z.w/2),2)+Math.pow((this.player.y-z.y)/(z.h/2),2)<=1
                :(this.player.x>=z.x-z.w/2&&this.player.x<=z.x+z.w/2&&this.player.y>=z.y-z.h/2&&this.player.y<=z.y+z.h/2);
            if(inside){inZone=true;break;}
        }
        if(inZone){
            this._radDmgTimer-=delta;
            if(this._radDmgTimer<=0){this._radDmgTimer=2000;this._takeDamage(1);}
        } else {this._radDmgTimer=Math.max(this._radDmgTimer,500);}
    }

    _saveState(){
        if(!window.gameState)window.gameState={};
        window.gameState.hp    = this._hp;
        window.gameState.maxHp = this._maxHp;
        SaveManager.save(window.gameState);
    }

    _returnSurface() {
        if (this._returning) return;
        this._returning = true;
        this._saveState();
        this.cameras.main.fade(1000, 0, 0, 0);
        // Return to Wilderness — cave entrance is at (634, 898) in WildernessScene
        if (window.gameState) { window.gameState.entryX = 634; window.gameState.entryY = 860; }
        this.time.delayedCall(1100, () => this.scene.start('WildernessScene'));
    }
}
