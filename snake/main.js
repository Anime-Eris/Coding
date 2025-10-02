// Constants
const CELL_SIZE = 24; // px in canvas units
const GRID_SIZE = 20; // 20x20 grid -> 480x480
const INITIAL_SPEED_MS = 160; // lower is faster
const SPEEDUP_FOOD_INTERVAL = 4; // every N foods eaten, speed up
const SPEEDUP_FACTOR = 0.92; // multiply interval by this each speedup

// Derived
const CANVAS_SIZE = CELL_SIZE * GRID_SIZE;

// State
let ctx, canvas;
let snake, directionQueue, food, score, best, tickMs, loopId;
let isPaused = false;
let isGameOver = false;

// Utilities
function randomInt(min, maxExclusive) {
  return Math.floor(Math.random() * (maxExclusive - min)) + min;
}

function positionsEqual(a, b) {
  return a.x === b.x && a.y === b.y;
}

function getRandomEmptyCell(exclusions) {
  while (true) {
    const pos = { x: randomInt(0, GRID_SIZE), y: randomInt(0, GRID_SIZE) };
    if (!exclusions.some((p) => positionsEqual(p, pos))) return pos;
  }
}

function init() {
  canvas = document.getElementById('board');
  ctx = canvas.getContext('2d');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;

  const bestFromStorage = Number(localStorage.getItem('snake_best') || '0');
  best = Number.isFinite(bestFromStorage) ? bestFromStorage : 0;
  document.getElementById('best').textContent = String(best);

  resetGame();
  bindControls();
  render();
}

function resetGame() {
  const start = { x: Math.floor(GRID_SIZE / 2), y: Math.floor(GRID_SIZE / 2) };
  snake = [start, { x: start.x - 1, y: start.y }, { x: start.x - 2, y: start.y }];
  directionQueue = [{ x: 1, y: 0 }];
  food = getRandomEmptyCell(snake);
  score = 0;
  tickMs = INITIAL_SPEED_MS;
  isPaused = false;
  isGameOver = false;
  updateScore(0);
  startLoop();
  hideOverlay();
  updatePanel('Paused', 'Press Space or Tap to resume');
}

function bindControls() {
  document.getElementById('pauseBtn').addEventListener('click', togglePause);
  document.getElementById('restartBtn').addEventListener('click', () => restart());
  document.getElementById('resumeBtn').addEventListener('click', () => resume());
  document.getElementById('panelRestartBtn').addEventListener('click', () => restart());

  // Keyboard
  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key === ' ' || key === 'spacebar') {
      e.preventDefault();
      togglePause();
      return;
    }
    const dir = keyToDir(key);
    if (dir) {
      e.preventDefault();
      queueDirection(dir);
    }
  });

  // Touch D-pad
  document.querySelectorAll('.dpad .d').forEach((btn) => {
    const dir = btn.getAttribute('data-dir');
    btn.addEventListener('click', () => {
      if (dir) queueDirection(dirStringToVector(dir));
    });
  });

  // Click overlay to resume
  const overlay = document.getElementById('overlay');
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && isPaused && !isGameOver) {
      resume();
    }
  });
}

function keyToDir(key) {
  switch (key) {
    case 'arrowup':
    case 'w':
      return { x: 0, y: -1 };
    case 'arrowdown':
    case 's':
      return { x: 0, y: 1 };
    case 'arrowleft':
    case 'a':
      return { x: -1, y: 0 };
    case 'arrowright':
    case 'd':
      return { x: 1, y: 0 };
    default:
      return null;
  }
}

function dirStringToVector(s) {
  if (s === 'up') return { x: 0, y: -1 };
  if (s === 'down') return { x: 0, y: 1 };
  if (s === 'left') return { x: -1, y: 0 };
  if (s === 'right') return { x: 1, y: 0 };
  return { x: 0, y: 0 };
}

function queueDirection(next) {
  const lastQueued = directionQueue[directionQueue.length - 1];
  if (!lastQueued) {
    directionQueue.push(next);
    return;
  }
  // Prevent reversing directly
  if (lastQueued.x + next.x === 0 && lastQueued.y + next.y === 0) return;
  directionQueue.push(next);
}

function startLoop() {
  if (loopId) clearInterval(loopId);
  loopId = setInterval(tick, tickMs);
}

function stopLoop() {
  if (loopId) {
    clearInterval(loopId);
    loopId = null;
  }
}

