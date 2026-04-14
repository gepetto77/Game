// ============================================================
// PlayerSprites.js
// Generates pixel-art player textures at runtime via canvas.
// Call createPlayerTextures(scene) once — Phaser's texture
// manager shares them across all scenes.
// ============================================================

function createPlayerTextures(scene) {
    if (scene.textures.exists('player_idle')) return; // already built

    // 16 × 24 px sprites — rendered pixel-perfect, no scaling needed.
    _make(scene, 'player_idle',  _drawFront(0));
    _make(scene, 'player_walkA', _drawFront(1));
    _make(scene, 'player_walkB', _drawFront(2));
    _make(scene, 'player_back',  _drawBack(0));
}

// ----------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------

function _make(scene, key, drawFn) {
    const tex = scene.textures.createCanvas(key, 16, 24);
    const ctx = tex.getContext();
    ctx.clearRect(0, 0, 16, 24);
    drawFn(ctx);
    tex.refresh();
}

// Colour palette
const K  = '#1A0A00'; // outline / very dark brown
const Bh = '#7B3A1A'; // hair brown
const Bhi= '#A05A2A'; // hair highlight
const Sk = '#F4C28A'; // skin
const Ey = '#1A0A00'; // eyes (same as outline)
const Mt = '#CC9988'; // mouth
const Rt = '#CC3333'; // red shirt
const Rd = '#882222'; // shirt shadow
const Pt = '#3A5080'; // pants (steel blue)
const Pd = '#263860'; // pants shadow
const Bt = '#6A4020'; // boots
const Bs = '#4A2A10'; // boot sole

