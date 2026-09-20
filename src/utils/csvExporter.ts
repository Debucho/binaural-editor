import { ProjectData } from '../types/project';
import { getInterpolatedPosition } from './interpolation';

/**
 * Generates CSV string containing frame-by-frame 3D coordinates and keyframe info for all tracks.
 */
export function generateProjectCsv(project: ProjectData): string {
  const headers = ['Track_ID', 'Track_Name', 'Frame', 'Time_Sec', 'X', 'Y', 'Z', 'Interpolation', 'Is_Keyframe'];
  const rows: string[] = [headers.join(',')];

  project.tracks.forEach((track) => {
    for (let frame = 0; frame <= project.totalFrames; frame++) {
      const timeSec = (frame / project.fps).toFixed(3);
      const pos = getInterpolatedPosition(track.keyframes, frame);
      const kf = track.keyframes.find((k) => k.frame === frame);
      const isKf = kf ? 'YES' : 'NO';
      const interp = kf ? kf.interpolation : '';

      // Escape quotes in track name
      const trackNameEscaped = `"${track.name.replace(/"/g, '""')}"`;

      rows.push(
        [
          track.id,
          trackNameEscaped,
          frame,
          timeSec,
          pos.x.toFixed(4),
          pos.y.toFixed(4),
          pos.z.toFixed(4),
          interp,
          isKf,
        ].join(',')
      );
    }
  });

  return rows.join('\n');
}

/**
 * Exports project trajectory to CSV file via Electron save dialog or Browser download.
 */
export async function exportProjectCsv(project: ProjectData): Promise<string | null> {
  const csvContent = generateProjectCsv(project);
  const defaultFileName = `${project.name || 'project'}_trajectory.csv`;

  if (window.electronAPI?.saveCsv) {
    const savedPath = await window.electronAPI.saveCsv(csvContent, defaultFileName);
    return savedPath;
  } else {
    // Browser fallback (UTF-8 BOM added for Excel compatibility)
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultFileName;
    a.click();
    URL.revokeObjectURL(url);
    return defaultFileName;
  }
}
