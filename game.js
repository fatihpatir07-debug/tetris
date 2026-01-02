/**
 * NEON TETRIS - Core Game Engine
 */

// Register Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('Service Worker Registered'))
        .catch((err) => console.log('SW Registration Failed', err));
}

// Prevent double-tap to zoom
document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

let lastTouchTime = 0;
document.addEventListener('touchend', (e) => {
    const now = performance.now();
    if (now - lastTouchTime <= 300) e.preventDefault();
    lastTouchTime = now;
}, false);

class AudioEngine {
    constructor() {
        this.ctx = null;
        this.enabled = true;
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    // Generic synth method for flexibility
    playSynth(freq, type, duration, vol = 0.1, slideTo = null) {
        if (!this.ctx || !this.enabled) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        if (slideTo) {
            osc.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + duration);
        }

        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playNoise(duration, vol = 0.1) {
        if (!this.ctx || !this.enabled) return;
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        noise.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();
    }

    playMove() {
        // Crisp, short UI click
        this.playSynth(800, 'sine', 0.05, 0.05);
    }

    playRotate() {
        // Tech-y swipe sound
        this.playSynth(400, 'triangle', 0.1, 0.05, 600);
    }

    playDrop() {
        // Heavy thud
        this.playSynth(150, 'square', 0.15, 0.1, 40);
    }

    playClear() {
        // Futuristic success chime
        const now = this.ctx.currentTime;
        [440, 554, 659, 880].forEach((freq, i) => { // A Major chord
            setTimeout(() => {
                this.playSynth(freq, 'sine', 0.3, 0.1);
            }, i * 60);
        });
    }

    playGameOver() {
        // Power down effect
        this.playSynth(400, 'sawtooth', 1.5, 0.2, 50);
        setTimeout(() => this.playNoise(0.5, 0.2), 1000);
    }
}

const COLS = 10;
const ROWS = 20;

const COLORS = {
    'I': '#00f2ff', // Cyan
    'J': '#0044ff', // Blue
    'L': '#ff9500', // Orange
    'O': '#ffcc00', // Yellow
    'S': '#4cd964', // Green
    'T': '#bc13fe', // Purple
    'Z': '#ff3b30'  // Red
};

const SHAPES = {
    'I': [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    'J': [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    'L': [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
    'O': [[1, 1], [1, 1]],
    'S': [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    'T': [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    'Z': [[1, 1, 0], [0, 1, 1], [0, 0, 0]]
};

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = Math.random() * 4 + 2;
        this.speedX = (Math.random() - 0.5) * 6;
        this.speedY = (Math.random() - 0.5) * 6;
        this.life = 1.0;
        this.decay = Math.random() * 0.03 + 0.02;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.life -= this.decay;
        this.size *= 0.95;
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.life;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

class ParticleSystem {
    constructor() {
        this.particles = [];
    }

    spawn(x, y, color, count = 20) {
        for (let i = 0; i < count; i++) {
            this.particles.push(new Particle(x, y, color));
        }
    }

    update() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update();
            if (this.particles[i].life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    draw(ctx) {
        this.particles.forEach(p => p.draw(ctx));
    }
}

class FloatingText {
    constructor(text, x, y, color, size = 20) {
        this.text = text;
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = size;
        this.life = 1.0;
        this.velocityY = -1;
    }

    update() {
        this.y += this.velocityY;
        this.life -= 0.02;
    }

    draw(ctx) {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.font = `bold ${this.size}px 'Outfit', sans-serif`;
        ctx.textAlign = 'center';
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.fillText(this.text, this.x, this.y);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1.0;
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.nextCanvas = document.getElementById('next-canvas');
        this.nextCtx = this.nextCanvas.getContext('2d');
        this.audio = new AudioEngine();
        this.particles = new ParticleSystem();
        this.floatingTexts = [];
        this.shakeTimer = 0;
        this.shakeIntensity = 0;

        this.init();
        this.bindEvents();
    }

    init() {
        this.resize();
        this.grid = this.createGrid();
        this.score = 0;
        this.highScore = Number(localStorage.getItem('tetris_highscore')) || 0;
        this.lines = 0;
        this.level = 1;
        this.gameOver = false;
        this.paused = false;

        this.dropCounter = 0;
        this.dropInterval = 1000;
        this.lastTime = 0;

        this.piece = null;
        this.nextPiece = this.createPiece();

        // Input state
        this.keys = {
            left: false,
            right: false,
            down: false
        };
        this.keyTimers = {
            left: 0,
            right: 0,
            down: 0
        };
        this.dasDelay = 150; // Initial delay
        this.dasRepeat = 100 // Repeat rate

        this.updateStats();
    }

    resize() {
        const container = this.canvas.parentElement;
        const width = container.clientWidth - 10;
        const height = container.clientHeight - 10;

        const possibleBlockSize = Math.min(width / COLS, height / ROWS);
        this.blockSize = Math.floor(possibleBlockSize);

        this.canvas.width = COLS * this.blockSize;
        this.canvas.height = ROWS * this.blockSize;

        this.nextCanvas.width = 60;
        this.nextCanvas.height = 40;
    }

    createGrid() {
        return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    }

    createPiece() {
        const keys = Object.keys(SHAPES);
        const type = keys[Math.floor(Math.random() * keys.length)];
        const shape = SHAPES[type];
        return {
            pos: { x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 },
            shape: shape,
            type: type,
            color: COLORS[type]
        };
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Screen Shake
        this.ctx.save();
        if (this.shakeTimer > 0) {
            const dx = (Math.random() - 0.5) * this.shakeIntensity;
            const dy = (Math.random() - 0.5) * this.shakeIntensity;
            this.ctx.translate(dx, dy);
            this.shakeTimer--;
        }

        // Draw grid lines
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        this.ctx.lineWidth = 1;
        for (let x = 0; x <= COLS; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(x * this.blockSize, 0);
            this.ctx.lineTo(x * this.blockSize, this.canvas.height);
            this.ctx.stroke();
        }
        for (let y = 0; y <= ROWS; y++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y * this.blockSize);
            this.ctx.lineTo(this.canvas.width, y * this.blockSize);
            this.ctx.stroke();
        }

        // Draw static grid
        this.grid.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    this.drawBlock(this.ctx, x, y, value, this.blockSize);
                }
            });
        });

        // Draw active piece
        if (this.piece) {
            this.piece.shape.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value !== 0) {
                        this.drawBlock(this.ctx, this.piece.pos.x + x, this.piece.pos.y + y, this.piece.color, this.blockSize);
                    }
                });
            });
            this.drawGhost();
        }

        this.particles.draw(this.ctx);

        // Draw Floating Texts
        this.floatingTexts.forEach(txt => txt.draw(this.ctx));

        this.ctx.restore(); // Restore context (removes shake translation)
        this.drawNext();
    }

    drawBlock(ctx, x, y, color, size, isGhost = false) {
        const padding = size * 0.1;
        const innerSize = size - padding * 2;
        if (isGhost) {
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.2;
            ctx.lineWidth = 2;
            ctx.strokeRect(x * size + padding, y * size + padding, innerSize, innerSize);
            ctx.globalAlpha = 1.0;
            return;
        }
        ctx.shadowBlur = size / 3;
        ctx.shadowColor = color;
        ctx.fillStyle = color;
        ctx.beginPath();
        const r = size * 0.2;
        const px = x * size + padding;
        const py = y * size + padding;
        ctx.roundRect(px, py, innerSize, innerSize, r);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Shine effect
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        ctx.roundRect(px + 2, py + 2, innerSize - 4, innerSize / 4, r / 2);
        ctx.fill();
    }

    drawGhost() {
        if (!this.piece) return;
        let ghostPos = { ...this.piece.pos };
        while (!this.collide(this.grid, { ...this.piece, pos: { x: ghostPos.x, y: ghostPos.y + 1 } })) {
            ghostPos.y++;
        }
        this.piece.shape.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    this.drawBlock(this.ctx, ghostPos.x + x, ghostPos.y + y, this.piece.color, this.blockSize, true);
                }
            });
        });
    }

    drawNext() {
        this.nextCtx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
        if (!this.nextPiece) return;
        const size = 10;
        const offsetX = (this.nextCanvas.width - this.nextPiece.shape[0].length * size) / 2;
        const offsetY = (this.nextCanvas.height - this.nextPiece.shape.length * size) / 2;
        this.nextPiece.shape.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    const px = offsetX + x * size;
                    const py = offsetY + y * size;
                    this.nextCtx.fillStyle = this.nextPiece.color;
                    this.nextCtx.shadowBlur = 4;
                    this.nextCtx.shadowColor = this.nextPiece.color;
                    this.nextCtx.beginPath();
                    this.nextCtx.roundRect(px, py, size - 2, size - 2, 2);
                    this.nextCtx.fill();
                }
            });
        });
    }

    collide(grid, piece) {
        const [m, o] = [piece.shape, piece.pos];
        for (let y = 0; y < m.length; ++y) {
            for (let x = 0; x < m[y].length; ++x) {
                if (m[y][x] !== 0 &&
                    (grid[y + o.y] === undefined || grid[y + o.y][x + o.x] === undefined ||
                        grid[y + o.y][x + o.x] !== 0)) {
                    return true;
                }
            }
        }
        return false;
    }

    merge(grid, piece) {
        piece.shape.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    grid[y + piece.pos.y][x + piece.pos.x] = piece.color;
                }
            });
        });
    }

    rotate(shape, dir) {
        for (let y = 0; y < shape.length; ++y) {
            for (let x = 0; x < y; ++x) {
                [shape[x][y], shape[y][x]] = [shape[y][x], shape[x][y]];
            }
        }
        if (dir > 0) shape.forEach(row => row.reverse());
        else shape.reverse();
    }

    playerRotate(dir) {
        const pos = this.piece.pos.x;
        let offset = 1;
        this.rotate(this.piece.shape, dir);
        while (this.collide(this.grid, this.piece)) {
            this.piece.pos.x += offset;
            offset = -(offset + (offset > 0 ? 1 : -1));
            // Wall kick limit
            if (offset > this.piece.shape[0].length + 2) {
                this.rotate(this.piece.shape, -dir);
                this.piece.pos.x = pos;
                return;
            }
        }
        this.audio.playRotate();
    }

    playerDrop() {
        this.piece.pos.y++;
        if (this.collide(this.grid, this.piece)) {
            this.piece.pos.y--;
            this.merge(this.grid, this.piece);
            this.audio.playDrop();
            this.resetPiece();
            this.sweepGrid();
            this.updateStats();
        }
        this.dropCounter = 0;
    }

    playerHardDrop() {
        while (!this.collide(this.grid, { ...this.piece, pos: { x: this.piece.pos.x, y: this.piece.pos.y + 1 } })) {
            this.piece.pos.y++;
        }
        this.merge(this.grid, this.piece);
        this.audio.playDrop();

        this.triggerShake(3, 5); // Small shake on hard drop

        this.resetPiece();
        this.sweepGrid();
        this.updateStats();
        this.dropCounter = 0;
    }

    playerMove(dir) {
        this.piece.pos.x += dir;
        if (this.collide(this.grid, this.piece)) {
            this.piece.pos.x -= dir;
        } else {
            // Only play move sound if not continuous
            if (!this.keys.left && !this.keys.right) this.audio.playMove();
        }
    }

    resetPiece() {
        this.piece = this.nextPiece;
        this.nextPiece = this.createPiece();
        this.piece.pos.y = 0;
        this.piece.pos.x = Math.floor(COLS / 2) - Math.floor(this.piece.shape[0].length / 2);

        if (this.collide(this.grid, this.piece)) {
            this.gameOverAction();
        }
    }

    sweepGrid() {
        let rowCount = 1;
        let linesCleared = 0;
        outer: for (let y = ROWS - 1; y > 0; --y) {
            for (let x = 0; x < COLS; ++x) {
                if (this.grid[y][x] === 0) continue outer;
            }

            // Effect: Spawn particles at this row
            const py = y * this.blockSize + this.blockSize / 2;
            this.particles.spawn(this.canvas.width / 2, py, '#ffffff', 30);
            this.particles.spawn(this.canvas.width / 4, py, '#00f2ff', 15);
            this.particles.spawn(this.canvas.width * 0.75, py, '#ff00de', 15);

            const row = this.grid.splice(y, 1)[0].fill(0);
            this.grid.unshift(row);
            ++y;
            linesCleared++;
            this.score += rowCount * 100;
            rowCount *= 2;
        }

        if (linesCleared > 0) {
            this.lines += linesCleared;
            this.audio.playClear();

            // Visual Effects
            const centerX = this.canvas.width / 2;
            const centerY = this.canvas.height / 2;

            if (linesCleared === 4) {
                this.spawnText("TETRIS!", centerX, centerY, '#00f2ff', 40);
                this.triggerShake(10, 20); // Strong shake
            } else if (linesCleared > 0) {
                this.spawnText(`+${linesCleared * 100}`, centerX, centerY - 50, '#fff', 25);
                this.triggerShake(2 * linesCleared, 10);
            }

            // Level up every 10 lines
            if (Math.floor(this.lines / 10) > this.level - 1) {
                this.level++;
                this.dropInterval = Math.max(100, 1000 - (this.level - 1) * 100);
                this.spawnText("SEVİYE ATLADIN!", centerX, centerY + 50, '#39ff14', 30);
            }
        }
    }

    updateStats() {
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('tetris_highscore', this.highScore);
        }

        const scoreEl = document.getElementById('score');
        const levelEl = document.getElementById('level');
        const highEl = document.getElementById('high-score');

        if (scoreEl) scoreEl.innerText = this.score.toString().padStart(6, '0');
        if (levelEl) levelEl.innerText = this.level;
        if (highEl) highEl.innerText = this.highScore.toString().padStart(6, '0');
    }

    gameOverAction() {
        this.gameOver = true;
        this.audio.playGameOver();
        document.getElementById('overlay').classList.remove('hidden');
    }

    handleInput(deltaTime) {
        // DAS (Delayed Auto Shift) implementation for keys
        ['left', 'right', 'down'].forEach(key => {
            if (this.keys[key]) {
                this.keyTimers[key] += deltaTime;
                if (this.keyTimers[key] > this.dasDelay) {
                    if (key === 'left') this.playerMove(-1);
                    if (key === 'right') this.playerMove(1);
                    if (key === 'down') {
                        this.playerDrop();
                        this.score += 1; // Soft drop bonus
                        this.updateStats();
                        // Reset timer faster for down to simulate speed drop
                        this.keyTimers[key] -= (this.dasRepeat / 2);
                        return; // Skip default subtraction
                    }
                    this.keyTimers[key] -= this.dasRepeat;
                }
            } else {
                this.keyTimers[key] = 0;
            }
        });
    }

    triggerShake(intensity = 5, duration = 10) {
        this.shakeIntensity = intensity;
        this.shakeTimer = duration;
    }

    spawnText(text, x, y, color = '#fff', size = 20) {
        this.floatingTexts.push(new FloatingText(text, x, y, color, size));
    }

    update(time = 0) {
        if (this.gameOver || this.paused || !this.piece) return;
        const deltaTime = time - this.lastTime;
        this.lastTime = time;

        this.dropCounter += deltaTime;
        if (this.dropCounter > this.dropInterval) this.playerDrop();

        this.handleInput(deltaTime);
        this.particles.update();

        // Update texts
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            this.floatingTexts[i].update();
            if (this.floatingTexts[i].life <= 0) {
                this.floatingTexts.splice(i, 1);
            }
        }

        this.draw();
        requestAnimationFrame((t) => this.update(t));
    }

    togglePause() {
        if (this.gameOver) return;
        this.paused = !this.paused;
        const pausedOverlay = document.getElementById('paused-overlay');

        if (this.paused) {
            pausedOverlay.classList.remove('hidden');
        } else {
            pausedOverlay.classList.add('hidden');
            this.lastTime = performance.now();
            this.update(this.lastTime);
        }
    }

    start() {
        this.audio.init();
        if (this.gameOver) this.init();
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('overlay').classList.add('hidden');
        document.getElementById('paused-overlay').classList.add('hidden');
        this.paused = false;

        if (!this.piece) this.piece = this.createPiece(); // Ensure piece exists
        this.lastTime = performance.now();
        this.update(this.lastTime);
    }

    bindEvents() {
        // KEYBOARD
        document.addEventListener('keydown', (e) => {
            if (this.gameOver || this.paused) return;

            if (e.key === 'ArrowLeft') {
                if (!this.keys.left) { this.playerMove(-1); this.keyTimers.left = 0; } // Initial move
                this.keys.left = true;
            }
            if (e.key === 'ArrowRight') {
                if (!this.keys.right) { this.playerMove(1); this.keyTimers.right = 0; }
                this.keys.right = true;
            }
            if (e.key === 'ArrowDown') {
                this.keys.down = true;
            }
            if (e.key === 'ArrowUp') this.playerRotate(1);
            if (e.key === ' ') this.playerHardDrop();
        });

        document.addEventListener('keyup', (e) => {
            if (e.key === 'ArrowLeft') this.keys.left = false;
            if (e.key === 'ArrowRight') this.keys.right = false;
            if (e.key === 'ArrowDown') this.keys.down = false;
        });

        // UI BUTTONS
        document.getElementById('start-btn').addEventListener('click', () => this.start());
        document.getElementById('restart-btn').addEventListener('click', () => {
            this.init();
            this.start();
        });



        document.getElementById('resume-btn').addEventListener('click', () => this.togglePause());

        // TOUCH CONTROLS (Improved)
        const setupTouchBtn = (id, actionStart, actionEnd) => {
            const btn = document.getElementById(id);
            if (!btn) return;

            // Prevent default context menu
            btn.addEventListener('contextmenu', e => e.preventDefault());

            const startHandler = (e) => {
                e.preventDefault();
                // Haptic feedback
                if (navigator.vibrate) navigator.vibrate(15);
                actionStart();
            };

            const endHandler = (e) => {
                e.preventDefault();
                if (actionEnd) actionEnd();
            };

            btn.addEventListener('touchstart', startHandler, { passive: false });
            btn.addEventListener('mousedown', startHandler); // Mouse fallback

            btn.addEventListener('touchend', endHandler, { passive: false });
            btn.addEventListener('mouseup', endHandler);
            btn.addEventListener('mouseleave', endHandler);
        };

        setupTouchBtn('ctrl-left',
            () => { this.playerMove(-1); this.keys.left = true; this.keyTimers.left = 0; },
            () => { this.keys.left = false; }
        );

        setupTouchBtn('ctrl-right',
            () => { this.playerMove(1); this.keys.right = true; this.keyTimers.right = 0; },
            () => { this.keys.right = false; }
        );

        setupTouchBtn('ctrl-down',
            () => { this.keys.down = true; this.keyTimers.down = 0; },
            () => { this.keys.down = false; }
        );

        // Rotate and Drop don't need continuous press
        setupTouchBtn('ctrl-rotate', () => this.playerRotate(1));
        setupTouchBtn('ctrl-drop', () => this.playerHardDrop());


        // MODALS
        const modalContainer = document.getElementById('modal-container');
        const settingsModal = document.getElementById('settings-modal');
        const infoModal = document.getElementById('info-modal');
        const installModal = document.getElementById('install-modal');

        const openModal = (modal) => {
            this.paused = true;
            modalContainer.classList.remove('hidden');
            // Hide all modals first
            settingsModal.classList.add('hidden');
            infoModal.classList.add('hidden');
            installModal.classList.add('hidden');
            // Show target
            modal.classList.remove('hidden');
        };

        const closeModal = () => {
            modalContainer.classList.add('hidden');
            settingsModal.classList.add('hidden');
            infoModal.classList.add('hidden');
            installModal.classList.add('hidden');
            if (!this.gameOver && document.getElementById('start-screen').classList.contains('hidden')) {
                this.paused = false;
                this.lastTime = performance.now();
                this.update(this.lastTime);
            }
        };

        document.getElementById('settings-btn').addEventListener('click', () => openModal(settingsModal));
        document.getElementById('info-btn').addEventListener('click', () => openModal(infoModal));
        document.getElementById('install-btn').addEventListener('click', () => openModal(installModal));

        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', closeModal);
        });

        // Also close when clicking outside
        modalContainer.addEventListener('click', (e) => {
            if (e.target === modalContainer) closeModal();
        });

        document.getElementById('sound-toggle').addEventListener('change', (e) => {
            this.audio.enabled = e.target.checked;
        });

        // New Theme Selection Logic
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Update active class
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                // Set theme
                const theme = e.target.dataset.value;
                document.body.setAttribute('data-theme', theme);
                this.draw();
            });
        });

        window.addEventListener('resize', () => {
            this.resize();
            this.draw();
        });
    }
}

window.onload = () => {
    window.game = new Game();
};
