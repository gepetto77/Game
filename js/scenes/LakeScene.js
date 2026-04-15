// ============================================================
// LakeScene.js — The Lake (contaminated)
// World: 960x640. Entered from GameScene east (NE path).
// Exit west -> GameScene.
// ============================================================
class LakeScene extends Phaser.Scene {
    constructor() { super({ key: 'LakeScene' }); }

    create() {
        const W = 960, H = 640;
        this.WORLD_W = W; this.WORLD_H = H;
        this._actionWasPressed = false;
        this._walkFrame = 0; this._walkTimer = 0;
        this._footstepTimer = 0;
        this._transitioning = false;
        this._artifactCounts = (window.gameState && window.gameState.artifactCounts)
            ? { ...window.gameState.artifactCounts } : { arrowheads:0, pottery:0, tools:0 };
        // Health
        this._hp      = (window.gameState && window.gameState.hp    != null) ? window.gameState.hp    : 5;
        this._maxHp   = (window.gameState && window.gameState.maxHp != null) ? window.gameState.maxHp : 5;
        this._iframes = 0;
        this._radDmgTimer = 2000;
        // Combat
        this._attacking      = false;
        this._attackTimer    = 0;
        this._attackCooldown = 0;
        this._attackDir      = { x: 0, y: 1 };
        this._attackWasPressed = false;
        this._enemies = [];

        this.physics.world.setBounds(0, 0, W, H);
        const pg = this.make.graphics({x:0,y:0,add:false});
        pg.fillStyle(0xffffff,1); pg.fillRect(0,0,1,1);
        pg.generateTexture('pixel',1,1); pg.destroy();

        this._createGround(W, H);
        this.obstacles = this.physics.add.staticGroup();
        this._createDock();
        this._createBoatShack();
        this._createTrees();
        this._createBushes();
        this._createExitMarker();

        this._createPlayer();
        this.cameras.main.setBounds(0, 0, W, H);
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this.cameras.main.setZoom(2);
        this.cameras.main.fadeIn(700, 0, 0, 0);
        this.physics.add.collider(this.player, this.obstacles);

        this.dialogue   = new DialogueBox(this);
        this._heartsHUD = new HeartsHUD(this, this._maxHp);
        this._heartsHUD._hp = this._hp; this._heartsHUD._draw();
        this._attackGfx = this.add.graphics().setDepth(11);
        this._invPanel  = new InventoryPanel(this); this._invWasPressed = false;
        this._buildInteractables();
        this._createArtifacts();
        this._setupInput();

        // Radiation zones over contamination patches
        this._radZones = [];
        this._createRadZone(390, 480, 180, 90, 'ellipse');
        this._createRadZone(360, 380, 140, 70, 'ellipse');

        // Enemies spawn after entering facility
        const qs = (window.gameState && window.gameState.questState) || 0;
        if (qs >= QUEST_STATES.INSIDE) this._spawnEnemies();

        this.interactHint = this.add.text(0, 0, '', {
            fontSize:'9px', fill:'#ffffff', fontFamily:'monospace',
            backgroundColor:'#000000bb', padding:{x:5,y:3}
        }).setDepth(50).setVisible(false).setScrollFactor(0);

        // Scene label
        this.add.text(W/2, 10, 'THE LAKE', {
            fontSize:'8px', fill:'#4488aa88', fontFamily:'monospace'
        }).setScrollFactor(0).setDepth(20).setOrigin(0.5,0);

        if (window.gameState && window.gameState.entryX) {
            this.player.setPosition(window.gameState.entryX, window.gameState.entryY);
            delete window.gameState.entryX; delete window.gameState.entryY;
        }
    }

