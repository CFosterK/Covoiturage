'use strict';

const APP_VERSION = 6;
const DATA_FORMAT = 'covoiturage-itineraires';
const SCHEMA_VERSION = 3;
const STORAGE_KEY = 'covoiturageItinerairesDataV1';
const MAX_BACKUP_SIZE = 20_000_000;
const MAX_PEOPLE = 30;
const BACKUP_REMINDER_DAYS = 30;
const DEFAULT_DATA = Object.freeze({
  format:'covoiturage-itineraires',schema:3,
  settings:{consumption:6,energyPrice:2.31,energyType:'fuel',vehicleCostPerKm:0.10,theme:'system',maxPassengers:3},
  routes:[],lastRouteId:null,
  people:[],
  archivedPeople:[],
  lastBackupAt:null,
  trips:[],
  payments:[]
});

const cloneDefaults = () => JSON.parse(JSON.stringify(DEFAULT_DATA));
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const isNumeric = value => (typeof value==='number' || (typeof value==='string' && value.trim()!=='')) && Number.isFinite(Number(value));
const finite = (value, fallback=0) => isNumeric(value) ? Number(value) : fallback;
const clamp = (value, min, max, fallback=min) => Math.min(max, Math.max(min, finite(value, fallback)));
const localISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const getToday = () => localISO(new Date());
const makeId = () => `${Date.now().toString(36)}${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
const safeId = value => /^[A-Za-z0-9_-]{1,80}$/.test(String(value||'')) ? String(value) : makeId();
const isRecord = value => value!==null && typeof value==='object' && !Array.isArray(value);
const optionalNumber = (value,max) => isNumeric(value) ? clamp(value,0,max,0) : null;
const personIndex = value => isNumeric(value) && Number.isInteger(Number(value)) ? Number(value) : -1;
function uniqueId(value,seen){
  let id=safeId(value);
  while(seen.has(id)) id=makeId();
  seen.add(id);
  return id;
}
const safeDate = (value, fallback=getToday()) => {
  const s=String(value||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
  const [y,m,d]=s.split('-').map(Number), date=new Date(y,m-1,d,12);
  return date.getFullYear()===y && date.getMonth()===m-1 && date.getDate()===d ? s : fallback;
};
const safeIsoDateTime = value => {
  if(typeof value!=='string' || value.length>60) return null;
  const d=new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const cleanName = (value, fallback) => {
  const text=String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,40);
  return text || fallback;
};
const escapeHTML = value => String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const euro = n => `${Math.round(finite(n,0))} €`;
const paymentEuro = n => `${finite(n,0).toLocaleString('fr-FR',{maximumFractionDigits:2})} €`;
const decimal = (n,digits=1) => finite(n,0).toLocaleString('fr-FR',{minimumFractionDigits:0,maximumFractionDigits:digits});

const UI_ICONS = Object.freeze({
  edit:'<span class="btn-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m16 3 5 5M21 8 8 21H3v-5L16 3a3.54 3.54 0 0 1 5 5Z"/></svg></span>',
  payment:'<span class="btn-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M12 5v14M5 12h14"/></svg></span>',
  archive:'<span class="btn-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><rect x="3" y="3" width="18" height="4" rx="1"/><path d="M5 7v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7M10 12h4"/></svg></span>',
  restore:'<span class="btn-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2"/></svg></span>',
  trash:'<span class="btn-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M3 6h18M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M10 10v7M14 10v7"/></svg></span>'
});

// This independent application accepts only its own complete schema.
function validDataShape(v){
  const number=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
  const name=n=>typeof n==='string'&&n.length>0&&n.length<=40&&cleanName(n,'')===n;
  const id=n=>typeof n==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(n);
  const unique=arr=>new Set(arr).size===arr.length;
  if(!isRecord(v)||v.format!==DATA_FORMAT||![1,2,3].includes(v.schema)||!isRecord(v.settings)||!Array.isArray(v.people)||v.people.length>MAX_PEOPLE||!v.people.every(name)||!Array.isArray(v.archivedPeople)||!Array.isArray(v.routes)||!Array.isArray(v.trips)||!Array.isArray(v.payments))return false;
  const person=i=>Number.isInteger(i)&&i>=0&&i<v.people.length;
  if(!v.archivedPeople.every(person)||!unique(v.archivedPeople))return false;
  const st=v.settings;
  if(!number(st.consumption,0,100)||!number(st.energyPrice,0,20)||!number(st.vehicleCostPerKm,0,10)||!['fuel','electric'].includes(st.energyType)||!['system','light','dark'].includes(st.theme))return false;
  if(v.schema===3&&(!Number.isInteger(st.maxPassengers)||st.maxPassengers<1||st.maxPassengers>8))return false;
  if(v.schema===2&&(![1,0.5,0.01].includes(st.rounding)||!Number.isInteger(st.maxPassengers)||st.maxPassengers<1||st.maxPassengers>8))return false;
  if(!v.routes.every(r=>isRecord(r)&&id(r.id)&&name(r.name)&&number(r.distance,0.001,2000)&&number(r.toll,0,1000)&&typeof r.archived==='boolean'&&(r.deleted===undefined||typeof r.deleted==='boolean')&&(!r.deleted||r.archived))||!unique(v.routes.map(r=>r.id))||!unique(v.routes.filter(r=>!r.deleted).map(r=>r.name.normalize('NFC').toLocaleLowerCase('fr-FR'))))return false;
  const routeIds=new Set(v.routes.map(r=>r.id));
  if(v.lastRouteId!==null&&!routeIds.has(v.lastRouteId))return false;
  if(v.lastBackupAt!==null&&safeIsoDateTime(v.lastBackupAt)!==v.lastBackupAt)return false;
  if(!v.trips.every(t=>isRecord(t)&&id(t.id)&&safeDate(t.date,null)===t.date&&Array.isArray(t.people)&&t.people.length<=(v.schema===1?3:16)&&t.people.every(person)&&unique(t.people)&&routeIds.has(t.routeId)&&name(t.routeName)&&['oneway','roundtrip'].includes(t.direction)&&safeIsoDateTime(t.createdAt)===t.createdAt&&(t.pricing===undefined||(v.schema===3&&t.pricing==='automatic-v4'&&Array.isArray(t.contributions)))&&(t.contributions===undefined?number(t.rate,0,200000):validContributions(t))&&number(t.cost,0,200000)&&number(t.distance,0.001,4000)&&number(t.toll,0,2000)&&number(t.consumption,0,100)&&number(t.energyPrice,0,20)&&number(t.vehicleCostPerKm,0,10)&&number(t.energyUsed,0,4000)&&['fuel','electric'].includes(t.energyType))||!unique(v.trips.map(t=>t.id)))return false;
  return v.payments.every(p=>isRecord(p)&&id(p.id)&&person(p.person)&&number(p.amount,0.01,1000000)&&Math.abs(p.amount*100-Math.round(p.amount*100))<0.000001&&safeDate(p.date,null)===p.date)&&unique(v.payments.map(p=>p.id));
}
function validContributions(t){
  const money=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=200000&&Math.abs(n*100-Math.round(n*100))<0.000001;
  if(t.pricing==='automatic-v4'){
    if(t.direction!=='roundtrip'||!Number.isInteger(t.capacity)||t.capacity<1||t.capacity>8||!Array.isArray(t.contributions)||t.contributions.length!==t.people.length||t.people.length>t.capacity)return false;
    return t.contributions.every(c=>isRecord(c)&&t.people.includes(c.person)&&['both','single'].includes(c.presence)&&money(c.amount)&&Math.abs(c.amount/(c.presence==='both'?1:0.5)-Math.round(c.amount/(c.presence==='both'?1:0.5)))<0.000001&&c.outbound===undefined&&c.return===undefined)&&new Set(t.contributions.map(c=>c.person)).size===t.people.length;
  }
  if(![1,0.5,0.01].includes(t.rounding)||!Number.isInteger(t.capacity)||t.capacity<1||t.capacity>8||!Array.isArray(t.contributions)||t.contributions.length!==t.people.length)return false;
  if(!t.contributions.every(c=>isRecord(c)&&t.people.includes(c.person)&&['outbound','return','both'].includes(c.presence)&&money(c.outbound)&&money(c.return)&&money(c.amount)&&Math.abs(c.amount-c.outbound-c.return)<0.000001&&(c.presence!=='outbound'||c.return===0)&&(c.presence!=='return'||c.outbound===0)&&(t.direction!=='oneway'||c.presence==='outbound')))return false;
  return new Set(t.contributions.map(c=>c.person)).size===t.people.length&&['outbound','return'].every(leg=>t.contributions.filter(c=>c.presence===leg||c.presence==='both').length<=t.capacity);
}
function normalizeData(raw){
  const next=JSON.parse(JSON.stringify(raw));
  if(next.schema===1){next.schema=2;next.settings.rounding=1;next.settings.maxPassengers=3;}
  next.schema=3;delete next.settings.rounding;
  return next;
}
function normalizationWarnings(raw){return validDataShape(raw)?[]:['Le format ou les valeurs sont invalides. Aucune donnée ne sera remplacée.'];}

let data=cloneDefaults(), storedRaw=null, storageProblem='';
try{
  storedRaw=localStorage.getItem(STORAGE_KEY);
  if(storedRaw!==null){
    const raw=JSON.parse(storedRaw);
    if(!validDataShape(raw)) throw new Error('format');
    data=normalizeData(raw);
    const warnings=normalizationWarnings(raw,data);
    if(warnings.length) storageProblem='Des données locales nécessitent une vérification. '+warnings.join(' ');
  }
}catch{ storageProblem='Les données locales ne peuvent pas être lues correctement.'; }
let savedData=JSON.stringify(data);

function saveData({allowRecovery=false}={}){
  try{
    if(storageProblem && !allowRecovery) throw new Error('protected');
    if(localStorage.getItem(STORAGE_KEY)!==storedRaw) throw new Error('conflict');
    if(!validDataShape(data)) throw new Error('invalid-data');
    const serialized=JSON.stringify(data);
    localStorage.setItem(STORAGE_KEY,serialized);
    savedData=serialized;
    storedRaw=serialized;
    storageProblem='';
    return true;
  }catch(error){
    data=JSON.parse(savedData);
    applyTheme();
    renderAll();
    const message=error.message==='protected'
      ? 'Les données originales sont protégées. Dans Réglages, sauvegardez leur copie puis restaurez une sauvegarde pour les vérifier.'
      : error.message==='conflict'
        ? 'Les données locales ont changé dans une autre fenêtre. Fermez puis rouvrez cette fenêtre avant de réessayer.'
        : 'Impossible d’enregistrer sur cet appareil (stockage plein ou indisponible). La modification a été annulée ; les données précédentes sont conservées.';
    alert(message);
    return false;
  }
}

function flash(message){
  const el=$('#status');
  el.textContent=message;
  clearTimeout(flash.timer);
  flash.timer=setTimeout(()=>{el.textContent='';},2200);
}

const personName = index => data.people[index] || `Passager ${Number(index)+1}`;
const isArchived = index => data.archivedPeople.includes(index);
const activePeopleIndices = () => data.people.map((_,i)=>i).filter(i=>!isArchived(i));
// Route choice and editor drafts are UI state, separate from stored records.
let editingTripId=null,newTripDraft=null,tripSaving=false,tripSaveUntil=0;
let activePaymentPerson=null,paymentSaving=false;
let personEditorMode=null,personEditorIndex=null,personSaving=false,personEditorContext='settings';
let passengerPresences={};
let routeEditorId=null,routeEditorOpen=false,routeSaving=false,routeEditorContext='settings';
let selectedRouteId=null,selectedDirection='roundtrip',routePanelOpen=false;
const editingTrip=()=>data.trips.find(t=>t.id===editingTripId);
const selectedPassengers=()=>$$('[data-person]:checked').map(el=>Number(el.dataset.person));
const routeById=id=>data.routes.find(r=>r.id===id);
const activeRoutes=()=>data.routes.filter(r=>!r.archived&&!r.deleted);
const directionLabel=d=>d==='oneway'?'Aller simple':'Aller-retour';
function ensureRouteChoice(){
  const route=routeById(selectedRouteId),original=editingTrip();
  if(!route||((route.archived||route.deleted)&&original?.routeId!==route.id))selectedRouteId=activeRoutes().find(r=>r.id===data.lastRouteId)?.id||activeRoutes()[0]?.id||null;
}
function tripParameters(){
  const route=routeById(selectedRouteId),factor=2;
  const {consumption,energyType,energyPrice,vehicleCostPerKm}=data.settings;
  const single=routeSingle(route);
  const distance=single.distance*factor,toll=single.toll*factor;
  return {routeId:route?.id,routeName:route?.deleted&&editingTrip()?.routeId===route.id?editingTrip().routeName:route?.name,direction:'roundtrip',distance,toll,consumption,energyType,energyPrice,vehicleCostPerKm,energyUsed:distance*consumption/100};
}
const tripCost=()=>{const p=tripParameters();return p.energyUsed*p.energyPrice+p.toll+p.distance*p.vehicleCostPerKm;};
const presenceLabel=p=>({outbound:'Aller',return:'Retour',single:'Aller simple',both:'Aller-retour'})[p];
const editablePresence=p=>p==='both'?'both':'single';
const presenceOf=i=>passengerPresences[i]||'both';
function routeSingle(route){
  const original=editingTrip();
  if(route?.deleted&&original?.routeId===route.id){const factor=original.direction==='roundtrip'?2:1;return {distance:original.distance/factor,toll:original.toll/factor};}
  return {distance:route?.distance||0,toll:route?.toll||0};
}
function roundedShare(cost,count,step){
  if(!count)return 0;
  const units=cost/(count+1)/step;
  return Math.round((Math.floor(units+0.5+1e-10)*step)*100)/100;
}
// V4 shares a theoretical roundtrip; a single journey is half that share before rounding.
function calculateParticipation(cost,choices,capacity){
  const count=choices.length;
  const contributions=choices.map(c=>({...c,amount:roundedShare(c.presence==='both'?cost:cost/2,count,c.presence==='both'?1:0.5)}));
  const total=contributions.reduce((n,c)=>n+Math.round(c.amount*100),0)/100;
  return {contributions,total,driver:cost-total,overflow:count>capacity};
}
function tripContribution(t,i){return t.contributions?.find(c=>c.person===i)?.amount??(t.contributions?0:t.rate);}
function tripPresence(t,i){return t.contributions?.find(c=>c.person===i)?.presence||(t.direction==='oneway'?'outbound':'both');}
function tripParticipation(t){return t.people.reduce((sum,i)=>sum+Math.round(tripContribution(t,i)*100),0)/100;}
function currentParticipation(){return calculateParticipation(tripCost(),selectedPassengers().map(person=>({person,presence:presenceOf(person)})),data.settings.maxPassengers);}
function capacityBlocked(){const original=editingTrip();return !(original&&!shouldRecalculateTrip(original))&&currentParticipation().overflow;}
function calculationSnapshot(){return {cost:tripCost(),contributions:currentParticipation().contributions,pricing:'automatic-v4',capacity:data.settings.maxPassengers};}
function renderRouteChoice(){
  ensureRouteChoice();
  $('#routeTitle').textContent=routeById(selectedRouteId)?.name||'Choisir un itinéraire';
  $('#routeToggle').disabled=!selectedRouteId;
  $('#routeToggle').setAttribute('aria-expanded',String(routePanelOpen));
  $('#routePanel').hidden=!routePanelOpen;
  $('#noRoutes').hidden=activeRoutes().length>0;
  $('#save').disabled=!selectedRouteId||tripSaving||Date.now()<tripSaveUntil||capacityBlocked();
}
function openRoutePanel(){
  ensureRouteChoice();if(!selectedRouteId)return;
  const original=editingTrip();
  const choices=data.routes.filter(r=>(!r.archived&&!r.deleted)||r.id===original?.routeId);
  $('#routePanel').innerHTML=choices.map(r=>{
    const single=routeSingle(r),selected=r.id===selectedRouteId;
    const name=r.name+(r.deleted?' (supprimé)':r.archived?' (archivé)':'');
    return `<button type="button" class="route-option" data-choice-route="${r.id}" aria-pressed="${selected}"><span class="route-option-copy"><span class="route-option-name">${escapeHTML(name)}</span><span class="route-option-detail">Aller-retour · ${decimal(single.distance*2,3)} km · ${single.toll?`Péage ${paymentEuro(single.toll*2)}`:'Sans péage'}</span></span><svg class="route-option-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m20 6-11 11-5-5"/></svg></button>`;
  }).join('');
  routePanelOpen=true;renderRouteChoice();
}
function closeRoutePanel(restoreFocus=false){
  if($('#routePanel').contains(document.activeElement))document.activeElement.blur();
  routePanelOpen=false;renderRouteChoice();if(restoreFocus)$('#routeToggle').focus({preventScroll:true});
}
function selectRouteChoice(id){
  const r=routeById(id),original=editingTrip();
  if(!routePanelOpen||!r||((r.archived||r.deleted)&&r.id!==original?.routeId))return;
  selectedRouteId=r.id;
  closeRoutePanel(true);calcToday();
}
function routeTrigger(){return routeEditorId?$(`.edit-route[data-route-id="${routeEditorId}"]`):$(routeEditorContext==='today'?'#createFirstRoute':'#addRoute');}
function mountRouteEditor(){
  if(!routeEditorOpen)return;
  const slot=routeEditorId?$(`#route-edit-${routeEditorId}`):$(routeEditorContext==='today'?'#tripRouteAddSlot':'#routeAddSlot');
  if(!slot){closeRouteEditor();return;}
  slot.append($('#routeEditor'));routeTrigger()?.setAttribute('aria-expanded','true');
}
function closeRouteEditor(restoreFocus=false){
  const trigger=routeTrigger(),form=$('#routeEditor');
  if(form.contains(document.activeElement))document.activeElement.blur();
  $('#routeEditorHome').append(form);form.reset();$('#routeError').textContent='';
  trigger?.setAttribute('aria-expanded','false');routeEditorOpen=false;routeEditorId=null;routeEditorContext='settings';
  if(restoreFocus)trigger?.focus({preventScroll:true});
}
function openRouteEditor(id=null,context='settings'){
  const r=routeById(id);if(id&&(!r||r.archived||r.deleted))return;
  closePersonEditor();closeRouteEditor();closeRoutePanel();routeEditorOpen=true;routeEditorId=id;routeEditorContext=context;
  $('#routeName').value=r?.name||'';$('#routeDistance').value=r?.distance??'';$('#routeToll').value=r?.toll??0;
  mountRouteEditor();$('#routeName').focus();
}
function renderRoutes(){
  $('#routeEditorHome').append($('#routeEditor'));
  const row=r=>`<div class="person-management-row"><strong class="person-management-name">${escapeHTML(r.name)}</strong><p class="small route-meta">Aller simple · ${decimal(r.distance,3)} km · Péage ${paymentEuro(r.toll)}</p><div class="person-management-actions">${r.archived?`<button type="button" class="btn secondary compact has-icon reactivate-route" data-route-id="${r.id}">${UI_ICONS.restore}<span class="btn-label">Réactiver</span></button><button type="button" class="btn danger compact has-icon delete-route" data-route-id="${r.id}">${UI_ICONS.trash}<span class="btn-label">Supprimer</span></button>`:`<button type="button" class="btn secondary compact has-icon edit-route" data-route-id="${r.id}" aria-expanded="false" aria-controls="route-edit-${r.id}">${UI_ICONS.edit}<span class="btn-label">Modifier</span></button><button type="button" class="btn secondary compact has-icon archive-route" data-route-id="${r.id}">${UI_ICONS.archive}<span class="btn-label">Archiver</span></button>`}</div><div id="route-edit-${r.id}"></div></div>`;
  $('#activeRoutes').innerHTML=activeRoutes().map(row).join('');
  const archived=data.routes.filter(r=>r.archived&&!r.deleted);$('#archivedRoutesSection').hidden=!archived.length;
  $('#archivedRoutesCount').textContent=`(${archived.length})`;$('#archivedRoutes').innerHTML=archived.map(row).join('');mountRouteEditor();
}
function saveRoute(){
  if(!routeEditorOpen||routeSaving)return;
  const raw=$('#routeName').value.replace(/\s+/g,' ').trim(),name=cleanName(raw,''),distance=Number($('#routeDistance').value.replace(',','.')),toll=Number($('#routeToll').value.replace(',','.'));
  const error=$('#routeError');error.textContent='';
  if(!name||raw.length>40){error.textContent='Saisissez un nom de 1 à 40 caractères.';$('#routeName').focus();return;}
  if(data.routes.some(r=>!r.deleted&&r.id!==routeEditorId&&comparablePersonName(r.name)===comparablePersonName(name))){error.textContent='Ce nom existe déjà, y compris parmi les itinéraires archivés. Choisissez un autre nom ou réactivez cet itinéraire.';$('#routeName').focus();return;}
  if(!$('#routeDistance').value.trim()||!Number.isFinite(distance)||distance<0.001||distance>2000){error.textContent='Saisissez une distance supérieure à 0 (de 0,001 à 2 000 km).';$('#routeDistance').focus();return;}
  if(!$('#routeToll').value.trim()||!Number.isFinite(toll)||toll<0||toll>1000){error.textContent='Saisissez un péage de 0 à 1 000 €.';$('#routeToll').focus();return;}
  routeSaving=true;$('#saveRoute').disabled=true;
  try{
    const id=routeEditorId||makeId(),fromTrip=routeEditorContext==='today';
    if(routeEditorId)Object.assign(routeById(routeEditorId),{name,distance,toll});
    else data.routes.push({id,name,distance,toll,archived:false});
    if(saveData()){if(fromTrip)selectedRouteId=id;closeRouteEditor();renderAll();if(fromTrip)$('#routeToggle').focus({preventScroll:true});flash('Itinéraire enregistré ✓');}
    else error.textContent='L’enregistrement a échoué. Votre saisie est conservée.';
  }finally{routeSaving=false;$('#saveRoute').disabled=false;}
}
function archiveRoute(id,archived){
  const r=routeById(id);if(!r||r.deleted||r.archived===archived)return;
  if(archived&&!confirm(`Archiver ${r.name} ? Ses trajets et leurs montants seront conservés.`))return;
  r.archived=archived;
  if(saveData()){if(routeEditorId===id)closeRouteEditor();closeRoutePanel();renderAll();flash(archived?'Itinéraire archivé ✓':'Itinéraire réactivé ✓');}
}

