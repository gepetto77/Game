// ============================================================
// DialogueBox.js
// Fixed-to-camera dialogue panel at the bottom of the screen.
//
// Flow:
//   show() → typewriter starts → [A] skips to end → [A] dismisses
//   (or, for long text, [A] advances to the next page first)
//
// While typing:  prompt shows  "[A] Skip"  (dim, steady)
// Page done, more remain: "[A] More"  (teal, blinking)
// Last page done:         "[A] Continue"  (teal, blinking)
//
// Long strings are paginated rather than dismissed-and-lost: the
// content box is only ~5 lines tall, so anything longer is split
// into pages the player pages through with [A], instead of text
// silently overflowing past the visible panel.
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
        this.isOpen    = true;
        this.onDismiss = onDismiss || null;
        this._pages    = this._paginate(text);

        // Name tag
        this.nameTagBg.clear();
        if (speaker && speaker.length > 0) {
            this.nameTagBg.fillStyle(0x4af7c4, 1);
            this.nameTagBg.fillRect(8, 202, Math.min(speaker.length * 8 + 16, 160), 16);
            this.nameText.setText(speaker);
        } else {
            this.nameText.setText('');
        }

        this._setVisible(true);
        this._showPage(0);
    }

    // -----------------------------------------------------------
    // Split text into pages that fit the content box. Uses a
    // monospace character-width estimate (the font is 'monospace',
    // so every character is the same width) rather than an actual
    // Phaser text measurement, which keeps this synchronous and
    // cheap to call on every show().
    // -----------------------------------------------------------
    _paginate(text) {
        const maxCharsPerLine = 61;   // ~446px wide content box at 12px monospace
        const maxLinesPerPage = 5;    // ~72px tall content area at 12px monospace

        const lines = [];
        text.split('\n').forEach(paragraph => {
            if (paragraph.length === 0) { lines.push(''); return; }
            let cur = '';
            paragraph.split(' ').forEach(word => {
                const candidate = cur ? cur + ' ' + word : word;
                if (candidate.length > maxCharsPerLine && cur) {
                    lines.push(cur);
                    cur = word;
                } else {
                    cur = candidate;
                }
            });
            if (cur) lines.push(cur);
        });

        const pages = [];
        for (let i = 0; i < lines.length; i += maxLinesPerPage) {
            pages.push(lines.slice(i, i + maxLinesPerPage).join('\n'));
        }
        return pages.length ? pages : [''];
    }

    _hasMorePages() {
        return this._pageIndex < this._pages.length - 1;
    }

    _showPage(index) {
        this._pageIndex     = index;
        this.currentText    = this._pages[index];
        this.displayedText  = '';
        this.charIndex      = 0;

        this.contentText.setText('');
        this.promptText.setText('[A] Skip');
        this.promptText.setAlpha(0.45);
        this._blinkTween.pause();

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
        this.promptText.setText(this._hasMorePages() ? '[A] More' : '[A] Continue');
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
        } else if (this._hasMorePages()) {
            this._showPage(this._pageIndex + 1);
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
