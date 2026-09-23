import React, { useEffect } from 'react';
import { HeaderBar } from './components/header/HeaderBar';
import { DawTimeline } from './components/timeline/DawTimeline';
import { SpatialViewer3D } from './components/viewer/SpatialViewer3D';
import { KeyframeEditor } from './components/keyframe/KeyframeEditor';
import { useProjectStore, projectStore } from './store/useProjectStore';
import { getInterpolatedPosition } from './utils/interpolation';
import { saveProjectFile, exportProjectCsvFile } from './utils/projectExporter';

const App: React.FC = () => {
  const { currentFrame, selectedTrackId, selectedKeyframeId, project } = useProjectStore();

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input field
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      const isCtrl = e.ctrlKey || e.metaKey;

      if (isCtrl && e.code === 'KeyS') {
        e.preventDefault();
        saveProjectFile(project);
      } else if (isCtrl && e.code === 'KeyE') {
        e.preventDefault();
        exportProjectCsvFile(project);
      } else if (e.code === 'Space') {
        e.preventDefault();
        projectStore.togglePlay();
      } else if (e.code === 'KeyK') {
        e.preventDefault();
        if (selectedTrackId) {
          const track = project.tracks.find((t) => t.id === selectedTrackId);
          if (track) {
            const pos = getInterpolatedPosition(track.keyframes, currentFrame);
            projectStore.addOrUpdateKeyframe(selectedTrackId, currentFrame, pos, 'bezier');
          }
        }
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        if (selectedTrackId && selectedKeyframeId) {
          e.preventDefault();
          projectStore.deleteKeyframe(selectedTrackId, selectedKeyframeId);
        }
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        projectStore.seekToFrame(Math.max(0, currentFrame - step));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        projectStore.seekToFrame(Math.min(project.totalFrames, currentFrame + step));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentFrame, selectedTrackId, selectedKeyframeId, project]);

  return (
    <div className="w-screen h-screen flex flex-col bg-dark-900 text-slate-100 overflow-hidden font-sans select-none">
      {/* 1. Header Toolbar */}
      <HeaderBar />

      {/* 2. Middle Row: DAW Timeline (Left) & 3D Spatial Viewer (Right) */}
      <div className="flex-1 flex min-h-0 p-2 gap-2 overflow-hidden">
        {/* DAW Timeline (Left ~58%) */}
        <div className="w-[58%] h-full flex flex-col min-w-0">
          <DawTimeline />
        </div>

        {/* 3D Spatial Viewer (Right ~42%) */}
        <div className="flex-1 h-full flex flex-col min-w-0">
          <SpatialViewer3D />
        </div>
      </div>

      {/* 3. Bottom Row: MMD Keyframe Editor */}
      <div className="h-56 px-2 pb-2 flex-shrink-0">
        <KeyframeEditor />
      </div>

      {/* Mini status shortcut bar */}
      <div className="h-5 bg-dark-850 border-t border-dark-750 px-3 flex items-center justify-between text-[10px] text-slate-400 font-mono">
        <div className="flex items-center space-x-3">
          <span><kbd className="bg-dark-700 text-slate-300 px-1 py-0.2 rounded border border-dark-600">Space</kbd> 再生/停止</span>
          <span><kbd className="bg-dark-700 text-slate-300 px-1 py-0.2 rounded border border-dark-600">Ctrl+S</kbd> 保存</span>
          <span><kbd className="bg-dark-700 text-slate-300 px-1 py-0.2 rounded border border-dark-600">Ctrl+E</kbd> CSV</span>
          <span><kbd className="bg-dark-700 text-slate-300 px-1 py-0.2 rounded border border-dark-600">K</kbd> キー登録</span>
          <span><kbd className="bg-dark-700 text-slate-300 px-1 py-0.2 rounded border border-dark-600">Del</kbd> キー削除</span>
          <span><kbd className="bg-dark-700 text-slate-300 px-1 py-0.2 rounded border border-dark-600">←/→</kbd> 1F移動</span>
          <span><kbd className="bg-dark-700 text-slate-300 px-1 py-0.2 rounded border border-dark-600">Shift+←/→</kbd> 5F移動</span>
        </div>
        <div className="text-slate-500">
          Binaural Editor v1.0.1 | Web Audio API HRTF Engine
        </div>
      </div>
    </div>
  );
};

export default App;