function deleteArchivedRoute(id){
  const r=routeById(id);if(!r||!r.archived||r.deleted)return;
  if(!confirm(`Supprimer définitivement ${r.name} de Réglage ? Ses trajets, leurs montants et les versements seront conservés. Les soldes ne changeront pas. Cet itinéraire ne pourra plus être réactivé.`))return;
  r.deleted=true;if(data.lastRouteId===id)data.lastRouteId=null;
  if(saveData()){closeRoutePanel();renderAll();flash('Itinéraire supprimé · historiques conservés');}
}
const PRESENCE_CYCLE=['both','single'];
const PRESENCE_ICONS={
  single:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  return:'<path d="M20 12H4m6-6-6 6 6 6"/>',
  both:'<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/>'
};
function renderPeople(selected=[]){
  const original=editingTrip(),active=[...new Set([...activePeopleIndices(),...(original?.people||[])])];
  $('#addTripPerson').hidden=activePeopleIndices().length>0;
  $('#people').innerHTML=active.length?active.map(i=>`<div class="person-trip-row"><div class="person-header"><label class="person"><input type="checkbox" data-person="${i}"${selected.includes(i)?' checked':''}><span>${escapeHTML(personName(i))}${isArchived(i)?'<small class="archive-tag">archivé</small>':''}</span></label><button type="button" class="btn secondary presence-cycle" data-cycle-person="${i}"></button></div></div>`).join(''):'<p class="small">Aucun passager actif.</p>';
  $$('[data-person]').forEach(el=>el.addEventListener('change',()=>{
    if(passengerPresences[el.dataset.person]===undefined)passengerPresences[el.dataset.person]='both';
    calcToday();
  }));
  $$('[data-cycle-person]').forEach(button=>button.addEventListener('click',()=>{
    const i=Number(button.dataset.cyclePerson);
    if(button.disabled)return;
    passengerPresences[i]=PRESENCE_CYCLE[(PRESENCE_CYCLE.indexOf(presenceOf(i))+1)%PRESENCE_CYCLE.length];
    calcToday();animatePresencePress(button);
  }));
  calcToday();
}

