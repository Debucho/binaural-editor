import { Track } from '../../types/project';
import { HrirDataset, createNeumannKU100Dataset } from '../spatial/HrirDataset';
import { renderSofaAudio } from '../spatial/SofaAudioRenderer';

export interface RamCacheStatus {
  isRendering: boolean;
  percentage: number;
  memoryMb: number;
  renderedChunks: { startFrame: number; endFrame: number }[];
  currentRenderingFrame?: number;
}

export type RamStatusListener = (status: RamCacheStatus) => void;

export class RamPreviewManager {
  private hrirDataset: HrirDataset;
  private cachedBuffer: AudioBuffer | null = null;
  private renderedFrames: boolean[] = [];
  private totalFrames = 900;
  private fps = 30;
  private sampleRate = 48000;

  private isRendering = false;
  private abortController: AbortController | null = null;
  private listeners: Set<RamStatusListener> = new Set();

  private activeRamSource: AudioBufferSourceNode | null = null;
  private isPlayingRam = false;

  public getFps(): number {
    return this.fps;
  }

  constructor() {
    this.hrirDataset = createNeumannKU100Dataset(this.sampleRate);
  }

  public setHrirDataset(dataset: HrirDataset) {
    this.hrirDataset = dataset;
    this.invalidate();
  }

  public getHrirDataset(): HrirDataset {
    return this.hrirDataset;
  }

  public subscribe(listener: RamStatusListener) {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const status = this.getStatus();
    for (const l of this.listeners) {
      l(status);
    }
  }

  public getStatus(): RamCacheStatus {
    let cachedCount = 0;
    for (let i = 0; i < this.renderedFrames.length; i++) {
      if (this.renderedFrames[i]) cachedCount++;
    }

    const percentage = this.totalFrames > 0 ? Math.round((cachedCount / this.totalFrames) * 100) : 0;
    const memoryMb = this.cachedBuffer
      ? parseFloat(((this.cachedBuffer.length * 2 * 4) / (1024 * 1024)).toFixed(1))
      : 0;

    // Aggregate contiguous rendered chunks
    const chunks: { startFrame: number; endFrame: number }[] = [];
    let start: number | null = null;
    for (let i = 0; i < this.totalFrames; i++) {
      if (this.renderedFrames[i] && start === null) {
        start = i;
      } else if (!this.renderedFrames[i] && start !== null) {
        chunks.push({ startFrame: start, endFrame: i });
        start = null;
      }
    }
    if (start !== null) {
      chunks.push({ startFrame: start, endFrame: this.totalFrames });
    }

    return {
      isRendering: this.isRendering,
      percentage,
      memoryMb,
      renderedChunks: chunks,
    };
  }

  /**
   * Invalidates RAM cache when project tracks/keyframes/clips change
   */
  public invalidate() {
    this.stopRendering();
    this.stopPlayback();
    this.renderedFrames = new Array(this.totalFrames).fill(false);
    this.cachedBuffer = null;
    this.notify();
  }

  /**
   * Check if a specific frame is already pre-rendered in RAM
   */
  public isFrameCached(frame: number): boolean {
    return Boolean(this.renderedFrames[frame]);
  }

  /**
   * Starts background rendering of uncached timeline chunks
   */
  public async renderAll(
    tracks: Track[],
    fps: number,
    totalFrames: number,
    targetStartFrame?: number,
    targetEndFrame?: number
  ) {
    if (this.isRendering) {
      this.stopRendering();
    }

    this.fps = fps;
    this.totalFrames = totalFrames;
    if (this.renderedFrames.length !== totalFrames) {
      this.renderedFrames = new Array(totalFrames).fill(false);
    }

    // Allocate master cached AudioBuffer if not present
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const dummyCtx = new AudioCtx();
    const totalSamples = Math.ceil((totalFrames / fps) * this.sampleRate);

    if (!this.cachedBuffer || this.cachedBuffer.length !== totalSamples) {
      this.cachedBuffer = dummyCtx.createBuffer(2, totalSamples, this.sampleRate);
    }

    this.isRendering = true;
    this.abortController = new AbortController();
    this.notify();

    const start = targetStartFrame ?? 0;
    const end = targetEndFrame ?? totalFrames;

    // Render in chunks of 60 frames (e.g. 2 seconds at 30fps) for smooth progress & UI responsiveness
    const chunkSize = Math.max(30, fps * 2);

    try {
      for (let f = start; f < end; f += chunkSize) {
        if (this.abortController.signal.aborted) break;

        const chunkEnd = Math.min(end, f + chunkSize);

        // Check if chunk is already fully rendered
        let allRendered = true;
        for (let i = f; i < chunkEnd; i++) {
          if (!this.renderedFrames[i]) {
            allRendered = false;
            break;
          }
        }
        if (allRendered) continue;

        // Render this slice with high-precision SOFA convolution
        const result = await renderSofaAudio(
          tracks,
          fps,
          totalFrames,
          this.hrirDataset,
          this.sampleRate,
          undefined,
          f,
          chunkEnd
        );

        if (this.abortController.signal.aborted) break;

        // Copy chunk samples into master cache AudioBuffer
        const startSample = Math.round((f / fps) * this.sampleRate);
        const leftChannel = this.cachedBuffer.getChannelData(0);
        const rightChannel = this.cachedBuffer.getChannelData(1);

        const copyLen = Math.min(result.totalSamples, totalSamples - startSample);
        leftChannel.set(result.left.subarray(0, copyLen), startSample);
        rightChannel.set(result.right.subarray(0, copyLen), startSample);

        // Mark frames as rendered
        for (let i = f; i < chunkEnd; i++) {
          this.renderedFrames[i] = true;
        }

        this.notify();

        // Brief yield to keep UI silky smooth
        await new Promise((resolve) => setTimeout(resolve, 8));
      }
    } catch (err) {
      console.error('RAM Preview rendering error:', err);
    } finally {
      this.isRendering = false;
      this.notify();
    }
  }

  public stopRendering() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isRendering = false;
    this.notify();
  }

  /**
   * Starts playback directly from pre-rendered RAM buffer
   */
  public playFromRam(audioCtx: AudioContext, startFrame: number, fps: number): boolean {
    if (!this.cachedBuffer || !this.isFrameCached(startFrame)) {
      return false;
    }

    this.stopPlayback();

    const startSec = startFrame / fps;
    const source = audioCtx.createBufferSource();
    source.buffer = this.cachedBuffer;
    source.connect(audioCtx.destination);
    source.start(audioCtx.currentTime, startSec);

    this.activeRamSource = source;
    this.isPlayingRam = true;
    return true;
  }

  public stopPlayback() {
    if (this.activeRamSource) {
      try {
        this.activeRamSource.stop();
        this.activeRamSource.disconnect();
      } catch {
        // Ignore already stopped source
      }
      this.activeRamSource = null;
    }
    this.isPlayingRam = false;
  }

  public getIsPlayingRam(): boolean {
    return this.isPlayingRam;
  }

  public getCachedBuffer(): AudioBuffer | null {
    return this.cachedBuffer;
  }
}

export const ramPreviewManager = new RamPreviewManager();
