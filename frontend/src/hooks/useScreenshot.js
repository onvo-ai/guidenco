import { useEffect, useRef, useState } from 'react';

export function useScreenshot(streamUrl) {
  const [fps, setFps] = useState('Connecting…');
  const imgRef = useRef(null);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    let lastFrameAt = Date.now();
    let reconnectTimer = null;
    let rafId = null;
    let watchdog = null;

    // Tiny offscreen canvas for frame-change detection
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    let lastHash = -1;
    let frameCount = 0;
    let lastTick = Date.now();

    function checkFrame() {
      if (img.naturalWidth && img.naturalHeight) {
        ctx.drawImage(img, 0, 0, 8, 8);
        const d = ctx.getImageData(0, 0, 8, 8).data;
        // lightweight hash over 8 sampled pixels
        const hash = d[0] | (d[16] << 8) | (d[32] << 16) | (d[48] << 24);
        if (hash !== lastHash) {
          lastHash = hash;
          frameCount++;
          lastFrameAt = Date.now();
          const now = Date.now();
          if (now - lastTick >= 1000) {
            const measured = Math.round((frameCount * 1000) / (now - lastTick));
            setFps(`${measured} fps · ${img.naturalWidth}×${img.naturalHeight}`);
            frameCount = 0;
            lastTick = now;
          }
        }
      }
      rafId = requestAnimationFrame(checkFrame);
    }

    function connect() {
      img.src = `${streamUrl}?t=${Date.now()}`;
    }

    function scheduleReconnect(delayMs = 2000) {
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, delayMs);
    }

    function onError() {
      setFps('Stream error — reconnecting…');
      scheduleReconnect();
    }

    // Watchdog: reconnect if no new frame for 5s
    watchdog = setInterval(() => {
      if (Date.now() - lastFrameAt > 5000) {
        setFps('Stream stalled — reconnecting…');
        scheduleReconnect(0);
      }
    }, 2000);

    img.addEventListener('error', onError);
    connect();
    rafId = requestAnimationFrame(checkFrame);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(reconnectTimer);
      clearInterval(watchdog);
      img.removeEventListener('error', onError);
      img.src = '';
    };
  }, [streamUrl]);

  return { fps, imgRef };
}