    update(time, delta) {
        const dt = delta || 16;
        const iDown = this.iKey && this.iKey.isDown;
        if (iDown && !this._invWasPressed) { this._invWasPressed = true; this._invPanel.toggle(); }
        if (!iDown) this._invWasPressed = false;
        if (this._invPanel.isOpen()) { this.player.setVelocity(0, 0); return; }
        if (this.dialogue.isVisible()) {
            this.player.setVelocity(0,0);
            const down = this.eKey.isDown || window.virtualKeys.action;
            if (down && !this._actionWasPressed) { this._actionWasPressed=true; this.dialogue.tryDismiss(); }
            if (!down) this._actionWasPressed=false;
            return;
        }
        const speed = 160;
        const goUp    = this.cursors.up.isDown    || this.wasd.up.isDown    || window.virtualKeys.up;
        const goDown  = this.cursors.down.isDown  || this.wasd.down.isDown  || window.virtualKeys.down;
        const goLeft  = this.cursors.left.isDown  || this.wasd.left.isDown  || window.virtualKeys.left;
        const goRight = this.cursors.right.isDown || this.wasd.right.isDown || window.virtualKeys.right;

        let vx=0,vy=0;
        if(goLeft)vx=-speed; if(goRight)vx=speed;
        if(goUp)vy=-speed; if(goDown)vy=speed;
        if(vx!==0&&vy!==0){vx*=0.707;vy*=0.707;}
        this.player.setVelocity(vx,vy);

        if(vx!==0||vy!==0) this._attackDir={x:vx>0?1:vx<0?-1:0,y:vy>0?1:vy<0?-1:0};

        if(vx!==0||vy!==0){
            this._walkTimer-=dt;
            if(this._walkTimer<=0){this._walkTimer=180;this._walkFrame=this._walkFrame===0?1:0;}
            const tex=(vy<0&&vx===0)?'player_back':(this._walkFrame===0?'player_walkA':'player_walkB');
            this.player.setTexture(tex);
            if(vx<0)this.player.setFlipX(true); else if(vx>0)this.player.setFlipX(false);
        } else {
            this.player.setTexture('player_idle');
            this._walkFrame=0; this._walkTimer=0;
        }
        if(vx!==0||vy!==0){
            this._footstepTimer-=dt;
            if(this._footstepTimer<=0){this._footstepTimer=340;if(window.soundManager&&window.soundManager.ready)window.soundManager.playFootstep();}
        } else {this._footstepTimer=0;}

        // Attack input
        const atkDown=(this.xKey&&this.xKey.isDown)||(this.spaceKey&&this.spaceKey.isDown)||window.virtualKeys.attack;
        const col=(window.gameState&&window.gameState.collected)||[];
        if(atkDown&&!this._attackWasPressed&&this._attackCooldown<=0&&(col.includes('walking_stick')||col.includes('ember_stick'))){
            this._attackWasPressed=true; this._startAttack();
        }
        if(!atkDown)this._attackWasPressed=false;
        if(this._attackCooldown>0)this._attackCooldown-=dt;
        if(this._attacking)this._updateAttack(dt);

        // Invincibility frames
        if(this._iframes>0){this._iframes-=dt;this.player.setAlpha(Math.sin(this._iframes*0.025)>0?1:0.3);}
        else this.player.setAlpha(1);

        // Enemy AI
        this._updateEnemies(dt);

        const nearest = this._nearestInteractable();
        if(nearest){
            this.interactHint.setText('[ E ] '+(nearest.hintLabel||'Examine'));
            const _cam=this.cameras.main;
            const _sx=(nearest.x-_cam.scrollX)*_cam.zoom;
            const _sy=(nearest.y-_cam.scrollY)*_cam.zoom;
            this.interactHint.setPosition(_sx-this.interactHint.width/2,_sy-42);
            this.interactHint.setVisible(true);
        } else {this.interactHint.setVisible(false);}

        const down = this.eKey.isDown || window.virtualKeys.action;
        if(down&&!this._actionWasPressed){
            this._actionWasPressed=true;
            if(nearest){
                const text=typeof nearest.getText==='function'?nearest.getText(this):(nearest.text||'');
                const spk=typeof nearest.getSpeaker==='function'?nearest.getSpeaker(this):(nearest.speaker||'');
                if(text){
                    if(window.soundManager&&window.soundManager.ready)window.soundManager.playInteract();
                    this.dialogue.show(spk,text,()=>{if(nearest.onInteract)nearest.onInteract(this);});
                }
            }
        }
        if(!down)this._actionWasPressed=false;

        this._checkRadZones(dt);
        this._checkExits();
    }

