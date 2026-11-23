import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient, type Session } from '@supabase/supabase-js'

const supabase = createClient(
  'https://mqxuhbbthshjuetbjxbh.supabase.co',
  'sb_publishable__aqTmFrbXdSBnoDkTeumyw_RaZGhdWg',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
)

type Submission = { id: string; status: string; locale: string; created_at: string; started_at: string; completed_at: string | null }
type Question = { id: string; prompt: string; slug: string; section_id: string; position: number }
type Answer = { submission_id: string; question_id: string; answer: unknown; created_at: string }
type Section = { id: string; title: string; position: number }

const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—'
const answerLabel = (value: unknown) => Array.isArray(value) ? value.join(', ') : typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '—')
const pretty = (value: string) => value.replace(/_/g, ' ').replace(/^./, c => c.toLocaleUpperCase('ru'))

export default function Admin() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [email, setEmail] = useState('usdtuser1@proton.me')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    const code = params.get('error_code')
    if (code === 'otp_expired') return 'Ссылка для входа уже недействительна или была открыта ранее. Запроси новую ссылку и открой её один раз.'
    if (params.get('error')) return params.get('error_description') || 'Не удалось выполнить вход. Запроси новую ссылку.'
    return ''
  })
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [answers, setAnswers] = useState<Answer[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) { setIsAdmin(false); return }
    let alive = true
    supabase.from('admin_users').select('user_id').eq('user_id', session.user.id).maybeSingle()
      .then(({ data, error: queryError }) => {
        if (!alive) return
        setIsAdmin(Boolean(data))
        if (queryError) setError(queryError.message)
        else if (!data) setError('У этого аккаунта нет прав администратора.')
      })
    return () => { alive = false }
  }, [session])

  const load = useCallback(async () => {
    if (!isAdmin) return
    setError('')
    const [s, q, sec, a] = await Promise.all([
      supabase.from('survey_submissions').select('id,status,locale,created_at,started_at,completed_at').order('created_at', { ascending: false }).limit(500),
      supabase.from('survey_questions').select('id,prompt,slug,section_id,position').order('position'),
      supabase.from('survey_sections').select('id,title,position').order('position'),
      supabase.from('survey_answers').select('submission_id,question_id,answer,created_at').order('created_at', { ascending: false }).limit(10000)
    ])
    const failed = [s.error, q.error, sec.error, a.error].find(Boolean)
    if (failed) { setError(failed.message); return }
    setSubmissions(s.data ?? [])
    setQuestions(q.data ?? [])
    setSections(sec.data ?? [])
    setAnswers(a.data ?? [])
    setUpdatedAt(new Date())
  }, [isAdmin])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!isAdmin) return
    const channel = supabase.channel('wnr-admin-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'survey_submissions' }, () => { void load() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'survey_answers' }, () => { void load() })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [isAdmin, load])

  const stats = useMemo(() => ({
    total: submissions.length,
    completed: submissions.filter(x => x.status === 'completed').length,
    active: submissions.filter(x => x.status === 'in_progress').length,
    abandoned: submissions.filter(x => x.status === 'abandoned').length,
    answers: answers.length,
    withAnswers: new Set(answers.map(x => x.submission_id)).size
  }), [submissions, answers])

  const questionById = useMemo(() => new Map(questions.map(q => [q.id, q])), [questions])
  const sectionById = useMemo(() => new Map(sections.map(s => [s.id, s.title])), [sections])
  const filtered = submissions.filter(s => (filter === 'all' || s.status === filter) &&
    (s.id.toLowerCase().includes(search.toLowerCase()) || s.locale.toLowerCase().includes(search.toLowerCase())))
  const selectedSubmission = submissions.find(s => s.id === selected)
  const selectedAnswers = answers.filter(a => a.submission_id === selected).sort((a,b) => (questionById.get(a.question_id)?.position ?? 0) - (questionById.get(b.question_id)?.position ?? 0))

  const distribution = (slug: string) => {
    const question = questions.find(q => q.slug === slug)
    if (!question) return []
    const counts = new Map<string, number>()
    answers.filter(a => a.question_id === question.id).forEach(a => {
      const values = Array.isArray(a.answer) ? a.answer : [a.answer]
      values.forEach(v => { const label = pretty(String(v)); counts.set(label, (counts.get(label) ?? 0) + 1) })
    })
    return [...counts.entries()].sort((a,b) => b[1]-a[1]).slice(0,6)
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    })
    setBusy(false)
    if (authError) setError('Не удалось войти. Проверь email и пароль.')
    else setPassword('')
  }

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
    setIsAdmin(false)
    setPassword('')
  }
  function exportCsv() {
    const rows = [['submission_id','status','question','answer','created_at'], ...answers.map(a => [
      a.submission_id, submissions.find(s => s.id === a.submission_id)?.status ?? '',
      questionById.get(a.question_id)?.prompt ?? a.question_id, answerLabel(a.answer), a.created_at
    ])]
    const csv = rows.map(row => row.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = 'wnr-responses.csv'; link.click(); URL.revokeObjectURL(url)
  }

  if (!authReady) return <main className="admin-page"><div className="admin-loading">Загружаем панель…</div></main>
  if (!session) return <main className="admin-page"><section className="admin-login">
    <div className="admin-brand"><span>W</span><div><b>WNR</b><small>ADMINISTRATION</small></div></div>
    <p className="admin-kicker">ЗАКРЫТЫЙ ДОСТУП</p><h1>Панель<br/><em>исследования.</em></h1>
    <p className="admin-muted">Войди в закрытую панель исследования с помощью пароля администратора.</p>
    <form onSubmit={signIn}>
      <label htmlFor="admin-email">Электронная почта</label>
      <input id="admin-email" type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/>
      <label htmlFor="admin-password">Пароль</label>
      <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/>
      <button disabled={busy || !email.trim() || !password}>{busy ? 'Входим…' : 'Войти в панель'} <span>→</span></button>
    </form>
    {error && <p className="admin-error">{error}</p>}
    <a className="admin-back" href="/">← Вернуться к опросу</a>
  </section></main>
  if (!isAdmin) return <main className="admin-page"><section className="admin-login"><div className="admin-brand"><span>W</span><b>WNR ADMIN</b></div><h1>Нет доступа.</h1><p className="admin-muted">{error || 'Проверяем права администратора…'}</p><button onClick={signOut}>Выйти</button></section></main>

  return <main className="admin-page">
    <header className="admin-header"><a className="admin-brand" href="/"><span>W</span><div><b>WNR</b><small>RESEARCH DASHBOARD</small></div></a><div className="admin-header-actions"><span className="live-dot">LIVE · {updatedAt ? dateLabel(updatedAt.toISOString()) : 'подключение'}</span><button className="admin-quiet" onClick={()=>void load()}>Обновить</button><button className="admin-quiet" onClick={signOut}>Выйти</button></div></header>
    <section className="admin-intro"><div><p className="admin-kicker">WOMEN'S NEEDS RESEARCH</p><h1>Обзор <em>исследования.</em></h1><p className="admin-muted">Данные обновляются автоматически при поступлении новых ответов.</p></div><button className="admin-export" onClick={exportCsv}>Экспорт ответов CSV ↓</button></section>
    {error && <p className="admin-error">{error}</p>}
    <section className="admin-stats">
      <article><small>ВСЕ ПРОХОЖДЕНИЯ</small><strong>{stats.total}</strong><span>Всего начато</span></article>
      <article><small>ЗАВЕРШЕНО</small><strong>{stats.completed}</strong><span>Статус completed</span></article>
      <article><small>В ПРОЦЕССЕ</small><strong>{stats.active}</strong><span>Не завершено</span></article>
      <article><small>ОТВЕТЫ</small><strong>{stats.answers}</strong><span>{stats.withAnswers} анкет с ответами</span></article>
    </section>
    <section className="admin-grid">
      <div className="admin-panel admin-list-panel"><div className="admin-panel-head"><div><h2>Прохождения</h2><p>Последние отправки и текущие сессии</p></div><span>{filtered.length}</span></div>
        <div className="admin-filters"><input placeholder="Найти по ID…" value={search} onChange={e=>setSearch(e.target.value)}/><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Все статусы</option><option value="completed">Завершённые</option><option value="in_progress">В процессе</option><option value="abandoned">Прерванные</option></select></div>
        <div className="admin-submissions">{filtered.map(s=><button key={s.id} className={'admin-submission '+(selected===s.id?'chosen':'')} onClick={()=>setSelected(s.id)}><span className={'status-dot '+s.status}/><span className="submission-main"><b>{s.id.slice(0,8)}…</b><small>{dateLabel(s.created_at)}</small></span><span className="submission-status">{s.status==='completed'?'Завершена':s.status==='in_progress'?'В процессе':'Прервана'}</span><span className="submission-count">{answers.filter(a=>a.submission_id===s.id).length} отв.</span></button>)}{!filtered.length && <p className="admin-empty">Ничего не найдено</p>}</div>
      </div>
      <div className="admin-panel admin-detail-panel"><div className="admin-panel-head"><div><h2>{selectedSubmission ? 'Ответы анкеты' : 'Детали прохождения'}</h2><p>{selectedSubmission ? selectedSubmission.id : 'Выбери прохождение слева'}</p></div></div>
        {selectedSubmission ? <><div className="detail-meta"><span>{selectedSubmission.status}</span><span>Начата: {dateLabel(selectedSubmission.started_at || selectedSubmission.created_at)}</span><span>Завершена: {dateLabel(selectedSubmission.completed_at)}</span></div><div className="admin-answers">{selectedAnswers.map(a=>{const q=questionById.get(a.question_id);return <article key={a.question_id}><small>{sectionById.get(q?.section_id ?? '') ?? 'ВОПРОС'} · {q?.slug ?? ''}</small><h3>{q?.prompt ?? 'Вопрос удалён'}</h3><p>{answerLabel(a.answer)}</p></article>})}{!selectedAnswers.length && <p className="admin-empty">Ответов пока нет</p>}</div></> : <div className="admin-placeholder">Выбери анкету, чтобы посмотреть её ответы и статус.</div>}
      </div>
    </section>
    <section className="admin-analytics"><div className="admin-panel-head"><div><h2>Быстрые срезы</h2><p>Частота выбранных вариантов по сохранённым ответам</p></div></div><div className="analytics-grid">{[['age','Возраст'],['country','Страна'],['difficulty_frequency','Частота трудностей'],['price_range','Приемлемая цена']].map(([slug,title])=><article className="admin-panel analytics-card" key={slug}><h3>{title}</h3>{distribution(slug).map(([label,count])=><div className="bar-row" key={label}><span>{label}</span><div><i style={{width: (count/Math.max(1,...distribution(slug).map(x=>x[1]))*100)+'%'}}/></div><b>{count}</b></div>)}{!distribution(slug).length && <p className="admin-empty">Пока недостаточно данных</p>}</article>)}</div></section>
    <footer className="admin-footer">WNR · PRIVATE ADMIN AREA <span>Realtime subscription active</span></footer>
  </main>
}
