/**
 * NEON TETRIS - Core Game Engine
 */

// Register Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('Service Worker Registered'))
        .catch((err) => console.log('SW Registration Failed', err));
}

// Register Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('Service Worker Registered'))
        .catch((err) => console.log('SW Registration Failed', err));
}

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

    playTone(freq, type, duration, volume = 0.1) {
        if (!this.ctx || !this.enabled) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playMove() { this.playTone(150, 'square', 0.1, 0.05); }
    playRotate() { this.playTone(300, 'triangle', 0.15, 0.05); }
    playDrop() { this.playTone(100, 'sine', 0.2, 0.1); }
    playClear() {
        this.playTone(440, 'sine', 0.1, 0.1);
        setTimeout(() => this.playTone(880, 'sine', 0.2, 0.1), 100);
    }
    playGameOver() {
        this.playTone(200, 'sawtooth', 0.5, 0.1);
        setTimeout(() => this.playTone(150, 'sawtooth', 0.5, 0.1), 300);
        setTimeout(() => this.playTone(100, 'sawtooth', 1.0, 0.1), 600);
    }
}

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;

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

class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.nextCanvas = document.getElementById('next-canvas');
        this.nextCtx = this.nextCanvas.getContext('2d');
        this.audio = new AudioEngine();

        this.init();
        this.bindEvents();
    }

    init() {
        this.resize();
        this.grid = this.createGrid();
        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.gameOver = false;
        this.paused = false;

        this.dropCounter = 0;
        this.dropInterval = 1000;
        this.lastTime = 0;

        this.piece = null;
        this.nextPiece = this.createPiece();

        this.updateStats();
    }

    resize() {
        // Calculate block size based on container
        const container = this.canvas.parentElement;
        const width = container.clientWidth - 10;
        const height = container.clientHeight - 10;

        const possibleBlockSize = Math.min(width / COLS, height / ROWS);
        this.blockSize = possibleBlockSize;

        this.canvas.width = COLS * this.blockSize;
        this.canvas.height = ROWS * this.blockSize;

        this.nextCanvas.width = 4 * 15;
        this.nextCanvas.height = 4 * 15;
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
        // Clear background
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw grid lines (subtle)
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
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

            // Draw ghost piece (projection)
            this.drawGhost();
        }

        this.drawNext();
    }

    drawBlock(ctx, x, y, color, size, isGhost = false) {
        const padding = size * 0.1;
        const innerSize = size - padding * 2;

        if (isGhost) {
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.3;
            ctx.lineWidth = 2;
            ctx.strokeRect(x * size + padding, y * size + padding, innerSize, innerSize);
            ctx.globalAlpha = 1.0;
            return;
        }

        // Glow effect
        ctx.shadowBlur = size / 2;
        ctx.shadowColor = color;

        // Main block
        ctx.fillStyle = color;
        ctx.beginPath();
        const r = size * 0.15; // border radius
        const px = x * size + padding;
        const py = y * size + padding;
        ctx.roundRect(px, py, innerSize, innerSize, r);
        ctx.fill();

        // Shine/Highlight
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.roundRect(px + 2, py + 2, innerSize - 4, innerSize / 3, r / 2);
        ctx.fill();
    }

    drawGhost() {
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
        const size = 12;
        const offsetX = (this.nextCanvas.width - this.nextPiece.shape[0].length * size) / 2;
        const offsetY = (this.nextCanvas.height - this.nextPiece.shape.length * size) / 2;

        this.nextPiece.shape.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    const px = offsetX + x * size;
                    const py = offsetY + y * size;
                    this.nextCtx.fillStyle = this.nextPiece.color;
                    this.nextCtx.shadowBlur = 5;
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
        if (dir > 0) {
            shape.forEach(row => row.reverse());
        } else {
            shape.reverse();
        }
    }

    playerRotate(dir) {
        const pos = this.piece.pos.x;
        let offset = 1;
        this.rotate(this.piece.shape, dir);
        while (this.collide(this.grid, this.piece)) {
            this.piece.pos.x += offset;
            offset = -(offset + (offset > 0 ? 1 : -1));
            if (offset > this.piece.shape[0].length) {
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
            this.audio.playMove();
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
        outer: for (let y = ROWS - 1; y > 0; --y) {
            for (let x = 0; x < COLS; ++x) {
                if (this.grid[y][x] === 0) {
                    continue outer;
                }
            }
            const row = this.grid.splice(y, 1)[0].fill(0);
            this.grid.unshift(row);
            ++y;
            this.score += rowCount * 100;
            this.lines++;
            rowCount *= 2;
            this.audio.playClear();

            if (this.lines % 10 === 0) {
                this.level++;
                this.dropInterval = Math.max(100, 1000 - (this.level - 1) * 100);
            }
        }
    }

    updateStats() {
        document.getElementById('score').innerText = this.score.toString().padStart(6, '0');
        document.getElementById('level').innerText = this.level;
        document.getElementById('lines').innerText = this.lines;
    }

    gameOverAction() {
        this.gameOver = true;
        this.audio.playGameOver();
        document.getElementById('overlay').classList.remove('hidden');
    }

    update(time = 0) {
        if (this.gameOver || this.paused || !this.piece) return;

        const deltaTime = time - this.lastTime;
        this.lastTime = time;

        this.dropCounter += deltaTime;
        if (this.dropCounter > this.dropInterval) {
            this.playerDrop();
        }

        this.draw();
        requestAnimationFrame((t) => this.update(t));
    }

    start() {
        this.audio.init();
        if (this.gameOver) this.init();
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('overlay').classList.add('hidden');
        this.piece = this.createPiece();
        this.update();
    }

    bindEvents() {
        document.addEventListener('keydown', (e) => {
            if (this.gameOver) return;
            if (e.key === 'ArrowLeft') this.playerMove(-1);
            if (e.key === 'ArrowRight') this.playerMove(1);
            if (e.key === 'ArrowDown') this.playerDrop();
            if (e.key === 'ArrowUp') this.playerRotate(1);
            if (e.key === ' ') this.playerHardDrop();
            if (e.key === 'q') this.playerRotate(-1);
            if (e.key === 'w') this.playerRotate(1);
        });

        document.getElementById('start-btn').addEventListener('click', () => this.start());
        document.getElementById('restart-btn').addEventListener('click', () => this.start());

        // Touch controls
        document.getElementById('ctrl-left').addEventListener('click', () => this.playerMove(-1));
        document.getElementById('ctrl-right').addEventListener('click', () => this.playerMove(1));
        document.getElementById('ctrl-rotate').addEventListener('click', () => this.playerRotate(1));
        document.getElementById('ctrl-down').addEventListener('click', () => this.playerDrop());
        document.getElementById('ctrl-drop').addEventListener('click', () => this.playerHardDrop());

        // Modals
        const modalContainer = document.getElementById('modal-container');
        const settingsModal = document.getElementById('settings-modal');
        const infoModal = document.getElementById('info-modal');

        document.getElementById('settings-btn').addEventListener('click', () => {
            this.paused = true;
            modalContainer.classList.remove('hidden');
            settingsModal.classList.remove('hidden');
            infoModal.classList.add('hidden');
        });

        document.getElementById('info-btn').addEventListener('click', () => {
            this.paused = true;
            modalContainer.classList.remove('hidden');
            infoModal.classList.remove('hidden');
            settingsModal.classList.add('hidden');
        });

        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                modalContainer.classList.add('hidden');
                settingsModal.classList.add('hidden');
                infoModal.classList.add('hidden');
                if (!this.gameOver && !document.getElementById('start-screen').classList.contains('hidden')) {
                    // Stay paused if on start screen
                } else {
                    this.paused = false;
                    this.update();
                }
            });
        });

        document.getElementById('sound-toggle').addEventListener('change', (e) => {
            this.audio.enabled = e.target.checked;
        });

        document.getElementById('theme-select').addEventListener('change', (e) => {
            document.body.setAttribute('data-theme', e.target.value);
            this.draw();
        });

        window.addEventListener('resize', () => {
            this.resize();
            this.draw();
        });
    }
}

// Start game on load
window.onload = () => {
    window.game = new Game();
};
