// ============================================================
// Creature.js
// Enemy factory + drawing + AI update functions.
// Plain global functions — no Phaser class inheritance.
// Matches the raw-Graphics NPC pattern used throughout the game.
// ============================================================

const CREATURE_TYPES = {
    GLOWING_RAT: {
        hp: 2, speed: 70, color: 0x88ff44, size: 10,
        damage: 1, detectRange: 120, attackRange: 22,
        patrolDist: 60
    },
    MUTANT_FISH: {
        hp: 1, speed: 40, color: 0x22aaff, size: 12,
        damage: 1, detectRange: 90, attackRange: 20,
        patrolDist: 80
    },
    CAVE_CRAWLER: {
        hp: 3, speed: 55, color: 0xcc4422, size: 13,
        damage: 1, detectRange: 100, attackRange: 24,
        patrolDist: 70
    },
    FACILITY_GUARD: {
        hp: 4, speed: 30, color: 0x6688aa, size: 16,
        damage: 2, detectRange: 150, attackRange: 28,
        patrolDist: 50
    }
};

// ---- Factory ------------------------------------------------
function createCreature(scene, type, x, y) {
    const def = CREATURE_TYPES[type];
    return {
        type, x, y,
        hp: def.hp, maxHp: def.hp,
        speed: def.speed, color: def.color, size: def.size,
        damage: def.damage,
        detectRange: def.detectRange, attackRange: def.attackRange,
        patrolDist: def.patrolDist,
        originX: x, originY: y,
        state: 'IDLE',
        vx: 0, vy: 0,
        stunnedTimer: 0,
        attackCooldown: 0,
        patrolTimer: 0,
        patrolDir: 1,
        _hitThisSwing: false,
        isDead: false,
        _gfx:   scene.add.graphics().setDepth(9),
        _hpGfx: scene.add.graphics().setDepth(10)
    };
}

// ---- Drawing ------------------------------------------------
function drawCreature(c) {
    c._gfx.clear();
    c._hpGfx.clear();
    if (c.isDead) return;

    const g   = c._gfx;
    const col = c.state === 'STUNNED' ? 0xffffff : c.color;
    const a   = c.state === 'STUNNED' ? 0.6 : 1;

    if (c.type === 'GLOWING_RAT') {
        // Glow aura
        g.fillStyle(c.color, 0.18); g.fillCircle(c.x, c.y, c.size * 2.2);
        // Body
        g.fillStyle(col, a); g.fillEllipse(c.x, c.y, c.size * 2.4, c.size * 1.4);
        // Eyes
        g.fillStyle(0xff4444, 1); g.fillCircle(c.x + c.size * 0.55, c.y - 2, 2);
        // Tail
        g.lineStyle(1, c.color, 0.8);
        g.lineBetween(c.x - c.size, c.y, c.x - c.size * 2, c.y + 5);

    } else if (c.type === 'MUTANT_FISH') {
        // Glow
        g.fillStyle(c.color, 0.2); g.fillCircle(c.x, c.y, c.size * 1.8);
        // Body
        g.fillStyle(col, a); g.fillEllipse(c.x, c.y, c.size * 2.2, c.size * 1.2);
        // Eye
        g.fillStyle(0xffffff, 1); g.fillCircle(c.x + c.size * 0.4, c.y - 2, 2.5);
        g.fillStyle(0x000000, 1); g.fillCircle(c.x + c.size * 0.4, c.y - 2, 1);
        // Dorsal fin
        g.fillStyle(col, a * 0.7);
        g.fillTriangle(c.x - 2, c.y - c.size, c.x - 8, c.y - 2, c.x + 4, c.y - 2);

    } else if (c.type === 'CAVE_CRAWLER') {
        // Body segments
        g.fillStyle(col, a); g.fillEllipse(c.x, c.y, c.size * 1.8, c.size * 1.4);
        g.fillStyle(0x882200, a); g.fillEllipse(c.x + c.size * 0.6, c.y - 2, c.size * 1.2, c.size);
        // Head eye
        g.fillStyle(0xff4400, 0.9); g.fillCircle(c.x + c.size * 0.85, c.y - 3, 2.5);
        // Legs
        g.lineStyle(1, c.color, 0.7);
        [-4, 0, 4].forEach(oy => {
            g.lineBetween(c.x - c.size * 0.5, c.y + oy, c.x - c.size * 1.5, c.y + oy + 5);
            g.lineBetween(c.x + c.size * 0.2, c.y + oy, c.x + c.size * 1.2, c.y + oy + 5);
        });

    } else if (c.type === 'FACILITY_GUARD') {
        // Main body box
        g.fillStyle(0x334455, a); g.fillRect(c.x - c.size, c.y - c.size, c.size * 2, c.size * 2);
        // Panel detail
        g.fillStyle(col, a * 0.6); g.fillRect(c.x - c.size + 2, c.y - c.size + 2, c.size - 4, c.size * 2 - 4);
        // Sensor eye
        g.fillStyle(0xff2200, 1); g.fillCircle(c.x, c.y - c.size * 0.3, 3.5);
        g.fillStyle(0xff6600, 0.6); g.fillCircle(c.x, c.y - c.size * 0.3, 5.5);
        // Outline
        g.lineStyle(1, 0x223344, 1);
        g.strokeRect(c.x - c.size, c.y - c.size, c.size * 2, c.size * 2);
    }

    // HP bar — only shown when damaged
    if (c.hp < c.maxHp) {
        const hg = c._hpGfx;
        const bx = c.x - 12, by = c.y - c.size - 8;
        hg.fillStyle(0x440000, 1); hg.fillRect(bx, by, 24, 4);
        hg.fillStyle(0xff4444, 1); hg.fillRect(bx, by, 24 * (c.hp / c.maxHp), 4);
    }
}

