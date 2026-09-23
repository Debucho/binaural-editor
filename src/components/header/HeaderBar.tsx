import React, { useState } from 'react';
import { useProjectStore, projectStore } from '../../store/useProjectStore';
import { renderBinauralAudioOffline } from '../../audio/OfflineRenderer';
import { renderSofaAudio } from '../../audio/spatial/SofaAudioRenderer';
import { stereoBuffersToWav } from '../../audio/wavEncoder';
import { SofaLoader } from '../../audio/spatial/SofaLoader';
import { createNeumannKU100Dataset } from '../../audio/spatial/HrirDataset';
import { ramPreviewManager } from '../../audio/preview/RamPreviewManager';
import { ExportModal } from '../export/ExportModal';
import { SpatialEngineType } from '../../types/project';
import {
  Play,
  Pause,
  Square,
  Repeat,
  Save,
  FolderOpen,
  FilePlus,
  Download,
  FileSpreadsheet,
  Headphones,
  Clock,
  Sparkles,
  UploadCloud,
  ChevronDown,
} from 'lucide-react';
import { saveProjectFile, exportProjectCsvFile } from '../../utils/projectExporter';

export const HeaderBar: React.FC = () => {
  const { project, currentFrame, isPlaying, activeHrirProfile } = useProjectStore();

  // Export modal state
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStage, setExportStage] = useState('');
  const [exportComplete, setExportComplete] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSavedPath, setExportSavedPath] = useState<string | null>(null);
  const [exportEngine, setExportEngine] = useState<SpatialEngineType>(
    project.spatialSettings?.engine || 'sofa'
  );

  // HRIR Profile dropdown state
  const [hrirMenuOpen, setHrirMenuOpen] = useState(false);

  // Time format: MM:SS.mmm
  const currentSeconds = currentFrame / project.fps;
  const minutes = Math.floor(currentSeconds / 60);
  const seconds = Math.floor(currentSeconds % 60);
  const millis = Math.floor((currentSeconds % 1) * 1000);
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;

  // Custom SOFA / HRIR file import
  const handleLoadCustomHrir = async () => {
    setHrirMenuOpen(false);
    if (window.electronAPI?.openHrirFile) {
      const result = await window.electronAPI.openHrirFile();
      if (!result) return;

      try {
        const dataset = await SofaLoader.loadFromBuffer(result.buffer, result.name);
        projectStore.setHrirDataset(dataset);
        alert(`カスタムHRIRデータセットを適用しました:\n${dataset.profile.name} (${dataset.profile.pointsCount} 測位点)`);
      } catch (err: any) {
        alert('SOFA/HRIRファイルの読み込みに失敗しました:\n' + err.message);
      }
    } else {
      // Browser fallback
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.sofa,.json,.wav';
      input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const arrayBuf = await file.arrayBuffer();
        try {
          const dataset = await SofaLoader.loadFromBuffer(arrayBuf, file.name);
          projectStore.setHrirDataset(dataset);
          alert(`カスタムHRIRデータセットを適用しました:\n${dataset.profile.name} (${dataset.profile.pointsCount} 測位点)`);
        } catch (err: any) {
          alert('SOFA/HRIRファイルの読み込みに失敗しました:\n' + err.message);
        }
      };
      input.click();
    }
  };

  // Restore built-in Neumann KU100
  const handleSelectBuiltInHrir = () => {
    setHrirMenuOpen(false);
    const dataset = createNeumannKU100Dataset(48000);
    projectStore.setHrirDataset(dataset);
  };

  // Save project
  const handleSaveProject = async () => {
    await saveProjectFile(project);
  };

  // Export CSV trajectory
  const handleExportCsv = async () => {
    await exportProjectCsvFile(project);
  };

  // Load project
  const handleLoadProject = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.loadProject();
      if (!result) return;
      try {
        const data = JSON.parse(result.content);
        await projectStore.loadProject(data);
      } catch (err) {
        alert('プロジェクトファイルの読み込みに失敗しました: ' + err);
      }
    } else {
      // Browser fallback
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.bbproj,.json';
      input.onchange = async (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        try {
          const data = JSON.parse(text);
          await projectStore.loadProject(data);
        } catch (err) {
          alert('プロジェクトファイルの読み込みに失敗しました: ' + err);
        }
      };
      input.click();
    }
  };

  // Open Export Modal
  const handleOpenExportModal = () => {
    setExportProgress(0);
    setExportStage('');
    setExportComplete(false);
    setIsExporting(false);
    setExportError(null);
    setExportSavedPath(null);
    setExportEngine(project.spatialSettings?.engine || 'sofa');
    setExportModalOpen(true);
  };

  // Execute Binaural WAV Export
  const handleStartExport = async () => {
    setIsExporting(true);
    setExportProgress(0);
    setExportStage('レンダリング準備中...');
    setExportError(null);
    projectStore.setSpatialSettings({ engine: exportEngine });

    try {
      let wavBuffer: ArrayBuffer;

      if (exportEngine === 'sofa') {
        const hrirDataset = ramPreviewManager.getHrirDataset();
        setExportStage(`SOFAカスタム畳み込み処理中 (${hrirDataset.profile.name})...`);

        const result = await renderSofaAudio(
          project.tracks,
          project.fps,
          project.totalFrames,
          hrirDataset,
          48000,
          (progress, stage) => {
            setExportProgress(progress);
            setExportStage(stage);
          }
        );

        setExportStage('WAVファイルエンコード中...');
        wavBuffer = stereoBuffersToWav(result.left, result.right, result.sampleRate);
      } else {
        // Fallback Web Audio offline rendering
        wavBuffer = await renderBinauralAudioOffline(
          project.tracks,
          project.fps,
          project.totalFrames,
          (progress, stage) => {
            setExportProgress(progress);
            setExportStage(stage);
          }
        );
      }

      if (window.electronAPI) {
        const savedPath = await window.electronAPI.saveWav(wavBuffer, `${project.name}_binaural.wav`);
        if (savedPath) {
          setExportSavedPath(savedPath);
          setExportComplete(true);
        } else {
          // User canceled file dialog
          setExportModalOpen(false);
        }
      } else {
        // Browser fallback: download blob
        const blob = new Blob([wavBuffer], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project.name}_binaural.wav`;
        a.click();
        URL.revokeObjectURL(url);
        setExportComplete(true);
      }
    } catch (err: any) {
      console.error('Export error:', err);
      setExportError(err.message || 'エクスポート中にエラーが発生しました');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <header className="h-12 bg-dark-850 border-b border-dark-700 px-4 flex items-center justify-between select-none shadow-md z-20">
        {/* App Title & Logo */}
        <div className="flex items-center space-x-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-studio-accent to-blue-600 flex items-center justify-center text-dark-900 shadow-sm">
            <Headphones className="w-4 h-4 font-bold" />
          </div>
          <div>
            <h1 className="text-xs font-bold tracking-wide text-slate-100 uppercase flex items-center space-x-1.5">
              <span>Binaural Editor</span>
              <span className="text-[10px] px-1.5 py-0.2 bg-studio-accent/20 text-studio-accent rounded font-mono font-normal">
                SOFA Edition
              </span>
            </h1>
            <input
              type="text"
              value={project.name}
              onChange={(e) => {
                projectStore.getState().project.name = e.target.value;
              }}
              className="bg-transparent text-[11px] text-slate-400 hover:text-slate-200 outline-none w-28 truncate"
            />
          </div>
        </div>

        {/* HRIR / SOFA Profile Selector */}
        <div className="relative">
          <button
            onClick={() => setHrirMenuOpen(!hrirMenuOpen)}
            className="flex items-center space-x-1.5 px-2.5 py-1 bg-dark-800 hover:bg-dark-750 text-slate-300 rounded border border-dark-700 text-xs transition-colors"
            title="HRIR / SOFA 空間化プロファイル設定"
          >
            <Sparkles className="w-3.5 h-3.5 text-studio-accent" />
            <span className="font-mono text-[11px] truncate max-w-[150px]">
              {activeHrirProfile?.name || 'Neumann KU100'}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {/* HRIR Dropdown Menu */}
          {hrirMenuOpen && (
            <div className="absolute left-0 mt-1 w-64 bg-dark-800 border border-dark-650 rounded-lg shadow-2xl py-1 z-50 text-xs divide-y divide-dark-750">
              <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                HRIR / SOFA プロファイル
              </div>

              <div className="py-1">
                <button
                  onClick={handleSelectBuiltInHrir}
                  className="w-full text-left px-3 py-1.5 hover:bg-dark-700 flex flex-col transition-colors"
                >
                  <span className="font-semibold text-slate-200">Neumann KU100 (内蔵 高精度)</span>
                  <span className="text-[10px] text-slate-400">
                    360° ITD/ILD/ピンナノッチ完全モデル化
                  </span>
                </button>
              </div>

              <div className="py-1">
                <button
                  onClick={handleLoadCustomHrir}
                  className="w-full text-left px-3 py-1.5 hover:bg-dark-700 flex items-center space-x-2 text-studio-accent transition-colors"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>カスタム SOFA / HRIR 読込...</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Transport Controls (Play / Stop / Loop) */}
        <div className="flex items-center space-x-2">
          {/* Stop Button */}
          <button
            onClick={() => projectStore.stop()}
            className="p-2 rounded-md bg-dark-750 hover:bg-dark-700 text-slate-300 hover:text-white transition-colors"
            title="停止 (先頭へ戻る)"
          >
            <Square className="w-4 h-4 fill-current" />
          </button>

          {/* Play / Pause Button */}
          <button
            onClick={() => projectStore.togglePlay()}
            className={`px-4 py-2 rounded-md font-bold text-xs flex items-center space-x-1.5 transition-all shadow-md ${
              isPlaying
                ? 'bg-amber-500 text-dark-900 hover:bg-amber-400'
                : 'bg-studio-accent text-dark-900 hover:bg-sky-300'
            }`}
            title="再生 / 一時停止 [Space]"
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span>PAUSE</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>PLAY</span>
              </>
            )}
          </button>

          {/* Loop Button */}
          <button
            onClick={() => projectStore.setLoop({ enabled: !project.loop.enabled })}
            className={`p-2 rounded-md transition-colors ${
              project.loop.enabled
                ? 'bg-studio-accent/20 text-studio-accent border border-studio-accent/40'
                : 'bg-dark-750 text-slate-400 hover:text-slate-200'
            }`}
            title="ループ再生切替"
          >
            <Repeat className="w-4 h-4" />
          </button>
        </div>

        {/* Timecode & Frame Display */}
        <div className="flex items-center space-x-4 bg-dark-900/90 px-3.5 py-1.5 rounded-lg border border-dark-750 font-mono shadow-inner">
          <div className="flex items-center space-x-1.5 text-studio-accent">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-sm font-bold tracking-wider">{timeFormatted}</span>
          </div>

          <div className="h-4 w-[1px] bg-dark-700" />

          <div className="text-xs text-slate-300 flex items-center space-x-1">
            <span className="text-slate-500 text-[10px]">FRAME:</span>
            <span className="text-amber-400 font-bold w-12 text-right">
              {String(currentFrame).padStart(5, '0')}
            </span>
            <span className="text-slate-500">/</span>
            <input
              type="number"
              min={30}
              step={30}
              value={project.totalFrames}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 30) {
                  projectStore.setTotalFrames(val);
                }
              }}
              title="プロジェクト総フレーム数（変更可能）"
              className="w-14 bg-dark-800 text-slate-300 hover:text-white px-1 py-0.5 rounded text-[11px] font-mono outline-none border border-dark-700 hover:border-dark-600 focus:border-studio-accent text-center"
            />
            <span className="text-[10px] text-slate-400 font-mono" title="全体の総時間">
              ({(project.totalFrames / project.fps).toFixed(1)}s)
            </span>
          </div>
        </div>

        {/* FPS Switcher (30 / 60) */}
        <div className="flex items-center space-x-1 bg-dark-900 px-1 py-1 rounded-lg border border-dark-750 text-xs">
          <span className="text-slate-500 text-[10px] px-1.5">FPS:</span>
          <button
            onClick={() => projectStore.setFps(30)}
            className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition-colors ${
              project.fps === 30
                ? 'bg-studio-accent text-dark-900'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            30
          </button>
          <button
            onClick={() => projectStore.setFps(60)}
            className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition-colors ${
              project.fps === 60
                ? 'bg-studio-accent text-dark-900'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            60
          </button>
        </div>

        {/* Project Actions & WAV Export */}
        <div className="flex items-center space-x-2">
          {/* New Project */}
          <button
            onClick={() => {
              if (confirm('現在のプロジェクトをリセットして新規作成しますか？')) {
                projectStore.resetProject();
              }
            }}
            className="p-1.5 rounded bg-dark-750 hover:bg-dark-700 text-slate-300 hover:text-white transition-colors"
            title="新規プロジェクト"
          >
            <FilePlus className="w-4 h-4" />
          </button>

          {/* Load Project */}
          <button
            onClick={handleLoadProject}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded bg-dark-750 hover:bg-dark-700 text-slate-200 text-xs transition-colors"
            title="プロジェクトを開く"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>開く</span>
          </button>

          {/* Save Project */}
          <button
            onClick={handleSaveProject}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded bg-dark-750 hover:bg-dark-700 text-slate-200 text-xs transition-colors"
            title="プロジェクトを保存 [Ctrl+S]"
          >
            <Save className="w-3.5 h-3.5 text-blue-400" />
            <span>保存</span>
          </button>

          {/* Export CSV Trajectory */}
          <button
            onClick={handleExportCsv}
            className="flex items-center space-x-1 px-2.5 py-1.5 rounded bg-dark-750 hover:bg-dark-700 text-slate-200 text-xs transition-colors"
            title="3D軌跡をCSVで出力 [Ctrl+E]"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>CSV出力</span>
          </button>

          {/* Export WAV */}
          <button
            onClick={handleOpenExportModal}
            className="flex items-center space-x-1 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all shadow-md"
            title="バイノーラル音声 (WAV) としてオフライン書き出し"
          >
            <Download className="w-3.5 h-3.5" />
            <span>WAV書き出し</span>
          </button>
        </div>
      </header>

      {/* Export progress modal */}
      <ExportModal
        isOpen={exportModalOpen}
        progress={exportProgress}
        stage={exportStage}
        isComplete={exportComplete}
        isExporting={isExporting}
        error={exportError}
        savedPath={exportSavedPath}
        spatialEngine={exportEngine}
        hrirName={activeHrirProfile?.name || 'Neumann KU100'}
        onSelectEngine={(engine) => setExportEngine(engine)}
        onStartExport={handleStartExport}
        onClose={() => setExportModalOpen(false)}
      />
    </>
  );
};
