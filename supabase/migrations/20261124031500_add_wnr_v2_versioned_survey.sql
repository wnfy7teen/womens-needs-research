
-- WNR 2.0: immutable survey versioning and new 18-question questionnaire.
-- Preserve a point-in-time copy of all WNR 1.0 records before schema changes.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.wnr_v1_backup_20261124_sections as table public.survey_sections;
create table private.wnr_v1_backup_20261124_questions as table public.survey_questions;
create table private.wnr_v1_backup_20261124_options as table public.survey_options;
create table private.wnr_v1_backup_20261124_submissions as table public.survey_submissions;
create table private.wnr_v1_backup_20261124_answers as table public.survey_answers;

create table public.survey_versions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  intro text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.survey_versions enable row level security;
revoke all on public.survey_versions from public, anon, authenticated;
grant all on public.survey_versions to service_role;

insert into public.survey_versions (slug,title,intro,is_active)
values
('wnr_1_0','WNR 1.0','Исходная версия исследования',true),
('wnr_2_0','WNR 2.0','Помоги нам лучше понять, с какими трудностями женщины сталкиваются в повседневной жизни, чего им не хватает и что действительно могло бы сделать их жизнь комфортнее. Нас интересует твоё личное мнение — здесь нет правильных или неправильных ответов. Расскажи о том, что важно именно тебе. Опрос анонимный, займёт ориентировочно 5–7 минут. Ответы помогут выявить реальные потребности и определить, какие продукты, услуги и решения действительно стоит создавать.',false);

alter table public.survey_sections add column version_id uuid;
alter table public.survey_questions add column version_id uuid;
alter table public.survey_submissions add column version_id uuid;

update public.survey_sections
set version_id = (select id from public.survey_versions where slug='wnr_1_0')
where version_id is null;
update public.survey_questions
set version_id = (select id from public.survey_versions where slug='wnr_1_0')
where version_id is null;
update public.survey_submissions
set version_id = (select id from public.survey_versions where slug='wnr_1_0')
where version_id is null;

alter table public.survey_sections alter column version_id set not null;
alter table public.survey_questions alter column version_id set not null;
alter table public.survey_submissions alter column version_id set not null;

alter table public.survey_sections
  add constraint survey_sections_version_id_fkey foreign key (version_id) references public.survey_versions(id) on delete restrict;
alter table public.survey_questions
  add constraint survey_questions_version_id_fkey foreign key (version_id) references public.survey_versions(id) on delete restrict;
alter table public.survey_submissions
  add constraint survey_submissions_version_id_fkey foreign key (version_id) references public.survey_versions(id) on delete restrict;

create index survey_sections_version_position_idx on public.survey_sections(version_id, position);
create index survey_questions_version_position_idx on public.survey_questions(version_id, position);
create index survey_submissions_version_created_idx on public.survey_submissions(version_id, created_at desc);

-- Insert WNR 2.0 sections. Positions 8-12 avoid the legacy global unique position constraint.
insert into public.survey_sections (version_id,slug,title,description,position,is_active)
select v.id, s.slug, s.title, s.description, s.position, false
from public.survey_versions v
cross join (values
  ('v2_intro','Знакомство','Немного о тебе и твоей повседневной жизни',8),
  ('v2_needs','Потребности и повседневные проблемы','Что действительно мешает и чего не хватает',9),
  ('v2_solutions','Существующие решения','Как ты справляешься сейчас и что не работает',10),
  ('v2_ideas','Каких решений не хватает','Что могло бы сделать жизнь лучше',11),
  ('v2_value','Ценность и участие','Отношение к новым продуктам и их стоимости',12)
) as s(slug,title,description,position)
where v.slug='wnr_2_0';

