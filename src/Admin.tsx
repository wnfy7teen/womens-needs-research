import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient, type Session } from '@supabase/supabase-js'

const supabase = createClient(
  'https://mqxuhbbthshjuetbjxbh.supabase.co',
  'sb_publishable__aqTmFrbXdSBnoDkTeumyw_RaZGhdWg',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
)

type Submission = { id: string; status: string; locale: string; version_id: string; created_at: string; started_at: string; completed_at: string | null }
type SurveyVersion = { id: string; slug: string; title: string }
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
  const [versions, setVersions] = useState<SurveyVersion[]>([])
  const [answers, setAnswers] = useState<Answer[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [exportingSubmission, setExportingSubmission] = useState<string | null>(null)

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
    const [s, q, sec, a, v] = await Promise.all([
      supabase.from('survey_submissions').select('id,status,locale,version_id,created_at,started_at,completed_at').order('created_at', { ascending: false }).limit(500),
      supabase.from('survey_questions').select('id,prompt,slug,section_id,position').order('position'),
      supabase.from('survey_sections').select('id,title,position').order('position'),
      supabase.from('survey_answers').select('submission_id,question_id,answer,created_at').order('created_at', { ascending: false }).limit(10000),
      supabase.from('survey_versions').select('id,slug,title')
    ])
    const failed = [s.error, q.error, sec.error, a.error, v.error].find(Boolean)
    if (failed) { setError(failed.message); return }
    setSubmissions(s.data ?? [])
    setQuestions(q.data ?? [])
    setSections(sec.data ?? [])
    setVersions(v.data ?? [])
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
  const versionById = useMemo(() => new Map(versions.map(v => [v.id, v.slug.toLocaleUpperCase('ru').replace(/_/g,' ')])), [versions])
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
    const rows = [['submission_id','version','status','question','answer','created_at'], ...answers.map(a => [
      a.submission_id, versionById.get(submissions.find(s => s.id === a.submission_id)?.version_id ?? '') ?? '', submissions.find(s => s.id === a.submission_id)?.status ?? '',
      questionById.get(a.question_id)?.prompt ?? a.question_id, answerLabel(a.answer), a.created_at
    ])]
    const csv = rows.map(row => row.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = 'wnr-responses.csv'; link.click(); URL.revokeObjectURL(url)
  }

  async function exportSubmissionImages(submission: Submission) {
    const submissionAnswers = answers
      .filter(answer => answer.submission_id === submission.id)
      .sort((left, right) => (questionById.get(left.question_id)?.position ?? 0) - (questionById.get(right.question_id)?.position ?? 0))
    if (!submissionAnswers.length) return
    setExportingSubmission(submission.id)
    setError('')
    try {
      const width = 1200
      const pageHeight = 1600
      const left = 72
      const cardWidth = 1056
      const contentTop = 310
      const contentBottom = 1440
      const encoder = new TextEncoder()
      const measureCanvas = document.createElement('canvas')
      const measure = measureCanvas.getContext('2d')
      if (!measure) throw new Error('Не удалось подготовить измерение текста')

      const escapeXml = (value: string) => value
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

      const splitLongWord = (word: string, font: string, maxWidth: number) => {
        const parts: string[] = []
        let part = ''
        for (const character of Array.from(word)) {
          const next = part + character
          measure.font = font
          if (part && measure.measureText(next).width > maxWidth) {
            parts.push(part)
            part = character
          } else part = next
        }
        if (part) parts.push(part)
        return parts
      }

      const wrapText = (value: string, font: string, maxWidth: number) => {
        measure.font = font
        const result: string[] = []
        const paragraphs = String(value ?? '').replace(/\r\n?/g, '\n').split('\n')
        for (const paragraph of paragraphs) {
          const words = paragraph.trim().split(/\s+/).filter(Boolean)
          if (!words.length) { result.push(''); continue }
          let line = ''
          for (const originalWord of words) {
            const pieces = measure.measureText(originalWord).width > maxWidth
              ? splitLongWord(originalWord, font, maxWidth)
              : [originalWord]
            for (const piece of pieces) {
              const candidate = line ? line + ' ' + piece : piece
              if (line && measure.measureText(candidate).width > maxWidth) {
                result.push(line)
                line = piece
              } else line = candidate
            }
          }
          if (line) result.push(line)
        }
        return result.length ? result : ['—']
      }

      const answerText = (value: unknown) => {
        if (Array.isArray(value)) return value.map(item => String(item ?? '')).filter(Boolean).join(' · ') || '—'
        if (value && typeof value === 'object') {
          return Object.entries(value as Record<string, unknown>)
            .map(([key, item]) => pretty(key) + ': ' + (typeof item === 'string' ? item : JSON.stringify(item)))
            .join('\n') || '—'
        }
        return String(value ?? '—')
      }

      const questionFont = '600 23px Arial'
      const answerFont = '400 20px Arial'
      const groups = sections.map(section => ({
        title: section.title,
        items: submissionAnswers.filter(answer => questionById.get(answer.question_id)?.section_id === section.id)
      })).filter(group => group.items.length)
      const ungrouped = submissionAnswers.filter(answer =>
        !sections.some(section => section.id === questionById.get(answer.question_id)?.section_id))
      if (ungrouped.length) groups.push({ title: 'Другие ответы', items: ungrouped })

      type ReportBlock =
        | { kind: 'section'; title: string; height: number }
        | { kind: 'answer'; number: number; total: number; questionLines: string[]; answerLines: string[]; continued: boolean; height: number }

      const pages: ReportBlock[][] = [[]]
      let usedHeight = contentTop
      let currentPage = 0
      const newPage = () => {
        pages.push([])
        currentPage++
        usedHeight = contentTop
      }
      const addBlock = (block: ReportBlock) => {
        if (usedHeight + block.height > contentBottom && pages[currentPage].length) newPage()
        pages[currentPage].push(block)
        usedHeight += block.height
      }

      let questionNumber = 0
      for (const group of groups) {
        const sectionBlock: ReportBlock = { kind: 'section', title: group.title, height: 58 }
        if (usedHeight + sectionBlock.height + 170 > contentBottom && pages[currentPage].length) newPage()
        addBlock(sectionBlock)

        for (const answer of group.items) {
          questionNumber++
          const question = questionById.get(answer.question_id)
          const questionLines = wrapText(question?.prompt ?? 'Вопрос удалён', questionFont, 990)
          const answerLines = wrapText(answerText(answer.answer), answerFont, 990)
          const chunks: string[][] = []
          for (let index = 0; index < answerLines.length; index += 27) chunks.push(answerLines.slice(index, index + 27))
          chunks.forEach((chunk, chunkIndex) => {
            const continued = chunkIndex > 0
            const qLines = continued ? ['Ответ продолжается'] : questionLines
            const height = 70 + qLines.length * 31 + 24 + chunk.length * 29 + 30
            const block: ReportBlock = {
              kind: 'answer', number: questionNumber, total: submissionAnswers.length,
              questionLines: qLines, answerLines: chunk, continued, height
            }
            if (usedHeight + block.height > contentBottom && pages[currentPage].length) {
              newPage()
              addBlock({ kind: 'section', title: group.title + ' · продолжение', height: 58 })
            }
            addBlock(block)
          })
        }
      }

      const status = submission.status === 'completed' ? 'Завершена' : submission.status === 'in_progress' ? 'В процессе' : 'Прервана'
      const created = dateLabel(submission.started_at || submission.created_at)
      const completed = dateLabel(submission.completed_at)
      const renderLines = (lines: string[], x: number, startY: number, className: string, lineHeight: number) =>
        lines.map((line, index) =>
          '<text x="' + x + '" y="' + (startY + index * lineHeight) + '" class="' + className + '">' + escapeXml(line || ' ') + '</text>'
        ).join('')

      const renderPage = async (blocks: ReportBlock[], pageIndex: number) => {
        let y = contentTop
        const content: string[] = []
        for (const block of blocks) {
          if (block.kind === 'section') {
            content.push('<rect x="' + left + '" y="' + y + '" width="' + cardWidth + '" height="42" rx="12" fill="#eaf2ff"/>')
            content.push('<text x="' + (left + 22) + '" y="' + (y + 28) + '" class="section">' + escapeXml(block.title.toLocaleUpperCase('ru')) + '</text>')
            y += block.height
            continue
          }
          const top = y
          const questionStart = top + 68
          const separatorY = questionStart + block.questionLines.length * 31 + 12
          const answerStart = separatorY + 35
          content.push('<rect x="' + left + '" y="' + top + '" width="' + cardWidth + '" height="' + (block.height - 12) + '" rx="20" fill="#ffffff" stroke="#e5e7eb" stroke-width="1.5"/>')
          content.push('<text x="' + (left + 28) + '" y="' + (top + 35) + '" class="number">' + String(block.number).padStart(2, '0') + ' / ' + block.total + (block.continued ? ' · ПРОДОЛЖЕНИЕ' : '') + '</text>')
          content.push(renderLines(block.questionLines, left + 28, questionStart, 'question', 31))
          content.push('<line x1="' + (left + 28) + '" y1="' + separatorY + '" x2="' + (left + cardWidth - 28) + '" y2="' + separatorY + '" stroke="#eceef1" stroke-width="1.5"/>')
          content.push(renderLines(block.answerLines, left + 28, answerStart, 'answer', 29))
          y += block.height
        }

        const title = pageIndex === 0 ? 'Ответы участницы' : 'Ответы участницы · продолжение'
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + pageHeight + '" viewBox="0 0 ' + width + ' ' + pageHeight + '">' +
          '<rect width="' + width + '" height="' + pageHeight + '" fill="#f5f5f7"/>' +
          '<text x="' + left + '" y="76" class="brand">WNR <tspan fill="#9aa0a6">/</tspan> WOMEN&#39;S NEEDS RESEARCH</text>' +
          '<text x="' + left + '" y="158" class="title">' + escapeXml(title) + '</text>' +
          '<text x="' + left + '" y="205" class="subtitle">Индивидуальный отчёт исследования</text>' +
          '<rect x="' + left + '" y="235" width="' + cardWidth + '" height="56" rx="14" fill="#ffffff" stroke="#e5e7eb"/>' +
          '<text x="' + (left + 22) + '" y="270" class="meta">СТАТУС · ' + escapeXml(status) + '　　НАЧАТО · ' + escapeXml(created) + '　　ЗАВЕРШЕНО · ' + escapeXml(completed) + '</text>' +
          content.join('') +
          '<line x1="' + left + '" y1="1510" x2="' + (left + cardWidth) + '" y2="1510" stroke="#dfe1e5"/>' +
          '<text x="' + left + '" y="1544" class="footer">WNR · PRIVATE RESEARCH REPORT · ID ' + escapeXml(submission.id.slice(0, 8)) + '</text>' +
          '<text x="' + (left + cardWidth) + '" y="1544" text-anchor="end" class="footer">СТРАНИЦА ' + (pageIndex + 1) + ' ИЗ ' + pages.length + '</text>' +
          '<style>text{font-family:Arial,"Noto Sans",sans-serif}.brand{font-size:20px;font-weight:700;letter-spacing:3px;fill:#003d55}.title{font-size:48px;font-weight:700;fill:#1d1d1f}.subtitle{font-size:19px;fill:#6e6e73}.meta{font-size:14px;font-weight:600;fill:#62666c}.section{font-size:16px;font-weight:700;letter-spacing:1.3px;fill:#075fc4}.number{font-size:14px;font-weight:700;letter-spacing:.5px;fill:#0874df}.question{font-size:23px;font-weight:600;fill:#1d1d1f}.answer{font-size:20px;font-weight:400;fill:#424245}.footer{font-size:13px;letter-spacing:.5px;fill:#777b82}</style></svg>'

        const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
        try {
          const image = new Image()
          image.src = svgUrl
          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve()
            image.onerror = () => reject(new Error('Не удалось отрисовать страницу ' + (pageIndex + 1)))
          })
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = pageHeight
          const context = canvas.getContext('2d')
          if (!context) throw new Error('Canvas недоступен')
          context.fillStyle = '#f5f5f7'
          context.fillRect(0, 0, width, pageHeight)
          context.drawImage(image, 0, 0, width, pageHeight)
          return await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Не удалось создать PNG страницы ' + (pageIndex + 1))), 'image/png')
          })
        } finally {
          URL.revokeObjectURL(svgUrl)
        }
      }

      const pngFiles: { name: string; bytes: Uint8Array }[] = []
      for (let index = 0; index < pages.length; index++) {
        const png = await renderPage(pages[index], index)
        pngFiles.push({
          name: 'WNR-' + submission.id.slice(0, 8) + '-page-' + String(index + 1).padStart(2, '0') + '.png',
          bytes: new Uint8Array(await png.arrayBuffer())
        })
      }

      const crcTable = new Uint32Array(256)
      for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
        crcTable[n] = c >>> 0
      }
      const crc32 = (bytes: Uint8Array) => {
        let crc = 0xffffffff
        for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
        return (crc ^ 0xffffffff) >>> 0
      }
      const zipParts: Uint8Array[] = []
      const centralParts: Uint8Array[] = []
      let offset = 0
      const now = new Date()
      const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)
      const dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
      const push16 = (view: DataView, position: number, value: number) => view.setUint16(position, value, true)
      const push32 = (view: DataView, position: number, value: number) => view.setUint32(position, value >>> 0, true)
      const concat = (parts: Uint8Array[]) => {
        const total = parts.reduce((sum, part) => sum + part.length, 0)
        const result = new Uint8Array(total)
        let cursor = 0
        for (const part of parts) { result.set(part, cursor); cursor += part.length }
        return result
      }

      for (const file of pngFiles) {
        const name = encoder.encode(file.name)
        const crc = crc32(file.bytes)
        const local = new Uint8Array(30 + name.length)
        const localView = new DataView(local.buffer)
        push32(localView, 0, 0x04034b50); push16(localView, 4, 20); push16(localView, 6, 0x0800)
        push16(localView, 8, 0); push16(localView, 10, dosTime); push16(localView, 12, dosDate)
        push32(localView, 14, crc); push32(localView, 18, file.bytes.length); push32(localView, 22, file.bytes.length)
        push16(localView, 26, name.length); push16(localView, 28, 0); local.set(name, 30)
        zipParts.push(local, file.bytes)

        const central = new Uint8Array(46 + name.length)
        const centralView = new DataView(central.buffer)
        push32(centralView, 0, 0x02014b50); push16(centralView, 4, 20); push16(centralView, 6, 20)
        push16(centralView, 8, 0x0800); push16(centralView, 10, 0); push16(centralView, 12, dosTime)
        push16(centralView, 14, dosDate); push32(centralView, 16, crc)
        push32(centralView, 20, file.bytes.length); push32(centralView, 24, file.bytes.length)
        push16(centralView, 28, name.length); push16(centralView, 30, 0); push16(centralView, 32, 0)
        push16(centralView, 34, 0); push16(centralView, 36, 0); push32(centralView, 38, 0)
        push32(centralView, 42, offset); central.set(name, 46)
        centralParts.push(central)
        offset += local.length + file.bytes.length
      }

      const centralDirectory = concat(centralParts)
      const end = new Uint8Array(22)
      const endView = new DataView(end.buffer)
      push32(endView, 0, 0x06054b50); push16(endView, 4, 0); push16(endView, 6, 0)
      push16(endView, 8, pngFiles.length); push16(endView, 10, pngFiles.length)
      push32(endView, 12, centralDirectory.length); push32(endView, 16, offset); push16(endView, 20, 0)

      const zip = new Blob([...zipParts, centralDirectory, end], { type: 'application/zip' })
      const downloadUrl = URL.createObjectURL(zip)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = 'WNR-' + submission.id.slice(0, 8) + '-PNG-report.zip'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000)
    } catch (exportError) {
      console.error(exportError)
      setError(exportError instanceof Error ? exportError.message : 'Не удалось сформировать PNG-отчёт')
    } finally {
      setExportingSubmission(null)
    }
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
        <div className="admin-submissions">{filtered.map(s=><div key={s.id} className="submission-row"><button className={'admin-submission '+(selected===s.id?'chosen':'')} onClick={()=>setSelected(s.id)}><span className={'status-dot '+s.status}/><span className="submission-main"><b>{s.id.slice(0,8)}…</b><small>{dateLabel(s.created_at)} · {versionById.get(s.version_id) ?? 'WNR'}</small></span><span className="submission-status">{s.status==='completed'?'Завершена':s.status==='in_progress'?'В процессе':'Прервана'}</span><span className="submission-count">{answers.filter(a=>a.submission_id===s.id).length} отв.</span></button><button className="submission-download" onClick={()=>void exportSubmissionImages(s)} title="Скачать PNG-страницы в ZIP" aria-label="Скачать PNG-страницы в ZIP" disabled={!answers.some(a=>a.submission_id===s.id) || exportingSubmission===s.id}>{exportingSubmission===s.id?'…':'↓'}</button></div>)}{!filtered.length && <p className="admin-empty">Ничего не найдено</p>}</div>
      </div>
      <div className="admin-panel admin-detail-panel"><div className="admin-panel-head"><div><h2>{selectedSubmission ? 'Ответы анкеты' : 'Детали прохождения'}</h2><p>{selectedSubmission ? selectedSubmission.id : 'Выбери прохождение слева'}</p></div>{selectedSubmission && <button className="detail-export" onClick={()=>void exportSubmissionImages(selectedSubmission)} disabled={!selectedAnswers.length || exportingSubmission===selectedSubmission.id}>{exportingSubmission===selectedSubmission.id?'Готовим PNG-страницы…':'Скачать PNG-отчёт (ZIP) ↓'}</button>}</div>
        {selectedSubmission ? <><div className="detail-meta"><span>{selectedSubmission.status}</span><span>{versionById.get(selectedSubmission.version_id) ?? 'WNR'}</span><span>Начата: {dateLabel(selectedSubmission.started_at || selectedSubmission.created_at)}</span><span>Завершена: {dateLabel(selectedSubmission.completed_at)}</span></div><div className="admin-answers">{selectedAnswers.map(a=>{const q=questionById.get(a.question_id);return <article key={a.question_id}><small>{sectionById.get(q?.section_id ?? '') ?? 'ВОПРОС'} · {q?.slug ?? ''}</small><h3>{q?.prompt ?? 'Вопрос удалён'}</h3><p>{answerLabel(a.answer)}</p></article>})}{!selectedAnswers.length && <p className="admin-empty">Ответов пока нет</p>}</div></> : <div className="admin-placeholder">Выбери анкету, чтобы посмотреть её ответы и статус.</div>}
      </div>
    </section>
    <section className="admin-analytics"><div className="admin-panel-head"><div><h2>Быстрые срезы</h2><p>Частота выбранных вариантов по сохранённым ответам</p></div></div><div className="analytics-grid">{[['v2_age','Возраст'],['v2_country','Страна'],['v2_problem_frequency','Частота трудностей'],['v2_price_range','Приемлемая цена']].map(([slug,title])=><article className="admin-panel analytics-card" key={slug}><h3>{title}</h3>{distribution(slug).map(([label,count])=><div className="bar-row" key={label}><span>{label}</span><div><i style={{width: (count/Math.max(1,...distribution(slug).map(x=>x[1]))*100)+'%'}}/></div><b>{count}</b></div>)}{!distribution(slug).length && <p className="admin-empty">Пока недостаточно данных</p>}</article>)}</div></section>
    <footer className="admin-footer">WNR · PRIVATE ADMIN AREA <span>Realtime subscription active</span></footer>
  </main>
}
