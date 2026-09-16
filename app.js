'use strict';

const APP_VERSION = 33;
const STORAGE_KEY = 'covoiturageData';
const MAX_BACKUP_SIZE = 2_000_000;
const MAX_PEOPLE = 30;
const BACKUP_REMINDER_DAYS = 30;
const DEFAULT_DATA = Object.freeze({
  settings:{distance:85,consumption:6,energyPrice:2.31,energyType:'fuel',toll:6,vehicleCostPerKm:0.10,theme:'system'},
  people:['Passager 1','Passager 2','Passager 3'],
  archivedPeople:[],
  lastBackupAt:null,
  trips:[],
  payments:[]
});

const cloneDefaults = () => JSON.parse(JSON.stringify(DEFAULT_DATA));
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const finite = (value, fallback=0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max, fallback=min) => Math.min(max, Math.max(min, finite(value, fallback)));
const localISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const getToday = () => localISO(new Date());
const makeId = () => `${Date.now().toString(36)}${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
const safeId = value => /^[A-Za-z0-9_-]{1,80}$/.test(String(value||'')) ? String(value) : makeId();
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
const decimal = (n,digits=1) => finite(n,0).toLocaleString('fr-FR',{minimumFractionDigits:0,maximumFractionDigits:digits});

function normalizeData(raw){
  const base=cloneDefaults();
  if(!raw || typeof raw!=='object' || Array.isArray(raw)) return base;
  const s=raw.settings && typeof raw.settings==='object' ? raw.settings : {};
  const legacyEnergyPrice=s.energyPrice ?? s.diesel;
  const distance=clamp(s.distance,0,2000,85);
  const legacyVehicleCostPerKm = Number.isFinite(Number(s.vehicleCostPerKm))
    ? Number(s.vehicleCostPerKm)
    : (distance>0 && Number.isFinite(Number(s.carFee)) ? Number(s.carFee)/distance : 0.10);
  base.settings={
    distance,
    consumption:clamp(s.consumption,0,100,6),
    energyPrice:clamp(legacyEnergyPrice,0,20,2.31),
    energyType:['fuel','electric'].includes(s.energyType)?s.energyType:'fuel',
    toll:clamp(s.toll,0,1000,6),
    vehicleCostPerKm:clamp(legacyVehicleCostPerKm,0,10,0.10),
    theme:['system','light','dark'].includes(s.theme)?s.theme:'system'
  };

  const incomingPeople=Array.isArray(raw.people)?raw.people:[];
  if(incomingPeople.length){
    base.people=incomingPeople.slice(0,MAX_PEOPLE).map((name,i)=>cleanName(name,`Passager ${i+1}`));
  }
  if(!base.people.length) base.people=['Passager 1'];
  const maxIndex=base.people.length-1;
  base.archivedPeople=[...new Set((Array.isArray(raw.archivedPeople)?raw.archivedPeople:[]).map(Number).filter(i=>Number.isInteger(i)&&i>=0&&i<=maxIndex))];
  base.lastBackupAt=safeIsoDateTime(raw.lastBackupAt);

  const trips=Array.isArray(raw.trips)?raw.trips.slice(-10000):[];
  base.trips=trips.filter(t=>t&&typeof t==='object').map(t=>({
    id:safeId(t.id),
    date:safeDate(t.date),
    people:[...new Set(Array.isArray(t.people)?t.people.map(Number).filter(i=>Number.isInteger(i)&&i>=0&&i<=maxIndex):[])],
    noTrip:Boolean(t.noTrip),
    rate:clamp(t.rate,0,10000,0),
    cost:clamp(t.cost,0,10000,0),
    createdAt:safeIsoDateTime(t.createdAt)||new Date().toISOString(),
    distance:Number.isFinite(Number(t.distance))?clamp(t.distance,0,2000,0):null,
    consumption:Number.isFinite(Number(t.consumption))?clamp(t.consumption,0,100,0):null,
    energyType:['fuel','electric'].includes(t.energyType)?t.energyType:null,
    energyPrice:Number.isFinite(Number(t.energyPrice))?clamp(t.energyPrice,0,20,0):null,
    energyUsed:Number.isFinite(Number(t.energyUsed))?clamp(t.energyUsed,0,10000,0):null,
    vehicleCostPerKm:Number.isFinite(Number(t.vehicleCostPerKm))?clamp(t.vehicleCostPerKm,0,10,0):null,
    toll:Number.isFinite(Number(t.toll))?clamp(t.toll,0,1000,0):null
  }));

  const payments=Array.isArray(raw.payments)?raw.payments.slice(-10000):[];
  base.payments=payments.filter(p=>p&&typeof p==='object').map(p=>({
    id:safeId(p.id),
    person:Number(p.person),
    amount:clamp(p.amount,0,1_000_000,0),
    date:safeDate(p.date)
  })).filter(p=>Number.isInteger(p.person)&&p.person>=0&&p.person<=maxIndex&&p.amount>0);
  return base;
}

let data;
try{ data=normalizeData(JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')); }
catch{ data=cloneDefaults(); }

function saveData(){
  try{ localStorage.setItem(STORAGE_KEY,JSON.stringify(data)); return true; }
  catch{ alert("Impossible d’enregistrer les données localement sur cet appareil."); return false; }
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
const vehicleCostPerTrip = () => data.settings.distance*data.settings.vehicleCostPerKm;
const tripCost = () => data.settings.distance*data.settings.consumption/100*data.settings.energyPrice+data.settings.toll+vehicleCostPerTrip();
const rate = n => n ? Math.round(tripCost()/(n+1)) : 0;

function renderPeople(){
  const active=activePeopleIndices();
  $('#people').innerHTML=active.length
    ? active.map(i=>`<label class="person"><input type="checkbox" data-person="${i}"><span>${escapeHTML(personName(i))}</span></label>`).join('')
    : '<p class="small">Aucun passager actif. Vous pouvez en ajouter ou en réactiver dans Réglages.</p>';
  $$('[data-person]').forEach(el=>el.addEventListener('change',event=>{
    if(event.target.checked && $$('[data-person]:checked').length>3){
      event.target.checked=false;
      alert('Maximum 3 passagers par trajet.');
    }
    calcToday();
  }));
  calcToday();
}

function calcToday(){
  const n=$$('[data-person]:checked').length;
  $('#count').textContent=n;
  $('#perPerson').textContent=euro(rate(n));
  $('#received').textContent=euro(rate(n)*n);
  $('#tripCost').textContent=euro(tripCost());
}

function addTrip(){
  const people=$$('[data-person]:checked').map(el=>Number(el.dataset.person));
  const selectedDate=safeDate($('#tripDate').value||getToday());
  const distance=data.settings.distance, consumption=data.settings.consumption;
  data.trips.push({
    id:makeId(),date:selectedDate,people,noTrip:false,rate:rate(people.length),cost:tripCost(),createdAt:new Date().toISOString(),
    distance,consumption,energyType:data.settings.energyType,energyPrice:data.settings.energyPrice,
    energyUsed:distance*consumption/100,vehicleCostPerKm:data.settings.vehicleCostPerKm,toll:data.settings.toll
  });
  if(saveData()){ renderAll(); flash('Nouveau trajet enregistré ✓'); }
}

function renderHistory(){
  const trips=[...data.trips].sort((a,b)=>b.date.localeCompare(a.date));
  $('#historyList').innerHTML=trips.length?trips.map(t=>{
    const people=t.noTrip?'Aucun trajet':t.people.map(i=>`<span class="pill">${escapeHTML(personName(i))}</span>`).join('');
    const details=t.noTrip?'':`${t.people.length} passager(s) · ${euro(t.rate)} chacun · ${euro(t.rate*t.people.length)} total`;
    const label=new Date(`${t.date}T12:00:00`).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'});
    return `<div class="history-item"><div class="history-head"><b>${escapeHTML(label)}</b></div><div>${people}</div><div class="small">${details}</div><div class="history-actions"><button class="btn secondary danger delete-trip" type="button" data-id="${t.id}">Supprimer</button></div></div>`;
  }).join(''):'<p class="small">Aucun trajet enregistré.</p>';
}

function filteredTrips(){
  const now=new Date(), mode=$('#period').value;
  return data.trips.filter(t=>{
    const d=new Date(`${t.date}T12:00:00`);
    if(mode==='all') return true;
    if(mode==='month') return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
    const start=new Date(now); start.setHours(0,0,0,0); start.setDate(now.getDate()-((now.getDay()+6)%7));
    const end=new Date(start); end.setDate(start.getDate()+7);
    return d>=start&&d<end;
  });
}

function filteredPayments(){
  const now=new Date(), mode=$('#period').value;
  return data.payments.filter(p=>{
    const d=new Date(`${p.date}T12:00:00`);
    if(mode==='all') return true;
    if(mode==='month') return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
    const start=new Date(now); start.setHours(0,0,0,0); start.setDate(now.getDate()-((now.getDay()+6)%7));
    const end=new Date(start); end.setDate(start.getDate()+7);
    return d>=start&&d<end;
  });
}

function renderPayments(){
  $('#payPerson').innerHTML=data.people.map((name,i)=>`<option value="${i}">${escapeHTML(name)}${isArchived(i)?' (archivé)':''}</option>`).join('');
  if(!$('#payDate').value) $('#payDate').value=getToday();
  const payments=[...data.payments].sort((a,b)=>b.date.localeCompare(a.date));
  $('#paymentHistory').innerHTML=payments.length?`<div class="small payment-caption">Derniers versements</div>${payments.slice(0,8).map(p=>`<div class="payment-item"><span>${escapeHTML(personName(p.person))}${isArchived(p.person)?'<span class="archive-tag">archivé</span>':''}<br><span class="small">${escapeHTML(new Date(`${p.date}T12:00:00`).toLocaleDateString('fr-FR'))}</span></span><span class="payment-value"><b>${euro(p.amount)}</b><button class="btn secondary danger icon-button delete-payment" type="button" aria-label="Supprimer ce versement" data-id="${p.id}">×</button></span></div>`).join('')}`:'<p class="small">Aucun versement enregistré.</p>';
}

function tripDistance(t){ return Number.isFinite(Number(t.distance)) ? Number(t.distance) : data.settings.distance; }
function tripEnergyUsed(t){
  if(Number.isFinite(Number(t.energyUsed))) return Number(t.energyUsed);
  const consumption=Number.isFinite(Number(t.consumption))?Number(t.consumption):data.settings.consumption;
  return tripDistance(t)*consumption/100;
}
function tripEnergyType(t){ return ['fuel','electric'].includes(t.energyType)?t.energyType:data.settings.energyType; }

function renderStatistics(trips,payments,totalCost,paidTotal){
  const totalKm=trips.reduce((sum,t)=>sum+tripDistance(t),0);
  const avgCost=trips.length?totalCost/trips.length:0;
  const driverCost=totalCost-paidTotal;
  const driverPerKm=totalKm?driverCost/totalKm:0;
  let fuel=0,electric=0;
  trips.forEach(t=>{const used=tripEnergyUsed(t); if(tripEnergyType(t)==='electric') electric+=used; else fuel+=used;});
  const energy=[];
  if(fuel>0) energy.push(`${decimal(fuel)} L`);
  if(electric>0) energy.push(`${decimal(electric)} kWh`);
  $('#statsKm').textContent=`${decimal(totalKm,0)} km`;
  $('#statsAvgCost').textContent=euro(avgCost);
  $('#statsDriverPerKm').textContent=`${decimal(driverPerKm,2)} €/km`;
  $('#statsEnergy').textContent=energy.length?energy.join(' + '):'0';
  const estimated=trips.some(t=>t.distance===null||t.energyUsed===null||t.energyType===null);
  $('#statsNote').textContent=estimated?'Les anciens trajets sans instantané utilisent les réglages actuels pour estimer la distance et l’énergie.':'';
}

function renderSummary(){
  const trips=filteredTrips().filter(t=>!t.noTrip);
  const payments=filteredPayments();
  const paidTotal=payments.reduce((sum,p)=>sum+p.amount,0);
  const totalCost=trips.reduce((sum,t)=>sum+t.cost,0);
  $('#sTrips').textContent=trips.length;
  $('#sReceived').textContent=euro(paidTotal);
  $('#sCost').textContent=euro(totalCost);
  $('#sDriver').textContent=euro(totalCost-paidTotal);
  const relevantPeople=data.people.map((_,i)=>i).filter(i=>!isArchived(i)||trips.some(t=>t.people.includes(i))||payments.some(p=>p.person===i));
  $('#personSummary').innerHTML=relevantPeople.map(i=>{
    const personTrips=trips.filter(t=>t.people.includes(i));
    const due=personTrips.reduce((sum,t)=>sum+t.rate,0);
    const paid=payments.filter(p=>p.person===i).reduce((sum,p)=>sum+p.amount,0);
    const balance=due-paid;
    const state=balance>0?`${euro(balance)} à payer`:balance<0?`Crédit ${euro(Math.abs(balance))}`:'Soldé ✓';
    const cls=balance>0?'balance-positive':balance<0?'balance-credit':'balance-zero';
    return `<div class="summaryPerson"><span>${escapeHTML(personName(i))}${isArchived(i)?'<span class="archive-tag">archivé</span>':''}<br><span class="small">${personTrips.length} jour(s) · dû ${euro(due)} · versé ${euro(paid)}</span></span><span class="${cls}">${state}</span></div>`;
  }).join('');
  renderStatistics(trips,payments,totalCost,paidTotal);
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
  const distance=finite($('#distance').value,data.settings.distance);
  const perKm=finite($('#vehicleCostPerKm').value,data.settings.vehicleCostPerKm);
  const perTrip=Math.max(0,distance)*Math.max(0,perKm);
  const amount=perTrip.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
  $('#vehicleCostHelp').textContent=`Soit ${amount} € pour ${Math.max(0,distance).toLocaleString('fr-FR')} km. Ce coût couvre notamment l’usure, l’entretien et la décote du véhicule.`;
}

function renderPeopleSettings(){
  const active=activePeopleIndices();
  $('#activePeopleSettings').innerHTML=active.length?active.map((i,position)=>`<div class="person-setting-row"><div class="field"><label for="personName${i}">Passager ${position+1}</label><input id="personName${i}" data-person-name="${i}" maxlength="40" autocomplete="off" value="${escapeHTML(personName(i))}"></div><button class="btn secondary archive-person" type="button" data-person-index="${i}">Archiver</button></div>`).join(''):'<p class="small">Aucun passager actif.</p>';
  const archived=data.archivedPeople.filter(i=>i>=0&&i<data.people.length);
  $('#archivedPeopleSection').classList.toggle('hidden',archived.length===0);
  $('#archivedPeopleSettings').innerHTML=archived.map(i=>`<div class="archived-person"><span class="archived-label">${escapeHTML(personName(i))}</span><div class="archived-person-actions"><button class="btn secondary reactivate-person" type="button" data-person-index="${i}">Réactiver</button><button class="btn danger delete-person" type="button" data-person-index="${i}">Supprimer</button></div></div>`).join('');
}

function renderBackupStatus(){
  const el=$('#backupStatus');
  el.classList.remove('warning');
  if(!data.lastBackupAt){
    el.textContent='Aucune sauvegarde enregistrée. Une sauvegarde régulière est recommandée.';
    el.classList.add('warning');
    return;
  }
  const date=new Date(data.lastBackupAt), age=Math.max(0,Math.floor((Date.now()-date.getTime())/86400000));
  const label=date.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});
  el.textContent=age>BACKUP_REMINDER_DAYS?`Dernière sauvegarde : ${label} (${age} jours). Pensez à en créer une nouvelle.`:`Dernière sauvegarde : ${label}${age===0?' (aujourd’hui)':` · il y a ${age} jour${age>1?'s':''}`}.`;
  if(age>BACKUP_REMINDER_DAYS) el.classList.add('warning');
}

function renderSettings(){
  $('#themeMode').value=data.settings.theme||'system';
  $('#energyType').value=data.settings.energyType||'fuel';
  for(const key of ['distance','consumption','energyPrice','toll','vehicleCostPerKm']) $(`#${key}`).value=data.settings[key];
  updateEnergyLabels();
  updateVehicleCostHelp();
  renderPeopleSettings();
  renderBackupStatus();
  $('#rates').innerHTML=[1,2,3].map(n=>`<div class="summaryPerson"><span>${n} passager${n>1?'s':''}</span><b>${euro(rate(n))} / passager</b></div>`).join('');
}

