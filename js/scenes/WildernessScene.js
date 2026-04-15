// ============================================================
// WildernessScene.js — South Wilderness
// World: 1280x960. Entry from GameScene south edge.
// Campsites: C(Harold) D(Cedar) E(Oak/Dana) F(Frank/Willow)
// Cave entrance at south-center (needs walking_stick).
// Exit north -> GameScene | cave -> CaveScene.
// ============================================================
class WildernessScene extends Phaser.Scene {
    constructor() { super({ key: 'WildernessScene' }); }

    create() {
        const W = 1280, H = 960;
        this.WORLD_W = W; this.WORLD_H = H;
        this._actionWasPressed = false;
        this._walkFrame=0; this._walkTimer=0; this._footstepTimer=0;
        this._transitioning = false;
        this._artifactCounts = (window.gameState&&window.gameState.artifactCounts)
            ? {...window.gameState.artifactCounts} : {arrowheads:0,pottery:0,tools:0};
        this._localCollected = new Set((window.gameState&&window.gameState.collected)||[]);
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
        this._createIceCreamShack();
        this._createRecArea();
        this._createCampsiteBirch();   // C - Harold
        this._createCampsiteCedar();   // D - Cedar (empty/Mia is at lake)
        this._createCampsiteOak();     // E - Dana
        this._createCampsiteWillow();  // F - Frank
        this._createCaveEntrance();
        this._createTrees();
        this._createBushes();
        this._createExitMarker();

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
        const qs=(window.gameState&&window.gameState.questState)||0;
        if(qs>=QUEST_STATES.INSIDE)this._spawnEnemies();

        this.interactHint=this.add.text(0,0,'',{
            fontSize:'9px',fill:'#ffffff',fontFamily:'monospace',
            backgroundColor:'#000000bb',padding:{x:5,y:3}
        }).setDepth(50).setVisible(false).setScrollFactor(0);

        this.add.text(W/2,10,'SOUTH WILDERNESS',{
            fontSize:'8px',fill:'#44664488',fontFamily:'monospace'
        }).setScrollFactor(0).setDepth(20).setOrigin(0.5,0);

        if(window.gameState&&window.gameState.collected&&window.gameState.collected.includes('walking_stick'))
            this._showWalkingStickHUD();

        if(window.gameState&&window.gameState.entryX){
            this.player.setPosition(window.gameState.entryX, window.gameState.entryY);
            delete window.gameState.entryX; delete window.gameState.entryY;
        }
    }