function shouldRecalculateTrip(original){
  if(!original) return false;
  const people=selectedPassengers();
  return selectedRouteId!==original.routeId || $('#tripDate').value!==original.date || people.length!==original.people.length || people.some(i=>!original.people.includes(i)||presenceOf(i)!==editablePresence(tripPresence(original,i)));
}

function calcToday(){
  renderRouteChoice();
  const people=selectedPassengers(),original=editingTrip(),preserve=original&&!shouldRecalculateTrip(original),computed=currentParticipation();
  const cost=preserve?original.cost:tripCost(),total=preserve?tripParticipation(original):computed.total;
  $('#count').textContent=people.length;$('#perPerson').textContent=paymentEuro(cost-total);$('#received').textContent=paymentEuro(total);$('#tripCost').textContent=paymentEuro(cost);
  $('#capacityError').textContent=!preserve&&computed.overflow?`Capacité dépassée : ${data.settings.maxPassengers} passager(s) maximum, hors conducteur.`:'';
  $$('[data-person]').forEach(el=>{
    const i=Number(el.dataset.person);
    const button=$(`[data-cycle-person="${i}"]`),presence=presenceOf(i),next=PRESENCE_CYCLE[(PRESENCE_CYCLE.indexOf(presence)+1)%PRESENCE_CYCLE.length];
    button.hidden=false;
    button.innerHTML=`<span class="presence-face" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${PRESENCE_ICONS[presence]}</svg></span>`;
    button.setAttribute('aria-label',`${personName(i)} : ${presenceLabel(presence)}. Passer à ${presenceLabel(next)}.`);
  });
  renderTripMode();
}

function renderTripMode(){
  syncDateDisplays();
  const original=editingTrip();
  $('#tripTitle').textContent=original?'Modifier le trajet':'Trajet';
  $('#saveTripLabel').textContent=original?'Enregistrer les modifications':'Enregistrer le trajet';
  $('#cancelEdit').classList.toggle('hidden',!original);
  $('#editNotice').classList.toggle('hidden',!original);
  if(original) $('#editNotice').textContent=shouldRecalculateTrip(original)?'Ce trajet sera recalculé selon les tarifs automatiques V4, avec un aller-retour conducteur. Les autres trajets restent inchangés.':'Sans changement, les montants et les présences historiques sont conservés. Modifier la date, les passagers, leur participation ou l’itinéraire recalcule uniquement ce trajet selon les tarifs V4 (conducteur en aller-retour).';
}

function startEditTrip(id){
  const original=data.trips.find(t=>t.id===id);
  if(!original) return;
  newTripDraft={date:$('#tripDate').value,people:selectedPassengers(),routeId:selectedRouteId,direction:selectedDirection,presences:{...passengerPresences}};
  passengerPresences=Object.fromEntries(original.people.map(i=>[i,editablePresence(tripPresence(original,i))]));
  editingTripId=id;selectedRouteId=original.routeId;selectedDirection=original.direction;routePanelOpen=false;
  $('#tripDate').value=original.date;
  renderTripMode();renderPeople(original.people);selectTab('today');
}

function finishEditing(){
  const draft=newTripDraft;
  passengerPresences={...draft?.presences};
  editingTripId=null;newTripDraft=null;selectedRouteId=draft?.routeId||null;selectedDirection=draft?.direction||'roundtrip';routePanelOpen=false;
  $('#tripDate').value=draft?.date||getToday();
  renderTripMode();renderPeople((draft?.people||[]).filter(i=>!isArchived(i)));
}

function saveEditedTrip(){
  const index=data.trips.findIndex(t=>t.id===editingTripId), original=data.trips[index];
  if(!original){alert('Ce trajet n’existe plus.');finishEditing();renderHistory();return;}
  const date=safeDate($('#tripDate').value,null);
  if(!date){alert('Choisissez une date valide.');$('#tripDate').focus();return;}
  const people=selectedPassengers();
  if(capacityBlocked()){calcToday();return;}
  const updated={...original,date,people};
  if(shouldRecalculateTrip(original)){
    Object.assign(updated,tripParameters(),calculationSnapshot());delete updated.rate;delete updated.rounding;
  }
  data.trips[index]=updated;
  if(saveData()){
    tripSaveUntil=Date.now()+900;
    const draft=newTripDraft;
    finishEditing();renderAll();
    renderPeople((draft?.people||[]).filter(i=>!isArchived(i)));
    selectTab('history');flash('Trajet modifié ✓');
  }
}

function addTrip(){
  if(tripSaving||Date.now()<tripSaveUntil)return;
  ensureRouteChoice();if(!selectedRouteId){alert('Ajoutez un itinéraire pour enregistrer un trajet.');return;}
  const people=selectedPassengers();
  if(capacityBlocked()){calcToday();return;}
  const selectedDate=safeDate($('#tripDate').value,null);
  if(!selectedDate){alert('Choisissez une date valide.');$('#tripDate').focus();return;}
  tripSaving=true;$('#save').disabled=true;
  try{
    if(editingTripId){saveEditedTrip();return;}
    data.trips.push({id:makeId(),date:selectedDate,people,...calculationSnapshot(),createdAt:new Date().toISOString(),...tripParameters()});
    data.lastRouteId=selectedRouteId;
    if(saveData()){
      tripSaveUntil=Date.now()+900;
      selectedDirection='roundtrip';passengerPresences={};closeRoutePanel();renderAll();flash('Nouveau trajet enregistré ✓');
    }
  }finally{tripSaving=false;renderRouteChoice();setTimeout(renderRouteChoice,920);}
}