function renderAll(){
  if(!$('#tripDate').value) $('#tripDate').value=getToday();
  const date=safeDate($('#tripDate').value);
  $('#todayDate').textContent=new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  renderPeople(); renderHistory(); renderSettings(); renderSummary(); renderPayments();
}

function selectTab(tab){
  $$('.tab').forEach(button=>{
    const active=button.dataset.tab===tab;
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',String(active));
  });
  ['today','history','summary','settings'].forEach(id=>$('#'+id).classList.toggle('hidden',id!==tab));
  if(tab==='summary') renderSummary();
  if(tab==='settings') renderSettings();
  window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}

function saveSettings(){
  const limits={distance:[0,2000],consumption:[0,100],energyPrice:[0,20],toll:[0,1000],vehicleCostPerKm:[0,10]};
  const next={...data.settings};
  for(const [key,[min,max]] of Object.entries(limits)){
    const el=$(`#${key}`), value=Number(el.value);
    if(!Number.isFinite(value)||value<min||value>max){ alert(`Merci de saisir une valeur valide pour ${key}.`); el.focus(); return; }
    next[key]=value;
  }
  next.energyType=['fuel','electric'].includes($('#energyType').value)?$('#energyType').value:'fuel';
  data.settings=next;
  if(saveData()){renderSettings();calcToday();renderSummary();flash('Réglages enregistrés ✓');}
}

