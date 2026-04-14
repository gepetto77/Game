// ============================================================
// GameScene.js — Camp Central (hub scene)
// World: 1200x900. Transitions:
//   east (NE open path) -> LakeScene
//   south edge          -> WildernessScene
//   east fence gate     -> FacilityScene (needs bolt_cutters)
// ============================================================
class GameScene extends Phaser.Scene {
    constructor() { super({ key: 'GameScene' }); }

    create() {
        const W = 1200, H = 900;
        this.WORLD_W = W; this.WORLD_H = H;

        this.collected         = new Set();
        this._gateOpen         = false;
        this._actionWasPressed = false;
        this._autoQuestZones   = [];
        this._footstepTimer    = 0;
        this._walkFrame        = 0;
        this._walkTimer        = 0;
        this._endingPlayed     = false;
        this._artifactCounts   = { arrowheads: 0, pottery: 0, tools: 0 };
        this._transitioning    = false;
        // Health
        this._hp      = (window.gameState && window.gameState.hp    != null) ? window.gameState.hp    : 5;
        this._maxHp   = (window.gameState && window.gameState.maxHp != null) ? window.gameState.maxHp : 5;
        this._iframes = 0;
        // Combat
        this._attacking      = false;
        this._attackTimer    = 0;
        this._attackCooldown = 0;
        this._attackDir      = { x: 0, y: 1 };
        this._attackWasPressed = false;

        this.physics.world.setBounds(0, 0, W, H);
        const pg = this.make.graphics({ x:0, y:0, add:false });
        pg.fillStyle(0xffffff,1); pg.fillRect(0,0,1,1);
        pg.generateTexture('pixel',1,1); pg.destroy();

        this._createGround(W, H);
        this.obstacles = this.physics.add.staticGroup();
        this._createCabin();
        this._createRegistrationOffice();
        this._createBathHouse();
        this._createShed();
        this._createFacilityFence();
        this._createCampsiteMaple();
        this._createCampsitePine();
        this._createTrees();
        this._createBushes();
        this._createBulletinBoard();
        this._createDad();
        this._createSpecialStick();
        this._createBoltCutters();
        this._createExitMarkers();

        createPlayerTextures(this);
        this._createPlayer();
        this.cameras.main.setBounds(0, 0, W, H);
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this.cameras.main.fadeIn(800, 0, 0, 0);
        this.physics.add.collider(this.player, this.obstacles);

        this.dialogue    = new DialogueBox(this);
        this.quest       = new QuestTracker(this);
        this._heartsHUD  = new HeartsHUD(this, this._maxHp);
        this._heartsHUD._hp = this._hp;
        this._heartsHUD._draw();
        this._attackGfx  = this.add.graphics().setDepth(11);
        this._invPanel   = new InventoryPanel(this);
        this._invWasPressed = false;

        this._buildInteractables();
        this._createArtifacts();
        this._setupInput();

        this.interactHint = this.add.text(0, 0, '', {
            fontSize: '9px', fill: '#ffffff', fontFamily: 'monospace',
            backgroundColor: '#000000bb', padding: { x:5, y:3 }
        }).setDepth(50).setVisible(false);

        if (window.gameState) this._loadFromGameState();
    }

    update(time, delta) {
        const dt = delta || 16;
        // Inventory panel toggle
        const iDown = this.iKey && this.iKey.isDown;
        if (iDown && !this._invWasPressed) { this._invWasPressed = true; this._invPanel.toggle(); }
        if (!iDown) this._invWasPressed = false;
        if (this._invPanel.isOpen()) { this.player.setVelocity(0, 0); return; }
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
        if (goLeft)  vx = -speed; if (goRight) vx =  speed;
        if (goUp)    vy = -speed; if (goDown)  vy =  speed;
        if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }
        this.player.setVelocity(vx, vy);

        // Track last facing direction for attack hitbox
        if (vx !== 0 || vy !== 0) {
            this._attackDir = {
                x: vx > 0 ? 1 : vx < 0 ? -1 : 0,
                y: vy > 0 ? 1 : vy < 0 ? -1 : 0
            };
        }

        if (vx !== 0 || vy !== 0) {
            this._walkTimer -= dt;
            if (this._walkTimer <= 0) { this._walkTimer = 180; this._walkFrame = this._walkFrame === 0 ? 1 : 0; }
            const tex = (vy < 0 && vx === 0) ? 'player_back' : (this._walkFrame === 0 ? 'player_walkA' : 'player_walkB');
            this.player.setTexture(tex);
            if (vx < 0) this.player.setFlipX(true); else if (vx > 0) this.player.setFlipX(false);
        } else {
            this.player.setTexture('player_idle');
            this._walkFrame = 0; this._walkTimer = 0;
        }

        if (vx !== 0 || vy !== 0) {
            this._footstepTimer -= dt;
            if (this._footstepTimer <= 0) {
                this._footstepTimer = 340;
                if (window.soundManager && window.soundManager.ready) window.soundManager.playFootstep();
            }
        } else { this._footstepTimer = 0; }

        // Attack input (B button / X key / Space)
        const attackDown = (this.xKey && this.xKey.isDown) || (this.spaceKey && this.spaceKey.isDown) || window.virtualKeys.attack;
        const col = Array.from(this.collected);
        if (attackDown && !this._attackWasPressed && this._attackCooldown <= 0
                && (col.includes('walking_stick') || col.includes('ember_stick'))) {
            this._attackWasPressed = true;
            this._startAttack();
        }
        if (!attackDown) this._attackWasPressed = false;
        if (this._attackCooldown > 0) this._attackCooldown -= dt;
        if (this._attacking) this._updateAttack(dt);

