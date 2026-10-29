import type { TerminalContent } from '../core/types.ts';
import { techIcon } from './tech-icons.ts';

const techRows = [
  [
    'Core Stack',
    ['Go', 'PostgreSQL', 'Docker', 'Git', 'GitHub Actions', 'Linux', 'Prometheus', 'Grafana'],
  ],
  ['Proficient With', ['JavaScript', 'Python', 'Rust']],
  ['Learning Goals', ['Redis', 'gRPC']],
  ['Previously Used', ['TSQL', 'C#']],
  [
    'Workspace & Tools',
    ['VS Code', 'Arch Linux', 'Fish Shell', 'Kitty', 'Firefox', 'Kool Desktop Environment'],
  ],
] as const;

const stack = `<table class="tech-table"><thead><tr><th>Category</th><th>Badges</th></tr></thead><tbody>${techRows.map(([category, badges]) => `<tr><th>${category}</th><td>${badges.map((badge) => `<span class="badge" style="color:${badgeColor(badge)}">${techIcon(badge)}${badge}</span>`).join('')}</td></tr>`).join('')}</tbody></table>`;

function badgeColor(name: string) {
  const colors: Record<string, string> = {
    Go: '#00ADD8',
    PostgreSQL: '#4169E1',
    Docker: '#2496ED',
    Git: '#F05032',
    'GitHub Actions': '#2088FF',
    Linux: '#FCC624',
    Prometheus: '#E6522C',
    Grafana: '#F46800',
    JavaScript: '#F7DF1E',
    Python: '#3776AB',
    Rust: '#DEA584',
    Redis: '#FF4438',
    gRPC: '#2DA6B0',
    TSQL: '#CC2927',
    'C#': '#9179E4',
    'VS Code': '#0098FF',
    'Arch Linux': '#1793D1',
    'Fish Shell': '#4AAE46',
    Kitty: '#e5eee8',
    Firefox: '#FF7139',
    'Kool Desktop Environment': '#1D99F3',
  };
  return colors[name] ?? '#e5eee8';
}

const about = `<h2><span class="tone-cyan">Greetings!</span></h2>
<p>I'm targeting a <strong class="tone-green">Go junior backend developer</strong> job to build quality software.</p>
<p>In my work, I prioritize:</p><ul>
<li><strong class="tone-cyan">Maintainability</strong> (YAGNI, KISS, readable and writable code, balanced architecture) to iterate quickly.</li>
<li><strong class="tone-blue">Testability</strong> (high coverage, reliable cases) to avoid the human factor, prevent regressions, and save time on manual testing.</li>
<li><strong class="tone-amber">Observability</strong> (logging, remote access to logs and metrics) to figure out incidents as soon as possible.</li>
<li><strong class="tone-orange">Security</strong> (validation, pentesting, static analysis) to make code rock solid.</li>
<li><strong class="tone-violet">Critical AI-assisted development</strong> (strict reviews of AI-generated code with full understanding).</li></ul>`;

const pentesting = `<p>In my spare time, I enjoy breaking others' projects to have fun, strengthen my understanding of security, and bring value.</p>
<p>I completed a motivating <strong class="tone-cyan">university cybersecurity program</strong> and actively participated in CTF competitions:</p>
<ul><li><a href="https://capturetheflag.ru/ctf/7r3al6gfk1-kiberteh-ctf-2025" target="_blank" rel="noreferrer">CyberTECH CTF-2025</a> (ranked <span class="tone-amber">top 30%</span>).</li><li><a href="https://caplag.ru/competitions/kubok-regionov/" target="_blank" rel="noreferrer">Region Cup</a> (ranked <span class="tone-blue">top 30%</span>).</li><li><a href="https://hackrus.ru/1102" target="_blank" rel="noreferrer">OrangeCTF</a> (ranked <span class="tone-orange">top 40%</span>).</li></ul>
<p>I didn't expect to carry my team that much xD.</p><p>Also, I found several critical vulnerabilities in a real <a href="https://elix.rip/" target="_blank" rel="noreferrer">production app</a> with <span class="tone-amber">10k monthly users</span>, saving the owner money:</p>
<ul><li>Got a service for free twice.</li><li>Found payment webhook hash check issues.</li><li>Found a full internal API map from different sources.</li><li>Found missing proxy auth &amp; no subscription checks.</li><li>Pointed out several flaws that can be abused.</li></ul><p>From time to time, I find some cool bugs in the services I use, though I haven't submitted much reports.</p>`;

const philosophy = `<p>Programming has been my life's work since <span class="tone-amber">2020</span>, when I decided to write a simple bot in <span class="tone-blue">Python</span> as a friend did.</p>
<p>I think I’ve cracked the philosophy over the years: <strong class="tone-cyan">don't trust a solution that's flawless</strong>, and remember that tools are only a <strong class="tone-violet">WAY</strong>, not the end goal.</p>`;

const projects = `<h2><a href="https://github.com/mipselqq/goroutine" target="_blank" rel="noreferrer">goroutine ↗</a></h2><p>A nice kanban board with a beautiful heart</p><hr><h2><a href="https://github.com/mipselqq/vk-calls-tun" target="_blank" rel="noreferrer">vk-calls-tun ↗</a></h2><p>An esoteric way to bypass whitelists by encoding and streaming packets as video calls&#x20;</p>`;

const folders = [
  {
    id: 'personal',
    label: 'PERSONAL',
    entries: [
      { title: 'ABOUT ME', html: about },
      { title: 'TECH STACK', html: stack },
      { title: 'PENTESTING ACTIVITY', html: pentesting },
      { title: 'PHILOSOPHY', html: philosophy },
      { title: 'PROJECTS', html: projects },
    ],
  },
  {
    id: 'shared',
    label: 'SHARED',
    entries: [
      { title: 'DRAWING CLUB', module: 'pixels' as const },
      { title: 'VOICE FILES', module: 'voices' as const },
      {
        title: 'EFFECTIVE VIRUS TREATMENT',
        module: 'video' as const,
        videoSrc: 'video/effective-virus-treatment.mp4',
      },
    ],
  },
  {
    id: 'audio',
    label: 'AUDIO',
    entries: [
      {
        title: 'NOW PLAYING',
        audio: true,
        html: `<p id="audio-status">NO AUDIO FOUND — LIVE STATUS UNAVAILABLE</p><p class="muted">DEE​ZER USER 6950461561</p><a href="https://www.deezer.com/profile/6950461561" target="_blank" rel="noreferrer">OPEN DEEZER PROFILE ↗</a>`,
      },
    ],
  },
  {
    id: 'utility',
    label: 'UTILITY',
    entries: [
      { title: 'GRAVITY DEFIED', module: 'gravity' as const },
      { title: 'CARGO STACK', module: 'tetris' as const },
      { title: 'VENT RUNNER', module: 'flappy' as const },
      { title: 'STRATEGY TRAINER', module: 'chess' as const },
    ],
  },
];

export const terminalContent: TerminalContent = {
  folders: folders.map((folder) => ({
    ...folder,
    entries: folder.entries.map((entry, index) => ({
      ...entry,
      id: `${folder.id}-${index}`,
      kind: 'document' as const,
    })),
  })),
};
