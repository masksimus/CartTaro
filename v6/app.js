import { ARCANA, TOPICS } from './content.mjs';
import { DEMO_KEY, dayUTC, loadDemo, emptyDemo, demoProgress, openDemo, demoSpread, interpretation, parseLaunch, validProgress, validSpread } from './game.mjs';

const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
const button=(text,fn,cls='')=>{const b=el('button',cls,text);b.type='button';b.addEventListener('click',fn);return b;};
const main=$('content');
let storage;
try{storage=window.localStorage;}catch{storage={getItem:()=>null,setItem:()=>{throw Error('storage');},removeItem:()=>{}};}
let demo=loadDemo(storage), mode='demo', bearer=null, verified=false, writes=false, busy=false, generation=0;
let progress=demoProgress(demo), tab='today', topic='mood', spread=null, spreadTopic='mood', revealed=new Set(), nickname='';
let sessionDay=progress.dayUtc, tasks={reading:false,detail:false,saved:false}, saved=[], deletionPending=false;
let animateDaily=false;
const cleanURL=()=>new URL('./index.html',location.href).href;
const notice=(text='')=>{$('notice').textContent=text;$('notice').hidden=!text;};
function storeDemo(){try{storage.setItem(DEMO_KEY,JSON.stringify(demo));return true;}catch{notice('Хранилище браузера недоступно. Игра работает, но открытия сохранятся только до закрытия страницы.');return false;}}
function setBusy(value){busy=value;main.setAttribute('aria-busy',String(value));main.querySelectorAll('[data-operation]').forEach(b=>b.disabled=value);}
function operation(text,fn,cls='primary'){const b=button(text,fn,cls);b.dataset.operation='true';b.disabled=busy;return b;}
function header(kicker,title,description){const head=el('header','section-top');head.append(el('p','eyebrow',kicker),el('h1','',title),el('p','intro',description));return head;}
function updateDay(){if(mode==='demo')progress=demoProgress(demo);if(sessionDay!==progress.dayUtc){tasks={reading:false,detail:false,saved:false};sessionDay=progress.dayUtc;spread=null;revealed.clear();}}
function showTab(next,focus=false){tab=next;updateDay();render();document.querySelectorAll('[data-tab]').forEach(b=>{if(b.dataset.tab===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});if(focus){main.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}}
function render(){
  main.replaceChildren();
  $('mode').textContent=mode==='demo'?'ЛОКАЛЬНОЕ ДЕМО · БЕЗ ВХОДА В VK':verified?'VK · ПОДПИСЬ ПРОВЕРЕНА':'VK · ВХОД НЕ ПОДТВЕРЖДЁН';
  $('connection').textContent=navigator.onLine?'':'Без сети';
  ({today:renderToday,readings:renderReadings,collection:renderCollection,quests:renderQuests,profile:renderProfile})[tab]();
}
function picture(id,back=false){
  const img=el('img');img.src=back?'./assets/back.svg':`./assets/cards/${id}.svg`;img.width=300;img.height=500;img.alt=back?'Рубашка колоды':`Аркан «${ARCANA[id].name}»`;img.draggable=false;
  img.addEventListener('error',()=>img.replaceWith(el('span','fallback-art',back?'Путь Арканов · открыть карту':ARCANA[id].name)),{once:true});return img;
}
function card(id,{flipped=false,onFlip,label='Открыть карту',reversed=false}={}){
  const b=button('',()=>{if(!b.classList.contains('flipped')&&onFlip)onFlip(b);},'flip-card'+(flipped?' flipped':''));b.setAttribute('aria-label',flipped?ARCANA[id].name:label);b.setAttribute('aria-pressed',String(flipped));
  const inner=el('span','flip-inner'),back=el('span','face back'),front=el('span','face front');back.setAttribute('aria-hidden','true');front.setAttribute('aria-hidden','true');back.append(picture(0,true));
  if(id!==null){const img=picture(id);if(reversed)img.classList.add('reversed-art');front.append(img);}inner.append(back,front);b.append(inner);return b;
}
function progressMeter(){
  const section=el('section','journey'),row=el('div','row'),count=progress.arcana.length;
  row.append(el('strong','',`Ваш атлас · ${count} из 22`),button('К коллекции ↗',()=>showTab('collection',true),'link-button'));
  const meter=el('progress','meter');meter.max=22;meter.value=count;meter.setAttribute('aria-label','Собрано арканов');
  section.append(row,meter,el('p','small',count===22?'Атлас собран. У знакомых карт всегда есть новые вопросы.':`Следующая глава — ${count<5?'5':count<10?'10':'22'} открытых арканов. Возвращайтесь за новой картой.`));return section;
}
function topicPicker(){const group=el('div','topics');group.setAttribute('role','group');group.setAttribute('aria-label','Тема размышления');TOPICS.forEach(t=>{const b=button('',()=>{topic=t.id;render();});b.setAttribute('aria-pressed',String(topic===t.id));b.append(el('span','topic-icon',t.icon),el('span','',t.name));group.append(b);});return group;}
function renderToday(){
  const head=el('header','today-heading'),date=new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(progress.dayUtc+'T12:00:00Z'));
  head.append(el('p','eyebrow',`${date} · ${mode==='demo'?'дата устройства':'дата сервера'} · UTC`),el('h1','',progress.dailyCardDrawn?'Ваша история сегодня':'Маленькая пауза.\nНовый взгляд.'),el('p','intro',progress.dailyCardDrawn?'Одна карта. Столько способов услышать себя.':'Сделайте вдох. Коснитесь колоды и найдите мысль, которую возьмёте с собой.'));
  head.querySelector('h1').classList.add('preserve-lines');main.append(head);
  const stage=el('div','stage'),hasCard=progress.dailyCardId!==null;
  const current=card(progress.dailyCardId,{flipped:hasCard&&!animateDaily,onFlip:()=>drawDaily(),label:'Открыть карту дня'});stage.append(current);main.append(stage);
  if(animateDaily&&hasCard){animateDaily=false;requestAnimationFrame(()=>requestAnimationFrame(()=>{current.classList.add('flipped');current.setAttribute('aria-label',ARCANA[progress.dailyCardId].name);current.setAttribute('aria-pressed','true');}));}
  if(!hasCard){
    const draw=operation(busy?'Открываем…':'Открыть карту дня',drawDaily);draw.id='daily-open';draw.disabled=busy||(mode==='signed'&&(!verified||!writes));current.disabled=draw.disabled;main.append(draw);
    main.append(el('p','subtle',mode==='demo'?'Попробуйте без регистрации · без наград и платежей':writes?'Карта сохраняется на сервере один раз в сутки.':'Новые карты и награды пока отключены. Доступны подписанные расклады.'));
  }else{
    current.onclick=()=>{};
    main.append(el('p','subtle',mode==='demo'?'Сегодняшняя карта останется той же. Новая — после 00:00 UTC.':'Карта сохранена сервером. Следующая — после 00:00 UTC.'));
    main.append(topicPicker());
    const c=ARCANA[progress.dailyCardId],text=interpretation(c.id,topic),result=el('section','result');result.id='daily-result';
    result.append(el('p','eyebrow',`Аркан ${c.id} · ${c.title}`),el('h2','',c.name),el('p','',text.meaning),el('p','advice',text.prompt));
    const actions=el('div','actions');actions.append(button('Сохранить',()=>saveCard(c.id)),button('Поделиться',()=>shareCard(c.id)));result.append(actions);main.append(result);
  }
  main.append(progressMeter());
}
async function drawDaily(){
  updateDay();if(busy||progress.dailyCardDrawn)return;
  if(mode==='demo'){demo=openDemo(demo);progress=demoProgress(demo);storeDemo();animateDaily=true;render();return;}
  if(!verified||!writes)return;
  const epoch=generation;setBusy(true);
  try{const data=await request('/daily/draw','POST');if(epoch!==generation)return;if(!validProgress(data.progress)||data.cardId!==data.progress.dailyCardId)throw Error('invalid_response');progress=data.progress;updateDay();animateDaily=true;notice('Карта дня сохранена сервером.');}
  catch(e){if(epoch===generation)handleError(e);}finally{if(epoch===generation){setBusy(false);render();}}
}
function renderReadings(){
  main.append(header('ЗАЛ РАСКЛАДОВ','О чём поговорим?','Выберите тему. Карты предложат вопросы — ответы остаются за вами.'),topicPicker());
  const options=el('div','spread-options');
  for(const count of [1,3]){const b=operation('',()=>drawSpread(count),'');b.id=`spread-${count}`;b.disabled=busy||(mode==='signed'&&!verified);b.append(el('strong','',count===1?'Одна карта':'Три карты'),el('small','',count===1?'Один вопрос.\nНовый угол зрения.':'Опыт, настоящее\nи следующий шаг.'));options.append(b);}main.append(options);
  if(!spread){main.append(el('p','subtle','Расклады не расходуют и не начисляют награды.'));return;}
  const activeTopic=TOPICS.find(t=>t.id===spreadTopic);main.append(el('p','eyebrow',`Расклад · ${activeTopic.name}`));
  const deck=el('div','spread-deck'+(spread.cards.length===1?' single':''));deck.id='reading-deck';
  spread.cards.forEach((c,i)=>deck.append(card(c.id,{flipped:revealed.has(i),reversed:c.reversed,label:`Перевернуть карту ${i+1}: ${c.position}`,onFlip:b=>{
    revealed.add(i);b.classList.add('flipped');b.setAttribute('aria-label',ARCANA[c.id].name);b.setAttribute('aria-pressed','true');renderMeanings();
  }})));main.append(deck);
  const status=el('p','small');status.id='reading-status';status.setAttribute('role','status');main.append(status);
  const results=el('div','reading-results');results.id='reading-results';results.setAttribute('aria-live','polite');main.append(results);renderMeanings();
}
function renderMeanings(){
  if(!spread||!$('reading-results'))return;
  const target=$('reading-results');target.replaceChildren();
  spread.cards.forEach((c,i)=>{if(!revealed.has(i))return;const text=interpretation(c.id,spreadTopic,c.reversed),article=el('article');article.append(el('p','eyebrow',`${i+1}. ${c.position}${c.reversed?' · обратный взгляд':''}`),el('h2','',ARCANA[c.id].name),el('p','',c.meaning),el('p','advice',text.prompt),el('p','small',c.advice));target.append(article);});
  const done=revealed.size===spread.cards.length;$('reading-status').textContent=done?'Расклад открыт. Какой вопрос отзывается вам больше всего?':`Открыто ${revealed.size} из ${spread.cards.length}. Коснитесь каждой рубашки.`;
  if(done){tasks.reading=true;target.append(button('Сохранить расклад',saveSpread));}
}
async function drawSpread(count){
  if(busy||(mode==='signed'&&!verified))return;const epoch=generation,chosen=topic;setBusy(true);notice();
  try{const data=mode==='demo'?demoSpread(count):await request('/spreads/'+(count===1?'one':'three'));if(epoch!==generation)return;if(!validSpread(data,count))throw Error('invalid_response');spread=data;spreadTopic=chosen;revealed=new Set();}
  catch(e){if(epoch===generation)handleError(e);}finally{if(epoch===generation){setBusy(false);render();}}
}
function renderCollection(){
  main.append(header('ВАШ ЛИЧНЫЙ АТЛАС','Коллекция арканов',`${progress.arcana.length} из 22 историй открыто. Каждая карта — новая грань знакомого мира.`));
  const grid=el('div','collection-grid');grid.id='collection-grid';
  ARCANA.forEach(c=>{const known=progress.arcana.includes(c.id),b=button('',()=>showDetail(c.id,known),'collection-card'+(known?'':' locked'));b.setAttribute('aria-label',known?`Открыто: ${c.name}`:`Не открыт: аркан ${c.id}`);b.append(picture(c.id,!known),el('span','',known?c.name:'Неизвестный аркан'),el('span','number',String(c.id).padStart(2,'0')));grid.append(b);});main.append(grid);
}
function showDetail(id,known){
  const c=ARCANA[id],root=$('detail-content');root.replaceChildren();const heading=el('h2','',known?c.name:'Ещё одна история впереди');heading.id='detail-title';
  root.append(picture(id,!known),heading,el('p','',known?c.light:'Этот аркан ещё не открыт. Возвращайтесь за картой дня, чтобы пополнить свой атлас.'));
  if(known){tasks.detail=true;root.append(el('p','advice',c.advice));}
  $('details').showModal();
}
function renderQuests(){
  main.append(header('МАЛЕНЬКИЕ ШАГИ','Дела для себя','Несколько спокойных минут сегодня. Без гонки, обязательных репостов и штрафов за пропуск.'));
  const items=[['Открыть карту дня','Найдите мысль, которую возьмёте с собой.',progress.dailyCardDrawn,'today'],['Завершить расклад','Откройте все карты в любом раскладе.',tasks.reading,'readings'],['Узнать свой аркан','Откройте подробности собранной карты.',tasks.detail,'collection'],['Сохранить мысль','Сохраните карту дня или законченный расклад.',tasks.saved,'today']];
  items.forEach(([title,description,done,target])=>{const row=el('article','quest'+(done?' done':'')),body=el('div');row.append(el('span','quest-mark',done?'✓':'○'));body.append(el('h3','',title),el('p','',description),el('p','',done?'Выполнено':'Ещё впереди'));if(!done)body.append(button('Перейти ↗',()=>showTab(target,true),'link-button'));row.append(body);main.append(row);});
  main.append(el('p','small',mode==='demo'?'Задания демо не дают наград. Карта дня хранится на устройстве; остальные отметки — до закрытия сессии.':'Карта дня подтверждается сервером. Остальные отметки относятся к текущей сессии и не начисляют награды.'));
  if(mode==='signed'&&verified){const b=operation(progress.claimedToday?'Награда уже получена':'Получить награду дня',claimDaily);b.id='claim';b.disabled=busy||!writes||progress.claimedToday;main.append(b);if(!writes)main.append(el('p','small','Награды отключены до подтверждения выпуска владельцем.'));}
}
async function claimDaily(){
  if(mode!=='signed'||!verified||!writes||busy)return;const epoch=generation;setBusy(true);
  try{const data=await request('/daily/claim','POST');if(epoch!==generation)return;if(!validProgress(data.progress)||typeof data.granted!=='boolean'||!Number.isSafeInteger(data.reward)||data.reward<0)throw Error('invalid_response');progress=data.progress;notice(data.granted?`Сервер подтвердил награду: ${data.reward}.`:'Награда уже была получена. Повторного начисления нет.');}
  catch(e){if(epoch===generation)handleError(e);}finally{if(epoch===generation){setBusy(false);render();}}
}
function renderProfile(){
  const head=el('div','profile-title');head.append(el('div','profile-emblem','✳'),el('p','eyebrow','ПУТЕШЕСТВЕННИК'),el('h1','',mode==='demo'?'Гость атласа':nickname||'Ваш путь'),el('p','intro',mode==='demo'?'Ваши открытия живут только в этом браузере. Демо не создаёт аккаунт VK.':verified?'Ваши карты и серия дней подтверждены сервером.':'Откройте приложение через VK для подтверждения входа.'));main.append(head);
  const stats=el('div','stats');[[progress.arcana.length,'из 22 арканов'],[progress.streak,'дней подряд'],[mode==='demo'?'—':progress.crystals,'наград на сервере']].forEach(([value,label])=>{const stat=el('div','stat');stat.append(el('strong','',value),el('span','',label));stats.append(stat);});main.append(stats);
  if(mode==='signed'&&verified){main.append(operation('Обновить прогресс с сервера',loadSigned,''),button('Показать моё имя из VK',loadNickname,'link-button'));}
  const label=el('label','settings'),check=el('input');check.type='checkbox';check.checked=document.body.classList.contains('reduce-motion');check.addEventListener('change',()=>{document.body.classList.toggle('reduce-motion',check.checked);try{storage.setItem('arcana.v6.motion',check.checked?'reduce':'system');}catch{}});label.append(check,el('span','','Меньше анимации'));main.append(label);
  const journal=el('details'),entries=mode==='demo'?demo.saved:saved;journal.append(el('summary','',`Сохранённые мысли · ${entries.length}`));
  if(!entries.length)journal.append(el('p','small','Здесь появятся сохранённые карты. В VK-режиме заметки живут только до закрытия страницы; их можно скачать.'));
  else{const list=el('ul','saved-list');entries.slice().reverse().forEach(entry=>{const item=el('li','',`${entry.day} · ${entry.title||ARCANA[entry.id].name}`);item.append(button('Скачать текст',()=>downloadText(entry.text||cardText(entry.id)),'link-button'));list.append(item);});journal.append(list);}main.append(journal);
  const help=el('details');help.append(el('summary','','Как устроена игра'),el('p','','Карта дня меняется после полуночи UTC. В демо используется дата устройства, в VK — дата сервера. Повторное открытие не меняет карту. Серия дней не означает обязанность заходить каждый день.'),el('p','','Расклад из трёх карт содержит разные арканы. Обратная карта предлагает другой взгляд, а не «плохую удачу». Расклады не меняют коллекцию и не сохраняются на сервере.'));main.append(help);
  const privacy=el('details');privacy.append(el('summary','','Данные и права'),el('p','','Это изолированная тестовая версия. Карты помогают размышлять и не являются медицинским, финансовым или юридическим советом.'),el('p','','Демо хранит на устройстве даты открытий, коллекцию и до 30 сохранённых мыслей. Параметры входа VK не сохраняются. Нет рекламы, платежей, аналитики и сторонних трекеров.'),el('p','','В VK-режиме сервер обрабатывает подписанный идентификатор и игровой прогресс. Имя запрашивается только по вашему нажатию и остаётся в памяти страницы. Запрос удаления ставится в очередь: он не удаляет данные автоматически.'),el('p','','Оператор, контакт для обращений, сроки хранения и допустимость размещения данных должны быть подтверждены владельцем до публичного выпуска. Тестовая информация не заменяет утверждённую политику.'),el('p','','Иллюстрации: оригинальная векторная коллекция «Путь Арканов», создана для этого проекта. Тексты — оригинальные. Шрифты DejaVu: свободная лицензия; VK Bridge 2.14.0: MIT.'));
  const licenses=el('a','','Лицензии и происхождение ресурсов');licenses.href='./LICENSES.txt';privacy.append(licenses);main.append(privacy);
  if(mode==='demo'){main.append(button('Очистить только локальное демо',confirmClear,'privacy-button'));}
  else if(verified){const remove=operation(deletionPending?'Запрос удаления уже отправлен':'Запросить удаление данных',confirmDeletion,'privacy-button');remove.disabled=busy||deletionPending;main.append(remove);}
  if(mode==='signed')main.append(button('Перейти в локальное демо',startDemo,'link-button'));
}
function confirmClear(){const root=$('detail-content');root.replaceChildren();const title=el('h2','','Очистить демо?');title.id='detail-title';root.append(title,el('p','','Исчезнут только открытия и сохранённые мысли этого браузера. Данные VK не изменятся.'),button('Очистить демо',()=>{demo=emptyDemo();storeDemo();tasks={reading:false,detail:false,saved:false};$('details').close();progress=demoProgress(demo);render();notice('Локальное демо очищено.');},'primary'));$('details').showModal();}
function confirmDeletion(){const root=$('detail-content');root.replaceChildren();const title=el('h2','','Отправить запрос удаления?');title.id='detail-title';root.append(title,el('p','','Сервер проверит вашу подпись и зарегистрирует запрос. Данные не удаляются автоматически; срок обработки пока не утверждён.'),operation('Подтвердить запрос',async()=>{
  if(busy||!verified)return;const epoch=generation;setBusy(true);const submit=root.querySelector('[data-operation]');submit.disabled=true;
  try{const data=await request('/privacy/deletion-request','POST');if(epoch!==generation)return;if(data.status!=='pending')throw Error('invalid_response');deletionPending=true;$('details').close();notice('Запрос зарегистрирован. Удаление ещё не выполнено.');}catch(e){if(epoch===generation){$('details').close();handleError(e);}}finally{if(epoch===generation){setBusy(false);render();}}
},'primary'));$('details').showModal();}
function cardText(id){const c=ARCANA[id],t=interpretation(id,topic);return `${c.name} · ${progress.dayUtc}\n${t.meaning}\n${t.prompt}\n\nПуть Арканов. Для размышления, а не предсказания будущего.`;}
function saveCard(id){
  const entry={id,day:progress.dayUtc,title:ARCANA[id].name,text:cardText(id)};
  if(mode==='demo'){demo.saved=[...demo.saved.filter(x=>x.day!==entry.day),entry].slice(-30);if(!storeDemo()){tasks.saved=true;return;}}else{saved=[...saved.filter(x=>x.day!==entry.day||x.id!==id),entry].slice(-30);}
  tasks.saved=true;notice(mode==='demo'?'Мысль сохранена на этом устройстве. Найти её можно в профиле.':'Мысль сохранена в этой сессии. В профиле можно скачать текст.');
}
function saveSpread(){if(!spread||revealed.size!==spread.cards.length)return;const text=spread.cards.map(c=>`${c.position}: ${ARCANA[c.id].name}\n${c.meaning}\n${interpretation(c.id,spreadTopic,c.reversed).prompt}`).join('\n\n');downloadText(text+'\n\nПуть Арканов. Для размышления.');tasks.saved=true;notice('Текст расклада подготовлен для сохранения на устройство.');}
function downloadText(text){const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=el('a');a.href=url;a.download='Мой-путь-арканов.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function bridgeCall(method,params){if(!window.vkBridge?.send)throw Error('bridge_unavailable');let timer;try{return await Promise.race([window.vkBridge.send(method,params),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('bridge_timeout')),5000);})]);}finally{clearTimeout(timer);}}
async function shareCard(id){
  try{
    // Share only the clean public URL/text; never the VK launch or user identity.
    if(mode==='signed'&&verified&&window.vkBridge?.supports?.('VKWebAppShare')){await bridgeCall('VKWebAppShare',{link:cleanURL()});notice('Диалог VK закрыт.');}
    else if(navigator.share){await navigator.share({title:'Путь Арканов',text:cardText(id),url:cleanURL()});notice('Диалог отправки закрыт.');}
    else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(cardText(id));notice('Текст карты скопирован. Отправьте его, когда захотите.');}
    else{downloadText(cardText(id));notice('Текст карты подготовлен для сохранения.');}
  }catch(e){notice(e?.name==='AbortError'?'Отправка отменена.':'Не удалось открыть отправку. Можно сохранить текст через профиль.');}
}
async function loadNickname(){if(!verified||mode!=='signed')return;const epoch=generation;try{const info=await bridgeCall('VKWebAppGetUserInfo');if(epoch!==generation)return;const expected=new URLSearchParams(bearer).get('vk_user_id');if(String(info?.id)!==expected||typeof info.first_name!=='string')throw Error('identity');nickname=info.first_name.slice(0,70);render();}catch{notice('VK не передал имя. Можно продолжить без него.');}}
async function request(path,method='GET'){
  if(mode!=='signed'||!bearer)throw Error('unauthorized');
  const res=await fetch(location.origin+'/api/v2'+path,{method,headers:{Authorization:'Bearer '+bearer},credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(12000)});
  if(!res.ok){const e=Error('api_error');e.status=res.status;throw e;}return res.json();
}
function handleError(e){
  writes=false;
  let text='Нет связи с сервером. Проверьте сеть и повторите соединение. Доступно локальное демо.';
  if(e.status===401||e.status===403){bearer=null;verified=false;progress=demoProgress(emptyDemo());nickname='';saved=[];spread=null;revealed.clear();tasks={reading:false,detail:false,saved:false};text='Вход VK не подтверждён или истёк. Закройте приложение и заново откройте его внутри VK.';}
  else if(e.status===503)text='Сервер или действие временно недоступны. Прогресс не изменён. Повторите соединение или откройте локальное демо.';
  else if(e.status===429)text='Слишком много запросов. Подождите немного и повторите соединение.';
  else if(e.message==='invalid_response')text='Не удалось проверить ответ сервера. Действия приостановлены. Повторите соединение.';
  notice(text);$('recovery').hidden=false;$('retry').hidden=!bearer;
}
async function loadSigned(){
  if(!bearer||busy)return;const epoch=generation;setBusy(true);writes=false;
  try{
    const p=await request('/progress');if(epoch!==generation)return;if(!validProgress(p))throw Error('invalid_response');progress=p;verified=true;updateDay();
    // Public status never authenticates; progress above must succeed first.
    try{const s=await request('/status');if(epoch!==generation)return;writes=s?.service==='tarot-v2-postgres'&&s.appId===54582199&&s.storageConfigured===true&&s.rewardsEnabled===true&&s.mode==='public_game';}catch{writes=false;}
    notice(writes?'': 'Вход подтверждён. Новые карты и награды отключены; можно открыть расклад.');$('recovery').hidden=true;
  }catch(e){if(epoch===generation)handleError(e);}finally{if(epoch===generation){setBusy(false);render();}}
}
function startDemo(){generation++;bearer=null;verified=false;writes=false;mode='demo';busy=false;nickname='';deletionPending=false;saved=[];spread=null;revealed.clear();tasks={reading:false,detail:false,saved:false};demo=loadDemo(storage);progress=demoProgress(demo);$('recovery').hidden=true;notice('Локальное демо. Нет входа в VK, серверных запросов и наград.');showTab('today',true);cacheDemo();}
async function cacheDemo(){if(!('serviceWorker'in navigator))return;try{await navigator.serviceWorker.register('./sw.js',{scope:'./'});}catch{notice('Демо работает. Автономное открытие пока недоступно: для следующего запуска может понадобиться сеть.');}}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab,true)));
document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();showTab('today',true);});
$('close-details').addEventListener('click',()=>$('details').close());$('retry').addEventListener('click',loadSigned);$('demo').addEventListener('click',startDemo);
window.addEventListener('offline',()=>{$('connection').textContent='Без сети';notice(mode==='demo'?'Вы без сети. Сохранённое демо продолжает работать.':'Нет сети. Серверные действия недоступны. Дождитесь соединения или откройте локальное демо.');});
window.addEventListener('online',()=>{$('connection').textContent='';if(mode==='demo')notice('Соединение восстановлено.');else{$('recovery').hidden=false;$('retry').hidden=!bearer;notice('Соединение восстановлено. Обновите прогресс.');}});
document.addEventListener('visibilitychange',()=>{if(document.hidden||busy)return;if(mode==='demo'){updateDay();render();}else if(verified)loadSigned();});
setInterval(()=>{if(document.hidden||busy||progress.dayUtc===dayUTC())return;if(mode==='demo'){updateDay();render();}else if(verified)loadSigned();},60000);
try{document.body.classList.toggle('reduce-motion',storage.getItem('arcana.v6.motion')==='reduce');}catch{}
const rawLaunch=window.takeTarotLaunch?.()||'';
// The exported anonymous showcase cannot enter signed mode, even with a query.
const launch=document.querySelector('meta[name="arcana-demo-only"]')?null:parseLaunch(rawLaunch);
clearTimeout(window.tarotStartupTimer);delete window.tarotStartupTimer;
if(launch){mode='signed';bearer=launch;progress=demoProgress(emptyDemo());render();bridgeCall('VKWebAppInit').catch(()=>{if(mode==='signed'&&verified&&$('recovery').hidden)notice('VK Bridge не ответил. Сервер проверил вход независимо; отправка и имя могут быть недоступны.');});loadSigned();}
else{render();cacheDemo();}
