console.info("ArtBeauty V3.3.0 cargado correctamente");
const API_URL = "https://script.google.com/macros/s/AKfycbyNdSbHFgVadu08GVDlNQT5Dqat97l8pi33nVlkDBcBv1o-unYV8Gewq4Fi2NdK7ywNGw/exec";
const state = { user:null, dashboard:null, citas:[], clientas:[], servicios:[], pagos:[], configuracion:{}, calendarView:"week", calendarDate:new Date() };
const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n||0));
const today = () => new Date().toISOString().slice(0,10);
const esc = v => String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const slug = v => String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g,"-");
const normalizeTime = value => {
  if (value === null || value === undefined || value === "") return "";
  const s = String(value).trim();

  // Normal HH:mm or HH:mm:ss
  const plain = s.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::\d{2})?(?:\s|$)/);
  if (plain && !s.includes("1899-12-30")) {
    return `${String(Number(plain[1])).padStart(2,"0")}:${plain[2]}`;
  }

  // Google Sheets can return time-only cells as 1899-12-30T09:00:00...
  const sheetTime = s.match(/1899-12-30(?:T|\s)(\d{1,2}):(\d{2})/);
  if (sheetTime) return `${String(Number(sheetTime[1])).padStart(2,"0")}:${sheetTime[2]}`;

  // ISO date containing a time
  const iso = s.match(/T(\d{1,2}):(\d{2})/);
  if (iso) return `${String(Number(iso[1])).padStart(2,"0")}:${iso[2]}`;

  // Decimal fraction of a day (Sheets serial time)
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0 && n < 1) {
    const totalMinutes = Math.round(n * 24 * 60);
    return `${String(Math.floor(totalMinutes / 60) % 24).padStart(2,"0")}:${String(totalMinutes % 60).padStart(2,"0")}`;
  }
  return s.slice(-8, -3);
};
const displayTime = value => {
  const t = normalizeTime(value);
  if (!t) return "";
  const [h,m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2,"0")} ${suffix}`;
};

function toast(message,error=false){const t=$("toast");t.textContent=message;t.className="toast show"+(error?" error":"");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.className="toast",3200)}
function loading(on){$("loading").classList.toggle("hidden",!on)}

async function api(action,data={}){
  const params=new URLSearchParams();
  params.set("action",action);
  Object.entries(data).forEach(([k,v])=>params.set(k,typeof v==="object"?JSON.stringify(v):String(v??"")));
  let response;
  try{
    response=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body:params.toString(),redirect:"follow"});
  }catch(err){throw new Error("No se pudo conectar. Revisa Internet y la implementación de Apps Script.")}
  if(!response.ok) throw new Error("Error de conexión "+response.status);
  const result=await response.json();
  if(!result.ok) throw new Error(result.error||"Ocurrió un error");
  return result.data;
}

document.addEventListener("DOMContentLoaded",()=>{
  $("todayText").textContent=new Intl.DateTimeFormat("es-MX",{dateStyle:"full"}).format(new Date());
  bindEvents(); applyTheme(localStorage.getItem("ab_theme")||"light");
  const saved=sessionStorage.getItem("ab_user");
  if(saved){try{state.user=JSON.parse(saved);showApp();loadAll();}catch{sessionStorage.removeItem("ab_user")}}
});

function bindEvents(){
  $("loginForm").addEventListener("submit",login);
  $("logoutBtn").onclick=logout;$("menuBtn").onclick=()=> $("sidebar").classList.toggle("open");
  $("refreshBtn").onclick=loadAll;
  document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>go(b.dataset.page));
  document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  $("newAppointmentBtn").onclick=openAppointment;$("quickAppointment").onclick=openAppointment;$("receptionNewAppointment").onclick=openAppointment;
  $("newClientBtn").onclick=openClient;$("quickClient").onclick=openClient;$("receptionNewClient").onclick=openClient;
  $("newServiceBtn").onclick=openService;
  $("newPaymentBtn").onclick=openPayment;$("quickPayment").onclick=openPayment;$("receptionPayment").onclick=openPayment;
  $("receptionCheckIn").onclick=openCheckIn;
  $("appointmentSearch").oninput=renderAppointments;$("appointmentDateFilter").onchange=renderAppointments;$("appointmentStatusFilter").onchange=renderAppointments;
  $("calendarPrev").onclick=()=>moveCalendar(-1);$("calendarNext").onclick=()=>moveCalendar(1);$("calendarToday").onclick=()=>{state.calendarDate=new Date();renderAppointments()};
  document.querySelectorAll("[data-calendar-view]").forEach(b=>b.onclick=()=>{state.calendarView=b.dataset.calendarView;document.querySelectorAll("[data-calendar-view]").forEach(x=>x.classList.toggle("active",x===b));renderAppointments()});
  $("clientSearch").oninput=renderClients;
  $("profileCloseBtn").onclick=()=>$("clientProfileDialog").close();
  $("profileEditBtn").onclick=()=>{const id=$("clientProfileDialog").dataset.clientId;const c=state.clientas.find(x=>String(x.ID)===String(id));if(c){$("clientProfileDialog").close();openClient(c)}};
  $("galleryUploadClose").onclick=closeGalleryUpload;
  $("galleryUploadCancel").onclick=closeGalleryUpload;
  $("galleryUploadForm").onsubmit=saveGalleryWork;
  $("galleryBefore").onchange=e=>previewGalleryFile(e.target.files[0],"galleryBeforePreview");
  $("galleryAfter").onchange=e=>previewGalleryFile(e.target.files[0],"galleryAfterPreview");
  $("galleryViewerClose").onclick=()=>$("galleryViewerDialog").close();
  $("dashboardRange").onchange=renderDashboardPro;
  $("modalClose").onclick=closeModal;$("modalCancel").onclick=closeModal;$("modalForm").onsubmit=saveModal;
  $("aiSend").onclick=sendAI;$("aiInput").addEventListener("keydown",e=>{if(e.key==="Enter")sendAI()});
  document.querySelectorAll(".quick-prompts button").forEach(b=>b.onclick=()=>{$("aiInput").value=b.textContent;sendAI()});
  $("themeSelect").onchange=e=>applyTheme(e.target.value);
  $("saveSettingsBtn").onclick=saveSettings;
}

async function login(e){
  e.preventDefault();loading(true);
  try{
    const user=await api("login",{usuario:$("loginUser").value,password:$("loginPassword").value});
    state.user=user;sessionStorage.setItem("ab_user",JSON.stringify(user));showApp();await loadAll();toast("Bienvenida, "+user.Nombre);
  }catch(err){toast(err.message,true)}finally{loading(false)}
}
function showApp(){
  $("loginView").classList.add("hidden");$("appView").classList.remove("hidden");
  $("userName").textContent=state.user.Nombre;$("userInitial").textContent=(state.user.Nombre||"?")[0].toUpperCase();$("roleLabel").textContent=state.user.Rol;
  const admin=/admin/i.test(state.user.Rol||"");document.querySelectorAll(".admin-only,.admin-nav").forEach(x=>x.classList.toggle("hidden",!admin));
  if(!admin && /recep/i.test(state.user.Rol||"")) go("reception");
}
function logout(){sessionStorage.clear();state.user=null;$("appView").classList.add("hidden");$("loginView").classList.remove("hidden");$("loginPassword").value=""}
function go(page){
  document.querySelectorAll(".page").forEach(x=>x.classList.toggle("active",x.id===page));
  document.querySelectorAll("#mainNav button").forEach(x=>x.classList.toggle("active",x.dataset.page===page));
  const btn=document.querySelector(`#mainNav button[data-page="${page}"]`);$("pageTitle").textContent=btn?btn.innerText.trim():"ArtBeauty";$("sidebar").classList.remove("open");
}

