const asset = (path: string) => `${import.meta.env.BASE_URL}assets/${path}`;
import type { TerminalEntry } from '../core/types.ts';
const time = (n: number) =>
  `${Math.floor((n || 0) / 60)}:${String(Math.floor((n || 0) % 60)).padStart(2, '0')}`;
export function mount(host: HTMLElement, entry: TerminalEntry) {
  host.innerHTML = `<div class="video-stage"><video class="video-frame" playsinline preload="none" poster="${asset('video/effective-virus-treatment.jpg')}" aria-label="Effective virus treatment"></video></div><div class="video-controls"><button data-play aria-label="Play video">▶ PLAY</button><button data-stop aria-label="Stop video">■ STOP</button><span class="video-time">0:00 / 2:32</span><input class="video-seek" type="range" min="0" max="152" value="0" step="1" aria-label="Video position"><button data-mute aria-label="Mute video">SOUND ON</button><input class="video-volume" type="range" min="0" max="1" step="0.05" value="0.7" aria-label="Volume"><button data-full aria-label="Video fullscreen">FULL</button></div><p class="module-help">SEVASTOPOL MEDICAL / EFFECTIVE VIRUS TREATMENT<br>ARCHIVE RECORD · <a href="https://www.youtube.com/watch?v=P5jCCarcuJ0" target="_blank" rel="noreferrer">SOURCE ↗</a></p><p role="status" class="module-help" data-status></p>`;
  const video = host.querySelector('video')!,
    play = host.querySelector<HTMLButtonElement>('[data-play]')!,
    seek = host.querySelector<HTMLInputElement>('.video-seek')!,
    volume = host.querySelector<HTMLInputElement>('.video-volume')!,
    mute = host.querySelector<HTMLButtonElement>('[data-mute]')!,
    status = host.querySelector<HTMLElement>('[data-status]')!;
  video.src = asset(entry.videoSrc ?? 'video/effective-virus-treatment.mp4');
  video.volume = 0.7;
  const update = () => {
    play.textContent = video.paused ? '▶ PLAY' : 'Ⅱ PAUSE';
    play.setAttribute('aria-label', video.paused ? 'Play video' : 'Pause video');
    host.querySelector('.video-time')!.textContent =
      `${time(video.currentTime)} / ${time(video.duration || 152)}`;
    seek.max = String(video.duration || 152);
    seek.value = String(video.currentTime);
    mute.textContent = video.muted ? 'SOUND OFF' : 'SOUND ON';
    mute.setAttribute('aria-label', video.muted ? 'Unmute video' : 'Mute video');
  };
  play.onclick = () => {
    if (video.paused)
      void video.play().catch((e) => {
        status.textContent = `PLAYBACK ERROR: ${e.message}`;
      });
    else video.pause();
  };
  host.querySelector<HTMLButtonElement>('[data-stop]')!.onclick = () => {
    video.pause();
    video.currentTime = 0;
    update();
  };
  mute.onclick = () => {
    video.muted = !video.muted;
    update();
  };
  volume.oninput = () => {
    video.volume = Number(volume.value);
    video.muted = video.volume === 0;
    update();
  };
  seek.oninput = () => {
    video.currentTime = Number(seek.value);
    update();
  };
  const full = host.querySelector<HTMLButtonElement>('[data-full]')!;
  const fullscreenChange = () => {
    const active = document.fullscreenElement === host;
    full.textContent = active ? 'EXIT' : 'FULL';
    full.setAttribute('aria-label', active ? 'Exit video fullscreen' : 'Video fullscreen');
  };
  full.onclick = () => {
    const change =
      document.fullscreenElement === host ? document.exitFullscreen() : host.requestFullscreen?.();
    void change?.catch(() => {
      status.textContent = 'Use the document arrow to enlarge playback.';
    });
  };
  document.addEventListener('fullscreenchange', fullscreenChange);
  for (const event of ['play', 'pause', 'timeupdate', 'loadedmetadata', 'ended', 'volumechange'])
    video.addEventListener(event, update);
  video.addEventListener('error', () => {
    status.textContent = 'ARCHIVE UNAVAILABLE. Check the local video file.';
  });
  return () => {
    document.removeEventListener('fullscreenchange', fullscreenChange);
    video.pause();
    video.removeAttribute('src');
    video.load();
  };
}