function savePeople(){
  $$('[data-person-name]').forEach(input=>{
    const i=Number(input.dataset.personName);
    if(Number.isInteger(i)&&i>=0&&i<data.people.length) data.people[i]=cleanName(input.value,personName(i));
  });
  if(saveData()){renderAll();flash('Noms enregistrés ✓');}
}

function addPerson(){
  if(data.people.length>=MAX_PEOPLE) return alert(`La limite est de ${MAX_PEOPLE} passagers enregistrés.`);
  const input=$('#newPersonName');
  const name=cleanName(input.value,`Passager ${data.people.length+1}`);
  data.people.push(name);
  if(saveData()){input.value='';renderAll();flash(`${name} ajouté ✓`);}
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
  const warning=usedInTrips||usedInPayments ? ' Son historique et ses versements associés seront définitivement supprimés.' : '';
  if(!confirm(`Supprimer définitivement ${name} ? Cette action est irréversible.${warning}`)) return;
  data.people.splice(index,1);
  data.archivedPeople=data.archivedPeople
    .filter(i=>i!==index)
    .map(i=>i>index?i-1:i);
  data.trips=data.trips.map(t=>({
    ...t,
    people:(Array.isArray(t.people)?t.people:[]).filter(i=>i!==index).map(i=>i>index?i-1:i)
  })).filter(t=>Array.isArray(t.people)?t.people.length>0:!t.noTrip);
  data.payments=data.payments.filter(p=>p.person!==index).map(p=>({
    ...p,
    person:p.person>index?p.person-1:p.person
  }));
  if(!data.people.length){ data.people=['Passager 1']; }
  if(saveData()){renderAll();flash(`${name} supprimé ✓`);}
}