with question_seed as (
  select * from jsonb_to_recordset($questions$
  [
    {"section_slug":"v2_intro","slug":"v2_age","position":1,"prompt":"Сколько тебе лет?","help_text":null,"question_type":"single_choice","is_required":true,"config":{},"options":[["18_21","18–21"],["22_25","22–25"],["26_30","26–30"],["31_35","31–35"],["36_44","36–44"],["45_54","45–54"],["55_plus","55 и старше"],["prefer_not_to_say","Предпочитаю не указывать"]]},
    {"section_slug":"v2_intro","slug":"v2_country","position":2,"prompt":"В какой стране ты сейчас живёшь?","help_text":"Укажи страну проживания — она также поможет подобрать валюту в вопросе о стоимости","question_type":"country","is_required":true,"config":{},"options":[]},
    {"section_slug":"v2_intro","slug":"v2_situation","position":3,"prompt":"Что лучше всего описывает твою нынешнюю ситуацию?","help_text":"Можно выбрать несколько вариантов","question_type":"multiple_choice","is_required":true,"config":{"max_selected":3,"exclusive_values":["other"]},"options":[["full_time","Работаю полный день"],["part_time","Работаю неполный день"],["study","Учусь"],["work_and_study","Совмещаю работу и учёбу"],["business","Развиваю собственный бизнес"],["family","Занимаюсь домом и семьёй"],["job_search","Нахожусь в поиске работы"],["not_working","Сейчас не работаю"],["other","Другое"]]},
    {"section_slug":"v2_needs","slug":"v2_priority_areas","position":4,"prompt":"В каких сферах жизни тебе больше всего не хватает удобства, поддержки или хороших решений?","help_text":"Выбери не более трёх сфер, которые сейчас наиболее важны","question_type":"multiple_choice","is_required":true,"config":{"max_selected":3,"exclusive_values":["other"]},"options":[["career","Работа и карьера"],["finances","Финансы и личный бюджет"],["health","Здоровье и самочувствие"],["wellbeing","Психологическое благополучие"],["beauty","Красота и уход за собой"],["relationships","Отношения и общение"],["family","Семья и воспитание детей"],["home","Дом и повседневные дела"],["education","Образование и саморазвитие"],["safety","Безопасность и личная защищённость"],["shopping","Покупки и бытовые услуги"],["leisure","Отдых и свободное время"],["other","Другое"]]},
    {"section_slug":"v2_needs","slug":"v2_problem_frequency","position":5,"prompt":"Как часто ты сталкиваешься с проблемами в выбранных сферах?","help_text":null,"question_type":"single_choice","is_required":true,"config":{},"options":[["daily","Каждый день"],["several_week","Несколько раз в неделю"],["weekly","Примерно раз в неделю"],["several_month","Несколько раз в месяц"],["rarely","Редко"]]},
    {"section_slug":"v2_needs","slug":"v2_main_problem","position":6,"prompt":"Какая конкретная проблема сейчас больше всего мешает тебе или ухудшает качество твоей жизни?","help_text":"Можно описать своими словами, необязательно длинно","question_type":"textarea","is_required":false,"config":{},"options":[]},
    {"section_slug":"v2_needs","slug":"v2_problem_impact","position":7,"prompt":"Как эта проблема влияет на твою жизнь?","help_text":"Можно выбрать несколько вариантов","question_type":"multiple_choice","is_required":true,"config":{"exclusive_values":["no_impact"]},"options":[["time","Отнимает много времени"],["money","Заставляет тратить лишние деньги"],["stress","Вызывает стресс или тревогу"],["energy","Отнимает силы и энергию"],["work","Мешает работе или учёбе"],["relationships","Влияет на отношения с другими людьми"],["wants","Не позволяет заниматься тем, что мне действительно хочется"],["no_impact","Практически не влияет"],["other","Другое"]]},
    {"section_slug":"v2_solutions","slug":"v2_solution_methods","position":8,"prompt":"Как ты обычно пытаешься решать возникающие проблемы?","help_text":"Можно выбрать несколько вариантов","question_type":"multiple_choice","is_required":true,"config":{"exclusive_values":["do_nothing"]},"options":[["apps","Использую мобильные приложения и онлайн-сервисы"],["internet","Ищу информацию в интернете"],["friends","Спрашиваю совета у друзей или знакомых"],["experts","Обращаюсь к специалистам"],["buy","Покупаю товары или услуги"],["plans","Составляю собственные планы и системы"],["postpone","Откладываю решение проблемы"],["do_nothing","Ничего не предпринимаю"],["other","Другое"]]},
    {"section_slug":"v2_solutions","slug":"v2_missing_solutions","position":9,"prompt":"Чего тебе чаще всего не хватает в существующих решениях?","help_text":"Можно выбрать несколько вариантов","question_type":"multiple_choice","is_required":true,"config":{"exclusive_values":["enough"]},"options":[["simplicity","Простоты и удобства"],["price","Доступной стоимости"],["trustworthy_info","Достоверной информации"],["personalization","Индивидуального подхода"],["time","Экономии времени"],["support","Качественной поддержки"],["security","Надёжности и безопасности"],["all_in_one","Возможности получить всё необходимое в одном месте"],["enough","Мне в целом хватает существующих решений"],["other","Другое"]]},
    {"section_slug":"v2_solutions","slug":"v2_solution_barriers","position":10,"prompt":"Что чаще всего мешает тебе решить проблему окончательно?","help_text":"Можно выбрать несколько вариантов","question_type":"multiple_choice","is_required":true,"config":{"exclusive_values":["nothing_blocks"]},"options":[["money","Не хватает денег"],["time","Не хватает времени"],["choice","Не знаю, какое решение выбрать"],["information","Не хватает достоверной информации"],["find","Не могу найти подходящий сервис или специалиста"],["trust","Не доверяю существующим предложениям"],["support","Не хватает поддержки"],["tried","Уже пробовала разные способы, но они не помогли"],["nothing_blocks","Ничего не мешает"],["other","Другое"]]},
    {"section_slug":"v2_ideas","slug":"v2_desired_outcome","position":11,"prompt":"Представь, что нужное тебе решение уже существует. Что оно должно изменить в твоей жизни?","help_text":"Какой результат сделал бы жизнь заметно проще, комфортнее или лучше?","question_type":"textarea","is_required":false,"config":{},"options":[]},
    {"section_slug":"v2_ideas","slug":"v2_preferred_format","position":12,"prompt":"В каком формате тебе было бы удобнее получать такие решения?","help_text":"Можно выбрать несколько вариантов","question_type":"multiple_choice","is_required":true,"config":{"exclusive_values":["any_format"]},"options":[["app","Мобильное приложение"],["web","Веб-сервис или сайт"],["telegram","Telegram-бот или Mini App"],["expert","Персональная помощь специалиста"],["community","Онлайн-сообщество или клуб"],["content","Обучение, инструкции или полезный контент"],["physical","Физический продукт"],["offline","Офлайн-сервис"],["any_format","Формат не имеет значения, главное — результат"],["other","Другое"]]},
    {"section_slug":"v2_ideas","slug":"v2_product_priorities","position":13,"prompt":"Какие качества для тебя наиболее важны в хорошем продукте или услуге?","help_text":"Можно выбрать несколько вариантов","question_type":"multiple_choice","is_required":true,"config":{"max_selected":3,"exclusive_values":["other"]},"options":[["simple","Простота использования"],["affordable","Доступная цена"],["time","Экономия времени"],["useful","Реальная польза"],["personal","Индивидуальный подход"],["safe","Надёжность и безопасность"],["free","Возможность пользоваться бесплатно"],["support","Качественная поддержка"],["transparent","Прозрачность условий"],["other","Другое"]]},
    {"section_slug":"v2_ideas","slug":"v2_dealbreakers","position":14,"prompt":"Что могло бы заставить тебя отказаться от продукта или услуги, даже если они решают твою проблему?","help_text":"Можно выбрать несколько вариантов","question_type":"multiple_choice","is_required":true,"config":{"exclusive_values":["other"]},"options":[["expensive","Слишком высокая цена"],["complex","Сложность использования"],["distrust","Недоверие к компании или разработчикам"],["quality","Сомнения в качестве"],["privacy","Риск утечки личных данных"],["ads","Навязчивая реклама"],["hidden_fees","Скрытые платежи и подписки"],["no_value","Отсутствие реальной пользы"],["other","Другое"]]},
    {"section_slug":"v2_value","slug":"v2_discovery_channels","position":15,"prompt":"Где ты обычно узнаёшь о новых продуктах, услугах и решениях, которые могут быть тебе полезны?","help_text":"Можно выбрать несколько вариантов","question_type":"multiple_choice","is_required":true,"config":{"exclusive_values":["nowhere"]},"options":[["social","Социальные сети"],["telegram","Telegram-каналы и сообщества"],["friends","Рекомендации друзей и знакомых"],["search","Поисковые системы"],["creators","Блогеры и авторы контента"],["reviews","Отзывы других пользователей"],["experts","Рекомендации специалистов"],["ads","Реклама"],["nowhere","Практически нигде"],["other","Другое"]]},
    {"section_slug":"v2_value","slug":"v2_payment_model","position":16,"prompt":"Какая модель оплаты за действительно полезный продукт или услугу тебе ближе?","help_text":null,"question_type":"single_choice","is_required":true,"config":{},"options":[["free","Полностью бесплатно"],["freemium","Бесплатная версия с дополнительными платными возможностями"],["one_time","Разовая покупка"],["subscription","Ежемесячная подписка"],["usage","Оплата только за использование"],["per_feature","Оплата отдельных услуг или функций"],["not_ready","Не готова платить"],["depends","Зависит от пользы"]]},
    {"section_slug":"v2_value","slug":"v2_price_range","position":17,"prompt":"Какую сумму в месяц ты считала бы приемлемой за решение, которое регулярно помогает справляться с важной для тебя проблемой?","help_text":"Варианты будут показаны в валюте страны, которую ты указала выше. Суммы ориентировочно пересчитаны из евро по актуальному обменному курсу.","question_type":"single_choice","is_required":true,"config":{"base_currency":"EUR","currency_question_slug":"v2_country","currency_tiers":[5,10,20,40]},"options":[["not_ready","Не готова платить"],["up_to_5","До 5 €"],["5_10","5–10 €"],["11_20","11–20 €"],["21_40","21–40 €"],["over_40","Более 40 €"],["depends","Зависит от пользы и результата"]]},
    {"section_slug":"v2_value","slug":"v2_beta_interest","position":18,"prompt":"Готова ли ты в будущем протестировать новые продукты или сервисы, созданные с учётом потребностей женщин, и поделиться своим мнением?","help_text":null,"question_type":"single_choice","is_required":true,"config":{},"options":[["yes","Да, с удовольствием"],["maybe_if_interesting","Возможно, если идея мне понравится"],["unsure","Пока не уверена"],["no","Нет"]]}
  ]
  $questions$::jsonb) as q(
    section_slug text, slug text, position integer, prompt text, help_text text,
    question_type text, is_required boolean, config jsonb, options jsonb
  )
), inserted_questions as (
  insert into public.survey_questions
    (version_id,section_id,slug,prompt,help_text,question_type,is_required,allow_other,position,config,is_active)
  select
    v.id,s.id,q.slug,q.prompt,q.help_text,q.question_type,q.is_required,false,q.position,q.config,false
  from question_seed q
  join public.survey_sections s on s.slug=q.section_slug
  join public.survey_versions v on v.slug='wnr_2_0'
  returning id, slug
)
insert into public.survey_options (question_id,value,label,position,is_active)
select iq.id, e.item->>0, e.item->>1, e.ordinality::integer, false
from inserted_questions iq
join question_seed q on q.slug=iq.slug
cross join lateral jsonb_array_elements(q.options) with ordinality as e(item, ordinality);

-- Ensure the new version is available to the Edge Function only after the app/function rollout.
update public.survey_versions set is_active=false where slug='wnr_2_0';
