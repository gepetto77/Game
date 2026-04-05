// ============================================================
// DialogueBox.js
// Manages the dialogue overlay at the bottom of the game screen.
// Shows typewriter text, speaker name, and a blinking prompt.
// First [A]/[E] press skips to end of text.
// Second [A]/[E] press dismisses the box.
// ============================================================

class DialogueBox {
    constructor(scene) {
        this.scene = scene;

        this.isOpen       = false;
        this.currentText  = '';
        this.displayedText = '';
        this.charIndex    = 0;
        this.typeTimer    = null;
        this.onDismiss    = null;

        // --- Background panel ---
        this.bg = scene.add.graphics();
        this.bg.setScrollFactor(0).setDepth(100);

        // --- Speaker name tag background ---
        this.nameTagBg = scene.add.graphics();
        this.nameTagBg.setScrollFactor(0).setDepth(100);

        // --- Speaker name text ---
        this.nameText = scene.add.text(18, 213, '', {
            fontSize: '11px',
            fill: '#0a0a1a',
            fontFamily: 'monospace',
            fontStyle: 'bold'
        }).setScrollFactor(0).setDepth(101);

        // --- Main content text with word wrap ---
        this.contentText = scene.add.text(18, 230, '', {
            fontSize: '12px',
            fill: '#e8e8e8',
            fontFamily: 'monospace',
            wordWrap: { width: 444 }
        }).setScrollFactor(0).setDepth(101);

        // --- Blinking "continue" prompt ---
        this.promptText = scene.add.text(368, 298, '[A] Continue', {
            fontSize: '10px',
            fill: '#4af7c4',
            fontFamily: 'monospace'
        }).setScrollFactor(0).setDepth(101);

        // Blink the prompt continuously
        scene.tweens.add({
            targets: this.promptText,
            alpha: { from: 1, to: 0.2 },
            yoyo: true,
            repeat: -1,
            duration: 550,
            ease: 'Sine.easeInOut'
        });

        // Draw the static background shape once
        this._drawBackground();

        // Hide everything at start
        this._setVisible(false);
    }

    // Draw the panel graphics (called once)
    _drawBackground() {
        // Main dark panel
        this.bg.fillStyle(0x0a0a1a, 0.93);
        this.bg.fillRoundedRect(10, 220, 460, 90, 6);
        // Teal border
        this.bg.lineStyle(2, 0x4af7c4, 1);
        this.bg.strokeRoundedRect(10, 220, 460, 90, 6);
    }

    // Show or hide all components
    _setVisible(visible) {
        this.bg.setVisible(visible);
        this.nameTagBg.setVisible(visible);
        this.nameText.setVisible(visible);
        this.contentText.setVisible(visible);
        this.promptText.setVisible(visible);
    }

    // -----------------------------------------------------------
    // show(speakerName, text, onDismiss)
    // Call this to open the dialogue box with new content.
    // speakerName: string or '' for no name tag
    // text: the full string to type out
    // onDismiss: optional callback fired when box closes
    // -----------------------------------------------------------
    show(speakerName, text, onDismiss) {
        this.isOpen       = true;
        this.currentText  = text;
        this.displayedText = '';
        this.charIndex    = 0;
        this.onDismiss    = onDismiss || null;

        // Draw name tag if there's a speaker
        this.nameTagBg.clear();
        if (speakerName && speakerName.length > 0) {
            this.nameTagBg.fillStyle(0x4af7c4, 1);
            this.nameTagBg.fillRect(10, 208, 130, 18);
            this.nameText.setText(speakerName);
        } else {
            this.nameText.setText('');
        }

        this.contentText.setText('');
        this._setVisible(true);
        this._startTypewriter();
    }

    // Start printing characters one by one
    _startTypewriter() {
        if (this.typeTimer) {
            this.typeTimer.remove(false);
            this.typeTimer = null;
        }

        this.typeTimer = this.scene.time.addEvent({
            delay: 25,
            callback: this._typeNextChar,
            callbackScope: this,
            repeat: this.currentText.length - 1
        });
    }

    // Add one character to the displayed text
    _typeNextChar() {
        if (this.charIndex < this.currentText.length) {
            this.displayedText += this.currentText[this.charIndex];
            this.contentText.setText(this.displayedText);
            this.charIndex++;
        }
    }

    // Skip to the end of the current text immediately
    _skipToEnd() {
        if (this.typeTimer) {
            this.typeTimer.remove(false);
            this.typeTimer = null;
        }
        this.displayedText = this.currentText;
        this.charIndex     = this.currentText.length;
        this.contentText.setText(this.displayedText);
    }

    // -----------------------------------------------------------
    // tryDismiss()
    // Call this when the player presses [A] or [E].
    // First press: skip to end.  Second press: close box.
    // -----------------------------------------------------------
    tryDismiss() {
        if (!this.isOpen) return;

        if (this.charIndex < this.currentText.length) {
            // Still typing — skip to end
            this._skipToEnd();
        } else {
            // Already at end — close
            this._dismiss();
        }
    }

    _dismiss() {
        this.isOpen = false;
        this._setVisible(false);
        if (this.typeTimer) {
            this.typeTimer.remove(false);
            this.typeTimer = null;
        }
        if (this.onDismiss) {
            this.onDismiss();
        }
    }

    // Returns true while the dialogue box is visible
    isVisible() {
        return this.isOpen;
    }
}
