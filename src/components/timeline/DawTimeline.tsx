import React, { useRef, useState, useEffect } from 'react';
import { useProjectStore, projectStore } from '../../store/useProjectStore';
import { audioEngine } from '../../audio/AudioEngine';
import { AudioClip, Track } from '../../types/project';
import { WaveformCanvas } from './WaveformCanvas';
import { generateTestAudioWav } from '../../utils/audioSampleGenerator';
import {
  Plus,
  Trash2,
  Volume2,
  Upload,
  Music,
  Layers,
  Sparkles,
  Cpu,
  Loader2,
  ChevronUp,
  ChevronDown,
  GripVertical,
} from 'lucide-react';

export const DawTimeline: React.FC = () => {
  const { project, currentFrame, selectedTrackId, selectedClipId, ramCacheStatus } = useProjectStore();
  const rulerRef = useRef<HTMLDivElement>(null);
  const lanesScrollRef = useRef<HTMLDivElement>(null);

  // Drag and drop state for track reordering
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Pixels per frame (horizontal zoom)
  const [pxPerFrame, setPxPerFrame] = useState(3.5);

  // Synchronize ruler and tracks horizontal scroll
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (rulerRef.current) {
      rulerRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  // Seeking via ruler click / drag
  const [isScrubbing, setIsScrubbing] = useState(false);

  const handleRulerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsScrubbing(true);
    seekFromMouseEvent(e);
  };

  const seekFromMouseEvent = (e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
    if (!rulerRef.current) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const scrollLeft = rulerRef.current.scrollLeft;
    const offsetX = e.clientX - rect.left + scrollLeft;
    const targetFrame = Math.max(0, Math.min(project.totalFrames, Math.round(offsetX / pxPerFrame)));
    projectStore.seekToFrame(targetFrame);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isScrubbing) {
        seekFromMouseEvent(e);
      }
    };
    const handleMouseUp = () => {
      if (isScrubbing) {
        setIsScrubbing(false);
      }
    };

    if (isScrubbing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isScrubbing, pxPerFrame, project.totalFrames]);

  // Handle importing audio file to a track
  const handleImportAudio = async (trackId: string) => {
    if (window.electronAPI) {
      const result = await window.electronAPI.openAudioFile();
      if (!result) return;

      try {
        const { buffer, peaks } = await audioEngine.loadAudio(result.filePath, result.buffer);
        const durationSec = buffer.duration;
        const durationFrames = Math.max(1, Math.round(durationSec * project.fps));

        // Add clip at currentFrame
        projectStore.addClip(trackId, {
          trackId,
          name: result.name,
          filePath: result.filePath,
          startFrame: currentFrame,
          durationFrames,
          trimStartSec: 0,
          durationSec,
          fileDurationSec: durationSec,
          peaks,
        });
      } catch (err) {
        alert('音声ファイルの読み込みに失敗しました: ' + err);
      }
    } else {
      // Browser fallback file input
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'audio/*';
      input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const arrayBuffer = await file.arrayBuffer();
        const fakePath = file.name;
        const { buffer, peaks } = await audioEngine.loadAudio(fakePath, arrayBuffer);
        const durationSec = buffer.duration;
        const durationFrames = Math.max(1, Math.round(durationSec * project.fps));

        projectStore.addClip(trackId, {
          trackId,
          name: file.name,
          filePath: fakePath,
          startFrame: currentFrame,
          durationFrames,
          trimStartSec: 0,
          durationSec,
          fileDurationSec: durationSec,
          peaks,
        });
      };
      input.click();
    }
  };

  // Generate built-in test sound for instant evaluation
  const handleCreateTestSound = async (targetTrackId?: string) => {
    const trackId = targetTrackId || selectedTrackId || project.tracks[0]?.id;
    if (!trackId) return;

    try {
      const { name, buffer, audioBuffer } = generateTestAudioWav(4.0, 48000);
      const fakePath = `virtual://${name}-${Date.now()}`;
      const { peaks } = await audioEngine.loadAudio(fakePath, buffer);
      const durationSec = audioBuffer.duration;
      const durationFrames = Math.max(1, Math.round(durationSec * project.fps));

      projectStore.addClip(trackId, {
        trackId,
        name,
        filePath: fakePath,
        startFrame: currentFrame,
        durationFrames,
        trimStartSec: 0,
        durationSec,
        fileDurationSec: durationSec,
        peaks,
      });
    } catch (err) {
      alert('テスト音声の生成に失敗しました: ' + err);
    }
  };

  const totalWidth = project.totalFrames * pxPerFrame;

  return (
    <div className="w-full h-full flex flex-col bg-dark-900 border border-dark-700 rounded-lg overflow-hidden select-none">
      {/* DAW Header Controls */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-dark-800 border-b border-dark-700 text-xs">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-studio-accent" />
          <span className="font-semibold text-slate-200">Timeline</span>
          <span className="text-[11px] text-slate-400 font-mono">({project.tracks.length} Tracks)</span>
        </div>

        <div className="flex items-center space-x-2">
          {/* Zoom In / Out */}
          <div className="flex items-center space-x-1 text-slate-400 text-[11px] mr-1">
            <span>Zoom:</span>
            <input
              type="range"
              min="1.5"
              max="10"
              step="0.5"
              value={pxPerFrame}
              onChange={(e) => setPxPerFrame(parseFloat(e.target.value))}
              className="w-14 h-1 bg-dark-700 rounded appearance-none cursor-pointer accent-studio-accent"
            />
          </div>

          {/* RAM Preview Cache Button */}
          <button
            onClick={() => {
              if (ramCacheStatus.isRendering) {
                projectStore.cancelRamPreview();
              } else {
                projectStore.renderRamPreview();
              }
            }}
            className={`flex items-center space-x-1.5 px-2 py-1 rounded text-xs font-medium transition-colors border ${
              ramCacheStatus.isRendering
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                : ramCacheStatus.percentage === 100
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                : 'bg-dark-750 text-slate-300 border-dark-650 hover:bg-dark-700'
            }`}
            title={`RAMプレビュー (${ramCacheStatus.percentage}% キャッシュ済 / ${ramCacheStatus.memoryMb}MB)`}
          >
            {ramCacheStatus.isRendering ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
            ) : (
              <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>RAM {ramCacheStatus.percentage}%</span>
          </button>

          {/* Add test sound */}
          <button
            onClick={() => handleCreateTestSound()}
            className="flex items-center space-x-1 px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-medium rounded text-xs transition-colors border border-amber-500/30"
            title="空間定位テスト用のアルペジオ音声を現在位置に生成"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>テスト音生成</span>
          </button>

          <button
            onClick={() => projectStore.addTrack()}
            className="flex items-center space-x-1 px-2 py-1 bg-studio-accent/20 hover:bg-studio-accent/30 text-studio-accent font-medium rounded text-xs transition-colors border border-studio-accent/30"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>トラック追加</span>
          </button>
        </div>
      </div>

      {/* Main Timeline Viewport (Split: Left Track Headers | Right Lanes) */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Track Headers Column */}
        <div className="w-56 flex-shrink-0 border-r border-dark-700 bg-dark-850 flex flex-col z-10 shadow-lg">
          {/* Header Title / Track Count */}
          <div className="h-7 border-b border-dark-700 px-3 flex items-center justify-between text-[11px] font-medium text-slate-400 bg-dark-800">
            <span>TRACK CONTROLS</span>
            <span>M / S / VOL</span>
          </div>

          {/* Track Headers List */}
          <div className="flex-1 overflow-y-auto divide-y divide-dark-750">
            {project.tracks.map((track, index) => {
              const isSelected = track.id === selectedTrackId;
              const isDragged = draggedIndex === index;
              const isOver = dragOverIndex === index;

              return (
                <div
                  key={track.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', String(index));
                    setDraggedIndex(index);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverIndex !== index) {
                      setDragOverIndex(index);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverIndex === index) {
                      setDragOverIndex(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedIndex !== null && draggedIndex !== index) {
                      projectStore.reorderTracks(draggedIndex, index);
                    }
                    setDraggedIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDraggedIndex(null);
                    setDragOverIndex(null);
                  }}
                  onClick={() => projectStore.selectTrack(track.id)}
                  className={`h-20 px-2 py-1.5 flex flex-col justify-between transition-colors cursor-pointer relative ${
                    isDragged ? 'opacity-40' : ''
                  } ${
                    isOver ? 'ring-2 ring-studio-accent bg-studio-accent/15' : ''
                  } ${
                    isSelected ? 'bg-dark-750 border-l-4' : 'bg-dark-850 hover:bg-dark-800 border-l-2'
                  }`}
                  style={{ borderLeftColor: track.color }}
                >
                  {/* Top row: Drag Handle & Reorder buttons & Name & Color & Delete */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1 overflow-hidden">
                      {/* Drag Handle */}
                      <span
                        className="cursor-grab text-slate-500 hover:text-slate-300 p-0.5"
                        title="ドラッグしてトラックを並び替え"
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </span>

                      {/* Up/Down buttons */}
                      <div className="flex flex-col -space-y-1">
                        <button
                          type="button"
                          title="トラックを上に移動"
                          disabled={index === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            projectStore.moveTrack(track.id, 'up');
                          }}
                          className="text-slate-400 hover:text-slate-100 disabled:opacity-20 disabled:hover:text-slate-400 transition-colors"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          title="トラックを下に移動"
                          disabled={index === project.tracks.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            projectStore.moveTrack(track.id, 'down');
                          }}
                          className="text-slate-400 hover:text-slate-100 disabled:opacity-20 disabled:hover:text-slate-400 transition-colors"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>

                      <input
                        type="text"
                        value={track.name}
                        draggable={false}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => projectStore.updateTrack(track.id, { name: e.target.value })}
                        className="bg-transparent text-xs font-semibold text-slate-200 hover:bg-dark-700 focus:bg-dark-900 px-1 py-0.5 rounded outline-none border-b border-transparent focus:border-studio-accent w-20 truncate"
                      />
                    </div>

                    <div className="flex items-center space-x-1">
                      {/* Audio Import button */}
                      <button
                        title="音声ファイルを読み込む (WAV / MP3)"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleImportAudio(track.id);
                        }}
                        className="p-1 hover:bg-dark-700 text-slate-300 hover:text-studio-accent rounded transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete track button */}
                      <button
                        title="トラックを削除"
                        onClick={(e) => {
                          e.stopPropagation();
                          projectStore.deleteTrack(track.id);
                        }}
                        className="p-1 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Bottom row: Mute / Solo buttons & Volume slider */}
                  <div className="flex items-center space-x-2 mt-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        projectStore.updateTrack(track.id, { muted: !track.muted });
                      }}
                      className={`w-5 h-5 rounded text-[10px] font-bold transition-colors ${
                        track.muted ? 'bg-red-500 text-white' : 'bg-dark-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      M
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        projectStore.updateTrack(track.id, { solo: !track.solo });
                      }}
                      className={`w-5 h-5 rounded text-[10px] font-bold transition-colors ${
                        track.solo ? 'bg-amber-500 text-dark-900' : 'bg-dark-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      S
                    </button>

                    {/* Volume Slider */}
                    <div className="flex-1 flex items-center space-x-1">
                      <Volume2 className="w-3 h-3 text-slate-500" />
                      <input
                        type="range"
                        min="0"
                        max="1.5"
                        step="0.01"
                        value={track.volume}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          projectStore.updateTrack(track.id, { volume: parseFloat(e.target.value) })
                        }
                        className="w-full h-1 bg-dark-700 rounded appearance-none cursor-pointer accent-studio-accent"
                      />
                      <span className="text-[10px] font-mono text-slate-400 w-7 text-right">
                        {Math.round(track.volume * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Ruler + Track Clip Lanes */}
        <div className="flex-1 flex flex-col overflow-hidden bg-dark-900">
          {/* Timeline Ruler */}
          <div
            ref={rulerRef}
            onMouseDown={handleRulerMouseDown}
            className="h-8 border-b border-dark-700 bg-dark-800 overflow-x-hidden relative cursor-pointer select-none"
          >
            <div className="h-full relative" style={{ width: `${totalWidth}px` }}>
              {/* RAM Render Bar (Premiere / After Effects style) */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-dark-950 pointer-events-none z-10 overflow-hidden">
                {ramCacheStatus.renderedChunks.map((chunk, idx) => (
                  <div
                    key={idx}
                    className="absolute top-0 bottom-0 bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]"
                    style={{
                      left: `${chunk.startFrame * pxPerFrame}px`,
                      width: `${(chunk.endFrame - chunk.startFrame) * pxPerFrame}px`,
                    }}
                  />
                ))}
                {ramCacheStatus.isRendering && (
                  <div className="absolute inset-0 bg-amber-400/40 animate-pulse" />
                )}
              </div>

              {/* Frame & Second Tick Marks */}
              {Array.from({ length: Math.ceil(project.totalFrames / 15) }).map((_, i) => {
                const frameNum = i * 15;
                const sec = (frameNum / project.fps).toFixed(1);
                const isSecond = frameNum % project.fps === 0;
                return (
                  <div
                    key={frameNum}
                    className="absolute top-0 bottom-0 border-l border-dark-600 flex flex-col justify-end pb-0.5 pl-1 text-[9px] font-mono text-slate-400 pointer-events-none"
                    style={{ left: `${frameNum * pxPerFrame}px` }}
                  >
                    {isSecond ? `${sec}s (F:${frameNum})` : ''}
                  </div>
                );
              })}

              {/* Loop Region Highlight */}
              {project.loop.enabled && (
                <div
                  className="absolute top-0 bottom-0 bg-studio-accent/20 border-x-2 border-studio-accent pointer-events-none"
                  style={{
                    left: `${project.loop.startFrame * pxPerFrame}px`,
                    width: `${(project.loop.endFrame - project.loop.startFrame) * pxPerFrame}px`,
                  }}
                />
              )}

              {/* Ruler Playhead marker */}
              <div
                className="absolute top-0 bottom-0 w-3 -ml-1.5 pointer-events-none z-30 flex flex-col items-center"
                style={{ left: `${currentFrame * pxPerFrame}px` }}
              >
                <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-red-500" />
              </div>
            </div>
          </div>

          {/* Track Lanes */}
          <div
            ref={lanesScrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-x-auto overflow-y-auto relative divide-y divide-dark-750 bg-studio-timeline"
          >
            <div className="relative" style={{ width: `${totalWidth}px`, minHeight: '100%' }}>
              {/* Background Frame Grid lines */}
              {Array.from({ length: Math.ceil(project.totalFrames / 30) }).map((_, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 border-l border-dark-750/70 pointer-events-none"
                  style={{ left: `${i * 30 * pxPerFrame}px` }}
                />
              ))}

              {/* Global Playhead Vertical Line */}
              <div
                className="absolute top-0 bottom-0 w-[2px] bg-red-500 pointer-events-none z-20 shadow-[0_0_8px_rgba(239,68,68,0.8)]"
                style={{ left: `${currentFrame * pxPerFrame}px` }}
              />

              {/* Render lanes for each track */}
              {project.tracks.map((track) => (
                <TrackLane
                  key={track.id}
                  track={track}
                  pxPerFrame={pxPerFrame}
                  fps={project.fps}
                  isSelected={track.id === selectedTrackId}
                  selectedClipId={selectedClipId}
                  onGenerateTestSound={() => handleCreateTestSound(track.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Subcomponent: TrackLane with clips
interface TrackLaneProps {
  track: Track;
  pxPerFrame: number;
  fps: number;
  isSelected: boolean;
  selectedClipId: string | null;
  onGenerateTestSound: () => void;
}

const TrackLane: React.FC<TrackLaneProps> = ({
  track,
  pxPerFrame,
  fps,
  isSelected,
  selectedClipId,
  onGenerateTestSound,
}) => {
  return (
    <div
      onClick={() => projectStore.selectTrack(track.id)}
      className={`h-20 relative transition-colors ${
        isSelected ? 'bg-dark-800/60' : 'hover:bg-dark-800/30'
      }`}
    >
      {/* Empty Lane hint if no clips */}
      {track.clips.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center space-x-2 text-xs text-slate-500">
          <span>音声未配置:</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onGenerateTestSound();
            }}
            className="flex items-center space-x-1 px-2 py-0.5 rounded bg-dark-700 hover:bg-dark-650 text-slate-300 hover:text-amber-300 transition-colors border border-dark-600 text-[11px]"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>テスト音声を生成</span>
          </button>
        </div>
      )}

      {/* Render Audio Clips */}
      {track.clips.map((clip) => (
        <ClipItem
          key={clip.id}
          clip={clip}
          trackColor={track.color}
          pxPerFrame={pxPerFrame}
          fps={fps}
          isSelected={clip.id === selectedClipId}
        />
      ))}
    </div>
  );
};

// Subcomponent: Draggable & Trimmable Clip Item
interface ClipItemProps {
  clip: AudioClip;
  trackColor: string;
  pxPerFrame: number;
  fps: number;
  isSelected: boolean;
}

const ClipItem: React.FC<ClipItemProps> = ({
  clip,
  trackColor,
  pxPerFrame,
  fps,
  isSelected,
}) => {
  const leftPx = clip.startFrame * pxPerFrame;
  const widthPx = Math.max(16, clip.durationFrames * pxPerFrame);

  // Dragging states
  const [dragMode, setDragMode] = useState<'move' | 'trim-left' | 'trim-right' | null>(null);
  const dragStartXRef = useRef(0);
  const origStartFrameRef = useRef(0);
  const origDurationFramesRef = useRef(0);
  const origTrimStartSecRef = useRef(0);

  const startDrag = (e: React.MouseEvent, mode: 'move' | 'trim-left' | 'trim-right') => {
    e.stopPropagation();
    projectStore.selectClip(clip.id);
    projectStore.selectTrack(clip.trackId);
    setDragMode(mode);
    dragStartXRef.current = e.clientX;
    origStartFrameRef.current = clip.startFrame;
    origDurationFramesRef.current = clip.durationFrames;
    origTrimStartSecRef.current = clip.trimStartSec;
  };

  useEffect(() => {
    if (!dragMode) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartXRef.current;
      const deltaFrames = Math.round(deltaX / pxPerFrame);

      if (dragMode === 'move') {
        const newStartFrame = Math.max(0, origStartFrameRef.current + deltaFrames);
        projectStore.updateClip(clip.trackId, clip.id, { startFrame: newStartFrame });
      } else if (dragMode === 'trim-left') {
        const maxDelta = origDurationFramesRef.current - 5;
        const clampedDelta = Math.max(-Math.round(origTrimStartSecRef.current * fps), Math.min(maxDelta, deltaFrames));
        const deltaSec = clampedDelta / fps;

        projectStore.updateClip(clip.trackId, clip.id, {
          startFrame: origStartFrameRef.current + clampedDelta,
          durationFrames: origDurationFramesRef.current - clampedDelta,
          trimStartSec: origTrimStartSecRef.current + deltaSec,
          durationSec: (origDurationFramesRef.current - clampedDelta) / fps,
        });
      } else if (dragMode === 'trim-right') {
        const maxFramesAllowed = Math.round((clip.fileDurationSec - clip.trimStartSec) * fps);
        const newDuration = Math.max(5, Math.min(maxFramesAllowed, origDurationFramesRef.current + deltaFrames));

        projectStore.updateClip(clip.trackId, clip.id, {
          durationFrames: newDuration,
          durationSec: newDuration / fps,
        });
      }
    };

    const handleMouseUp = () => {
      setDragMode(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragMode, pxPerFrame, fps, clip]);

  return (
    <div
      onMouseDown={(e) => startDrag(e, 'move')}
      className={`absolute top-1 bottom-1 rounded-md overflow-hidden flex flex-col cursor-move shadow-md select-none group border ${
        isSelected ? 'border-white ring-2 ring-studio-accent' : 'border-slate-600/50'
      }`}
      style={{
        left: `${leftPx}px`,
        width: `${widthPx}px`,
        backgroundColor: `${trackColor}35`,
      }}
    >
      {/* Clip Header */}
      <div
        className="h-4 px-1.5 flex items-center justify-between text-[10px] font-medium text-white truncate"
        style={{ backgroundColor: `${trackColor}99` }}
      >
        <div className="flex items-center space-x-1 truncate">
          <Music className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{clip.name}</span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            projectStore.deleteClip(clip.trackId, clip.id);
          }}
          className="opacity-0 group-hover:opacity-100 hover:text-red-300 transition-opacity"
        >
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      </div>

      {/* Waveform body */}
      <div className="flex-1 relative overflow-hidden">
        <WaveformCanvas peaks={clip.peaks} color={trackColor} />
      </div>

      {/* Left Trim Handle */}
      <div
        onMouseDown={(e) => startDrag(e, 'trim-left')}
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 group-hover:bg-white/20 transition-colors z-10"
        title="左端をトリム"
      />

      {/* Right Trim Handle */}
      <div
        onMouseDown={(e) => startDrag(e, 'trim-right')}
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/40 group-hover:bg-white/20 transition-colors z-10"
        title="右端をトリム"
      />
    </div>
  );
};
