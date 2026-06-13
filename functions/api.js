// ============================================================
// Vita Cloud — función única (auth + datos + MCP) para Netlify
// Rutas (config.path abajo):
//   POST /api/auth/register   POST /api/auth/login
//   GET/PUT /api/data[/:key]   GET/POST /api/mcp-token
//   POST /mcp   (servidor MCP, JSON-RPC; token personal)
// Base de datos: Netlify DB (Neon) vía @netlify/neon (auto-provisión).
// ============================================================
import { neon } from "@netlify/neon";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export const config = {
  path: ["/api/auth/register", "/api/auth/login", "/api/auth/forgot", "/api/auth/reset", "/api/data", "/api/data/*", "/api/mcp-token", "/mcp"],
};

const JWT_SECRET = process.env.JWT_SECRET || "cambia-este-secreto";
// Configuración de correo (Resend). Pon estas variables en Netlify:
//   RESEND_API_KEY  -> tu API key de https://resend.com
//   RESEND_FROM     -> remitente verificado, ej. "Vita <no-reply@tudominio.com>"
//                      (por defecto usa el remitente de prueba de Resend)
//   APP_URL         -> (opcional) URL pública de la app para los links del correo
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM = process.env.RESEND_FROM || "Vita <onboarding@resend.dev>";
const RESET_TTL_MIN = 60; // minutos de validez del link
const VALID_KEYS = new Set(["profile","log","plans","daily_menu","water_log","weight_history","weekly_report","coach_memory"]);

const sql = (() => { try { return neon(); } catch { return null; } })();

let _schema;
async function ensureSchema() {
  if (!sql) return;
  if (!_schema) _schema = (async () => {
    await sql`create extension if not exists pgcrypto`;
    await sql`create table if not exists users (id uuid primary key default gen_random_uuid(), email text unique not null, password_hash text not null, created_at timestamptz not null default now())`;
    await sql`create table if not exists user_data (user_id uuid not null references users(id) on delete cascade, key text not null, value jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now(), primary key (user_id, key))`;
    await sql`create table if not exists mcp_tokens (token text primary key, user_id uuid not null references users(id) on delete cascade, name text, created_at timestamptz not null default now(), last_used_at timestamptz)`;
    await sql`create table if not exists password_resets (token text primary key, user_id uuid not null references users(id) on delete cascade, expires_at timestamptz not null, used_at timestamptz, created_at timestamptz not null default now())`;
  })().catch((e) => { _schema = null; throw e; });
  return _schema;
}

const CORS = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"Content-Type, Authorization", "Access-Control-Allow-Methods":"GET, POST, PUT, DELETE, OPTIONS" };
const json = (d, s=200, h={}) => new Response(JSON.stringify(d), { status:s, headers:{ "Content-Type":"application/json", ...CORS, ...h } });

