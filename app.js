'use strict';

const APP_VERSION = 29;
const STORAGE_KEY = 'covoiturageData';
const MAX_BACKUP_SIZE = 2_000_000;
const DEFAULT_DATA = Object.freeze({
  settings:{distance:85,consumption:6,energyPrice:2.31,energyType:'fuel',toll:6,vehicleCostPerKm:0.10,theme:'system'},
  people:['Passager 1','Passager 2','Passager 3'],
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
  const d=new Date(`${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? fallback : s;
};
const cleanName = (value, fallback) => {
  const text=String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,40);
  return text || fallback;
};
const escapeHTML = value => String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const euro = n => `${Math.round(finite(n,0))} €`;

function normalizeData(raw){
  const base=cloneDefaults();
  if(!raw || typeof raw!=='object' || Array.isArray(raw)) return base;
  const s=raw.settings && typeof raw.settings==='object' ? raw.settings : {};
  const legacyEnergyPrice=s.energyPrice ?? s.diesel;
  const distance=clamp(s.distance,0,2000,85);
  // Migration V28 et antérieures : l'ancien frais fixe par trajet est converti
  // en coût au kilomètre afin de conserver le même coût total après mise à jour.
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
  base.people=[0,1,2].map(i=>cleanName(incomingPeople[i],`Passager ${i+1}`));
  const trips=Array.isArray(raw.trips)?raw.trips.slice(-10000):[];
  base.trips=trips.filter(t=>t&&typeof t==='object').map(t=>({
    id:safeId(t.id),
    date:safeDate(t.date),
    people:[...new Set(Array.isArray(t.people)?t.people.map(Number).filter(i=>Number.isInteger(i)&&i>=0&&i<3):[])],
    noTrip:Boolean(t.noTrip),
    rate:clamp(t.rate,0,10000,0),
    cost:clamp(t.cost,0,10000,0),
    createdAt:typeof t.createdAt==='string'?t.createdAt.slice(0,60):new Date().toISOString()
  }));
  const payments=Array.isArray(raw.payments)?raw.payments.slice(-10000):[];
  base.payments=payments.filter(p=>p&&typeof p==='object').map(p=>({
    id:safeId(p.id),
    person:clamp(Math.trunc(finite(p.person,0)),0,2,0),
    amount:clamp(p.amount,0,1_000_000,0),
    date:safeDate(p.date)
  })).filter(p=>p.amount>0);
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

const vehicleCostPerTrip = () => data.settings.distance*data.settings.vehicleCostPerKm;
const tripCost = () => data.settings.distance*data.settings.consumption/100*data.settings.energyPrice+data.settings.toll+vehicleCostPerTrip();
const rate = n => n ? Math.round(tripCost()/(n+1)) : 0;

function renderPeople(){
  $('#people').innerHTML=data.people.map((name,i)=>`<label class="person"><input type="checkbox" data-person="${i}"><span>${escapeHTML(name)}</span></label>`).join('');
  $$('[data-person]').forEach(el=>el.addEventListener('change',calcToday));
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
  data.trips.push({id:makeId(),date:selectedDate,people,noTrip:false,rate:rate(people.length),cost:tripCost(),createdAt:new Date().toISOString()});
  if(saveData()){
    renderAll();
    flash('Nouveau trajet enregistré ✓');
  }
}

function renderHistory(){
  const trips=[...data.trips].sort((a,b)=>b.date.localeCompare(a.date));
  $('#historyList').innerHTML=trips.length?trips.map(t=>{
    const people=t.noTrip?'Aucun trajet':t.people.map(i=>`<span class="pill">${escapeHTML(data.people[i]||'Passager')}</span>`).join('');
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
  $('#payPerson').innerHTML=data.people.map((name,i)=>`<option value="${i}">${escapeHTML(name)}</option>`).join('');
  if(!$('#payDate').value) $('#payDate').value=getToday();
  const payments=[...data.payments].sort((a,b)=>b.date.localeCompare(a.date));
  $('#paymentHistory').innerHTML=payments.length?`<div class="small payment-caption">Derniers versements</div>${payments.slice(0,8).map(p=>`<div class="payment-item"><span>${escapeHTML(data.people[p.person]||'Passager')}<br><span class="small">${escapeHTML(new Date(`${p.date}T12:00:00`).toLocaleDateString('fr-FR'))}</span></span><span class="payment-value"><b>${euro(p.amount)}</b><button class="btn secondary danger icon-button delete-payment" type="button" aria-label="Supprimer ce versement" data-id="${p.id}">×</button></span></div>`).join('')}`:'<p class="small">Aucun versement enregistré.</p>';
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
  $('#personSummary').innerHTML=data.people.map((name,i)=>{
    const personTrips=trips.filter(t=>t.people.includes(i));
    const due=personTrips.reduce((sum,t)=>sum+t.rate,0);
    const paid=payments.filter(p=>p.person===i).reduce((sum,p)=>sum+p.amount,0);
    const balance=due-paid;
    const state=balance>0?`${euro(balance)} à payer`:balance<0?`Crédit ${euro(Math.abs(balance))}`:'Soldé ✓';
    const cls=balance>0?'balance-positive':balance<0?'balance-credit':'balance-zero';
    return `<div class="summaryPerson"><span>${escapeHTML(name)}<br><span class="small">${personTrips.length} jour(s) · dû ${euro(due)} · versé ${euro(paid)}</span></span><span class="${cls}">${state}</span></div>`;
  }).join('');
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

function renderSettings(){
  $('#themeMode').value=data.settings.theme||'system';
  $('#energyType').value=data.settings.energyType||'fuel';
  for(const key of ['distance','consumption','energyPrice','toll','vehicleCostPerKm']) $(`#${key}`).value=data.settings[key];
  updateEnergyLabels();
  updateVehicleCostHelp();
  data.people.forEach((name,i)=>{$(`#p${i}`).value=name;});
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
  ['today','history','summary','settings'].forEach(id=>{
    const section=$(`#${id}`);
    section.classList.toggle('hidden',id!==tab);
  });
  if(tab==='summary') renderSummary();
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
  data.people=[0,1,2].map(i=>cleanName($(`#p${i}`).value,`Passager ${i+1}`));
  if(saveData()){renderPeople();renderHistory();renderSettings();renderSummary();renderPayments();flash('Prénoms enregistrés ✓');}
}

function addPayment(){
  const person=Number($('#payPerson').value), amount=Number($('#payAmount').value), date=safeDate($('#payDate').value||getToday());
  if(!Number.isInteger(person)||person<0||person>2) return alert('Passager invalide.');
  if(!Number.isFinite(amount)||amount<=0||amount>1_000_000) return alert('Merci de saisir un montant supérieur à 0 €.');
  data.payments.push({id:makeId(),person,amount,date});
  if(saveData()){ $('#payAmount').value=''; renderSummary(); renderPayments(); flash('Versement enregistré ✓'); }
}

function downloadBlob(blob,filename){
  const url=URL.createObjectURL(blob), link=document.createElement('a');
  link.href=url; link.download=filename; link.rel='noopener'; document.body.appendChild(link); link.click();
  setTimeout(()=>{URL.revokeObjectURL(url);link.remove();},600);
}

async function backupData(){
  const payload={app:'Covoiturage',version:APP_VERSION,exportedAt:new Date().toISOString(),data};
  const filename=`covoiturage-sauvegarde-${getToday()}.json`;
  const content=JSON.stringify(payload,null,2);
  try{
    const file=new File([content],filename,{type:'application/json'});
    if(navigator.share&&navigator.canShare?.({files:[file]})){
      await navigator.share({files:[file],title:'Sauvegarde Covoiturage'});
      flash('Sauvegarde prête ✓');
      return;
    }
  }catch(error){
    if(error&&error.name==='AbortError') return;
  }
  downloadBlob(new Blob([content],{type:'application/json'}),filename);
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
  if(saveData()){applyTheme();renderAll();flash('Sauvegarde restaurée ✓');}
}

function safeCsvValue(value){
  let s=String(value??'');
  if(/^[=+\-@]/.test(s)) s=`'${s}`;
  return `"${s.replaceAll('"','""')}"`;
}

function exportCsv(){
  const rows=[['Date','Passagers','Nombre','Tarif/passager','Total reçu','Coût trajet'],...data.trips.map(t=>[t.date,t.people.map(i=>data.people[i]).join(' / '),t.people.length,t.rate,t.rate*t.people.length,t.cost.toFixed(2)])];
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