// Shorthand fill helpers
function _r(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
function _p(ctx, x, y, c)       { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }

// ----------------------------------------------------------
// FRONT-FACING sprite (idle / walkA / walkB)
//   walkPhase 0 = idle (symmetric)
//             1 = walkA (right foot raised 1px)
//             2 = walkB (left foot raised 1px)
// ----------------------------------------------------------
function _drawFront(walkPhase) {
    return function(ctx) {
        const lo = (walkPhase === 2) ? -1 : 0;  // left-leg pixel offset
        const ro = (walkPhase === 1) ? -1 : 0;  // right-leg pixel offset

        // ---- BOOTS ----
        // Left boot (cols 2-6, rows 19+lo to 23+lo)
        _r(ctx, 2, 19+lo, 5, 5, K);             // outline block
        _r(ctx, 2, 19+lo, 5, 4, Bt);            // boot body
        _r(ctx, 2, 22+lo, 5, 1, Bs);            // sole
        // Right boot (cols 9-13, rows 19+ro to 23+ro)
        _r(ctx, 9, 19+ro, 5, 5, K);
        _r(ctx, 9, 19+ro, 5, 4, Bt);
        _r(ctx, 9, 22+ro, 5, 1, Bs);

        // ---- LEGS ----
        // Left leg (cols 2-6, rows 13+lo to 19+lo, covers boot top)
        _r(ctx, 2, 13+lo, 5, 7, K);             // outline
        _r(ctx, 2, 14+lo, 5, 6, Pt);            // pants
        _r(ctx, 2, 19+lo, 5, 1, Pd);            // shadow at hem
        // Right leg
        _r(ctx, 9, 13+ro, 5, 7, K);
        _r(ctx, 9, 14+ro, 5, 6, Pt);
        _r(ctx, 9, 19+ro, 5, 1, Pd);

        // ---- BELT / HIP BAND ----
        _r(ctx, 2, 13, 13, 1, K);               // top of pants outline
        _r(ctx, 3, 13, 10, 1, Pd);              // belt line

        // ---- SHIRT ----
        _r(ctx, 1, 7, 14, 7, K);               // shirt outline block
        _r(ctx, 2, 8, 12, 5, Rt);              // shirt fill
        _r(ctx, 3, 9, 1, 4, Rd);               // left shadow stripe
        _r(ctx, 12, 9, 1, 4, Rd);              // right shadow stripe
        // Collar
        _r(ctx, 5, 7, 6, 1, Sk);

        // ---- ARMS ----
        // Left arm
        _r(ctx, 1, 8, 2, 5, K);
        _r(ctx, 1, 9, 1, 3, Sk);
        // Right arm
        _r(ctx, 13, 8, 2, 5, K);
        _r(ctx, 14, 9, 1, 3, Sk);

        // ---- HEAD (draw on top so outlines cover shirt) ----
        _r(ctx, 3, 0, 10, 9, K);               // head outline block
        _r(ctx, 4, 1, 8, 7, Bh);               // hair fills head
        // Face
        _r(ctx, 4, 3, 8, 5, Sk);               // skin
        _r(ctx, 4, 3, 1, 5, Bh);               // left sideburn
        _r(ctx, 11, 3, 1, 5, Bh);              // right sideburn
        // Eyes
        _r(ctx, 5, 5, 2, 1, Ey);               // left eye
        _r(ctx, 9, 5, 2, 1, Ey);               // right eye
        // Mouth
        _r(ctx, 6, 7, 4, 1, Mt);
        // Hair highlight
        _r(ctx, 5, 1, 3, 1, Bhi);
        _r(ctx, 6, 2, 2, 1, Bhi);
    };
}

// ----------------------------------------------------------
// BACK-FACING sprite (walking away from camera)
// walkPhase kept for future use (symmetric walk is fine for back)
// ----------------------------------------------------------
function _drawBack(walkPhase) {
    return function(ctx) {
        // Boots (symmetric — back view doesn't need walk offset)
        _r(ctx, 2, 19, 5, 5, K); _r(ctx, 2, 19, 5, 4, Bt); _r(ctx, 2, 22, 5, 1, Bs);
        _r(ctx, 9, 19, 5, 5, K); _r(ctx, 9, 19, 5, 4, Bt); _r(ctx, 9, 22, 5, 1, Bs);

        // Legs
        _r(ctx, 2, 13, 5, 7, K); _r(ctx, 2, 14, 5, 6, Pt); _r(ctx, 2, 19, 5, 1, Pd);
        _r(ctx, 9, 13, 5, 7, K); _r(ctx, 9, 14, 5, 6, Pt); _r(ctx, 9, 19, 5, 1, Pd);
        _r(ctx, 2, 13, 13, 1, K);
        _r(ctx, 3, 13, 10, 1, Pd);

        // Shirt (back — slightly darker, no collar visible)
        _r(ctx, 1, 7, 14, 7, K);
        _r(ctx, 2, 8, 12, 5, Rd);              // darker shirt (shadowed back)
        _r(ctx, 3, 8, 10, 4, Rt);              // lighter centre
        _r(ctx, 3, 9, 1, 3, Rd);
        _r(ctx, 12, 9, 1, 3, Rd);
        // Backpack strap hint
        _r(ctx, 6, 8, 1, 4, '#7A3020');
        _r(ctx, 9, 8, 1, 4, '#7A3020');

        // Arms
        _r(ctx, 1, 8, 2, 5, K); _r(ctx, 1, 9, 1, 3, Sk);
        _r(ctx, 13, 8, 2, 5, K); _r(ctx, 14, 9, 1, 3, Sk);

        // Head (from behind — all hair, no face)
        _r(ctx, 3, 0, 10, 9, K);
        _r(ctx, 4, 1, 8, 8, Bh);               // full hair covering back of head
        // Hair highlight / texture
        _r(ctx, 5, 1, 3, 1, Bhi);
        _r(ctx, 6, 2, 2, 1, Bhi);
        _r(ctx, 4, 5, 2, 1, '#6A3015');        // hair shadow lower
        _r(ctx, 10, 5, 2, 1, '#6A3015');
        // Neck
        _r(ctx, 6, 8, 4, 1, Sk);
    };
}