function togglePause() {
  if (isGameOver) return;
  isPaused = !isPaused;
  if (isPaused) {
    stopLoop();
    showOverlay('Paused', 'Press Space or Tap to resume');
  } else {
    hideOverlay();
    startLoop();
  }
}

function resume() {
  if (!isPaused || isGameOver) return;
  togglePause();
}

function restart() {
  resetGame();
}

function updateScore(delta) {
  score += delta;
  document.getElementById('score').textContent = String(score);
  if (score > best) {
    best = score;
    localStorage.setItem('snake_best', String(best));
    document.getElementById('best').textContent = String(best);
  }
}

function maybeSpeedUp() {
  const foodsEaten = Math.floor(score / 1);
  if (foodsEaten > 0 && foodsEaten % SPEEDUP_FOOD_INTERVAL === 0) {
    const newTick = Math.max(60, Math.floor(tickMs * SPEEDUP_FACTOR));
    if (newTick !== tickMs) {
      tickMs = newTick;
      startLoop();
    }
  }
}

function tick() {
  if (isPaused || isGameOver) return;

  const currentDir = directionQueue[0];
  // Apply queued direction once per tick
  if (directionQueue.length > 1) directionQueue.shift();

  const head = snake[0];
  const nextHead = { x: head.x + currentDir.x, y: head.y + currentDir.y };

  // Check wall collision
  if (nextHead.x < 0 || nextHead.y < 0 || nextHead.x >= GRID_SIZE || nextHead.y >= GRID_SIZE) {
    return gameOver();
  }

  // Check self collision (allow moving into previous tail only if not growing)
  for (let i = 0; i < snake.length; i++) {
    if (positionsEqual(nextHead, snake[i])) {
      return gameOver();
    }
  }

  // Move snake
  snake.unshift(nextHead);

  let grew = false;
  if (positionsEqual(nextHead, food)) {
    grew = true;
    updateScore(1);
    maybeSpeedUp();
    food = getRandomEmptyCell(snake);
  }
  if (!grew) snake.pop();

  render();
}

function gameOver() {
  isGameOver = true;
  stopLoop();
  showOverlay('Game Over', 'Press Restart or Enter');
}

function showOverlay(title, subtitle) {
  updatePanel(title, subtitle);
  const overlay = document.getElementById('overlay');
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  const overlay = document.getElementById('overlay');
  overlay.classList.add('hidden');
}

function updatePanel(title, subtitle) {
  document.getElementById('stateTitle').textContent = title;
  document.getElementById('stateSubtitle').textContent = subtitle;
}

function render() {
  // Clear
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Draw grid background
  ctx.fillStyle = '#0f1b3b';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Subtle grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= GRID_SIZE; i++) {
    const p = i * CELL_SIZE + 0.5;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, CANVAS_SIZE);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(CANVAS_SIZE, p);
    ctx.stroke();
  }

  // Draw food
  drawFood(food);

  // Draw snake
  drawSnake();
}

function drawSnake() {
  for (let i = 0; i < snake.length; i++) {
    const { x, y } = snake[i];
    const isHead = i === 0;
    const baseColor = isHead ? '#6cf' : '#9cf';

    // Cell background
    roundedRect(
      x * CELL_SIZE + 2,
      y * CELL_SIZE + 2,
      CELL_SIZE - 4,
      CELL_SIZE - 4,
      6
    );
    const gradient = ctx.createLinearGradient(
      x * CELL_SIZE,
      y * CELL_SIZE,
      (x + 1) * CELL_SIZE,
      (y + 1) * CELL_SIZE
    );
    gradient.addColorStop(0, baseColor + '');
    gradient.addColorStop(1, '#58a6ff');
    ctx.fillStyle = gradient;
    ctx.fill();

    // Inner shine
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundedRect(
      x * CELL_SIZE + 5,
      y * CELL_SIZE + 5,
      CELL_SIZE - 10,
      CELL_SIZE - 10,
      6
    );
    ctx.fill();
  }
}

function drawFood(pos) {
  const { x, y } = pos;
  // Apple-like circle with glow
  const cx = x * CELL_SIZE + CELL_SIZE / 2;
  const cy = y * CELL_SIZE + CELL_SIZE / 2;
  const r = CELL_SIZE * 0.32;

  const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
  g.addColorStop(0, '#ff7a7a');
  g.addColorStop(1, '#ff3b3b');

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();

  // Stem
  ctx.strokeStyle = '#7bc96f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 2, cy - r - 3);
  ctx.lineTo(cx + 6, cy - r - 8);
  ctx.stroke();
}

function roundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

window.addEventListener('load', init);