function upperFirst(text){return text.replace(/^./,letter=>letter.toLocaleUpperCase('fr-FR'));}
function fullDate(value){
  const date=value instanceof Date?value:new Date(value+'T12:00:00');
  return Number.isNaN(date.getTime())?'':upperFirst(date.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}));
}
function fullMonth(value){
  return /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value)?upperFirst(new Date(value+'-01T12:00:00').toLocaleDateString('fr-FR',{month:'long',year:'numeric'})):'';
}
function syncDateDisplays(){
  document.querySelectorAll('.formatted-date').forEach(wrapper=>{
    const input=wrapper.querySelector('input'),label=wrapper.querySelector('.formatted-date-label');
    const text=input.type==='month'?fullMonth(input.value):(safeDate(input.value,null)?fullDate(input.value):'');
    label.textContent=text||(input.type==='month'?'Choisir un mois':'Choisir une date');
    wrapper.classList.toggle('date-empty',!text);
  });
}
const CONTROL_CHEVRON='<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
function appendControlChevron(wrapper){
  const icon=document.createElement('span');icon.className='control-chevron';icon.setAttribute('aria-hidden','true');icon.innerHTML=CONTROL_CHEVRON;wrapper.append(icon);
}
function installSelectChevrons(){
  document.querySelectorAll('select').forEach(select=>{
    if(select.parentElement.classList.contains('select-control'))return;
    const wrapper=document.createElement('div');wrapper.className='select-control';select.before(wrapper);wrapper.append(select);appendControlChevron(wrapper);
  });
}
function installDateDisplays(){
  document.querySelectorAll('input[type="date"],input[type="month"]').forEach(input=>{
    if(!['date','month'].includes(input.type))return; // Native text fallback remains editable.
    const wrapper=document.createElement('div'),label=document.createElement('span');
    wrapper.className='formatted-date';label.className='formatted-date-label';label.setAttribute('aria-hidden','true');
    input.before(wrapper);wrapper.append(input,label);appendControlChevron(wrapper);
    input.addEventListener('input',syncDateDisplays);input.addEventListener('change',syncDateDisplays);
    input.addEventListener('blur',syncDateDisplays);
    input.addEventListener('click',()=>{try{input.showPicker?.();}catch{/* The native control remains usable. */}});
  });
  document.addEventListener('reset',()=>setTimeout(syncDateDisplays,0));
  syncDateDisplays();
}

function renderHistoryFilter(prefix){
  syncDateDisplays();
  const select=$(`#${prefix}Person`), previous=select.value||'all';
  select.innerHTML='<option value="all">Tous les passagers</option>'+data.people.map((name,i)=>`<option value="${i}">${escapeHTML(name)}${isArchived(i)?' (archivé)':''}</option>`).join('');
  select.value=previous==='all'||data.people[Number(previous)]!==undefined?previous:'all';
  const mode=$(`#${prefix}Period`).value;
  for(const [value,suffix] of [['year','Year'],['month','Month'],['week','Week']]){
    $(`#${prefix}${suffix}Field`).classList.toggle('hidden',mode!==value);
  }
}

function historyDateRange(prefix){
  const mode=$(`#${prefix}Period`).value;
  if(mode==='all') return {start:'',end:'',label:'Toutes les dates'};
  if(mode==='year'){
    const year=$(`#${prefix}Year`).value;
    return /^[1-9]\d{3}$/.test(year)?{start:`${year}-01-01`,end:`${year}-12-31`,label:`Année ${year}`}:null;
  }
  if(mode==='month'){
    const month=$(`#${prefix}Month`).value;
    if(!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)) return null;
    return {start:`${month}-01`,end:`${month}-31`,label:fullMonth(month)};
  }
  const date=safeDate($(`#${prefix}Week`).value,null);
  if(!date) return null;
  const monday=new Date(`${date}T12:00:00`);
  monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
  const sunday=new Date(monday);sunday.setDate(sunday.getDate()+6);
  const format=d=>fullDate(d);
  return {start:localISO(monday),end:localISO(sunday),label:`Du ${format(monday)} au ${format(sunday)}`};
}

function historyRecords(prefix){
  const range=historyDateRange(prefix), person=$(`#${prefix}Person`).value;
  if(!range) return [];
  const records=prefix==='history'?data.trips:data.payments;
  return records.filter(record=>
    (!range.start || (record.date>=range.start&&record.date<=range.end)) &&
    (prefix!=='history'||$('#historyRoute').value==='all'||record.routeId===$('#historyRoute').value) &&
    (person==='all' || (prefix==='history'?record.people.includes(Number(person)):record.person===Number(person)))
  );
}

function renderHistoryStatus(prefix,count,total){
  const range=historyDateRange(prefix), person=$(`#${prefix}Person`).value;
  const name=person==='all'?'Tous les passagers':personName(Number(person));
  const noun=prefix==='history'?'trajet(s)':'versement(s)';
  $(`#${prefix}FilterStatus`).textContent=range?`${count} ${noun} sur ${total} · ${name} · ${range.label}`:'Choisissez une période valide.';
  if(prefix==='history' && $('#historyRoute').value!=='all' && range) $(`#${prefix}FilterStatus`).textContent+=' · '+(routeById($('#historyRoute').value)?.name||'');
}

function clearWholeHistory(kind){
  const count=data[kind].length;
  if(!count) return;
  const trips=kind==='trips';
  const noun=trips?'trajet(s)':'versement(s)';
  const other=trips?'Les versements et les passagers seront conservés.':'Les trajets et les passagers seront conservés.';
  if(!confirm(`Supprimer définitivement les ${count} ${noun} de tout l’historique, y compris ceux masqués par les filtres ?\n\n${other} Les soldes seront mis à jour. Cette action est irréversible. Pensez à sauvegarder vos données avant de continuer.`)) return;
  data[kind]=[];
  if(saveData()){
    if(trips&&editingTripId) finishEditing();
    paymentDisplayLimit=8;
    renderAll();flash(`Historique des ${trips?'trajets':'versements'} vidé`);
  }
}

function initHistoryFilters(){
  for(const prefix of ['history','payments']){
    $(`#${prefix}Year`).value=getToday().slice(0,4);
    $(`#${prefix}Month`).value=getToday().slice(0,7);
    $(`#${prefix}Week`).value=getToday();
    const render=()=>{if(prefix==='history')renderHistory();else{paymentDisplayLimit=8;renderPayments();}};
    for(const suffix of ['Person','Period','Year','Month','Week']) $(`#${prefix}${suffix}`).addEventListener('change',render);
    $(`#reset${prefix==='history'?'History':'Payments'}Filters`).addEventListener('click',()=>{
      $(`#${prefix}Person`).value='all';$(`#${prefix}Period`).value='all';if(prefix==='history')$('#historyRoute').value='all';render();
    });
  }
  $('#clearTrips').addEventListener('click',()=>clearWholeHistory('trips'));
  $('#clearPayments').addEventListener('click',()=>clearWholeHistory('payments'));
}

function renderHistory(){
  const routeFilter=$('#historyRoute'),chosen=routeFilter.value;
  routeFilter.innerHTML='<option value="all">Tous les itinéraires</option>'+data.routes.map(r=>`<option value="${r.id}">${escapeHTML(r.name)}${r.deleted?' (supprimé)':r.archived?' (archivé)':''}</option>`).join('');
  routeFilter.value=data.routes.some(r=>r.id===chosen)?chosen:'all';
  renderHistoryFilter('history');
  const expanded=new Set($$('#historyList details[open]').map(el=>el.dataset.id));
  const trips=historyRecords('history').sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
  renderHistoryStatus('history',trips.length,data.trips.length);
  $('#clearTrips').disabled=!data.trips.length;
  const groups=new Map();
  trips.forEach(t=>{const month=t.date.slice(0,7);if(!groups.has(month))groups.set(month,[]);groups.get(month).push(t);});
  $('#historyList').innerHTML=trips.length?[...groups].map(([month,items])=>{
    const monthLabel=fullMonth(month);
    return `<section class="history-month"><h2 class="month-title">${escapeHTML(monthLabel)}</h2>${items.map(t=>{
      const names=t.people.length?t.people.map(personName).join(', '):'Sans passager';
      const dateLabel=fullDate(t.date);
      const energy=t.energyType==='electric'?'kWh':'L';
      const snapshot=[
        ...t.people.map(i=>`${personName(i)} · ${presenceLabel(tripPresence(t,i))} · ${paymentEuro(tripContribution(t,i))}`),
        `Coût enregistré : ${paymentEuro(t.cost)}`,
        t.distance===null?null:`Distance : ${decimal(t.distance)} km`,
        t.energyUsed===null||!t.energyType?null:`Énergie : ${decimal(t.energyUsed,2)} ${energy}`
      ].filter(Boolean).map(escapeHTML).join('<br>');
      return `<details class="history-item" data-id="${t.id}"${expanded.has(t.id)?' open':''}><summary><span class="history-overview"><b>${escapeHTML(dateLabel)}</b><span class="history-names">${escapeHTML(names)}</span><span class="small">${escapeHTML(t.routeName)} · ${directionLabel(t.direction)}</span><span class="small">Participation prévue : <strong>${paymentEuro(tripParticipation(t))}</strong></span></span><span class="history-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6"/></svg></span></summary><div class="history-detail"><p class="small">${snapshot}</p><div class="history-actions"><button class="btn secondary compact has-icon edit-trip" type="button" data-id="${t.id}">${UI_ICONS.edit}<span class="btn-label">Modifier</span></button><button class="btn danger compact has-icon delete-trip" type="button" data-id="${t.id}">${UI_ICONS.trash}<span class="btn-label">Supprimer</span></button></div></div></details>`;
    }).join('')}</section>`;
  }).join(''):`<p class="small">${data.trips.length?'Aucun trajet pour ces filtres.':'Aucun trajet enregistré.'}</p>`;
}

