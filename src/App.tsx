import { useEffect, useMemo, useState } from 'react'
import './styles.css'
import { loadEuroRates, localPriceLabel, resolveCurrency } from './currency'

type Option = { id: string; value: string; label: string; position: number }
type Question = {
  id: string; section_id: string; slug: string; prompt: string; help_text?: string | null
  question_type: string; is_required: boolean; allow_other: boolean; position: number
  config: Record<string, unknown>; options: Option[]
}
type Section = { id: string; slug: string; title: string; description?: string; position: number }
type Survey = { sections: Section[]; questions: Question[]; consentVersion: string; intro?: string }
type Answer = string | string[] | number

type SavedSession = {
  answers: Record<string, Answer>
  submissionId: string
  sessionToken: string
  sectionIndex: number
  questionIndex: number
  screen: 'intro' | 'survey' | 'done'
}

const API = (import.meta.env.VITE_SURVEY_FUNCTION_URL as string | undefined)?.trim()
  || 'https://mqxuhbbthshjuetbjxbh.supabase.co/functions/v1/survey-public'
const SESSION_KEY = 'wnr:survey-session:v1'
const headers = { 'Content-Type': 'application/json' }

function readSession(): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<SavedSession>
    if (!value.submissionId || !value.sessionToken || !value.answers || typeof value.answers !== 'object') return null
    return {
      answers: value.answers,
      submissionId: value.submissionId,
      sessionToken: value.sessionToken,
      sectionIndex: Number.isInteger(value.sectionIndex) ? Number(value.sectionIndex) : 0,
      questionIndex: Number.isInteger(value.questionIndex) ? Number(value.questionIndex) : 0,
      screen: value.screen === 'done' ? 'done' : 'survey',
    }
  } catch {
    return null
  }
}

