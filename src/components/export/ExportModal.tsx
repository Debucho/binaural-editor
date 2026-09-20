import React from 'react';
import { Loader2, CheckCircle, AlertCircle, Headphones, Sparkles, Sliders } from 'lucide-react';
import { SpatialEngineType } from '../../types/project';

interface ExportModalProps {
  isOpen: boolean;
  progress: number;
  stage: string;
  isComplete: boolean;
  isExporting: boolean;
  error?: string | null;
  savedPath?: string | null;
  spatialEngine: SpatialEngineType;
  hrirName: string;
  onSelectEngine: (engine: SpatialEngineType) => void;
  onStartExport: () => void;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  progress,
  stage,
  isComplete,
  isExporting,
  error,
  savedPath,
  spatialEngine,
  hrirName,
  onSelectEngine,
  onStartExport,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-dark-800 border border-dark-650 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
        <h3 className="text-lg font-semibold text-slate-100 flex items-center space-x-2">
          {isComplete ? (
            <CheckCircle className="w-5 h-5 text-emerald-400" />
          ) : error ? (
            <AlertCircle className="w-5 h-5 text-red-400" />
          ) : isExporting ? (
            <Loader2 className="w-5 h-5 text-studio-accent animate-spin" />
          ) : (
            <Headphones className="w-5 h-5 text-studio-accent" />
          )}
          <span>バイノーラル WAV 書き出し</span>
        </h3>

        {/* Engine and HRIR Settings (when not actively exporting) */}
        {!isExporting && !isComplete && (
          <div className="space-y-3 bg-dark-850 p-3.5 rounded-lg border border-dark-700 text-xs">
            <div className="space-y-1">
              <label className="text-slate-400 font-medium flex items-center space-x-1.5">
                <Sliders className="w-3.5 h-3.5 text-studio-accent" />
                <span>空間音響レンダリングエンジン</span>
              </label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                <button
                  type="button"
                  onClick={() => onSelectEngine('sofa')}
                  className={`p-2 rounded border text-left flex flex-col justify-between transition-colors ${
                    spatialEngine === 'sofa'
                      ? 'bg-studio-accent/20 border-studio-accent text-white'
                      : 'bg-dark-900 border-dark-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-semibold flex items-center space-x-1 text-studio-accent">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>SOFA 畳み込み</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1">
                    最高品質 FFT 畳み込み & クロスフェード
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onSelectEngine('webaudio')}
                  className={`p-2 rounded border text-left flex flex-col justify-between transition-colors ${
                    spatialEngine === 'webaudio'
                      ? 'bg-studio-accent/20 border-studio-accent text-white'
                      : 'bg-dark-900 border-dark-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-semibold text-slate-300">Web Audio HRTF</div>
                  <span className="text-[10px] text-slate-400 mt-1">
                    標準 PannerNode による軽量処理
                  </span>
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-dark-750 flex items-center justify-between text-[11px]">
              <span className="text-slate-400">適用 HRIR プロファイル:</span>
              <span className="text-amber-300 font-mono font-medium truncate max-w-[200px]">
                {hrirName}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>出力フォーマット:</span>
              <span>48,000 Hz / 16-bit Stereo PCM WAV</span>
            </div>
          </div>
        )}

        {/* Status and stage during/after export */}
        {(isExporting || isComplete || error) && (
          <div className="text-sm text-slate-300">
            {error ? (
              <p className="text-red-400 font-medium">{error}</p>
            ) : isComplete ? (
              <div className="space-y-1">
                <p className="text-emerald-400 font-medium">エクスポートが完了しました！</p>
                {savedPath && (
                  <p className="text-xs text-slate-400 font-mono break-all">保存先: {savedPath}</p>
                )}
              </div>
            ) : (
              <p className="text-slate-300 font-medium">{stage}</p>
            )}
          </div>
        )}

        {/* Progress bar */}
        {isExporting && (
          <div className="space-y-1.5">
            <div className="w-full h-2.5 bg-dark-900 rounded-full overflow-hidden border border-dark-700">
              <div
                className="h-full bg-studio-accent transition-all duration-200"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] font-mono text-slate-400">
              <span>進行状況</span>
              <span>{Math.round(progress * 100)}%</span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-2 flex justify-end space-x-2">
          {!isExporting && !isComplete && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-dark-750 hover:bg-dark-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={onStartExport}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs transition-colors shadow-lg"
              >
                書き出し開始
              </button>
            </>
          )}

          {(isComplete || error) && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-studio-accent text-dark-900 font-semibold rounded-lg text-xs hover:bg-sky-300 transition-colors"
            >
              閉じる
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