function summaryRecords(records){
  const range=historyDateRange('summary');
  return range?records.filter(r=>!range.start||(r.date>=range.start&&r.date<=range.end)):[];
}
function filteredTrips(){return summaryRecords(data.trips);}
function filteredPayments(){return summaryRecords(data.payments);}
function renderSummaryFilter(){
  syncDateDisplays();
  const mode=$('#summaryPeriod').value;
  for(const [value,suffix] of [['year','Year'],['month','Month'],['week','Week']])$('#summary'+suffix+'Field').classList.toggle('hidden',mode!==value);
}
function initSummaryFilters(){
  $('#summaryPeriod').value='all';
  $('#summaryYear').value=getToday().slice(0,4);$('#summaryMonth').value=getToday().slice(0,7);$('#summaryWeek').value=getToday();
  const update=()=>{closePayment();renderSummary();};
  for(const suffix of ['Period','Year','Month','Week'])$('#summary'+suffix).addEventListener('change',update);
  $('#resetSummaryFilters').addEventListener('click',()=>{$('#summaryPeriod').value='all';update();});
  $$('[data-history-view]').forEach(button=>button.addEventListener('click',()=>{
    const trips=button.dataset.historyView==='trips';$('#tripsHistoryCard').hidden=!trips;$('#paymentsHistoryCard').hidden=trips;
    $$('[data-history-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  }));
}

let paymentDisplayLimit=8;
function renderPayments(){
  renderHistoryFilter('payments');
  const payments=historyRecords('payments').sort((a,b)=>b.date.localeCompare(a.date));
  renderHistoryStatus('payments',payments.length,data.payments.length);
  $('#clearPayments').disabled=!data.payments.length;
  $('#paymentHistory').innerHTML=payments.length?`<div class="small payment-caption">Versements · ${Math.min(paymentDisplayLimit,payments.length)} sur ${payments.length}${$('#paymentsPeriod').value==='all'?' (toutes périodes)':''}</div>${payments.slice(0,paymentDisplayLimit).map(p=>`<div class="payment-item"><span>${escapeHTML(personName(p.person))}${isArchived(p.person)?'<span class="archive-tag">archivé</span>':''}<br><span class="small">${escapeHTML(fullDate(p.date))}</span></span><span class="payment-value"><b>${paymentEuro(p.amount)}</b><button class="btn danger compact has-icon delete-payment" type="button" aria-label="Supprimer ce versement" data-id="${p.id}">${UI_ICONS.trash}<span class="btn-label">Supprimer</span></button></span></div>`).join('')}${payments.length>paymentDisplayLimit?'<button type="button" class="btn secondary" id="morePayments">Afficher les versements suivants</button>':''}`:'<p class="small">Aucun versement pour ces filtres.</p>';
}

function renderSummary(){
  renderSummaryFilter();
  // Keep the live form and its draft when rebuilding rows, including save rollback.
  const paymentForm=$('#paymentForm');
  $('#paymentFormHome').append(paymentForm);
  const archivedOpen=$('#summaryArchivedPeople')?.open||false;
  $('#summaryScope').textContent=!historyDateRange('summary')?'Choisissez une période valide.':$('#summaryPeriod').value==='all'
    ? 'Solde calculé sur tous les trajets et versements enregistrés.'
    : 'Solde de la période uniquement, sans report antérieur. Choisissez « Toutes les dates » pour connaître le solde global.';
  const trips=filteredTrips();
  const payments=filteredPayments();
  const paidTotal=payments.reduce((sum,p)=>sum+p.amount,0);
  const totalCost=trips.reduce((sum,t)=>sum+t.cost,0);
  $('#sTrips').textContent=trips.length;
  $('#sReceived').textContent=paymentEuro(paidTotal);
  $('#sCost').textContent=paymentEuro(totalCost);
  $('#sDriver').textContent=paymentEuro(totalCost-paidTotal);
  const relevantPeople=data.people.map((_,i)=>i).filter(i=>!isArchived(i)||trips.some(t=>t.people.includes(i))||payments.some(p=>p.person===i));
  const renderPerson=i=>{
    const personTrips=trips.filter(t=>t.people.includes(i));
    const due=personTrips.reduce((sum,t)=>sum+tripContribution(t,i),0);
    const paid=payments.filter(p=>p.person===i).reduce((sum,p)=>sum+p.amount,0);
    const balance=Math.round((due-paid)*100)/100;
    const state=balance>0?`${paymentEuro(balance)} à payer`:balance<0?`Crédit ${paymentEuro(Math.abs(balance))}`:'Soldé ✓';
    const cls=balance>0?'balance-positive':balance<0?'balance-credit':'balance-zero';
    return `<div class="summary-entry"><div class="summaryPerson"><span><strong class="summary-person-name">${escapeHTML(personName(i))}</strong>${isArchived(i)?'<span class="archive-tag">archivé</span>':''}<br><span class="small">${personTrips.length} trajet(s) · dû ${paymentEuro(due)} · versé ${paymentEuro(paid)}</span></span><span class="${cls}">${state}</span></div><button class="btn secondary compact has-icon quick-payment" type="button" data-person-index="${i}" aria-expanded="false" aria-controls="payment-slot-${i}" aria-label="Enregistrer un versement pour ${escapeHTML(personName(i))}">${UI_ICONS.payment}<span class="btn-label">Enregistrer un versement</span></button><div id="payment-slot-${i}"></div></div>`;
  };
  const otherArchived=data.archivedPeople.filter(i=>!relevantPeople.includes(i));
  $('#personSummary').innerHTML=relevantPeople.map(renderPerson).join('')+(otherArchived.length
    ? `<details id="summaryArchivedPeople" class="summary-archived"${archivedOpen?' open':''}><summary>Passagers archivés (${otherArchived.length})</summary>${otherArchived.map(renderPerson).join('')}</details>`:'');
  mountPaymentForm();
}

function mountPaymentForm(){
  syncDateDisplays();
  if(activePaymentPerson===null) return;
  const slot=$(`#payment-slot-${activePaymentPerson}`);
  if(!slot){closePayment();return;}
  slot.append($('#paymentForm'));
  const details=slot.closest('details');if(details) details.open=true;
  slot.parentElement.querySelector('.quick-payment').setAttribute('aria-expanded','true');
}

function closePayment(restoreFocus=false){
  const index=activePaymentPerson,form=$('#paymentForm');
  if(form.contains(document.activeElement)) document.activeElement.blur();
  activePaymentPerson=null;
  $('#paymentFormHome').append(form);
  form.reset();$('#paymentError').textContent='';
  const button=$(`#personSummary .quick-payment[data-person-index="${index}"]`);
  button?.setAttribute('aria-expanded','false');
  if(restoreFocus) button?.focus({preventScroll:true});
}

function preparePayment(index){
  if(!Number.isInteger(index)||index<0||index>=data.people.length) return;
  if(activePaymentPerson!==index){
    closePayment();activePaymentPerson=index;
    $('#payDate').value=getToday();
    $('#paymentForm').setAttribute('aria-label',`Enregistrer un versement pour ${personName(index)}`);
    mountPaymentForm();
  }
  // Synchronous focus during the tap opens the iOS keyboard without competing scrolls.
  $('#payAmount').focus();
}

function installKeyboardNavigation(){
  const viewport=window.visualViewport;
  const touch=matchMedia('(any-pointer: coarse)');
  let fullHeight=Math.max(window.innerHeight,viewport?.height||0);
  let keyboardReduced=false;
  const editable=()=>{
    const field=document.activeElement;
    return field?.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="button"]):not([type="submit"]), textarea, select') && !field.readOnly && !field.disabled ? field : null;
  };
  function showNavigation(){
    document.body.classList.remove('keyboard-editing');
    keyboardReduced=false;
  }
  function focusChanged(){
    if(!touch.matches || !editable()){showNavigation();return;}
    // Hide immediately, before Safari finishes opening the keyboard.
    fullHeight=Math.max(fullHeight,window.innerHeight,viewport?.height||0);
    document.body.classList.add('keyboard-editing');
  }
  function viewportChanged(){
    const field=editable();
    if(!touch.matches || !field){
      showNavigation();
      fullHeight=Math.max(window.innerHeight,viewport?.height||0);
      return;
    }
    if(!viewport || Math.abs(viewport.scale-1)>.05) return;
    const reduced=fullHeight-viewport.height>120;
    if(reduced){
      keyboardReduced=true;
      document.body.classList.add('keyboard-editing');
      // Safari manages the focused field. Do not scroll during keyboard animation.
    }else if(keyboardReduced){
      // iOS can dismiss the keyboard while leaving the input focused.
      showNavigation();
    }
  }
  document.addEventListener('focusin',focusChanged);
  document.addEventListener('focusout',()=>setTimeout(()=>{
    if(!editable()) showNavigation();
  },0));
  viewport?.addEventListener('resize',viewportChanged);
  window.addEventListener('resize',viewportChanged);
}

function applyTheme(){
  const mode=data.settings.theme||'system';
  const dark=mode==='dark'||(mode==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme=dark?'dark':'light';
  $('meta[name="theme-color"]').setAttribute('content',dark?'#0b1017':'#e9eef6');
}

function updateEnergyLabels(){
  const electric=$('#energyType').value==='electric';
  $('#consumptionLabel').textContent=electric?'Consommation (kWh/100 km)':'Consommation (L/100 km)';
  $('#energyPriceLabel').textContent=electric?'Prix énergie / carburant (€/kWh)':'Prix énergie / carburant (€/L)';
  $('#energyHelp').textContent=electric?'Le calcul utilise la consommation en kWh/100 km et le prix de l’électricité en €/kWh.':'Le calcul utilise la consommation en L/100 km et le prix du carburant en €/L.';
}

function updateVehicleCostHelp(){
  $('#vehicleCostHelp').textContent='Ce coût par kilomètre couvre notamment l’usure, l’entretien et la décote du véhicule. Il s’applique à tous les itinéraires.';
}

function renderPeopleSettings(){
  $('#personEditorHome').append($('#personEditor'));
  const active=activePeopleIndices();
  $('#activePeopleSettings').innerHTML=active.length?active.map(i=>`<div class="person-management-row"><strong class="person-management-name">${escapeHTML(personName(i))}</strong><div class="person-management-actions"><button class="btn secondary compact has-icon edit-person" type="button" data-person-index="${i}" aria-expanded="false" aria-controls="person-edit-slot-${i}" aria-label="Modifier ${escapeHTML(personName(i))}">${UI_ICONS.edit}<span class="btn-label">Modifier</span></button><button class="btn secondary compact has-icon archive-person" type="button" data-person-index="${i}" aria-label="Archiver ${escapeHTML(personName(i))}">${UI_ICONS.archive}<span class="btn-label">Archiver</span></button></div><div id="person-edit-slot-${i}"></div></div>`).join(''):'<p class="small">Aucun passager actif.</p>';

  const archived=data.archivedPeople.filter(i=>i>=0&&i<data.people.length);
  $('#archivedPeopleSection').classList.toggle('hidden',archived.length===0);
  $('#archivedCount').textContent=`(${archived.length})`;
  $('#archivedPeopleSettings').innerHTML=archived.map(i=>`<div class="archived-person"><span class="archived-label">${escapeHTML(personName(i))}</span><div class="archived-person-actions"><button class="btn secondary compact has-icon reactivate-person" type="button" data-person-index="${i}">${UI_ICONS.restore}<span class="btn-label">Réactiver</span></button><button class="btn danger compact has-icon delete-person" type="button" data-person-index="${i}">${UI_ICONS.trash}<span class="btn-label">Supprimer</span></button></div></div>`).join('');
  mountPersonEditor();
}

function renderBackupStatus(){
  const el=$('#backupStatus');
  el.classList.remove('warning');
  if(storageProblem){
    el.textContent=storageProblem+' Les originaux restent protégés. Le bouton de sauvegarde exporte leur copie originale ; restaurez ensuite une sauvegarde vérifiée pour reprendre les modifications.';
    el.classList.add('warning');
    return;
  }
  if(!data.lastBackupAt){
    el.textContent='Aucune sauvegarde enregistrée. Une sauvegarde régulière est recommandée.';
    el.classList.add('warning');
    return;
  }
  const date=new Date(data.lastBackupAt), age=Math.max(0,Math.floor((Date.now()-date.getTime())/86400000));
  const label=fullDate(date);
  el.textContent=age>BACKUP_REMINDER_DAYS?`Dernière sauvegarde : ${label} (${age} jours). Pensez à en créer une nouvelle.`:`Dernière sauvegarde : ${label}${age===0?' (aujourd’hui)':` · il y a ${age} jour${age>1?'s':''}`}.`;
  if(age>BACKUP_REMINDER_DAYS) el.classList.add('warning');
}

function renderTariffTable(){
  const r=routeById($('#tariffRoute').value),capacity=Number($('#maxPassengers').value);
  $('#tariffTable').innerHTML=r&&!r.archived&&!r.deleted?`<table><caption class="small">Tarifs par passager · ${escapeHTML(r.name)}</caption><thead><tr><th scope="col">Passagers</th><th scope="col">Aller simple</th><th scope="col">Aller-retour</th></tr></thead><tbody>${Array.from({length:capacity},(_,i)=>{const n=i+1,cost=r.distance*(data.settings.consumption/100*data.settings.energyPrice+data.settings.vehicleCostPerKm)+r.toll,amount=roundedShare(cost*2,n,1),single=roundedShare(cost,n,0.5);return `<tr><th scope="row">${n}</th><td>${paymentEuro(single)}</td><td>${paymentEuro(amount)}</td></tr>`;}).join('')}</tbody></table>`:'<p class="small">Ajoutez ou réactivez un itinéraire pour consulter ses tarifs.</p>';
}
function renderTariff(){
  const choice=$('#tariffRoute').value;
  $('#maxPassengers').value=String(data.settings.maxPassengers);
  $('#tariffRoute').innerHTML=activeRoutes().map(r=>`<option value="${r.id}">${escapeHTML(r.name)}</option>`).join('');
  if(activeRoutes().some(r=>r.id===choice))$('#tariffRoute').value=choice;
  $('#tariffRoute').disabled=!activeRoutes().length;renderTariffTable();
}
function saveTariff(){
  const maxPassengers=Number($('#maxPassengers').value);
  if(!Number.isInteger(maxPassengers)||maxPassengers<1||maxPassengers>8)return;
  data.settings={...data.settings,maxPassengers};$('#tariffError').textContent='';
  if(saveData()){renderTariff();calcToday();flash('Tarif enregistré ✓');}
  else{$('#maxPassengers').value=String(maxPassengers);renderTariffTable();$('#tariffError').textContent='L’enregistrement a échoué. Vos choix sont conservés.';}
}

function renderSettings(){
  $('#themeMode').value=data.settings.theme||'system';
  $('#energyType').value=data.settings.energyType||'fuel';
  for(const key of ['consumption','energyPrice','vehicleCostPerKm']) $(`#${key}`).value=data.settings[key];
  updateEnergyLabels();
  updateVehicleCostHelp();
  renderPeopleSettings();renderRoutes();renderTariff();
  renderBackupStatus();

}

function renderAll(){
  if(!$('#tripDate').value)$('#tripDate').value=getToday();
  const selection=selectedPassengers();
  renderTripMode();renderPeople(selection);renderHistory();renderSettings();renderSummary();renderPayments();
}

function selectTab(tab){
  closePersonEditor();
  closePayment();
  if(tab!=='today' && editingTripId){
    if(!confirm('Quitter la modification sans enregistrer ?')) return;
    finishEditing();
  }
  closeRouteEditor();if(tab!=='today')closeRoutePanel();
  document.body.dataset.view=tab;
  $$('.tab').forEach(button=>{
    const active=button.dataset.tab===tab;
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',String(active));
  });
  updateNavigationIndicator();
  ['today','history','summary','settings'].forEach(id=>$('#'+id).classList.toggle('hidden',id!==tab));
  if(tab==='summary') renderSummary();
  if(tab==='settings') renderSettings();
  window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}

function saveSettings(){
  const limits={consumption:[0,100],energyPrice:[0,20],vehicleCostPerKm:[0,10]};
  const next={...data.settings};
  for(const [key,[min,max]] of Object.entries(limits)){
    const el=$(`#${key}`), value=Number(el.value);
    if(el.value.trim()===''||!Number.isFinite(value)||value<min||value>max){ alert(`Merci de saisir une valeur valide pour ${key}.`); el.focus(); return; }
    next[key]=value;
  }
  next.energyType=['fuel','electric'].includes($('#energyType').value)?$('#energyType').value:'fuel';
  data.settings=next;
  if(saveData()){renderSettings();calcToday();renderSummary();flash('Réglages enregistrés ✓');}
}

function personEditorTrigger(){
  return personEditorMode==='add'?$(personEditorContext==='today'?'#addTripPerson':'#addPerson'):$(`#activePeopleSettings .edit-person[data-person-index="${personEditorIndex}"]`);
}
function mountPersonEditor(){
  if(!personEditorMode) return;
  const slot=personEditorMode==='add'?$(personEditorContext==='today'?'#tripPersonAddSlot':'#personAddSlot'):$(`#person-edit-slot-${personEditorIndex}`);
  if(!slot){closePersonEditor();return;}
  slot.append($('#personEditor'));personEditorTrigger()?.setAttribute('aria-expanded','true');
}
function closePersonEditor(restoreFocus=false){
  const form=$('#personEditor'),trigger=personEditorTrigger();
  if(form.contains(document.activeElement)) document.activeElement.blur();
  $('#personEditorHome').append(form);form.reset();
  $('#personEditorError').textContent='';$('#personDuplicates').hidden=true;$('#personDuplicates').replaceChildren();
  trigger?.setAttribute('aria-expanded','false');personEditorMode=null;personEditorIndex=null;
  if(restoreFocus) trigger?.focus({preventScroll:true});
}
function openPersonEditor(index=null,context='settings'){
  closeRouteEditor();
  if(index!==null&&(!Number.isInteger(index)||!activePeopleIndices().includes(index))) return;
  closePersonEditor();personEditorContext=context;personEditorMode=index===null?'add':'edit';personEditorIndex=index;
  $('#personEditorName').value=index===null?'':personName(index);
  $('#savePerson .btn-label').textContent=index===null?'Ajouter':'Enregistrer';
  $('#personEditor').setAttribute('aria-label',index===null?'Ajouter un passager':`Modifier ${personName(index)}`);
  mountPersonEditor();$('#personEditorName').focus();
}
const comparablePersonName=name=>name.normalize('NFC').toLocaleLowerCase('fr-FR');
function savePerson(allowHomonym=false,reactivateIndex=null){
  if(!personEditorMode||personSaving) return;
  const raw=$('#personEditorName').value,name=cleanName(raw,''),error=$('#personEditorError');
  error.textContent='';
  if(!name||raw.trim().length>40){error.textContent='Saisissez un nom de 1 à 40 caractères.';$('#personEditorName').focus();return;}
  const matches=data.people.map((_,i)=>i).filter(i=>i!==personEditorIndex&&comparablePersonName(personName(i))===comparablePersonName(name));
  if(reactivateIndex!==null&&(!matches.includes(reactivateIndex)||!isArchived(reactivateIndex))) return;
  if(matches.length&&!allowHomonym&&reactivateIndex===null){
    const panel=$('#personDuplicates');panel.hidden=false;
    panel.innerHTML=`<p class="small">Ce nom existe déjà. Corrigez-le ou confirmez qu’il s’agit d’une autre personne.</p>${matches.filter(isArchived).map(i=>`<button type="button" class="btn secondary duplicate-reactivate" data-person-index="${i}">Réactiver ${escapeHTML(personName(i))}</button>`).join('')}<button type="button" class="btn secondary" id="confirmPersonHomonym">${personEditorMode==='add'?'Ajouter une autre personne':'Conserver ce nom pour cette personne'}</button><button type="button" class="btn secondary" id="correctPersonName">Corriger le nom</button>`;
    return;
  }
  if(personEditorMode==='add'&&reactivateIndex===null&&data.people.length>=MAX_PEOPLE){error.textContent=`La limite est de ${MAX_PEOPLE} passagers enregistrés.`;return;}
  const focusIndex=reactivateIndex??(personEditorMode==='add'?data.people.length:personEditorIndex);
  personSaving=true;$('#savePerson').disabled=true;
  try{
    if(reactivateIndex!==null) data.archivedPeople=data.archivedPeople.filter(i=>i!==reactivateIndex);
    else if(personEditorMode==='add') data.people.push(name);
    else data.people[personEditorIndex]=name;
    if(saveData()){
      closePersonEditor();renderAll();
      (personEditorContext==='today'?$(`[data-person="${focusIndex}"]`):$(`#activePeopleSettings .edit-person[data-person-index="${focusIndex}"]`))?.focus({preventScroll:true});
      flash(reactivateIndex!==null?'Passager réactivé ✓':'Passager enregistré ✓');
    }else error.textContent='L’enregistrement a échoué. Votre saisie est conservée.';
  }finally{personSaving=false;$('#savePerson').disabled=false;}
}

function archivePerson(index){
  if(!Number.isInteger(index)||index<0||index>=data.people.length||isArchived(index)) return;
  if(!confirm(`Archiver ${personName(index)} ? Son historique et ses versements seront conservés.`)) return;
  data.archivedPeople.push(index);
  data.archivedPeople=[...new Set(data.archivedPeople)];
  if(saveData()){renderAll();flash(`${personName(index)} archivé ✓`);}
}

function reactivatePerson(index){
  if(!Number.isInteger(index)||index<0||index>=data.people.length) return;
  data.archivedPeople=data.archivedPeople.filter(i=>i!==index);
  if(saveData()){renderAll();flash(`${personName(index)} réactivé ✓`);}
}

function deleteArchivedPerson(index){
  if(!Number.isInteger(index)||index<0||index>=data.people.length||!isArchived(index)) return;
  const name=personName(index);
  const usedInTrips=data.trips.some(t=>Array.isArray(t.people)&&t.people.includes(index));
  const usedInPayments=data.payments.some(p=>p.person===index);
  const warning=usedInTrips||usedInPayments ? ' Ses versements et sa participation aux trajets seront supprimés. Les trajets où cette personne était le seul passager seront supprimés ; les autres trajets et leurs coûts seront conservés.' : '';
  if(!confirm(`Supprimer définitivement ${name} ? Cette action est irréversible.${warning}`)) return;
  // Removing an index shifts later passengers: abandon any editor targeting the old indices.
  if(personEditorMode) closePersonEditor();
  data.people.splice(index,1);
  data.archivedPeople=data.archivedPeople
    .filter(i=>i!==index)
    .map(i=>i>index?i-1:i);
  // Only remove trips whose sole passenger was the deleted person.
  data.trips=data.trips.filter(t=>!(t.people.length===1 && t.people[0]===index)).map(t=>({
    ...t,
    people:(Array.isArray(t.people)?t.people:[]).filter(i=>i!==index).map(i=>i>index?i-1:i),
    ...(t.contributions?{contributions:t.contributions.filter(c=>c.person!==index).map(c=>({...c,person:c.person>index?c.person-1:c.person}))}:{})
  }));
  data.payments=data.payments.filter(p=>p.person!==index).map(p=>({
    ...p,
    person:p.person>index?p.person-1:p.person
  }));

  if(saveData()){const selected=selectedPassengers().filter(i=>i!==index).map(i=>i>index?i-1:i);passengerPresences=Object.fromEntries(Object.entries(passengerPresences).filter(([i])=>Number(i)!==index).map(([i,p])=>[Number(i)>index?Number(i)-1:Number(i),p]));renderPeople(selected);renderAll();flash(`${name} supprimé ✓`);}
}

function addPayment(){
  if(paymentSaving||activePaymentPerson===null) return;
  const person=activePaymentPerson,raw=$('#payAmount').value.trim(),amount=Number(raw.replace(',','.')),date=$('#payDate').value;
  const error=$('#paymentError');error.textContent='';
  if(!Number.isInteger(person)||person<0||person>=data.people.length){error.textContent='Passager invalide.';return;}
  if(!/^\d+(?:[.,]\d{1,2})?$/.test(raw)||!Number.isFinite(amount)||amount<=0||amount>1_000_000){
    error.textContent='Saisissez un montant supérieur à 0 €, avec deux décimales maximum (plafond : 1 000 000 €).';$('#payAmount').focus();return;
  }
  if(!date||safeDate(date,'')!==date){error.textContent='Choisissez une date valide.';$('#payDate').focus();return;}
  paymentSaving=true;$('#addPayment').disabled=true;
  try{
    data.payments.push({id:makeId(),person,amount,date});
    if(saveData()){
      closePayment(true);renderSummary();renderPayments();
      $(`#personSummary .quick-payment[data-person-index="${person}"]`)?.focus({preventScroll:true});
      flash('Versement enregistré ✓');
    }else{
      error.textContent='Le versement n’a pas été enregistré. Votre saisie est conservée.';
    }
  }finally{paymentSaving=false;$('#addPayment').disabled=false;}
}

function downloadBlob(blob,filename){
  const url=URL.createObjectURL(blob), link=document.createElement('a');
  link.href=url; link.download=filename; link.rel='noopener'; document.body.appendChild(link); link.click();
  setTimeout(()=>{URL.revokeObjectURL(url);link.remove();},600);
}

function markBackup(iso){
  data.lastBackupAt=iso;
  if(saveData()) renderBackupStatus();
}

async function backupData(){
  if(storageProblem){
    if(storedRaw===null){ alert('Le stockage est inaccessible. Rouvrez l’application ou restaurez une sauvegarde disponible.'); return; }
    downloadBlob(new Blob([storedRaw],{type:'application/json'}),`covoiturage-recuperation-${getToday()}.json`);
    flash('Copie originale proposée au téléchargement');
    return;
  }
  const backupAt=new Date().toISOString();
  const payloadData={...data,lastBackupAt:backupAt};
  const payload={app:'Covoiturage',format:DATA_FORMAT,schema:SCHEMA_VERSION,version:APP_VERSION,exportedAt:backupAt,data:payloadData};
  const filename=`covoiturage-sauvegarde-${getToday()}.json`;
  const content=JSON.stringify(payload);
  const blob=new Blob([content],{type:'application/json'});
  if(blob.size>MAX_BACKUP_SIZE){ alert('La sauvegarde dépasse la limite de 20 Mo. Aucun fichier incompatible n’a été créé.'); return; }
  try{
    const file=new File([content],filename,{type:'application/json'});
    if(navigator.share&&navigator.canShare?.({files:[file]})){
      await navigator.share({files:[file],title:'Sauvegarde Covoiturage'});
      markBackup(backupAt); flash('Sauvegarde prête ✓'); return;
    }
  }catch(error){ if(error&&error.name==='AbortError') return; }
  downloadBlob(blob,filename);
  markBackup(backupAt);
  flash('Sauvegarde proposée : vérifiez son enregistrement');
}

async function restoreData(file){
  if(!file) return;
  if(file.size>MAX_BACKUP_SIZE) throw new Error('too-large');
  const parsed=JSON.parse(await file.text());
  if(!isRecord(parsed)||parsed.app!=='Covoiturage'||parsed.format!==DATA_FORMAT||![1,2,3].includes(parsed.schema)||parsed.schema!==parsed.data?.schema||!Number.isInteger(parsed.version)||parsed.version<1||!validDataShape(parsed.data))throw new Error('incompatible-backup');
  if(Number(parsed.version)>APP_VERSION)throw new Error('future-version');
  const next=normalizeData(parsed.data);
  if(!confirm(`Restaurer cette sauvegarde (${next.routes.filter(r=>!r.deleted).length} itinéraires, ${next.trips.length} trajets, ${next.payments.length} versements) ? Les données actuelles seront remplacées.`))return;
  data=next;
  if(saveData({allowRecovery:true})){passengerPresences={};renderPeople([]);editingTripId=null;newTripDraft=null;selectedRouteId=null;selectedDirection='roundtrip';closeRoutePanel();closeRouteEditor();closePayment();if(personEditorMode)closePersonEditor();paymentDisplayLimit=8;applyTheme();renderAll();flash('Sauvegarde restaurée ✓');}
}

function safeCsvValue(value){
  let s=String(value??'');
  if(/^[\s\u0000-\u001F]*[=+\-@]/.test(s)) s=`'${s}`;
  return `"${s.replaceAll('"','""')}"`;
}

function exportCsv(){
  const records=[...data.trips.map(t=>({date:t.date,createdAt:t.createdAt,row:['Trajet',t.date,t.routeName,directionLabel(t.direction),t.people.map(personName).join(' / '),t.people.map(i=>`${personName(i)} : ${presenceLabel(tripPresence(t,i))}`).join(' / '),t.people.length,t.people.map(i=>`${personName(i)} : ${tripContribution(t,i).toFixed(2)} €`).join(' / '),tripParticipation(t).toFixed(2),t.cost.toFixed(2),'']})),...data.payments.map(p=>({date:p.date,createdAt:'',row:['Versement',p.date,'','',personName(p.person),'','','','','',p.amount.toFixed(2)]}))];
  records.sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
  const rows=[['Type','Date','Itinéraire','Sens','Passagers','Présence des passagers','Nombre','Tarif/passager','Participation prévue','Coût trajet','Montant versé'],...records.map(r=>r.row)];
  const csv='\ufeff'+rows.map(row=>row.map(safeCsvValue).join(';')).join('\n');
  downloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),'covoiturage.csv');
}

$('#routeToggle').addEventListener('click',()=>routePanelOpen?closeRoutePanel(true):openRoutePanel());
$('#routePanel').addEventListener('click',event=>{const button=event.target.closest('[data-choice-route]');if(button)selectRouteChoice(button.dataset.choiceRoute);});
$('.route-panel').addEventListener('keydown',event=>{if(event.key==='Escape'&&routePanelOpen){event.preventDefault();event.stopPropagation();closeRoutePanel(true);}});
$('#createFirstRoute').addEventListener('click',()=>openRouteEditor(null,'today'));
$('#addRoute').addEventListener('click',()=>openRouteEditor());
$('#routeEditor').addEventListener('submit',event=>{event.preventDefault();saveRoute();});
$('#cancelRouteEditor').addEventListener('click',()=>closeRouteEditor(true));
$('#routesCard').addEventListener('click',event=>{
  const button=event.target.closest('[data-route-id]');if(!button)return;
  if(button.classList.contains('edit-route'))openRouteEditor(button.dataset.routeId);
  if(button.classList.contains('archive-route'))archiveRoute(button.dataset.routeId,true);
  if(button.classList.contains('delete-route'))deleteArchivedRoute(button.dataset.routeId);
  if(button.classList.contains('reactivate-route'))archiveRoute(button.dataset.routeId,false);
});
$('#historyRoute').addEventListener('change',renderHistory);

$$('.tab').forEach(button=>button.addEventListener('click',()=>selectTab(button.dataset.tab)));
$('#save').addEventListener('click',addTrip);
$('#tripDate').addEventListener('input',calcToday);
$('#tripDate').addEventListener('change',calcToday);
$('#cancelEdit').addEventListener('click',()=>{finishEditing();selectTab('history');});

$('#personSummary').addEventListener('click',event=>{
  const button=event.target.closest('.quick-payment');if(button)preparePayment(Number(button.dataset.personIndex));
});
$('#saveSettings').addEventListener('click',saveSettings);
$('#energyType').addEventListener('change',updateEnergyLabels);

$('#vehicleCostPerKm').addEventListener('input',updateVehicleCostHelp);
$('#addTripPerson').addEventListener('click',()=>openPersonEditor(null,'today'));
$('#saveTariff').addEventListener('click',saveTariff);
for(const id of ['maxPassengers','tariffRoute'])$('#'+id).addEventListener('change',renderTariffTable);
$('#addPerson').addEventListener('click',()=>openPersonEditor());
$('#personEditor').addEventListener('submit',event=>{event.preventDefault();savePerson();});
$('#cancelPerson').addEventListener('click',()=>closePersonEditor(true));
$('#personEditorName').addEventListener('input',()=>{$('#personDuplicates').hidden=true;$('#personDuplicates').replaceChildren();$('#personEditorError').textContent='';});
$('#personDuplicates').addEventListener('click',event=>{
  if(event.target.closest('#confirmPersonHomonym')) savePerson(true);
  if(event.target.closest('#correctPersonName')){$('#personDuplicates').hidden=true;$('#personEditorName').focus();}
  const reactivate=event.target.closest('.duplicate-reactivate');if(reactivate)savePerson(false,Number(reactivate.dataset.personIndex));
});
$('#activePeopleSettings').addEventListener('click',event=>{
  const edit=event.target.closest('.edit-person');if(edit){openPersonEditor(Number(edit.dataset.personIndex));return;}
  const button=event.target.closest('.archive-person'); if(!button) return;
  archivePerson(Number(button.dataset.personIndex));
});
$('#archivedPeopleSettings').addEventListener('click',event=>{
  const reactivate=event.target.closest('.reactivate-person');
  if(reactivate){ reactivatePerson(Number(reactivate.dataset.personIndex)); return; }
  const remove=event.target.closest('.delete-person');
  if(remove){ deleteArchivedPerson(Number(remove.dataset.personIndex)); }
});
$('#paymentForm').addEventListener('submit',event=>{event.preventDefault();addPayment();});
$('#cancelPayment').addEventListener('click',()=>closePayment(true));
$('#themeMode').addEventListener('change',event=>{data.settings.theme=event.target.value;if(saveData()){applyTheme();flash('Apparence mise à jour ✓');}});
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if((data.settings.theme||'system')==='system')applyTheme();});