function addPayment(){
  const person=Number($('#payPerson').value), amount=Number($('#payAmount').value), date=safeDate($('#payDate').value||getToday());
  if(!Number.isInteger(person)||person<0||person>=data.people.length) return alert('Passager invalide.');
  if(!Number.isFinite(amount)||amount<=0||amount>1_000_000) return alert('Merci de saisir un montant supérieur à 0 €.');
  data.payments.push({id:makeId(),person,amount,date});
  if(saveData()){ $('#payAmount').value=''; renderSummary(); renderPayments(); flash('Versement enregistré ✓'); }
}

function downloadBlob(blob,filename){
  const url=URL.createObjectURL(blob), link=document.createElement('a');
  link.href=url; link.download=filename; link.rel='noopener'; document.body.appendChild(link); link.click();
  setTimeout(()=>{URL.revokeObjectURL(url);link.remove();},600);
}

function markBackup(iso){
  data.lastBackupAt=iso;
  saveData();
  renderBackupStatus();
}

async function backupData(){
  const backupAt=new Date().toISOString();
  const payloadData={...data,lastBackupAt:backupAt};
  const payload={app:'Covoiturage',version:APP_VERSION,exportedAt:backupAt,data:payloadData};
  const filename=`covoiturage-sauvegarde-${getToday()}.json`;
  const content=JSON.stringify(payload,null,2);
  try{
    const file=new File([content],filename,{type:'application/json'});
    if(navigator.share&&navigator.canShare?.({files:[file]})){
      await navigator.share({files:[file],title:'Sauvegarde Covoiturage'});
      markBackup(backupAt); flash('Sauvegarde prête ✓'); return;
    }
  }catch(error){ if(error&&error.name==='AbortError') return; }
  downloadBlob(new Blob([content],{type:'application/json'}),filename);
  markBackup(backupAt);
  flash('Sauvegarde créée ✓');
}