    _nearestInteractable() {
        let best=null, bestDist=Infinity;
        const px=this.player.x, py=this.player.y;
        for(const obj of this.interactables){
            if(obj.disabled)continue;
            const d=Phaser.Math.Distance.Between(px,py,obj.x,obj.y);
            if(d<=obj.range&&d<bestDist){bestDist=d;best=obj;}
        }
        return best;
    }

    _checkExits() {
        if(this._transitioning)return;
        if(this.player.x < 22) this._goToScene('GameScene', 1155, this.player.y);
    }

    _goToScene(key, entryX, entryY) {
        if(this._transitioning)return;
        this._transitioning=true;
        this.player.setVelocity(0,0);
        this._saveState();
        window.gameState.entryX=entryX; window.gameState.entryY=entryY;
        this.cameras.main.fade(600,0,0,0);
        this.time.delayedCall(650,()=>this.scene.start(key));
    }

    _saveState() {
        if(!window.gameState) window.gameState={};
        const gs = window.gameState;
        const base = Array.from(new Set([...(gs.collected||[]),...Array.from(this._localCollected||[])]));
        gs.collected      = base;
        gs.artifactCounts = {...this._artifactCounts};
        gs.hp             = this._hp;
        gs.maxHp          = this._maxHp;
        SaveManager.save(window.gameState);
    }

