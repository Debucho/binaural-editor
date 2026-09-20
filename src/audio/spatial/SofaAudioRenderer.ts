import { Track } from '../../types/project';
import { getInterpolatedPosition } from '../../utils/interpolation';
import { HrirDataset } from './HrirDataset';
import { OverlapSaveConvolver } from './FftConvolution';
import { audioEngine } from '../AudioEngine';

export interface SofaRenderProgress {
  (progress: number, stage: string): void;
}

export interface RenderedBinauralAudio {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  totalSamples: number;
  durationSec: number;
}

/**
 * High-Precision SOFA / HRIR Spatial Audio Offline & RAM Renderer
 */
export async function renderSofaAudio(
  tracks: Track[],
  fps: number,
  totalFrames: number,
  hrirDataset: HrirDataset,
  sampleRate = 48000,
  onProgress?: SofaRenderProgress,
  startFrame = 0,
  endFrame?: number
): Promise<RenderedBinauralAudio> {
  const actualEndFrame = endFrame ?? totalFrames;
  const renderFrames = Math.max(1, actualEndFrame - startFrame);
  const durationSec = renderFrames / fps;
  const totalSamples = Math.ceil(durationSec * sampleRate);

  const outLeft = new Float32Array(totalSamples);
  const outRight = new Float32Array(totalSamples);

  const hasSolo = tracks.some((t) => t.solo);
  const activeTracks = tracks.filter((t) => (hasSolo ? t.solo && !t.muted : !t.muted));

  if (activeTracks.length === 0) {
    return { left: outLeft, right: outRight, sampleRate, totalSamples, durationSec };
  }

  const blockSize = 256;
  const numBlocks = Math.ceil(totalSamples / blockSize);
  const inBlock = new Float32Array(blockSize);
  const outBlockL = new Float32Array(blockSize);
  const outBlockR = new Float32Array(blockSize);

  for (let trackIdx = 0; trackIdx < activeTracks.length; trackIdx++) {
    const track = activeTracks[trackIdx];
    const trackProgressBase = trackIdx / activeTracks.length;
    const trackProgressStep = 1 / activeTracks.length;

    onProgress?.(
      trackProgressBase,
      `SOFA空間化処理中: [${track.name}] (${trackIdx + 1}/${activeTracks.length})`
    );

    // 1. Synthesize dry mono audio stream for the rendered range
    const monoStream = new Float32Array(totalSamples);

    for (const clip of track.clips) {
      let buffer = audioEngine.getCachedBuffer(clip.filePath);
      if (!buffer) {
        try {
          const loaded = await audioEngine.loadAudio(clip.filePath);
          buffer = loaded.buffer;
        } catch {
          continue;
        }
      }
      if (!buffer) continue;

      const clipStartGlobalSec = clip.startFrame / fps;
      const clipEndGlobalSec = (clip.startFrame + clip.durationFrames) / fps;

      const renderStartSec = startFrame / fps;
      const renderEndSec = actualEndFrame / fps;

      // Check overlap with render interval
      if (clipEndGlobalSec > renderStartSec && clipStartGlobalSec < renderEndSec) {
        const overlapStartSec = Math.max(clipStartGlobalSec, renderStartSec);
        const overlapEndSec = Math.min(clipEndGlobalSec, renderEndSec);

        const destOffsetSamples = Math.round((overlapStartSec - renderStartSec) * sampleRate);
        const overlapDurationSec = overlapEndSec - overlapStartSec;
        const copySamples = Math.min(
          totalSamples - destOffsetSamples,
          Math.round(overlapDurationSec * sampleRate)
        );

        const clipInternalStartSec = clip.trimStartSec + (overlapStartSec - clipStartGlobalSec);
        const srcOffsetSamples = Math.round(clipInternalStartSec * buffer.sampleRate);

        const ch0 = buffer.getChannelData(0);
        const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
        const rateRatio = buffer.sampleRate / sampleRate;

        // Copy and downmix to mono with resampling
        for (let i = 0; i < copySamples; i++) {
          const srcIdx = Math.floor(srcOffsetSamples + i * rateRatio);
          if (srcIdx < ch0.length) {
            monoStream[destOffsetSamples + i] += (ch0[srcIdx] + ch1[srcIdx]) * 0.5;
          }
        }
      }
    }

    // 2. Block-by-block Overlap-Save convolution with dynamic HRIR
    const convolverL = new OverlapSaveConvolver(blockSize, hrirDataset.irLength);
    const convolverR = new OverlapSaveConvolver(blockSize, hrirDataset.irLength);

    let prevIrL: Float32Array | null = null;
    let prevIrR: Float32Array | null = null;

    for (let b = 0; b < numBlocks; b++) {
      const sampleOffset = b * blockSize;
      const validSamples = Math.min(blockSize, totalSamples - sampleOffset);

      // Fill inBlock
      inBlock.fill(0);
      for (let i = 0; i < validSamples; i++) {
        inBlock[i] = monoStream[sampleOffset + i];
      }

      // Calculate time and frame at this block's center
      const blockSec = (startFrame / fps) + ((sampleOffset + validSamples / 2) / sampleRate);
      const currentF = blockSec * fps;

      // Lookup 3D keyframe position
      const pos = getInterpolatedPosition(track.keyframes, currentF);
      const hrir = hrirDataset.getHrirForCartesian(pos.x, pos.y, pos.z);

      // Distance attenuation: Inverse distance law
      const refDist = 1.0;
      const distAtten = refDist / Math.max(refDist, hrir.distance);
      const gain = distAtten * track.volume;

      // Process left and right channels with click-free crossfade
      convolverL.processBlock(inBlock, hrir.irLeft, prevIrL, outBlockL);
      convolverR.processBlock(inBlock, hrir.irRight, prevIrR, outBlockR);

      // Accumulate into master output
      for (let i = 0; i < validSamples; i++) {
        outLeft[sampleOffset + i] += outBlockL[i] * gain;
        outRight[sampleOffset + i] += outBlockR[i] * gain;
      }

      prevIrL = hrir.irLeft;
      prevIrR = hrir.irRight;

      // Yield progress occasionally
      if (b % 40 === 0) {
        onProgress?.(
          trackProgressBase + (b / numBlocks) * trackProgressStep,
          `SOFA畳み込み中: [${track.name}] (${Math.round((b / numBlocks) * 100)}%)`
        );
      }
    }
  }

  onProgress?.(1.0, 'レンダリング完了');

  return {
    left: outLeft,
    right: outRight,
    sampleRate,
    totalSamples,
    durationSec,
  };
}
