// ============================================================
// FacilityScene.js — Facility Grounds (beyond the gate)
// World: 960x720. Entered from GameScene via bolt-cut gate.
// Contains the glowing clue, worker badge, control panel.
// Ending sequence triggered at control panel with facility_log.
// Exit: west -> GameScene (gate always open from inside).
// ============================================================
class FacilityScene extends Phaser.Scene {
    constructor() { super({ key: 'FacilityScene' }); }

    create() {
        const W = 960, H = 720;
        this.WORLD_W = W; this.WORLD_H = H;
        this._actionWasPressed = false;
        this._walkFrame=0; this._walkTimer=0; this._footstepTimer=0;
        this._transitioning = false;
        this._endingPlayed = (window.gameState&&window.gameState.endingPlayed)||false;
        this._endingListening = false;
        this._localCollected = new Set((window.gameState&&window.gameState.collected)||[]);
        this._artifactCounts = (window.gameState&&window.gameState.artifactCounts)
            ? {...window.gameState.artifactCounts} : {arrowheads:0,pottery:0,tools:0};
        // Health
        this._hp      = (window.gameState&&window.gameState.hp    !=null)?window.gameState.hp    :5;
        this._maxHp   = (window.gameState&&window.gameState.maxHp !=null)?window.gameState.maxHp :5;
        this._iframes = 0;
        this._radDmgTimer = 2000;
        // Combat
        this._attacking=false; this._attackTimer=0; this._attackCooldown=0;
        this._attackDir={x:0,y:1}; this._attackWasPressed=false;
        this._enemies=[];

        this.physics.world.setBounds(0,0,W,H);
        const pg=this.make.graphics({x:0,y:0,add:false});
        pg.fillStyle(0xffffff,1); pg.fillRect(0,0,1,1);
        pg.generateTexture('pixel',1,1); pg.destroy();

        this._createGround(W,H);
        this.obstacles=this.physics.add.staticGroup();
        this._createFacilityBuilding();
        this._createGateExit();
        this._createTrees();
        this._createGlowingClue();
        this._createWorkerBadge();
        this._createControlPanel();

        this._createPlayer();
        this.cameras.main.setBounds(0,0,W,H);
        this.cameras.main.startFollow(this.player,true,0.1,0.1);
        this.cameras.main.setZoom(2);
        this.cameras.main.fadeIn(700,0,0,0);
        this.physics.add.collider(this.player,this.obstacles);

        this.dialogue   =new DialogueBox(this);
        this._heartsHUD =new HeartsHUD(this,this._maxHp);
        this._heartsHUD._hp=this._hp; this._heartsHUD._draw();
        this._attackGfx =this.add.graphics().setDepth(11);
        this._invPanel  =new InventoryPanel(this); this._invWasPressed=false;
        this._buildInteractables();
        this._createArtifacts();
        this._setupInput();
        this._radZones=[];
        this._createRadZone(280,380,180,100,'ellipse');
        this._createRadZone(600,480,200,120,'ellipse');
        this._createRadZone(750,280,160,90,'ellipse');
        const qs=(window.gameState&&window.gameState.questState)||0;
        if(qs>=QUEST_STATES.INSIDE)this._spawnEnemies();

        this.interactHint=this.add.text(0,0,'',{
            fontSize:'9px',fill:'#ccffcc',fontFamily:'monospace',
            backgroundColor:'#000000cc',padding:{x:5,y:3}
        }).setDepth(50).setVisible(false);

        this.add.text(W/2,10,'PINEBROOK NUCLEAR RESERVE',{
            fontSize:'7px',fill:'#44aa4488',fontFamily:'monospace'
        }).setScrollFactor(0).setDepth(20).setOrigin(0.5,0);

        if(window.gameState&&window.gameState.entryX){
            this.player.setPosition(window.gameState.entryX, window.gameState.entryY);
            delete window.gameState.entryX; delete window.gameState.entryY;
        }
    }