$('#backupData').addEventListener('click',()=>{void backupData().catch(()=>alert('La sauvegarde n’a pas pu être créée. Réessayez.'));});
$('#restoreFile').addEventListener('change',async event=>{
  const input=event.target, file=input.files&&input.files[0];
  try{await restoreData(file);}catch(error){
    alert(error.message==='incompatible-backup' ? 'Cette sauvegarde n’est pas compatible avec Covoiturage multi-itinéraires. Les sauvegardes des anciennes versions V37 à V58 ne peuvent pas être importées.' : error.message==='too-large'?'Ce fichier dépasse la limite de restauration de 20 Mo.':error.message==='future-version'?'Cette sauvegarde provient d’une version plus récente. Mettez à jour l’application avant de la restaurer.':'Ce fichier ne semble pas être une sauvegarde Covoiturage valide. Les données actuelles sont conservées.');
  }finally{input.value='';}
});
$('#export').addEventListener('click',exportCsv);

$('#historyList').addEventListener('click',event=>{
  const edit=event.target.closest('.edit-trip');if(edit){startEditTrip(edit.dataset.id);return;}
  const button=event.target.closest('.delete-trip'); if(!button) return;
  const id=button.dataset.id;
  if(confirm('Supprimer ce trajet ?')){data.trips=data.trips.filter(t=>t.id!==id);if(saveData()) renderAll();}
});
$('#paymentHistory').addEventListener('click',event=>{
  if(event.target.closest('#morePayments')){
    paymentDisplayLimit+=8;renderPayments();
    return;
  }
  const button=event.target.closest('.delete-payment'); if(!button) return;
  const id=button.dataset.id;
  if(confirm('Supprimer ce versement ?')){data.payments=data.payments.filter(p=>p.id!==id);if(saveData()){renderAll();flash('Versement supprimé');}}
});

