// ============================================================
// SpriteLoader.js
// Loads sprite sheet assets and defines named frame regions.
// Call preloadSprites(scene) from each scene's preload(),
// then initSpriteFrames(scene) at the top of create().
// ============================================================

const _SPRITE_BASE = 'js/sprites/';

// Scale applied to player_sheet sprites to match ~24px world height
const PLAYER_SCALE = 0.125;

function preloadSprites(scene) {
    if (!scene.textures.exists('player_sheet')) {
        scene.load.spritesheet('player_sheet',
            _SPRITE_BASE + 'Main_Charachter_Assets_alpha.png',
            { frameWidth: 256, frameHeight: 256 });
    }
    if (!scene.textures.exists('campground')) {
        scene.load.image('campground', _SPRITE_BASE + 'Campground_Assets_alpha.png');
    }
    if (!scene.textures.exists('cave_sheet')) {
        scene.load.image('cave_sheet', _SPRITE_BASE + 'Cave_Asseets_alpha.png');
    }
}

let _framesInited = false;
let _animsInited  = false;

function initSpriteFrames(scene) {
    // ---- Campground atlas ----
    if (scene.textures.exists('campground')) {
        const camp = scene.textures.get('campground');
        if (!camp.has('pine_tree')) {
            [
                ['pine_tree',        800,  26, 154, 200],
                ['pine_tree_2',      974,  26, 148, 201],
                ['tree_round',        25,  28, 157, 147],
                ['tree_round_2',     203,  28, 159, 149],
                ['bush_small',      1130,  28, 113, 100],
                ['bush_small_2',    1276,  28, 109, 102],
                ['stump',           1283, 161,  60,  57],
                ['rock_large',      1142, 168,  99,  85],
                ['log_fallen',      1381, 141, 134,  72],
                ['tent_orange',       67, 367, 317, 242],
                ['bench',            689, 486, 252,  55],
                ['campfire_large',   621, 805, 140, 172],
                ['campfire_med',     796, 818, 153, 160],
                ['campfire_small',   437, 823, 139, 154],
                ['campfire_cold',    259, 853, 128, 122],
                ['noticeboard',     1184, 386, 216, 258],
                ['lantern_post',    1400, 413, 114, 120],
                ['backpack_sprite', 1071, 674, 130, 127],
                ['mushroom_red',     991, 860, 108,  76],
                ['mushroom_purple', 1217, 866, 110,  74],
                ['fence_h',          669, 559, 298,  37],
                ['barrel',           182, 666,  83,  45],
                ['crate',            298, 667, 118, 131],
                ['shovel',           766, 706,  44,  95],
                ['keep_out_sign',   1380, 675, 119, 135],
            ].forEach(([n,x,y,w,h]) => camp.add(n, 0, x, y, w, h));
        }
    }

    // ---- Cave atlas ----
    if (scene.textures.exists('cave_sheet')) {
        const cave = scene.textures.get('cave_sheet');
        if (!cave.has('crystal_large')) {
            [
                ['crystal_large',    118,  62, 101, 106],
                ['crystal_med',      265,  73, 101, 107],
                ['keep_out_crate',   937,  73, 421, 246],
                ['hazmat_crate',    1009, 309, 441, 236],
                ['rock_pile',        110, 378, 164, 173],
                ['mine_entrance',     94, 413, 578, 310],
                ['barrel_cave',      756, 578,  89,  82],
                ['campfire_cave',    819, 764, 170, 177],
                ['rock_small_cave',  141, 788,  98,  70],
            ].forEach(([n,x,y,w,h]) => cave.add(n, 0, x, y, w, h));
        }
    }

    // ---- Player animations (global, created once) ----
    if (!_animsInited && scene.textures.exists('player_sheet')) {
        _animsInited = true;
        scene.anims.create({
            key: 'walk_down',
            frames: scene.anims.generateFrameNumbers('player_sheet', { start: 0, end: 5 }),
            frameRate: 8, repeat: -1
        });
        scene.anims.create({
            key: 'walk_up',
            frames: scene.anims.generateFrameNumbers('player_sheet', { start: 12, end: 17 }),
            frameRate: 8, repeat: -1
        });
        scene.anims.create({
            key: 'walk_side',
            frames: scene.anims.generateFrameNumbers('player_sheet', { start: 18, end: 23 }),
            frameRate: 8, repeat: -1
        });
    }
}

// ------------------------------------------------------------------
// Helper: add a pine tree sprite at world position (x, y).
// sz mirrors the old drawPineTree size param for consistent scale.
// Falls back to drawPineTree() if campground texture not loaded.
// ------------------------------------------------------------------
function placePineTree(scene, x, y, sz, depth) {
    depth = depth || 6;
    if (scene.textures.exists('campground')) {
        // pine_tree art is 154×200px; sz≈18 → ~32px tall → scale ≈ 0.16
        const scale = sz * 0.009;
        scene.add.image(x, y, 'campground', 'pine_tree')
            .setScale(scale).setOrigin(0.5, 1).setDepth(depth);
    } else {
        const g = scene.add.graphics().setDepth(depth);
        drawPineTree(g, x, y, sz);
    }
}

function placeSicklyTree(scene, x, y, sz, depth) {
    depth = depth || 6;
    if (scene.textures.exists('campground')) {
        const scale = sz * 0.008;
        scene.add.image(x, y, 'campground', 'pine_tree_2')
            .setScale(scale).setTint(0xaabbaa).setOrigin(0.5, 1).setDepth(depth);
    } else {
        const g = scene.add.graphics().setDepth(depth);
        drawSicklyTree(g, x, y, sz);
    }
}

// ------------------------------------------------------------------
// Helper: swap player texture/animation based on velocity.
// Call this instead of the manual setTexture block in each update().
// ------------------------------------------------------------------
function updatePlayerAnim(scene, vx, vy, dt) {
    const p = scene.player;
    if (!p) return;

    if (scene.textures.exists('player_sheet')) {
        if (vx !== 0 || vy !== 0) {
            const anim = (vy < 0 && vx === 0) ? 'walk_up'
                       : (vx !== 0)            ? 'walk_side'
                                               : 'walk_down';
            if (p.anims.getName() !== anim) p.play(anim);
        } else {
            p.stop(); p.setFrame(0);
        }
        if (vx < 0) p.setFlipX(true); else if (vx > 0) p.setFlipX(false);
    } else {
        // Legacy canvas-texture fallback
        if (vx !== 0 || vy !== 0) {
            scene._walkTimer = (scene._walkTimer || 0) - dt;
            if (scene._walkTimer <= 0) {
                scene._walkTimer = 180;
                scene._walkFrame = scene._walkFrame === 0 ? 1 : 0;
            }
            const tex = (vy < 0 && vx === 0) ? 'player_back'
                      : (scene._walkFrame === 0 ? 'player_walkA' : 'player_walkB');
            p.setTexture(tex);
            if (vx < 0) p.setFlipX(true); else if (vx > 0) p.setFlipX(false);
        } else {
            p.setTexture('player_idle');
            scene._walkFrame = 0; scene._walkTimer = 0;
        }
    }
}

// ------------------------------------------------------------------
// Helper: create player physics sprite using sheet when available.
// ------------------------------------------------------------------
function createPlayerSprite(scene, x, y) {
    let player;
    if (scene.textures.exists('player_sheet')) {
        player = scene.physics.add.sprite(x, y, 'player_sheet', 0);
        player.setScale(PLAYER_SCALE).setOrigin(0.5, 0.85);
    } else {
        player = scene.physics.add.sprite(x, y, 'player_idle');
    }
    return player;
}
