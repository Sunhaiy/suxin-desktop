import { app } from 'electron'
import path from 'path'

/**
 * Base directory for all user-facing data files.
 * Packaged (production): directory containing the .exe — so data lives next to the app.
 * Development: userData (AppData) to avoid polluting the project tree.
 */
export function getDataBase(): string {
  return app.isPackaged
    ? path.dirname(app.getPath('exe'))
    : app.getPath('userData')
}
