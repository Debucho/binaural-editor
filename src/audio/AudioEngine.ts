import { Track, Position3D } from '../types/project';
import { getInterpolatedPosition } from '../utils/interpolation';
import { ramPreviewManager } from './preview/RamPreviewManager';

interface ActiveClipSource {
  clipId: string;
  sourceNode: AudioBufferSourceNode;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private trackNodes: Map<string, { gainNode: GainNode; pannerNode: PannerNode }> = new Map();
  private activeSources: ActiveClipSource[] = [];
  private audioBufferCache: Map<string, AudioBuffer> = new Map();

  private isPlaying = false;
  private playbackStartAudioTime = 0;
  private playbackStartTimelineSec = 0;
  private currentFps = 30;

  constructor() {
    // AudioContext will be initialized on user interaction or explicitly
  }

  public init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AudioCtx({ latencyHint: 'interactive' });

    // Set listener at origin facing forward +Z
    const listener = this.ctx.listener;
    if (listener.positionX) {
      listener.positionX.setValueAtTime(0, this.ctx.currentTime);
      listener.positionY.setValueAtTime(0, this.ctx.currentTime);
      listener.positionZ.setValueAtTime(0, this.ctx.currentTime);
      listener.forwardX.setValueAtTime(0, this.ctx.currentTime);
      listener.forwardY.setValueAtTime(0, this.ctx.currentTime);
      listener.forwardZ.setValueAtTime(1, this.ctx.currentTime);
      listener.upX.setValueAtTime(0, this.ctx.currentTime);
      listener.upY.setValueAtTime(1, this.ctx.currentTime);
      listener.upZ.setValueAtTime(0, this.ctx.currentTime);
    } else {
      // Legacy fallback
      listener.setPosition(0, 0, 0);
      listener.setOrientation(0, 0, 1, 0, 1, 0);
    }

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);
  }

  public getContext(): AudioContext {
    if (!this.ctx) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx!;
  }

  /**
   * Loads an audio file buffer from ArrayBuffer or IPC, decodes it, and computes waveform peaks
   */
  public async loadAudio(filePath: string, rawData?: ArrayBuffer): Promise<{ buffer: AudioBuffer; peaks: number[] }> {
    const ctx = this.getContext();
    let data = rawData;

    if (!data && window.electronAPI) {
      const readData = await window.electronAPI.readAudioFile(filePath);
      if (readData) {
        data = readData;
      }
    }

    if (!data) {
      throw new Error(`Could not load audio data for file: ${filePath}`);
    }

    // Decode audio data (copy buffer to avoid detached buffer issues)
    const audioBuffer = await ctx.decodeAudioData(data.slice(0));
    this.audioBufferCache.set(filePath, audioBuffer);

    // Compute peaks for waveform preview
    const peaks = this.generatePeaks(audioBuffer, 150);

    return { buffer: audioBuffer, peaks };
  }

  public getCachedBuffer(filePath: string): AudioBuffer | undefined {
    return this.audioBufferCache.get(filePath);
  }

  /**
   * Generates peak amplitude points (0..1) for waveform rendering
   */
  public generatePeaks(buffer: AudioBuffer, pointsPerSec = 100): number[] {
    const totalPoints = Math.max(50, Math.min(2000, Math.floor(buffer.duration * pointsPerSec)));
    const channelData = buffer.getChannelData(0);
    const step = Math.floor(channelData.length / totalPoints);
    const peaks: number[] = new Array(totalPoints);

    for (let i = 0; i < totalPoints; i++) {
      const start = i * step;
      const end = Math.min(start + step, channelData.length);
      let max = 0;
      for (let j = start; j < end; j++) {
        const abs = Math.abs(channelData[j]);
        if (abs > max) max = abs;
      }
      peaks[i] = Math.min(1, max);
    }
    return peaks;
  }

  /**
   * Synchronizes track audio nodes with track list
   */
  public syncTracks(tracks: Track[]) {
    const ctx = this.getContext();
    if (!this.masterGain) return;

    // Check solo state
    const hasSolo = tracks.some((t) => t.solo);

    // Remove obsolete track nodes
    const activeIds = new Set(tracks.map((t) => t.id));
    for (const [id, nodes] of this.trackNodes.entries()) {
      if (!activeIds.has(id)) {
        nodes.pannerNode.disconnect();
        nodes.gainNode.disconnect();
        this.trackNodes.delete(id);
      }
    }

    // Update or create nodes
    for (const track of tracks) {
      let nodes = this.trackNodes.get(track.id);
      if (!nodes) {
        const gainNode = ctx.createGain();
        const pannerNode = ctx.createPanner();

        pannerNode.panningModel = 'HRTF';
        pannerNode.distanceModel = 'inverse';
        pannerNode.refDistance = 1.0;
        pannerNode.maxDistance = 10000;
        pannerNode.rolloffFactor = 1.0;

        gainNode.connect(pannerNode);
        pannerNode.connect(this.masterGain);

        nodes = { gainNode, pannerNode };
        this.trackNodes.set(track.id, nodes);
      }

      // Calculate audible volume
      let isAudible = true;
      if (hasSolo) {
        isAudible = track.solo && !track.muted;
      } else {
        isAudible = !track.muted;
      }

      const targetGain = isAudible ? track.volume : 0.0;
      nodes.gainNode.gain.setValueAtTime(targetGain, ctx.currentTime);
    }
  }

  /**
   * Updates PannerNode positions for all tracks at the given frame
   */
  public updatePositions(tracks: Track[], frame: number) {
    const ctx = this.getContext();
    for (const track of tracks) {
      const nodes = this.trackNodes.get(track.id);
      if (!nodes) continue;

      const pos: Position3D = getInterpolatedPosition(track.keyframes, frame);
      const panner = nodes.pannerNode;

      if (panner.positionX) {
        panner.positionX.setValueAtTime(pos.x, ctx.currentTime);
        panner.positionY.setValueAtTime(pos.y, ctx.currentTime);
        panner.positionZ.setValueAtTime(pos.z, ctx.currentTime);
      } else {
        panner.setPosition(pos.x, pos.y, pos.z);
      }
    }
  }

  /**
   * Starts playback from given startFrame
   */
  public play(tracks: Track[], startFrame: number, fps: number) {
    const ctx = this.getContext();
    this.stopSources();

    this.currentFps = fps;
    this.playbackStartTimelineSec = startFrame / fps;
    this.playbackStartAudioTime = ctx.currentTime;
    this.isPlaying = true;

    // Check if frame is cached in RAM preview
    if (ramPreviewManager.isFrameCached(startFrame)) {
      const playedRam = ramPreviewManager.playFromRam(ctx, startFrame, fps);
      if (playedRam) {
        // High quality RAM playback active
        return;
      }
    }

    // Fallback to real-time Web Audio PannerNodes
    // Sync track gains
    this.syncTracks(tracks);
    this.updatePositions(tracks, startFrame);

    // Schedule active clips
    for (const track of tracks) {
      const nodes = this.trackNodes.get(track.id);
      if (!nodes) continue;

      for (const clip of track.clips) {
        const buffer = this.audioBufferCache.get(clip.filePath);
        if (!buffer) continue;

        const clipStartTimelineSec = clip.startFrame / fps;
        const clipEndTimelineSec = (clip.startFrame + clip.durationFrames) / fps;

        if (this.playbackStartTimelineSec < clipEndTimelineSec) {
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(nodes.gainNode);

          if (this.playbackStartTimelineSec <= clipStartTimelineSec) {
            // Clip starts in the future
            const delay = clipStartTimelineSec - this.playbackStartTimelineSec;
            const scheduledAudioTime = this.playbackStartAudioTime + delay;
            source.start(scheduledAudioTime, clip.trimStartSec, clip.durationSec);
          } else {
            // Playback started mid-clip
            const clipElapsed = this.playbackStartTimelineSec - clipStartTimelineSec;
            const offset = clip.trimStartSec + clipElapsed;
            const remaining = Math.max(0, clip.durationSec - clipElapsed);
            source.start(this.playbackStartAudioTime, offset, remaining);
          }

          this.activeSources.push({ clipId: clip.id, sourceNode: source });
        }
      }
    }
  }

  /**
   * Stop active audio source nodes
   */
  public stop() {
    this.isPlaying = false;
    ramPreviewManager.stopPlayback();
    this.stopSources();
  }

  private stopSources() {
    ramPreviewManager.stopPlayback();
    for (const item of this.activeSources) {
      try {
        item.sourceNode.stop();
        item.sourceNode.disconnect();
      } catch {
        // Ignore already stopped nodes
      }
    }
    this.activeSources = [];
  }

  /**
   * Calculates current playback frame
   */
  public getCurrentFrame(fps: number): number {
    if (!this.isPlaying || !this.ctx) return 0;
    const elapsedSec = this.ctx.currentTime - this.playbackStartAudioTime;
    const currentTimelineSec = this.playbackStartTimelineSec + elapsedSec;
    return Math.floor(currentTimelineSec * fps);
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getFps(): number {
    return this.currentFps;
  }
}

// Global singleton instance
export const audioEngine = new AudioEngine();
