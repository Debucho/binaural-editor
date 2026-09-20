import React, { useEffect, useRef } from 'react';

interface WaveformCanvasProps {
  peaks?: number[];
  color?: string;
  width?: number;
  height?: number;
}

export const WaveformCanvas: React.FC<WaveformCanvasProps> = ({
  peaks,
  color = '#38bdf8',
  width,
  height,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = width || canvas.clientWidth || 300;
    const h = height || canvas.clientHeight || 50;
    canvas.width = w;
    canvas.height = h;

    ctx.clearRect(0, 0, w, h);

    if (!peaks || peaks.length === 0) {
      // Draw subtle placeholder line
      ctx.strokeStyle = '#3d4251';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      return;
    }

    const midY = h / 2;
    const numPoints = peaks.length;
    const step = w / numPoints;

    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;

    // Draw mirrored waveform bars
    for (let i = 0; i < numPoints; i++) {
      const peak = peaks[i];
      const barHeight = Math.max(1, peak * (midY * 0.9));
      const x = i * step;

      ctx.fillRect(x, midY - barHeight, Math.max(1, step - 0.5), barHeight * 2);
    }
  }, [peaks, color, width, height]);

  return <canvas ref={canvasRef} className="w-full h-full block pointer-events-none opacity-80" />;
};
