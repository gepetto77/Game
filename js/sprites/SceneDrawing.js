// ============================================================
// SceneDrawing.js
// Shared pixel-art drawing helpers for scene props.
// All functions take a Phaser.GameObjects.Graphics instance.
// ============================================================

// ----------------------------------------------------------
// Pine tree — 3 stacked triangle layers matching reference style
// sz: base "size" unit (~12-22 works well)
// ----------------------------------------------------------
function drawPineTree(g, x, y, sz) {
    // Ground shadow
    g.fillStyle(0x1a3a0a, 0.32);
    g.fillEllipse(x + 3, y + sz * 1.55, sz * 1.9, sz * 0.5);

    // Trunk — dark outline then lighter core
    g.fillStyle(0x1a0800);
    g.fillRect(x - 3, y + Math.round(sz * 0.35), 6, Math.round(sz * 0.95));
    g.fillStyle(0x5a3010);
    g.fillRect(x - 2, y + Math.round(sz * 0.35), 2, Math.round(sz * 0.95));

    // ---- Layer 3 — bottom, widest ----
    // Outline
    g.fillStyle(0x0e2206);
    g.fillTriangle(x, y - sz * 0.32, x - sz * 0.98, y + sz * 0.52, x + sz * 0.98, y + sz * 0.52);
    // Fill
    g.fillStyle(0x2a5a18);
    g.fillTriangle(x, y - sz * 0.45, x - sz * 0.88, y + sz * 0.42, x + sz * 0.88, y + sz * 0.42);
    // Left-side highlight
    g.fillStyle(0x3a7a22, 0.45);
    g.fillTriangle(x, y - sz * 0.45, x - sz * 0.52, y + sz * 0.1, x, y + sz * 0.1);

    // ---- Layer 2 — middle ----
    // Outline
    g.fillStyle(0x0e2206);
    g.fillTriangle(x, y - sz * 0.92, x - sz * 0.65, y + sz * 0.07, x + sz * 0.65, y + sz * 0.07);
    // Fill
    g.fillStyle(0x2a6020);
    g.fillTriangle(x, y - sz * 1.02, x - sz * 0.56, y - sz * 0.02, x + sz * 0.56, y - sz * 0.02);
    // Left-side highlight
    g.fillStyle(0x3a8a2a, 0.4);
    g.fillTriangle(x, y - sz * 1.02, x - sz * 0.33, y - sz * 0.36, x, y - sz * 0.36);

    // ---- Layer 1 — top, narrowest ----
    // Outline
    g.fillStyle(0x0e2206);
    g.fillTriangle(x, y - sz * 1.55, x - sz * 0.38, y - sz * 0.7, x + sz * 0.38, y - sz * 0.7);
    // Fill
    g.fillStyle(0x3a7028);
    g.fillTriangle(x, y - sz * 1.62, x - sz * 0.30, y - sz * 0.78, x + sz * 0.30, y - sz * 0.78);
    // Apex highlight
    g.fillStyle(0x4a8832, 0.4);
    g.fillTriangle(x, y - sz * 1.62, x - sz * 0.16, y - sz * 1.06, x, y - sz * 1.06);
}

// Sickly variant for contaminated zones (FacilityScene)
function drawSicklyTree(g, x, y, sz) {
    g.fillStyle(0x1a3a0a, 0.28);
    g.fillEllipse(x + 3, y + sz * 1.55, sz * 1.9, sz * 0.5);
    g.fillStyle(0x1a0800);
    g.fillRect(x - 3, y + Math.round(sz * 0.35), 6, Math.round(sz * 0.95));
    g.fillStyle(0x3a2008);
    g.fillRect(x - 2, y + Math.round(sz * 0.35), 2, Math.round(sz * 0.95));
    g.fillStyle(0x081406);
    g.fillTriangle(x, y - sz * 0.32, x - sz * 0.98, y + sz * 0.52, x + sz * 0.98, y + sz * 0.52);
    g.fillStyle(0x1e3a12);
    g.fillTriangle(x, y - sz * 0.45, x - sz * 0.88, y + sz * 0.42, x + sz * 0.88, y + sz * 0.42);
    g.fillStyle(0x2a5018, 0.45);
    g.fillTriangle(x, y - sz * 0.45, x - sz * 0.52, y + sz * 0.1, x, y + sz * 0.1);
    g.fillStyle(0x081406);
    g.fillTriangle(x, y - sz * 0.92, x - sz * 0.65, y + sz * 0.07, x + sz * 0.65, y + sz * 0.07);
    g.fillStyle(0x1a3010);
    g.fillTriangle(x, y - sz * 1.02, x - sz * 0.56, y - sz * 0.02, x + sz * 0.56, y - sz * 0.02);
    g.fillStyle(0x2a5018, 0.35);
    g.fillTriangle(x, y - sz * 1.02, x - sz * 0.33, y - sz * 0.36, x, y - sz * 0.36);
    g.fillStyle(0x081406);
    g.fillTriangle(x, y - sz * 1.55, x - sz * 0.38, y - sz * 0.7, x + sz * 0.38, y - sz * 0.7);
    g.fillStyle(0x233a18);
    g.fillTriangle(x, y - sz * 1.62, x - sz * 0.30, y - sz * 0.78, x + sz * 0.30, y - sz * 0.78);
    g.fillStyle(0x2a4820, 0.4);
    g.fillTriangle(x, y - sz * 1.62, x - sz * 0.16, y - sz * 1.06, x, y - sz * 1.06);
}