    _setupInput() {
        this.cursors  = this.input.keyboard.createCursorKeys();
        this.wasd     = this.input.keyboard.addKeys({
            up:Phaser.Input.Keyboard.KeyCodes.W, down:Phaser.Input.Keyboard.KeyCodes.S,
            left:Phaser.Input.Keyboard.KeyCodes.A, right:Phaser.Input.Keyboard.KeyCodes.D
        });
        this.eKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.xKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
        this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.iKey     = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I);
        this._localCollected = new Set((window.gameState&&window.gameState.collected)||[]);
    }

    // --- Combat ---
    _startAttack() {
        if(this._attacking)return;
        this._attacking=true; this._attackTimer=300; this._attackCooldown=500;
        if(window.soundManager&&window.soundManager.ready)window.soundManager.playSwing();
    }
    _updateAttack(delta) {
        this._attackTimer-=delta;
        const hx=this.player.x+this._attackDir.x*50, hy=this.player.y+this._attackDir.y*50;
        this._attackGfx.clear();
        const p=1-(this._attackTimer/300), a=p<0.5?p*2:(1-p)*2;
        this._attackGfx.fillStyle(0xd4a840,a*0.7); this._attackGfx.fillRect(hx-20,hy-20,40,40);
        for(const e of this._enemies){
            if(e.isDead||e._hitThisSwing)continue;
            if(Phaser.Math.Distance.Between(hx,hy,e.x,e.y)<50){e._hitThisSwing=true;this._hitEnemy(e);}
        }
        if(this._attackTimer<=0){
            this._attacking=false; this._attackGfx.clear();
            this._enemies.forEach(e=>e._hitThisSwing=false);
        }
    }
    _hitEnemy(e) {
        const col=(window.gameState&&window.gameState.collected)||[];
        e.hp-=col.includes('ember_stick')?2:1;
        e.state='STUNNED'; e.stunnedTimer=400;
        if(e.hp<=0)this._killEnemy(e);
    }
    _killEnemy(e) {
        e.isDead=true; e.state='DEAD'; drawCreature(e);
        if(window.soundManager&&window.soundManager.ready)window.soundManager.playEnemyDie();
        this.time.delayedCall(500,()=>{e._gfx.destroy();e._hpGfx.destroy();});
    }
    _spawnEnemies() {
        [[340,480],[400,510]].forEach(([ex,ey])=>this._enemies.push(createCreature(this,'MUTANT_FISH',ex,ey)));
    }
    _updateEnemies(delta) {
        for(const e of this._enemies){
            const r=updateCreature(e,this.player.x,this.player.y,delta);
            drawCreature(e);
            if(r&&r.dealDamage)this._takeDamage(r.damage);
        }
    }

    // --- Health ---
    _takeDamage(amount) {
        if(this._iframes>0)return;
        this._hp=Math.max(0,this._hp-amount);
        this._heartsHUD.setHp(this._hp); this._heartsHUD.flashDamage();
        this.cameras.main.shake(200,0.008);
        if(window.soundManager&&window.soundManager.ready)window.soundManager.playHurt();
        this._iframes=1200;
        if(this._hp<=0)this._handleDeath();
    }
    _handleDeath() {
        if(this._transitioning)return;
        this._transitioning=true;
        this.player.setVelocity(0,0);
        this._saveState(); window.gameState.hp=5; window.gameState.maxHp=5;
        this.cameras.main.fade(1200,180,0,0);
        this.time.delayedCall(1400,()=>this.scene.start('GameScene'));
    }

    // --- Radiation ---
    _createRadZone(x,y,w,h,shape) {
        const gfx=this.add.graphics().setDepth(2.5);
        gfx.fillStyle(0xff4400,0.08);
        if(shape==='ellipse')gfx.fillEllipse(x,y,w,h); else gfx.fillRect(x-w/2,y-h/2,w,h);
        this.tweens.add({targets:gfx,alpha:{from:0.08,to:0.22},yoyo:true,repeat:-1,duration:1200});
        this._radZones.push({x,y,w,h,shape});
    }
    _checkRadZones(delta) {
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

    // ----------------------------------------------------------
    _createGround(w, h) {
        const g = this.add.graphics();
        // Beach / shore strip (left, west entry)
        g.fillStyle(0x5a8a3a); g.fillRect(0,0,w,h);
        // Sandy beach
        g.fillStyle(0xc8b870); g.fillRect(0,420,340,220);
        g.fillStyle(0xd8c880); g.fillRect(0,420,340,30);
        // Wet sand near water
        g.fillStyle(0xa8a060); g.fillRect(280,420,100,220);

        // LAKE — takes up most of scene (east 65%)
        g.fillStyle(0x1a5a8a); g.fillRect(320,0,640,640);
        // Depth gradient — darker center
        g.fillStyle(0x103a5a,0.5); g.fillRect(440,60,480,480);
        // Shallow edges (lighter)
        g.fillStyle(0x3a8ab0,0.4); g.fillRect(320,0,60,640);
        g.fillStyle(0x2a7aa0,0.3); g.fillRect(320,580,640,60);
        g.fillStyle(0x2a7aa0,0.3); g.fillRect(860,0,100,640);

        // CONTAMINATION — sickly green patches near shore
        g.fillStyle(0x4a8a30,0.45); g.fillEllipse(390,480,180,90);
        g.fillStyle(0x5a9a20,0.35); g.fillEllipse(360,380,140,70);
        g.fillStyle(0x6aaa10,0.25); g.fillEllipse(430,560,200,80);
        // Green sheen on water surface near shore
        g.fillStyle(0x3a7a18,0.2); g.fillRect(320,340,200,300);

        // Water shimmer lines
        g.lineStyle(1,0x5aaad0,0.2);
        for(let wy=40;wy<600;wy+=55) g.lineBetween(340,wy,340+120+(wy%110),wy+6);
        for(let wy=20;wy<600;wy+=70) g.lineBetween(500,wy,620,wy+4);

        // Dead fish (visual markers)
        g.fillStyle(0xd0c080,0.7);
        [[340,450],[360,510],[400,390],[330,550]].forEach(([fx,fy])=>{
            g.fillEllipse(fx,fy,18,8);
            g.fillStyle(0xc0b060,0.7); g.fillTriangle(fx+8,fy,fx+16,fy-5,fx+16,fy+5);
            g.fillStyle(0xd0c080,0.7);
        });

        // Path leading west to camp
        g.fillStyle(0xb8a870); g.fillRect(0,390,320,50);
        g.fillStyle(0xc8b880,0.4); g.fillRect(0,390,320,12);

        // Reeds along shore
        g.fillStyle(0x2a5a18);
        [[318,380],[318,430],[318,490],[318,540],[318,590],[318,340],[318,300]].forEach(([rx,ry])=>{
            for(let i=0;i<4;i++){
                const rox=(i-2)*7, h2=20+i*4;
                g.fillRect(rx+rox, ry-h2, 2, h2);
                g.fillStyle(0x3a7a22); g.fillEllipse(rx+rox+1, ry-h2-4, 6, 10);
                g.fillStyle(0x2a5a18);
            }
        });
    }

    _createDock() {
        const dx=620, dy=408;
        const g = this.add.graphics().setDepth(4);
        // Dock planks
        g.fillStyle(0x8a6a40); g.fillRect(dx,dy,160,30);
        g.fillStyle(0x6a4a28,0.5);
        for(let px=dx+8;px<dx+160;px+=12) g.fillRect(px,dy,2,30);
        // Pilings
        g.fillStyle(0x5a3a20);
        [[dx+20,dy+26],[dx+60,dy+26],[dx+100,dy+26],[dx+140,dy+26]].forEach(([px,py])=>g.fillRect(px-4,py,8,28));
        // Rope/rail
        g.lineStyle(2,0x8a6030,0.8);
        g.lineBetween(dx,dy-2,dx+160,dy-2);
        g.lineBetween(dx,dy+32,dx+160,dy+32);
        // Fishing rod (Pete's)
        g.lineStyle(2,0x5a3a10); g.lineBetween(dx+148,dy-4,dx+178,dy-40);
        g.lineStyle(1,0x888888,0.7); g.lineBetween(dx+178,dy-40,dx+184,dy+20);
        const mk=(bx,by,bw,bh)=>{const b=this.obstacles.create(bx+bw/2,by+bh/2,'pixel');b.setDisplaySize(bw,bh);b.refreshBody();};
        mk(dx,dy,160,30);
    }

    _createBoatShack() {
        const x=760, y=148;
        const g=this.add.graphics().setDepth(4);
        g.fillStyle(0x5a4a30); g.fillRect(x,y,120,88);
        g.lineStyle(2,0x3a2a18); g.strokeRect(x,y,120,88);
        g.fillStyle(0x7a5a38); g.fillTriangle(x-8,y,x+60,y-30,x+128,y);
        g.fillStyle(0x4a3820); g.fillRect(x+40,y+46,40,42);
        this.add.text(x+60,y+18,'BOAT\nSHACK',{fontSize:'6px',fill:'#c8a870',fontFamily:'monospace',align:'center'}).setDepth(5).setOrigin(0.5,0);
        const mk=(bx,by,bw,bh)=>{const b=this.obstacles.create(bx+bw/2,by+bh/2,'pixel');b.setDisplaySize(bw,bh);b.refreshBody();};
        mk(x,y,120,88);
    }

    _createTrees() {
        const pos=[[20,30],[60,50],[100,30],[140,60],[180,40],[20,100],[60,120],[110,90],[160,110],
                   [20,180],[70,200],[120,170],[30,270],[80,260],[20,350],[70,340],
                   [20,530],[60,550],[100,520],[150,560],[20,620],[70,610]];
        pos.forEach(([tx,ty])=>{
            const sz=13+Math.floor(Math.random()*9);
            const g=this.add.graphics().setDepth(6);
            drawPineTree(g, tx, ty, sz);
        });

        // Pete the fisherman NPC sitting at the dock end
        const pg=this.add.graphics().setDepth(8);
        drawNPC(pg, 654, 398, 0x5a6a4a, 0x8a6030, 0x3a3a50);
        // Fisherman's cap
        pg.fillStyle(0x3a3a50); pg.fillRect(654-7, 398-22, 14, 3);
        pg.fillStyle(0x2a2a40); pg.fillRect(654-5, 398-27, 10, 6);
    }

    _createBushes() {
        [[240,400],[260,440],[240,480],[250,520],[260,560],[230,600],
         [300,395],[310,460],[290,510],[310,580]].forEach(([bx,by])=>{
            const g=this.add.graphics().setDepth(3);
            g.fillStyle(0x1e4a0e); g.fillCircle(bx,by,8);
            g.fillStyle(0x2a6a1a); g.fillCircle(bx-5,by-3,6); g.fillCircle(bx+5,by-3,6);
        });
    }

    _createExitMarker() {
        const g=this.add.graphics().setDepth(3);
        g.fillStyle(0x8a7a50,0.7); g.fillRect(0,396,80,38);
        this.add.text(40,415,'← CAMP',{fontSize:'7px',fill:'#e8ddb8',fontFamily:'monospace'}).setDepth(5).setOrigin(0.5);
    }

    _createPlayer() {
        createPlayerTextures(this);
        const gs=window.gameState;
        const sx=(gs&&gs.entryX)||32, sy=(gs&&gs.entryY)||415;
        this.player=this.physics.add.sprite(sx,sy,'player_idle');
        this.player.setCollideWorldBounds(true).setDepth(10);
    }

    _buildInteractables() {
        const col=()=>(window.gameState&&window.gameState.collected)||[];
        this.interactables=[
            { id:'dead_fish',   x:355, y:490, range:55, hintLabel:'Examine', speaker:'',
              text:'Three dead perch, belly-up in the shallows. The water around them has a faint green tinge.\nThis isn\'t right.' },
            { id:'contamination_zone', x:385, y:390, range:58, hintLabel:'Examine', speaker:'',
              text:'The water here smells chemical. An oily sheen catches the light.\nThis isn\'t natural algae.' },
            { id:'fisherman',   x:654, y:400, range:70, hintLabel:'Talk', speaker:'OLD PETE',
              getText:(s)=>{
                  const c=(window.gameState&&window.gameState.collected)||[];
                  const qs=(window.gameState&&window.gameState.questState)||0;
                  if(c.includes('boat_key'))
                      return 'Island due east — I saw lights there in \'92. Nobody\'s checked since.\nThe boathouse key is yours. Take the rowboat.';
                  if(qs>=QUEST_STATES.INSIDE&&!c.includes('boat_key'))
                      return 'You got in there. I believe you now.\n*reaches into his tackle box*\nThat\'s the boathouse key.\nThere\'s an island due east — I saw lights there in \'92.\nNobody\'s checked since.';
                  if(c.includes('facility_log'))
                      return 'You found proof.\nI always knew — forty years fishin\' this lake.\nGet that out to people.';
                  if(c.includes('bolt_cutters'))
                      return 'You found a way in there, didn\'t you.\nSame look I had in \'89.\nBe careful — those people don\'t like witnesses.';
                  return 'Been fishin\' this lake forty years.\nUsed to catch a full basket by noon.\n...Haven\'t eaten anything from here since \'91.\nWater changed. Fish started dyin\'.\nNobody official will say why.';
              },
              onInteract:(s)=>{
                  const c=(window.gameState&&window.gameState.collected)||[];
                  const qs=(window.gameState&&window.gameState.questState)||0;
                  if(qs>=QUEST_STATES.INSIDE&&!c.includes('boat_key')){
                      s._localCollected.add('boat_key');
                      window.gameState.collected=[...new Set([...(window.gameState.collected||[]),'boat_key'])];
                  }
              }},
            { id:'mia_lake',   x:290, y:415, range:65, hintLabel:'Talk', speaker:'MIA',
              getText:(s)=>{
                  const c=col();
                  if(c.includes('facility_log'))
                      return 'You found Dr. Chen\'s log?\nI knew it. I\'ll back you up — everything I measured is written down.\nThis is real.';
                  if(c.includes('bolt_cutters'))
                      return 'That green sheen — Cherenkov-adjacent fluorescence.\nSomething radioactive is leaching into the water table.\nThe facility is the only source for miles.';
                  return 'I\'ve been collecting water samples all week.\nThe pH is wrong. The phosphorescence at night isn\'t bioluminescence.\nI think it\'s coming from the facility east of camp.\nMy parents think I\'m overreacting.';
              }},
            { id:'boat_shack_door', x:820, y:192, range:68, hintLabel:'Try door', speaker:'',
              getText:(s)=>{
                  const c=(window.gameState&&window.gameState.collected)||[];
                  if(c.includes('chen_disk'))return 'You\'ve already recovered what was here.';
                  if(c.includes('boat_key'))return '...';
                  return 'Boathouse door — padlocked. A rowboat is chained inside, visible through the gap.';
              },
              onInteract:(s)=>{
                  const c=(window.gameState&&window.gameState.collected)||[];
                  if(c.includes('boat_key')&&!c.includes('chen_disk')){
                      s._localCollected.add('chen_disk');
                      window.gameState.collected=[...new Set([...c,'chen_disk'])];
                      s.cameras.main.shake(300,0.004);
                      s.dialogue.show('',
                          'You row out to the island.\n\nA concrete survey marker, half-submerged.\nStenciled: "EMBERLIGHT STATION ALPHA — 1989"\n\nBelow it — a waterproof case. Still sealed.\nInside: a data disk. Labeled:\n"DR. CHEN — PERSONAL RECORD"\n\n[ You found Dr. Chen\'s disk ]');
                  }
              }},
            { id:'notice_board_lake', x:140, y:408, range:60, hintLabel:'Read', speaker:'NOTICE',
              text:'PINEBROOK LAKE — NO SWIMMING\n\n"Due to elevated algae levels"\n\n[handwritten below]\n"It\'s not algae. — M"' },
        ];
    }

    _createArtifacts() {
        const defs=[
            { id:'pottery_lake', x:186, y:456, cat:'pottery', label:'Pottery Shard' },
            { id:'arrowhead_beach', x:108, y:474, cat:'arrowheads', label:'Arrowhead' },
        ];
        const collected=col=>(window.gameState&&window.gameState.collected)||[];
        defs.forEach(d=>{
            if(collected().includes(d.id))return;
            const g=this.add.graphics().setDepth(3);
            g.fillStyle(0xd4a840); g.fillTriangle(d.x,d.y-8,d.x-6,d.y+6,d.x+6,d.y+6);
            const glow=this.add.graphics().setDepth(2);
            glow.fillStyle(0xffdd44,0.2); glow.fillCircle(d.x,d.y,14);
            this.tweens.add({targets:glow,alpha:{from:0.2,to:0.05},yoyo:true,repeat:-1,duration:1600});
            this.interactables.push({
                id:d.id, x:d.x, y:d.y, range:44, hintLabel:'Pick up',
                text:`A ${d.label} — worn smooth. Very old.`,
                onInteract:(s)=>{
                    s._localCollected.add(d.id);
                    s._artifactCounts[d.cat]++;
                    if(window.gameState){
                        window.gameState.collected=[...new Set([...(window.gameState.collected||[]),d.id])];
                        window.gameState.artifactCounts={...s._artifactCounts};
                    }
                    g.setVisible(false); glow.setVisible(false);
                    s.interactables.find(o=>o.id===d.id).disabled=true;
                }
            });
        });
    }
}
