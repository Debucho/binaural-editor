import { ProjectData } from '../types/project';
import { exportProjectCsv } from './csvExporter';

/**
 * Saves current project as JSON (.bbproj file)
 */
export async function saveProjectFile(project: ProjectData): Promise<string | null> {
  const jsonStr = JSON.stringify(project, null, 2);
  if (window.electronAPI?.saveProject) {
    const savedPath = await window.electronAPI.saveProject(jsonStr, `${project.name || 'project'}.bbproj`);
    if (savedPath) {
      alert(`プロジェクトを保存しました:\n${savedPath}`);
    }
    return savedPath;
  } else {
    // Browser fallback: download file
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name || 'project'}.bbproj`;
    a.click();
    URL.revokeObjectURL(url);
    return `${project.name || 'project'}.bbproj`;
  }
}

/**
 * Exports project trajectory to CSV file
 */
export async function exportProjectCsvFile(project: ProjectData): Promise<string | null> {
  const savedPath = await exportProjectCsv(project);
  if (savedPath && window.electronAPI?.saveCsv) {
    alert(`CSV軌跡データをエクスポートしました:\n${savedPath}`);
  }
  return savedPath;
}
