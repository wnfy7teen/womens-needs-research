import { useEffect, useMemo, useState } from 'react'
import './styles.css'

type Option = { id: string; value: string; label: string; position: number }
type Question = {
  id: string; section_id: string; slug: string; prompt: string; help_text?: string | null
  question_type: string; is_required: boolean; allow_other: boolean; position: number
  config: Record<string, unknown>; options: Option[]
}
type Section = { id: string; slug: string; title: string; description?: string; position: number }
type Survey = { sections: Section[]; questions: Question[]; consentVersion: string }
type Answer = string | string[] | number

const API = import.meta.env.VITE_SURVEY_FUNCTION_URL as string
const headers = { 'Content-Type': ' application/json' }

async function request(path: string, body?: unknown) {
  const response = await fetch(API, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Не удалось связаться с сервером')
  return data
}

function App() {
  const [survey, setSurvey] = useState<Survey | null>(null)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [submissionId, setSubmissionId] = useState('')
  const [sectionIndex, setSectionIndex] = useState(0)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [screen, setScreen] = useState<'intro'|'survey'|'done'>('intro')
  const [consent, setConsent] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    request('').then(setSurvey).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  const sections = survey?.sections ?? []
  const currentSection = sections[sectionIndex]
  const sectionQuestions = useMemo(
    () => survey?.questions.filter(q => q.section_id === currentSection?.id).sort((a,b)=>a.position-b.position) ?? [],
    [survey, currentSection]
  )
  const currentQuestion = sectionQuestions[questionIndex]
  const totalQuestions = survey?.questions.length ?? 35
  const answeredCount = survey?.questions.filter(q => {
    const a = answers[q.id]
    return Array.isArray(a) ? a.length > 0 : a !== undefined && String(a).trim() !== ''
  }).length ?? 0
  const progress = totalQuestions ? Math.round(answeredCount / totalQuestions * 100) : 0

  function setAnswer(id: string, value: Answer) {
    setAnswers(prev => ({...prev, [id]: value}))
  }

  async function start() {
    if (!consent) return
    setBusy(true); setError('')
    try {
      const data = await request('', {action:'start', consent:true, locale:'ru'})
      setSubmissionId(data.submissionId)
      setScreen('survey')
    } catch(e) { setError(e instanceof Error ? e.message : 'Ошибка запуска') }
    finally { setBusy(false) }
  }

  async function saveCurrent() {
    if (!currentQuestion) return true
    const value = answers[currentQuestion.id]
    const empty = value === undefined || (Array.isArray(value) ? value.length === 0 : String(value).trim() === '')
    if (currentQuestion.is_required && empty) {
      setError('Пожалуйста, ответьте на этот обязательный вопрос.')
      return false
    }
    if (empty) return true
    try {
      await request('', {action:'save', submissionId, questionId:currentQuestion.id, answer:value})
      return true
    } catch(e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить ответ')
      return false
    }
  }

  async function next() {
    setError('')
    setBusy(true)
    try {
      if (!(await saveCurrent())) return
      if (questionIndex < sectionQuestions.length - 1) {
        setQuestionIndex(i => i + 1)
      } else if (sectionIndex < sections.length - 1) {
        setSectionIndex(i => i + 1)
        setQuestionIndex(0)
      } else {
        const result = await request('', {action:'complete', submissionId})
        if (result.completed) setScreen('done')
      }
    } catch(e) { setError(e instanceof Error ? e.message : 'Ошибка сохранения') }
    finally { setBusy(false) }
  }

  async function back() {
    setError('')
    if (questionIndex > 0) setQuestionIndex(i => i - 1)
    else if (sectionIndex > 0) {
      setSectionIndex(i => i - 1)
      const prev = sections[sectionIndex - 1]
      const prevQs = survey?.questions.filter(q => q.section_id === prev.id) ?? []
      setQuestionIndex(Math.max(0, prevQs.length - 1))
    } else setScreen('intro')
  }

  if (loading) return <main className="shell centered"><div className="loader"/><p>Загружаем исследование…</p></main>
  if (!survey) return <main className="shell centered"><div className="brand-mark">W</div><h1>Не удалось загрузить опрос</h1><p className="muted">{error || 'Проверьте подключение и попробуйте снова.'}</p><button onClick={()=>location.reload()}>Повторить</button></main>

  return <main className="shell">
    <header className="topbar"><div className="brand"><div className="brand-mark">W</div><span>WOMEN'S NEEDS RESEARCH</span></div><span className="privacy">Анонимно · 5–8 минут</span></header>
    {screen === 'intro' && <section className="intro panel">
      <div className="eyebrow">АНОНИМНОЕ ИССЛЕДОВАНИЕ · 18–35 ЛЕТ</div>
      <h1>Что действительно<br/><em>важно для вас?</em></h1>
      <p className="lead">Мы изучаем повседневные потребности женщин, чтобы найти идеи продуктов и сервисов, которые решают реальные проблемы.</p>
      <div className="facts"><div><strong>35</strong><span>вопросов</span></div><div><strong>7</strong><span>коротких тем</span></div><div><strong>5–8</strong><span>минут</span></div></div>
      <div className="consent"><input id="consent" type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><label htmlFor="consent">Я добровольно соглашаюсь принять участие в анонимном исследовании. Понимаю, что могу прекратить участие в любой момент. Не буду указывать ФИО, контакты и другие персональные данные в открытых ответах.</label></div>
      <button className="primary wide" disabled={!consent || busy} onClick={start}>{busy?'Подготавливаем…':'Начать исследование'} <span>→</span></button>
      {error && <p className="error">{error}</p>}
      <p className="footnote">Ответы используются только в обобщённом виде для исследовательских целей. Telegram ID не записывается в анкету.</p>
    </section>}
    {screen === 'survey' && currentQuestion && <section className="survey">
      <div className="progress-head"><span>РАЗДЕЛ {sectionIndex+1} ИЗ {sections.length}</span><span>{answeredCount} / {totalQuestions} отвечено</span></div>
      <div className="progress-track"><div style={{width:`${progress}%`}}/></div>
      <div className="section-meta"><span className="section-number">0{sectionIndex+1}</span><div><h2>{currentSection.title}</h2><p>{currentSection.description}</p></div></div>
      <article className="question-card">
        <div className="question-meta">ВОПРОС {survey.questions.findIndex(q=>q.id===currentQuestion.id)+1} ИЗ {totalQuestions} {currentQuestion.is_required && <span>· ОБЯЗАТЕЛЬНЫЙ</span>}</div>
        <h3>{currentQuestion.prompt}</h3>
        {currentQuestion.help_text && <p className="muted">{currentQuestion.help_text}</p>}
        <AnswerInput question={currentQuestion} value={answers[currentQuestion.id]} onChange={v=>setAnswer(currentQuestion.id,v)}/>
      </article>
      {error && <p className="error">{error}</p>}
      <div className="nav-actions"><button className="secondary" onClick={back} disabled={busy}>Назад</button><button className="primary" onClick={next} disabled={busy}>{busy?'Сохраняем…':sectionIndex===sections.length-1 && questionIndex===sectionQuestions.length-1?'Завершить':'Продолжить'} <span>→</span></button></div>
      <p className="save-note">Ответ сохраняется при переходе к следующему вопросу.</p>
    </section>}
    {screen === 'done' && <section className="done panel"><div className="success-icon">✓</div><div className="eyebrow">ИССЛЕДОВАНИЕ ЗАВЕРШЕНО</div><h1>Спасибо за ваше<br/><em>время и честность.</em></h1><p className="lead">Ваши ответы помогут лучше понять реальные потребности и найти идеи полезных решений.</p><p className="footnote">Анкета отправлена. Вы можете закрыть это окно.</p></section>}
    <footer>© 2026 WOMEN'S NEEDS RESEARCH <span>Создано для изучения реальных потребностей</span></footer>
  </main>
}

function AnswerInput({question, value, onChange}:{question:Question,value:Answer|undefined,onChange:(v:Answer)=>void}) {
  const type = question.question_type
  if (type === 'textarea' || type === 'text') return <textarea rows={type==='text'?2:4} maxLength={4000} placeholder="Ваш ответ…" value={typeof value==='string'?value:''} onChange={e=>onChange(e.target.value)}/>
  if (type === 'number') return <input type="number" value={typeof value==='number'?value:''} onChange={e=>onChange(Number(e.target.value))}/>
  if (type === 'scale') {
    const min = Number(question.config.min ?? 1), max = Number(question.config.max ?? 5)
    return <div className="scale">{Array.from({length:max-min+1},(_,i)=>min+i).map(n=><button key={n} className={value===n?'selected':''} onClick={()=>onChange(n)}>{n}</button>)}<div className="scale-labels"><span>Совсем не влияет</span><span>Очень сильно</span></div></div>
  }
  if (type === 'multiple_choice') {
    const selected = Array.isArray(value)?value:[]
    return <div className="options">{question.options.map(o=><label className={`option ${selected.includes(o.value)?'active':''}`} key={o.id}><input type="checkbox" checked={selected.includes(o.value)} onChange={e=>onChange(e.target.checked?[...selected,o.value]:selected.filter(v=>v!==o.value))}/><span>{o.label}</span><i>{selected.includes(o.value)?'✓':''}</i></label>)}</div>
  }
  if (type === 'country') return <input className="text-input" placeholder="Например, Нидерланды" value={typeof value==='string'?value:''} onChange={e=>onChange(e.target.value)}/>
  return <div className="options">{question.options.map(o=><label className={`option ${value===o.value?'active':''}`} key={o.id}><input type="radio" name={question.id} checked={value===o.value} onChange={()=>onChange(o.value)}/><span>{o.label}</span><i>{value===o.value?'✓':''}</i></label>)}</div>
}

export default App
