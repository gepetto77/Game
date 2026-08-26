// ============================================================
// uiCameraFix.js
//
// Phaser's setScrollFactor(0) only exempts a game object from
// camera PAN, not camera ZOOM. Every scene here zooms its main
// camera 2x for the gameplay view, which was silently blowing up
// and mispositioning every HUD/dialogue/menu element (anything
// built with setScrollFactor(0)) right off the visible canvas --
// the "text doesn't fit, can't read it, it's off screen" bug.
//
// Fix: split rendering across two cameras. The main camera keeps
// its zoom and renders world content only; a second, unzoomed
// camera renders UI content only. Classification is automatic --
// any object with scrollFactorX === 0 is "UI", everything else is
// "world" -- so this needs no changes to individual UI classes
// and doesn't care what order things were created in.
//
// Call fixUICameraZoom(this) once per frame, as the very first
// line of a scene's update(). It's just an array filter plus an
// idempotent ignore() call (Phaser ORs a bitmask, so re-ignoring
// an already-ignored object is a no-op), so running it every
// frame is cheap and guarantees any UI element created later --
// a minigame overlay, a reveal HUD, an ending-sequence text --
// gets picked up automatically without hunting down every call
// site that creates one.
// ============================================================
function fixUICameraZoom(scene) {
    const all = scene.children.list;
    const uiObjects    = [];
    const worldObjects = [];
    for (let i = 0; i < all.length; i++) {
        (all[i].scrollFactorX === 0 ? uiObjects : worldObjects).push(all[i]);
    }

    scene.cameras.main.ignore(uiObjects);

    if (!scene.uiCamera) {
        const cfg = scene.sys.game.config;
        scene.uiCamera = scene.cameras.add(0, 0, cfg.width, cfg.height);
        scene.uiCamera.setScroll(0, 0);
    }
    scene.uiCamera.ignore(worldObjects);
}
