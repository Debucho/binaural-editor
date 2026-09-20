import { Track } from '../types/project';
import { getInterpolatedPosition } from '../utils/interpolation';
import { audioEngine } from './AudioEngine';
import { audioBufferToWav } from './wavEncoder';

export interface RenderProgressCallback {
  (progress: number, stage: string): void;
}

export async function renderBinauralAudioOffline(
  tracks: Track[],
  fps: number,
  totalFrames: number,
  onProgress?: RenderProgressCallback
): Promise<ArrayBuffer> {
  const sampleRate = 48000;
  const durationSec = Math.max(0.1, totalFrames / fps);
  const totalLengthSamples = Math.ceil(durationSec * sampleRate);

  onProgress?.(0.05, 'オーディオグラフを構築中...');

  const offlineCtx = new OfflineAudioContext(2, totalLengthSamples, sampleRate);

  // Set listener facing -Z (matching 3D scene dummy head)
  const listener = offlineCtx.listener;
  if (listener.positionX) {
    listener.positionX.setValueAtTime(0, 0);
    listener.positionY.setValueAtTime(0, 0);
    listener.positionZ.setValueAtTime(0, 0);
    listener.forwardX.setValueAtTime(0, 0);
    listener.forwardY.setValueAtTime(0, 0);
    listener.forwardZ.setValueAtTime(-1, 0);
    listener.upX.setValueAtTime(0, 0);
    listener.upY.setValueAtTime(1, 0);
    listener.upZ.setValueAtTime(0, 0);
  } else {
    listener.setPosition(0, 0, 0);
    listener.setOrientation(0, 0, -1, 0, 1, 0);
  }

  const hasSolo = tracks.some((t) => t.solo);

  onProgress?.(0.15, 'トラックと空間化ノードを設定中...');

  for (const track of tracks) {
    let isAudible = true;
    if (hasSolo) {
      isAudible = track.solo && !track.muted;
    } else {
      isAudible = !track.muted;
    }

    const gain = offlineCtx.createGain();
    gain.gain.setValueAtTime(isAudible ? track.volume : 0, 0);

    const panner = offlineCtx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1.0;
    panner.maxDistance = 10000;
    panner.rolloffFactor = 1.0;

    gain.connect(panner);
    panner.connect(offlineCtx.destination);

    // Apply keyframe position automation across all frames
    // Sampling at frame steps produces smooth automation curves
    for (let f = 0; f <= totalFrames; f++) {
      const time = f / fps;
      const pos = getInterpolatedPosition(track.keyframes, f);

      if (panner.positionX) {
        panner.positionX.setValueAtTime(pos.x, time);
        panner.positionY.setValueAtTime(pos.y, time);
        panner.positionZ.setValueAtTime(pos.z, time);
      } else {
        panner.setPosition(pos.x, pos.y, pos.z);
      }
    }

    // Schedule audio clips on this track
    for (const clip of track.clips) {
      let buffer = audioEngine.getCachedBuffer(clip.filePath);
      if (!buffer) {
        // Attempt to load buffer if not cached
        const loaded = await audioEngine.loadAudio(clip.filePath);
        buffer = loaded.buffer;
      }

      if (buffer) {
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(gain);

        const startTime = clip.startFrame / fps;
        source.start(startTime, clip.trimStartSec, clip.durationSec);
      }
    }
  }

  onProgress?.(0.3, 'オフラインHRTFレンダリング中...');

  const renderedAudioBuffer = await offlineCtx.startRendering();

  onProgress?.(0.85, 'WAVエンコード中...');

  const wavArrayBuffer = audioBufferToWav(renderedAudioBuffer);

  onProgress?.(1.0, 'レンダリング完了');

  return wavArrayBuffer;
}
