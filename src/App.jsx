import { useEffect, useMemo, useRef, useState } from 'react'

const LS_KEY = 't-budget-v1'

const DEFAULT_CATS = [
  { id: 'loyer', name: 'Loyer', color: '#C0392B', budget: 0 },
  { id: 'course', name: 'Courses', color: '#1E8449', budget: 0 },
  { id: 'loisirs', name: 'Loisirs', color: '#1F618D', budget: 0 },
  { id: 'invest', name: 'Investissements / Épargne', color: '#CA6F1E', budget: 0 },
]

const PALETTE = ['#C0392B', '#1E8449', '#1F618D', '#CA6F1E', '#7D3C98', '#117A8B', '#B7950B', '#5D6D7E']

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

const shiftMonth = (key, delta) => {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return monthKey(d)
}

const fmt = (n) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) { /* ignore */ }
  return null
}

/* Compress a picked image to keep localStorage small */
function compressImage(file, maxW = 700, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = reject
      img.src = reader.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/* ---------- Pie chart: equal slices per category, each filled radially by spent/budget ---------- */
function Pie({ cats, spentByCat, size = 340 }) {
  const cx = size / 2, cy = size / 2
  const R = size / 2 - 6
  const n = cats.length
  if (n === 0) return null

  const polar = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]

  const slicePath = (r, a0, a1) => {
    const [x0, y0] = polar(r, a0)
    const [x1, y1] = polar(r, a1)
    const large = a1 - a0 > Math.PI ? 1 : 0
    return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`
  }

  const fullCircle = n === 1

  return (
    <svg viewBox={`0 0 ${size} ${size}`}>
      {cats.map((c, i) => {
        const a0 = -Math.PI / 2 + (i / n) * 2 * Math.PI
        const a1 = -Math.PI / 2 + ((i + 1) / n) * 2 * Math.PI
        const ratio = c.budget > 0 ? Math.min(1, (spentByCat[c.id] || 0) / c.budget) : 0
        const r = R * Math.sqrt(ratio) // sqrt => surface remplie proportionnelle
        const over = c.budget > 0 && (spentByCat[c.id] || 0) > c.budget
        return (
          <g key={c.id}>
            {fullCircle ? (
              <>
                <circle cx={cx} cy={cy} r={R} fill={c.color} opacity="0.16" stroke={c.color} strokeWidth="1.5" />
                {r > 0 && <circle cx={cx} cy={cy} r={r} fill={c.color} opacity="0.9" />}
              </>
            ) : (
              <>
                <path d={slicePath(R, a0, a1)} fill={c.color} opacity="0.16" stroke={c.color} strokeWidth="1.5" />
                {r > 0 && <path d={slicePath(r, a0, a1)} fill={c.color} opacity="0.9" />}
              </>
            )}
            {over && !fullCircle && (
              <path d={slicePath(R, a0, a1)} fill="none" stroke={c.color} strokeWidth="4" />
            )}
            {over && fullCircle && (
              <circle cx={cx} cy={cy} r={R} fill="none" stroke={c.color} strokeWidth="4" />
            )}
          </g>
        )
      })}
      {/* séparateurs */}
      {!fullCircle && cats.map((c, i) => {
        const a = -Math.PI / 2 + (i / n) * 2 * Math.PI
        const [x, y] = polar(R, a)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#EFE8DC" strokeWidth="2" />
      })}
    </svg>
  )
}

export default function App() {
  const [state, setState] = useState(() => loadState())
  const [viewMonth, setViewMonth] = useState(monthKey())
  const [menuOpen, setMenuOpen] = useState(false)
  const [showCatModal, setShowCatModal] = useState(false)
  const [showExpModal, setShowExpModal] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [editCat, setEditCat] = useState(null)
  const [fullImg, setFullImg] = useState(null)

  // expense form
  const [expPhoto, setExpPhoto] = useState(null)
  const [expAmount, setExpAmount] = useState('')
  const [expCat, setExpCat] = useState('')
  const [expName, setExpName] = useState('')

  // category form
  const [catName, setCatName] = useState('')
  const [catBudget, setCatBudget] = useState('')
  const [catColor, setCatColor] = useState(PALETTE[4])

  // onboarding
  const [onboardAmount, setOnboardAmount] = useState('')

  const cameraRef = useRef(null)
  const libraryRef = useRef(null)

  useEffect(() => {
    if (state) localStorage.setItem(LS_KEY, JSON.stringify(state))
  }, [state])

  const expenses = state?.expenses?.[viewMonth] || []

  const spentByCat = useMemo(() => {
    const acc = {}
    for (const e of expenses) acc[e.catId] = (acc[e.catId] || 0) + e.amount
    return acc
  }, [expenses])

  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0)

  /* ---------- Onboarding ---------- */
  if (!state) {
    return (
      <div className="onboard">
        <div className="t-big">T</div>
        <h1>Bienvenue</h1>
        <p>Combien as-tu à budgéter ce mois-ci&nbsp;? Tu répartiras ensuite cette somme entre tes catégories.</p>
        <input
          type="number"
          inputMode="decimal"
          placeholder="3000"
          value={onboardAmount}
          onChange={(e) => setOnboardAmount(e.target.value)}
        />
        <button
          className="btn btn-primary"
          onClick={() => {
            const v = parseFloat(onboardAmount)
            if (!v || v <= 0) return
            setState({ totalBudget: v, categories: DEFAULT_CATS, expenses: {} })
          }}
        >
          Commencer
        </button>
      </div>
    )
  }

  const cats = state.categories

  const saveCat = () => {
    const b = parseFloat(catBudget) || 0
    if (!catName.trim()) return
    if (editCat) {
      setState({
        ...state,
        categories: cats.map((c) => (c.id === editCat ? { ...c, name: catName.trim(), budget: b, color: catColor } : c)),
      })
    } else {
      setState({
        ...state,
        categories: [...cats, { id: 'c' + Date.now(), name: catName.trim(), budget: b, color: catColor }],
      })
    }
    closeCatModal()
  }

  const openCatModal = (cat = null) => {
    setMenuOpen(false)
    if (cat) {
      setEditCat(cat.id); setCatName(cat.name); setCatBudget(cat.budget ? String(cat.budget) : ''); setCatColor(cat.color)
    } else {
      setEditCat(null); setCatName(''); setCatBudget(''); setCatColor(PALETTE[4])
    }
    setShowCatModal(true)
  }

  const closeCatModal = () => { setShowCatModal(false); setEditCat(null) }

  const deleteCat = (id) => {
    if (!confirm('Supprimer cette catégorie ? Les dépenses associées seront aussi supprimées.')) return
    const newExpenses = {}
    for (const [k, list] of Object.entries(state.expenses)) newExpenses[k] = list.filter((e) => e.catId !== id)
    setState({ ...state, categories: cats.filter((c) => c.id !== id), expenses: newExpenses })
  }

  const openExpModal = () => {
    setMenuOpen(false)
    setExpPhoto(null); setExpAmount(''); setExpName(''); setExpCat(cats[0]?.id || '')
    setShowExpModal(true)
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const dataUrl = await compressImage(file)
      setExpPhoto(dataUrl)
    } catch { alert("Impossible de lire cette image.") }
  }

  const saveExpense = () => {
    const v = parseFloat(String(expAmount).replace(',', '.'))
    if (!v || v <= 0 || !expCat) return
    const entry = {
      id: 'e' + Date.now(),
      catId: expCat,
      amount: v,
      name: expName.trim() || 'Ticket',
      date: new Date().toISOString(),
      photo: expPhoto || null,
    }
    const mk = viewMonth
    setState({ ...state, expenses: { ...state.expenses, [mk]: [...(state.expenses[mk] || []), entry] } })
    setShowExpModal(false)
  }

  const deleteExpense = (id) => {
    setState({ ...state, expenses: { ...state.expenses, [viewMonth]: expenses.filter((e) => e.id !== id) } })
  }

  const resetAll = () => {
    localStorage.removeItem(LS_KEY)
    setState(null)
    setShowResetModal(false)
    setViewMonth(monthKey())
    setOnboardAmount('')
  }

  const saved = state.totalBudget - totalSpent
  const isCurrentMonth = viewMonth === monthKey()
  const allocated = cats.reduce((s, c) => s + (c.budget || 0), 0)

  return (
    <div className="app">
      <div className="header">
        <div className="logo"><span className="t-mark">T</span>Budget</div>
        <div className="month-nav">
          <button onClick={() => setViewMonth(shiftMonth(viewMonth, -1))}>‹</button>
          <span className="month-label">{monthLabel(viewMonth)}</span>
          <button onClick={() => setViewMonth(shiftMonth(viewMonth, 1))}>›</button>
        </div>
      </div>

      <div className="chart-wrap">
        <Pie cats={cats} spentByCat={spentByCat} />
      </div>

      <div className="center-info">
        <div className="big">{fmt(totalSpent)}</div>
        <div className="sub">dépensés sur {fmt(state.totalBudget)}</div>
        {allocated > state.totalBudget && (
          <div className="sub" style={{ color: 'var(--red)' }}>
            Attention : tes budgets par catégorie ({fmt(allocated)}) dépassent ton budget total.
          </div>
        )}
      </div>

      <div className="add-zone">
        <button className="add-btn" onClick={() => setMenuOpen(!menuOpen)}>+</button>
        {menuOpen && (
          <div className="menu">
            <button onClick={() => openCatModal()}>Ajouter une catégorie</button>
            <button onClick={openExpModal}>Ajouter un ticket de caisse</button>
          </div>
        )}
      </div>

      <div className="cats">
        {cats.map((c) => {
          const spent = spentByCat[c.id] || 0
          const pct = c.budget > 0 ? Math.min(100, (spent / c.budget) * 100) : 0
          const over = c.budget > 0 && spent > c.budget
          return (
            <div className="cat-row" key={c.id}>
              <div className="dot" style={{ background: c.color }} />
              <div className="cat-main">
                <div className="cat-name">{c.name}</div>
                <div className="cat-amounts">
                  {fmt(spent)} / {c.budget > 0 ? fmt(c.budget) : 'budget non défini'}
                  {over && <span style={{ color: 'var(--red)' }}> — dépassé</span>}
                </div>
                <div className="bar"><div style={{ width: pct + '%', background: c.color }} /></div>
              </div>
              <div className="cat-actions">
                <button className="icon-btn" onClick={() => openCatModal(c)}>Modifier</button>
                <button className="icon-btn" onClick={() => deleteCat(c.id)}>✕</button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="summary">
        <div className="label">{isCurrentMonth ? 'ÉCONOMISÉ POUR L’INSTANT CE MOIS-CI' : 'ÉCONOMISÉ SUR ' + monthLabel(viewMonth).toUpperCase()}</div>
        <div className={'value ' + (saved >= 0 ? 'positive' : 'negative')}>{fmt(saved)}</div>
        <div className="note">
          {saved >= 0
            ? `Sur ${fmt(state.totalBudget)} de budget, tu as dépensé ${fmt(totalSpent)}.`
            : `Tu as dépassé ton budget de ${fmt(Math.abs(saved))}.`}
        </div>
      </div>

      {expenses.length > 0 && (
        <div className="expenses">
          <h3>DÉPENSES — {monthLabel(viewMonth).toUpperCase()}</h3>
          {[...expenses].reverse().map((e) => {
            const cat = cats.find((c) => c.id === e.catId)
            return (
              <div className="exp-row" key={e.id}>
                <span className="date">{new Date(e.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</span>
                <span className="dot" style={{ background: cat?.color || '#999' }} />
                <span className="name">{e.name}</span>
                {e.photo && <img className="exp-thumb" src={e.photo} alt="ticket" onClick={() => setFullImg(e.photo)} />}
                <span className="amount">{fmt(e.amount)}</span>
                <button className="exp-del" onClick={() => deleteExpense(e.id)}>✕</button>
              </div>
            )
          })}
        </div>
      )}

      <div className="footer-actions">
        <button className="reset-btn" onClick={() => setShowResetModal(true)}>Réinitialiser mon budget</button>
      </div>

      {/* ---------- Modal catégorie ---------- */}
      {showCatModal && (
        <div className="overlay" onClick={closeCatModal}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>{editCat ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</h2>
            <div className="field">
              <label>Nom</label>
              <input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Ex : Transport" />
            </div>
            <div className="field">
              <label>Budget mensuel (€)</label>
              <input type="number" inputMode="decimal" value={catBudget} onChange={(e) => setCatBudget(e.target.value)} placeholder="250" />
            </div>
            <div className="field">
              <label>Couleur</label>
              <div className="color-row">
                {PALETTE.map((col) => (
                  <button key={col} className={'color-swatch' + (catColor === col ? ' sel' : '')} style={{ background: col }} onClick={() => setCatColor(col)} />
                ))}
              </div>
            </div>
            <div className="sheet-actions">
              <button className="btn btn-ghost" onClick={closeCatModal}>Annuler</button>
              <button className="btn btn-primary" onClick={saveCat}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Modal ticket ---------- */}
      {showExpModal && (
        <div className="overlay" onClick={() => setShowExpModal(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Ajouter un ticket de caisse</h2>

            {expPhoto && <img className="photo-preview" src={expPhoto} alt="ticket" />}
            <div className="photo-pick">
              <button className="btn btn-ghost" onClick={() => cameraRef.current?.click()}>📷 Appareil photo</button>
              <button className="btn btn-ghost" onClick={() => libraryRef.current?.click()}>🖼 Photothèque</button>
            </div>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />
            <input ref={libraryRef} type="file" accept="image/*" hidden onChange={handleFile} />

            <div className="field">
              <label>Montant (€)</label>
              <input type="number" inputMode="decimal" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} placeholder="42.90" />
            </div>
            <div className="field">
              <label>Catégorie</label>
              <select value={expCat} onChange={(e) => setExpCat(e.target.value)}>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Note (facultatif)</label>
              <input value={expName} onChange={(e) => setExpName(e.target.value)} placeholder="Ex : Carrefour" />
            </div>

            <div className="sheet-actions">
              <button className="btn btn-ghost" onClick={() => setShowExpModal(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={saveExpense}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Modal reset ---------- */}
      {showResetModal && (
        <div className="overlay" onClick={() => setShowResetModal(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Réinitialiser mon budget</h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: 15, marginBottom: 8 }}>
              Cela effacera ton budget, tes catégories et tout ton historique de dépenses, pour repartir de zéro.
            </p>
            <div className="sheet-actions">
              <button className="btn btn-ghost" onClick={() => setShowResetModal(false)}>Annuler</button>
              <button className="btn btn-primary" style={{ background: 'var(--red)', borderColor: 'var(--red)' }} onClick={resetAll}>Tout réinitialiser</button>
            </div>
          </div>
        </div>
      )}

      {fullImg && (
        <div className="fullimg-overlay" onClick={() => setFullImg(null)}>
          <img src={fullImg} alt="ticket" />
        </div>
      )}
    </div>
  )
}
