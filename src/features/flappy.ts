import { GameShell, COLORS } from './game-shell.ts';
import { GameBest } from './game-best.ts';
import { HALF_GAP, nextGap } from './flappy-course.ts';
export function mount(host: HTMLElement) {
  const game = new GameShell(
    host,
    'VENT RUNNER / MAINTENANCE DRONE 04. SPACE, ↑ or tap the viewport to pulse the thruster. Pass the airlocks without touching the ducts.',
  );
  const best = new GameBest(game, { game: 'flappy', level: 0 });
  let y = 180,
    vy = 0,
    pipes: { x: number; gap: number; counted: boolean }[] = [],
    clock = 0,
    score = 0,
    over = false,
    lastGap: number | undefined;
  const reset = () => {
    best.begin();
    y = 180;
    vy = 0;
    pipes = [];
    clock = 0;
    score = 0;
    over = false;
    lastGap = undefined;
  };
  const flap = () => {
    if (over) return;
    if (!game.running) game.setRunning(true);
    vy = -245;
  };
  const fail = () => {
    if (over) return;
    over = true;
    best.submit(score);
    game.setRunning(false);
    game.message(`DRONE LOST / ${score} AIRLOCKS / RESTART TO RETRY`);
  };
  game.onReset = reset;
  game.keys((key, down, repeat) => {
    if (down && !repeat && [' ', 'arrowup', 'w'].includes(key)) flap();
  });
  game.button('THRUSTER PULSE', flap);
  game.canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    game.canvas.focus();
    flap();
  });
  reset();
  game.loop(
    (dt) => {
      vy += 720 * dt;
      y += vy * dt;
      clock += dt;
      if (clock >= 1.55) {
        clock = 0;
        lastGap = nextGap(lastGap);
        pipes.push({ x: game.width + 30, gap: lastGap, counted: false });
      }
      for (const p of pipes) {
        p.x -= 145 * dt;
        if (!p.counted && p.x + 46 < 130) {
          p.counted = true;
          score++;
        }
        if (p.x < 143 && p.x + 46 > 117 && (y - 10 < p.gap - HALF_GAP || y + 10 > p.gap + HALF_GAP))
          fail();
      }
      pipes = pipes.filter((p) => p.x > -60);
      if (y < 18 || y > 342) fail();
    },
    () => {
      game.clear();
      const c = game.ctx;
      c.strokeStyle = COLORS.dim;
      for (let xx = 0; xx < game.width; xx += 40) {
        c.strokeRect(xx, 0, 40, 12);
        c.strokeRect(xx, 348, 40, 12);
      }
      for (const p of pipes) {
        const top = p.gap - HALF_GAP,
          bottom = p.gap + HALF_GAP;
        c.fillStyle = '#075132';
        c.fillRect(p.x, 12, 46, top - 12);
        c.fillRect(p.x, bottom, 46, 348 - bottom);
        c.strokeStyle = COLORS.green;
        c.strokeRect(p.x, 12, 46, top - 12);
        c.strokeRect(p.x, bottom, 46, 348 - bottom);
        c.fillStyle = COLORS.amber;
        c.fillRect(p.x - 3, top - 5, 52, 5);
        c.fillRect(p.x - 3, bottom, 52, 5);
      }
      c.fillStyle = COLORS.cyan;
      c.fillRect(118, y - 9, 24, 18);
      c.fillStyle = COLORS.bg;
      c.fillRect(133, y - 5, 6, 5);
      c.fillStyle = COLORS.amber;
      c.fillRect(111, y - 3, 7, 7);
      game.text('SEVASTOPOL / VENT CONTROL', 16, 35, COLORS.green);
      game.text(String(score).padStart(3, '0'), game.width - 70, 35, COLORS.cyan, 22);
      if (over) game.text('SIGNAL LOST', game.width / 2 - 75, 180, COLORS.red, 24);
      else if (!game.running)
        game.text('PULSE TO LAUNCH', game.width / 2 - 95, 180, COLORS.amber, 22);
      if (!over) game.message(`DRONE 04 / ${score} AIRLOCKS PASSED`);
    },
  );
  return () => {
    best.dispose();
    game.dispose();
  };
}
