import { useSyncExternalStore } from 'react';
import { ProjectData, Track, AudioClip, Keyframe, Position3D, InterpolationType, SpatialSettings } from '../types/project';
import { audioEngine } from '../audio/AudioEngine';
import { ramPreviewManager, RamCacheStatus } from '../audio/preview/RamPreviewManager';
import { HrirDataset } from '../audio/spatial/HrirDataset';
import { HrirProfile } from '../audio/spatial/HrirTypes';

const DEFAULT_TRACK_COLORS = [
  '#38bdf8', // sky
  '#ec4899', // pink
  '#10b981', // emerald
  '#f59e0b', // amber
  '#a855f7', // purple
  '#06b6d4', // cyan
  '#f43f5e', // rose
];

export interface ProjectState {
  project: ProjectData;
  currentFrame: number;
  isPlaying: boolean;
  selectedTrackId: string | null;
  selectedKeyframeId: string | null;
  selectedClipId: string | null;
  ramCacheStatus: RamCacheStatus;
  activeHrirProfile: HrirProfile;
}

function createInitialState(): ProjectState {
  const initialTrackId = 'track-1';
  return {
    project: {
      version: '1.0.0',
      name: 'Untitled Project',
      fps: 30,
      totalFrames: 900, // 30 seconds at 30fps
      loop: {
        enabled: false,
        startFrame: 0,
        endFrame: 900,
      },
      spatialSettings: {
        engine: 'sofa',
        selectedHrirId: 'neumann-ku100-builtin',
        autoRamPreview: false,
      },
      tracks: [
        {
          id: initialTrackId,
          name: 'Track 1',
          color: DEFAULT_TRACK_COLORS[0],
          volume: 1.0,
          muted: false,
          solo: false,
          clips: [],
          keyframes: [
            {
              id: 'kf-init-1',
              frame: 0,
              x: 0,
              y: 0,
              z: -2,
              interpolation: 'bezier',
            },
          ],
        },
      ],
    },
    currentFrame: 0,
    isPlaying: false,
    selectedTrackId: initialTrackId,
    selectedKeyframeId: 'kf-init-1',
    selectedClipId: null,
    ramCacheStatus: ramPreviewManager.getStatus(),
    activeHrirProfile: ramPreviewManager.getHrirDataset().profile,
  };
}

let state: ProjectState = createInitialState();
const listeners = new Set<() => void>();

// Subscribe to RAM preview manager status updates
ramPreviewManager.subscribe((status) => {
  state = { ...state, ramCacheStatus: status };
  emitChange();
});

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

let animFrameId: number | null = null;

function runPlaybackLoop() {
  if (!state.isPlaying) return;

  const newFrame = audioEngine.getCurrentFrame(state.project.fps);
  const loop = state.project.loop;

  if (loop.enabled && newFrame >= loop.endFrame) {
    // Loop around
    projectStore.seekToFrame(loop.startFrame);
    audioEngine.play(state.project.tracks, loop.startFrame, state.project.fps);
  } else if (newFrame >= state.project.totalFrames) {
    // Reach end
    projectStore.stop();
    projectStore.seekToFrame(0);
    return;
  } else {
    if (newFrame !== state.currentFrame) {
      state = { ...state, currentFrame: newFrame };
      audioEngine.updatePositions(state.project.tracks, newFrame);
      emitChange();
    }
  }

  animFrameId = requestAnimationFrame(runPlaybackLoop);
}

