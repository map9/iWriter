import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const explorerSource = readFileSync('src/components/sidebar/ExplorerPanel.vue', 'utf8')
const appStoreSource = readFileSync('src/stores/app.ts', 'utf8')
const treeTypesSource = readFileSync('src/components/common/tree/index.ts', 'utf8')
const treeNodeSource = readFileSync('src/components/common/tree/TreeNode.vue', 'utf8')

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)
  assert.notEqual(start, -1, `missing ${startMarker}`)
  assert.notEqual(end, -1, `missing ${endMarker}`)
  return source.slice(start, end)
}

describe('Explorer file tree rendering', () => {
  it('keeps rootChildren free of tree traversal and mutation', () => {
    const rootChildren = sourceBetween(explorerSource, 'const rootChildren = computed', 'let hasAppliedSearchFilter')

    assert.match(rootChildren, /return appStore\.fileTree\.children/)
    assert.doesNotMatch(rootChildren, /applyNodeAppearance/)
    assert.doesNotMatch(rootChildren, /sortFileTreeNodes/)
    assert.doesNotMatch(rootChildren, /queryFileTreeNodes/)
  })

  it('computes file-node appearance in rendered TreeNode instances without mutating node.data', () => {
    const appearanceSection = sourceBetween(explorerSource, '// File callbacks', '// Event handlers')

    assert.match(treeTypesSource, /getNodeAppearance\?: \(node: TreeNode\)/)
    assert.match(treeNodeSource, /getNodeAppearance\?\.\(props\.node\)/)
    assert.match(appearanceSection, /getNodeAppearance:/)
    assert.match(explorerSource, /treeIconStyle: \{ opacity: '0\.6' \}/)
    assert.doesNotMatch(appearanceSection, /node\.data\s*=/)
  })

  it('derives Explorer Git decorations from changed paths without rebuilding file counts', () => {
    const appearanceSection = sourceBetween(explorerSource, '// File callbacks', '// Event handlers')

    assert.match(explorerSource, /import \{ useGitStore \} from '@\/stores\/git'/)
    assert.match(explorerSource, /const gitFileDecorations = reactive\(new Map/)
    assert.match(explorerSource, /const gitDirectoryDecorations = reactive\(new Map/)
    assert.match(explorerSource, /function syncGitDecorations\(\)/)
    assert.match(explorerSource, /if \(change\.status === 'D'\) continue/)
    assert.match(appearanceSection, /gitFileDecorations\.get\(normalizeExplorerGitPath\(fileNode\.path\)\)/)
    assert.match(appearanceSection, /gitDirectoryDecorations\.get\(normalizeExplorerGitPath\(fileNode\.path\)\)/)
    assert.doesNotMatch(appearanceSection, /fileCount/)
  })

  it('uses Tree badge appearance hooks instead of deep selectors for Git decorations', () => {
    const appearanceSection = sourceBetween(explorerSource, '// File callbacks', '// Event handlers')

    assert.match(treeTypesSource, /treeBadgeClass\?:/)
    assert.match(treeTypesSource, /treeBadgeStyle\?:/)
    assert.match(treeNodeSource, /const customBadgeClass = computed/)
    assert.match(treeNodeSource, /const customBadgeStyle = computed/)
    assert.match(treeNodeSource, /:class="customBadgeClass"/)
    assert.match(treeNodeSource, /:style="customBadgeStyle"/)
    assert.match(appearanceSection, /treeBadgeStyle/)
    assert.doesNotMatch(explorerSource, /:deep\(/)
  })

  it('sorts when tree data changes rather than while the Explorer renders', () => {
    assert.match(appStoreSource, /function setFileTreeSortType\(sortType: FileTreeSortType\)/)

    const loadTree = sourceBetween(appStoreSource, 'async function loadFileTree(', 'async function getEffectiveWorkspaceIgnoreRules')
    const childLoadIndex = loadTree.indexOf('fileTree.value.children = await traverseFileTree')
    const sortIndex = loadTree.indexOf('sortFileTreeNodes(fileTree.value.children as FileTreeNode[], currentFileTreeSortType.value)')
    assert.notEqual(childLoadIndex, -1)
    assert.ok(sortIndex > childLoadIndex, 'a newly loaded tree should be sorted once before rendering')
  })
})
