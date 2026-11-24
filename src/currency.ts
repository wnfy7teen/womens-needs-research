export type CurrencyInfo = {
  code: string
  name: string
  rate: number
  isFallback: boolean
}

const COUNTRY_CURRENCY: Record<string, string> = {
  'россия':'RUB','российская федерация':'RUB','russia':'RUB',
  'нидерланды':'EUR','netherlands':'EUR','германия':'EUR','germany':'EUR','франция':'EUR','france':'EUR','италия':'EUR','italy':'EUR','испания':'EUR','spain':'EUR','бельгия':'EUR','belgium':'EUR','португалия':'EUR','portugal':'EUR','австрия':'EUR','austria':'EUR','ирландия':'EUR','ireland':'EUR','греция':'EUR','greece':'EUR','финляндия':'EUR','finland':'EUR','эстония':'EUR','estonia':'EUR','латвия':'EUR','latvia':'EUR','литва':'EUR','lithuania':'EUR','словакия':'EUR','slovakia':'EUR','словения':'EUR','slovenia':'EUR','хорватия':'EUR','croatia':'EUR','кипр':'EUR','cyprus':'EUR','люксембург':'EUR','luxembourg':'EUR','мальта':'EUR','malta':'EUR',
  'сша':'USD','соединенные штаты':'USD','соединённые штаты':'USD','united states':'USD','united states of america':'USD','usa':'USD',
  'великобритания':'GBP','соединенное королевство':'GBP','соединённое королевство':'GBP','united kingdom':'GBP','great britain':'GBP','uk':'GBP',
  'швейцария':'CHF','switzerland':'CHF','польша':'PLN','poland':'PLN','украина':'UAH','україна':'UAH','ukraine':'UAH',
  'казахстан':'KZT','kazakhstan':'KZT','турция':'TRY','turkiye':'TRY','türkiye':'TRY','turkey':'TRY',
  'китай':'CNY','china':'CNY','канада':'CAD','canada':'CAD','австралия':'AUD','australia':'AUD',
  'беларусь':'BYN','белоруссия':'BYN','belarus':'BYN','грузия':'GEL','georgia':'GEL','армения':'AMD','armenia':'AMD',
  'япония':'JPY','japan':'JPY','чехия':'CZK','чешская республика':'CZK','czechia':'CZK','czech republic':'CZK',
  'швеция':'SEK','sweden':'SEK','норвегия':'NOK','norway':'NOK','дания':'DKK','denmark':'DKK',
  'венгрия':'HUF','hungary':'HUF','румыния':'RON','romania':'RON','индия':'INR','india':'INR',
  'бразилия':'BRL','brazil':'BRL','оаэ':'AED','объединенные арабские эмираты':'AED','united arab emirates':'AED','uae':'AED',
  'сингапур':'SGD','singapore':'SGD','таиланд':'THB','thailand':'THB','юар':'ZAR','южно-африканская республика':'ZAR','south africa':'ZAR',
  'мексика':'MXN','mexico':'MXN','аргентина':'ARS','argentina':'ARS','чили':'CLP','chile':'CLP','колумбия':'COP','colombia':'COP',
  'израиль':'ILS','israel':'ILS','южная корея':'KRW','south korea':'KRW','корея':'KRW','малайзия':'MYR','malaysia':'MYR',
  'индонезия':'IDR','indonesia':'IDR','филиппины':'PHP','philippines':'PHP','вьетнам':'VND','vietnam':'VND',
  'саудовская аравия':'SAR','saudi arabia':'SAR','катар':'QAR','qatar':'QAR','кувейт':'KWD','kuwait':'KWD',
  'мальдивы':'MVR','maldives':'MVR','исландия':'ISK','iceland':'ISK','сербия':'RSD','serbia':'RSD',
  'болгария':'BGN','bulgaria':'BGN','молдова':'MDL','moldova':'MDL','азербайджан':'AZN','azerbaijan':'AZN',
  'узбекистан':'UZS','uzbekistan':'UZS','киргизия':'KGS','кыргызстан':'KGS','kyrgyzstan':'KGS',
  'маврикий':'MUR','mauritius':'MUR','марокко':'MAD','morocco':'MAD','египет':'EGP','egypt':'EGP',
  'нигерия':'NGN','nigeria':'NGN','гана':'GHS','ghana':'GHS','кения':'KES','kenya':'KES',
  'новая зеландия':'NZD','new zealand':'NZD','фиджи':'FJD','fiji':'FJD'
}

