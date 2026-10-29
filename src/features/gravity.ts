// Station presentation of the unmodified Wheelie / Gravity Defied physics (GPL-2.0-only).
const asset = (path: string) => `${import.meta.env.BASE_URL}assets/${path}`;
import { Sim, Status, createPose, TICK_MILLISECONDS } from '../vendor/gravity/core/sim.ts';
import { parsePackHeader, parseTrack } from '../vendor/gravity/formats/mrg.ts';
import { GameShell, COLORS } from './game-shell.ts';
import { GameBest } from './game-best.ts';
import { selectMenu } from './select-menu.ts';
let packPromise: Promise<Uint8Array> | undefined;
export async function mount(host: HTMLElement) {
  const bytes = await (packPromise ??= fetch(asset('games/gravity/levels.mrg'))
    .then((r) => {
      if (!r.ok) throw new Error('TRACK ARCHIVE UNAVAILABLE');
      return r.arrayBuffer();
    })
    .then((b) => new Uint8Array(b)));
  const header = parsePackHeader(bytes),
    tracks = header.levels.flatMap((level, difficulty) =>
      level.map((entry, index) => ({ ...entry, difficulty, index })),
    );
  const game = new GameShell(host);
  const playButton = host.querySelector<HTMLElement>('[data-play]')!;
  const toolbar = host.querySelector<HTMLElement>('.module-toolbar')!;
  const trackSelect = document.createElement('select');
  trackSelect.className = 'module-select';
  trackSelect.setAttribute('aria-label', 'Gravity Defied track');
  tracks.forEach((t, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = `${['EASY', 'MEDIUM', 'HARD'][t.difficulty]} / ${t.name}`;
    trackSelect.append(o);
  });
  const leagueSelect = document.createElement('select');
  leagueSelect.className = 'module-select';
  leagueSelect.setAttribute('aria-label', 'Motorcycle engine');
  for (const [i, label] of ['100 CC', '175 CC', '220 CC', '325 CC'].entries()) {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = label;
    leagueSelect.append(o);
  }
  toolbar.prepend(trackSelect, leagueSelect);
  let trackIndex = 0,
    league = 0,
    sim: Sim,
    accumulator = 0,
    throttle = 0,
    lean = 0,
    finished = false;
  const best = new GameBest(
    game,
    { game: 'gravity', level: trackIndex },
    (value) => `${(value / 1000).toFixed(2)} S`,
  );
  const pose = createPose();
  const reset = () => {
    best.select({ game: 'gravity', level: trackIndex });
    sim = new Sim({ track: parseTrack(bytes, tracks[trackIndex].offset), league });
    accumulator = 0;
    throttle = lean = 0;
    finished = false;
    sim.capture(pose);
    game.invalidate();
  };
  trackSelect.onchange = () => {
    trackIndex = Number(trackSelect.value);
    reset();
  };
  leagueSelect.onchange = () => {
    league = Number(leagueSelect.value);
    reset();
  };
  const trackMenu = selectMenu(trackSelect),
    leagueMenu = selectMenu(leagueSelect);
  const held = new Set<string>();
  const input = () => {
    throttle = (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0);
    lean = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
  };
  const press = (key: string, down: boolean) => {
    if (down) held.add(key);
    else held.delete(key);
    input();
  };
  game.keys((key, down) => {
    const map: Record<string, string> = {
      arrowup: 'up',
      w: 'up',
      arrowdown: 'down',
      s: 'down',
      arrowleft: 'left',
      a: 'left',
      arrowright: 'right',
      d: 'right',
    };
    if (key === 'release') {
      held.clear();
      input();
    } else if (map[key]) press(map[key], down);
  });
  game.button(
    'LEAN',
    () => press('left', true),
    () => press('left', false),
    false,
    '←',
  );
  game.button(
    'BRAKE',
    () => press('down', true),
    () => press('down', false),
    false,
    '↓',
  );
  game.button(
    'DRIVE',
    () => press('up', true),
    () => press('up', false),
    false,
    '↑',
  );
  game.button(
    'LEAN',
    () => press('right', true),
    () => press('right', false),
    false,
    '→',
  );
  const next = document.createElement('button');
  next.className = 'module-button';
  next.textContent = 'NEXT TRIAL';
  next.onclick = () => {
    trackIndex = (trackIndex + 1) % tracks.length;
    trackSelect.value = String(trackIndex);
    trackMenu.refresh();
    reset();
  };
  toolbar.insertBefore(next, game.status);
  const credits = document.createElement('p');
  credits.className = 'module-help game-credits';
  credits.innerHTML = `Physics: <a href="https://github.com/MihailPreis/Wheelie" target="_blank" rel="noreferrer">Wheelie / Gravity Defied</a> · <a href="${asset('../licenses/gravity-GPL-2.0.txt')}" target="_blank">GPL-2.0</a> · <a href="${asset('games/gravity/source.zip')}" download>source</a>. No warranty.`;
  host.append(credits);
  game.onReset = () => {
    held.clear();
    reset();
  };
  reset();
  game.loop(
    (dt) => {
      if (finished) return;
      accumulator += dt * 1000;
      try {
        while (accumulator >= TICK_MILLISECONDS) {
          accumulator -= TICK_MILLISECONDS;
          const status = sim.step(throttle, lean);
          if (
            status === Status.Crashed ||
            status === Status.Finished ||
            status === Status.FinishedLate
          ) {
            finished = true;
            game.setRunning(false);
            if (status === Status.Finished || status === Status.FinishedLate)
              best.submit(sim.raceTime);
            break;
          }
        }
        sim.capture(pose);
      } catch {
        finished = true;
        game.setRunning(false);
        game.message('SIMULATION RESET REQUIRED');
      }
    },
    () => {
      game.clear();
      const c = game.ctx,
        scale = 8 / 65536,
        tscale = 16 / 65536,
        camX = pose.x[0] * scale - game.width / 3,
        camY = pose.y[0] * scale + 210;
      // Terrain.collide subtracts 0x10000 after halving body coordinates (perspective offset).
      // Match that projection here; simulation coordinates and wheel radii stay untouched.
      const xy = (i: number): [number, number] => [
        pose.x[i] * scale - camX,
        camY - (pose.y[i] - 2 * 65536) * scale,
      ];
      c.lineWidth = 2;
      c.strokeStyle = COLORS.green;
      c.beginPath();
      const points = sim.terrain.points;
      for (let i = 0; i < sim.terrain.pointCount; i++) {
        const xx = points[i * 2] * tscale - camX,
          yy = camY - points[i * 2 + 1] * tscale;
        if (i === 0) c.moveTo(xx, yy);
        else c.lineTo(xx, yy);
      }
      c.stroke();
      for (const [index, label] of [
        [sim.terrain.startIndex, 'START'],
        [sim.terrain.finishIndex, 'FINISH'],
      ] as const) {
        const xx = points[index * 2] * tscale - camX,
          yy = camY - points[index * 2 + 1] * tscale;
        c.strokeStyle = COLORS.cyan;
        c.beginPath();
        c.moveTo(xx, yy);
        c.lineTo(xx, yy - 65);
        c.stroke();
        c.fillStyle = COLORS.green;
        c.fillRect(xx, yy - 65, 34, 18);
        game.text(label, xx + 3, yy - 52, COLORS.bg, 10);
      }
      const line = (a: [number, number], b: [number, number], color: string = COLORS.cyan) => {
        c.strokeStyle = color;
        c.beginPath();
        c.moveTo(...a);
        c.lineTo(...b);
        c.stroke();
      };
      for (const i of [1, 2]) {
        const [xx, yy] = xy(i);
        c.strokeStyle = COLORS.white;
        c.lineWidth = 3;
        c.beginPath();
        c.arc(xx, yy, 14, 0, Math.PI * 2);
        c.stroke();
        c.lineWidth = 1;
        const a = pose.angle[i] / 65536;
        line(
          [xx - 12 * Math.sin(a), yy - 12 * Math.cos(a)],
          [xx + 12 * Math.sin(a), yy + 12 * Math.cos(a)],
          COLORS.dim,
        );
      }
      c.lineWidth = 3;
      line(xy(1), xy(3));
      line(xy(3), xy(4));
      line(xy(4), xy(2));
      line(xy(2), xy(0));
      line(xy(0), xy(1));
      const head = xy(5),
        frame = xy(0),
        hip: [number, number] = [frame[0] - 6, frame[1] - 9];
      line(hip, [head[0] - 4, head[1] + 10], COLORS.green);
      line([head[0] - 4, head[1] + 10], xy(3), COLORS.green);
      line(hip, [frame[0] + 6, frame[1] + 4], COLORS.green);
      c.fillStyle = COLORS.white;
      c.fillRect(head[0] - 6, head[1] - 7, 12, 12);
      c.fillStyle = COLORS.cyan;
      c.fillRect(head[0] + 1, head[1] - 4, 6, 4);
      c.fillStyle = COLORS.dim;
      c.fillRect(16, 15, game.width - 32, 5);
      c.fillStyle = COLORS.green;
      c.fillRect(16, 15, (game.width - 32) * Math.max(0, Math.min(1, pose.progress / 65536)), 5);
      if (finished)
        game.text(
          sim.status === Status.Crashed ? 'RIDER DOWN / RESTART' : 'TRIAL COMPLETE',
          game.width / 2 - 140,
          110,
          sim.status === Status.Crashed ? COLORS.red : COLORS.amber,
          22,
        );
      else if (!game.running) {
        const scale = Math.min(
          game.canvas.clientWidth / game.canvas.width,
          game.canvas.clientHeight / game.canvas.height,
        );
        const size = parseFloat(getComputedStyle(playButton).fontSize) / (scale || 1);
        c.save();
        c.textAlign = 'center';
        game.text('AWAITING RIDER INPUT', game.width / 2, 110, COLORS.amber, size);
        c.restore();
      }
      game.message(
        `${tracks[trackIndex].name.toUpperCase()} / ${['100', '175', '220', '325'][league]} CC / ${(sim.raceTime / 1000).toFixed(2)} S`,
      );
    },
  );
  return () => {
    best.dispose();
    trackMenu.dispose();
    leagueMenu.dispose();
    game.dispose();
  };
}