function userFromJwt(req) {
  const m = (req.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try { const p = jwt.verify(m[1], JWT_SECRET); return { id:p.sub, email:p.email }; } catch { return null; }
}
function signToken(u){ return jwt.sign({ sub:u.id, email:u.email }, JWT_SECRET, { expiresIn:"30d" }); }
function randomToken(){ const b=crypto.getRandomValues(new Uint8Array(24)); return "vita_"+btoa(String.fromCharCode(...b)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
function resetToken(){ const b=crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...b)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }

async function sendResetEmail(email, link){
  if (!RESEND_API_KEY) { console.log("[vita] RESEND_API_KEY ausente; link de reset:", link); return false; }
  const html =
    '<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#14201c">'+
    '<h2 style="margin:0 0 8px">Restablecer tu contraseña de Vita</h2>'+
    '<p style="color:#5a6b64;font-size:14px">Recibimos una solicitud para restablecer tu contraseña. '+
    'Haz clic en el botón para crear una nueva. El enlace vence en '+RESET_TTL_MIN+' minutos.</p>'+
    '<p style="margin:22px 0"><a href="'+link+'" style="background:#14201c;color:#fafdfc;text-decoration:none;'+
    'padding:13px 22px;border-radius:12px;font-weight:600;display:inline-block">Crear nueva contraseña</a></p>'+
    '<p style="color:#5a6b64;font-size:12px">Si el botón no funciona, copia este enlace:<br>'+
    '<span style="word-break:break-all">'+link+'</span></p>'+
    '<p style="color:#5a6b64;font-size:12px">Si no fuiste tú, ignora este correo; tu contraseña no cambiará.</p></div>';
  try{
    const r = await fetch("https://api.resend.com/emails", {
      method:"POST",
      headers:{ "Authorization":"Bearer "+RESEND_API_KEY, "Content-Type":"application/json" },
      body: JSON.stringify({ from: RESEND_FROM, to:[email], subject:"Restablecer tu contraseña de Vita", html }),
    });
    if(!r.ok){ console.log("[vita] error Resend:", r.status, await r.text().catch(()=>"")); return false; }
    return true;
  }catch(e){ console.log("[vita] excepción Resend:", e?.message||e); return false; }
}

async function getData(uid,key){ await ensureSchema(); const r=await sql`select value from user_data where user_id=${uid} and key=${key}`; return r[0]?.value ?? null; }
async function setData(uid,key,val){ await ensureSchema(); await sql`insert into user_data (user_id,key,value,updated_at) values (${uid},${key},${JSON.stringify(val)}::jsonb, now()) on conflict (user_id,key) do update set value=excluded.value, updated_at=now()`; }
async function allData(uid){ await ensureSchema(); const r=await sql`select key,value from user_data where user_id=${uid}`; const o={}; for(const x of r) o[x.key]=x.value; return o; }
async function uidFromMcp(token){ if(!sql||!token) return null; await ensureSchema(); const r=await sql`update mcp_tokens set last_used_at=now() where token=${token} returning user_id`; return r[0]?.user_id||null; }

// ---------- MCP ----------
const todayStr = () => new Date().toISOString().slice(0,10);
const eDate = e => { const r=e?.date||e?.fecha||e?.ts||e?.createdAt||e?.timestamp; return r?String(r).slice(0,10):null; };
function eMac(e){ const p=o=>({kcal:+o.kcal||0,protein:+o.protein||0,carbs:+o.carbs||0,fat:+o.fat||0}); if(Array.isArray(e?.items)&&e.items.length){ return e.items.reduce((a,it)=>{const m=p(it);return{kcal:a.kcal+m.kcal,protein:a.protein+m.protein,carbs:a.carbs+m.carbs,fat:a.fat+m.fat};},{kcal:0,protein:0,carbs:0,fat:0}); } return p(e||{}); }

const TOOLS = [
  { name:"vita_get_profile", description:"Devuelve el perfil de salud del usuario.", inputSchema:{type:"object",properties:{}},
    handler:async(uid)=> (await getData(uid,"profile"))||{} },
  { name:"vita_set_profile", description:"Actualiza campos del perfil (solo mezcla los enviados).", inputSchema:{type:"object",properties:{fields:{type:"object"}},required:["fields"]},
    handler:async(uid,a)=>{ const p=(await getData(uid,"profile"))||{}; const m={...p,...(a.fields||{})}; await setData(uid,"profile",m); return m; } },
  { name:"vita_log_meal", description:"Registra una comida con calorías y macros.", inputSchema:{type:"object",properties:{name:{type:"string"},kcal:{type:"number"},protein:{type:"number"},carbs:{type:"number"},fat:{type:"number"},sugar:{type:"number"},fiber:{type:"number"},sodium:{type:"number"},portion:{type:"string"},meal_type:{type:"string"},date:{type:"string"}},required:["name","kcal"]},
    handler:async(uid,a)=>{ const log=(await getData(uid,"log"))||[]; const arr=Array.isArray(log)?log:[]; const e={id:"mcp_"+Date.now().toString(36),source:"mcp",date:a.date||todayStr(),ts:new Date().toISOString(),name:a.name,portion:a.portion||"",meal_type:a.meal_type||"",kcal:+a.kcal||0,protein:+a.protein||0,carbs:+a.carbs||0,fat:+a.fat||0,sugar:+a.sugar||0,fiber:+a.fiber||0,sodium:+a.sodium||0}; arr.push(e); await setData(uid,"log",arr); return {registrado:e,total_comidas:arr.length}; } },
  { name:"vita_get_day", description:"Comidas y totales de un día.", inputSchema:{type:"object",properties:{date:{type:"string"}}},
    handler:async(uid,a)=>{ const date=a.date||todayStr(); const log=(await getData(uid,"log"))||[]; const arr=Array.isArray(log)?log:[]; const meals=arr.filter(e=>eDate(e)===date); const t=meals.reduce((ac,e)=>{const m=eMac(e);return{kcal:ac.kcal+m.kcal,protein:ac.protein+m.protein,carbs:ac.carbs+m.carbs,fat:ac.fat+m.fat};},{kcal:0,protein:0,carbs:0,fat:0}); return {date,comidas:meals,totales:t}; } },
  { name:"vita_log_water", description:"Registra agua (ml) en un día.", inputSchema:{type:"object",properties:{amount_ml:{type:"number"},date:{type:"string"}},required:["amount_ml"]},
    handler:async(uid,a)=>{ const date=a.date||todayStr(); const w=(await getData(uid,"water_log"))||{}; const o=(w&&typeof w==="object")?w:{}; o[date]=(+o[date]||0)+(+a.amount_ml||0); await setData(uid,"water_log",o); return {date,total_ml:o[date]}; } },
  { name:"vita_log_weight", description:"Registra peso (kg) en una fecha.", inputSchema:{type:"object",properties:{weight_kg:{type:"number"},date:{type:"string"}},required:["weight_kg"]},
    handler:async(uid,a)=>{ const h=(await getData(uid,"weight_history"))||[]; const arr=Array.isArray(h)?h:[]; const pt={date:a.date||todayStr(),weight:+a.weight_kg||0}; arr.push(pt); await setData(uid,"weight_history",arr); return {registrado:pt,total_puntos:arr.length}; } },
  { name:"vita_add_workout", description:"Agrega una rutina/plan de ejercicio.", inputSchema:{type:"object",properties:{title:{type:"string"},details:{type:"string"}},required:["title"]},
    handler:async(uid,a)=>{ const pl=(await getData(uid,"plans"))||[]; const arr=Array.isArray(pl)?pl:[]; const p={id:"mcp_"+Date.now().toString(36),date:todayStr(),title:a.title,details:a.details||"",source:"mcp"}; arr.push(p); await setData(uid,"plans",arr); return {agregado:p,total_planes:arr.length}; } },
  { name:"vita_summary", description:"Resumen de los últimos N días (promedios).", inputSchema:{type:"object",properties:{days:{type:"number"}}},
    handler:async(uid,a)=>{ const days=Math.max(1,Math.min(90,+a.days||7)); const log=(await getData(uid,"log"))||[]; const arr=Array.isArray(log)?log:[]; const s=new Date(); s.setDate(s.getDate()-(days-1)); const ss=s.toISOString().slice(0,10); const rec=arr.filter(e=>{const d=eDate(e);return d&&d>=ss;}); const t=rec.reduce((ac,e)=>{const m=eMac(e);return{kcal:ac.kcal+m.kcal,protein:ac.protein+m.protein,carbs:ac.carbs+m.carbs,fat:ac.fat+m.fat};},{kcal:0,protein:0,carbs:0,fat:0}); return {dias:days,comidas_contadas:rec.length,totales:t,promedio_diario:{kcal:Math.round(t.kcal/days),protein:Math.round(t.protein/days),carbs:Math.round(t.carbs/days),fat:Math.round(t.fat/days)}}; } },
  { name:"vita_get_data", description:"Avanzado: bloque crudo por clave.", inputSchema:{type:"object",properties:{key:{type:"string"}},required:["key"]},
    handler:async(uid,a)=> (await getData(uid,a.key)) ?? null },
];
const TMAP = Object.fromEntries(TOOLS.map(t=>[t.name,t]));
const rRes=(id,result)=>({jsonrpc:"2.0",id,result});
const rErr=(id,code,message)=>({jsonrpc:"2.0",id,error:{code,message}});

async function handleRpc(msg, uid){
  const { id, method, params } = msg;
  if (method==="initialize") return rRes(id,{protocolVersion:"2025-06-18",capabilities:{tools:{}},serverInfo:{name:"vita",version:"1.0.0"}});
  if (method==="ping") return rRes(id,{});
  if (method&&method.startsWith("notifications/")) return null;
  if (method==="tools/list") return rRes(id,{tools:TOOLS.map(({name,description,inputSchema})=>({name,description,inputSchema}))});
  if (method==="tools/call"){
    const t=TMAP[params?.name]; if(!t) return rErr(id,-32602,"Herramienta desconocida: "+params?.name);
    try{ const data=await t.handler(uid, params.arguments||{}); return rRes(id,{content:[{type:"text",text:JSON.stringify(data,null,2)}]}); }
    catch(e){ return rRes(id,{isError:true,content:[{type:"text",text:"Error: "+(e?.message||String(e))}]}); }
  }
  return rErr(id,-32601,"Método no soportado: "+method);
}

async function handleMcp(req){
  if (!sql) return json({error:"db_not_configured"},500);
  const url=new URL(req.url);
  const bearer=(req.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i)?.[1];
  const token=bearer||url.searchParams.get("token");
  if (req.method==="GET") return json({ok:true,server:{name:"vita",version:"1.0.0"},transport:"streamable-http",tools:TOOLS.length});
  if (req.method!=="POST") return json({error:"method_not_allowed"},405);
  const uid=await uidFromMcp(token);
  if (!uid) return json(rErr(null,-32001,"Token MCP inválido o ausente"),401);
  let payload; try{ payload=await req.json(); }catch{ return json(rErr(null,-32700,"JSON inválido"),400); }
  if (Array.isArray(payload)){ const out=[]; for(const m of payload){ const r=await handleRpc(m,uid); if(r) out.push(r);} return json(out); }
  const r=await handleRpc(payload,uid); if(r===null) return new Response("",{status:202}); return json(r);
}

// ---------- router ----------
export default async (req) => {
  if (req.method==="OPTIONS") return new Response("",{status:204,headers:CORS});
  const path = new URL(req.url).pathname;

  if (path==="/mcp") return handleMcp(req);
  if (!sql) return json({error:"db_not_configured"},500);

  if (path==="/api/auth/register" || path==="/api/auth/login"){
    if (req.method!=="POST") return json({error:"method_not_allowed"},405);
    await ensureSchema();
    let b; try{ b=await req.json(); }catch{ return json({error:"invalid_json"},400); }
    const email=String(b.email||"").trim().toLowerCase(); const pass=String(b.password||"");
    if (path.endsWith("register")){
      if(!email||!pass||pass.length<6) return json({error:"email y password (min 6) requeridos"},400);
      if((await sql`select 1 from users where email=${email}`).length) return json({error:"email_ya_registrado"},409);
      const hash=await bcrypt.hash(pass,10);
      const u=(await sql`insert into users (email,password_hash) values (${email},${hash}) returning id,email`)[0];
      return json({token:signToken(u),user:{id:u.id,email:u.email}});
    } else {
      const u=(await sql`select id,email,password_hash from users where email=${email}`)[0];
      if(!u||!(await bcrypt.compare(pass,u.password_hash))) return json({error:"credenciales_invalidas"},401);
      return json({token:signToken(u),user:{id:u.id,email:u.email}});
    }
  }

  if (path==="/api/auth/forgot"){
    if (req.method!=="POST") return json({error:"method_not_allowed"},405);
    await ensureSchema();
    let b; try{ b=await req.json(); }catch{ return json({error:"invalid_json"},400); }
    const email=String(b.email||"").trim().toLowerCase();
    // Respuesta genérica siempre: no revelamos si el correo existe.
    const generic={ ok:true, message:"Si el correo existe, te enviamos un enlace para restablecer tu contraseña." };
    if(!email) return json(generic);
    const u=(await sql`select id,email from users where email=${email}`)[0];
    if(u){
      const tok=resetToken();
      const exp=new Date(Date.now()+RESET_TTL_MIN*60000).toISOString();
      await sql`insert into password_resets (token,user_id,expires_at) values (${tok},${u.id},${exp})`;
      const base=(process.env.APP_URL||new URL(req.url).origin).replace(/\/$/,"");
      const link=base+"/?reset="+tok;
      await sendResetEmail(u.email, link);
    }
    return json(generic);
  }

  if (path==="/api/auth/reset"){
    if (req.method!=="POST") return json({error:"method_not_allowed"},405);
    await ensureSchema();
    let b; try{ b=await req.json(); }catch{ return json({error:"invalid_json"},400); }
    const tok=String(b.token||""); const pass=String(b.password||"");
    if(!tok) return json({error:"token_requerido"},400);
    if(pass.length<6) return json({error:"password_min"},400);
    const r=(await sql`select token,user_id,expires_at,used_at from password_resets where token=${tok}`)[0];
    if(!r) return json({error:"token_invalido"},400);
    if(r.used_at) return json({error:"token_usado"},400);
    if(new Date(r.expires_at).getTime() < Date.now()) return json({error:"token_expirado"},400);
    const hash=await bcrypt.hash(pass,10);
    await sql`update users set password_hash=${hash} where id=${r.user_id}`;
    await sql`update password_resets set used_at=now() where token=${tok}`;
    // invalida cualquier otro token de reset pendiente del usuario
    await sql`update password_resets set used_at=now() where user_id=${r.user_id} and used_at is null`;
    const u=(await sql`select id,email from users where id=${r.user_id}`)[0];
    return json({ ok:true, token:signToken(u), user:{id:u.id,email:u.email} });
  }

  if (path==="/api/mcp-token"){
    const user=userFromJwt(req); if(!user) return json({error:"no_autorizado"},401); await ensureSchema();
    if (req.method==="GET"){ const r=await sql`select token,name,created_at,last_used_at from mcp_tokens where user_id=${user.id} order by created_at desc`; return json({tokens:r.map(x=>({name:x.name,preview:x.token.slice(0,10)+"…"+x.token.slice(-4),created_at:x.created_at,last_used_at:x.last_used_at}))}); }
    if (req.method==="POST"){ let name="Arkos Note"; try{const b=await req.json(); if(b&&b.name) name=String(b.name).slice(0,60);}catch{} const token=randomToken(); await sql`insert into mcp_tokens (token,user_id,name) values (${token},${user.id},${name})`; return json({token,name}); }
    return json({error:"method_not_allowed"},405);
  }

  if (path.startsWith("/api/data")){
    const user=userFromJwt(req); if(!user) return json({error:"no_autorizado"},401);
    const m=path.match(/\/data\/([^/?#]+)/); const key=m?decodeURIComponent(m[1]):null;
    if (req.method==="GET"){ if(!key) return json({data:await allData(user.id)}); if(!VALID_KEYS.has(key)) return json({error:"key_invalida"},400); return json({key,value:await getData(user.id,key)}); }
    if (req.method==="PUT"||req.method==="POST"){ if(!key||!VALID_KEYS.has(key)) return json({error:"key_invalida"},400); let v; try{v=await req.json();}catch{return json({error:"invalid_json"},400);} await setData(user.id,key,v); return json({ok:true,key}); }
    return json({error:"method_not_allowed"},405);
  }

  return json({error:"not_found"},404);
};
