// ============================================================
// Sector7Scene.js  —  SECTOR 7: The Sealed Reactor Chamber
// Entered from CaveScene when frank_lore_3 is in collected.
// Contains Dr. Chen's terminal — gives facility_log item.
// Returns to CaveScene on exit.
// ============================================================

class Sector7Scene extends Phaser.Scene {

    constructor() { super({ key: 'Sector7Scene' }); }

    create() {
        const W = 800, H = 360;
        this.physics.world.setBounds(0, 0, W, H);

        this._actionWasPressed = false;
        this._walkFrame  = 0;
        this._walkTimer  = 0;
        this._returning  = false;
        this._redPulse   = 0;
        // Health
        this._hp      = (window.gameState&&window.gameState.hp    !=null)?window.gameState.hp    :5;
        this._maxHp   = (window.gameState&&window.gameState.maxHp !=null)?window.gameState.maxHp :5;
        this._iframes = 0;
        this._radDmgTimer = 2000;

        this._drawRoom(W, H);

        this.obstacles = this.physics.add.staticGroup();
        this._buildWalls(W, H);

        // Player enters from the cave tunnel below — starts at bottom center
        createPlayerTextures(this);
        this.player = this.physics.add.sprite(400, 310, 'player_idle');
        this.player.setCollideWorldBounds(true).setDepth(10);
        this.physics.add.collider(this.player, this.obstacles);

        this.cameras.main.setBounds(0, 0, W, H);
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this.cameras.main.fadeIn(1400, 0, 0, 0);

        this.dialogue = new DialogueBox(this);
        this._heartsHUD = new HeartsHUD(this, this._maxHp);
        this._heartsHUD._hp = this._hp; this._heartsHUD._draw();
        this._invPanel  = new InventoryPanel(this); this._invWasPressed = false;

        this.interactHint = this.add.text(0, 0, '', {
            fontSize: '9px', fill: '#ffcccc', fontFamily: 'monospace',
            backgroundColor: '#000000cc', padding: { x: 5, y: 3 }
        }).setDepth(50).setVisible(false);

        this._buildInteractables();
        this._drawTransmitter();

        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys({
            up:    Phaser.Input.Keyboard.KeyCodes.W,
            down:  Phaser.Input.Keyboard.KeyCodes.S,
            left:  Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D
        });
        this.eKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.xKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
        this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.iKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I);

        // Whole-room radiation zone
        this._radZones = [];
        this._createRadZone(400, 180, 800, 360, 'rect');

        // Red emergency light overlay (pulsing — redrawn each frame)
        this._redOverlay = this.add.graphics().setDepth(18);

