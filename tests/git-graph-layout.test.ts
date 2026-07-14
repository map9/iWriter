import assert from 'node:assert/strict'
import test from 'node:test'
import type { GitCommit } from '@/types/git'
import { computeGraphLayout, getGraphRowLaneCount, hasUnpublishedLocalRef } from '../src/components/sidebar/scm/gitGraphLayout.ts'

const commit = (hash: string, parents: string[], refs: GitCommit['refs'] = []): GitCommit => ({
  hash,
  shortHash: hash,
  subject: hash,
  author: 'author',
  date: '2026-01-01T00:00:00.000Z',
  timestamp: 0,
  parents,
  refs,
})

test('row gutter only reserves lanes used by that row', () => {
  const layout = computeGraphLayout([
    commit('tip-a', ['base']),
    commit('tip-b', ['base']),
    commit('base', []),
  ])

  assert.equal(layout.laneCount, 2)
  assert.equal(getGraphRowLaneCount(layout.rows[0]!), 1)
  assert.equal(getGraphRowLaneCount(layout.rows[1]!), 2)
})

test('local refs without a remote ref at the same commit are unpublished', () => {
  assert.equal(hasUnpublishedLocalRef([{ name: 'feature', kind: 'branch' }]), true)
  assert.equal(hasUnpublishedLocalRef([{ name: 'feature', kind: 'branch' }, { name: 'origin/feature', kind: 'remote' }]), false)
  assert.equal(hasUnpublishedLocalRef([{ name: 'v1.0.0', kind: 'tag' }]), false)
})

test('switches the first-parent lane color at a branch ref', () => {
  const layout = computeGraphLayout([
    commit('feature-tip', ['feature-work'], [{ name: 'feature', kind: 'head' }]),
    commit('feature-work', ['main-ref']),
    commit('main-ref', ['older'], [{ name: 'main', kind: 'branch' }, { name: 'origin/main', kind: 'remote' }]),
    commit('older', []),
  ])

  const featureColor = layout.rows[1]!.color
  const mainRow = layout.rows[2]!
  assert.notEqual(mainRow.color, featureColor)
  assert.equal(mainRow.segments.find(segment => segment.half === 'top')?.color, featureColor)
  assert.equal(mainRow.segments.find(segment => segment.half === 'bottom')?.color, mainRow.color)
  assert.equal(layout.rows[3]!.color, mainRow.color)
})
