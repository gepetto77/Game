// ============================================================
// game.js
// Entry point — Phaser config and game boot.
// Everything else lives in the scene files.
// ============================================================

// Initialise the virtual key state used by on-screen buttons.
// GameScene reads these in its update loop alongside keyboard input.
window.virtualKeys = {
    up:     false,
    down:   false,
    left:   false,
    right:  false,
    action: false  // maps to [A] button / [E] key
};

const config = {
    type: Phaser.AUTO,          // use WebGL if available, fall back to Canvas
    width: 480,
    height: 320,
    parent: 'screen-container', // Phaser mounts the canvas inside this div
    backgroundColor: '#1a2e1a',
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },  // top-down, no gravity
            debug: false        // set to true to see collision boxes
        }
    },
    scene: [GameScene]
};

const game = new Phaser.Game(config);