    update(time,delta){
        const dt=delta||16;
        const iDown=this.iKey&&this.iKey.isDown;
        if(iDown&&!this._invWasPressed){this._invWasPressed=true;this._invPanel.toggle();}
        if(!iDown)this._invWasPressed=false;
        if(this._invPanel.isOpen()){this.player.setVelocity(0,0);return;}
        if(this.dialogue.isVisible()){
            this.player.setVelocity(0,0);
            const down=this.eKey.isDown||window.virtualKeys.action;
            if(down&&!this._actionWasPressed){this._actionWasPressed=true;this.dialogue.tryDismiss();}
            if(!down)this._actionWasPressed=false;
            return;
        }
        const speed=160;
        const goUp=this.cursors.up.isDown||this.wasd.up.isDown||window.virtualKeys.up;
        const goDown=this.cursors.down.isDown||this.wasd.down.isDown||window.virtualKeys.down;
        const goLeft=this.cursors.left.isDown||this.wasd.left.isDown||window.virtualKeys.left;
        const goRight=this.cursors.right.isDown||this.wasd.right.isDown||window.virtualKeys.right;

        let vx=0,vy=0;
        if(goLeft)vx=-speed; if(goRight)vx=speed;
        if(goUp)vy=-speed; if(goDown)vy=speed;
        if(vx!==0&&vy!==0){vx*=0.707;vy*=0.707;}
        this.player.setVelocity(vx,vy);

        if(vx!==0||vy!==0)this._attackDir={x:vx>0?1:vx<0?-1:0,y:vy>0?1:vy<0?-1:0};

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

        // Attack
        const atkDown=(this.xKey&&this.xKey.isDown)||(this.spaceKey&&this.spaceKey.isDown)||window.virtualKeys.attack;
        const col=(window.gameState&&window.gameState.collected)||[];
        if(atkDown&&!this._attackWasPressed&&this._attackCooldown<=0&&(col.includes('walking_stick')||col.includes('ember_stick'))){
            this._attackWasPressed=true;this._startAttack();
        }
        if(!atkDown)this._attackWasPressed=false;
        if(this._attackCooldown>0)this._attackCooldown-=dt;
        if(this._attacking)this._updateAttack(dt);
        // iframes
        if(this._iframes>0){this._iframes-=dt;this.player.setAlpha(Math.sin(this._iframes*0.025)>0?1:0.3);}
        else this.player.setAlpha(1);
        this._updateEnemies(dt);

        const nearest=this._nearestInteractable();
        if(nearest){
            this.interactHint.setText('[ E ] '+(nearest.hintLabel||'Examine'));
            this.interactHint.setPosition(nearest.x-this.interactHint.width/2,nearest.y-42);
            this.interactHint.setVisible(true);
        } else {this.interactHint.setVisible(false);}

        const down=this.eKey.isDown||window.virtualKeys.action;
        if(down&&!this._actionWasPressed){
            this._actionWasPressed=true;
            if(nearest){
                const text=typeof nearest.getText==='function'?nearest.getText(this):(nearest.text||'');
                const spk=typeof nearest.getSpeaker==='function'?nearest.getSpeaker(this):(nearest.speaker||'');
                if(text){
                    if(window.soundManager&&window.soundManager.ready)window.soundManager.playInteract();
                    const isDiscovery=nearest.id==='glowing_clue'&&!this._localCollected.has('glowing_seen');
                    if(isDiscovery){
                        this._localCollected.add('glowing_seen');
                        this.cameras.main.shake(500,0.005);
                        if(window.soundManager&&window.soundManager.ready)window.soundManager.playDiscovery();
                        const fl=this.add.graphics(); fl.fillStyle(0xffffff,1); fl.fillRect(0,0,480,320);
                        fl.setScrollFactor(0).setDepth(200);
                        this.tweens.add({targets:fl,alpha:{from:0.7,to:0},duration:900,ease:'Sine.easeOut',
                            onComplete:()=>{fl.destroy();this.dialogue.show(spk,text,()=>{if(nearest.onInteract)nearest.onInteract(this);});}});
                    } else {
                        this.dialogue.show(spk,text,()=>{if(nearest.onInteract)nearest.onInteract(this);});
                    }
                }
            }
        }
        if(!down)this._actionWasPressed=false;
        this._checkRadZones(dt);
        this._checkExits();
        this._checkEndingInput();
    }

    _nearestInteractable(){
        let best=null,bestDist=Infinity;
        const px=this.player.x,py=this.player.y;
        for(const obj of this.interactables){
            if(obj.disabled)continue;
            const d=Phaser.Math.Distance.Between(px,py,obj.x,obj.y);
            if(d<=obj.range&&d<bestDist){bestDist=d;best=obj;}
        }
        return best;
    }

    _checkExits(){
        if(this._transitioning||this.dialogue.isVisible()||this._endingListening)return;
        if(this.player.x<18) this._goToScene('GameScene',970,380);
    }

