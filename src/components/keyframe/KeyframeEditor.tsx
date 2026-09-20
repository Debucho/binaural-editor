import React, { useRef, useState, useEffect } from 'react';
import { useProjectStore, projectStore } from '../../store/useProjectStore';
import { getInterpolatedPosition } from '../../utils/interpolation';
import { Keyframe, InterpolationType } from '../../types/project';
import {
  KeyRound,
  Trash2,
  Activity,
} from 'lucide-react';

export const KeyframeEditor: React.FC = () => {
  const { project, currentFrame, selectedTrackId, selectedKeyframeId } = useProjectStore();
  const rulerScrollRef = useRef<HTMLDivElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);

  const [pxPerFrame, setPxPerFrame] = useState(8); // spacing for clear diamond dragging

  const selectedTrack = project.tracks.find((t) => t.id === selectedTrackId);
  const keyframes = selectedTrack?.keyframes || [];
  const selectedKf = keyframes.find((k) => k.id === selectedKeyframeId);

  // Sync horizontal scrolling between header ruler and rows
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (rulerScrollRef.current) {
      rulerScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  // Seeking playhead via click on frame ruler
  const [isScrubbing, setIsScrubbing] = useState(false);

  const handleRulerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsScrubbing(true);
    seekFromEvent(e);
  };

  const seekFromEvent = (e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
    if (!rulerScrollRef.current) return;
    const rect = rulerScrollRef.current.getBoundingClientRect();
    const scrollLeft = rulerScrollRef.current.scrollLeft;
    const offsetX = e.clientX - rect.left + scrollLeft;
    const targetFrame = Math.max(0, Math.min(project.totalFrames, Math.round(offsetX / pxPerFrame)));
    projectStore.seekToFrame(targetFrame);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isScrubbing) seekFromEvent(e);
    };
    const handleMouseUp = () => {
      if (isScrubbing) setIsScrubbing(false);
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

  // Current interpolated position for the selected track
  const currentPos = selectedTrack
    ? getInterpolatedPosition(selectedTrack.keyframes, currentFrame)
    : { x: 0, y: 0, z: 2 };

  // Register keyframe at current playhead
  const handleRegisterKeyframe = () => {
    if (!selectedTrackId) return;
    projectStore.addOrUpdateKeyframe(selectedTrackId, currentFrame, currentPos, selectedKf?.interpolation || 'bezier');
  };

  // Delete selected keyframe
  const handleDeleteKeyframe = () => {
    if (!selectedTrackId || !selectedKeyframeId) return;
    projectStore.deleteKeyframe(selectedTrackId, selectedKeyframeId);
  };

  // Change interpolation mode of selected keyframe
  const handleChangeInterpolation = (type: InterpolationType) => {
    if (!selectedTrackId || !selectedKeyframeId) return;
    projectStore.updateKeyframe(selectedTrackId, selectedKeyframeId, { interpolation: type });
  };

  // Numeric coordinate change
  const handleCoordChange = (axis: 'x' | 'y' | 'z', value: number) => {
    if (!selectedTrackId) return;
    const newPos = { ...currentPos, [axis]: value };
    projectStore.addOrUpdateKeyframe(
      selectedTrackId,
      currentFrame,
      newPos,
      selectedKf?.interpolation || 'bezier'
    );
  };

  const totalWidth = project.totalFrames * pxPerFrame;

  return (
    <div className="w-full h-full flex flex-col bg-dark-900 border border-dark-700 rounded-lg overflow-hidden select-none">
      {/* Keyframe Editor Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-dark-800 border-b border-dark-700 text-xs">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 font-semibold text-slate-200">
            <Activity className="w-4 h-4 text-amber-400" />
            <span>Keyframe Editor</span>
          </div>

          {selectedTrack && (
            <span
              className="px-2 py-0.5 rounded text-[11px] font-mono font-medium"
              style={{ backgroundColor: `${selectedTrack.color}25`, color: selectedTrack.color }}
            >
              対象: {selectedTrack.name}
            </span>
          )}
        </div>

        {/* Action Buttons & Coordinate Direct Inputs */}
        <div className="flex items-center space-x-4">
          {/* Direct Coordinate Inputs */}
          <div className="flex items-center space-x-2 bg-dark-850 px-2.5 py-0.5 rounded border border-dark-700 text-xs font-mono">
            <span className="text-slate-400 text-[11px]">現在値:</span>
            <div className="flex items-center space-x-1">
              <span className="text-red-400 font-bold">X</span>
              <input
                type="number"
                step="0.1"
                value={currentPos.x.toFixed(2)}
                onChange={(e) => handleCoordChange('x', parseFloat(e.target.value) || 0)}
                className="w-14 bg-dark-900 px-1 py-0.5 rounded border border-dark-650 text-slate-100 text-center outline-none focus:border-studio-accent"
              />
            </div>
            <div className="flex items-center space-x-1">
              <span className="text-green-400 font-bold">Y</span>
              <input
                type="number"
                step="0.1"
                value={currentPos.y.toFixed(2)}
                onChange={(e) => handleCoordChange('y', parseFloat(e.target.value) || 0)}
                className="w-14 bg-dark-900 px-1 py-0.5 rounded border border-dark-650 text-slate-100 text-center outline-none focus:border-studio-accent"
              />
            </div>
            <div className="flex items-center space-x-1">
              <span className="text-blue-400 font-bold">Z</span>
              <input
                type="number"
                step="0.1"
                value={currentPos.z.toFixed(2)}
                onChange={(e) => handleCoordChange('z', parseFloat(e.target.value) || 0)}
                className="w-14 bg-dark-900 px-1 py-0.5 rounded border border-dark-650 text-slate-100 text-center outline-none focus:border-studio-accent"
              />
            </div>
          </div>

          {/* Zoom Control */}
          <div className="flex items-center space-x-1 text-slate-400 text-[11px]">
            <span>Zoom:</span>
            <input
              type="range"
              min="4"
              max="20"
              step="1"
              value={pxPerFrame}
              onChange={(e) => setPxPerFrame(parseFloat(e.target.value))}
              className="w-16 h-1 bg-dark-700 rounded appearance-none cursor-pointer accent-amber-400"
            />
          </div>

          {/* Keyframe registration button */}
          <button
            onClick={handleRegisterKeyframe}
            className="flex items-center space-x-1.5 px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/40 rounded text-xs font-semibold transition-colors"
            title="現在フレーム (F) にキーフレームを登録 [K]"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>キー登録 (◆)</span>
          </button>

          {/* Interpolation mode selector (if keyframe selected) */}
          {selectedKf && (
            <div className="flex items-center space-x-1 bg-dark-850 p-0.5 rounded border border-dark-700 text-xs">
              <span className="text-slate-400 text-[10px] px-1">補間:</span>
              <button
                onClick={() => handleChangeInterpolation('linear')}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  selectedKf.interpolation === 'linear'
                    ? 'bg-amber-400 text-dark-900 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Linear (直線)
              </button>
              <button
                onClick={() => handleChangeInterpolation('bezier')}
                className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                  selectedKf.interpolation === 'bezier'
                    ? 'bg-amber-400 text-dark-900 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Bezier (滑らか)
              </button>
            </div>
          )}

          {/* Delete keyframe button */}
          {selectedKf && (
            <button
              onClick={handleDeleteKeyframe}
              className="p-1 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded transition-colors"
              title="選択中のキーフレームを削除 [Delete]"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Frame Grid & Rows Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Property Labels Column (140px) */}
        <div className="w-36 flex-shrink-0 flex flex-col bg-dark-850 border-r border-dark-700 text-xs text-slate-300 divide-y divide-dark-750 font-mono">
          {/* Header Spacer */}
          <div className="h-6 flex items-center px-2.5 text-[10px] font-semibold text-slate-500 bg-dark-800">
            CHANNELS
          </div>
          <div className="h-9 flex items-center px-2.5 text-amber-300 font-semibold bg-dark-850/50">
            ◆ Master (XYZ)
          </div>
          <div className="h-7 flex items-center px-2.5 text-red-400">
            <span className="w-2 h-2 rounded-full bg-red-500 mr-2" /> X 座標
          </div>
          <div className="h-7 flex items-center px-2.5 text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-500 mr-2" /> Y 座標
          </div>
          <div className="h-7 flex items-center px-2.5 text-blue-400">
            <span className="w-2 h-2 rounded-full bg-blue-500 mr-2" /> Z 座標
          </div>
        </div>

        {/* Right Frame Timeline & Diamond Grid */}
        <div className="flex-1 flex flex-col overflow-hidden bg-dark-900">
          {/* Frame Number Header Ruler */}
          <div
            ref={rulerScrollRef}
            onMouseDown={handleRulerMouseDown}
            className="h-6 border-b border-dark-700 bg-dark-800 overflow-x-hidden relative cursor-pointer select-none"
          >
            <div className="h-full relative" style={{ width: `${totalWidth}px` }}>
              {/* Frame Numbers (0, 5, 10, 15, ...) */}
              {Array.from({ length: Math.ceil(project.totalFrames / 5) }).map((_, i) => {
                const frameNum = i * 5;
                const isMajor = frameNum % (project.fps === 60 ? 30 : 15) === 0;
                return (
                  <div
                    key={frameNum}
                    className={`absolute top-0 bottom-0 border-l ${
                      isMajor ? 'border-slate-500 text-slate-200 font-bold' : 'border-dark-650 text-slate-500'
                    } pl-1 text-[9px] font-mono pointer-events-none flex items-center`}
                    style={{ left: `${frameNum * pxPerFrame}px` }}
                  >
                    {frameNum}
                  </div>
                );
              })}

              {/* Playhead marker indicator on ruler */}
              <div
                className="absolute top-0 bottom-0 w-3 -ml-1.5 pointer-events-none z-30 flex flex-col items-center"
                style={{ left: `${currentFrame * pxPerFrame}px` }}
              >
                <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-amber-400" />
              </div>
            </div>
          </div>

          {/* Grid Rows Container */}
          <div
            ref={gridScrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-x-auto overflow-y-hidden relative bg-studio-timeline divide-y divide-dark-750"
          >
            <div className="relative h-full" style={{ width: `${totalWidth}px` }}>
              {/* Vertical Frame Grid Lines */}
              {Array.from({ length: Math.ceil(project.totalFrames / 5) }).map((_, i) => {
                const frameNum = i * 5;
                const isMajor = frameNum % (project.fps === 60 ? 30 : 15) === 0;
                return (
                  <div
                    key={frameNum}
                    className={`absolute top-0 bottom-0 border-l ${
                      isMajor ? 'border-dark-600/70' : 'border-dark-750/50'
                    } pointer-events-none`}
                    style={{ left: `${frameNum * pxPerFrame}px` }}
                  ></div>
                );
              })}

              {/* Global Playhead Vertical Line */}
              <div
                className="absolute top-0 bottom-0 w-[2px] bg-amber-400 pointer-events-none z-20 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
                style={{ left: `${currentFrame * pxPerFrame}px` }}
              />

              {/* Row 1: Master Diamonds */}
              <div className="h-9 relative bg-dark-850/30">
                {keyframes.map((kf) => (
                  <KeyframeDiamond
                    key={kf.id}
                    keyframe={kf}
                    pxPerFrame={pxPerFrame}
                    trackId={selectedTrackId!}
                    isSelected={kf.id === selectedKeyframeId}
                    colorClass="text-amber-400 hover:text-amber-300"
                  />
                ))}
              </div>

              {/* Row 2: X Coordinates */}
              <div className="h-7 relative">
                {keyframes.map((kf) => (
                  <KeyframeDiamond
                    key={`x-${kf.id}`}
                    keyframe={kf}
                    pxPerFrame={pxPerFrame}
                    trackId={selectedTrackId!}
                    isSelected={kf.id === selectedKeyframeId}
                    colorClass="text-red-400 hover:text-red-300"
                  />
                ))}
              </div>

              {/* Row 3: Y Coordinates */}
              <div className="h-7 relative">
                {keyframes.map((kf) => (
                  <KeyframeDiamond
                    key={`y-${kf.id}`}
                    keyframe={kf}
                    pxPerFrame={pxPerFrame}
                    trackId={selectedTrackId!}
                    isSelected={kf.id === selectedKeyframeId}
                    colorClass="text-green-400 hover:text-green-300"
                  />
                ))}
              </div>

              {/* Row 4: Z Coordinates */}
              <div className="h-7 relative">
                {keyframes.map((kf) => (
                  <KeyframeDiamond
                    key={`z-${kf.id}`}
                    keyframe={kf}
                    pxPerFrame={pxPerFrame}
                    trackId={selectedTrackId!}
                    isSelected={kf.id === selectedKeyframeId}
                    colorClass="text-blue-400 hover:text-blue-300"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Subcomponent: Draggable Diamond Keyframe Marker (◆)
interface KeyframeDiamondProps {
  keyframe: Keyframe;
  pxPerFrame: number;
  trackId: string;
  isSelected: boolean;
  colorClass: string;
}

const KeyframeDiamond: React.FC<KeyframeDiamondProps> = ({
  keyframe,
  pxPerFrame,
  trackId,
  isSelected,
  colorClass,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const origFrameRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    projectStore.selectKeyframe(keyframe.id);
    projectStore.seekToFrame(keyframe.frame);
    setIsDragging(true);
    startXRef.current = e.clientX;
    origFrameRef.current = keyframe.frame;
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startXRef.current;
      const deltaFrames = Math.round(deltaX / pxPerFrame);
      const newFrame = Math.max(0, origFrameRef.current + deltaFrames);

      projectStore.updateKeyframe(trackId, keyframe.id, { frame: newFrame });
      projectStore.seekToFrame(newFrame);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, pxPerFrame, trackId, keyframe.id]);

  const leftPx = keyframe.frame * pxPerFrame;

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-grab active:cursor-grabbing z-10 p-1 select-none transition-transform hover:scale-125 ${
        isSelected ? 'scale-125' : ''
      }`}
      style={{ left: `${leftPx}px` }}
      title={`F:${keyframe.frame} (X:${keyframe.x.toFixed(2)}, Y:${keyframe.y.toFixed(2)}, Z:${keyframe.z.toFixed(2)}) [${keyframe.interpolation}]`}
    >
      <div
        className={`w-3 h-3 rotate-45 border transition-all ${colorClass} ${
          isSelected
            ? 'bg-white border-amber-400 shadow-[0_0_6px_#fbbf24]'
            : 'bg-current border-dark-900 hover:bg-white'
        }`}
      />
    </div>
  );
};