async function restoreData(file){
  if(!file) return;
  if(file.size>MAX_BACKUP_SIZE) throw new Error('too-large');
  const parsed=JSON.parse(await file.text());
  const restored=parsed&&parsed.data?parsed.data:parsed;
  if(!restored||typeof restored!=='object'||!Array.isArray(restored.trips)||!Array.isArray(restored.people)||!restored.settings) throw new Error('format');
  if(!confirm('Restaurer cette sauvegarde ? Les données actuelles de l’application seront remplacées.')) return;
  data=normalizeData(restored);
  if(parsed&&parsed.exportedAt){ const exported=safeIsoDateTime(parsed.exportedAt); if(exported) data.lastBackupAt=exported; }
  if(saveData()){applyTheme();renderAll();flash('Sauvegarde restaurée ✓');}
}

function safeCsvValue(value){
  let s=String(value??'');
  if(/^[=+\-@]/.test(s)) s=`'${s}`;
  return `"${s.replaceAll('"','""')}"`;
}

function exportCsv(){
  const rows=[['Date','Passagers','Nombre','Tarif/passager','Total reçu','Coût trajet'],...data.trips.map(t=>[t.date,t.people.map(personName).join(' / '),t.people.length,t.rate,t.rate*t.people.length,t.cost.toFixed(2)])];
  const csv='\ufeff'+rows.map(row=>row.map(safeCsvValue).join(';')).join('\n');
  downloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),'covoiturage.csv');
}