    _goToScene(key,entryX,entryY){
        if(this._transitioning)return;
        this._transitioning=true;
        this.player.setVelocity(0,0);
        this._saveState();
        window.gameState.entryX=entryX; window.gameState.entryY=entryY;
        this.cameras.main.fade(600,0,0,0);
        this.time.delayedCall(650,()=>this.scene.start(key));
    }

    _saveState(){
        if(!window.gameState)window.gameState={};
        const prev=new Set(window.gameState.collected||[]);
        this._localCollected.forEach(c=>prev.add(c));
        window.gameState.collected  =Array.from(prev);
        window.gameState.artifactCounts={...this._artifactCounts};
        window.gameState.endingPlayed=this._endingPlayed;
        window.gameState.gateOpen=true;
        window.gameState.hp    =this._hp;
        window.gameState.maxHp =this._maxHp;
        SaveManager.save(window.gameState);
    }

    _setupInput(){
        this.cursors  =this.input.keyboard.createCursorKeys();
        this.wasd     =this.input.keyboard.addKeys({
            up:Phaser.Input.Keyboard.KeyCodes.W,down:Phaser.Input.Keyboard.KeyCodes.S,
            left:Phaser.Input.Keyboard.KeyCodes.A,right:Phaser.Input.Keyboard.KeyCodes.D
        });
        this.eKey     =this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.xKey     =this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
        this.spaceKey =this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.iKey     =this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I);
    }

    // --- Combat ---
    _startAttack(){
        if(this._attacking)return;
        this._attacking=true;this._attackTimer=300;this._attackCooldown=500;
        if(window.soundManager&&window.soundManager.ready)window.soundManager.playSwing();
    }
    _updateAttack(delta){
        this._attackTimer-=delta;
        const hx=this.player.x+this._attackDir.x*50,hy=this.player.y+this._attackDir.y*50;
        this._attackGfx.clear();
        const p=1-(this._attackTimer/300),a=p<0.5?p*2:(1-p)*2;
        this._attackGfx.fillStyle(0xd4a840,a*0.7);this._attackGfx.fillRect(hx-20,hy-20,40,40);
        for(const e of this._enemies){
            if(e.isDead||e._hitThisSwing)continue;
            if(Phaser.Math.Distance.Between(hx,hy,e.x,e.y)<50){e._hitThisSwing=true;this._hitEnemy(e);}
        }
        if(this._attackTimer<=0){
            this._attacking=false;this._attackGfx.clear();
            this._enemies.forEach(e=>e._hitThisSwing=false);
        }
    }
    _hitEnemy(e){
        const col=(window.gameState&&window.gameState.collected)||[];
        e.hp-=col.includes('ember_stick')?2:1;
        e.state='STUNNED';e.stunnedTimer=400;
        if(e.hp<=0)this._killEnemy(e);
    }
    _killEnemy(e){
        e.isDead=true;e.state='DEAD';drawCreature(e);
        if(window.soundManager&&window.soundManager.ready)window.soundManager.playEnemyDie();
        this.time.delayedCall(500,()=>{e._gfx.destroy();e._hpGfx.destroy();});
    }
    _spawnEnemies(){
        this._enemies.push(createCreature(this,'FACILITY_GUARD',480,350));
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
        this._heartsHUD.setHp(this._hp);this._heartsHUD.flashDamage();
        this.cameras.main.shake(200,0.008);
        if(window.soundManager&&window.soundManager.ready)window.soundManager.playHurt();
        this._iframes=1200;
        if(this._hp<=0)this._handleDeath();
    }
    _handleDeath(){
        if(this._transitioning)return;
        this._transitioning=true;
        this.player.setVelocity(0,0);
        this._saveState();window.gameState.hp=5;window.gameState.maxHp=5;
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

    // ----------------------------------------------------------
    // MAP
    // ----------------------------------------------------------
    _createGround(w,h){
        const g=this.add.graphics();
        // Dark, sickly base
        g.fillStyle(0x1e2a14); g.fillRect(0,0,w,h);
        // Cracked pavement (main compound area)
        g.fillStyle(0x3a3a32); g.fillRect(80,80,800,560);
        // Cracked pavement lines
        g.lineStyle(1,0x4a4a40,0.5);
        for(let cx=120;cx<880;cx+=80) g.lineBetween(cx,80,cx+20,640);
        for(let cy=120;cy<640;cy+=70) g.lineBetween(80,cy,880,cy+15);
        // Contamination zones (green-brown patches seeping through cracks)
        g.fillStyle(0x3a5a18,0.55); g.fillEllipse(280,380,180,100);
        g.fillStyle(0x4a6a10,0.4);  g.fillEllipse(600,480,200,120);
        g.fillStyle(0x2a4a10,0.45); g.fillEllipse(750,280,160,90);
        g.fillStyle(0x5a7a08,0.3);  g.fillEllipse(420,560,220,100);
        // Oil/chemical stains
        g.fillStyle(0x1a1a14,0.6);
        g.fillEllipse(340,290,100,60); g.fillEllipse(680,400,120,70);
        // Perimeter grass (outside pavement)
        g.fillStyle(0x1a2e0e); g.fillRect(0,0,80,h); g.fillRect(880,0,80,h);
        g.fillRect(0,0,w,80); g.fillRect(0,640,w,80);
        // West gate opening (entry from camp)
        g.fillStyle(0x2a3a1a); g.fillRect(0,320,90,80);

        // Path from gate to interior
        g.fillStyle(0x3a3830); g.fillRect(0,340,200,40);
    }

    _createFacilityBuilding(){
        const x=580,y=100;
        const g=this.add.graphics().setDepth(4);
        // Shadow
        g.fillStyle(0x000000,0.3); g.fillRect(x+12,y+220,260,20);
        // Main structure — concrete brutalist
        g.fillStyle(0x5a5a50); g.fillRect(x,y,258,220);
        g.lineStyle(2,0x4a4a40); g.strokeRect(x,y,258,220);
        // Facade panels
        g.fillStyle(0x4a4a40,0.4);
        for(let px=x+20;px<x+258;px+=40) g.fillRect(px,y,2,220);
        for(let py=y+40;py<y+220;py+=50) g.fillRect(x,py,258,2);
        // Broken windows
        [[x+30,y+40],[x+110,y+40],[x+190,y+40],[x+30,y+120],[x+110,y+120]].forEach(([wx,wy])=>{
            g.fillStyle(0x1a2a3a); g.fillRect(wx,wy,30,26);
            g.lineStyle(1,0x3a4a5a); g.strokeRect(wx,wy,30,26);
            // Cracked glass
            g.lineStyle(1,0x8aaabb,0.4);
            g.lineBetween(wx+2,wy+2,wx+28,wy+24); g.lineBetween(wx+28,wy+2,wx+2,wy+24);
        });
        // Loading door (large, center)
        g.fillStyle(0x2a2a22); g.fillRect(x+96,y+148,68,72);
        g.lineStyle(2,0x4a4a38); g.strokeRect(x+96,y+148,68,72);
        g.lineStyle(1,0x3a3a2a); g.lineBetween(x+130,y+148,x+130,y+220);
        // SECTOR 7 sign
        const sg=this.add.graphics().setDepth(5);
        sg.fillStyle(0x3a3020); sg.fillRect(x+68,y+60,122,28);
        sg.lineStyle(1,0xaa8820); sg.strokeRect(x+68,y+60,122,28);
        this.add.text(x+129,y+74,'SECTOR 7',{fontSize:'9px',fill:'#ffcc00',fontFamily:'monospace',fontStyle:'bold'}).setDepth(6).setOrigin(0.5);
        this.add.text(x+129,y+88,'AUTHORIZED PERSONNEL ONLY',{fontSize:'5px',fill:'#888844',fontFamily:'monospace'}).setDepth(6).setOrigin(0.5);
        // Radiation symbols
        [x+50,x+220].forEach(rx=>{
            const rg=this.add.graphics().setDepth(5);
            rg.fillStyle(0xffcc00,0.8); rg.fillCircle(rx,y+34,12);
            rg.fillStyle(0x1a1a14,0.9);
            for(let a=0;a<3;a++){const ang=(a*120+30)*Math.PI/180;rg.fillTriangle(rx,y+34,rx+Math.cos(ang)*12,y+34+Math.sin(ang)*12,rx+Math.cos(ang+0.9)*12,y+34+Math.sin(ang+0.9)*12);}
            rg.fillCircle(rx,y+34,4);
        });
        const mk=(bx,by,bw,bh)=>{const b=this.obstacles.create(bx+bw/2,by+bh/2,'pixel');b.setDisplaySize(bw,bh);b.refreshBody();};
        mk(x,y,258,220);
    }

    _createGateExit(){
        const g=this.add.graphics().setDepth(4);
        // Open gate frame (already open — player came through it)
        g.lineStyle(4,0x808060); g.lineBetween(0,320,0,400);
        g.lineStyle(2,0x909870,0.6);
        for(let gy=320;gy<400;gy+=12) g.lineBetween(0,gy,16,gy+5);
        // "← CAMP" sign
        g.fillStyle(0x8a7a50,0.8); g.fillRect(4,350,68,24);
        this.add.text(38,362,'← CAMP',{fontSize:'7px',fill:'#e8ddb8',fontFamily:'monospace'}).setDepth(5).setOrigin(0.5);
    }

    _createTrees(){
        const pos=[[20,80],[30,200],[20,300],[30,500],[20,620],
                   [940,100],[950,250],[940,400],[950,560],[940,680]];
        pos.forEach(([tx,ty])=>{
            const sz=11+Math.floor(Math.random()*7);
            const g=this.add.graphics().setDepth(6);
            drawSicklyTree(g, tx, ty, sz);
        });
    }

    _createGlowingClue(){
        const cx=360,cy=450;
        // Eerie glow
        const glow=this.add.graphics().setDepth(3);
        glow.fillStyle(0x44ff44,0.15); glow.fillCircle(cx,cy,40);
        glow.fillStyle(0x88ff88,0.1);  glow.fillCircle(cx,cy,22);
        this.tweens.add({targets:glow,alpha:{from:0.9,to:0.3},yoyo:true,repeat:-1,duration:1400});
        // The cylinder
        const g=this.add.graphics().setDepth(4);
        g.fillStyle(0x3a3830); g.fillEllipse(cx,cy-8,22,12);
        g.fillStyle(0x4a4840); g.fillRect(cx-11,cy-8,22,28);
        g.fillStyle(0x3a3830); g.fillEllipse(cx,cy+20,22,12);
        // Crack glowing green
        g.lineStyle(2,0x44ff44,0.9); g.lineBetween(cx-4,cy-4,cx+6,cy+14);
        g.lineStyle(1,0x88ff88,0.6); g.lineBetween(cx-6,cy,cx+4,cy+18);
        // Hazard stripe
        g.fillStyle(0xffcc00,0.8);
        for(let i=0;i<4;i++) g.fillRect(cx-11,cy-8+i*7,22,3);
    }

    _createWorkerBadge(){
        const bx=510,by=540;
        const g=this.add.graphics().setDepth(3);
        g.fillStyle(0xf0f0e0); g.fillRect(bx-18,by-12,36,24);
        g.lineStyle(1,0x888870); g.strokeRect(bx-18,by-12,36,24);
        g.fillStyle(0x2244aa); g.fillRect(bx-16,by-10,32,10);
        g.fillStyle(0xc8c8b0); g.fillCircle(bx-8,by+4,5);
        this.add.text(bx+4,by+4,'COLE',{fontSize:'5px',fill:'#333320',fontFamily:'monospace'}).setDepth(4).setOrigin(0,0.5);
    }

    _createControlPanel(){
        const px=220,py=280;
        const g=this.add.graphics().setDepth(4);
        // Panel housing
        g.fillStyle(0x2a2a24); g.fillRect(px-50,py-60,100,80);
        g.lineStyle(2,0x444438); g.strokeRect(px-50,py-60,100,80);
        // Screen
        g.fillStyle(0x001800); g.fillRect(px-40,py-52,80,50);
        // Green scanlines
        g.fillStyle(0x004400,0.5);
        for(let sl=py-52;sl<py-2;sl+=4) g.fillRect(px-40,sl,80,2);
        // Screen text glow
        g.fillStyle(0x00cc44,0.6); g.fillRect(px-38,py-50,76,46);
        g.fillStyle(0x00aa33,0.4); g.fillRect(px-36,py-48,72,42);
        // Buttons
        [0x44ff44,0xff4444,0xffaa00].forEach((col,i)=>{
            g.fillStyle(col,0.8); g.fillCircle(px-26+i*26,py+8,5);
        });
        // Panel leg / mount
        g.fillStyle(0x1a1a16); g.fillRect(px-8,py+20,16,20);
        this.add.text(px,py-30,'PINEBROOK\nNUCLEAR',{fontSize:'5px',fill:'#00cc44',fontFamily:'monospace',align:'center'}).setDepth(5).setOrigin(0.5,0);
    }

    // ----------------------------------------------------------
    // INTERACTABLES + ENDING
    // ----------------------------------------------------------
    _buildInteractables(){
        const col=()=>(window.gameState&&window.gameState.collected)||[];
        this.interactables=[
            { id:'radiation_sign', x:200, y:130, range:65, hintLabel:'Read', speaker:'SIGN',
              text:'DANGER — IONISING RADIATION\nPINEBROOK NUCLEAR RESERVE\nSECTOR 7 — RESTRICTED\n\nREPORT ALL ANOMALIES TO SITE SUPERVISOR\nDO NOT ENTER WITHOUT AUTHORISATION' },
            { id:'glowing_clue', x:360, y:450, range:68, hintLabel:'???', speaker:'???',
              getText:(s)=>{
                  const c=col();
                  if(c.includes('glowing_inspected'))
                      return 'The cylinder still hums. Cracked casing.\nWhatever is leaking has been leaking a long time.\nThis whole area is contaminated.';
                  return 'A metallic cylinder, half-buried near the drainage grate.\nIt hums — a low, bone-deep vibration.\nA crack along the casing bleeds pale green light.';
              },
              onInteract:(s)=>{
                  const c=col();
                  if(!c.includes('glowing_inspected')){
                      s._localCollected.add('glowing_inspected');
                      if(window.gameState) window.gameState.collected=[...new Set([...(window.gameState.collected||[]),'glowing_inspected'])];
                  }
              }},
            { id:'worker_badge', x:510, y:540, range:60, hintLabel:'Examine', speaker:'ID BADGE',
              text:'PINEBROOK NUCLEAR RESERVE\nEMPLOYEE: MARCUS COLE\nID: NR-4471  CLEARANCE: LEVEL 2\n\n[EXPIRED — 3 YEARS AGO]\n\n[handwritten on back]\n"Site 4. If I\'m not back by dawn — go."' },
            { id:'facility_note', x:440, y:320, range:60, hintLabel:'Read note', speaker:'NOTE',
              text:'"Marcus — stay at site 4 until I get back.\nChecked Sector 7 this morning.\nSomething\'s wrong with the east containment wall.\nDon\'t touch anything. — R.D."' },
            { id:'abandoned_vehicle', x:680, y:580, range:65, hintLabel:'Examine', speaker:'',
              text:'A company truck, windows cracked, tyres flat.\nThe cab door is open.\nA coffee mug is still in the cupholder.' },
            { id:'control_panel', x:220, y:285, range:70, hintLabel:'Access terminal', speaker:'TERMINAL',
              getText:(s)=>{
                  const c=(window.gameState&&window.gameState.collected)||[];
                  const qs=(window.gameState&&window.gameState.questState)||0;
                  if(c.includes('facility_log'))
                      return 'PINEBROOK NUCLEAR RESERVE — FACILITY LOG — SECTOR 7\n\nCoolant loop: OFFLINE (14d 11h)\nCore temp: CRITICAL\nContainment: PARTIAL\n\n[ facility_log downloaded ]\n\nBring this to Frank.\nHe\'ll know what it means.';
                  return 'PINEBROOK NUCLEAR RESERVE — FACILITY LOG — SECTOR 7\n\nBreach: coolant line fracture\nDay 14 — Status: UNRESOLVED\n\nThis terminal has evidence of a covered-up meltdown.\nDownloading facility log...';
              },
              onInteract:(s)=>{
                  const c=(window.gameState&&window.gameState.collected)||[];
                  if(!c.includes('facility_log')){
                      s._localCollected.add('facility_log');
                      window.gameState.collected=[...new Set([...(window.gameState.collected||[]),'facility_log'])];
                      if(window.gameState)window.gameState.questState=Math.max((window.gameState.questState||0),QUEST_STATES.FOUND_LOG);
                      s.cameras.main.flash(500,0,255,0,false);
                      s.time.delayedCall(200,()=>s.dialogue.show('TERMINAL',
                          '[ DOWNLOAD COMPLETE ]\n\nFacility log — 14 days of readings.\nCore temperature, coolant status.\nProject Emberlight termination code.\n\nTake this to Frank.\nHe knows the land. He\'ll know what to do.'));
                  }
              }},
            // Equipment shed — respirator
            { id:'equipment_shed', x:820, y:600, range:68, hintLabel:'Search shed', speaker:'SHED',
              getText:(s)=>{
                  const c=(window.gameState&&window.gameState.collected)||[];
                  if(c.includes('respirator')) return 'The shed is mostly empty now.';
                  return 'A rusted metal equipment shed.\nMost hazmat gear rotted through.\nOne respirator on a hook — filter looks intact.';
              },
              onInteract:(s)=>{
                  const c=(window.gameState&&window.gameState.collected)||[];
                  if(!c.includes('respirator')){
                      s._localCollected.add('respirator');
                      window.gameState.collected=[...new Set([...(window.gameState.collected||[]),'respirator'])];
                      s.dialogue.show('','[ You took the respirator ]\nThe filter smells of rubber and age.\nBetter than nothing.');
                      if(!s._respHUD)s._respHUD=s.add.text(474,44,'| mask',{fontSize:'8px',fill:'#88ccff',fontFamily:'monospace'}).setScrollFactor(0).setDepth(95).setOrigin(1,0);
                  }
              }},
            // Copper wire — for ember-stick upgrade via Frank
            { id:'copper_wire', x:660, y:290, range:56, hintLabel:'Pick up', speaker:'',
              getText:(s)=>{
                  const c=(window.gameState&&window.gameState.collected)||[];
                  if(c.includes('copper_wire')) return null;
                  return 'A coil of copper wire, wrapped around a corroded pipe.\nSeems salvageable.';
              },
              onInteract:(s)=>{
                  const c=(window.gameState&&window.gameState.collected)||[];
                  if(!c.includes('copper_wire')){
                      s._localCollected.add('copper_wire');
                      window.gameState.collected=[...new Set([...(window.gameState.collected||[]),'copper_wire'])];
                      s.interactables.find(o=>o.id==='copper_wire').disabled=true;
                      s.dialogue.show('','[ You took the copper wire ]\nStill conductive. Could be useful.');
                  }
              }},
        ];
        // Draw copper wire visual (small coil graphic)
        const cwc=(window.gameState&&window.gameState.collected)||[];
        if(!cwc.includes('copper_wire')){
            const cwg=this.add.graphics().setDepth(3);
            cwg.lineStyle(2,0xcc8833,0.9);
            cwg.strokeCircle(660,290,7); cwg.strokeCircle(660,290,4);
            cwg.lineStyle(1,0xffaa44,0.6); cwg.lineBetween(660,283,660,278);
            const cwGlow=this.add.graphics().setDepth(2);
            cwGlow.fillStyle(0xffcc44,0.15); cwGlow.fillCircle(660,290,14);
            this.tweens.add({targets:cwGlow,alpha:{from:0.15,to:0.04},yoyo:true,repeat:-1,duration:1500});
        }
    }

    _createArtifacts(){
        const col=()=>(window.gameState&&window.gameState.collected)||[];
        const defs=[
            {id:'arrowhead_fac1',x:140,y:480,cat:'arrowheads',label:'Arrowhead'},
            {id:'tool_facility', x:740,y:340,cat:'tools',      label:'Stone Tool'},
        ];
        defs.forEach(d=>{
            if(col().includes(d.id))return;
            const g=this.add.graphics().setDepth(3);
            g.fillStyle(0xd4a840); g.fillTriangle(d.x,d.y-8,d.x-6,d.y+6,d.x+6,d.y+6);
            const glow=this.add.graphics().setDepth(2);
            glow.fillStyle(0xffdd44,0.2); glow.fillCircle(d.x,d.y,14);
            this.tweens.add({targets:glow,alpha:{from:0.2,to:0.05},yoyo:true,repeat:-1,duration:1600});
            this.interactables.push({
                id:d.id,x:d.x,y:d.y,range:44,hintLabel:'Pick up',
                text:`A ${d.label}. Old — predates the facility by centuries.`,
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

    _createPlayer(){
        createPlayerTextures(this);
        const gs=window.gameState;
        const sx=(gs&&gs.entryX)||32, sy=(gs&&gs.entryY)||360;
        this.player=this.physics.add.sprite(sx,sy,'player_idle');
        this.player.setCollideWorldBounds(true).setDepth(10);
    }

    // ----------------------------------------------------------
    // ENDING SEQUENCE
    // ----------------------------------------------------------
    _triggerEnding(){
        this._endingPlayed=true;
        const seq=[
            ['TERMINAL','PINEBROOK NUCLEAR RESERVE\nFACILITY LOG — SECTOR 7\n\nCoolant line fracture — Reactor 7\nLeak duration: 14+ days\nContainment status: FAILED'],
            ['TERMINAL','Personnel log:\n  23 evacuated  /  21 accounted for\n\n  MARCUS COLE  [NR-4471] — UNKNOWN\n  R. DARNELL   [NR-3382] — EVACUATED'],
            ['TERMINAL','[WARNING] Radiation level: CRITICAL\n[WARNING] Do not enter Sector 7\n\nAll remaining personnel:\nEVACUATE IMMEDIATELY'],
            ['NOTE','"Marcus — if you\'re reading this,\nI couldn\'t wait any longer.\nI left the truck at site 4.\nPlease just go home.  — R.D."'],
            ['','The terminal flickers.\nSomewhere beyond the fence,\nthe fire is still burning at Marcus\'s camp.\n\nNobody has come back for it.'],
        ];
        let i=0;
        const showNext=()=>{
            if(i>=seq.length){this._showEnding();return;}
            const[spk,txt]=seq[i++];
            this.dialogue.show(spk,txt,showNext);
        };
        showNext();
    }

    _showEnding(){
        this.player.setVelocity(0,0);
        this.cameras.main.fade(2500,0,0,0);
        this.time.delayedCall(2700,()=>{
            const overlay=this.add.graphics().setScrollFactor(0).setDepth(500);
            overlay.fillStyle(0x000000,1); overlay.fillRect(0,0,480,320);
            const cx=240,s=(sz,col)=>({fontSize:sz+'px',fill:col,fontFamily:'monospace',align:'center'});
            const texts=[
                this.add.text(cx,58,'PINEBROOK NUCLEAR RESERVE',s(9,'#00cc44')).setScrollFactor(0).setDepth(501).setOrigin(0.5).setAlpha(0),
                this.add.text(cx,74,'SECTOR 7  —  COOLANT BREACH',s(8,'#008833')).setScrollFactor(0).setDepth(501).setOrigin(0.5).setAlpha(0),
                this.add.text(cx,106,'STATUS: UNRESOLVED',s(10,'#ff4444')).setScrollFactor(0).setDepth(501).setOrigin(0.5).setAlpha(0),
                this.add.text(cx,146,'Marcus Cole was never found.',s(8,'#aaaaaa')).setScrollFactor(0).setDepth(501).setOrigin(0.5).setAlpha(0),
                this.add.text(cx,164,'R. Darnell reported the breach three days later.',s(8,'#aaaaaa')).setScrollFactor(0).setDepth(501).setOrigin(0.5).setAlpha(0),
                this.add.text(cx,182,'The campfire burned out on its own.',s(8,'#aaaaaa')).setScrollFactor(0).setDepth(501).setOrigin(0.5).setAlpha(0),
                this.add.text(cx,238,'CAMPING PARK MYSTERY',s(13,'#ffffff')).setScrollFactor(0).setDepth(501).setOrigin(0.5).setAlpha(0),
                this.add.text(cx,258,'THE END',s(9,'#888888')).setScrollFactor(0).setDepth(501).setOrigin(0.5).setAlpha(0),
            ];
            const restartPrompt=this.add.text(cx,294,'[ A ] Play again',s(8,'#555555')).setScrollFactor(0).setDepth(501).setOrigin(0.5).setAlpha(0);
            texts.forEach((t,i)=>this.tweens.add({targets:t,alpha:1,delay:400+i*300,duration:600,ease:'Sine.easeIn'}));
            this.time.delayedCall(3200,()=>{
                this.tweens.add({targets:restartPrompt,alpha:{from:1,to:0.2},yoyo:true,repeat:-1,duration:700});
                this._actionWasPressed=false; this._endingListening=true;
            });
        });
    }

    _checkEndingInput(){
        if(!this._endingListening)return;
        const down=(this.eKey&&this.eKey.isDown)||window.virtualKeys.action;
        if(down&&!this._actionWasPressed){
            this._actionWasPressed=true; this._endingListening=false;
            window.gameState=null;
            this.cameras.main.fadeIn(800,0,0,0);
            this.time.delayedCall(900,()=>this.scene.start('TitleScene'));
        }
        if(!down)this._actionWasPressed=false;
    }
}
