import '../src/terminal/interface.css';
import '../src/style.css';
import { GameShell } from '../src/features/game-shell.ts';
const game = new GameShell(document.querySelector('#game')!, 'POPUP PRESENTATION CHECK');
game.best('123');
document.querySelector<HTMLButtonElement>('#show')!.onclick = () => game.newBest();