$$('.tab').forEach(button=>button.addEventListener('click',()=>selectTab(button.dataset.tab)));
$('#save').addEventListener('click',addTrip);
$('#tripDate').addEventListener('change',()=>{
  const date=safeDate($('#tripDate').value||getToday());
  $('#todayDate').textContent=new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
});
$('#saveSettings').addEventListener('click',saveSettings);
$('#energyType').addEventListener('change',updateEnergyLabels);
$('#distance').addEventListener('input',updateVehicleCostHelp);
$('#vehicleCostPerKm').addEventListener('input',updateVehicleCostHelp);
$('#savePeople').addEventListener('click',savePeople);
$('#addPerson').addEventListener('click',addPerson);
$('#newPersonName').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();addPerson();}});
$('#activePeopleSettings').addEventListener('click',event=>{
  const button=event.target.closest('.archive-person'); if(!button) return;
  archivePerson(Number(button.dataset.personIndex));
});
$('#archivedPeopleSettings').addEventListener('click',event=>{
  const reactivate=event.target.closest('.reactivate-person');
  if(reactivate){ reactivatePerson(Number(reactivate.dataset.personIndex)); return; }
  const remove=event.target.closest('.delete-person');
  if(remove){ deleteArchivedPerson(Number(remove.dataset.personIndex)); }
});
$('#addPayment').addEventListener('click',addPayment);
$('#themeMode').addEventListener('change',event=>{data.settings.theme=event.target.value;saveData();applyTheme();flash('Apparence mise à jour ✓');});
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if((data.settings.theme||'system')==='system')applyTheme();});
$('#period').addEventListener('change',renderSummary);
$('#backupData').addEventListener('click',()=>{void backupData();});
$('#restoreFile').addEventListener('change',async event=>{
  const input=event.target, file=input.files&&input.files[0];
  try{await restoreData(file);}catch{alert('Ce fichier ne semble pas être une sauvegarde Covoiturage valide.');}finally{input.value='';}
});
$('#export').addEventListener('click',exportCsv);

$('#historyList').addEventListener('click',event=>{
  const button=event.target.closest('.delete-trip'); if(!button) return;
  const id=button.dataset.id;
  if(confirm('Supprimer ce trajet ?')){data.trips=data.trips.filter(t=>t.id!==id);saveData();renderAll();}
});
$('#paymentHistory').addEventListener('click',event=>{
  const button=event.target.closest('.delete-payment'); if(!button) return;
  const id=button.dataset.id;
  if(confirm('Supprimer ce versement ?')){data.payments=data.payments.filter(p=>p.id!==id);saveData();renderAll();flash('Versement supprimé');}
});

document.addEventListener('click',event=>{
  const button=event.target.closest('button'); if(!button) return;
  button.animate([{transform:'scale(1)'},{transform:'scale(.97)'},{transform:'scale(1)'}],{duration:180,easing:'ease-out'});
});

applyTheme();
renderAll();

if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});}