// Animate only the visible face: the button's 48px touch target stays fixed.
function animatePresencePress(button){
  const face=button.querySelector('.presence-face');
  face?.getAnimations?.().forEach(animation=>animation.cancel());
  if(!face||button.disabled||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const base=getComputedStyle(face).backgroundColor,tint=getComputedStyle(document.documentElement).getPropertyValue('--accent-soft').trim();
  face.animate([{transform:'scale(.94)',backgroundColor:tint},{transform:'scale(1)',backgroundColor:base}],{duration:180,easing:'ease-out'});
}

document.addEventListener('click',event=>{
  const button=event.target.closest('button'); if(!button || button.classList.contains('tab') || button.classList.contains('presence-cycle') || button.disabled || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  button.animate([{transform:'scale(1)'},{transform:'scale(.97)'},{transform:'scale(1)'}],{duration:180,easing:'ease-out'});
});


// A single indicator follows only accepted navigation changes.
function updateNavigationIndicator(instant=false){
  const nav=$('.glass-nav'),active=nav.querySelector('.tab.active'),indicator=nav.querySelector('.nav-indicator');
  if(!indicator||!active) return;
  if(instant) indicator.style.transition='none';
  indicator.style.width=active.offsetWidth+'px';indicator.style.height=active.offsetHeight+'px';
  indicator.style.top=active.offsetTop+'px';indicator.style.transform='translateX('+active.offsetLeft+'px)';
  if(instant){void indicator.offsetWidth;indicator.style.transition='';}
}
function installVisualFeedback(){
  const nav=$('.glass-nav'),indicator=document.createElement('span');
  indicator.className='nav-indicator';indicator.setAttribute('aria-hidden','true');nav.prepend(indicator);
  updateNavigationIndicator(true);
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>updateNavigationIndicator(true)).observe(nav);
  window.addEventListener('resize',()=>updateNavigationIndicator(true));
  let keyboardHidden=document.body.classList.contains('keyboard-editing');
  new MutationObserver(()=>{
    const hidden=document.body.classList.contains('keyboard-editing');
    if(hidden!==keyboardHidden){keyboardHidden=hidden;updateNavigationIndicator(true);}
  }).observe(document.body,{attributes:true,attributeFilter:['class']});
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  motion.addEventListener?.('change',()=>{updateNavigationIndicator(true);if(motion.matches)$$('.person,.presence-face').forEach(e=>e.getAnimations?.().forEach(a=>a.cancel()));});
  // Checkbox change occurs once for both label clicks and keyboard activation.
  $('#people').addEventListener('change',event=>{
    const input=event.target;if(!input.matches('input[data-person]')||input.disabled||motion.matches)return;
    const row=input.closest('.person');row.getAnimations?.().forEach(a=>a.cancel());
    row.animate([{transform:'scale(1)'},{transform:'scale(.97)'},{transform:'scale(1)'}],{duration:180,easing:'ease-out'});
  });
}

initHistoryFilters();
initSummaryFilters();
installKeyboardNavigation();
applyTheme();
renderAll();
installVisualFeedback();
installDateDisplays();
installSelectChevrons();
if(storageProblem) alert(storageProblem+' Aucune donnée originale n’a été remplacée. Consultez la rubrique Sauvegarde dans Réglages.');

if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(registration=>{
    const notify=()=>flash('Mise à jour prête : fermez puis rouvrez l’application.');
    if(registration.waiting) notify();
    registration.addEventListener('updatefound',()=>{
      const worker=registration.installing;
      worker?.addEventListener('statechange',()=>{if(worker.state==='installed' && navigator.serviceWorker.controller) notify();});
    });
  }).catch(()=>flash('Le mode hors ligne n’a pas pu être préparé. Réessayez avec une connexion.'));
}


