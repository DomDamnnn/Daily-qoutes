// static/js/main.js

let activeCat = null
let categories = []
let isSwitchingCategory = false
let currentQuote = null
let inflightCtrl = null   // กัน request ค้างถ้ากดรัว

// โหมดใช้งาน: ถ้ามี Backend จะเป็น true, ถ้าไม่มีจะใช้ quotes.json (static)
let USE_BACKEND = false
// ฐานข้อมูลคำคมเมื่อทำงานแบบ static
let QUOTES_DB = null  // รูปแบบ { [category: string]: Array<Quote> }

/* ------------------ utils: path & normalize ------------------ */
function rel(url) {
  // ใช้พาธ relative เสมอ เพื่อให้ทำงานได้บน GitHub Pages
  if (url.startsWith('/')) url = url.slice(1)
  if (!url.startsWith('./') && !url.startsWith('http') && !url.startsWith('api/')) {
    url = './' + url
  }
  return url
}

function normalizeQuote(q) {
  // รองรับคีย์ที่ต่างกัน เพื่อความทนทาน
  const en = (q.en ?? q.text ?? q.quote ?? '').toString()
  const th = (q.th ?? '').toString()
  const author = (q.author ?? q.by ?? '').toString()
  const year = (q.year ?? '').toString()
  const info = (q.info ?? q.description ?? '').toString()
  const work = (q.work ?? q.source ?? '').toString()
  const ref  = (q.ref ?? q.link ?? q.url ?? '').toString()
  return { en, th, author, year, info, work, ref }
}

/* ------------------ load categories ------------------ */
// พยายามใช้ backend ก่อน ถ้าไม่มีให้ fallback เป็น quotes.json
async function fetchCategories() {
  // 1) ลองถาม backend แบบ relative
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
  } catch (_) { /* ไม่มี backend ก็เงียบไว้ */ }

  // 2) fallback: โหลด quotes.json แล้วสรุปหมวดหมู่
  const db = await loadLocalQuotesDB()
  QUOTES_DB = db
  categories = Object.keys(db).sort()
  if (categories.length === 0) {
    // กรณีพิเศษมาก ๆ
    categories = ['All']
    QUOTES_DB = { All: [] }
  }
  renderTabs(categories)
}

async function loadLocalQuotesDB() {
  const res = await fetch(rel('quotes.json'), { cache: 'no-store' })
  if (!res.ok) throw new Error('load quotes.json failed')
  const data = await res.json()

  const bucket = {} // { cat: [quotes] }

  // กรณีเป็น Array ของ quotes
  if (Array.isArray(data)) {
    for (const raw of data) {
      const q = normalizeQuote(raw)
      // เด็ดหมวดจากหลายชื่อคีย์ที่เจอบ่อย
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

  // กรณีเป็น Object แบบ { "Courage": [...], "Learning":[...] }
  if (typeof data === 'object' && data) {
    const keys = Object.keys(data)
    for (const k of keys) {
      const arr = Array.isArray(data[k]) ? data[k] : []
      bucket[k] = arr.map(normalizeQuote)
    }
    return bucket
  }

  // ไม่รู้รูปแบบ ใส่ทั้งหมดไว้ All
  return { All: [] }
}

/* ------------------ render tabs ------------------ */
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

  // reset UI
  setText('quote-en', `หมวดหมู่: ${cat}`)
  setText('quote-th', '—')
  setText('quote-credit', '')
  document.getElementById('btn-random').disabled = false
  document.getElementById('btn-copy').disabled   = true
  document.getElementById('btn-more').disabled   = true

  isSwitchingCategory = true
  getRandomQuote().finally(() => { isSwitchingCategory = false })
}

/* ------------------ helpers ------------------ */
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

/* ------------------ pick random (static) ------------------ */
function pickRandomLocal(cat) {
  if (!QUOTES_DB) return null
  const pool = QUOTES_DB[cat] && QUOTES_DB[cat].length
    ? QUOTES_DB[cat]
    : Object.values(QUOTES_DB).flat()

  if (!pool.length) return null
  const idx = Math.floor(Math.random() * pool.length)
  return pool[idx]
}

/* ------------------ main ------------------ */
async function getRandomQuote() {
  const randomBtn = document.getElementById('btn-random')
  const copyBtn   = document.getElementById('btn-copy')
  const moreBtn   = document.getElementById('btn-more')
  const lines     = document.getElementById('quote-lines')
  if (!lines) return

  try {
    // ยกเลิก request ก่อนหน้า (ถ้ามี)
    if (inflightCtrl) inflightCtrl.abort()
    inflightCtrl = new AbortController()

    randomBtn.disabled = true
    if (!isSwitchingCategory) randomBtn.textContent = 'กำลังสุ่ม...'
    copyBtn.disabled = true
    moreBtn.disabled = true

    // fade-out
    lines.classList.add('is-fading')
    void lines.offsetWidth

    let data = null
    if (USE_BACKEND) {
      const url = activeCat ? `api/random?cat=${encodeURIComponent(activeCat)}` : 'api/random'
      const fetchPromise = fetch(rel(url), { cache: 'no-store', signal: inflightCtrl.signal })
        .then(r => { if (!r.ok) throw new Error('Network error'); return r.json() })
      const [d] = await Promise.all([fetchPromise, waitForTransition(lines)])
      data = d
    } else {
      // static mode
      await waitForTransition(lines)
      const q = pickRandomLocal(activeCat)
      if (!q) throw new Error('No quote found in local DB')
      data = q
    }

    currentQuote = data = normalizeQuote(data)

    // update content (รองรับ en/th หรือ text เดิม)
    setText('quote-en', data.en ? '“' + data.en.trim() + '”' : '')
    setText('quote-th', (data.th || '').trim())
    setText('quote-credit', data.author ? `— ${data.author}${data.year ? ' ('+data.year+')' : ''}` : '')

    // fade-in
    await new Promise(r => requestAnimationFrame(r))
    lines.classList.remove('is-fading')

    copyBtn.disabled = !(data.en)
    moreBtn.disabled = !(data.info || data.work || data.ref)
  } catch (err) {
    // ถ้าถูก abort จากการเปลี่ยนหมวด/กดรัว ให้เงียบ ๆ ไป
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

/* ------------------ More panel ------------------ */
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
    }else{
      refEl.textContent = ''
    }
  }
  document.getElementById('more-panel')?.classList.add('active')
}
function closeMore(){ document.getElementById('more-panel')?.classList.remove('active') }

/* ------------------ bootstrap ------------------ */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-random')?.addEventListener('click', getRandomQuote)
  document.getElementById('btn-copy')  ?.addEventListener('click', copyQuote)
  document.getElementById('btn-more')  ?.addEventListener('click', openMore)
  document.getElementById('close-more')?.addEventListener('click', closeMore)
  document.getElementById('more-panel')?.addEventListener('click', (e)=>{ if(e.target.id==='more-panel') closeMore() })
  document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') closeMore() })

  fetchCategories().catch((e) => {
    console.warn('fallback failed:', e)
    // สุดท้ายจริง ๆ ก็ยังพยายามสุ่มจาก local (ถ้าโหลดไม่สำเร็จจะ error เฉย ๆ)
    getRandomQuote()
  })
})

/* ---------- Theme Toggle (Light/Dark) ---------- */
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