async function loadAll(){
  if(!state.user)return;loading(true);
  try{
    const [dashboard,citas,clientas,servicios,pagos,config]=await Promise.all([
      api("getDashboard"),api("getCitas"),api("getClientas"),api("getServicios",{soloActivos:false}),api("getPagos"),api("getConfiguracion")
    ]);
    Object.assign(state,{dashboard,citas,clientas,servicios,pagos,configuracion:config});
    renderAll();$("apiStatus").textContent="Conectado";$("apiStatus").style.color="var(--success)";
  }catch(err){toast(err.message,true);$("apiStatus").textContent="Sin conexión";$("apiStatus").style.color="var(--danger)"}finally{loading(false)}
}
function renderAll(){renderDashboard();renderAppointments();renderClients();renderServices();renderPayments();renderReception();renderSettings();renderAIRecommendations()}

function renderDashboard(){
  renderDashboardPro();
}
function dashboardDateRange(){
  const mode=$("dashboardRange")?.value||"month";
  const now=new Date(),start=new Date(now),end=new Date(now);
  start.setHours(0,0,0,0);end.setHours(23,59,59,999);
  if(mode==="today"){}
  else if(mode==="week"){
    const day=start.getDay()||7;
    start.setDate(start.getDate()-day+1);
    end.setDate(start.getDate()+6);
  }else if(mode==="month"){
    start.setDate(1);
    end.setMonth(start.getMonth()+1,0);
  }else if(mode==="year"){
    start.setMonth(0,1);
    end.setMonth(11,31);
  }else{
    start.setFullYear(2000,0,1);
    end.setFullYear(2100,11,31);
  }
  return {mode,start,end};
}
function inRange(value,start,end){
  const d=parseLocalDate(dateKey(value));
  return d>=start&&d<=end;
}
function dashboardPaymentsInRange(start,end){
  return state.pagos.filter(p=>inRange(p.Fecha,start,end));
}
function dashboardAppointmentsInRange(start,end){
  return state.citas.filter(c=>inRange(c.Fecha,start,end));
}
function renderDashboardPro(){
  if(!$("dashboardStats"))return;
  const {mode,start,end}=dashboardDateRange();
  const citas=dashboardAppointmentsInRange(start,end);
  const pagos=dashboardPaymentsInRange(start,end);
  const total=pagos.reduce((s,p)=>s+Number(p.Total||0),0);
  const tips=pagos.reduce((s,p)=>s+Number(p.Propina||0),0);
  const completed=citas.filter(c=>String(c.Estado).toLowerCase()==="completada").length;
  const cancelled=citas.filter(c=>["cancelada","no se presentó"].includes(String(c.Estado).toLowerCase())).length;
  const uniqueClients=new Set(citas.map(c=>c.ClientaID||String(c.ClientaNombre||"").toLowerCase()).filter(Boolean)).size;
  const avg=pagos.length?total/pagos.length:0;

  $("dashboardStats").innerHTML=[
    ["Ingresos",money(total),"Ventas registradas"],
    ["Propinas",money(tips),"Total del periodo"],
    ["Citas",String(citas.length),`${completed} completadas`],
    ["Clientas",String(uniqueClients),"Atendidas en el periodo"],
    ["Ticket promedio",money(avg),"Promedio por pago"],
    ["Cancelaciones",String(cancelled),"Incluye ausencias"]
  ].map(([label,value,sub])=>`<article class="stat-card-pro"><span>${label}</span><strong>${value}</strong><small>${sub}</small></article>`).join("");

  renderSalesChart(pagos,mode,start,end);
  renderStatusChart(citas);
  renderTopServices(citas,pagos);
  renderEmployeePerformance(citas,pagos);
  renderTopClients(citas,pagos);
  renderUpcomingAppointments();
}
function chartBuckets(mode,start,end){
  const buckets=[];
  const cursor=new Date(start);
  if(mode==="today"){
    for(let h=8;h<=20;h++)buckets.push({key:String(h),label:`${h%12||12}${h>=12?"p":"a"}`,value:0});
  }else if(mode==="week"){
    for(let i=0;i<7;i++){const d=addDays(start,i);buckets.push({key:localISO(d),label:formatDay(d,{weekday:"short"}),value:0})}
  }else if(mode==="month"){
    for(let d=1;d<=end.getDate();d++){const x=new Date(start.getFullYear(),start.getMonth(),d);buckets.push({key:localISO(x),label:String(d),value:0})}
  }else if(mode==="year"){
    for(let m=0;m<12;m++){const x=new Date(start.getFullYear(),m,1);buckets.push({key:`${start.getFullYear()}-${String(m+1).padStart(2,"0")}`,label:formatDay(x,{month:"short"}),value:0})}
  }else{
    const years=[...new Set(state.pagos.map(p=>dateKey(p.Fecha).slice(0,4)).filter(Boolean))].sort();
    years.forEach(y=>buckets.push({key:y,label:y,value:0}));
  }
  return buckets;
}
function renderSalesChart(pagos,mode,start,end){
  const buckets=chartBuckets(mode,start,end);
  pagos.forEach(p=>{
    const dk=dateKey(p.Fecha),t=normalizeTime(p.Hora||p.HoraPago||"");
    let key=dk;
    if(mode==="today")key=String(Number((t||"0:00").split(":")[0]));
    else if(mode==="year")key=dk.slice(0,7);
    else if(mode==="all")key=dk.slice(0,4);
    const b=buckets.find(x=>x.key===key);if(b)b.value+=Number(p.Total||0);
  });
  const max=Math.max(...buckets.map(b=>b.value),1);
  $("salesChartSubtitle").textContent=`${formatDay(start,{day:"numeric",month:"short",year:"numeric"})} – ${formatDay(end,{day:"numeric",month:"short",year:"numeric"})}`;
  $("salesChart").innerHTML=buckets.length?buckets.map(b=>`<div class="bar-item" title="${b.label}: ${money(b.value)}">
    <div class="bar-value">${b.value?money(b.value):""}</div>
    <div class="bar-track"><div class="bar-fill" style="height:${Math.max(b.value/max*100,b.value?6:0)}%"></div></div>
    <span>${esc(b.label)}</span>
  </div>`).join(""):'<div class="empty">No hay información para graficar.</div>';
}
function renderStatusChart(citas){
  const states={};
  citas.forEach(c=>{const s=c.Estado||"Sin estado";states[s]=(states[s]||0)+1});
  const entries=Object.entries(states).sort((a,b)=>b[1]-a[1]);
  const total=Math.max(citas.length,1);
  let offset=0;
  const segments=entries.map(([name,count],i)=>{
    const pct=count/total*100;
    const start=offset;offset+=pct;
    return `var(--chart-${(i%6)+1}) ${start}% ${offset}%`;
  });
  const gradient=segments.length?`conic-gradient(${segments.join(",")})`:"conic-gradient(#e9dfe4 0 100%)";
  $("appointmentStatusChart").innerHTML=`<div class="donut-chart" style="background:${gradient}"><div><strong>${citas.length}</strong><span>Citas</span></div></div>
    <div class="chart-legend">${entries.length?entries.map(([name,count],i)=>`<p><i style="background:var(--chart-${(i%6)+1})"></i><span>${esc(name)}</span><b>${count}</b></p>`).join(""):'<span class="empty-inline">Sin citas</span>'}</div>`;
}
function renderTopServices(citas,pagos){
  const map={};
  citas.forEach(c=>{
    const name=c.Servicio||"Sin servicio";
    if(!map[name])map[name]={count:0,total:0};
    map[name].count++;
    map[name].total+=Number(c.Total||c.PrecioBase||0);
  });
  const items=Object.entries(map).sort((a,b)=>b[1].count-a[1].count).slice(0,6);
  $("topServicesList").innerHTML=items.length?items.map(([name,v],i)=>`<article><span class="rank-number">${i+1}</span><div><strong>${esc(name)}</strong><small>${v.count} cita(s)</small></div><b>${money(v.total)}</b></article>`).join(""):'<div class="empty">Sin servicios en este periodo.</div>';
}
function renderEmployeePerformance(citas,pagos){
  const map={};
  citas.forEach(c=>{
    const name=c.Empleada||"Sin asignar";
    if(!map[name])map[name]={citas:0,total:0};
    map[name].citas++;
    map[name].total+=Number(c.Total||c.PrecioBase||0);
  });
  const items=Object.entries(map).sort((a,b)=>b[1].total-a[1].total);
  const max=Math.max(...items.map(x=>x[1].total),1);
  $("employeePerformance").innerHTML=items.length?items.map(([name,v])=>`<article>
    <div><strong>${esc(name)}</strong><small>${v.citas} cita(s) · ${money(v.total)}</small></div>
    <div class="performance-track"><span style="width:${Math.max(v.total/max*100,5)}%"></span></div>
  </article>`).join(""):'<div class="empty">No hay información por empleada.</div>';
}
function renderTopClients(citas,pagos){
  const names={};
  state.clientas.forEach(c=>names[String(c.ID)]=c.Nombre);
  const byClient={};
  pagos.forEach(p=>{
    const key=String(p.ClientaID||p.ClientaNombre||"Sin identificar");
    if(!byClient[key])byClient[key]={name:names[key]||p.ClientaNombre||"Clienta",total:0,count:0};
    byClient[key].total+=Number(p.Total||0);byClient[key].count++;
  });
  const items=Object.values(byClient).sort((a,b)=>b.total-a.total).slice(0,6);
  $("topClientsList").innerHTML=items.length?items.map((c,i)=>`<article><span class="rank-number">${i+1}</span><div><strong>${esc(c.name)}</strong><small>${c.count} pago(s)</small></div><b>${money(c.total)}</b></article>`).join(""):'<div class="empty">Sin pagos vinculados a clientas.</div>';
}
function renderUpcomingAppointments(){
  const now=new Date();
  const items=state.citas.filter(c=>{
    const d=parseLocalDate(dateKey(c.Fecha));
    return d>=new Date(now.getFullYear(),now.getMonth(),now.getDate()) && !["cancelada","completada"].includes(String(c.Estado||"").toLowerCase());
  }).sort((a,b)=>`${dateKey(a.Fecha)} ${normalizeTime(a.HoraInicio)}`.localeCompare(`${dateKey(b.Fecha)} ${normalizeTime(b.HoraInicio)}`)).slice(0,6);
  $("upcomingAppointments").innerHTML=items.length?items.map(c=>`<article onclick='editAppointment(${JSON.stringify(c.ID)})'>
    <div class="upcoming-date"><strong>${formatDay(parseLocalDate(c.Fecha),{day:"2-digit"})}</strong><span>${formatDay(parseLocalDate(c.Fecha),{month:"short"})}</span></div>
    <div><strong>${esc(c.ClientaNombre||"Clienta")}</strong><small>${esc(displayTime(c.HoraInicio))} · ${esc(c.Servicio||"")}</small></div>
    <span class="badge ${slug(c.Estado)}">${esc(c.Estado||"Pendiente")}</span>
  </article>`).join(""):'<div class="empty">No hay próximas citas.</div>';
}
function listAppointments(items){
  if(!items.length)return '<div class="empty">No hay citas para mostrar.</div>';
  return items.map(c=>`<div class="list-item"><div><strong>${esc(c.ClientaNombre)}</strong><small>${esc(displayTime(c.HoraInicio))} · ${esc(c.Servicio)}</small></div><span class="badge ${slug(c.Estado)}">${esc(c.Estado)}</span></div>`).join("");
}
function renderAppointments(){
  let items=filteredAppointments();
  const listMode=state.calendarView==="list";
  $("professionalCalendar").classList.toggle("hidden",listMode);
  $("appointmentsTable").classList.toggle("hidden",!listMode);
  updateCalendarTitle();
  if(listMode){renderAppointmentTable(items);return}
  if(state.calendarView==="month") renderMonthCalendar(items);
  else if(state.calendarView==="day") renderDayCalendar(items);
  else renderWeekCalendar(items);
}
function filteredAppointments(){
  let items=[...state.citas];const q=$("appointmentSearch").value.toLowerCase(),date=$("appointmentDateFilter").value,status=$("appointmentStatusFilter").value;
  if(q)items=items.filter(c=>`${c.ClientaNombre} ${c.Servicio}`.toLowerCase().includes(q));
  if(date)items=items.filter(c=>dateKey(c.Fecha)===date);
  if(status)items=items.filter(c=>c.Estado===status);
  return items;
}
function renderAppointmentTable(items){
  $("appointmentsTable").innerHTML=items.length?`<table><thead><tr><th>Fecha</th><th>Hora</th><th>Clienta</th><th>Servicio</th><th>Estado</th><th>Total</th><th>Acciones</th></tr></thead><tbody>${items.map(c=>`<tr><td>${esc(dateKey(c.Fecha))}</td><td>${esc(displayTime(c.HoraInicio))}–${esc(displayTime(c.HoraFin))}</td><td><b>${esc(c.ClientaNombre)}</b></td><td>${esc(c.Servicio)}</td><td><span class="badge ${slug(c.Estado)}">${esc(c.Estado)}</span></td><td>${money(c.Total)}</td><td><button class="small-btn" onclick='editAppointment(${JSON.stringify(c.ID)})'>Editar</button></td></tr>`).join("")}</tbody></table>`:'<div class="empty">No hay citas registradas.</div>';
}
function dateKey(value){
  if(!value)return "";
  if(typeof value==="string" && /^\d{4}-\d{2}-\d{2}/.test(value))return value.slice(0,10);
  const d=new Date(value);return isNaN(d)?String(value).slice(0,10):localISO(d);
}
function localISO(d){const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`}
function parseLocalDate(value){const [y,m,d]=dateKey(value).split("-").map(Number);return new Date(y,m-1,d)}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function startOfWeek(d){const x=new Date(d),day=x.getDay();x.setDate(x.getDate()-(day===0?6:day-1));x.setHours(0,0,0,0);return x}
function sameDate(a,b){return localISO(a)===localISO(b)}
function formatDay(d,opts){return new Intl.DateTimeFormat("es-MX",opts).format(d)}
function updateCalendarTitle(){
  const d=state.calendarDate;
  if(state.calendarView==="month")$("calendarTitle").textContent=formatDay(d,{month:"long",year:"numeric"});
  else if(state.calendarView==="day")$("calendarTitle").textContent=formatDay(d,{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  else if(state.calendarView==="list")$("calendarTitle").textContent="Todas las citas";
  else{const s=startOfWeek(d),e=addDays(s,6);$("calendarTitle").textContent=`${formatDay(s,{day:"numeric",month:"short"})} – ${formatDay(e,{day:"numeric",month:"short",year:"numeric"})}`}
}
function moveCalendar(direction){
  const d=new Date(state.calendarDate);
  if(state.calendarView==="month")d.setMonth(d.getMonth()+direction);
  else if(state.calendarView==="day")d.setDate(d.getDate()+direction);
  else if(state.calendarView==="week")d.setDate(d.getDate()+direction*7);
  else d.setMonth(d.getMonth()+direction);
  state.calendarDate=d;renderAppointments();
}
function appointmentCard(c){
  return `<article class="calendar-event status-${slug(c.Estado)}" draggable="true" data-id="${esc(c.ID)}" onclick='editAppointment(${JSON.stringify(c.ID)})' ondragstart="calendarDragStart(event)">
    <strong>${esc(displayTime(c.HoraInicio))} ${esc(c.ClientaNombre||"")}</strong>
    <span>${esc(c.Servicio||"")}</span>
    <small>${esc(c.Empleada||"")} · ${esc(c.Estado||"")}</small>
  </article>`;
}
function dayEvents(items,d){return items.filter(c=>dateKey(c.Fecha)===localISO(d)).sort((a,b)=>normalizeTime(a.HoraInicio).localeCompare(normalizeTime(b.HoraInicio)))}
function renderMonthCalendar(items){
  const base=new Date(state.calendarDate.getFullYear(),state.calendarDate.getMonth(),1),first=startOfWeek(base);
  const heads=["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(x=>`<div class="calendar-weekday">${x}</div>`).join("");
  let cells="";
  for(let i=0;i<42;i++){
    const d=addDays(first,i),events=dayEvents(items,d),outside=d.getMonth()!==base.getMonth();
    cells+=`<div class="calendar-day ${outside?"outside":""} ${sameDate(d,new Date())?"today":""}" data-date="${localISO(d)}" ondragover="event.preventDefault()" ondrop="calendarDrop(event)" onclick="calendarEmptyClick(event)">
      <div class="calendar-day-number">${d.getDate()}</div>
      <div class="calendar-day-events">${events.slice(0,4).map(appointmentCard).join("")}${events.length>4?`<button class="more-events" onclick="openDayFromCalendar(event,'${localISO(d)}')">+${events.length-4} más</button>`:""}</div>
    </div>`;
  }
  $("professionalCalendar").innerHTML=`<div class="month-calendar">${heads}${cells}</div>`;
}
function renderWeekCalendar(items){
  const start=startOfWeek(state.calendarDate);
  const days=Array.from({length:7},(_,i)=>addDays(start,i));
  $("professionalCalendar").innerHTML=`<div class="week-calendar">${days.map(d=>`<div class="week-day ${sameDate(d,new Date())?"today":""}" data-date="${localISO(d)}" ondragover="event.preventDefault()" ondrop="calendarDrop(event)" onclick="calendarEmptyClick(event)">
    <header><span>${formatDay(d,{weekday:"short"})}</span><b>${d.getDate()}</b></header>
    <div class="week-day-body">${dayEvents(items,d).map(appointmentCard).join("")||'<span class="empty-day">Disponible</span>'}</div>
  </div>`).join("")}</div>`;
}
function renderDayCalendar(items){
  const d=new Date(state.calendarDate),events=dayEvents(items,d);
  const hours=Array.from({length:13},(_,i)=>i+8);
  $("professionalCalendar").innerHTML=`<div class="day-calendar" data-date="${localISO(d)}" ondragover="event.preventDefault()" ondrop="calendarDrop(event)">
    ${hours.map(h=>{const hs=String(h).padStart(2,"0")+":00";const hourEvents=events.filter(c=>Number((normalizeTime(c.HoraInicio)||"0:00").split(":")[0])===h);return `<div class="hour-row" onclick="calendarHourClick(event,'${localISO(d)}','${hs}')"><time>${h>12?h-12:h}:00 ${h>=12?"PM":"AM"}</time><div>${hourEvents.map(appointmentCard).join("")}</div></div>`}).join("")}
  </div>`;
}
window.calendarDragStart=e=>{e.dataTransfer.setData("text/plain",e.currentTarget.dataset.id);e.dataTransfer.effectAllowed="move";e.stopPropagation()};
window.calendarDrop=async e=>{
  e.preventDefault();e.stopPropagation();const id=e.dataTransfer.getData("text/plain"),target=e.currentTarget.closest("[data-date]");if(!id||!target)return;
  const c=state.citas.find(x=>String(x.ID)===String(id));if(!c||dateKey(c.Fecha)===target.dataset.date)return;
  loading(true);
  try{await api("updateCita",{...c,Fecha:target.dataset.date,usuarioActual:state.user.Nombre});toast(`Cita movida al ${target.dataset.date}`);await loadAll()}
  catch(err){toast(err.message,true)}finally{loading(false)}
};
window.calendarEmptyClick=e=>{if(e.target.closest(".calendar-event,.more-events"))return;const cell=e.currentTarget;openAppointment({Fecha:cell.dataset.date})};
window.calendarHourClick=(e,date,hour)=>{if(e.target.closest(".calendar-event"))return;const end=String(Number(hour.slice(0,2))+1).padStart(2,"0")+":00";openAppointment({Fecha:date,HoraInicio:hour,HoraFin:end})};
window.openDayFromCalendar=(e,date)=>{e.stopPropagation();state.calendarDate=parseLocalDate(date);state.calendarView="day";document.querySelectorAll("[data-calendar-view]").forEach(x=>x.classList.toggle("active",x.dataset.calendarView==="day"));renderAppointments()};

function renderClients(){
  const q=$("clientSearch").value.toLowerCase();
  const items=state.clientas.filter(c=>`${c.Nombre} ${c.Telefono} ${c.Instagram} ${c.Email||""}`.toLowerCase().includes(q));
  $("clientsGrid").innerHTML=items.length?items.map(c=>{
    const citas=clientAppointments(c),pagos=clientPayments(c,citas);
    const ultima=citas.slice().sort((a,b)=>dateKey(b.Fecha).localeCompare(dateKey(a.Fecha)))[0];
    const total=pagos.reduce((sum,p)=>sum+Number(p.Total||0),0);
    return `<article class="client-card client-card-pro" onclick='openClientProfile(${JSON.stringify(c.ID)})'>
      <div class="client-card-top">
        <div class="client-avatar">${esc((c.Nombre||"?").trim().charAt(0).toUpperCase())}</div>
        <div><strong>${esc(c.Nombre)}</strong><p>${esc(c.Telefono||"Sin teléfono")}</p></div>
      </div>
      <div class="client-card-metrics">
        <span><b>${citas.length}</b><small>Citas</small></span>
        <span><b>${money(total)}</b><small>Compras</small></span>
      </div>
      <p class="client-card-last">${ultima?`Última visita: ${esc(dateKey(ultima.Fecha))}`:"Sin visitas registradas"}</p>
      <div class="client-card-tags">
        ${c.ColoresFavoritos?`<span>${esc(c.ColoresFavoritos)}</span>`:""}
        ${c.ServiciosFavoritos?`<span>${esc(c.ServiciosFavoritos)}</span>`:""}
      </div>
      <div class="card-actions">
        <button class="small-btn" onclick='event.stopPropagation();openClientProfile(${JSON.stringify(c.ID)})'>Ver expediente</button>
        <button class="small-btn" onclick='event.stopPropagation();editClient(${JSON.stringify(c.ID)})'>Editar</button>
      </div>
    </article>`;
  }).join(""):'<div class="empty">No hay clientas registradas.</div>';
}
function clientAppointments(c){
  const id=String(c.ID||""),name=String(c.Nombre||"").trim().toLowerCase();
  return state.citas.filter(a=>
    (id && String(a.ClientaID||"")===id) ||
    (name && String(a.ClientaNombre||"").trim().toLowerCase()===name)
  );
}
function clientPayments(c,citas=clientAppointments(c)){
  const id=String(c.ID||""),appointmentIds=new Set(citas.map(a=>String(a.ID||"")));
  return state.pagos.filter(p=>
    (id && String(p.ClientaID||"")===id) ||
    (p.CitaID && appointmentIds.has(String(p.CitaID)))
  );
}
function clientTopService(citas){
  const counts={};
  citas.forEach(c=>{const s=String(c.Servicio||"").trim();if(s)counts[s]=(counts[s]||0)+1});
  return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||"Sin información";
}
function profileInfo(label,value){
  return `<div class="profile-info-item"><small>${esc(label)}</small><strong>${esc(value||"—")}</strong></div>`;
}
window.openClientProfile=async id=>{
  const c=state.clientas.find(x=>String(x.ID)===String(id));if(!c)return;
  const citas=clientAppointments(c).sort((a,b)=>`${dateKey(b.Fecha)} ${normalizeTime(b.HoraInicio)}`.localeCompare(`${dateKey(a.Fecha)} ${normalizeTime(a.HoraInicio)}`));
  const pagos=clientPayments(c,citas).sort((a,b)=>dateKey(b.Fecha).localeCompare(dateKey(a.Fecha)));
  const total=pagos.reduce((sum,p)=>sum+Number(p.Total||0),0);
  const tips=pagos.reduce((sum,p)=>sum+Number(p.Propina||0),0);
  const completed=citas.filter(x=>String(x.Estado).toLowerCase()==="completada").length;
  const cancelled=citas.filter(x=>["cancelada","no se presentó"].includes(String(x.Estado).toLowerCase())).length;
  $("clientProfileDialog").dataset.clientId=id;
  $("profileClientName").textContent=c.Nombre||"Clienta";
  $("profileClientSubtitle").textContent=[c.Telefono,c.Email,c.Instagram].filter(Boolean).join(" · ")||"Sin información de contacto";
  $("clientProfileBody").innerHTML=`
    <section class="profile-summary-grid">
      <article><span>Total de citas</span><strong>${citas.length}</strong></article>
      <article><span>Visitas completadas</span><strong>${completed}</strong></article>
      <article><span>Total pagado</span><strong>${money(total)}</strong></article>
      <article><span>Propinas</span><strong>${money(tips)}</strong></article>
    </section>

    <section class="profile-section">
      <div class="profile-section-title"><h3>Información y preferencias</h3></div>
      <div class="profile-info-grid">
        ${profileInfo("Teléfono",c.Telefono)}
        ${profileInfo("Email",c.Email)}
        ${profileInfo("Instagram",c.Instagram)}
        ${profileInfo("Servicio más frecuente",clientTopService(citas))}
        ${profileInfo("Colores favoritos",c.ColoresFavoritos)}
        ${profileInfo("Diseños favoritos",c.DisenosFavoritos)}
        ${profileInfo("Servicios favoritos",c.ServiciosFavoritos)}
        ${profileInfo("Alergias",c.Alergias)}
      </div>
      <div class="profile-notes"><small>Notas privadas</small><p>${esc(c.Notas||"Sin notas registradas.")}</p></div>
    </section>

    <section class="profile-section">
      <div class="profile-section-title"><h3>Historial de citas</h3><span>${citas.length} registros</span></div>
      <div class="profile-timeline">
        ${citas.length?citas.slice(0,20).map(a=>`<article>
          <div class="timeline-date"><b>${esc(dateKey(a.Fecha))}</b><small>${esc(displayTime(a.HoraInicio))}</small></div>
          <div class="timeline-content"><strong>${esc(a.Servicio||"Servicio")}</strong><small>${esc(a.Empleada||"")} · ${esc(a.Estado||"")}</small>${a.Notas?`<p>${esc(a.Notas)}</p>`:""}</div>
          <div class="timeline-amount">${money(a.Total||a.PrecioBase||0)}</div>
        </article>`).join(""):'<div class="empty">Esta clienta todavía no tiene citas registradas.</div>'}
      </div>
    </section>

    <section class="profile-section">
      <div class="profile-section-title"><h3>Historial de pagos</h3><span>${pagos.length} registros</span></div>
      <div class="profile-payment-list">
        ${pagos.length?pagos.slice(0,20).map(p=>`<article>
          <div><strong>${esc(dateKey(p.Fecha))}</strong><small>${esc(p.MetodoPago||"Método no indicado")}</small></div>
          <div><strong>${money(p.Total)}</strong><small>Propina ${money(p.Propina)}</small></div>
        </article>`).join(""):'<div class="empty">No hay pagos vinculados con esta clienta.</div>'}
      </div>
    </section>

    <section class="profile-section">
      <div class="profile-section-title">
        <div><h3>Galería de trabajos</h3><span>Fotos antes y después</span></div>
        <button class="primary small-primary" onclick='openGalleryUpload(${JSON.stringify(c.ID)})'>+ Agregar fotos</button>
      </div>
      <div id="clientGalleryGrid" class="client-gallery-grid"><div class="empty">Cargando galería...</div></div>
    </section>

    <section class="profile-section profile-alert ${cancelled?"has-alert":""}">
      <strong>${cancelled?`${cancelled} cancelación(es) o ausencia(s) registrada(s)`:"Sin cancelaciones ni ausencias registradas"}</strong>
    </section>`;
  $("clientProfileDialog").showModal();
  await renderClientGallery(id);
};

function renderServices(){
  $("servicesGrid").innerHTML=state.servicios.length?state.servicios.map(s=>`<article class="service-card"><strong>${esc(s.Servicio)}</strong><p class="muted">${esc(s.Categoria)} · ${Number(s.DuracionMinutos||0)} min</p><div class="price">${s.PrecioDesde?"Desde ":""}${money(s.Precio)}</div><span class="badge ${s.Activo===true||String(s.Activo).toLowerCase()==="true"?"confirmada":"cancelada"}">${s.Activo===true||String(s.Activo).toLowerCase()==="true"?"Activo":"Inactivo"}</span></article>`).join(""):'<div class="empty">No hay servicios.</div>';
}
function renderPayments(){
  const total=state.pagos.reduce((a,p)=>a+Number(p.Total||0),0),tips=state.pagos.reduce((a,p)=>a+Number(p.Propina||0),0),balance=state.pagos.reduce((a,p)=>a+Number(p.Saldo||0),0);
  $("paymentTotal").textContent=money(total);$("tipTotal").textContent=money(tips);$("balanceTotal").textContent=money(balance);
  $("paymentsTable").innerHTML=state.pagos.length?`<table><thead><tr><th>Fecha</th><th>Cita</th><th>Total</th><th>Depósito</th><th>Saldo</th><th>Propina</th><th>Método</th></tr></thead><tbody>${state.pagos.map(p=>`<tr><td>${esc(String(p.Fecha).slice(0,10))}</td><td>${esc(p.CitaID||"—")}</td><td>${money(p.Total)}</td><td>${money(p.Deposito)}</td><td>${money(p.Saldo)}</td><td>${money(p.Propina)}</td><td>${esc(p.MetodoPago)}</td></tr>`).join("")}</tbody></table>`:'<div class="empty">No hay pagos registrados.</div>';
}
function renderReception(){const items=state.citas.filter(c=>String(c.Fecha).slice(0,10)===today());$("receptionAppointments").innerHTML=listAppointments(items)}
function renderSettings(){const c=state.configuracion;$("businessName").value=c.NEGOCIO_NOMBRE||"ArtBeauty";$("businessPhone").value=c.TELEFONO||"";$("businessInstagram").value=c.INSTAGRAM||"@artbeauty.queen";$("businessAddress").value=c.DIRECCION||""}
function renderAIRecommendations(){const d=state.dashboard||{};$("aiRecommendations").innerHTML=`<div class="list-item"><div><strong>${d.citasPendientes||0} citas pendientes</strong><small>Revisa confirmaciones.</small></div></div><div class="list-item"><div><strong>${money(d.gananciaEstimada)}</strong><small>Ganancia estimada registrada.</small></div></div>`}

let modalMode="",editingId="";
function openModal(title,body,mode,id=""){modalMode=mode;editingId=id;$("modalTitle").textContent=title;$("modalBody").innerHTML=body;$("modal").showModal()}
function closeModal(){$("modal").close();modalMode="";editingId=""}
const field=(label,name,value="",type="text",wide=false,extra="")=>`<label class="${wide?"wide":""}">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
function selectField(label,name,options,value="",wide=false){return `<label class="${wide?"wide":""}">${label}<select name="${name}">${options.map(o=>`<option ${String(o)===String(value)?"selected":""}>${esc(o)}</option>`).join("")}</select></label>`}

function openAppointment(c={}){
  const clients=state.clientas.map(x=>x.Nombre),services=state.servicios.filter(x=>String(x.Activo).toLowerCase()!=="false").map(x=>x.Servicio);
  openModal(c.ID?"Editar cita":"Nueva cita",
    field("Fecha","Fecha",dateKey(c.Fecha||today()),"date")+field("Hora de inicio","HoraInicio",normalizeTime(c.HoraInicio)||"09:00","time")+
    field("Hora final","HoraFin",normalizeTime(c.HoraFin)||"10:00","time")+`<label>Clienta<input name="ClientaNombre" list="clientList" value="${esc(c.ClientaNombre||"")}" required><datalist id="clientList">${clients.map(x=>`<option>${esc(x)}</option>`).join("")}</datalist></label>`+
    `<label>Servicio<input name="Servicio" list="serviceList" value="${esc(c.Servicio||"")}" required><datalist id="serviceList">${services.map(x=>`<option>${esc(x)}</option>`).join("")}</datalist></label>`+
    field("Empleada","Empleada",c.Empleada||"Lizbeth")+selectField("Estado","Estado",["Pendiente","Confirmada","En servicio","Completada","Cancelada","No se presentó","Lista de espera"],c.Estado||"Pendiente")+
    field("Precio base","PrecioBase",c.PrecioBase||0,"number",false,'step="0.01"')+field("Cargo mismo día","CargoMismoDia",c.CargoMismoDia||0,"number",false,'step="0.01"')+field("Descuento","Descuento",c.Descuento||0,"number",false,'step="0.01"')+
    `<label class="wide">Notas<textarea name="Notas">${esc(c.Notas||"")}</textarea></label>`,
    c.ID?"updateCita":"saveCita",c.ID||"");
}
window.editAppointment=id=>{const c=state.citas.find(x=>x.ID===id);if(c)openAppointment(c)};
function openClient(c={}){openModal(c.ID?"Editar clienta":"Nueva clienta",field("Nombre","Nombre",c.Nombre||"")+field("Teléfono","Telefono",c.Telefono||"","tel")+field("Instagram","Instagram",c.Instagram||"")+field("Email","Email",c.Email||"","email")+field("Alergias","Alergias",c.Alergias||"", "text",true)+field("Colores favoritos","ColoresFavoritos",c.ColoresFavoritos||"")+field("Diseños favoritos","DisenosFavoritos",c.DisenosFavoritos||"")+field("Servicios favoritos","ServiciosFavoritos",c.ServiciosFavoritos||"", "text",true)+`<label class="wide">Notas<textarea name="Notas">${esc(c.Notas||"")}</textarea></label>`,c.ID?"updateClienta":"saveClienta",c.ID||"")}
window.editClient=id=>{const c=state.clientas.find(x=>x.ID===id);if(c)openClient(c)};
function openService(){openModal("Nuevo servicio",field("Servicio","Servicio")+field("Precio","Precio",0,"number",false,'step="0.01"')+field("Duración en minutos","DuracionMinutos",60,"number")+selectField("Categoría","Categoria",["Uñas","Pedicure","Cabello","Faciales","Depilación","Masajes","Combos","Otros"],"Uñas"),"saveServicio")}
function openPayment(){openModal("Registrar pago",field("Fecha","Fecha",today(),"date")+field("ID de cita","CitaID")+field("ID de clienta","ClientaID")+field("Total","Total",0,"number",false,'step="0.01"')+field("Depósito","Deposito",0,"number",false,'step="0.01"')+field("Propina","Propina",0,"number",false,'step="0.01"')+selectField("Método","MetodoPago",["Efectivo","Zelle","Tap to Pay","Tarjeta","Otro"],"Efectivo")+`<label class="wide">Notas<textarea name="Notas"></textarea></label>`,"savePago")}
function openCheckIn(){
  const todayCitas=state.citas.filter(c=>String(c.Fecha).slice(0,10)===today()&&!["Cancelada","Completada"].includes(c.Estado));
  if(!todayCitas.length)return toast("No hay citas pendientes para hoy.",true);
  openModal("Confirmar llegada",selectField("Cita","ID",todayCitas.map(c=>`${c.ID} | ${displayTime(c.HoraInicio)} | ${c.ClientaNombre}`),"",true),"checkin");
}
async function saveModal(e){
  e.preventDefault();const data=Object.fromEntries(new FormData(e.target).entries());data.usuarioActual=state.user.Nombre;if(editingId)data.ID=editingId;
  if(modalMode==="checkin"){data.ID=(data.ID||"").split(" | ")[0];data.Estado="En servicio";modalMode="updateCita"}
  loading(true);try{await api(modalMode,data);closeModal();toast("Guardado correctamente");await loadAll()}catch(err){toast(err.message,true)}finally{loading(false)}
}

async function saveSettings(){
  const pairs=[["NEGOCIO_NOMBRE",$("businessName").value],["TELEFONO",$("businessPhone").value],["INSTAGRAM",$("businessInstagram").value],["DIRECCION",$("businessAddress").value]];
  loading(true);try{for(const [Clave,Valor] of pairs)await api("saveConfiguracion",{Clave,Valor,usuarioActual:state.user.Nombre});toast("Configuración guardada");await loadAll()}catch(err){toast(err.message,true)}finally{loading(false)}
}
function applyTheme(theme){localStorage.setItem("ab_theme",theme);const dark=theme==="dark"||(theme==="system"&&matchMedia("(prefers-color-scheme:dark)").matches);document.body.classList.toggle("dark",dark);if($("themeSelect"))$("themeSelect").value=theme}
function sendAI(){
  const input=$("aiInput"),q=input.value.trim();if(!q)return;addMessage(q,"user");input.value="";const s=q.toLowerCase(),d=state.dashboard||{};let answer;
  if(s.includes("hoy")&&s.includes("cita"))answer=`Hay ${d.citasHoy||0} cita(s) para hoy.`;
  else if(s.includes("vend")||s.includes("ingreso"))answer=`Los ingresos registrados son ${money(d.ingresosTotales)}.`;
  else if(s.includes("client"))answer=`Hay ${d.clientasRegistradas||0} clientas registradas.`;
  else if(s.includes("servicio")&&s.includes("más")){const counts={};state.citas.forEach(c=>counts[c.Servicio]=(counts[c.Servicio]||0)+1);const top=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];answer=top?`El servicio más registrado es ${top[0]} con ${top[1]} cita(s).`:"Todavía no hay suficientes citas para calcularlo.";}
  else answer="Puedo responder sobre citas de hoy, ingresos, clientas y servicios registrados.";
  setTimeout(()=>addMessage(answer,"bot"),250);
}
function addMessage(text,type){const box=$("aiMessages"),div=document.createElement("div");div.className="message "+type;div.textContent=text;box.appendChild(div);box.scrollTop=box.scrollHeight}


