// static/js/main.js

let activeCat = null
let categories = []
let isSwitchingCategory = false
let currentQuote = null
let inflightCtrl = null

// backend on/off (auto-detect)
let USE_BACKEND = false
// { [category: string]: Quote[] } when static
let QUOTES_DB = null

// no-repeat helpers (static mode)
const deckMap = Object.create(null)   // category -> shuffled index queue
const lastKeyMap = Object.create(null) // category -> last shown key

// ---------- utils ----------
function rel(url) {
  if (url.startsWith('/')) url = url.slice(1)
  if (!url.startsWith('./') && !url.startsWith('http') && !url.startsWith('api/')) {
    url = './' + url
  }
  return url
}

function normalizeQuote(q) {
  const en = (q.en ?? q.text ?? q.quote ?? '').toString()
  const th = (q.th ?? '').toString()
  const author = (q.author ?? q.by ?? '').toString()
  const year = (q.year ?? '').toString()
  const info = (q.info ?? q.description ?? '').toString()
  const work = (q.work ?? q.source ?? '').toString()
  const ref  = (q.ref ?? q.link ?? q.url ?? '').toString()
  return { en, th, author, year, info, work, ref }
}

function getQuoteKey(q) {
  return [q.en, q.author, q.year].join('||')
}

// ---------- data loading ----------
async function fetchCategories() {
  // try backend first
  try {
    const res = await fetch(rel('api/categories'), { cache: 'no-store' })
    if (res.ok) {
      const arr = await res.json()
      if (Array.isArray(arr) && arr.length) {
        USE_BACKEND = true
        categories = arr
        renderTabs(categories)
        return
      }
    }
  } catch (_) {}

  // static fallback
  const db = await loadLocalQuotesDB()
  QUOTES_DB = db
  categories = Object.keys(db).sort()
  if (categories.length === 0) {
    categories = ['All']
    QUOTES_DB = { All: [] }
  }
  renderTabs(categories)
}

async function loadLocalQuotesDB() {
  const res = await fetch(rel('quotes.json'), { cache: 'no-store' })
  if (!res.ok) throw new Error('load quotes.json failed')
  const data = await res.json()

  const bucket = {}

  if (Array.isArray(data)) {
    for (const raw of data) {
      const q = normalizeQuote(raw)
      let cats = raw.cat ?? raw.category ?? raw.categories ?? raw.tags
      if (cats == null) cats = ['All']
      if (typeof cats === 'string') cats = [cats]
      if (!Array.isArray(cats) || cats.length === 0) cats = ['All']
      for (const c of cats) {
        const key = (c || 'All').toString()
        if (!bucket[key]) bucket[key] = []
        bucket[key].push(q)
      }
    }
    return bucket
  }

  if (typeof data === 'object' && data) {
    for (const k of Object.keys(data)) {
      const arr = Array.isArray(data[k]) ? data[k] : []
      bucket[k] = arr.map(normalizeQuote)
    }
    return bucket
  }

  return { All: [] }
}

// ---------- UI tabs ----------
function renderTabs(cats) {
  const tabs = document.getElementById('tabs')
  if (!tabs) return
  tabs.innerHTML = ''

  cats.forEach((cat, i) => {
    const btn = document.createElement('button')
    btn.className = 'tab-btn'
    btn.setAttribute('role', 'tab')
    btn.setAttribute('aria-selected', i === 0 ? 'true' : 'false')
    btn.textContent = cat
    btn.addEventListener('click', () => selectCategory(cat, btn))
    tabs.appendChild(btn)
    if (i === 0) activeCat = cat
  })

  document.getElementById('btn-random').disabled = !activeCat
  document.getElementById('btn-copy').disabled   = true
  document.getElementById('btn-more').disabled   = true

  if (activeCat) getRandomQuote()
}

function selectCategory(cat, btn) {
  activeCat = cat
  document.querySelectorAll('.tab-btn').forEach(b => b.setAttribute('aria-selected', 'false'))
  btn.setAttribute('aria-selected', 'true')

  setText('quote-en', `หมวดหมู่: ${cat}`)
  setText('quote-th', '—')
  setText('quote-credit', '')
  document.getElementById('btn-random').disabled = false
  document.getElementById('btn-copy').disabled   = true
  document.getElementById('btn-more').disabled   = true

  isSwitchingCategory = true
  getRandomQuote().finally(() => { isSwitchingCategory = false })
}

