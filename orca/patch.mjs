// Keyed DOM patcher for the Orca panel. The page is built once; each update only touches the
// nodes whose data changed, so a walking character is never re-created and its CSS animation
// never restarts. Uses a small DOM subset (createElement, insertBefore, nextSibling, textContent,
// className, hidden, dataset, style) so node --test can drive it with a fake document.
const LEAVE_MS = 320

function el(doc, tag, cls, parent) {
  const n = doc.createElement(tag)
  if (cls) n.className = cls
  if (parent) parent.appendChild(n)
  return n
}

function set(node, key, value) {
  if (node[key] !== value) node[key] = value
}

// Stable per-id phase so characters don't all walk in step, and never jump on update.
function phase(id) {
  let h = 0
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return ((h % 70) / 10).toFixed(1)
}

function build(doc, w) {
  const li = el(doc, 'li')
  const track = el(doc, 'div', 'track', li)
  el(doc, 'div', 'trail', track)
  const walker = el(doc, 'div', 'walker', track)
  walker.style.animationDelay = `-${phase(w.id)}s`
  const buddy = el(doc, 'div', 'buddy', walker)
  for (const c of ['eye l', 'eye r', 'foot l', 'foot r']) el(doc, 'i', c, buddy)
  const spark = el(doc, 'span', 'spark', walker)
  spark.textContent = '✓'
  const txt = el(doc, 'div', 'txt', li)
  const desc = el(doc, 'div', 'desc', txt)
  const sub = el(doc, 'div', 'sub', txt)
  const live = el(doc, 'div', 'live', txt)
  const label = el(doc, 'span', '', live)
  const t = el(doc, 'span', 't', live)
  const tools = el(doc, 'span', '', live)
  const feed = el(doc, 'div', 'feed', txt)
  return { li, spark, desc, sub, label, t, tools, feed }
}

function fill(n, w) {
  set(n.li, 'className', `w ${w.status} m-${(w.model || 'x').toLowerCase()}`)
  set(n.spark, 'hidden', w.status !== 'done')
  set(n.desc, 'textContent', w.description)
  set(n.sub, 'textContent', [w.model, w.type, w.project].filter(Boolean).join(' · '))
  set(n.label, 'textContent', { running: '', done: 'done · ', quiet: 'quiet · ' }[w.status] ?? '')
  set(n.tools, 'textContent', ` · ${w.tools} tools`)
  if (n.t.dataset.start !== String(w.startedAt)) n.t.dataset.start = String(w.startedAt)
  if (n.t.dataset.end !== String(w.endedAt)) n.t.dataset.end = String(w.endedAt)
  const lines = w.lines || []
  while (n.feed.children.length > lines.length) n.feed.removeChild(n.feed.lastChild)
  while (n.feed.children.length < lines.length) el(n.feed.ownerDocument, 'div', '', n.feed)
  lines.forEach((line, i) => set(n.feed.children[i], 'textContent', line))
  set(n.feed, 'hidden', !lines.length)
}

// Returns update(workers): adds new cards, patches existing ones in place, fades out the gone.
export function createParade(list, { later = setTimeout } = {}) {
  const nodes = new Map()
  const live = n => {
    while (n && n.leaving) n = n.nextSibling
    return n
  }
  return function update(workers) {
    const seen = new Set()
    for (const w of workers) {
      seen.add(w.id)
      let n = nodes.get(w.id)
      if (!n) nodes.set(w.id, (n = build(list.ownerDocument, w)))
      fill(n, w)
    }
    for (const [id, n] of nodes) {
      if (seen.has(id)) continue
      nodes.delete(id)
      n.li.leaving = true
      n.li.className += ' leaving'
      later(() => n.li.parentNode && n.li.parentNode.removeChild(n.li), LEAVE_MS)
    }
    // Place from the end so a card that drops to the bottom is the only one moved.
    let ref = null
    for (let i = workers.length - 1; i >= 0; i--) {
      const li = nodes.get(workers[i].id).li
      if (li.parentNode !== list || live(li.nextSibling) !== ref) list.insertBefore(li, ref)
      ref = li
    }
    return nodes
  }
}
