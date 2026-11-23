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

type CurrencyInfo = { code: string; name: string; rate: number }
const COUNTRY_CURRENCIES: Record<string, CurrencyInfo> = {}
const currencyGroups: Array<[string[], CurrencyInfo]> = [
  [['россия','russia'], {code:'RUB',name:'российских рублях',rate:90.34}],
  [['нидерланды','netherlands','германия','germany','франция','france','италия','italy','испания','spain','бельгия','belgium','португалия','portugal','австрия','austria','ирландия','ireland'], {code:'EUR',name:'евро',rate:1}],
  [['сша','соединенные штаты','united states','usa'], {code:'USD',name:'долларах США',rate:1.10}],
  [['великобритания','united kingdom','uk'], {code:'GBP',name:'фунтах стерлингов',rate:0.833}],
  [['швейцария','switzerland'], {code:'CHF',name:'швейцарских франках',rate:0.923}],
  [['польша','poland'], {code:'PLN',name:'польских злотых',rate:4.404}],
  [['украина','україна','ukraine'], {code:'UAH',name:'украинских гривнах',rate:47.5}],
  [['казахстан','kazakhstan'], {code:'KZT',name:'казахстанских тенге',rate:550}],
  [['турция','türkiye','turkey'], {code:'TRY',name:'турецких лирах',rate:55.4}],
  [['китай','china'], {code:'CNY',name:'китайских юанях',rate:7.33}],
  [['канада','canada'], {code:'CAD',name:'канадских долларах',rate:1.57}],
  [['австралия','australia'], {code:'AUD',name:'австралийских долларах',rate:1.63}],
  [['беларусь','белоруссия','belarus'], {code:'BYN',name:'белорусских рублях',rate:3}],
  [['грузия','georgia'], {code:'GEL',name:'грузинских лари',rate:3}],
  [['армения','armenia'], {code:'AMD',name:'армянских драмах',rate:430}],
  [['япония','japan'], {code:'JPY',name:'японских иенах',rate:175}],
  [['чехия','czechia','czech republic'], {code:'CZK',name:'чешских кронах',rate:24.4}],
  [['швеция','sweden'], {code:'SEK',name:'шведских кронах',rate:11.1}],
  [['норвегия','norway'], {code:'NOK',name:'норвежских кронах',rate:10.6}],
  [['дания','denmark'], {code:'DKK',name:'датских кронах',rate:7.47}],
  [['венгрия','hungary'], {code:'HUF',name:'венгерских форинтах',rate:365}],
  [['румыния','romania'], {code:'RON',name:'румынских леях',rate:5.35}],
  [['индия','india'], {code:'INR',name:'индийских рупиях',rate:103}],
  [['бразилия','brazil'], {code:'BRL',name:'бразильских реалах',rate:6.28}],
  [['оаэ','united arab emirates','uae'], {code:'AED',name:'дирхамах ОАЭ',rate:4.04}],
  [['сингапур','singapore'], {code:'SGD',name:'сингапурских долларах',rate:1.42}],
  [['таиланд','thailand'], {code:'THB',name:'тайских батах',rate:37.2}],
  [['юар','south africa'], {code:'ZAR',name:'южноафриканских рэндах',rate:18.6}],
]
for (const [aliases, info] of currencyGroups) for (const alias of aliases) COUNTRY_CURRENCIES[alias] = info
function getCurrency(country: string): CurrencyInfo {
  const normalized = country.trim().toLocaleLowerCase('ru').replace(/[.,]/g, '').replace(/\s+/g, ' ')
  return COUNTRY_CURRENCIES[normalized] ?? {code:'EUR',name:'евро',rate:1}
}
function formatLocalAmount(eurAmount: number, currency: CurrencyInfo): string {
  const raw = eurAmount * currency.rate
  const step = raw >= 1000 ? 100 : raw >= 100 ? 10 : raw >= 20 ? 5 : 1
  return new Intl.NumberFormat('ru-RU', {style:'currency',currency:currency.code,maximumFractionDigits:0}).format(Math.round(raw / step) * step)
}
function localPriceLabel(value: string, currency: CurrencyInfo): string {
  if (value === 'до_5') return 'До ' + formatLocalAmount(5,currency)
  if (value === '5_10') return formatLocalAmount(5,currency) + ' – ' + formatLocalAmount(10,currency)
  if (value === '11_20') return formatLocalAmount(10,currency) + ' – ' + formatLocalAmount(20,currency)
  if (value === '21_40') return formatLocalAmount(20,currency) + ' – ' + formatLocalAmount(40,currency)
  if (value === 'более_40') return 'Более ' + formatLocalAmount(40,currency)
  return value
}
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
    const webApp = window.Telegram?.WebApp
    if (!webApp) return
    const applyTelegramTheme = () => {
      const params = webApp.themeParams ?? {}
      const root = document.documentElement
      if (params.bg_color) root.style.setProperty('--tg-bg-color', params.bg_color)
      if (params.text_color) root.style.setProperty('--tg-text-color', params.text_color)
      if (params.hint_color) root.style.setProperty('--tg-hint-color', params.hint_color)
      if (params.button_color) root.style.setProperty('--tg-button-color', params.button_color)
      root.dataset.telegramColorScheme = webApp.colorScheme ?? 'light'
    }
    webApp.ready?.()
    webApp.expand?.()
    applyTelegramTheme()
    webApp.onEvent?.('themeChanged', applyTelegramTheme)
    return () => webApp.offEvent?.('themeChanged', applyTelegramTheme)
  }, [])

  useEffect(() => {
    request('').then(data => {
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
        <h3>{currentQuestion.slug === 'price_range' ? 'Какую сумму в месяц вы считали бы приемлемой за продукт, который регулярно решает важную для вас проблему? (' + getCurrency(String(answers[survey.questions.find(q=>q.slug==='country')?.id ?? ''] ?? '')).name + ')' : currentQuestion.prompt}</h3>
        {currentQuestion.help_text && <p className="muted">{currentQuestion.help_text}</p>}
        <AnswerInput question={currentQuestion} value={answers[currentQuestion.id]} country={String(answers[survey.questions.find(q=>q.slug==='country')?.id ?? ''] ?? '')} onChange={v=>setAnswer(currentQuestion.id,v)}/>
      </article>
      {error && <p className="error">{error}</p>}
      <div className="nav-actions"><button className="secondary" onClick={back} disabled={busy}>Назад</button><button className="primary" onClick={next} disabled={busy}>{busy?'Сохраняем…':sectionIndex===sections.length-1 && questionIndex===sectionQuestions.length-1?'Завершить':'Продолжить'} <span>→</span></button></div>
      <p className="save-note">Ответы автоматически сохраняются в рамках текущей вкладки; на сервер отправляются при переходе к следующему вопросу.</p>
    </section>}
    {screen === 'done' && <section className="done panel"><div className="success-icon">✓</div><div className="eyebrow">ИССЛЕДОВАНИЕ ЗАВЕРШЕНО</div><h1>Спасибо за ваше<br/><em>время и честность.</em></h1><p className="lead">Ваши ответы помогут лучше понять реальные потребности и найти идеи полезных решений.</p><p className="footnote">Анкета отправлена. Вы можете закрыть это окно.</p></section>}
    <footer>© 2026 WOMEN'S NEEDS RESEARCH <span>Разработано by <strong>kRISJEEY &amp; Domentos</strong></span><span>Создано для изучения реальных потребностей</span></footer>
  </main>
}

function AnswerInput({question, value, country, onChange}:{question:Question,value:Answer|undefined,country:string,onChange:(v:Answer)=>void}) {
  const type = question.question_type
  if (type === 'textarea' || type === 'text') return <textarea rows={type==='text'?2:4} maxLength={4000} placeholder="Ваш ответ…" value={typeof value==='string'?value:''} onChange={e=>onChange(e.target.value)}/>
  if (type === 'number') return <input type="number" value={typeof value==='number'?value:''} onChange={e=>onChange(e.target.value === '' ? '' : Number(e.target.value))}/>
  if (type === 'scale') {
    const min = Number(question.config.min ?? 1), max = Number(question.config.max ?? 5)
    return <div className="scale">{Array.from({length:max-min+1},(_,i)=>min+i).map(n=><button key={n} className={value===n?'selected':''} onClick={()=>onChange(n)}>{n}</button>)}<div className="scale-labels"><span>Совсем не влияет</span><span>Очень сильно</span></div></div>
  }
  if (type === 'multiple_choice') {
    const selected = Array.isArray(value)?value:[]
    return <div className="options">{question.options.map(o=><label className={`option ${selected.includes(o.value)?'active':''}`} key={o.id}><input type="checkbox" checked={selected.includes(o.value)} onChange={e=>onChange(e.target.checked?[...selected,o.value]:selected.filter(v=>v!==o.value))}/><span>{o.label}</span><i>{selected.includes(o.value)?'✓':''}</i></label>)}</div>
  }
  if (type === 'country') return <input className="text-input" placeholder="Например, Нидерланды" value={typeof value==='string'?value:''} onChange={e=>onChange(e.target.value)}/>
  return <div className="options">{question.options.map(o=><label className={`option ${value===o.value?'active':''}`} key={o.id}><input type="radio" name={question.id} checked={value===o.value} onChange={()=>onChange(o.value)}/><span>{question.slug === 'price_range' ? localPriceLabel(o.value,getCurrency(country)) : o.label}</span><i>{value===o.value?'✓':''}</i></label>)}</div>
}

export default App