// ---------- helpers ----------
function setText(id, text){
  const el = document.getElementById(id)
  if (el) el.textContent = text || ''
}
function getTransitionMs(el) {
  const s = getComputedStyle(el).transitionDuration.split(',').map(v => v.trim())
  const ms = s.map(v => v.endsWith('ms') ? parseFloat(v) : (parseFloat(v) * 1000))
  return Math.max(...ms, 0) || 300
}
function waitForTransition(el) {
  return new Promise(resolve => {
    let done = false
    const timeout = setTimeout(() => {
      if (!done) { done = true; el.removeEventListener('transitionend', onEnd); resolve() }
    }, getTransitionMs(el) + 50)
    function onEnd(e) {
      if (e.target === el && e.propertyName === 'opacity' && !done) {
        done = true; clearTimeout(timeout); el.removeEventListener('transitionend', onEnd); resolve()
      }
    }
    el.addEventListener('transitionend', onEnd)
  })
}

// ---------- static picking (deck, no-repeat) ----------
function shuffleInPlace(arr){
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
function ensureDeck(cat, poolLen){
  let deck = deckMap[cat]
  if (!Array.isArray(deck) || deck.length === 0) {
    deck = Array.from({length: poolLen}, (_, i) => i)
    shuffleInPlace(deck)
    deckMap[cat] = deck
  }
  return deck
}
function pickRandomLocal(cat) {
  if (!QUOTES_DB) return null
  const pool = QUOTES_DB[cat] && QUOTES_DB[cat].length
    ? QUOTES_DB[cat]
    : Object.values(QUOTES_DB).flat()

  const n = pool.length
  if (!n) return null

  let deck = ensureDeck(cat, n)
  let idx = deck.shift()

  if (n > 1) {
    const lastKey = lastKeyMap[cat]
    const firstKey = getQuoteKey(pool[idx])
    if (firstKey === lastKey && deck.length > 0) {
      const alt = deck.shift()
      deck.push(idx)
      idx = alt
    }
  }
  deckMap[cat] = deck
  const chosen = pool[idx]
  lastKeyMap[cat] = getQuoteKey(chosen)
  return chosen
}

// ---------- main ----------
async function getRandomQuote() {
  const randomBtn = document.getElementById('btn-random')
  const copyBtn   = document.getElementById('btn-copy')
  const moreBtn   = document.getElementById('btn-more')
  const lines     = document.getElementById('quote-lines')
  if (!lines) return

  try {
    if (inflightCtrl) inflightCtrl.abort()
    inflightCtrl = new AbortController()

    randomBtn.disabled = true
    if (!isSwitchingCategory) randomBtn.textContent = 'กำลังสุ่ม...'
    copyBtn.disabled = true
    moreBtn.disabled = true

    lines.classList.add('is-fading')
    void lines.offsetWidth

    let data = null

    if (USE_BACKEND) {
      const url = activeCat ? `api/random?cat=${encodeURIComponent(activeCat)}` : 'api/random'
      let d = await fetch(rel(url), { cache: 'no-store', signal: inflightCtrl.signal })
        .then(r => { if (!r.ok) throw new Error('Network error'); return r.json() })

      let q1 = normalizeQuote(d)
      const lastKey = lastKeyMap[activeCat]
      if (lastKey && getQuoteKey(q1) === lastKey) {
        try {
          const d2 = await fetch(rel(url), { cache: 'no-store', signal: inflightCtrl.signal })
            .then(r => { if (!r.ok) throw new Error('Network error'); return r.json() })
          const q2 = normalizeQuote(d2)
          if (getQuoteKey(q2) !== lastKey) {
            d = d2
            q1 = q2
          }
        } catch(_) {}
      }

      await waitForTransition(lines)
      data = q1
      lastKeyMap[activeCat] = getQuoteKey(data)

    } else {
      await waitForTransition(lines)
      const q = pickRandomLocal(activeCat)
      if (!q) throw new Error('No quote found in local DB')
      data = q
    }

    currentQuote = data = normalizeQuote(data)

    setText('quote-en', data.en ? '“' + data.en.trim() + '”' : '')
    setText('quote-th', (data.th || '').trim())
    setText('quote-credit', data.author ? `— ${data.author}${data.year ? ' ('+data.year+')' : ''}` : '')

    await new Promise(r => requestAnimationFrame(r))
    lines.classList.remove('is-fading')

    copyBtn.disabled = !(data.en)
    moreBtn.disabled = !(data.info || data.work || data.ref)
  } catch (err) {
    if (err.name !== 'AbortError') {
      setText('quote-en', 'มีบางอย่างผิดพลาด ลองอีกครั้งนะ')
      setText('quote-th', '')
      setText('quote-credit', '')
      await new Promise(r => requestAnimationFrame(r))
      lines.classList.remove('is-fading')
      console.error(err)
    }
  } finally {
    randomBtn.disabled = false
    randomBtn.textContent = 'สุ่มคำคม'
  }
}

async function copyQuote() {
  const en     = document.getElementById('quote-en')?.textContent || ''
  const th     = document.getElementById('quote-th')?.textContent || ''
  const credit = document.getElementById('quote-credit')?.textContent || ''
  const full   = [en, th, credit].filter(Boolean).join('\n')
  if (!full.trim()) return
  try {
    await navigator.clipboard.writeText(full)
    const btn = document.getElementById('btn-copy')
    const prev = btn.textContent
    btn.textContent = 'คัดลอกแล้ว ✓'
    btn.disabled = true
    setTimeout(() => { btn.textContent = prev; btn.disabled = false }, 800)
  } catch(e){ console.error(e) }
}

// ---------- more panel ----------
function openMore(){
  if (!currentQuote) return
  setText('more-work', currentQuote.work ? `ที่มา: ${currentQuote.work}` : '')
  setText('more-info', currentQuote.info || '')
  const refEl = document.getElementById('more-ref')
  if (refEl){
    if (currentQuote.ref){
      const url = String(currentQuote.ref)
      refEl.innerHTML = url.startsWith('http')
        ? `อ้างอิง: <a href="${url}" target="_blank" rel="noopener">${url}</a>`
        : `อ้างอิง: ${url}`
    } else {
      refEl.textContent = ''
    }
  }
  document.getElementById('more-panel')?.classList.add('active')
}
function closeMore(){
  document.getElementById('more-panel')?.classList.remove('active')
}

// ---------- bootstrap ----------
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-random')?.addEventListener('click', getRandomQuote)
  document.getElementById('btn-copy')  ?.addEventListener('click', copyQuote)
  document.getElementById('btn-more')  ?.addEventListener('click', openMore)
  document.getElementById('close-more')?.addEventListener('click', closeMore)
  document.getElementById('more-panel')?.addEventListener('click', (e)=>{ if(e.target.id==='more-panel') closeMore() })
  document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') closeMore() })

  fetchCategories().catch(() => {
    getRandomQuote()
  })
})

// ---------- theme toggle ----------
;(function(){
  const STORAGE_KEY = 'dq_theme'
  function applyTheme(theme){
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem(STORAGE_KEY, theme) } catch {}
  }
  function getInitialTheme(){
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'light' || saved === 'dark') return saved
    } catch {}
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'
  }
  function syncButton(btn, theme){
    const dark = theme === 'dark'
    btn.setAttribute('aria-pressed', String(dark))
    const label = dark ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'
    btn.title = label
    btn.setAttribute('aria-label', label)
  }
  function initThemeToggle(){
    const btn = document.getElementById('theme-toggle')
    if (!btn) return
    const initial = getInitialTheme()
    applyTheme(initial)
    syncButton(btn, initial)
    btn.addEventListener('click', () => {
      btn.classList.add('toggling')
      const current = document.documentElement.dataset.theme || 'light'
      const next = current === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      syncButton(btn, next)
      setTimeout(() => btn.classList.remove('toggling'), 250)
    })
  }
  document.addEventListener('DOMContentLoaded', initThemeToggle)
})()