// ----------------------------------------------------------
// Tree stump — cylindrical with wood-grain rings
// r: radius of top face (default 8)
// ----------------------------------------------------------
function drawTreeStump(g, x, y, r) {
    r = r || 8;
    const h = Math.round(r * 0.7);
    // Shadow
    g.fillStyle(0x1a1008, 0.28);
    g.fillEllipse(x + 2, y + h + r * 0.3, r * 2.3, r * 0.7);
    // Front face
    g.fillStyle(0x4a1e08);
    g.fillRect(x - r + 1, y, r * 2 - 2, h);
    // Face grain lines
    g.fillStyle(0x321408, 0.7);
    g.fillRect(x - r + 2, y + Math.round(h * 0.45), r * 2 - 4, 1);
    // Top face (ellipse layers = rings)
    g.fillStyle(0x2a1200);
    g.fillEllipse(x, y, r * 2, r);
    g.fillStyle(0x6a3a18);
    g.fillEllipse(x, y - 1, r * 1.85, r * 0.82);
    g.fillStyle(0x3a1a08);
    g.fillEllipse(x, y - 1, r * 1.25, r * 0.56);
    g.fillStyle(0x5a2a10);
    g.fillEllipse(x, y - 1, r * 0.65, r * 0.3);
}

// ----------------------------------------------------------
// Pixel-art NPC character (~24px tall)
// shirtCol, hairCol, pantsCol: Phaser 0xRRGGBB integers
// ----------------------------------------------------------
function drawNPC(g, x, y, shirtCol, hairCol, pantsCol) {
    pantsCol = pantsCol !== undefined ? pantsCol : 0x3a4060;
    const K = 0x1a0a00;
    // Ground shadow
    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(x, y + 14, 14, 5);
    // Shoes
    g.fillStyle(K);
    g.fillRect(x - 6, y + 12, 5, 4);
    g.fillRect(x + 1,  y + 12, 5, 4);
    g.fillStyle(0x4a2a10);
    g.fillRect(x - 5, y + 12, 4, 3);
    g.fillRect(x + 2,  y + 12, 4, 3);
    // Pants outline + fill
    g.fillStyle(K);
    g.fillRect(x - 5, y + 3, 10, 10);
    g.fillStyle(pantsCol);
    g.fillRect(x - 4, y + 4, 9, 9);
    // Shirt outline + fill
    g.fillStyle(K);
    g.fillRect(x - 6, y - 8, 12, 13);
    g.fillStyle(shirtCol);
    g.fillRect(x - 5, y - 7, 10, 11);
    // Arms (skin)
    g.fillStyle(0xf0c890);
    g.fillRect(x - 8, y - 6, 3, 8);
    g.fillRect(x + 5,  y - 6, 3, 8);
    // Head outline
    g.fillStyle(K);
    g.fillRect(x - 5, y - 20, 10, 13);
    // Face skin
    g.fillStyle(0xf0c890);
    g.fillRect(x - 4, y - 19, 8, 11);
    // Hair
    g.fillStyle(hairCol);
    g.fillRect(x - 4, y - 19, 8, 4);
    // Eyes
    g.fillStyle(K);
    g.fillRect(x - 3, y - 14, 2, 1);
    g.fillRect(x + 1,  y - 14, 2, 1);
}