const FALLBACK_RATES: Record<string, number> = {
  EUR:1, USD:1.1, RUB:90.34, GBP:0.833, CHF:0.923, PLN:4.404, UAH:47.5,
  KZT:550, TRY:55.4, CNY:7.33, CAD:1.57, AUD:1.63, BYN:3, GEL:3, AMD:430,
  JPY:175, CZK:24.4, SEK:11.1, NOK:10.6, DKK:7.47, HUF:365, RON:5.35,
  INR:103, BRL:6.28, AED:4.04, SGD:1.42, THB:37.2, ZAR:18.6, MXN:21.3,
  ARS:1150, CLP:1050, COP:4700, ILS:4.0, KRW:1500, MYR:4.7, IDR:18000,
  PHP:63, VND:28000, SAR:4.12, QAR:4.0, KWD:0.34, MVR:17, ISK:145,
  RSD:117, BGN:1.956, MDL:19.4, AZN:1.87, UZS:14000, KGS:95,
  MUR:51, MAD:10.8, EGP:53, NGN:1700, GHS:17, KES:140, NZD:1.8, FJD:2.5
}

const CURRENCY_NAMES: Record<string, string> = {
  EUR:'евро', USD:'долларах США', RUB:'российских рублях', GBP:'фунтах стерлингов',
  CHF:'швейцарских франках', PLN:'польских злотых', UAH:'украинских гривнах',
  KZT:'казахстанских тенге', TRY:'турецких лирах', CNY:'китайских юанях',
  CAD:'канадских долларах', AUD:'австралийских долларах', BYN:'белорусских рублях',
  GEL:'грузинских лари', AMD:'армянских драмах', JPY:'японских иенах',
  CZK:'чешских кронах', SEK:'шведских кронах', NOK:'норвежских кронах',
  DKK:'датских кронах', HUF:'венгерских форинтах', RON:'румынских леях',
  INR:'индийских рупиях', BRL:'бразильских реалах', AED:'дирхамах ОАЭ',
  SGD:'сингапурских долларах', THB:'тайских батах', ZAR:'южноафриканских рэндах',
  MXN:'мексиканских песо', ARS:'аргентинских песо', CLP:'чилийских песо',
  COP:'колумбийских песо', ILS:'новых израильских шекелях', KRW:'южнокорейских вонах',
  MYR:'малайзийских ринггитах', IDR:'индонезийских рупиях', PHP:'филиппинских песо',
  VND:'вьетнамских донгах', SAR:'саудовских риялах', QAR:'катарских риялах',
  KWD:'кувейтских динарах', MVR:'мальдивских руфиях', ISK:'исландских кронах',
  RSD:'сербских динарах', BGN:'болгарских левах', MDL:'молдавских леях',
  AZN:'азербайджанских манатах', UZS:'узбекских сумах', KGS:'кыргызских сомах',
  MUR:'маврикийских рупиях', MAD:'марокканских дирхамах', EGP:'египетских фунтах',
  NGN:'нигерийских найрах', GHS:'ганских седи', KES:'кенийских шиллингах',
  NZD:'новозеландских долларах', FJD:'долларах Фиджи'
}

function normalizeCountry(value: string): string {
  return value.trim().toLocaleLowerCase('ru').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[.,]/g, '').replace(/\s+/g, ' ')
}

export function resolveCurrency(country: string, liveRates: Record<string, number> = {}): CurrencyInfo {
  const normalized = normalizeCountry(country)
  const code = COUNTRY_CURRENCY[normalized] ?? 'EUR'
  return {
    code,
    name: CURRENCY_NAMES[code] ?? code,
    rate: liveRates[code] ?? FALLBACK_RATES[code] ?? 1,
    isFallback: !COUNTRY_CURRENCY[normalized]
  }
}

export function formatLocalAmount(eurAmount: number, currency: CurrencyInfo): string {
  const raw = eurAmount * currency.rate
  const step = raw >= 1000 ? 100 : raw >= 100 ? 10 : raw >= 20 ? 5 : 1
  return new Intl.NumberFormat('ru-RU', {
    style:'currency', currency:currency.code, maximumFractionDigits:0
  }).format(Math.round(raw / step) * step)
}

export function localPriceLabel(value: string, currency: CurrencyInfo): string {
  if (value === 'up_to_5' || value === 'до_5') return 'До ' + formatLocalAmount(5,currency)
  if (value === '5_10') return formatLocalAmount(5,currency) + ' – ' + formatLocalAmount(10,currency)
  if (value === '11_20') return formatLocalAmount(11,currency) + ' – ' + formatLocalAmount(20,currency)
  if (value === '21_40') return formatLocalAmount(21,currency) + ' – ' + formatLocalAmount(40,currency)
  if (value === 'over_40' || value === 'более_40') return 'Более ' + formatLocalAmount(40,currency)
  return value
}

export async function loadEuroRates(): Promise<Record<string, number> | null> {
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/EUR', { cache:'no-store' })
    if (!response.ok) return null
    const data = await response.json() as { result?: string; rates?: Record<string, number> }
    return data.result === 'success' && data.rates ? data.rates : null
  } catch {
    return null
  }
}
