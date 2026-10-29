import { Chess, type Square, type PieceSymbol } from 'chess.js';
// Hand-drawn, six-column bitmap pieces keep the terminal's pixel geometry.
const bits: Record<PieceSymbol, string[]> = {
  p: ['001100', '011110', '001100', '011110', '011110', '111111'],
  n: ['001110', '011111', '111011', '100110', '001100', '011110', '111111'],
  b: ['001100', '011110', '011010', '001100', '011110', '011110', '111111'],
  r: ['101101', '111111', '011110', '011110', '011110', '111111'],
  q: ['101101', '011110', '111111', '011110', '011110', '111111'],
  k: ['001100', '111111', '001100', '011110', '011110', '011110', '111111'],
};
function icon(piece: PieceSymbol) {
  return `<svg class="chess-piece" viewBox="0 0 8 9" aria-hidden="true">${bits[piece].flatMap((row, y) => [...row].flatMap((bit, x) => (bit === '1' ? [`<rect x="${x + 1}" y="${y + 1}" width="1" height="1"/>`] : []))).join('')}</svg>`;
}
export function mount(host: HTMLElement) {
  let chess = new Chess(),
    selected: Square | undefined,
    last: string[] = [],
    thinking = false,
    id = 0,
    disposed = false;
  let worker = new Worker(new URL('./chess-worker.ts', import.meta.url), { type: 'module' });
  host.innerHTML =
    '<div class="module-toolbar"><span class="module-status" role="status">WHITE TO MOVE</span><select class="module-select" aria-label="Chess difficulty"><option value="200">BOT / CREW</option><option value="800" selected>BOT / OFFICER</option></select><button class="module-button" data-undo>UNDO</button><button class="module-button" data-new>NEW GAME</button></div><div class="game-stage"><div class="chess-board" aria-label="Chess board"></div></div><p class="module-help">SEVASTOPOL RECREATION / STRATEGY TRAINER<br>You play white. Select a piece, then a highlighted square. Promotion is to queen. The station bot searches locally in a worker.</p><p data-moves class="module-help"></p>';
  const board = host.querySelector<HTMLElement>('.chess-board')!,
    status = host.querySelector<HTMLElement>('.module-status')!;
  const names: Record<PieceSymbol, string> = {
    p: 'pawn',
    n: 'knight',
    b: 'bishop',
    r: 'rook',
    q: 'queen',
    k: 'king',
  };
  const render = () => {
    const legal = selected ? chess.moves({ square: selected, verbose: true }).map((m) => m.to) : [];
    board.innerHTML = chess
      .board()
      .flatMap((row, r) =>
        row.map((piece, f) => {
          const square = `${'abcdefgh'[f]}${8 - r}` as Square;
          return `<button class="chess-square ${(r + f) % 2 ? 'dark' : ''} ${selected === square ? 'selected' : ''} ${legal.includes(square) ? 'legal' : ''} ${last.includes(square) ? 'last' : ''} ${piece?.color === 'b' ? 'black-piece' : ''}" data-square="${square}" aria-label="${square}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${names[piece.type]}` : ''}" aria-pressed="${selected === square}">${piece ? icon(piece.type) : ''}</button>`;
        }),
      )
      .join('');
    status.textContent = chess.isCheckmate()
      ? `CHECKMATE / ${chess.turn() === 'w' ? 'STATION BOT' : 'CREW'} WINS`
      : chess.isDraw()
        ? 'DRAW / SESSION COMPLETE'
        : thinking
          ? 'STATION BOT THINKING…'
          : `${chess.turn() === 'w' ? 'WHITE' : 'BLACK'} TO MOVE${chess.isCheck() ? ' / CHECK' : ''}`;
    host.querySelector('[data-moves]')!.textContent = chess.history().slice(-10).join(' · ');
  };
  const onReply = (event: MessageEvent) => {
    if (disposed || event.data.id !== id) return;
    thinking = false;
    if (event.data.move) {
      try {
        const move = chess.move(event.data.move);
        last = [move.from, move.to];
      } catch {
        /* stale response is ignored */
      }
    }
    render();
  };
  worker.onmessage = onReply;
  const bot = () => {
    if (chess.isGameOver() || chess.turn() !== 'b') return;
    thinking = true;
    render();
    worker.postMessage({
      fen: chess.fen(),
      budget: Number(host.querySelector<HTMLSelectElement>('select')!.value),
      id: ++id,
    });
  };
  board.onclick = (e) => {
    const square = (e.target as HTMLElement).closest<HTMLElement>('[data-square]')?.dataset
      .square as Square | undefined;
    if (!square || thinking || chess.isGameOver() || chess.turn() !== 'w') return;
    const piece = chess.get(square);
    if (selected) {
      try {
        const move = chess.move({ from: selected, to: square, promotion: 'q' });
        last = [move.from, move.to];
        selected = undefined;
        render();
        bot();
        return;
      } catch {
        /* selecting another own piece is allowed */
      }
    }
    selected = piece?.color === 'w' ? square : undefined;
    render();
  };
  const cancel = () => {
    id++;
    worker.terminate();
    worker = new Worker(new URL('./chess-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = onReply;
    thinking = false;
    selected = undefined;
  };
  host.querySelector<HTMLButtonElement>('[data-new]')!.onclick = () => {
    cancel();
    chess = new Chess();
    last = [];
    render();
  };
  host.querySelector<HTMLButtonElement>('[data-undo]')!.onclick = () => {
    cancel();
    if (chess.turn() === 'w') chess.undo();
    chess.undo();
    last = [];
    render();
  };
  render();
  return () => {
    disposed = true;
    worker.terminate();
  };
}