// ----------------------------------------------------------
// Decorative rock — r is radius (5-10 works well)
// ----------------------------------------------------------
function drawRock(g, x, y, r) {
    r = r || 6;
    g.fillStyle(0x1a1810, 0.25); g.fillEllipse(x+2, y+r*0.5, r*2.2, r*0.7);
    g.fillStyle(0x6a6050);       g.fillEllipse(x, y, r*2, r*1.3);
    g.fillStyle(0x8a7a68);       g.fillEllipse(x-r*0.25, y-r*0.3, r*1.1, r*0.7);
    g.fillStyle(0x4a3a30);       g.fillEllipse(x+r*0.3, y+r*0.15, r*0.6, r*0.35);
}

// ----------------------------------------------------------
// Tiny grass tuft — 3 blades, col is highlight colour
// ----------------------------------------------------------
function drawGrassTuft(g, x, y, col) {
    col = col !== undefined ? col : 0x4a8a28;
    const dk = (col & 0xfefefe) >> 1; // rough darken
    g.fillStyle(dk);
    g.fillRect(x-3, y-5, 2, 6); g.fillRect(x+1, y-7, 2, 8); g.fillRect(x+4, y-4, 2, 5);
    g.fillStyle(col);
    g.fillRect(x-3, y-5, 1, 5); g.fillRect(x+1, y-7, 1, 7); g.fillRect(x+4, y-4, 1, 4);
}

// ----------------------------------------------------------
// Log seat — short cut-log viewed from above/front
// ----------------------------------------------------------
function drawLogSeat(g, x, y) {
    g.fillStyle(0x1a1008, 0.22); g.fillEllipse(x+2, y+5, 22, 7);
    g.fillStyle(0x3a1a08);       g.fillRect(x-8, y, 16, 6);
    g.fillStyle(0x2a1200);       g.fillEllipse(x, y, 18, 10);
    g.fillStyle(0x6a3a18);       g.fillEllipse(x, y-1, 14, 7);
    g.fillStyle(0x3a1a08);       g.fillEllipse(x, y-1, 9, 4.5);
    g.fillStyle(0x5a2a10);       g.fillEllipse(x, y-1, 5, 2.5);
}

// ----------------------------------------------------------
// Backpack leaning against something
// ----------------------------------------------------------
function drawBackpack(g, x, y) {
    g.fillStyle(0x1a1008, 0.2);  g.fillEllipse(x+1, y+14, 18, 5);
    g.fillStyle(0x1a0a00);       g.fillRect(x-6, y-12, 13, 26);
    g.fillStyle(0x5a3a20);       g.fillRect(x-5, y-11, 11, 24);
    g.fillStyle(0x3a2210);       g.fillRect(x-5, y-11, 11, 10);
    g.fillStyle(0x7a5030, 0.7);  g.fillRect(x-5, y-1, 11, 2);
    g.fillStyle(0xd4a840);       g.fillRect(x-1, y-4, 3, 3);
}

// ----------------------------------------------------------
// Lantern on a short post
// ----------------------------------------------------------
function drawLantern(g, x, y) {
    g.fillStyle(0x3a2810);       g.fillRect(x-1, y+2, 3, 18);
    g.fillStyle(0x1a0a00);       g.fillRect(x-5, y-14, 11, 16);
    g.fillStyle(0x3a3020);       g.fillRect(x-4, y-13, 9, 14);
    g.fillStyle(0xffcc44, 0.85); g.fillRect(x-3, y-12, 7, 10);
    g.fillStyle(0xffee88, 0.4);  g.fillEllipse(x, y-7, 16, 12);
    g.fillStyle(0x3a3020);       g.fillRect(x-5, y-14, 11, 3);
    g.fillStyle(0x3a3020);       g.fillRect(x-5, y-2,  11, 2);
}

// ----------------------------------------------------------
// Cooler / storage box
// ----------------------------------------------------------
function drawCooler(g, x, y) {
    g.fillStyle(0x1a1008, 0.22); g.fillEllipse(x+2, y+8, 26, 7);
    g.fillStyle(0x1a0a00);       g.fillRect(x-10, y-6, 22, 14);
    g.fillStyle(0x2a6a9a);       g.fillRect(x-9, y-5, 20, 12);
    g.fillStyle(0x1a4a7a);       g.fillRect(x-9, y-5, 20, 4);
    g.fillStyle(0xcccccc, 0.8);  g.fillRect(x-3, y-4, 6, 2);
}
