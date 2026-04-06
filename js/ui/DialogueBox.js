// ============================================================
// DialogueBox.js
// Fixed-to-camera dialogue panel at the bottom of the screen.
//
// Flow:
//   show() → typewriter starts → [A] skips to end → [A] dismisses
//
// While typing:  prompt shows  "[A] Skip"  (dim, steady)
// When done:     prompt shows  "[A] Continue"  (teal, blinking)
// ============================================================

class DialogueBox {
    constructor(scene) {
        this.scene = scene;

        this.isOpen        = false;
        this.currentText   = '';
        this.displayedText = '';
        this.charIndex     = 0;
        this.typeTimer     = null;
        this.onDismiss     = null;

        // --- Background panel ---
        this.bg = scene.add.graphics();
        this.bg.setScrollFactor(0).setDepth(100);

        // --- Speaker name tag background ---
        this.nameTagBg = scene.add.graphics();
        this.nameTagBg.setScrollFactor(0).setDepth(100);

        // --- Speaker name text ---
        this.nameText = scene.add.text(18, 208, '', {
            fontSize: '10px',
            fill: '#0a0a1a',
            fontFamily: 'monospace',
            fontStyle: 'bold'
        }).setScrollFactor(0).setDepth(101);

        // --- Main content text ---
        this.contentText = scene.add.text(16, 224, '', {
            fontSize: '12px',
            fill: '#e0e0e0',
            fontFamily: 'monospace',
            wordWrap: { width: 446 }
        }).setScrollFactor(0).setDepth(101);

        // --- Dismiss/skip prompt (bottom right of box) ---
        this.promptText = scene.add.text(370, 300, '', {
            fontSize: '10px',
            fill: '#4af7c4',
            fontFamily: 'monospace'
        }).setScrollFactor(0).setDepth(101);

        // Blink tween on the prompt (runs always, only visible when box is open)
        this._blinkTween = scene.tweens.add({
            targets: this.promptText,
            alpha: { from: 1, to: 0.2 },
            yoyo: true,
            repeat: -1,
            duration: 500,
            ease: 'Sine.easeInOut',
            paused: true  // starts paused — only plays when typing is done
        });

        // Draw the background panel shape once
        this._drawBackground();

        // Start hidden
        this._setVisible(false);
    }

    _drawBackground() {
        // Dark panel
        this.bg.fillStyle(0x080812, 0.95);
        this.bg.fillRoundedRect(8, 214, 464, 100, 5);
        // Teal border
        this.bg.lineStyle(2, 0x4af7c4, 1);
        this.bg.strokeRoundedRect(8, 214, 464, 100, 5);
    }

    _setVisible(visible) {
        this.bg.setVisible(visible);
        this.nameTagBg.setVisible(visible);
        this.nameText.setVisible(visible);
        this.contentText.setVisible(visible);
        this.promptText.setVisible(visible);
    }

    // -----------------------------------------------------------
    // show(speaker, text, onDismiss)
    //   speaker:   string shown in the name tag, or '' for none
    //   text:      full string to type out
    //   onDismiss: optional callback fired when box closes
    // -----------------------------------------------------------
    show(speaker, text, onDismiss) {
        this.isOpen        = true;
        this.currentText   = text;
        this.displayedText = '';
        this.charIndex     = 0;
        this.onDismiss     = onDismiss || null;

        // Name tag
        this.nameTagBg.clear();
        if (speaker && speaker.length > 0) {
            this.nameTagBg.fillStyle(0x4af7c4, 1);
            this.nameTagBg.fillRect(8, 202, Math.min(speaker.length * 8 + 16, 160), 16);
            this.nameText.setText(speaker);
        } else {
            this.nameText.setText('');
        }

        // Reset content
        this.contentText.setText('');

        // Prompt shows "Skip" while typing
        this.promptText.setText('[A] Skip');
        this.promptText.setAlpha(0.45);
        this._blinkTween.pause();

        this._setVisible(true);
        this._startTypewriter();
    }

    _startTypewriter() {
        if (this.typeTimer) {
            this.typeTimer.remove(false);
            this.typeTimer = null;
        }
        this.typeTimer = this.scene.time.addEvent({
            delay: 22,
            callback: this._typeNextChar,
            callbackScope: this,
            repeat: this.currentText.length - 1
        });
    }

    _typeNextChar() {
        if (this.charIndex < this.currentText.length) {
            this.displayedText += this.currentText[this.charIndex];
            this.contentText.setText(this.displayedText);
            this.charIndex++;

            // Done typing?
            if (this.charIndex >= this.currentText.length) {
                this._onTypingComplete();
            }
        }
    }

    // Called automatically when the last character is typed
    _onTypingComplete() {
        this.promptText.setText('[A] Continue');
        this.promptText.setAlpha(1);
        this._blinkTween.resume();
    }

    _skipToEnd() {
        if (this.typeTimer) {
            this.typeTimer.remove(false);
            this.typeTimer = null;
        }
        this.displayedText = this.currentText;
        this.charIndex     = this.currentText.length;
        this.contentText.setText(this.displayedText);
        this._onTypingComplete();
    }

    // -----------------------------------------------------------
    // tryDismiss() — call this on [A] / [E] press.
    //   First press while typing: skip to end.
    //   Press when done typing: close box.
    // -----------------------------------------------------------
    tryDismiss() {
        if (!this.isOpen) return;

        if (this.charIndex < this.currentText.length) {
            this._skipToEnd();
        } else {
            this._dismiss();
        }
    }

    _dismiss() {
        this.isOpen = false;
        this._blinkTween.pause();
        this._setVisible(false);
        if (this.typeTimer) {
            this.typeTimer.remove(false);
            this.typeTimer = null;
        }
        if (this.onDismiss) {
            this.onDismiss();
        }
    }

    isVisible() { return this.isOpen; }
}