        // Section label
        this.add.text(400, 12, 'SECTOR 7  —  REACTOR CHAMBER', {
            fontSize: '8px', fill: '#ff440066', fontFamily: 'monospace'
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
            const down = this.eKey.isDown || (window.virtualKeys && window.virtualKeys.action);
            if (down && !this._actionWasPressed) { this._actionWasPressed = true; this.dialogue.tryDismiss(); }
            if (!down) this._actionWasPressed = false;
            return;
        }

        const spd = 130;
        const goU = this.cursors.up.isDown    || this.wasd.up.isDown    || (window.virtualKeys && window.virtualKeys.up);
        const goD = this.cursors.down.isDown  || this.wasd.down.isDown  || (window.virtualKeys && window.virtualKeys.down);
        const goL = this.cursors.left.isDown  || this.wasd.left.isDown  || (window.virtualKeys && window.virtualKeys.left);
        const goR = this.cursors.right.isDown || this.wasd.right.isDown || (window.virtualKeys && window.virtualKeys.right);

        let vx = 0, vy = 0;
        if (goL) vx = -spd;  if (goR) vx = spd;
        if (goU) vy = -spd;  if (goD) vy = spd;
        if (vx && vy) { vx *= 0.707; vy *= 0.707; }
        this.player.setVelocity(vx, vy);

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

        // iframes flash
        if (this._iframes > 0) { this._iframes -= dt; this.player.setAlpha(Math.sin(this._iframes * 0.025) > 0 ? 1 : 0.3); }
        else this.player.setAlpha(1);

        // Red emergency light pulse
        this._redPulse = (this._redPulse + dt * 0.0025) % (Math.PI * 2);
        const rA = 0.05 + Math.sin(this._redPulse) * 0.04;
        this._redOverlay.clear();
        this._redOverlay.fillStyle(0xff1100, rA);
        this._redOverlay.fillRect(0, 0, 800, 360);

        // Radiation zone (whole room)
        this._checkRadZones(dt);

        // Interact hint
        const near = this._nearest();
        if (near) {
            this.interactHint.setText('[ E ]  ' + near.label);
            this.interactHint.setPosition(near.x - this.interactHint.width / 2, near.y - 44);
            this.interactHint.setVisible(true);
        } else { this.interactHint.setVisible(false); }

        const down = this.eKey.isDown || (window.virtualKeys && window.virtualKeys.action);
        if (down && !this._actionWasPressed) {
            this._actionWasPressed = true;
            if (near) this._interact(near);
        }
        if (!down) this._actionWasPressed = false;
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
    _drawRoom(W, H) {
        const g = this.add.graphics().setDepth(1);

        // Floor — dark industrial concrete
        g.fillStyle(0x120e0c); g.fillRect(0, 0, W, H);

        // Concrete panel grid
        g.lineStyle(1, 0x201a18, 0.4);
        for (let x = 0; x < W; x += 100) g.lineBetween(x, 0, x, H);
        for (let y = 0; y < H; y += 80)  g.lineBetween(0, y, W, y);

        // Ceiling — heavy steel beams
        g.fillStyle(0x1a1614); g.fillRect(0, 0, W, 22);
        g.fillStyle(0x2a2420);
        for (let x = 40; x < W; x += 160) g.fillRect(x, 0, 16, 55); // vertical I-beams

        // Emergency light strips along ceiling — dim red
        g.fillStyle(0xff2200, 0.25);
        for (let x = 20; x < W; x += 200) g.fillRect(x, 4, 80, 9);

        // ---- LEFT SIDE: coolant pipe assembly ----
        g.fillStyle(0x283040); g.fillRect(20, 30, 18, H - 60);   // main coolant pipe
        g.fillStyle(0x1e2838); g.fillRect(44, 30, 10, H - 60);   // secondary pipe
        g.fillStyle(0x3a4050); g.fillRect(54, 80, 40, 12);        // horizontal junction
        g.fillStyle(0x3a4050); g.fillRect(54, 160, 40, 12);       // horizontal junction
        g.fillStyle(0x3a4050); g.fillRect(54, 240, 40, 12);       // horizontal junction

        // THE FRACTURED PIPE — greenish coolant leaking
        g.fillStyle(0x1e4030); g.fillRect(54, 130, 60, 14);       // cracked horizontal section
        // Fracture gap (lighter)
        g.fillStyle(0x00aa66, 0.6); g.fillRect(82, 128, 8, 6);
        // Drip trace
        g.fillStyle(0x003322, 0.9); g.fillRect(86, 142, 5, 50);
        // Coolant puddle
        g.fillStyle(0x004422, 0.8); g.fillEllipse(88, 200, 48, 14);
        g.fillStyle(0x00ff88, 0.12); g.fillEllipse(88, 198, 32, 9);

        // Green glow around fracture
        const glowG = this.add.graphics().setDepth(2);
        glowG.fillStyle(0x00ff88, 0.06); glowG.fillCircle(90, 145, 65);
        glowG.fillStyle(0x00ff88, 0.10); glowG.fillCircle(90, 145, 38);
        glowG.fillStyle(0x00ff88, 0.18); glowG.fillCircle(90, 145, 20);

        // Coolant drip animation (handled via tween on a separate graphic)
        this._drip = this.add.graphics().setDepth(3);
        this._dripY = 145;
        this.time.addEvent({ delay: 80, loop: true, callback: () => {
            this._dripY += 2.2;
            this._drip.clear();
            if (this._dripY < 195) {
                this._drip.fillStyle(0x00ff88, 0.5);
                this._drip.fillEllipse(86, this._dripY, 4, 6);
            }
            if (this._dripY > 198) this._dripY = 143 + Math.random() * 4;
        }});

        // ---- CENTER: Reactor Core housing ----
        g.fillStyle(0x1a2230); g.fillRect(280, 25, 200, 90);     // outer housing
        g.fillStyle(0x0e1520); g.fillRect(295, 38, 170, 65);      // inner recess
        // Reactor rods (4 rods)
        const rColors = [0x2a5a40, 0x304a38, 0x265240, 0x2c5038];
        rColors.forEach((c, i) => {
            g.fillStyle(c); g.fillRect(306 + i * 38, 40, 22, 60);
            g.fillStyle(0x003318, 0.4); g.fillRect(308 + i * 38, 42, 18, 56);
        });
        // Status indicators
        g.fillStyle(0xff0000, 0.9); g.fillCircle(310, 114, 5);   // red = CRITICAL
        g.fillStyle(0xff0000, 0.9); g.fillCircle(330, 114, 5);
        g.fillStyle(0x333333);      g.fillCircle(350, 114, 5);   // dark = offline
        g.fillStyle(0x333333);      g.fillCircle(370, 114, 5);
        g.fillStyle(0x333333);      g.fillCircle(390, 114, 5);
        this.add.text(285, 116, '⚠ COOLANT FAILURE — CRITICAL ⚠', {
            fontSize: '6px', fill: '#ff4400', fontFamily: 'monospace'
        }).setDepth(5);

        // ---- CENTER-LEFT: Researcher's desk ----
        g.fillStyle(0x1e1810); g.fillRect(155, 155, 130, 55);    // desktop
        g.fillStyle(0x161410);
        g.fillRect(158, 210, 14, 35); g.fillRect(267, 210, 14, 35); // legs

        // Photo frame on desk
        g.fillStyle(0x2e2418); g.fillRect(162, 133, 34, 28);     // frame
        g.fillStyle(0x3a6070); g.fillRect(165, 136, 28, 22);      // sky
        g.fillStyle(0x2a5040); g.fillRect(165, 147, 28, 11);      // trees/lake
        g.fillStyle(0xffcc88, 0.8); g.fillCircle(174, 143, 2.5); // figure 1
        g.fillStyle(0xffcc88, 0.8); g.fillCircle(182, 144, 2);   // figure 2

        // Papers on desk
        g.fillStyle(0xccc8b8, 0.65);
        g.fillRect(200, 138, 44, 30); g.fillRect(206, 134, 38, 28);
        g.fillStyle(0x888880, 0.4);
        for (let i = 0; i < 5; i++) g.fillRect(209, 138 + i * 5, 30, 2);

        // ---- RIGHT SIDE: Research terminal ----
        g.fillStyle(0x181c28); g.fillRect(580, 60, 110, 150);    // housing
        g.fillStyle(0x0a1020); g.fillRect(592, 72, 86, 105);      // screen bezel
        g.fillStyle(0x000c04); g.fillRect(595, 75, 80, 99);       // screen glass

        // Glowing green terminal text (scanlines + cursor blink)
        g.fillStyle(0x00ff44, 0.35);
        for (let i = 0; i < 8; i++) g.fillRect(598, 80 + i * 11, 74, 2);
        // Warning indicator light
        g.fillStyle(0xff3300, 0.9); g.fillCircle(620, 218, 6);
        g.fillStyle(0xff6600, 0.5); g.fillCircle(620, 218, 10);

        // Keyboard
        g.fillStyle(0x222630); g.fillRect(583, 224, 104, 22);
        g.fillStyle(0x2a2e38);
        for (let c = 0; c < 6; c++) for (let r = 0; r < 2; r++)
            g.fillRect(586 + c * 16, 227 + r * 8, 12, 6);

        // Terminal cursor blink (tween)
        const cursor = this.add.graphics().setDepth(6);
        cursor.fillStyle(0x00ff44, 0.9); cursor.fillRect(598, 160, 6, 10);
        this.tweens.add({ targets: cursor, alpha: { from: 1, to: 0 }, yoyo: true, repeat: -1, duration: 530 });

        // ---- RIGHT SIDE: Filing cabinet ----
        g.fillStyle(0x22262e); g.fillRect(560, 60, 48, 95);
        g.fillStyle(0x2a2e38);
        g.fillRect(563, 68, 42, 26); g.fillRect(563, 99, 42, 26); g.fillRect(563, 130, 42, 20);
        g.fillStyle(0x444850);
        g.fillRect(579, 78, 10, 5); g.fillRect(579, 109, 10, 5); g.fillRect(579, 139, 10, 4);

        // ---- BOTTOM: Entry hatch ----
        g.fillStyle(0x1a1614); g.fillRect(350, H - 48, 100, 48);  // hatch frame
        g.fillStyle(0x100e0c); g.fillRect(354, H - 44, 92, 44);   // hatch opening
        g.fillStyle(0x2a2620); g.fillRect(392, H - 26, 16, 12);   // handle
        this.add.text(400, H - 18, '▼ CAVE', {
            fontSize: '7px', fill: '#554433', fontFamily: 'monospace'
        }).setDepth(5).setOrigin(0.5, 1);
    }

    // ----------------------------------------------------------
    _buildWalls(W, H) {
        const add = (x, y, w, h) => {
            const b = this.obstacles.create(x, y, 'pixel');
            b.setVisible(false); b.setDisplaySize(w, h); b.body.setSize(w, h); b.refreshBody();
        };
        add(W/2, 12, W, 24);       // ceiling
        add(15, H/2, 30, H);        // left wall
        add(785, H/2, 30, H);       // right wall
        // Bottom wall with hatch gap (350-450)
        add(185, H - 12, 330, 24);  // bottom-left of hatch
        add(625, H - 12, 330, 24);  // bottom-right of hatch
        // Equipment collision bodies
        add(91, 145, 56, 16);        // fractured pipe horizontal section
        add(635, 148, 110, 150);     // research terminal
        add(584, 107, 48, 95);       // filing cabinet
        add(382, 90, 200, 90);       // reactor core housing
        add(222, 183, 130, 55);      // researcher's desk
    }

    // ----------------------------------------------------------
    _buildInteractables() {
        const col = () => (window.gameState && window.gameState.collected) || [];

        this._objs = [
            {
                id: 'fractured_pipe', x: 90, y: 175, range: 65, label: 'Examine coolant fracture',
                speaker: '',
                text: () => col().includes('facility_log')
                    ? 'The fractured coolant pipe. Still seeping.\nThis leak has been running for weeks.\nDr. Chen tried to report it. Nobody listened.'
                    : 'A coolant pipe — cracked along a stress line.\nThick green fluid pools below it.\n\nThe smell is chemical. Sharp.\n\nThis has been running for a long time.\nSomeone had to know.'
            },
            {
                id: 'reactor_core', x: 380, y: 95, range: 75, label: 'Check reactor status panel',
                speaker: 'SYSTEM',
                text: 'PINEBROOK NUCLEAR RESERVE\nREACTOR 7 — STATUS REPORT\n\nCoolant loop: OFFLINE  (14d 11h)\nCore temperature: 847°C  [CRITICAL]\nContainment integrity: PARTIAL\nEmergency shutdown: PENDING AUTHORIZATION\n\nAuthorization required: DR. M. CHEN\n[Last access: Day 1 — no entries since]'
            },
            {
                id: 'photo_frame', x: 180, y: 158, range: 58, label: 'Look at the photo',
                speaker: '',
                text: 'A framed photo on the desk.\n\nA woman and two kids at a lake. Smiling.\nSummer clothes. A picnic.\n\nWritten on the back in neat handwriting:\n"Pinebrook Lake, Summer \'98.  Home."\n\nThe same lake. Right above you.\n\nThe lake these pipes drain into.'
            },
            {
                id: 'research_terminal', x: 635, y: 165, range: 72, label: 'Read the terminal',
                speaker: 'DR. M. CHEN',
                text: () => {
                    const c = col();
                    const qs = (window.gameState&&window.gameState.questState)||0;
                    if (!c.includes('facility_log')) {
                        // Grant the item and advance quest
                        if (window.gameState) {
                            if (!window.gameState.collected) window.gameState.collected = [];
                            if (!window.gameState.collected.includes('facility_log'))
                                window.gameState.collected.push('facility_log');
                            window.gameState.questState = Math.max(qs, QUEST_STATES.FOUND_LOG);
                        }
                        return 'PERSONAL LOG — DR. MIRIAM CHEN\n\nDay 12:\nFiled three incident reports. Management:\n"Situation contained. Not your concern."\n\nDay 14:\nCoolant loop offline. I predicted this.\nThey locked me out of the system.\n\nDay 15:\nI left a copy at the ranger station.\nIf you are reading this —\n\nThe lake is poisoned.\n\nGet this out.\n\n[ FACILITY LOG SAVED ]\nFind Frank. He knows what to do.';
                    }
                    if (qs >= QUEST_STATES.DEEP_CAVE)
                        return 'DR. CHEN\'S TERMINAL — log already downloaded.\n\nThe transmitter is in the north corner.\nThe signal will reach the state EPA.\nActivate it.';
                    return 'DR. CHEN\'S TERMINAL — log already read.\n\n"The lake is poisoned.\nGet this out."\n\nFind Frank in the wilderness.';
                }
            },
            {
                id: 'transmitter', x: 120, y: 80, range: 68, label: 'Examine transmitter',
                speaker: 'TRANSMITTER',
                text: () => {
                    const qs = (window.gameState&&window.gameState.questState)||0;
                    if (qs >= QUEST_STATES.EXPOSED)
                        return 'SIGNAL TRANSMITTED.\n\nThe data is broadcasting on emergency\nfrequency 156.8 MHz.\n\nEPA hotline, state EPA, Coast Guard.\nAll receiving.\n\nIt is done.';
                    if (qs >= QUEST_STATES.DEEP_CAVE)
                        return 'An emergency broadcast transmitter.\nDust-covered but functional.\nDr. Chen must have planned for this.\n\nSurvey map shows the antenna is still live.\nFacility log loaded into buffer.\n\n[ TRANSMIT SIGNAL? ]';
                    return 'An emergency transmitter in the corner.\nDust-covered. You\'re not sure what it\'s for yet.\n\nCome back when you know more.';
                },
                after: (s) => {
                    const qs = (window.gameState&&window.gameState.questState)||0;
                    if (qs >= QUEST_STATES.DEEP_CAVE && qs < QUEST_STATES.EXPOSED) {
                        window.gameState.questState = QUEST_STATES.EXPOSED;
                        s._triggerEnding();
                    }
                }
            },
            {
                id: 'filing_cabinet', x: 584, y: 107, range: 60, label: 'Check the filing cabinet',
                speaker: '',
                text: 'Rows of manila folders — all labelled in bureaucratic shorthand.\n\nOne near the front:\n"SECTOR 7 — INCIDENT REPORTS — REDACTED"\n\nEvery page inside is blacked out.\nSTAMPED: CLASSIFIED — INTERNAL USE ONLY\n\nSomeone sanitized this room.\nDr. Chen was smarter than they expected.'
            },
            {
                id: 'exit_hatch', x: 400, y: 340, range: 62, label: 'Return to the tunnels',
                speaker: '',
                text: 'The hatch back to the main cave tunnel.\nDaylight — and the campground — are above.\n\nYou\'ve seen enough.',
                after: (s) => s._returnToCave()
            }
        ];
    }

    // ----------------------------------------------------------
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
        gfx.fillStyle(0xff4400,0.06);
        if(shape==='ellipse')gfx.fillEllipse(x,y,w,h); else gfx.fillRect(x-w/2,y-h/2,w,h);
        this.tweens.add({targets:gfx,alpha:{from:0.06,to:0.18},yoyo:true,repeat:-1,duration:1400});
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
            if(this._radDmgTimer<=0){this._radDmgTimer=3000;this._takeDamage(1);}
        } else {this._radDmgTimer=Math.max(this._radDmgTimer,500);}
    }

    _saveState(){
        if(!window.gameState)window.gameState={};
        window.gameState.hp    = this._hp;
        window.gameState.maxHp = this._maxHp;
        SaveManager.save(window.gameState);
    }

    // --- New ending ---
    _triggerEnding(){
        this._returning=true;
        this.player.setVelocity(0,0);
        this._saveState();
        const seq=[
            ['TRANSMITTER','BROADCAST INITIATED\n\nFrequency: 156.8 MHz\nTarget: EPA Emergency Line, State Office,\nUS Coast Guard Sector 5\n\nData package: FACILITY LOG — 14 DAYS\nStatus: TRANSMITTING...'],
            ['TRANSMITTER','TRANSMISSION COMPLETE\n\nBroadcast ID: NR-PINE-SEC7-001\nReceipt confirmed: 3 agencies\n\nPinebrook Nuclear Reserve — Sector 7\nCoolant breach confirmed.\nLake contamination: DOCUMENTED.\n\nAuthorities en route.'],
            ['','Outside, through the ventilation shaft,\nyou can almost hear the wind off the lake.\n\nSomewhere above, Marcus Cole\'s campfire\nhas gone cold.\n\nBut the signal is out.\nThe lake has a name now.\nAnd names can\'t be unspoken.'],
            ['','PINEBROOK MYSTERY\n\n— COMPLETED —\n\n\nThanks for playing.'],
        ];
        let i=0;
        this.cameras.main.flash(600,0,255,60,false);
        const advance=()=>{
            if(i>=seq.length){
                this.cameras.main.fade(2000,0,0,0);
                this.time.delayedCall(2200,()=>this.scene.start('TitleScene'));
                return;
            }
            this.dialogue.show(seq[i][0],seq[i][1],()=>{i++;advance();});
        };
        this.time.delayedCall(600,()=>advance());
    }

    _drawTransmitter(){
        const tx=120,ty=80;
        const g=this.add.graphics().setDepth(5);
        // Base unit
        g.fillStyle(0x1e2830); g.fillRect(tx-28,ty-18,56,36);
        g.lineStyle(1,0x2a3840); g.strokeRect(tx-28,ty-18,56,36);
        // Screen
        g.fillStyle(0x001800); g.fillRect(tx-22,ty-12,30,24);
        g.fillStyle(0x004400,0.5); for(let ly=ty-10;ly<ty+12;ly+=5)g.fillRect(tx-21,ly,28,2);
        // Status light
        g.fillStyle(0x00ff44,0.9); g.fillCircle(tx+18,ty-8,4);
        this.tweens.add({targets:g,alpha:{from:0.7,to:1},yoyo:true,repeat:-1,duration:800});
        // Antenna
        g.lineStyle(2,0x446655); g.lineBetween(tx+20,ty-18,tx+20,ty-42);
        g.lineStyle(1,0x446655); g.lineBetween(tx+20,ty-42,tx+30,ty-34);
        g.lineStyle(1,0x446655); g.lineBetween(tx+20,ty-42,tx+10,ty-34);
        // Label
        this.add.text(tx,ty+22,'EMRG. TRANSMITTER',{fontSize:'5px',fill:'#446655',fontFamily:'monospace'}).setDepth(6).setOrigin(0.5,0);
    }

    _returnToCave() {
        if (this._returning) return;
        this._returning = true;
        this.cameras.main.fade(1000, 0, 0, 0);
        this.time.delayedCall(1100, () => this.scene.start('CaveScene'));
    }
}