    update(time,delta) {
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

        // Attack input
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
            const _cam=this.cameras.main;
            const _sx=(nearest.x-_cam.scrollX)*_cam.zoom;
            const _sy=(nearest.y-_cam.scrollY)*_cam.zoom;
            this.interactHint.setPosition(_sx-this.interactHint.width/2,_sy-42);
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
                    this.dialogue.show(spk,text,()=>{if(nearest.onInteract)nearest.onInteract(this);});
                }
            }
        }
        if(!down)this._actionWasPressed=false;
        this._checkExits();
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
        if(this._transitioning||this.dialogue.isVisible())return;
        const px=this.player.x,py=this.player.y;
        if(py<18) this._goToScene('GameScene', px, 882);
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

    _enterCave(){
        if(this._transitioning)return;
        const col=(window.gameState&&window.gameState.collected)||[];
        if(!col.includes('walking_stick')){
            this.dialogue.show('','The cave entrance is blocked by fallen debris.\nYou\'d need a sturdy walking stick to clear it.');
            return;
        }
        this._transitioning=true;
        this.player.setVelocity(0,0);
        this._saveState();
        this.cameras.main.fade(900,0,0,0);
        this.time.delayedCall(1000,()=>this.scene.start('CaveScene'));
    }

    _saveState(){
        if(!window.gameState)window.gameState={};
        const prev=new Set(window.gameState.collected||[]);
        this._localCollected.forEach(c=>prev.add(c));
        window.gameState.collected  =Array.from(prev);
        window.gameState.artifactCounts={...this._artifactCounts};
        window.gameState.hp    =this._hp;
        window.gameState.maxHp =this._maxHp;
        SaveManager.save(window.gameState);
    }

    _setupInput(){
        this.cursors  =this.input.keyboard.createCursorKeys();
        this.wasd     =this.input.keyboard.addKeys({
            up:Phaser.Input.Keyboard.KeyCodes.W, down:Phaser.Input.Keyboard.KeyCodes.S,
            left:Phaser.Input.Keyboard.KeyCodes.A, right:Phaser.Input.Keyboard.KeyCodes.D
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
        [280,520,760].forEach(ex=>this._enemies.push(createCreature(this,'GLOWING_RAT',ex,770)));
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

    _showWalkingStickHUD(){
        if(this._stickHUD)return;
        this._stickHUD=this.add.text(474,22,'| stick',{
            fontSize:'8px',fill:'#d4a840',fontFamily:'monospace'
        }).setScrollFactor(0).setDepth(95).setOrigin(1,0);
    }

    // ----------------------------------------------------------
    // MAP & STRUCTURES
    // ----------------------------------------------------------
    _createGround(w,h){
        const g=this.add.graphics();
        g.fillStyle(0x2d5a1e); g.fillRect(0,0,w,h);
        // Dense forest bands along edges
        g.fillStyle(0x1a3a0e); g.fillRect(0,0,w,60);      // top border forest
        g.fillStyle(0x162e0c); g.fillRect(0,0,80,h);       // left dense forest
        g.fillStyle(0x1a3a0e); g.fillRect(w-80,0,80,h);    // right forest
        g.fillStyle(0x162e0c); g.fillRect(0,h-60,w,60);    // south forest edge
        // Lighter clearings (campsite areas)
        g.fillStyle(0x4a7a2a);
        [[200,100,220,130],[560,80,200,120],[860,100,230,130],[200,480,200,130],[560,520,220,130],[860,480,200,130]].forEach(([x,y,pw,ph])=>g.fillRect(x,y,pw,ph));
        // Slightly darker understory
        g.fillStyle(0x233a16);
        [[150,300,120,80],[400,350,130,70],[680,320,120,80],[950,340,130,70],[300,680,120,70],[700,660,130,70],[1050,680,110,70]].forEach(([x,y,pw,ph])=>g.fillRect(x,y,pw,ph));

        // Dirt paths
        const P=0x8a7a55,PE=0x9a8a65;
        g.fillStyle(P);
        g.fillRect(80,20,1120,42);    // north road (entry from camp)
        g.fillRect(80,20,42,940);     // west N-S road
        g.fillRect(80,540,1120,42);   // mid E-W road
        g.fillRect(620,20,42,940);    // center N-S road
        g.fillRect(1158,20,42,940);   // east N-S road
        // Campsite spurs
        g.fillRect(270,62,42,120);    // spur to Birch
        g.fillRect(640,62,42,120);    // spur to Cedar
        g.fillRect(900,62,42,120);    // spur to Oak
        g.fillRect(270,582,42,130);   // spur to Willow
        g.fillRect(1060,582,42,120);  // spur to Dottie
        // Cave trail (south, center)
        g.fillRect(598,860,66,100);   // south to cave
        g.fillStyle(0x7a6a48,0.5);
        g.fillRect(598,900,66,60);    // cave trail gets darker
        // Path edges
        g.fillStyle(PE,0.3);
        g.fillRect(80,18,1120,5); g.fillRect(80,60,1120,5);

        // Creek (cuts across mid-south)
        g.fillStyle(0x2a6a9a,0.7);
        g.fillRect(180,760,880,20);
        g.fillStyle(0x1a5a8a,0.5); g.fillRect(180,762,880,8);
        // Creek banks
        g.fillStyle(0xa8a060,0.4); g.fillRect(180,756,880,8); g.fillRect(180,780,880,8);

        // Scattered rocks near forest edges and creek bank
        [[122,198],[164,378],[202,558],[902,218],[1002,398],[1102,578],
         [282,754],[402,757],[602,752],[802,755],[952,757],[480,340],[740,280]].forEach(([rx,ry])=>{
            const rg=this.add.graphics().setDepth(2);
            drawRock(rg, rx, ry, 5+Math.floor(Math.random()*5));
        });
        // Grass tufts along path edges
        [[122,54],[302,54],[502,54],[702,54],[902,54],[1102,54],
         [122,581],[302,581],[502,581],[700,320],[450,480],[880,450]].forEach(([gx,gy])=>{
            const gg=this.add.graphics().setDepth(2);
            drawGrassTuft(gg, gx, gy, 0x3a8020);
        });
    }

    _createCampsiteBirch(){       // C - Harold (retired ranger)
        const cx=280,cy=140;
        const g=this.add.graphics().setDepth(3);
        // Irregular clearing
        g.fillStyle(0x3a6a1e,0.5);  g.fillEllipse(cx,    cy+8,  200,110);
        g.fillStyle(0x427530,0.3);  g.fillEllipse(cx+15, cy-10, 160, 80);
        // Grass tufts
        [[cx-60,cy+20],[cx+30,cy+25],[cx-20,cy-18],[cx+40,cy-8],[cx-45,cy+5]].forEach(([gx,gy])=>drawGrassTuft(g,gx,gy,0x3a7820));
        // Fire + rocks
        this._drawFire(g,cx+18,cy-24);
        [[-18,0],[18,0],[0,-15],[14,-8],[-14,-8]].forEach(([dx,dy])=>drawRock(g,cx+18+dx,cy-24+dy,4));
        // Log seats
        drawLogSeat(g,cx+2, cy-42);
        drawLogSeat(g,cx+36,cy-14);
        // Ranger gear: tent + backpack + survey table
        this._drawTent(g,cx-38,cy+16,0x3a6a28,0x5a8a40);
        drawBackpack(g,cx-14,cy+26);
        this._drawTable(g,cx+20,cy-32);
        this.add.text(cx+20,cy-42,'SURVEY',{fontSize:'4px',fill:'#d4c080',fontFamily:'monospace'}).setDepth(5).setOrigin(0.5);
        this._drawTable(g,cx+55,cy+18);
        this._drawSiteSign(g,cx-78,cy-28,'C');
        // Harold NPC
        const np=this.add.graphics().setDepth(8);
        const hx=cx+60,hy=cy+30;
        drawNPC(np, hx, hy, 0x8a6a3a, 0xb0906a, 0x5a4a30);
        np.fillStyle(0x4a3a20); np.fillRect(hx-9,hy-22,18,4); np.fillRect(hx-6,hy-28,12,8);
    }

    _createCampsiteCedar(){      // D - Cedar / Mia (abandoned — she went to the lake)
        const cx=660,cy=130;
        const g=this.add.graphics().setDepth(3);
        g.fillStyle(0x3a6a1e,0.5); g.fillEllipse(cx,cy+8,200,110);
        g.fillStyle(0x427530,0.28); g.fillEllipse(cx-10,cy-8,160,80);
        [[cx-55,cy+18],[cx+35,cy+22],[cx-18,cy-16],[cx+42,cy-6]].forEach(([gx,gy])=>drawGrassTuft(g,gx,gy,0x3a7820));
        // Cold fire ring — no flames, just dark pit + rocks
        g.fillStyle(0x1a1008); g.fillCircle(cx-14,cy-20,11);
        [[-16,4],[16,4],[0,-14],[13,-7],[-13,-7]].forEach(([dx,dy])=>drawRock(g,cx-14+dx,cy-20+dy,4));
        // Tent + abandoned gear
        this._drawTent(g,cx+42,cy+14,0x7a3a9a,0xa060c0);
        drawBackpack(g,cx+20,cy+24);
        drawCooler(g,cx-30,cy+26);
        this._drawTable(g,cx-52,cy+20);
        this._drawSiteSign(g,cx+82,cy-26,'D');
        // Note pinned to post
        const ng=this.add.graphics().setDepth(4);
        ng.fillStyle(0xf0e090); ng.fillRect(cx-90,cy-10,36,28);
        ng.lineStyle(1,0xc0a040); ng.strokeRect(cx-90,cy-10,36,28);
        this.add.text(cx-72,cy+4,'gone to\nthe lake',{fontSize:'5px',fill:'#4a3810',fontFamily:'monospace',align:'center'}).setDepth(5).setOrigin(0.5);
    }

    _createCampsiteOak(){        // E - Group site / Counselor Dana
        const cx=930,cy=150;
        const g=this.add.graphics().setDepth(3);
        // Three overlapping ellipses for big irregular clearing
        g.fillStyle(0x3a6a1e,0.5);  g.fillEllipse(cx,    cy+8,  240,120);
        g.fillStyle(0x427530,0.28); g.fillEllipse(cx-20, cy-12, 190, 90);
        g.fillStyle(0x3e6c2a,0.2);  g.fillEllipse(cx+25, cy+20, 160, 80);
        // Tufts
        [[cx-80,cy+25],[cx+50,cy+30],[cx-35,cy-18],[cx+65,cy-5],[cx-60,cy+5],[cx+25,cy+40],[cx-10,cy-25],[cx+55,cy+20],[cx-45,cy+35],[cx+10,cy-12]].forEach(([gx,gy])=>drawGrassTuft(g,gx,gy,0x3a7820));
        // Fire + rocks
        this._drawFire(g,cx-8,cy-18);
        [[-18,0],[18,0],[0,-15],[14,-8],[-14,-8]].forEach(([dx,dy])=>drawRock(g,cx-8+dx,cy-18+dy,4));
        // Log seats (group site gets 4)
        drawLogSeat(g,cx-28,cy-36);
        drawLogSeat(g,cx+16,cy-36);
        drawLogSeat(g,cx+18,cy-2);
        drawLogSeat(g,cx-28,cy-2);
        // Lean-to
        g.fillStyle(0x7a5a28); g.fillRect(cx-60,cy+10,80,16);
        g.fillStyle(0x6a4a20);
        g.fillRect(cx-60,cy-14,6,28); g.fillRect(cx+14,cy-14,6,28);
        this._drawTent(g,cx+52,cy+8,0x8a4a20,0xb06030);
        // Cooler + tables
        drawCooler(g,cx+40,cy+26);
        this._drawTable(g,cx-30,cy+26);
        this._drawTable(g,cx+10,cy+26);
        // Flagpole
        g.fillStyle(0x5a3a18); g.fillRect(cx+78,cy-36,3,28);
        g.fillStyle(0xcc3333); g.fillRect(cx+81,cy-36,12,8);
        this._drawSiteSign(g,cx+98,cy-22,'E');
        // Dana NPC
        const np=this.add.graphics().setDepth(8);
        const dx=cx-40,dy=cy+35;
        drawNPC(np, dx, dy, 0xc84838, 0x2a1808, 0x4a3a6a);
    }

    _createCampsiteWillow(){     // F - Frank (bushcraft — no tent)
        const cx=280,cy=580;
        const g=this.add.graphics().setDepth(3);
        g.fillStyle(0x283818,0.6); g.fillEllipse(cx,cy+10,230,120);
        g.fillStyle(0x304020,0.3); g.fillEllipse(cx+15,cy-8,180,90);
        [[cx-65,cy+22],[cx+35,cy+28],[cx-25,cy-16],[cx+45,cy-6],[cx-45,cy+10]].forEach(([gx,gy])=>drawGrassTuft(g,gx,gy,0x3a7020));
        // Fire with extra rocks (Frank is careful)
        this._drawFire(g,cx+8,cy-18);
        [[-20,2],[20,2],[0,-17],[15,-9],[-15,-9],[0,8]].forEach(([dx,dy])=>drawRock(g,cx+8+dx,cy-18+dy,4));
        // Log seats (3 close to fire)
        drawLogSeat(g,cx-14,cy-36);
        drawLogSeat(g,cx+30,cy-28);
        drawLogSeat(g,cx-12,cy-6);
        // Lean-to (Frank sleeps rough — no tent)
        g.fillStyle(0x4a3a18); g.fillRect(cx-70,cy-10,50,40);
        g.fillStyle(0x3a6a1a,0.7); g.fillRect(cx-72,cy-22,54,16);
        g.fillStyle(0x2a4a12,0.5); g.fillRect(cx-70,cy-18,50,10);
        // Artifact display — flat stone with finds
        g.fillStyle(0x5a5040); g.fillEllipse(cx+50,cy+10,40,20);  // flat stone
        g.fillStyle(0x6a6050); g.fillEllipse(cx+50,cy+8,36,16);
        drawRock(g,cx+40,cy+6,4); drawRock(g,cx+56,cy+8,3);
        g.fillStyle(0xd4a840); g.fillCircle(cx+48,cy+5,3); g.fillCircle(cx+54,cy+4,2); // artifact glints
        // Gear
        drawBackpack(g,cx-52,cy+8);
        this._drawTable(g,cx+40,cy+22);
        this._drawSiteSign(g,cx-92,cy-22,'F');
        // Frank NPC + hat
        const np=this.add.graphics().setDepth(8);
        const fx=cx+10,fy=cy+30;
        drawNPC(np, fx, fy, 0x4a3a20, 0xb88840, 0x3a2a10);
        np.fillStyle(0x3a2a10); np.fillRect(fx-10,fy-22,20,4); np.fillRect(fx-6,fy-28,12,8);
        // Campfire embers glow
        const glow=this.add.graphics().setDepth(2);
        glow.fillStyle(0xff6600,0.15); glow.fillCircle(cx+8,cy-18,28);
        this.tweens.add({targets:glow,alpha:{from:0.15,to:0.04},yoyo:true,repeat:-1,duration:1800});
    }

    _createIceCreamShack(){
        const sx=1078,sy=630;
        const g=this.add.graphics().setDepth(4);
        g.fillStyle(0xfff8ee); g.fillRect(sx,sy,88,62);
        g.lineStyle(2,0xddccaa); g.strokeRect(sx,sy,88,62);
        for(let i=0;i<6;i++){g.fillStyle(i%2===0?0xff88aa:0xffffff);g.fillRect(sx+i*15,sy-12,15,12);}
        g.lineStyle(2,0xcc6688); g.strokeRect(sx,sy-12,88,12);
        this.add.text(sx+44,sy+8,"DOTTIE'S",{fontSize:'7px',fill:'#cc4466',fontFamily:'monospace',fontStyle:'bold'}).setDepth(5).setOrigin(0.5);
        this.add.text(sx+44,sy+20,'ICE CREAM',{fontSize:'6px',fill:'#884422',fontFamily:'monospace'}).setDepth(5).setOrigin(0.5);
        const mk=(bx,by,bw,bh)=>{const b=this.obstacles.create(bx+bw/2,by+bh/2,'pixel');b.setDisplaySize(bw,bh);b.refreshBody();};
        mk(sx,sy,88,62);
    }

    _createRecArea(){
        const rx=640,ry=620;
        const g=this.add.graphics().setDepth(3);
        // Volleyball net
        g.lineStyle(3,0xaa8855); g.lineBetween(rx-60,ry+20,rx+60,ry+20);
        g.lineStyle(4,0x6a4a20); g.lineBetween(rx-60,ry,rx-60,ry+40); g.lineBetween(rx+60,ry,rx+60,ry+40);
        g.lineStyle(1,0xddaa66,0.7);
        for(let nx=rx-56;nx<rx+60;nx+=8) g.lineBetween(nx,ry,nx,ry+40);
        // Horseshoe pit
        const hx=rx+180,hy=ry+30;
        g.fillStyle(0x8a7a50); g.fillEllipse(hx,hy,60,40);
        g.fillStyle(0x6a5a38); g.fillEllipse(hx,hy,40,26);
        g.fillStyle(0xaaaaaa); g.fillRect(hx-18,hy-3,4,6); g.fillRect(hx+14,hy-3,4,6);
    }

    _createCaveEntrance(){
        const cx=634,cy=902;
        const g=this.add.graphics().setDepth(4);
        // Rocky outcrop
        g.fillStyle(0x2a2a2a); g.fillEllipse(cx,cy,140,70);
        g.fillStyle(0x1a1a1a); g.fillEllipse(cx,cy+10,80,40);
        // Cave mouth
        g.fillStyle(0x080808); g.fillEllipse(cx,cy+6,68,36);
        // Rock details
        g.fillStyle(0x3a3a3a);
        [[-55,0,-40,12,-48,-8],[40,4,58,14,48,-6],[-28,-16,0,-24,20,-18]].forEach(([x1,y1,x2,y2,x3,y3])=>
            g.fillTriangle(cx+x1,cy+y1,cx+x2,cy+y2,cx+x3,cy+y3));
        // Debris (blocking entrance)
        g.fillStyle(0x5a4a30);
        g.fillRect(cx-24,cy+2,14,16); g.fillRect(cx+10,cy,12,14); g.fillRect(cx-8,cy-2,20,10);
        // Cave label
        this.add.text(cx,cy-42,'[ CAVE ENTRANCE ]',{
            fontSize:'7px',fill:'#aaaaaa',fontFamily:'monospace'
        }).setDepth(5).setOrigin(0.5);
        // Eerie glow from inside
        const glow=this.add.graphics().setDepth(2);
        glow.fillStyle(0x3a5a8a,0.2); glow.fillEllipse(cx,cy,100,50);
        this.tweens.add({targets:glow,alpha:{from:0.2,to:0.06},yoyo:true,repeat:-1,duration:2200});
    }

    _drawFire(g,fx,fy){
        g.fillStyle(0x2a1a08); g.fillCircle(fx,fy+2,13);
        g.fillStyle(0x555555);
        [[-9,5],[9,5],[0,-7],[7,-2],[-7,-2]].forEach(([dx,dy])=>g.fillCircle(fx+dx,fy+dy,4));
        g.fillStyle(0xdd4400); g.fillTriangle(fx,fy-16,fx-9,fy+5,fx+9,fy+5);
        g.fillStyle(0xff7700); g.fillTriangle(fx,fy-11,fx-6,fy+4,fx+6,fy+4);
        g.fillStyle(0xffcc00); g.fillTriangle(fx,fy-6,fx-3,fy+3,fx+3,fy+3);
    }
    _drawTent(g,tx,ty,main,accent){
        g.fillStyle(0x000000,0.2); g.fillEllipse(tx,ty+22,56,14);
        g.fillStyle(main); g.fillTriangle(tx,ty-24,tx-26,ty+12,tx+26,ty+12);
        g.fillStyle(accent); g.fillTriangle(tx,ty-24,tx-8,ty+12,tx+8,ty+12);
        g.fillStyle(0x1a1200); g.fillRect(tx-7,ty+2,14,12);
    }
    _drawTable(g,tx,ty){
        g.fillStyle(0x8a6a3a); g.fillRect(tx-22,ty-6,44,8);
        g.fillStyle(0x6a4a22); g.fillRect(tx-18,ty+2,6,14); g.fillRect(tx+12,ty+2,6,14);
    }
    _drawSiteSign(g,sx,sy,letter){
        g.fillStyle(0x8a6a3a); g.fillRect(sx-3,sy,6,22);
        g.fillStyle(0xf0e090); g.fillRect(sx-14,sy-16,28,18);
        g.lineStyle(1,0xaa8040); g.strokeRect(sx-14,sy-16,28,18);
    }

    _createTrees(){
        const pos=[
            // Top border trees
            [110,35],[200,25],[350,30],[450,20],[550,32],[700,25],[800,30],[920,22],[1050,28],[1150,35],
            // Left forest
            [20,120],[45,200],[30,300],[20,420],[40,520],[25,640],[30,730],[50,820],
            // Right forest
            [1240,80],[1260,200],[1245,320],[1255,440],[1240,560],[1260,680],[1248,800],
            // Mid-scattered
            [160,380],[180,460],[160,560],[420,400],[440,460],[420,620],[750,380],[760,460],
            [980,400],[1000,480],[960,620],[1100,440],[1120,520],
        ];
        pos.forEach(([tx,ty])=>{
            const sz=12+Math.floor(Math.random()*10);
            const g=this.add.graphics().setDepth(6);
            drawPineTree(g, tx, ty, sz);
        });

        // Stumps near cave trail and forest edges
        [[560,860],[625,898],[182,298],[860,310]].forEach(([sx,sy])=>{
            const sg=this.add.graphics().setDepth(4);
            drawTreeStump(sg, sx, sy, 8);
        });
    }

    _createBushes(){
        const pos=[
            [180,120],[200,180],[180,250],[160,320],[180,450],[160,530],[180,680],[160,760],
            [480,120],[500,180],[480,260],[460,380],[480,460],[460,620],
            [760,120],[780,200],[760,280],[740,400],[760,520],[740,680],
            [1040,120],[1060,220],[1040,340],[1060,480],[1040,620],
        ];
        pos.forEach(([bx,by])=>{
            const g=this.add.graphics().setDepth(3);
            g.fillStyle(0x1e4a0e); g.fillCircle(bx,by,8);
            g.fillStyle(0x2a6a1a); g.fillCircle(bx-5,by-3,6); g.fillCircle(bx+5,by-3,6);
        });
    }

    _createExitMarker(){
        const g=this.add.graphics().setDepth(3);
        g.fillStyle(0x8a7a50,0.7); g.fillRect(380,0,220,22);
        this.add.text(490,11,'↑ CAMP CENTRAL',{fontSize:'7px',fill:'#e8ddb8',fontFamily:'monospace'}).setDepth(5).setOrigin(0.5);
    }

    _createPlayer(){
        createPlayerTextures(this);
        const gs=window.gameState;
        const sx=(gs&&gs.entryX)||640, sy=(gs&&gs.entryY)||32;
        this.player=this.physics.add.sprite(sx,sy,'player_idle');
        this.player.setCollideWorldBounds(true).setDepth(10);
    }

    // ----------------------------------------------------------
    // INTERACTABLES
    // ----------------------------------------------------------
    _buildInteractables(){
        const col=()=>(window.gameState&&window.gameState.collected)||[];
        this.interactables=[
            // Cave entrance
            { id:'cave_entrance', x:634, y:898, range:68, hintLabel:'Enter cave',
              getText:(s)=>{
                  const c=col();
                  if(c.includes('walking_stick'))
                      return '*You clear the debris with your walking stick.*\nThe mouth of the cave yawns open.\nCold, damp air rolls out.\nYou step inside.';
                  return 'The entrance is blocked by fallen branches and debris.\nYou\'d need a sturdy walking stick to clear it.';
              },
              onInteract:(s)=>{ if(col().includes('walking_stick')) s._enterCave(); }},
            // Harold (Birch campsite C)
            { id:'harold', x:330, y:162, range:68, hintLabel:'Talk', speaker:'HAROLD',
              getText:(s)=>{
                  const c=col();
                  if(c.includes('facility_log'))
                      return 'You got in there? Lord.\nWhatever you found — write it down and get it out.\nDon\'t let them bury it again like they did in \'92.';
                  if(c.includes('bolt_cutters')||c.includes('INSIDE'))
                      return 'Trying to get past that fence? I tried in \'92.\nThey had someone watching the whole perimeter.\nThis was public land until 1989 — signed away overnight.';
                  return 'Harold. Retired ranger — twenty-two years this route.\nIn 1989 they told me the east section was "private leasehold."\nOvernight. No warning.\nFish started dying that summer. Birds left the north shore.\nNobody ever explained it.';
              }},
            // Counselor Dana (Oak campsite E)
            { id:'counselor', x:890, y:175, range:65, hintLabel:'Talk', speaker:'COUNSELOR DANA',
              getText:(s)=>{
                  const c=col();
                  if(c.includes('facility_log'))
                      return 'I don\'t know how you managed that.\nStay safe — please. And if you need a witness, I\'m here.';
                  if(c.includes('bolt_cutters'))
                      return 'You found the cutters? Be careful with that fence.\nI heard from another counselor that someone went in last summer and never came back out.';
                  return 'Welcome to Pinebrook! Explore, have fun.\nBut stay out of the restricted zone — the east fence.\nSome of my kids saw green lights near there last night.\nI\'m pretending I didn\'t hear that.';
              }},
            // Goofy kid (near Oak)
            { id:'goofy_kid', x:980, y:152, range:60, hintLabel:'Talk', speaker:'KID',
              getText:(s)=>{
                  const c=col();
                  if(c.includes('facility_log')) return 'CALLED IT. I told everyone. Did anyone listen? No.';
                  if(c.includes('bolt_cutters')) return 'You found a way in? SICK. Bring me back something radioactive.';
                  return 'Dude. Last night, 2am — green glow by the east fence.\nMy parents said I was dreaming. I wasn\'t dreaming.\nI have a PHOTO. It\'s blurry but still.';
              }},
            // Mrs. Dottie (ice cream) — healing item
            { id:'ice_cream', x:1108, y:658, range:68, hintLabel:'Order', speaker:"MRS. DOTTIE",
              getText:(s)=>{
                  const c=(window.gameState&&window.gameState.collected)||[];
                  if(c.includes('dottie_healed_2'))return 'You\'ve had enough for one day, sweetheart. Come back tomorrow!';
                  if(c.includes('dottie_healed'))return 'One more, on the house. You look like you need it.';
                  if(c.includes('bolt_cutters'))return 'Back again? You look like you\'ve been on a mission, sweetheart.\nFudge Avalanche is on me. You\'ve earned it.';
                  return 'What\'ll it be? Fudge Avalanche, Maple Melt, Campfire Crunch...\nor the Sasquatch Surprise. I can\'t promise what\'s in it.';
              },
              onInteract:(s)=>{
                  const c=(window.gameState&&window.gameState.collected)||[];
                  if(!c.includes('dottie_healed')){
                      s._localCollected.add('dottie_healed');
                      window.gameState.collected=[...new Set([...(window.gameState.collected||[]),'dottie_healed'])];
                      s._hp=Math.min(s._maxHp,s._hp+2);s._heartsHUD.setHp(s._hp);
                  } else if(!c.includes('dottie_healed_2')){
                      s._localCollected.add('dottie_healed_2');
                      window.gameState.collected=[...new Set([...(window.gameState.collected||[]),'dottie_healed_2'])];
                      s._hp=Math.min(s._maxHp,s._hp+2);s._heartsHUD.setHp(s._hp);
                  }
              }},
            // Frank (Willow campsite F) - artifact trading, lore, ember-stick upgrade
            { id:'frank_campfire', x:290, y:602, range:80, hintLabel:'Approach fire', speaker:'OLD FRANK',
              getText:(s)=>{
                  const n=s._artifactCounts.arrowheads+s._artifactCounts.pottery+s._artifactCounts.tools;
                  const c=(window.gameState&&window.gameState.collected)||[];
                  const qs=(window.gameState&&window.gameState.questState)||0;
                  // Ember-stick upgrade (stage 5+, has walking_stick + copper_wire)
                  if(qs>=QUEST_STATES.FOUND_LOG&&c.includes('walking_stick')&&c.includes('copper_wire')&&!c.includes('ember_stick'))
                      return 'That stick you\'ve got — your grandfather\'s grain.\nGive me an hour and the wire from the facility.\n*wraps copper tightly around the handle*\nConducts the static charge from the crystal deposits.\nTwo hits now. Maybe three if you swing clean.';
                  if(c.includes('ember_stick'))
                      return 'Ember-stick is treating you right?\nCrystal copper combination — old miners\' trick.\nHit straight and it\'ll hold.';
                  // Survey map (stage 5+, has facility_log)
                  if(qs>=QUEST_STATES.FOUND_LOG&&c.includes('facility_log')&&!c.includes('survey_map'))
                      return 'You brought the log back.\nI knew you\'d get in there.\n\n*unrolls something from inside his shelter*\n\nOriginal survey — the lower chambers, sealed section.\nThis is what they didn\'t want people to find.';
                  if(c.includes('survey_map'))
                      return 'You have the map now.\nThe lower chamber is marked in red.\nGo back to the cave — there\'s more to find.';
                  if(n===0) return 'Heh. Thought I heard new footsteps.\nNot many find this spot. Name\'s Frank.\nBring me pieces of the past — arrowheads, pottery, old tools.\nI\'ll make it worth your while.';
                  if(n>=10&&!c.includes('frank_lore_3')) return `${n} pieces. You\'ve been listening.\nSit down. I need to tell you about the cave.`;
                  if(n>=6&&!c.includes('frank_lore_2')) return `Six pieces. That\'s respect for the land.\nHere\'s something worth knowing: "Project Emberlight." Write that down.`;
                  if(n>=3&&!c.includes('frank_lore_1')) return `Three pieces already. Good eye.\nI\'ll tell you about the cave. You\'ve earned it.`;
                  return `${n} piece${n>1?'s':''} so far.\nThree gets my first story.`;
              },
              onInteract:(s)=>{
                  const n=s._artifactCounts.arrowheads+s._artifactCounts.pottery+s._artifactCounts.tools;
                  const c=(window.gameState&&window.gameState.collected)||[];
                  const qs=(window.gameState&&window.gameState.questState)||0;
                  const add=(id)=>{ s._localCollected.add(id); if(window.gameState){window.gameState.collected=[...new Set([...(window.gameState.collected||[]),id])];} };
                  const remove=(id)=>{ s._localCollected.delete(id); if(window.gameState){window.gameState.collected=(window.gameState.collected||[]).filter(x=>x!==id);} };
                  // Ember-stick upgrade
                  if(qs>=QUEST_STATES.FOUND_LOG&&c.includes('walking_stick')&&c.includes('copper_wire')&&!c.includes('ember_stick')){
                      remove('walking_stick'); remove('copper_wire'); add('ember_stick');
                      if(s._stickHUD)s._stickHUD.setText('| ember-stick');
                      return;
                  }
                  // Survey map
                  if(qs>=QUEST_STATES.FOUND_LOG&&c.includes('facility_log')&&!c.includes('survey_map')){
                      add('survey_map');
                      s.time.delayedCall(200,()=>s.dialogue.show('OLD FRANK',
                          '*slides a worn folded paper across the log*\n\nOriginal survey — the lower chambers.\nSealed section is marked in red.\nThey built something down there.\nGo back to the cave. Finish this.'));
                      if(window.gameState)window.gameState.questState=Math.max(window.gameState.questState||0,QUEST_STATES.DEEP_CAVE);
                      return;
                  }
                  // Artifact lore chain
                  if(n>=3&&!c.includes('frank_lore_1')){
                      add('frank_lore_1');
                      s.time.delayedCall(200,()=>s.dialogue.show('OLD FRANK',
                          'The cave entrance — south trail, past the creek.\nThe research team used those tunnels to access the site underground.\nI mapped them in \'78.\nSomething stopped them going all the way down.\nThey never told me what.'));
                  } else if(n>=6&&!c.includes('frank_lore_2')){
                      add('frank_lore_2');
                      s.time.delayedCall(200,()=>s.dialogue.show('OLD FRANK',
                          '"Project Emberlight." Energy research, officially.\nBut the emissions I was seeing...\nThat wasn\'t standard physics.\nI walked away. Should\'ve spoken up.'));
                  } else if(n>=10&&!c.includes('frank_lore_3')){
                      add('frank_lore_3');
                      s.time.delayedCall(200,()=>s.dialogue.show('OLD FRANK',
                          'There\'s a lower chamber in that cave. Sealed from the inside.\nI think you already know what\'s down there.\n\n*slides something across the log*\n\nOriginal survey map. Don\'t lose it.'));
                  }
              }},
        ];
    }

    _createArtifacts(){
        const col=()=>(window.gameState&&window.gameState.collected)||[];
        // Berries near creek — instant +1 HP heal
        if(!col().includes('berries_eaten')){
            const bx=380,by=780;
            const bg=this.add.graphics().setDepth(3);
            bg.fillStyle(0x3a6a18); bg.fillCircle(bx,by,8); bg.fillCircle(bx-5,by-3,6); bg.fillCircle(bx+5,by-3,6);
            bg.fillStyle(0xcc2244); bg.fillCircle(bx-3,by-2,3); bg.fillCircle(bx+4,by-4,3); bg.fillCircle(bx-1,by+2,2.5);
            this.interactables.push({
                id:'berries', x:bx, y:by, range:44, hintLabel:'Pick berries',
                getText:()=>'Wild berries growing by the creek bank. Probably safe to eat.',
                onInteract:(s)=>{
                    s._localCollected.add('berries_eaten');
                    if(window.gameState)window.gameState.collected=[...new Set([...(window.gameState.collected||[]),'berries_eaten'])];
                    bg.setVisible(false);
                    s.interactables.find(o=>o.id==='berries').disabled=true;
                    s._hp=Math.min(s._maxHp,s._hp+1);s._heartsHUD.setHp(s._hp);
                    s.dialogue.show('','You ate the wild berries.\n[ +1 HP ]');
                }
            });
        }
        const defs=[
            {id:'arrowhead_creek',  x:280,  y:778, cat:'arrowheads', label:'Arrowhead'},
            {id:'arrowhead_south',  x:860,  y:652, cat:'arrowheads', label:'Arrowhead'},
            {id:'arrowhead_wild3',  x:500,  y:440, cat:'arrowheads', label:'Arrowhead'},
            {id:'pottery_harold',   x:168,  y:188, cat:'pottery',    label:'Pottery Shard'},
            {id:'pottery_rec',      x:726,  y:644, cat:'pottery',    label:'Pottery Shard'},
            {id:'tool_wild',        x:1060, y:340, cat:'tools',      label:'Stone Tool'},
        ];
        defs.forEach(d=>{
            if(col().includes(d.id))return;
            const g=this.add.graphics().setDepth(3);
            g.fillStyle(0xd4a840); g.fillTriangle(d.x,d.y-8,d.x-6,d.y+6,d.x+6,d.y+6);
            const glow=this.add.graphics().setDepth(2);
            glow.fillStyle(0xffdd44,0.2); glow.fillCircle(d.x,d.y,14);
            this.tweens.add({targets:glow,alpha:{from:0.2,to:0.05},yoyo:true,repeat:-1,duration:1600+Math.random()*400});
            this.interactables.push({
                id:d.id, x:d.x, y:d.y, range:44, hintLabel:'Pick up',
                text:`A ${d.label} — worn smooth by time.`,
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
