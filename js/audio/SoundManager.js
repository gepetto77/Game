// ============================================================
// SoundManager.js
// All game audio generated with the Web Audio API — no files.
//
// Must be initialised AFTER a user gesture (browser rule).
// TitleScene calls soundManager.init() on the first key/button press.
// ============================================================

class SoundManager {
    constructor() {
        this.ctx   = null;
        this.ready = false;
        this._droneGain = null;
    }

    // Call once after a user interaction (key press, button tap).
    init() {
        if (this.ready) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.ready = true;
            this._startAmbientDrone();
        } catch (e) {
            console.warn('SoundManager: Web Audio not available', e);
        }
    }

    // ----------------------------------------------------------
    // AMBIENT DRONE
    // Two slightly detuned sine waves create a slow beating pulse.
    // Keeps the restricted-area atmosphere tense and eerie.
    // ----------------------------------------------------------
    _startAmbientDrone() {
        if (!this.ctx) return;

        const masterGain = this.ctx.createGain();
        masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
        // Fade the drone in gently over 3 seconds
        masterGain.gain.linearRampToValueAtTime(0.07, this.ctx.currentTime + 3);
        masterGain.connect(this.ctx.destination);
        this._droneGain = masterGain;

        // Low rumble pair (beating at ~0.5 Hz — very slow pulse)
        [54, 54.4].forEach(freq => {
            const osc = this.ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;
            osc.connect(masterGain);
            osc.start();
        });

        // High harmonic pair — adds a faint, eerie shimmer
        [218, 219.2].forEach(freq => {
            const osc = this.ctx.createOscillator();
            const g   = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            g.gain.value = 0.25; // quieter than bass
            osc.connect(g);
            g.connect(masterGain);
            osc.start();
        });
    }

    // ----------------------------------------------------------
    // FOOTSTEP  — short filtered noise burst, like a soft thud
    // ----------------------------------------------------------
    playFootstep() {
        if (!this.ctx) return;

        const bufLen = this.ctx.sampleRate * 0.06; // 60 ms
        const buf    = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
        const data   = buf.getChannelData(0);

        for (let i = 0; i < data.length; i++) {
            // White noise with fast exponential decay
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.25));
        }

        const source = this.ctx.createBufferSource();
        source.buffer = buf;

        // Low-pass filter makes it sound like a footstep, not static
        const filter = this.ctx.createBiquadFilter();
        filter.type            = 'lowpass';
        filter.frequency.value = 320;

        const gain = this.ctx.createGain();
        gain.gain.value = 0.18;

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        source.start();
    }

    // ----------------------------------------------------------
    // INTERACT BLIP — short square-wave chirp on E / A press
    // ----------------------------------------------------------
    playInteract() {
        if (!this.ctx) return;

        const osc  = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'square';
        osc.frequency.value = 520;

        gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.12);
    }

    // ----------------------------------------------------------
    // DISCOVERY STING — lower, more unsettling than the blip.
    // Called automatically by _showDiscovery in GameScene.
    // ----------------------------------------------------------
    playDiscovery() {
        if (!this.ctx) return;

        const t = this.ctx.currentTime;

        // Two-tone descending chord — unsettling
        [[220, 0.12], [165, 0.10]].forEach(([freq, vol]) => {
            const osc  = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t);
            osc.frequency.linearRampToValueAtTime(freq * 0.85, t + 1.2);
            gain.gain.setValueAtTime(vol, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t);
            osc.stop(t + 1.5);
        });
    }

    // ----------------------------------------------------------
    // SWING — sawtooth sweep down, like a swipe through air
    // ----------------------------------------------------------
    playSwing() {
        if (!this.ctx) return;
        const osc  = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(80, this.ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(); osc.stop(this.ctx.currentTime + 0.2);
    }

    // ----------------------------------------------------------
    // HURT — two descending square-wave hits, impact feel
    // ----------------------------------------------------------
    playHurt() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        [330, 220].forEach((freq, i) => {
            const osc  = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.1, t + i * 0.06);
            gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.15);
            osc.connect(gain); gain.connect(this.ctx.destination);
            osc.start(t + i * 0.06); osc.stop(t + i * 0.06 + 0.2);
        });
    }

    // ----------------------------------------------------------
    // ENEMY DIE — descending square wave, defeat squeal
    // ----------------------------------------------------------
    playEnemyDie() {
        if (!this.ctx) return;
        const osc  = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(60, this.ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(); osc.stop(this.ctx.currentTime + 0.4);
    }
}

// Global singleton — created here, initialised by TitleScene on first gesture
window.soundManager = new SoundManager();
