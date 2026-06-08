import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Play, Pause, Mic } from 'lucide-react';

function formatTime(sec) {
  if (!sec || !isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Gera barras decorativas tipo waveform a partir de uma seed (URL do áudio).
 * Garante o mesmo padrão sempre que renderizar a mesma mensagem.
 */
function generateBars(seed, count = 30) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const bars = [];
  for (let i = 0; i < count; i++) {
    h = (h * 1664525 + 1013904223) >>> 0;
    const norm = (h % 100) / 100;
    // Distribui amplitudes — meio mais alto, pontas mais baixas
    const dist = 1 - Math.abs((i - count / 2) / (count / 2)) * 0.4;
    bars.push(0.35 + norm * 0.55 * dist);
  }
  return bars;
}

/**
 * Player de áudio custom no estilo WhatsApp.
 * Props:
 *   - src: URL do áudio
 *   - variant: 'out' | 'in' — define paleta da bolha
 */
export default function AudioPlayer({ src, mime, variant = 'in' }) {
  const audioRef = useRef(null);
  const [playing, setPlaying]     = useState(false);
  const [duration, setDuration]   = useState(0);
  const [progress, setProgress]   = useState(0);
  const [loaded, setLoaded]       = useState(false);
  const [error, setError]         = useState(null);

  const bars = useMemo(() => generateBars(src || 'x'), [src]);

  const isOut = variant === 'out';
  const palette = isOut
    ? {
        playBtn:   'bg-emerald-600 hover:bg-emerald-700 text-white',
        barIdle:   'bg-emerald-200',
        barActive: 'bg-emerald-600',
        time:      'text-emerald-700/80',
        icon:      'text-emerald-700',
      }
    : {
        playBtn:   'bg-brand-600 hover:bg-brand-700 text-white',
        barIdle:   'bg-slate-200',
        barActive: 'bg-slate-600',
        time:      'text-slate-500',
        icon:      'text-slate-500',
      };

  useEffect(() => {
    const el = audioRef.current; if (!el) return;

    // Configurações importantes
    el.volume = 1;
    el.muted  = false;

    const onLoad   = () => {
      const d = el.duration;
      setDuration(isFinite(d) ? d : 0);
      setLoaded(true);
      setError(null);
    };
    const onCanPlay = () => setLoaded(true);
    const onTime   = () => setProgress(el.currentTime || 0);
    const onEnd    = () => { setPlaying(false); setProgress(0); };
    const onPlay   = () => setPlaying(true);
    const onPause  = () => setPlaying(false);
    const onError  = () => {
      const code = el.error?.code;
      const codes = { 1: 'aborted', 2: 'network', 3: 'decode', 4: 'unsupported' };
      const msg = `Não foi possível carregar o áudio (${codes[code] || 'erro'})`;
      console.warn('[AudioPlayer]', msg, el.error);
      setError(msg);
    };
    const onStalled = () => console.warn('[AudioPlayer] stalled', el.networkState, el.readyState);
    const onSuspend = () => console.log('[AudioPlayer] suspend', el.networkState, el.readyState);

    el.addEventListener('loadedmetadata', onLoad);
    el.addEventListener('canplay', onCanPlay);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('ended', onEnd);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('error', onError);
    el.addEventListener('stalled', onStalled);
    el.addEventListener('suspend', onSuspend);
    return () => {
      el.removeEventListener('loadedmetadata', onLoad);
      el.removeEventListener('canplay', onCanPlay);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('ended', onEnd);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('error', onError);
      el.removeEventListener('stalled', onStalled);
      el.removeEventListener('suspend', onSuspend);
    };
  }, [src]);

  const toggle = async () => {
    const el = audioRef.current; if (!el) return;
    console.log('[AudioPlayer] toggle — readyState:', el.readyState, 'paused:', el.paused, 'src:', el.currentSrc);
    try {
      if (el.paused) {
        // Se ainda não carregou, força o load antes de tocar
        if (el.readyState < 2) {
          el.load();
        }
        const playPromise = el.play();
        if (playPromise !== undefined) {
          await playPromise;
          console.log('[AudioPlayer] tocando — duration:', el.duration, 'currentTime:', el.currentTime);
        }
      } else {
        el.pause();
      }
    } catch (err) {
      console.warn('[AudioPlayer] play() rejeitado:', err.name, err.message);
      setError('Toque novamente para reproduzir');
    }
  };

  const seekTo = (e) => {
    const el = audioRef.current; if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    el.currentTime = pct * duration;
    setProgress(pct * duration);
  };

  const playedRatio = duration ? progress / duration : 0;

  return (
    <div className="flex items-center gap-2.5 min-w-[240px] py-0.5">
      {/* Botão play/pause */}
      <button
        onClick={toggle}
        disabled={!loaded}
        className={`w-9 h-9 rounded-full ${palette.playBtn} flex items-center justify-center shrink-0 transition-colors disabled:opacity-50`}
        aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>

      {/* Waveform clicável */}
      <div className="flex-1 min-w-0">
        <div
          onClick={seekTo}
          className="flex items-center gap-[2px] h-7 cursor-pointer select-none"
        >
          {bars.map((amp, i) => {
            const isPast = i / bars.length < playedRatio;
            return (
              <span
                key={i}
                className={`flex-1 rounded-full transition-colors ${isPast ? palette.barActive : palette.barIdle}`}
                style={{ height: `${Math.round(amp * 100)}%`, minHeight: 3 }}
              />
            );
          })}
        </div>

        {/* Tempo + ícone de microfone (ou erro) */}
        <div className={`flex items-center gap-1 mt-0.5 text-[10px] ${error ? 'text-red-500' : palette.time}`}>
          <Mic className={`w-2.5 h-2.5 ${error ? 'text-red-500' : palette.icon}`} />
          {error ? (
            <span className="truncate">{error}</span>
          ) : (
            <>
              <span className="font-mono tabular-nums">
                {formatTime(playing || progress > 0 ? progress : duration)}
              </span>
              {duration > 0 && (
                <span className="opacity-50">/ {formatTime(duration)}</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Áudio com src direto + preload="auto" carrega buffer completo.
          Estilo "sr-only" — visualmente escondido mas totalmente funcional, sem pointer-events:none. */}
      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        controls={false}
        style={{
          position: 'absolute',
          left: '-9999px',
          top: '-9999px',
          width: '1px',
          height: '1px',
        }}
      />
    </div>
  );
}