export const projectStore = {
  getState: () => state,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  // Playback controls
  play: () => {
    if (state.isPlaying) return;
    const fps = state.project.fps;
    audioEngine.play(state.project.tracks, state.currentFrame, fps);
    state = { ...state, isPlaying: true };
    emitChange();
    animFrameId = requestAnimationFrame(runPlaybackLoop);
  },

  pause: () => {
    if (!state.isPlaying) return;
    audioEngine.stop();
    if (animFrameId) cancelAnimationFrame(animFrameId);
    animFrameId = null;
    state = { ...state, isPlaying: false };
    emitChange();
  },

  stop: () => {
    audioEngine.stop();
    if (animFrameId) cancelAnimationFrame(animFrameId);
    animFrameId = null;
    const startFrame = state.project.loop.enabled ? state.project.loop.startFrame : 0;
    state = { ...state, isPlaying: false, currentFrame: startFrame };
    audioEngine.updatePositions(state.project.tracks, startFrame);
    emitChange();
  },

  togglePlay: () => {
    if (state.isPlaying) {
      projectStore.pause();
    } else {
      projectStore.play();
    }
  },

  seekToFrame: (frame: number) => {
    const clamped = Math.max(0, Math.min(state.project.totalFrames, Math.round(frame)));
    const wasPlaying = state.isPlaying;

    if (wasPlaying) {
      audioEngine.stop();
    }

    state = { ...state, currentFrame: clamped };
    audioEngine.updatePositions(state.project.tracks, clamped);
    emitChange();

    if (wasPlaying) {
      audioEngine.play(state.project.tracks, clamped, state.project.fps);
    }
  },

  setFps: (fps: 30 | 60) => {
    if (fps === state.project.fps) return;
    const ratio = fps / state.project.fps;

    const updatedTracks = state.project.tracks.map((t) => ({
      ...t,
      keyframes: t.keyframes.map((k) => ({ ...k, frame: Math.round(k.frame * ratio) })),
      clips: t.clips.map((c) => ({
        ...c,
        startFrame: Math.round(c.startFrame * ratio),
        durationFrames: Math.round(c.durationFrames * ratio),
      })),
    }));

    state = {
      ...state,
      currentFrame: Math.round(state.currentFrame * ratio),
      project: {
        ...state.project,
        fps,
        totalFrames: Math.round(state.project.totalFrames * ratio),
        loop: {
          ...state.project.loop,
          startFrame: Math.round(state.project.loop.startFrame * ratio),
          endFrame: Math.round(state.project.loop.endFrame * ratio),
        },
        tracks: updatedTracks,
      },
    };
    emitChange();
  },

  setTotalFrames: (totalFrames: number) => {
    state = {
      ...state,
      project: {
        ...state.project,
        totalFrames: Math.max(30, Math.round(totalFrames)),
      },
    };
    emitChange();
  },

  setLoop: (loop: Partial<ProjectData['loop']>) => {
    state = {
      ...state,
      project: {
        ...state.project,
        loop: {
          ...state.project.loop,
          ...loop,
        },
      },
    };
    emitChange();
  },

  // Selection
  selectTrack: (trackId: string | null) => {
    state = { ...state, selectedTrackId: trackId, selectedClipId: null };
    emitChange();
  },

  selectKeyframe: (keyframeId: string | null) => {
    state = { ...state, selectedKeyframeId: keyframeId };
    emitChange();
  },

  selectClip: (clipId: string | null) => {
    state = { ...state, selectedClipId: clipId };
    emitChange();
  },

  // Track management
  addTrack: (name?: string, color?: string) => {
    const trackCount = state.project.tracks.length;
    const newId = `track-${Date.now()}`;
    const newColor = color || DEFAULT_TRACK_COLORS[trackCount % DEFAULT_TRACK_COLORS.length];
    const newTrack: Track = {
      id: newId,
      name: name || `Track ${trackCount + 1}`,
      color: newColor,
      volume: 1.0,
      muted: false,
      solo: false,
      clips: [],
      keyframes: [
        {
          id: `kf-${Date.now()}`,
          frame: 0,
          x: (Math.random() - 0.5) * 4,
          y: 0,
          z: -(1 + Math.random() * 2),
          interpolation: 'bezier',
        },
      ],
    };

    state = {
      ...state,
      selectedTrackId: newId,
      project: {
        ...state.project,
        tracks: [...state.project.tracks, newTrack],
      },
    };
    audioEngine.syncTracks(state.project.tracks);
    ramPreviewManager.invalidate();
    emitChange();
  },

  deleteTrack: (trackId: string) => {
    if (state.project.tracks.length <= 1) {
      alert('最低1つのトラックが必要です。');
      return;
    }
    const newTracks = state.project.tracks.filter((t) => t.id !== trackId);
    state = {
      ...state,
      selectedTrackId: state.selectedTrackId === trackId ? newTracks[0]?.id || null : state.selectedTrackId,
      project: {
        ...state.project,
        tracks: newTracks,
      },
    };
    audioEngine.syncTracks(newTracks);
    ramPreviewManager.invalidate();
    emitChange();
  },

  updateTrack: (trackId: string, partial: Partial<Track>) => {
    const updatedTracks = state.project.tracks.map((t) => (t.id === trackId ? { ...t, ...partial } : t));
    state = {
      ...state,
      project: {
        ...state.project,
        tracks: updatedTracks,
      },
    };
    audioEngine.syncTracks(updatedTracks);
    ramPreviewManager.invalidate();
    emitChange();
  },

  moveTrack: (trackId: string, direction: 'up' | 'down') => {
    const tracks = [...state.project.tracks];
    const currentIndex = tracks.findIndex((t) => t.id === trackId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= tracks.length) return;

    const [removed] = tracks.splice(currentIndex, 1);
    tracks.splice(targetIndex, 0, removed);

    state = {
      ...state,
      project: {
        ...state.project,
        tracks,
      },
    };
    audioEngine.syncTracks(tracks);
    emitChange();
  },

  reorderTracks: (startIndex: number, endIndex: number) => {
    if (startIndex === endIndex) return;
    const tracks = [...state.project.tracks];
    if (startIndex < 0 || startIndex >= tracks.length || endIndex < 0 || endIndex >= tracks.length) return;

    const [removed] = tracks.splice(startIndex, 1);
    tracks.splice(endIndex, 0, removed);

    state = {
      ...state,
      project: {
        ...state.project,
        tracks,
      },
    };
    audioEngine.syncTracks(tracks);
    emitChange();
  },

  // Clip management
  addClip: (trackId: string, clipData: Omit<AudioClip, 'id'>) => {
    const newClip: AudioClip = {
      ...clipData,
      id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    };

    const updatedTracks = state.project.tracks.map((t) => {
      if (t.id !== trackId) return t;
      return { ...t, clips: [...t.clips, newClip] };
    });

    state = {
      ...state,
      selectedClipId: newClip.id,
      project: {
        ...state.project,
        tracks: updatedTracks,
      },
    };
    ramPreviewManager.invalidate();
    emitChange();
  },

  updateClip: (trackId: string, clipId: string, partial: Partial<AudioClip>) => {
    const updatedTracks = state.project.tracks.map((t) => {
      if (t.id !== trackId) return t;
      return {
        ...t,
        clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...partial } : c)),
      };
    });

    state = {
      ...state,
      project: {
        ...state.project,
        tracks: updatedTracks,
      },
    };
    ramPreviewManager.invalidate();
    emitChange();
  },

  deleteClip: (trackId: string, clipId: string) => {
    const updatedTracks = state.project.tracks.map((t) => {
      if (t.id !== trackId) return t;
      return {
        ...t,
        clips: t.clips.filter((c) => c.id !== clipId),
      };
    });

    state = {
      ...state,
      selectedClipId: state.selectedClipId === clipId ? null : state.selectedClipId,
      project: {
        ...state.project,
        tracks: updatedTracks,
      },
    };
    ramPreviewManager.invalidate();
    emitChange();
  },

  // Keyframe management
  addOrUpdateKeyframe: (trackId: string, frame: number, pos: Position3D, interpolation: InterpolationType = 'bezier') => {
    const track = state.project.tracks.find((t) => t.id === trackId);
    if (!track) return;

    const existingKfIndex = track.keyframes.findIndex((k) => k.frame === frame);
    let updatedKeyframes: Keyframe[];
    let targetKfId: string;

    if (existingKfIndex >= 0) {
      targetKfId = track.keyframes[existingKfIndex].id;
      updatedKeyframes = track.keyframes.map((k, i) =>
        i === existingKfIndex ? { ...k, x: pos.x, y: pos.y, z: pos.z, interpolation } : k
      );
    } else {
      targetKfId = `kf-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newKf: Keyframe = {
        id: targetKfId,
        frame,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        interpolation,
      };
      updatedKeyframes = [...track.keyframes, newKf].sort((a, b) => a.frame - b.frame);
    }

    const updatedTracks = state.project.tracks.map((t) =>
      t.id === trackId ? { ...t, keyframes: updatedKeyframes } : t
    );

    state = {
      ...state,
      selectedKeyframeId: targetKfId,
      project: {
        ...state.project,
        tracks: updatedTracks,
      },
    };
    audioEngine.updatePositions(updatedTracks, state.currentFrame);
    ramPreviewManager.invalidate();
    emitChange();
  },

  updateKeyframe: (trackId: string, keyframeId: string, partial: Partial<Keyframe>) => {
    const updatedTracks = state.project.tracks.map((t) => {
      if (t.id !== trackId) return t;
      const keyframes = t.keyframes
        .map((k) => (k.id === keyframeId ? { ...k, ...partial } : k))
        .sort((a, b) => a.frame - b.frame);
      return { ...t, keyframes };
    });

    state = {
      ...state,
      project: {
        ...state.project,
        tracks: updatedTracks,
      },
    };
    audioEngine.updatePositions(updatedTracks, state.currentFrame);
    ramPreviewManager.invalidate();
    emitChange();
  },

  deleteKeyframe: (trackId: string, keyframeId: string) => {
    const updatedTracks = state.project.tracks.map((t) => {
      if (t.id !== trackId) return t;
      return {
        ...t,
        keyframes: t.keyframes.filter((k) => k.id !== keyframeId),
      };
    });

    state = {
      ...state,
      selectedKeyframeId: state.selectedKeyframeId === keyframeId ? null : state.selectedKeyframeId,
      project: {
        ...state.project,
        tracks: updatedTracks,
      },
    };
    audioEngine.updatePositions(updatedTracks, state.currentFrame);
    ramPreviewManager.invalidate();
    emitChange();
  },

  // Load project
  loadProject: async (data: ProjectData) => {
    projectStore.stop();
    ramPreviewManager.invalidate();
    state = {
      ...state,
      project: data,
      currentFrame: 0,
      selectedTrackId: data.tracks[0]?.id || null,
      selectedKeyframeId: data.tracks[0]?.keyframes[0]?.id || null,
      selectedClipId: null,
    };

    // Pre-cache audio clips
    for (const track of data.tracks) {
      for (const clip of track.clips) {
        try {
          await audioEngine.loadAudio(clip.filePath);
        } catch (e) {
          console.warn(`Could not preload audio: ${clip.filePath}`, e);
        }
      }
    }

    audioEngine.syncTracks(data.tracks);
    audioEngine.updatePositions(data.tracks, 0);
    emitChange();
  },

    resetProject: () => {
    projectStore.stop();
    ramPreviewManager.invalidate();
    state = createInitialState();
    audioEngine.syncTracks(state.project.tracks);
    audioEngine.updatePositions(state.project.tracks, 0);
    emitChange();
  },

  // RAM Preview actions
  renderRamPreview: async (startFrame?: number, endFrame?: number) => {
    await ramPreviewManager.renderAll(
      state.project.tracks,
      state.project.fps,
      state.project.totalFrames,
      startFrame,
      endFrame
    );
  },

  cancelRamPreview: () => {
    ramPreviewManager.stopRendering();
  },

  setHrirDataset: (dataset: HrirDataset) => {
    ramPreviewManager.setHrirDataset(dataset);
    state = {
      ...state,
      activeHrirProfile: dataset.profile,
      project: {
        ...state.project,
        spatialSettings: {
          ...(state.project.spatialSettings || { engine: 'sofa', selectedHrirId: dataset.profile.id, autoRamPreview: false }),
          selectedHrirId: dataset.profile.id,
        },
      },
    };
    emitChange();
  },

  setSpatialSettings: (settings: Partial<SpatialSettings>) => {
    const current = state.project.spatialSettings || {
      engine: 'sofa',
      selectedHrirId: 'neumann-ku100-builtin',
      autoRamPreview: false,
    };
    state = {
      ...state,
      project: {
        ...state.project,
        spatialSettings: {
          ...current,
          ...settings,
        },
      },
    };
    emitChange();
  },
};

export function useProjectStore(): ProjectState {
  return useSyncExternalStore(projectStore.subscribe, projectStore.getState);
}
