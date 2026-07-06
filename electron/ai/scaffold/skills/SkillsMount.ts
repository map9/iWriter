import * as fs from 'fs'
import * as path from 'path'

/**
 * SkillsMount (plan A2) — shared helpers for building skills middleware mount source lists.
 * Sources are ordered last-wins: earlier entries are base, later entries override by skill name.
 */

/** The project-level author-custom skills dir, which sits at every mount list's末位 (FR-9.3). */
export function projectSkillsDir(workspacePath: string | null): string | null {
  if (!workspacePath) return null
  return path.join(workspacePath, '.iwriter', 'skills')
}

/**
 * Append the project-level skills dir末位 when it exists on disk. It is omitted when absent
 * so the skills middleware never receives a missing source path.
 */
export function withProjectSkills(sources: string[], workspacePath: string | null): string[] {
  const dir = projectSkillsDir(workspacePath)
  if (dir && fs.existsSync(dir)) return [...sources, dir]
  return sources
}