async function request(_path: string, body?: unknown) {
  if (!API) throw new Error('Не настроен адрес API. Укажите VITE_SURVEY_FUNCTION_URL в настройках приложения.')
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
  const [saved] = useState(readSession)
  const [survey, setSurvey] = useState<Survey | null>(null)
  const [currencyRates, setCurrencyRates] = useState<Record<string, number>>({})
  const [answers, setAnswers] = useState<Record<string, Answer>>(saved?.answers ?? {})
  const [submissionId, setSubmissionId] = useState(saved?.submissionId ?? '')
  const [sessionToken, setSessionToken] = useState(saved?.sessionToken ?? '')
  const [sectionIndex, setSectionIndex] = useState(saved?.sectionIndex ?? 0)
  const [questionIndex, setQuestionIndex] = useState(saved?.questionIndex ?? 0)
  const [screen, setScreen] = useState<'intro'|'survey'|'done'>(saved?.screen ?? 'intro')
  const [consent, setConsent] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void loadEuroRates().then(rates => { if (active && rates) setCurrencyRates(rates) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const webApp = window.Telegram?.WebApp
    if (!webApp) return
    const applyLightTheme = () => {
      const root = document.documentElement
      root.dataset.telegramColorScheme = 'light'
      root.style.setProperty('--tg-bg-color', '#f5f7f7')
      root.style.setProperty('--tg-text-color', '#17252a')
      root.style.setProperty('--tg-hint-color', '#77878b')
      root.style.setProperty('--tg-button-color', '#174a54')
      const telegram = webApp as typeof webApp & {
        setBackgroundColor?: (color: string) => void
        setHeaderColor?: (color: string) => void
      }
      telegram.setBackgroundColor?.('#f5f7f7')
      telegram.setHeaderColor?.('#f5f7f7')
    }
    webApp.ready?.()
    webApp.expand?.()
    applyLightTheme()
    webApp.onEvent?.('themeChanged', applyLightTheme)
    return () => webApp.offEvent?.('themeChanged', applyLightTheme)
  }, [])

  useEffect(() => {
    const load = saved
      ? request('', { action:'load', submissionId:saved.submissionId, sessionToken:saved.sessionToken })
      : request('')
    load.then(data => {
      setSurvey(data)
      if (saved) {
        const maxSection = Math.max(0, (data.sections?.length ?? 1) - 1)
        setSectionIndex(Math.min(saved.sectionIndex, maxSection))
        const restoredSection = data.sections?.[Math.min(saved.sectionIndex, maxSection)]
        const count = data.questions?.filter((q: Question) => q.section_id === restoredSection?.id).length ?? 1
        setQuestionIndex(Math.min(saved.questionIndex, Math.max(0, count - 1)))
      }
    }).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!submissionId) return
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ answers, submissionId, sessionToken, sectionIndex, questionIndex, screen }))
    } catch {
      setError('Не удалось сохранить прогресс на этом устройстве. Продолжайте без перезагрузки страницы.')
    }
  }, [answers, submissionId, sectionIndex, questionIndex, screen])

  const sections = survey?.sections ?? []
  const currentSection = sections[sectionIndex]
  const sectionQuestions = useMemo(
    () => survey?.questions.filter(q => q.section_id === currentSection?.id).sort((a,b)=>a.position-b.position) ?? [],
    [survey, currentSection]
  )
  const currentQuestion = sectionQuestions[questionIndex]
  const totalQuestions = survey?.questions.length ?? 18
  const estimatedDuration = totalQuestions <= 20 ? '5–7' : '5–8'
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
      setSessionToken(data.sessionToken)
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
      await request('', {action:'save', submissionId, sessionToken, questionId:currentQuestion.id, answer:value})
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
        const result = await request('', {action:'complete', submissionId, sessionToken})
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

  useEffect(() => {
    const backButton = (window.Telegram?.WebApp as unknown as {
      BackButton?: {
        show?: () => void
        hide?: () => void
        onClick?: (callback: () => void) => void
        offClick?: (callback: () => void) => void
      }
    } | undefined)?.BackButton
    if (!backButton) return
    const handleBack = () => { void back() }
    if (screen === 'survey') {
      backButton.show?.()
      backButton.onClick?.(handleBack)
    } else {
      backButton.hide?.()
    }
    return () => backButton.offClick?.(handleBack)
  }, [screen, sectionIndex, questionIndex])

  if (loading) return <main className="shell centered"><div className="loader"/><p>Загружаем исследование…</p></main>
  if (!survey) return <main className="shell centered"><div className="brand-mark">W</div><h1>Не удалось загрузить опрос</h1><p className="muted">{error || 'Проверьте подключение и попробуйте снова.'}</p><button onClick={()=>location.reload()}>Повторить</button></main>

  return <main className="shell">
    <header className="topbar"><div className="brand"><div className="brand-mark">W</div><span>WOMEN'S NEEDS RESEARCH</span></div><span className="privacy">Анонимно · 5–7 минут</span></header>
    {screen === 'intro' && <section className="intro panel">
      <div className="eyebrow">АНОНИМНОЕ ИССЛЕДОВАНИЕ</div>
      <h1>Что действительно<br/><em>важно именно тебе?</em></h1>
      <p className="lead">{survey.intro || 'Помоги нам лучше понять, с какими трудностями женщины сталкиваются в повседневной жизни, чего им не хватает и что действительно могло бы сделать их жизнь комфортнее. Нас интересует твоё личное мнение — здесь нет правильных или неправильных ответов. Расскажи о том, что важно именно тебе. Опрос анонимный и займёт ориентировочно 5–7 минут.'}</p>
      <div className="facts"><div><strong>{totalQuestions}</strong><span>вопросов</span></div><div><strong>{sections.length}</strong><span>разделов</span></div><div><strong>{estimatedDuration}</strong><span>минут</span></div></div>
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
        <h3>{currentQuestion.slug === 'v2_price_range' || currentQuestion.slug === 'price_range' ? currentQuestion.prompt + ' (' + resolveCurrency(String(answers[survey.questions.find(q=>q.slug==='v2_country' || q.slug==='country')?.id ?? ''] ?? ''),currencyRates).name + ')' : currentQuestion.prompt}</h3>
        {currentQuestion.help_text && <p className="muted">{currentQuestion.help_text}</p>}
        <AnswerInput question={currentQuestion} value={answers[currentQuestion.id]} country={String(answers[survey.questions.find(q=>q.slug==='v2_country' || q.slug==='country')?.id ?? ''] ?? '')} currencyRates={currencyRates} onChange={v=>setAnswer(currentQuestion.id,v)}/>
      </article>
      {error && <p className="error">{error}</p>}
      <div className="nav-actions"><button className="secondary" onClick={back} disabled={busy}>Назад</button><button className="primary" onClick={next} disabled={busy}>{busy?'Сохраняем…':sectionIndex===sections.length-1 && questionIndex===sectionQuestions.length-1?'Завершить':'Продолжить'} <span>→</span></button></div>
      <p className="save-note">Ответы автоматически сохраняются в рамках текущей вкладки; на сервер отправляются при переходе к следующему вопросу.</p>
    </section>}
    {screen === 'done' && <section className="done panel"><div className="success-icon">✓</div><div className="eyebrow">ИССЛЕДОВАНИЕ ЗАВЕРШЕНО</div><h1>Спасибо за ваше<br/><em>время и честность.</em></h1><p className="lead">Ваши ответы помогут лучше понять реальные потребности и найти идеи полезных решений.</p><p className="footnote">Анкета отправлена. Вы можете закрыть это окно.</p></section>}
    <footer>© 2026 WOMEN'S NEEDS RESEARCH <span>Разработано by <strong>kRISJEEY &amp; Domentos</strong></span><span>Создано для изучения реальных потребностей</span></footer>
  </main>
}

