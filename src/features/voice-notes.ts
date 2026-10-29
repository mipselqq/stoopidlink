import { microphoneAudio, startPcmRecording, type PcmRecording } from './pcm-recorder.ts';
import {
  connect,
  endpoint,
  onlineStatus,
  request,
  SharedApiError,
  type Voice,
} from './shared-api.ts';

// Keep every visitor-supplied name in a text node, including literal markup.
export function voiceName(value: string) {
  const name = document.createElement('span');
  name.className = 'voice-name';
  name.textContent = value;
  return name;
}

export function mount(host: HTMLElement) {
  const state = onlineStatus(host),
    body = state.body;
  body.innerHTML =
    '<form class="voice-recorder" novalidate><input name="title" maxlength="40" placeholder="RECORDING NAME" aria-label="Recording name" required><div class="voice-actions"><button type="button" class="module-button" data-record>● RECORD</button><button type="submit" class="module-button" disabled data-send>SEND</button><span class="module-help" data-time>0:00 / 0:30</span></div><p class="module-help" role="status" data-message></p></form><div class="voice-scroll-area"><div class="voice-list" aria-label="Shared voice recordings"></div><terminal-scrollbar aria-label="Voice recordings" class="file-scroll voice-scroll"></terminal-scrollbar></div>';
  const form = body.querySelector<HTMLFormElement>('form')!,
    title = body.querySelector<HTMLInputElement>('input')!,
    record = body.querySelector<HTMLButtonElement>('[data-record]')!,
    send = body.querySelector<HTMLButtonElement>('[data-send]')!,
    clock = body.querySelector<HTMLElement>('[data-time]')!,
    message = body.querySelector<HTMLElement>('[data-message]')!,
    list = body.querySelector<HTMLElement>('.voice-list')!;
  const rail = body.querySelector<HTMLElement>('terminal-scrollbar')!;
  const syncScroll = () => {
    rail.setAttribute('max', String(Math.max(0, list.scrollHeight - list.clientHeight)));
    rail.setAttribute('page', String(list.clientHeight));
    rail.setAttribute('value', String(list.scrollTop));
  };
  rail.addEventListener('scrollbar-change', (e) => {
    list.scrollTop = (e as CustomEvent<{ value: number }>).detail.value;
    syncScroll();
  });
  list.addEventListener('scroll', syncScroll);
  const resize = new ResizeObserver(syncScroll);
  resize.observe(list);
  let disposed = false,
    online = false,
    recorder: PcmRecording | undefined,
    stream: MediaStream | undefined,
    blob: Blob | undefined,
    started = 0,
    timer: ReturnType<typeof setInterval> | undefined,
    recording = false,
    asking = false,
    refreshing = false,
    again = false;
  let active: HTMLAudioElement | undefined,
    context: AudioContext | undefined,
    analyser: AnalyserNode | undefined,
    raf = 0;
  const players = new Map<
    number,
    {
      audio: HTMLAudioElement;
      card: HTMLElement;
      canvas: HTMLCanvasElement;
      button: HTMLButtonElement;
      source?: MediaElementAudioSourceNode;
    }
  >();
  const paintWave = (canvas: HTMLCanvasElement, values?: Uint8Array<ArrayBuffer>) => {
    const c = canvas.getContext('2d')!;
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.fillStyle = '#83f7fb';
    const bars = 48;
    for (let i = 0; i < bars; i++) {
      const strength = values
        ? Math.abs(values[Math.floor((i / bars) * values.length)] - 128) / 128
        : 0;
      const height = values ? Math.max(2, Math.round(strength * 27)) : 2;
      c.fillRect(i * 5, 16 - Math.floor(height / 2), 3, height);
    }
  };
  const updatePlayer = (audio: HTMLAudioElement) => {
    const p = Array.from(players.values()).find((p) => p.audio === audio);
    if (!p) return;
    p.button.textContent = audio.paused ? '▶ PLAY' : 'Ⅱ PAUSE';
    p.button.setAttribute(
      'aria-label',
      `${audio.paused ? 'Play' : 'Pause'} ${audio.getAttribute('aria-label')}`,
    );
    if (audio.paused) paintWave(p.canvas);
  };
  const wave = () => {
    cancelAnimationFrame(raf);
    if (!active || active.paused || !analyser) return;
    const p = Array.from(players.values()).find((p) => p.audio === active);
    if (!p) return;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    paintWave(p.canvas, data);
    raf = requestAnimationFrame(wave);
  };
  const refresh = async () => {
    if (refreshing) {
      again = true;
      return;
    }
    refreshing = true;
    try {
      const notes = await request<Voice[]>('voices');
      if (disposed) return;
      if (!notes.length) list.textContent = 'NO AUDIO FOUND';
      else if (!players.size) list.textContent = '';
      const ids = new Set(notes.map((v) => v.id));
      for (const [id, p] of players) {
        if (!ids.has(id)) {
          p.audio.pause();
          p.source?.disconnect();
          p.audio.removeAttribute('src');
          p.audio.load();
          p.card.remove();
          players.delete(id);
        }
      }
      for (const note of notes) {
        if (players.has(note.id)) continue;
        const card = document.createElement('article');
        card.className = 'voice-note';
        const name = voiceName(note.name);
        const button = document.createElement('button');
        button.className = 'module-button';
        button.type = 'button';
        button.textContent = '▶ PLAY';
        button.setAttribute('aria-label', `Play ${note.name}`);
        const canvas = document.createElement('canvas');
        canvas.className = 'voice-wave';
        canvas.width = 240;
        canvas.height = 32;
        canvas.setAttribute('aria-hidden', 'true');
        const audio = new Audio();
        audio.preload = 'none';
        audio.crossOrigin = 'anonymous';
        audio.src = endpoint(`voices/${note.id}`);
        audio.setAttribute('aria-label', note.name);
        const player = {
          audio,
          card,
          canvas,
          button,
          source: undefined as MediaElementAudioSourceNode | undefined,
        };
        players.set(note.id, player);
        button.onclick = async () => {
          if (!audio.paused) {
            audio.pause();
            return;
          }
          active?.pause();
          active = audio;
          try {
            context ??= new AudioContext();
            analyser ??= context.createAnalyser();
            analyser.fftSize = 256;
            if (!player.source) {
              player.source = context.createMediaElementSource(audio);
              player.source.connect(analyser);
            }
            if (context.state === 'suspended') await context.resume();
            analyser.disconnect();
            analyser.connect(context.destination);
            await audio.play();
            if (disposed) {
              audio.pause();
              return;
            }
            wave();
          } catch (error) {
            console.error('Voice playback failed', error);
            message.textContent = 'AUDIO UNAVAILABLE';
          }
        };
        for (const event of ['play', 'pause', 'ended'])
          audio.addEventListener(event, () => {
            updatePlayer(audio);
            if (audio.paused && active === audio) cancelAnimationFrame(raf);
          });
        audio.addEventListener('error', () => {
          message.textContent = 'AUDIO UNAVAILABLE';
          updatePlayer(audio);
        });
        audio.hidden = true;
        card.append(name, button, canvas, audio);
        list.prepend(card);
        paintWave(canvas);
      }
      // Stable ordering preserves an already playing recording when someone adds a new one.
      for (const note of notes) {
        const card = players.get(note.id)!.card;
        list.append(card);
      }
      syncScroll();
    } catch {
      if (!disposed) {
        online = false;
        state.set(false);
      }
    } finally {
      refreshing = false;
      if (again && !disposed) {
        again = false;
        void refresh();
      }
    }
  };
  const stopTracks = () => {
    stream?.getTracks().forEach((track) => track.stop());
    stream = undefined;
  };
  const stopRecording = () => {
    if (!recording) return;
    recorder?.stop();
    clearInterval(timer);
    recording = false;
    record.disabled = true;
    record.textContent = '● RECORD';
  };
  record.onclick = async () => {
    if (recording) {
      stopRecording();
      return;
    }
    if (asking || !online) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
      message.textContent = 'MICROPHONE UNAVAILABLE / USE HTTPS';
      return;
    }
    asking = true;
    record.disabled = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: microphoneAudio });
      if (disposed) {
        stopTracks();
        return;
      }
      recorder = await startPcmRecording(stream);
      if (disposed || !online) {
        recorder.cancel();
        return;
      }
      blob = undefined;
      send.disabled = true;
      recording = true;
      started = Date.now();
      record.textContent = '■ STOP';
      message.textContent = 'RECORDING';
      clock.textContent = '0:00 / 0:30';
      void recorder.result
        .then((result) => {
          clearInterval(timer);
          recording = false;
          stopTracks();
          if (disposed) return;
          record.disabled = false;
          record.textContent = '● RECORD';
          blob = result;
          send.disabled = !blob.size;
          message.textContent = blob.size ? 'READY / NAME IT AND SEND' : 'RECORDING EMPTY';
        })
        .catch(() => {
          clearInterval(timer);
          recording = false;
          stopTracks();
          if (disposed) return;
          record.disabled = false;
          record.textContent = '● RECORD';
          message.textContent = 'RECORDING FAILED';
        });
      timer = setInterval(() => {
        const elapsed = Math.min(30, Math.floor((Date.now() - started) / 1000));
        clock.textContent = `0:${String(elapsed).padStart(2, '0')} / 0:30`;
        if (elapsed >= 30) stopRecording();
      }, 250);
    } catch {
      stopTracks();
      message.textContent = 'MICROPHONE ACCESS UNAVAILABLE';
    } finally {
      asking = false;
      if (!disposed) record.disabled = false;
    }
  };
  title.oninput = () => {
    if (title.value.trim()) title.removeAttribute('aria-invalid');
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!blob || !online || recording) return;
    const name = title.value.trim();
    if (!name) {
      title.setAttribute('aria-invalid', 'true');
      title.focus();
      return;
    }
    title.removeAttribute('aria-invalid');
    const data = new FormData();
    data.set('name', name);
    data.set('audio', blob, 'voice');
    send.disabled = true;
    record.disabled = true;
    message.textContent = 'SENDING';
    try {
      await request('voices', { method: 'POST', body: data });
      if (disposed) return;
      blob = undefined;
      title.value = '';
      message.textContent = 'SAVED';
      clock.textContent = '0:00 / 0:30';
      void refresh();
    } catch (error) {
      if (!disposed) {
        if (error instanceof SharedApiError && [400, 415, 429, 503, 507].includes(error.status))
          message.textContent = error.message;
        else {
          message.textContent = '[ DATA CORRUPTED ]';
          state.set(false);
        }
        send.disabled = false;
      }
    } finally {
      if (!disposed) record.disabled = false;
    }
  };
  const close = connect(
    () => {},
    () => {},
    () => {
      void refresh();
    },
    (value) => {
      online = value;
      state.set(value);
      if (!value) {
        stopRecording();
        stopTracks();
        active?.pause();
      }
    },
  );
  return () => {
    disposed = true;
    resize.disconnect();
    close();
    clearInterval(timer);
    recorder?.cancel();
    stopTracks();
    cancelAnimationFrame(raf);
    for (const p of players.values()) {
      p.audio.pause();
      p.source?.disconnect();
      p.audio.removeAttribute('src');
      p.audio.load();
    }
    void context?.close();
  };
}