/* ===== Galería de trabajos (IndexedDB) ===== */
const GALLERY_DB_NAME="ArtBeautyGallery";
const GALLERY_STORE="works";
let galleryDBPromise=null;

function openGalleryDB(){
  if(galleryDBPromise)return galleryDBPromise;
  galleryDBPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(GALLERY_DB_NAME,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(GALLERY_STORE)){
        const store=db.createObjectStore(GALLERY_STORE,{keyPath:"id"});
        store.createIndex("clientId","clientId",{unique:false});
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return galleryDBPromise;
}
async function galleryPut(record){
  const db=await openGalleryDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(GALLERY_STORE,"readwrite");
    tx.objectStore(GALLERY_STORE).put(record);
    tx.oncomplete=()=>resolve(record);
    tx.onerror=()=>reject(tx.error);
  });
}
async function galleryDelete(id){
  const db=await openGalleryDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(GALLERY_STORE,"readwrite");
    tx.objectStore(GALLERY_STORE).delete(id);
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error);
  });
}
async function galleryByClient(clientId){
  const db=await openGalleryDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(GALLERY_STORE,"readonly");
    const req=tx.objectStore(GALLERY_STORE).index("clientId").getAll(String(clientId));
    req.onsuccess=()=>resolve((req.result||[]).sort((a,b)=>String(b.date).localeCompare(String(a.date))));
    req.onerror=()=>reject(req.error);
  });
}
function imageToDataURL(file,maxWidth=1200,quality=.78){
  return new Promise((resolve,reject)=>{
    if(!file){resolve("");return}
    const reader=new FileReader();
    reader.onerror=()=>reject(reader.error);
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error("No se pudo leer la imagen."));
      img.onload=()=>{
        const scale=Math.min(1,maxWidth/img.width);
        const canvas=document.createElement("canvas");
        canvas.width=Math.max(1,Math.round(img.width*scale));
        canvas.height=Math.max(1,Math.round(img.height*scale));
        canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL("image/jpeg",quality));
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function previewGalleryFile(file,imgId){
  const img=$(imgId);
  if(!file){img.hidden=true;img.removeAttribute("src");return}
  const url=URL.createObjectURL(file);
  img.src=url;img.hidden=false;
  img.onload=()=>URL.revokeObjectURL(url);
}
window.openGalleryUpload=clientId=>{
  $("galleryClientId").value=clientId;
  $("galleryDate").value=today();
  $("galleryService").value="";
  $("galleryNotes").value="";
  ["galleryBefore","galleryAfter"].forEach(id=>$(id).value="");
  ["galleryBeforePreview","galleryAfterPreview"].forEach(id=>{$(id).hidden=true;$(id).removeAttribute("src")});
  $("galleryUploadDialog").showModal();
};
function closeGalleryUpload(){$("galleryUploadDialog").close()}
async function saveGalleryWork(e){
  e.preventDefault();
  const beforeFile=$("galleryBefore").files[0],afterFile=$("galleryAfter").files[0];
  if(!beforeFile&&!afterFile){toast("Agrega por lo menos una foto.",true);return}
  loading(true);
  try{
    const [before,after]=await Promise.all([imageToDataURL(beforeFile),imageToDataURL(afterFile)]);
    const record={
      id:`WORK-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      clientId:String($("galleryClientId").value),
      date:$("galleryDate").value||today(),
      service:$("galleryService").value.trim(),
      notes:$("galleryNotes").value.trim(),
      before,after,
      createdAt:new Date().toISOString()
    };
    await galleryPut(record);
    closeGalleryUpload();
    await renderClientGallery(record.clientId);
    toast("Trabajo guardado en la galería.");
  }catch(err){toast(err.message||"No se pudo guardar la foto.",true)}
  finally{loading(false)}
}
async function renderClientGallery(clientId){
  const grid=$("clientGalleryGrid");if(!grid)return;
  try{
    const works=await galleryByClient(clientId);
    grid.innerHTML=works.length?works.map(w=>`
      <article class="gallery-work-card">
        <div class="gallery-pair">
          ${w.before?`<button onclick='viewGalleryImage(${JSON.stringify(w.before)},${JSON.stringify(`Antes · ${w.date}`)})'><img src="${w.before}" alt="Antes"><span>ANTES</span></button>`:'<div class="gallery-placeholder">Sin foto antes</div>'}
          ${w.after?`<button onclick='viewGalleryImage(${JSON.stringify(w.after)},${JSON.stringify(`Después · ${w.date}`)})'><img src="${w.after}" alt="Después"><span>DESPUÉS</span></button>`:'<div class="gallery-placeholder">Sin foto después</div>'}
        </div>
        <div class="gallery-work-info">
          <div><strong>${esc(w.service||"Trabajo de uñas")}</strong><small>${esc(w.date)}</small></div>
          ${w.notes?`<p>${esc(w.notes)}</p>`:""}
          <button class="danger-link" onclick='deleteGalleryWork(${JSON.stringify(w.id)},${JSON.stringify(clientId)})'>Eliminar</button>
        </div>
      </article>`).join(""):`<div class="empty gallery-empty">
        <strong>Aún no hay fotografías</strong>
        <p>Agrega fotos del antes y después para crear el historial visual de esta clienta.</p>
        <button class="primary" onclick='openGalleryUpload(${JSON.stringify(clientId)})'>Agregar primer trabajo</button>
      </div>`;
  }catch(err){grid.innerHTML=`<div class="empty">No se pudo abrir la galería.</div>`}
}
window.viewGalleryImage=(src,caption)=>{
  $("galleryViewerImage").src=src;
  $("galleryViewerCaption").textContent=caption||"";
  $("galleryViewerDialog").showModal();
};
window.deleteGalleryWork=async(id,clientId)=>{
  if(!confirm("¿Eliminar estas fotos del expediente?"))return;
  await galleryDelete(id);await renderClientGallery(clientId);toast("Fotos eliminadas.");
};