// ---- AI Update ----------------------------------------------
// Returns { dealDamage: true, damage: N } when attacking player,
// or null otherwise.
function updateCreature(c, px, py, delta) {
    if (c.isDead) return null;
    if (c.stunnedTimer > 0) {
        c.stunnedTimer -= delta;
        c.state = 'STUNNED';
        c.vx = 0; c.vy = 0;
        c.x += c.vx * (delta / 1000);
        c.y += c.vy * (delta / 1000);
        return null;
    }

    const dist = Phaser.Math.Distance.Between(px, py, c.x, c.y);
    if (c.attackCooldown > 0) c.attackCooldown -= delta;

    switch (c.state) {
        case 'IDLE':
            c.patrolTimer -= delta;
            if (c.patrolTimer <= 0) {
                c.state = 'PATROL';
                c.patrolTimer = 1200 + Math.random() * 800;
                c.patrolDir *= -1;
            }
            if (dist < c.detectRange) c.state = 'CHASE';
            c.vx = 0; c.vy = 0;
            break;

        case 'PATROL':
            c.patrolTimer -= delta;
            if (c.patrolTimer <= 0) {
                c.state = 'IDLE';
                c.patrolTimer = 700 + Math.random() * 500;
            }
            if (dist < c.detectRange) { c.state = 'CHASE'; break; }
            c.vx = c.patrolDir * c.speed * 0.45;
            c.vy = 0;
            if (Math.abs(c.x - c.originX) > c.patrolDist) c.patrolDir *= -1;
            break;

        case 'CHASE':
            if (dist > c.detectRange * 1.6) { c.state = 'PATROL'; c.vx = 0; c.vy = 0; break; }
            if (dist < c.attackRange) { c.state = 'ATTACK'; c.vx = 0; c.vy = 0; break; }
            const ang = Math.atan2(py - c.y, px - c.x);
            c.vx = Math.cos(ang) * c.speed;
            c.vy = Math.sin(ang) * c.speed;
            break;

        case 'ATTACK':
            c.vx = 0; c.vy = 0;
            if (dist > c.attackRange * 1.5) { c.state = 'CHASE'; break; }
            if (c.attackCooldown <= 0 && dist < c.attackRange) {
                c.attackCooldown = 1400;
                c.x += c.vx * (delta / 1000);
                c.y += c.vy * (delta / 1000);
                return { dealDamage: true, damage: c.damage };
            }
            break;

        case 'STUNNED':
            c.vx = 0; c.vy = 0;
            break;
    }

    c.x += c.vx * (delta / 1000);
    c.y += c.vy * (delta / 1000);
    return null;
}
