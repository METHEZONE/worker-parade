import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createParade } from '../orca/patch.mjs'

// Just enough DOM for patch.mjs: a tree of nodes with sibling links and a few properties.
class Node {
  constructor(doc, tag) {
    Object.assign(this, { ownerDocument: doc, tagName: tag, children: [], parentNode: null, className: '', textContent: '', hidden: false, dataset: {}, style: {} })
    doc.created++
  }
  get nextSibling() {
    const s = this.parentNode?.children
    return s ? (s[s.indexOf(this) + 1] ?? null) : null
  }
  get lastChild() {
    return this.children.at(-1) ?? null
  }
  removeChild(n) {
    this.children.splice(this.children.indexOf(n), 1)
    n.parentNode = null
    return n
  }
  insertBefore(n, ref) {
    if (n.parentNode) n.parentNode.removeChild(n)
    const i = ref ? this.children.indexOf(ref) : this.children.length
    this.children.splice(i, 0, n)
    n.parentNode = this
    return n
  }
  appendChild(n) {
    return this.insertBefore(n, null)
  }
}
const fakeDoc = () => {
  const doc = { created: 0 }
  doc.createElement = tag => new Node(doc, tag)
  return doc
}

const w = (id, over = {}) => ({ id, description: `task ${id}`, type: 'general-purpose', model: 'Sonnet', project: 'app', startedAt: 1000, endedAt: 0, tools: 1, lines: ['Read a.ts'], status: 'running', ...over })
const ids = list => list.children.filter(li => !li.leaving).map(li => li.children[1].children[0].textContent)

test('patch: updates in place without re-creating nodes', () => {
  const doc = fakeDoc()
  const list = doc.createElement('ul')
  const update = createParade(list, { later: () => {} })
  update([w('a'), w('b')])
  const [liA, liB] = list.children
  const walkerA = liA.children[0].children[1]
  const before = doc.created

  update([w('a', { tools: 7, lines: ['Read a.ts', 'Bash Run tests'] }), w('b', { status: 'done', endedAt: 5000 })])

  assert.equal(doc.created, before + 1, 'only the one new ticker line is created')
  assert.equal(list.children[0], liA)
  assert.equal(list.children[1], liB)
  assert.equal(liA.children[0].children[1], walkerA, 'walker element survives, so its animation keeps running')
  assert.equal(liA.children[1].children[2].children[2].textContent, ' · 7 tools')
  assert.deepEqual(liA.children[1].children[3].children.map(d => d.textContent), ['Read a.ts', 'Bash Run tests'])
  assert.equal(liB.className, 'w done m-sonnet')
  assert.equal(liB.children[0].children[1].children[1].hidden, false, 'done shows the ✓')
  assert.equal(liB.children[1].children[2].children[1].dataset.end, '5000')
})

test('patch: adds, reorders and fades out workers by id, never clearing the list', () => {
  const doc = fakeDoc()
  const list = doc.createElement('ul')
  const pending = []
  const update = createParade(list, { later: fn => pending.push(fn) })
  update([w('a'), w('b'), w('c')])
  const [liA, liB, liC] = list.children

  update([w('d'), w('c'), w('a')])
  assert.deepEqual(ids(list), ['task d', 'task c', 'task a'])
  assert.equal(list.children.includes(liB), true, 'b stays while it fades out')
  assert.match(liB.className, /leaving/)
  assert.equal(list.children.filter(li => li === liA || li === liC).length, 2, 'a and c are the same nodes')

  pending.forEach(fn => fn())
  assert.equal(list.children.includes(liB), false, 'b is removed after the fade')
  assert.deepEqual(ids(list), ['task d', 'task c', 'task a'])

  const before = doc.created
  update([w('d'), w('c'), w('a')])
  assert.equal(doc.created, before, 'identical data touches nothing')
  update([])
  pending.forEach(fn => fn())
  assert.equal(list.children.length, 0)
})