function AnswerInput({question, value, country, currencyRates, onChange}:{question:Question,value:Answer|undefined,country:string,currencyRates:Record<string,number>,onChange:(v:Answer)=>void}) {
  const type = question.question_type
  if (type === 'textarea' || type === 'text') return <textarea rows={type==='text'?2:4} maxLength={4000} placeholder="Ваш ответ…" value={typeof value==='string'?value:''} onChange={e=>onChange(e.target.value)}/>
  if (type === 'number') return <input type="number" value={typeof value==='number'?value:''} onChange={e=>onChange(e.target.value === '' ? '' : Number(e.target.value))}/>
  if (type === 'scale') {
    const min = Number(question.config.min ?? 1), max = Number(question.config.max ?? 5)
    return <div className="scale">{Array.from({length:max-min+1},(_,i)=>min+i).map(n=><button key={n} className={value===n?'selected':''} onClick={()=>onChange(n)}>{n}</button>)}<div className="scale-labels"><span>Совсем не влияет</span><span>Очень сильно</span></div></div>
  }
  if (type === 'multiple_choice') {
    const selected = Array.isArray(value)?value:[]
    const maxSelected = Number(question.config.max_selected ?? 0)
    const exclusiveValues = Array.isArray(question.config.exclusive_values) ? question.config.exclusive_values as string[] : []
    const toggle = (optionValue:string, checked:boolean) => {
      if (!checked) { onChange(selected.filter(v=>v!==optionValue)); return }
      if (exclusiveValues.includes(optionValue)) { onChange([optionValue]); return }
      const withoutExclusive = selected.filter(v=>!exclusiveValues.includes(v))
      if (maxSelected > 0 && withoutExclusive.length >= maxSelected) return
      onChange([...withoutExclusive,optionValue])
    }
    return <div className="options">
      {question.options.map(o=>{
        const checked = selected.includes(o.value)
        const disabled = !checked && !exclusiveValues.includes(o.value) && maxSelected > 0 && selected.filter(v=>!exclusiveValues.includes(v)).length >= maxSelected
        return <label className={`option ${checked?'active':''} ${disabled?'disabled':''}`} key={o.id}>
          <input type="checkbox" checked={checked} disabled={disabled} onChange={e=>toggle(o.value,e.target.checked)}/>
          <span>{o.label.replace(/_/g, ' ')}</span><i>{checked?'✓':''}</i>
        </label>
      })}
      {maxSelected > 0 && <p className="muted selection-limit">Выбрано: {selected.length} из {maxSelected}</p>}
    </div>
  }
  if (type === 'country') return <input className="text-input" placeholder="Например, Нидерланды" value={typeof value==='string'?value:''} onChange={e=>onChange(e.target.value)}/>
  const currency = resolveCurrency(country,currencyRates)
  const isPriceQuestion = question.slug === 'v2_price_range' || question.slug === 'price_range'
  return <div className="options">{question.options.map(o=><label className={`option ${value===o.value?'active':''}`} key={o.id}><input type="radio" name={question.id} checked={value===o.value} onChange={()=>onChange(o.value)}/><span>{isPriceQuestion && localPriceLabel(o.value,currency)!==o.value ? localPriceLabel(o.value,currency) : o.label.replace(/_/g, ' ')}</span><i>{value===o.value?'✓':''}</i></label>)}{isPriceQuestion && currency.isFallback && <p className="muted">Для указанной страны не удалось определить валюту — суммы показаны в евро.</p>}</div>
}

export default App