(function installStandaloneZoomPolicy(){
  const standalone=matchMedia('(display-mode: standalone)'),viewport=document.querySelector('meta[name="viewport"]');
  const normalViewport=viewport.content;
  const installed=()=>standalone.matches||navigator.standalone===true;
  const update=()=>{
    const active=installed();document.documentElement.classList.toggle('pwa-installed',active);
    viewport.content=active?normalViewport+',maximum-scale=1,user-scalable=no':normalViewport;
  };
  update();standalone.addEventListener?.('change',update);
  window.addEventListener('pageshow',update);
  // Safari gesture events target pinch zoom only. Normal taps, selection and scroll remain native.
  for(const name of ['gesturestart','gesturechange'])document.addEventListener(name,event=>{
    if(installed()&&event.cancelable)event.preventDefault();
  },{passive:false});
})();

// Optional browser capability: expose the existing route list, without changing data.
(function installRouteReadTool(){
  let lifecycle;
  const register=()=>{
    if(lifecycle&&!lifecycle.signal.aborted)return;
    if(!document.modelContext?.registerTool)return;
    lifecycle=new AbortController();
    try{
      Promise.resolve(document.modelContext.registerTool({
        name:'list_itineraries',title:'Lister les itinéraires',
        description:'Consulter les itinéraires enregistrés sur cet appareil. Ne modifie aucune donnée.',
        inputSchema:{type:'object',properties:{includeArchived:{type:'boolean'}},additionalProperties:false},
        annotations:{readOnlyHint:true,untrustedContentHint:true},
        execute(input){
          if(!isRecord(input)||Object.keys(input).some(k=>k!=='includeArchived')||(input.includeArchived!==undefined&&typeof input.includeArchived!=='boolean'))throw new Error('Paramètres invalides.');
          return {routes:data.routes.filter(r=>!r.deleted&&(input.includeArchived||!r.archived)).map(r=>({...r}))};
        }
      },{signal:lifecycle.signal})).catch(()=>{});
    }catch{/* The application remains usable when this optional API is unavailable. */}
  };
  register();window.addEventListener('pagehide',()=>lifecycle?.abort());window.addEventListener('pageshow',register);
})();