        // Invincibility frames + player flash
        if (this._iframes > 0) {
            this._iframes -= dt;
            this.player.setAlpha(Math.sin(this._iframes * 0.025) > 0 ? 1 : 0.3);
        } else {
            this.player.setAlpha(1);
        }

        const nearest = this._nearestInteractable();
        if (nearest) {
            this.interactHint.setText('[ E ] ' + (nearest.hintLabel || 'Examine'));
            this.interactHint.setPosition(nearest.x - this.interactHint.width / 2, nearest.y - 42);
            this.interactHint.setVisible(true);
        } else { this.interactHint.setVisible(false); }

        this._handleActionPress(() => { if (nearest) this._triggerInteraction(nearest); });
        this._checkAutoZones();
        this._checkExits();
    }

    // ----------------------------------------------------------
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
        const isFirstClue = obj.id === 'facility_sign' && !this.quest.atLeast('NEED_TOOL');
        if (isFirstClue) {
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
            const inside = px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h;
            if (inside) {
                z.triggered = true;
                this.quest.advance(typeof z.questState === 'string' ? QUEST_STATES[z.questState] : z.questState);
            }
        }
    }

    _checkExits() {
        if (this._transitioning || this.dialogue.isVisible()) return;
        const px = this.player.x, py = this.player.y;
        // East open path (NE corner, above fence) -> Lake
        if (px > 1175 && py < 295) { this._goToScene('LakeScene', 32, py); return; }
        // East past open gate -> Facility
        if (px > 1175 && py >= 295 && this._gateOpen) { this._goToScene('FacilityScene', 32, 300); return; }
        // South edge -> Wilderness
        if (py > 882) { this._goToScene('WildernessScene', px, 32); }
    }

    _goToScene(key, entryX, entryY) {
        if (this._transitioning) return;
        this._transitioning = true;
        this.player.setVelocity(0, 0);
        this._saveGameState();
        window.gameState.entryX = entryX;
        window.gameState.entryY = entryY;
        this.cameras.main.fade(600, 0, 0, 0);
        this.time.delayedCall(650, () => this.scene.start(key));
    }

    _setupInput() {
        this.cursors  = this.input.keyboard.createCursorKeys();
        this.wasd     = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W, down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A, right: Phaser.Input.Keyboard.KeyCodes.D
        });
        this.eKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.xKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
        this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.iKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    }

    // ----------------------------------------------------------
    // COMBAT
    // ----------------------------------------------------------
    _startAttack() {
        if (this._attacking) return;
        this._attacking     = true;
        this._attackTimer   = 300;
        this._attackCooldown = 500;
        if (window.soundManager && window.soundManager.ready) window.soundManager.playSwing();
    }

    _updateAttack(delta) {
        this._attackTimer -= delta;
        const px = this.player.x, py = this.player.y;
        const dx = this._attackDir.x, dy = this._attackDir.y;
        const hx = px + dx * 50, hy = py + dy * 50;

        // Visual swing arc
        this._attackGfx.clear();
        const progress = 1 - (this._attackTimer / 300);
        const alpha = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
        this._attackGfx.fillStyle(0xd4a840, alpha * 0.7);
        this._attackGfx.fillRect(hx - 20, hy - 20, 40, 40);

        if (this._attackTimer <= 0) {
            this._attacking = false;
            this._attackGfx.clear();
        }
    }

    // ----------------------------------------------------------
    // HEALTH
    // ----------------------------------------------------------
    _takeDamage(amount) {
        if (this._iframes > 0) return;
        this._hp = Math.max(0, this._hp - amount);
        this._heartsHUD.setHp(this._hp);
        this._heartsHUD.flashDamage();
        this.cameras.main.shake(200, 0.008);
        if (window.soundManager && window.soundManager.ready) window.soundManager.playHurt();
        this._iframes = 1200;
        if (this._hp <= 0) this._handleDeath();
    }

    _handleDeath() {
        if (this._transitioning) return;
        this._transitioning = true;
        this.player.setVelocity(0, 0);
        this._saveGameState();
        window.gameState.hp    = 5;
        window.gameState.maxHp = 5;
        this.cameras.main.fade(1200, 180, 0, 0);
        this.time.delayedCall(1400, () => this.scene.start('GameScene'));
    }

    // ----------------------------------------------------------
    // INTERACTABLES
    // ----------------------------------------------------------
    _buildInteractables() {
        this.interactables = [
            { id:'campfire',  x:242, y:424, range:60,  hintLabel:'Examine',   speaker:'',
              text:'The fire is still warm. Ash not cold. Someone lit this very recently.' },
            { id:'mug',       x:212, y:438, range:48,  hintLabel:'Examine',   speaker:'',
              text:'A tin mug — half-full of cold coffee. Whoever left it didn\'t plan to be long.' },
            { id:'tent',      x:186, y:468, range:55,  hintLabel:'Look inside', speaker:'',
              text:'Small dome tent. Sleeping bag unzipped. Dead flashlight. Nobody has been back.' },
            { id:'cabin', x:130, y:222, range:58, hintLabel:'Try door', speaker:'',
              getText:(s) => {
                  if (s.collected.has('flashlight')) return 'The cabin is open. You\'ve already taken the flashlight.';
                  if (s.collected.has('cabin_key'))  return '...';
                  if (s.collected.has('bolt_cutters')) return 'The cabin is padlocked with a keyed lock — bolt cutters won\'t fit.';
                  return 'Padlocked. Hand-painted sign: RANGERS ONLY. The curtains are drawn.';
              },
              onInteract:(s) => {
                  if (s.collected.has('cabin_key') && !s.collected.has('flashlight')) {
                      s.collected.delete('cabin_key'); s.collected.add('flashlight');
                      s._showFlashlightHUD();
                      s.dialogue.show('', 'Inside: a ranger\'s desk, maps on the wall.\nA heavy flashlight on the shelf.\n\n[ You took the flashlight ]');
                  }
              }},
            { id:'shed', x:130, y:752, range:58, hintLabel:'Examine', speaker:'',
              text:'Maintenance shed. Locked. Through the gap: tools, rope, a rusted paint can.' },
            { id:'bolt_cutters', x:138, y:785, range:72, hintLabel:'Take', speaker:'',
              getText:() => 'Heavy bolt cutters leaning against the shed wall. Red grips, rusted jaw.',
              onInteract:(s) => {
                  s.collected.add('bolt_cutters');
                  if (s._boltGfx)   s._boltGfx.setVisible(false);
                  if (s._boltGlow)  s._boltGlow.setVisible(false);
                  s.interactables.find(o => o.id==='bolt_cutters').disabled = true;
                  s.quest.advance(QUEST_STATES.HAS_TOOL);
              }},
            { id:'bulletin_board', x:370, y:348, range:68, hintLabel:'Read board', speaker:'BULLETIN BOARD',
              text:'PINEBROOK CAMPGROUND — WELCOME!\nSite map at the entrance.\nReport wildlife to the ranger cabin.\n\n[sticky note]\n"Has anyone seen my bolt cutters?\nLeft them by the shed. — SITE 4"' },
            { id:'picnic_note', x:580, y:540, range:58, hintLabel:'Read note', speaker:'NOTE',
              text:'"Marcus — stay at site 4.\nI checked Sector 7 this morning.\nSomething\'s wrong with the east containment wall.\nDon\'t touch anything. — R.D."' },
            { id:'facility_sign', x:1052, y:248, range:70, hintLabel:'Read', speaker:'SIGN',
              text:'DANGER — RADIATION\nRESTRICTED AREA — PINEBROOK NUCLEAR RESERVE\nNo trespassing. Authorized personnel only.',
              onInteract:(s) => { if (!s.quest.atLeast('NEED_TOOL')) s.quest.advance(QUEST_STATES.NEED_TOOL); } },
            { id:'facility_gate', x:1038, y:388, range:60, hintLabel:'Examine', speaker:'',
              getText:(s) => s.collected.has('bolt_cutters')
                ? 'You slip the jaws around the shackle and squeeze.\n*SNAP*\nThe padlock drops. The gate groans open.'
                : 'Chain-link gate. Heavy padlock. Need something to cut it.',
              onInteract:(s) => { if (!s._gateOpen && s.collected.has('bolt_cutters')) s._openGate(); } },
            // Dad + walking-stick quest
            { id:'dad', x:268, y:475, range:68, hintLabel:'Talk to Dad', speaker:'DAD',
              getText:(s) => {
                  if (s.collected.has('walking_stick'))
                      return 'Treat that stick well.\nYour grandfather had one just like it.';
                  if (s.collected.has('stick_raw'))
                      return 'Hey — let me see that one.\n...\nGood piece of wood. Give me a few minutes.';
                  return 'Hey explorer!\nListen — grab me some good sticks for the fire?\nWander toward the north trail.';
              },
              onInteract:(s) => {
                  if (s.collected.has('stick_raw') && !s.collected.has('walking_stick')) {
                      s.time.delayedCall(400, () => {
                          s.dialogue.show('DAD',
                              '*takes out his knife and works quietly*\n\n...\n\nHere.\nI carved your name into it.\nEvery explorer needs a good walking stick.',
                              () => {
                                  s.collected.delete('stick_raw'); s.collected.add('walking_stick');
                                  if (s._stickGfx) s._stickGfx.setVisible(false);
                                  s._showWalkingStickHUD();
                              });
                      });
                  }
              }},
            { id:'special_stick', x:76, y:325, range:58, hintLabel:'Pick up', speaker:'',
              getText:(s) => (s.collected.has('stick_raw')||s.collected.has('walking_stick'))
                  ? '(You already have the good stick.)'
                  : 'A gnarled branch, half-buried in the moss.\nHeavier than it looks. The grain spirals.',
              onInteract:(s) => {
                  if (!s.collected.has('stick_raw') && !s.collected.has('walking_stick')) {
                      s.collected.add('stick_raw');
                      s.interactables.find(o=>o.id==='special_stick').disabled = true;
                      if (s._stickGfx) s._stickGfx.setVisible(false);
                      s.dialogue.show('','You picked up the stick.\nMaybe Dad would know what to do with it.');
                  }
              }},
            { id:'reg_clerk', x:490, y:162, range:65, hintLabel:'Talk', speaker:'CAMP CLERK',
              getText:(s) => {
                  if (s.collected.has('flashlight') || s.collected.has('cabin_key'))
                      return 'You found the key. The cabin is yours — Ranger Thompson would understand.';
                  if (s.quest.atLeast('DISCOVERED_CLUE'))
                      return 'You\'ve seen the fence, haven\'t you.\n...\nHere — ranger cabin key.\nThompson kept a flashlight in there.\nYou might need it.';
                  if (s.quest.atLeast('INSIDE'))
                      return 'The ranger still hasn\'t checked in. Whatever you found — please be careful.';
                  return 'Welcome to Pinebrook! Ranger Thompson hasn\'t checked in for two days.\nProbably on patrol... probably.';
              },
              onInteract:(s) => {
                  if (s.quest.atLeast('DISCOVERED_CLUE') && !s.collected.has('cabin_key') && !s.collected.has('flashlight')) {
                      s.collected.add('cabin_key');
                      s.dialogue.show('CAMP CLERK', '*slides a small key across the counter*\nRanger cabin — northwest corner. Take care.');
                  }
              }},
            { id:'dave_hamilton', x:638, y:435, range:65, hintLabel:'Talk', speaker:'DAVE (SITE B)',
              getText:(s) => s.quest.atLeast('INSIDE')
                  ? 'You were inside the compound? My wife\'s been getting headaches all week.\nIf you found proof — make sure people know.'
                  : s.quest.atLeast('DISCOVERED_CLUE')
                  ? 'You noticed that fence too? The water tastes metallic. My kids won\'t drink it.'
                  : 'Beautiful spot, but my kids won\'t drink the tap water.\nTastes metallic. Old pipes, maybe.' },
        ];

        this._autoQuestZones = [{
            x:840, y:240, w:220, h:280,
            questState: QUEST_STATES.DISCOVERED_CLUE, triggered: false
        }];
    }

    _openGate() {
        if (this._gateOpen) return;
        this._gateOpen = true;
        if (this._gateBody)    this._gateBody.body.enable = false;
        if (this._gateGfx)     this._gateGfx.setVisible(false);
        if (this._gateLockGfx) this._gateLockGfx.setVisible(false);
        const go = this.interactables.find(o => o.id === 'facility_gate');
        if (go) go.disabled = true;
        this.cameras.main.flash(300, 255, 255, 200, false);
        if (window.soundManager && window.soundManager.ready) window.soundManager.playInteract();
        this.quest.advance(QUEST_STATES.INSIDE);
    }

    // ----------------------------------------------------------
    // MAP CREATION
    // ----------------------------------------------------------
    _createGround(w, h) {
        const g = this.add.graphics();
        // Base grass
        g.fillStyle(0x3d6b2e); g.fillRect(0, 0, w, h);
        // NW dark forest block (behind cabin)
        g.fillStyle(0x1e3812); g.fillRect(0, 0, 220, 280);
        // Lighter clearings
        g.fillStyle(0x4a7a35);
        [[190,380,170,90],[480,370,160,80],[620,480,130,65],[750,340,120,55]].forEach(([x,y,pw,ph])=>g.fillRect(x,y,pw,ph));
        // Darker patches
        g.fillStyle(0x2d5a22);
        [[90,290,140,80],[330,420,130,70],[540,290,120,60],[680,400,110,55],[200,640,150,80],[400,700,120,60]].forEach(([x,y,pw,ph])=>g.fillRect(x,y,pw,ph));
        // East facility zone (behind fence) - sickly tint
        g.fillStyle(0x252f1a); g.fillRect(1040, 300, 160, 600);

        // Paths - sandy dirt
        const P = 0x9a8a68, PE = 0xb09a78;
        g.fillStyle(P);
        g.fillRect(50, 308, 1000, 38);   // main E-W road
        g.fillRect(50, 100, 40, 808);    // left N-S road
        g.fillRect(50, 308, 40, 578);    // left road extension south
        g.fillRect(90, 308, 180, 38);    // site-A branch connector
        g.fillRect(228, 346, 38, 115);   // site-A spur down
        g.fillRect(495, 346, 38, 100);   // site-B spur down
        g.fillRect(780, 308, 38, 180);   // bath house spur
        g.fillRect(50, 790, 900, 40);    // south exit road
        g.fillRect(50, 710, 40, 120);    // left road to south
        // Lake trail (NE open path)
        g.fillStyle(0x8a9a70); // greener trail toward lake
        g.fillRect(900, 200, 300, 38);   // NE trail east
        g.fillRect(900, 100, 38, 140);   // NE trail connecting
        // Path highlights
        g.fillStyle(PE, 0.3);
        g.fillRect(50, 306, 1000, 4);
        g.fillRect(50, 344, 1000, 4);

        // Sandy gravel at junctions
        g.fillStyle(0x8a7a58, 0.55);
        g.fillEllipse(90, 327, 55, 35);
        g.fillEllipse(270, 327, 45, 30);
        g.fillEllipse(534, 327, 45, 30);

        // Lake path indicator (NE corner open area, lighter grass)
        g.fillStyle(0x5a8a40); g.fillRect(950, 0, 250, 300);
        g.fillStyle(0x6a9a50); g.fillRect(990, 0, 210, 180);
    }

    _createCabin() {
        const x = 64, y = 82;
        const g = this.add.graphics().setDepth(4);
        // Shadow
        g.fillStyle(0x000000, 0.18); g.fillRect(x+8, y+106, 132, 14);
        // Log walls
        g.fillStyle(0x6b4c2a); g.fillRect(x, y, 140, 108);
        // Log texture lines
        g.lineStyle(1, 0x523a20, 0.5);
        for (let ly = y+10; ly < y+108; ly += 12) g.lineBetween(x, ly, x+140, ly);
        // Roof
        g.fillStyle(0x8b3a2a); g.fillTriangle(x-10, y, x+70, y-36, x+150, y);
        g.fillStyle(0xa04030, 0.4); g.fillTriangle(x+10, y, x+70, y-28, x+130, y);
        // Window
        g.fillStyle(0xc8e8f0); g.fillRect(x+20, y+22, 30, 24);
        g.lineStyle(2, 0x523a20); g.strokeRect(x+20, y+22, 30, 24);
        g.lineStyle(1, 0x8abecc); g.lineBetween(x+35, y+22, x+35, y+46); g.lineBetween(x+20, y+34, x+50, y+34);
        // Door
        g.fillStyle(0x3a2810); g.fillRect(x+54, y+66, 32, 42);
        g.lineStyle(2, 0x523a20); g.strokeRect(x+54, y+66, 32, 42);
        g.fillStyle(0xd4a840); g.fillCircle(x+80, y+88, 3);
        // Sign
        this.add.text(x+70, y+12, 'RANGERS ONLY', {
            fontSize:'7px', fill:'#ffe090', fontFamily:'monospace'
        }).setDepth(5).setOrigin(0.5);
        // Collision
        const mk = (bx,by,bw,bh) => { const b=this.obstacles.create(bx+bw/2,by+bh/2,'pixel'); b.setDisplaySize(bw,bh); b.refreshBody(); };
        mk(x,y,140,108);
    }

    _createRegistrationOffice() {
        const x = 380, y = 62;
        const g = this.add.graphics().setDepth(4);
        g.fillStyle(0x000000, 0.15); g.fillRect(x+8, y+130, 220, 14);
        g.fillStyle(0xe8d8a8); g.fillRect(x, y, 220, 130);
        g.lineStyle(2, 0xc8b888); g.strokeRect(x, y, 220, 130);
        // Roof
        g.fillStyle(0x6a7a4a); g.fillRect(x-6, y-14, 232, 20);
        g.lineStyle(1, 0x5a6a3a); g.strokeRect(x-6, y-14, 232, 20);
        // Windows x2
        [[x+20,y+28],[x+140,y+28]].forEach(([wx,wy])=>{
            g.fillStyle(0xb8ddf0); g.fillRect(wx,wy,44,34);
            g.lineStyle(2,0xc8b888); g.strokeRect(wx,wy,44,34);
            g.lineStyle(1,0x8abecc); g.lineBetween(wx+22,wy,wx+22,wy+34); g.lineBetween(wx,wy+17,wx+44,wy+17);
        });
        // Door
        g.fillStyle(0x8a6a3a); g.fillRect(x+88, y+78, 44, 52);
        g.lineStyle(2, 0xc8b888); g.strokeRect(x+88, y+78, 44, 52);
        g.fillStyle(0xd4a840); g.fillCircle(x+126, y+104, 3);
        this.add.text(x+110, y+16, 'REGISTRATION', {fontSize:'7px',fill:'#6a4a1a',fontFamily:'monospace'}).setDepth(5).setOrigin(0.5);
        this.add.text(x+110, y+26, 'OFFICE', {fontSize:'7px',fill:'#6a4a1a',fontFamily:'monospace'}).setDepth(5).setOrigin(0.5);
        const mk=(bx,by,bw,bh)=>{const b=this.obstacles.create(bx+bw/2,by+bh/2,'pixel');b.setDisplaySize(bw,bh);b.refreshBody();};
        mk(x,y,220,130);
    }

    _createBathHouse() {
        const x = 762, y = 432;
        const g = this.add.graphics().setDepth(4);
        g.fillStyle(0x000000,0.12); g.fillRect(x+6,y+108,148,12);
        g.fillStyle(0xb8c8a8); g.fillRect(x,y,148,108);
        g.lineStyle(2,0x909880); g.strokeRect(x,y,148,108);
        g.fillStyle(0x6a7860); g.fillRect(x-4,y-12,156,18);
        g.fillStyle(0xa8b898,0.5);
        for(let bx=x;bx<x+148;bx+=18) g.fillRect(bx,y,16,108);
        // Two doors
        [[x+18,y+62,'M'],[x+88,y+62,'W']].forEach(([dx,dy,lbl])=>{
            g.fillStyle(0x556655); g.fillRect(dx,dy,32,46);
            g.lineStyle(1,0x909880); g.strokeRect(dx,dy,32,46);
            this.add.text(dx+16,dy+23,lbl,{fontSize:'10px',fill:'#ccffcc',fontFamily:'monospace'}).setDepth(5).setOrigin(0.5);
        });
        const mk=(bx,by,bw,bh)=>{const b=this.obstacles.create(bx+bw/2,by+bh/2,'pixel');b.setDisplaySize(bw,bh);b.refreshBody();};
        mk(x,y,148,108);
    }

    _createShed() {
        const x = 62, y = 658;
        const g = this.add.graphics().setDepth(4);
        g.fillStyle(0x000000,0.15); g.fillRect(x+6,y+88,128,12);
        g.fillStyle(0x7a6a4a); g.fillRect(x,y,128,88);
        g.lineStyle(2,0x5a4a2a); g.strokeRect(x,y,128,88);
        g.fillStyle(0x8a5a2a); g.fillRect(x-4,y-10,136,16);
        g.fillStyle(0x5a4a2a,0.4);
        for(let sy=y+12;sy<y+88;sy+=14) g.lineBetween(x,sy,x+128,sy);
        g.fillStyle(0x3a2a10); g.fillRect(x+44,y+46,40,42);
        g.lineStyle(2,0x5a4a2a); g.strokeRect(x+44,y+46,40,42);
        this.add.text(x+64,y+12,'MAINTENANCE',{fontSize:'6px',fill:'#c8a870',fontFamily:'monospace'}).setDepth(5).setOrigin(0.5);
        const mk=(bx,by,bw,bh)=>{const b=this.obstacles.create(bx+bw/2,by+bh/2,'pixel');b.setDisplaySize(bw,bh);b.refreshBody();};
        mk(x,y,128,88);
    }

    _createFacilityFence() {
        const FX = 1030, FT = 300, FB = 900;
        const GT = 362, GB = 418; // gate gap
        const mk = (bx,by,bw,bh) => {
            const b = this.obstacles.create(bx,by,'pixel');
            b.setDisplaySize(bw,bh); b.refreshBody(); return b;
        };
        const g = this.add.graphics().setDepth(4);
        // Fence posts and chain-link pattern
        const drawFence = (x1,y1,x2,y2) => {
            g.lineStyle(3, 0x808060); g.lineBetween(x1,y1,x2,y2);
            g.lineStyle(1, 0x909870, 0.6);
            if (y1===y2) { // horizontal
                for(let fx=x1;fx<x2;fx+=12) { g.lineBetween(fx,y1-8,fx+6,y1+8); g.lineBetween(fx+6,y1-8,fx,y1+8); }
            } else { // vertical
                for(let fy=y1;fy<y2;fy+=12) { g.lineBetween(x1-8,fy,x1+8,fy+6); g.lineBetween(x1-8,fy+6,x1+8,fy); }
            }
            // Posts every 40px
            g.fillStyle(0x707058);
            if(y1===y2){for(let fx=x1;fx<=x2;fx+=40){g.fillRect(fx-3,y1-12,6,24);}}
            else{for(let fy=y1;fy<=y2;fy+=40){g.fillRect(x1-3,fy-3,6,24);}}
        };
        // Top horizontal fence (marks boundary)
        drawFence(FX-40, FT, 1200, FT);
        // Vertical fence south half (below gate gap)
        drawFence(FX, GT-8, FX, FT);   // above gate
        drawFence(FX, GB, FX, FB);     // below gate
        mk(FX, FT+(GT-FT)/2, 10, GT-FT); // collision above gate
        mk(FX, (GB+FB)/2, 10, FB-GB);    // collision below gate
        mk((FX+1200)/2, FT, 170+FX > 1200 ? 1200-FX : 170, 10); // top wall

        // Gate (closed by default)
        this._gateGfx = this.add.graphics().setDepth(4);
        this._gateGfx.lineStyle(4, 0xa08040); this._gateGfx.lineBetween(FX,GT,FX,GB);
        this._gateGfx.lineStyle(1, 0xc0a050, 0.7);
        for(let gy=GT;gy<GB;gy+=10){ this._gateGfx.lineBetween(FX-8,gy,FX+8,gy+5); }
        this._gateBody = mk(FX, (GT+GB)/2, 10, GB-GT);

        // Lock icon
        this._gateLockGfx = this.add.graphics().setDepth(5);
        this._gateLockGfx.fillStyle(0xd4a830); this._gateLockGfx.fillRect(FX-6,388,12,10);
        this._gateLockGfx.lineStyle(2,0xd4a830); this._gateLockGfx.strokeCircle(FX,385,6);

        // Warning sign post near gate
        const sg = this.add.graphics().setDepth(4);
        sg.fillStyle(0xffdd00); sg.fillRect(FX+14, 232, 68, 44);
        sg.lineStyle(2, 0xcc8800); sg.strokeRect(FX+14, 232, 68, 44);
        sg.fillStyle(0x5a5030); sg.fillRect(FX+46, 276, 6, 28);
        this.add.text(FX+48, 248, '⚠ DANGER\nRESTRICTED', {
            fontSize:'6px', fill:'#441100', fontFamily:'monospace', align:'center'
        }).setDepth(5).setOrigin(0.5, 0.5).setPosition(FX+48, 254);

        // "→ LAKE" direction marker above fence
        const lg = this.add.graphics().setDepth(3);
        lg.fillStyle(0x8a9a60, 0.8); lg.fillRect(920, 210, 100, 28);
        this.add.text(970, 224, '→ THE LAKE', {
            fontSize:'7px', fill:'#e8f8d0', fontFamily:'monospace'
        }).setDepth(5).setOrigin(0.5);
    }

    _createCampsiteMaple() {
        const cx = 228, cy = 458;
        const g = this.add.graphics().setDepth(3);
        // Clearing
        g.fillStyle(0x4a7a35, 0.6); g.fillEllipse(cx, cy+10, 200, 110);
        this._drawFire(g, cx+14, cy-28);
        this._drawTent(g, cx-42, cy+18, 0x3a5a8a, 0x6a8ab0);
        this._drawTable(g, cx+60, cy+20);
        this._drawSiteSign(g, cx-80, cy-30, 'A');
    }

    _createCampsitePine() {
        const cx = 532, cy = 438;
        const g = this.add.graphics().setDepth(3);
        g.fillStyle(0x4a7a35, 0.55); g.fillEllipse(cx, cy+8, 210, 110);
        this._drawFire(g, cx-12, cy-22);
        this._drawTent(g, cx+50, cy+14, 0xc86428, 0xe88048);
        this._drawTent(g, cx+80, cy+20, 0xa85020, 0xc87040);
        this._drawTable(g, cx-55, cy+22);
        this._drawSiteSign(g, cx+90, cy-28, 'B');
    }

    _drawFire(g, fx, fy) {
        g.fillStyle(0x2a1a08); g.fillCircle(fx, fy+2, 13);
        g.fillStyle(0x555555);
        [[-9,5],[9,5],[0,-7],[7,-2],[-7,-2]].forEach(([dx,dy])=>g.fillCircle(fx+dx,fy+dy,4));
        g.fillStyle(0xdd4400); g.fillTriangle(fx,fy-16,fx-9,fy+5,fx+9,fy+5);
        g.fillStyle(0xff7700); g.fillTriangle(fx,fy-11,fx-6,fy+4,fx+6,fy+4);
        g.fillStyle(0xffcc00); g.fillTriangle(fx,fy-6,fx-3,fy+3,fx+3,fy+3);
    }

    _drawTent(g, tx, ty, main, accent) {
        g.fillStyle(0x000000,0.2); g.fillEllipse(tx,ty+22,56,14);
        g.fillStyle(main); g.fillTriangle(tx,ty-24,tx-26,ty+12,tx+26,ty+12);
        g.fillStyle(accent); g.fillTriangle(tx,ty-24,tx-8,ty+12,tx+8,ty+12);
        g.fillStyle(0x1a1200); g.fillRect(tx-7,ty+2,14,12);
    }

    _drawTable(g, tx, ty) {
        g.fillStyle(0x8a6a3a); g.fillRect(tx-22,ty-6,44,8);
        g.fillStyle(0x6a4a22);
        g.fillRect(tx-18,ty+2,6,14); g.fillRect(tx+12,ty+2,6,14);
    }

    _drawSiteSign(g, sx, sy, letter) {
        g.fillStyle(0x8a6a3a); g.fillRect(sx-3,sy,6,22);
        g.fillStyle(0xf0e090); g.fillRect(sx-14,sy-16,28,18);
        g.lineStyle(1,0xaa8040); g.strokeRect(sx-14,sy-16,28,18);
    }

    _createTrees() {
        const positions = [
            // NW forest dense
            [30,30],[70,60],[110,40],[150,70],[40,110],[80,130],[120,100],[160,120],
            [30,170],[65,200],[100,160],[140,190],[170,230],[30,230],[60,250],
            // Scattered mid-map
            [320,80],[380,110],[450,60],[520,90],[590,70],[680,100],[740,80],
            [820,60],[880,90],[940,80],[460,200],[580,190],[700,210],[820,180],
            // East forest (near fence/lake path)
            [960,60],[1000,100],[960,140],[1000,180],[960,220],
            // South border trees
            [100,860],[200,870],[350,855],[500,865],[650,858],[750,870],[850,860],
        ];
        positions.forEach(([tx,ty]) => {
            const sz = 14 + Math.floor(Math.random()*10);
            const g = this.add.graphics().setDepth(6);
            drawPineTree(g, tx, ty, sz);
        });

        // Tree stumps scattered near clusters
        const stumps = [[230,340],[490,308],[820,375],[140,420],[700,845]];
        stumps.forEach(([sx,sy]) => {
            const sg = this.add.graphics().setDepth(4);
            drawTreeStump(sg, sx, sy, 9);
        });
    }

    _createBushes() {
        const positions = [
            [240,295],[300,290],[160,310],[420,295],[600,295],[700,290],[830,290],
            [130,500],[180,520],[380,600],[430,580],[560,550],[650,580],
            [200,700],[300,720],[450,740],[600,760],[700,720],
            [840,450],[900,480],[870,420],
        ];
        positions.forEach(([bx,by]) => {
            const g = this.add.graphics().setDepth(3);
            g.fillStyle(0x1e4a0e); g.fillCircle(bx,by,9);
            g.fillStyle(0x2a6a1a); g.fillCircle(bx-5,by-3,7); g.fillCircle(bx+5,by-3,7);
            g.fillStyle(0x3a8a28,0.6); g.fillCircle(bx-3,by-5,5);
        });
    }

    _createBulletinBoard() {
        const x = 342, y = 328;
        const g = this.add.graphics().setDepth(4);
        g.fillStyle(0x5a3a18); g.fillRect(x-3,y+32,6,20);
        g.fillStyle(0x8a6a3a); g.fillRect(x-28,y,56,34);
        g.lineStyle(1,0xaa8a50); g.strokeRect(x-28,y,56,34);
        g.fillStyle(0xf0e0b8); g.fillRect(x-24,y+4,48,26);
        this.add.text(x, y+17,'NOTICE BOARD',{fontSize:'5px',fill:'#4a3010',fontFamily:'monospace'}).setDepth(5).setOrigin(0.5);
    }

    _createDad() {
        const x = 268, y = 480;
        const g = this.add.graphics().setDepth(8);
        // Pixel-art NPC base (blue shirt, dark brown hair, slate pants)
        drawNPC(g, x, y, 0x4a6a8a, 0x3a2810, 0x4a5070);
        // Ranger hat on top
        g.fillStyle(0x3a5a2a); g.fillRect(x-9, y-22, 18, 4);
        g.fillStyle(0x2a4a1a); g.fillRect(x-6, y-28, 12, 8);
        g.fillStyle(0x3a6a28, 0.5); g.fillRect(x-5, y-27, 10, 2); // hat band highlight
    }

    _createSpecialStick() {
        const x = 76, y = 330;
        this._stickGfx = this.add.graphics().setDepth(3);
        this._stickGfx.lineStyle(3, 0x8a5a20); this._stickGfx.lineBetween(x-6,y-14,x+8,y+16);
        this._stickGfx.lineStyle(2, 0xaa7a30, 0.6); this._stickGfx.lineBetween(x-3,y-12,x+5,y+14);
        // Glow
        const glow = this.add.graphics().setDepth(2);
        glow.fillStyle(0xffdd88,0.18); glow.fillCircle(x,y,18);
        this.tweens.add({ targets:glow, alpha:{from:0.18,to:0.06}, yoyo:true, repeat:-1, duration:1400 });
    }

    _createBoltCutters() {
        const x = 138, y = 790;
        this._boltGfx = this.add.graphics().setDepth(3);
        this._boltGfx.lineStyle(4,0xcc2222); this._boltGfx.lineBetween(x-10,y-18,x+10,y+18);
        this._boltGfx.lineStyle(4,0xcc2222); this._boltGfx.lineBetween(x+10,y-18,x-10,y+18);
        this._boltGfx.lineStyle(2,0x888888,0.8); this._boltGfx.lineBetween(x-4,y-6,x+4,y+6);
        this._boltGlow = this.add.graphics().setDepth(2);
        this._boltGlow.fillStyle(0xff4444,0.15); this._boltGlow.fillCircle(x,y,20);
        this.tweens.add({targets:this._boltGlow,alpha:{from:0.15,to:0.04},yoyo:true,repeat:-1,duration:1200});
    }

    _createExitMarkers() {
        // South exit marker
        const sg = this.add.graphics().setDepth(3);
        sg.fillStyle(0x8a7a50,0.7); sg.fillRect(340,846,180,24);
        this.add.text(430,858,'↓ SOUTH TRAIL',{fontSize:'7px',fill:'#e8ddb8',fontFamily:'monospace'}).setDepth(5).setOrigin(0.5);
    }

    _createPlayer() {
        const startX = (window.gameState && window.gameState.entryX) ? window.gameState.entryX : 490;
        const startY = (window.gameState && window.gameState.entryY) ? window.gameState.entryY : 310;
        if (window.gameState) { delete window.gameState.entryX; delete window.gameState.entryY; }
        this.player = this.physics.add.sprite(startX, startY, 'player_idle');
        this.player.setCollideWorldBounds(true).setDepth(10);
    }

    _createArtifacts() {
        const defs = [
            { id:'arrowhead_cabin', x:162, y:442, cat:'arrowheads', label:'Arrowhead' },
            { id:'arrowhead_shed',  x:342, y:688, cat:'arrowheads', label:'Arrowhead' },
            { id:'pottery_bath',    x:714, y:352, cat:'pottery',    label:'Pottery Shard' },
        ];
        defs.forEach(d => {
            if (this.collected.has(d.id)) return;
            const g = this.add.graphics().setDepth(3);
            g.fillStyle(0xd4a840); g.fillTriangle(d.x,d.y-8,d.x-6,d.y+6,d.x+6,d.y+6);
            const glow = this.add.graphics().setDepth(2);
            glow.fillStyle(0xffdd44,0.2); glow.fillCircle(d.x,d.y,14);
            this.tweens.add({targets:glow,alpha:{from:0.2,to:0.05},yoyo:true,repeat:-1,duration:1600+Math.random()*400});
            this[`_agfx_${d.id}`] = g; this[`_aglow_${d.id}`] = glow;
            this.interactables.push({
                id:d.id, x:d.x, y:d.y, range:44, hintLabel:'Pick up',
                text:`You found a ${d.label}. It's old — maybe Frank would know more.`,
                onInteract:(s) => {
                    s.collected.add(d.id);
                    s._artifactCounts[d.cat]++;
                    if(window.gameState) window.gameState.artifactCounts = {...s._artifactCounts};
                    s[`_agfx_${d.id}`].setVisible(false);
                    s[`_aglow_${d.id}`].setVisible(false);
                    s.interactables.find(o=>o.id===d.id).disabled=true;
                }
            });
        });
    }

    _showWalkingStickHUD() {
        if (this._stickHUD) return;
        this._stickHUD = this.add.text(474, 22, '| stick', {
            fontSize:'8px', fill:'#d4a840', fontFamily:'monospace'
        }).setScrollFactor(0).setDepth(95).setOrigin(1,0);
    }

    _showFlashlightHUD() {
        if (this._flashHUD) return;
        this._flashHUD = this.add.text(474, 33, '| light', {
            fontSize:'8px', fill:'#ffe066', fontFamily:'monospace'
        }).setScrollFactor(0).setDepth(95).setOrigin(1,0);
    }

    // ----------------------------------------------------------
    // GAME STATE
    // ----------------------------------------------------------
    _saveGameState() {
        window.gameState = {
            collected:      Array.from(this.collected),
            questState:     this.quest.state,
            artifactCounts: { ...this._artifactCounts },
            gateOpen:       this._gateOpen,
            endingPlayed:   this._endingPlayed,
            hp:             this._hp,
            maxHp:          this._maxHp,
        };
        SaveManager.save(window.gameState);
    }

    _loadFromGameState() {
        const gs = window.gameState; if (!gs) return;
        this.collected       = new Set(gs.collected || []);
        this._artifactCounts = { ...(gs.artifactCounts || {arrowheads:0,pottery:0,tools:0}) };
        this._gateOpen       = gs.gateOpen || false;
        this._endingPlayed   = gs.endingPlayed || false;

        if (gs.questState > 0) {
            this.quest.state = gs.questState;
            const lbl = QUEST_LABELS[gs.questState] || '';
            if (lbl) { this.quest.label.setText(lbl); this.quest._drawBg(lbl); }
        }
        if (gs.entryX) { this.player.setPosition(gs.entryX, gs.entryY); delete gs.entryX; delete gs.entryY; }
        if (this.collected.has('bolt_cutters')) {
            if (this._boltGfx)  this._boltGfx.setVisible(false);
            if (this._boltGlow) this._boltGlow.setVisible(false);
            this.interactables.find(o=>o.id==='bolt_cutters') && (this.interactables.find(o=>o.id==='bolt_cutters').disabled=true);
        }
        if (this.collected.has('stick_raw') || this.collected.has('walking_stick')) {
            if (this._stickGfx) this._stickGfx.setVisible(false);
        }
        if (this.collected.has('walking_stick') || this.collected.has('ember_stick')) this._showWalkingStickHUD();
        if (this.collected.has('flashlight')) this._showFlashlightHUD();
        if (this._gateOpen) {
            if (this._gateBody)    this._gateBody.body.enable = false;
            if (this._gateGfx)     this._gateGfx.setVisible(false);
            if (this._gateLockGfx) this._gateLockGfx.setVisible(false);
        }
        for (const key of this.collected) {
            if (this[`_agfx_${key}`])  this[`_agfx_${key}`].setVisible(false);
            if (this[`_aglow_${key}`]) this[`_aglow_${key}`].setVisible(false);
            const obj = this.interactables.find(o=>o.id===key);
            if (obj) obj.disabled = true;
        }
        if (gs.autoZoneTriggered_camp) this._autoQuestZones.forEach(z=>z.triggered=true);
    }
}
