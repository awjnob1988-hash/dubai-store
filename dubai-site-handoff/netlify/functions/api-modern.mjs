import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { getStore } from '@netlify/blobs';
const require=createRequire(import.meta.url);
const original=require('../../catalog.json');
const data=()=>getStore({name:'dubai-store-products',consistency:'strong'});
const pictures=()=>getStore({name:'dubai-store-pictures',consistency:'strong'});
// Resolve both Netlify's modern runtime API and classic Lambda environment variables.
const envValue=name=>{
  const v=process.env[name];
  if(typeof v==='string'&&v.length>0)return v;
  try{const value=globalThis.Netlify?.env?.get?.(name);if(typeof value==='string')return value;}catch{}
  return '';
}
const env=()=>({user:envValue('ADMIN_USERNAME')||'admin',pass:envValue('ADMIN_PASSWORD'),key:envValue('ADMIN_SESSION_SECRET')});
const response=(statusCode,obj)=>({statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},body:JSON.stringify(obj)});
const error=(code,message)=>response(code,{error:message});
const same=(a,b)=>crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(),crypto.createHash('sha256').update(String(b)).digest());
const b64=s=>Buffer.from(s).toString('base64url');
function sign(conf){let d=b64(JSON.stringify({exp:Date.now()+21600000,nonce:crypto.randomBytes(16).toString('hex')}));return d+'.'+crypto.createHmac('sha256',conf.key).update(d).digest('base64url');}
function authorized(ev,conf){let s=(ev.headers.authorization||ev.headers.Authorization||'').replace(/^Bearer /i,'');let parts=s.split('.');if(parts.length!==2||s.length>1800)return false;let sig=crypto.createHmac('sha256',conf.key).update(parts[0]).digest('base64url');if(!same(parts[1],sig))return false;try{let p=JSON.parse(Buffer.from(parts[0],'base64url').toString());return Number.isSafeInteger(p.exp)&&p.exp>Date.now();}catch{return false;}}
async function current(){let r=await data().getWithMetadata('live',{type:'json',consistency:'strong'});return r?{catalog:r.data,version:r.etag}:{catalog:original,version:'initial'};}
const clean=s=>typeof s==='string'&&s.length<=1500&&!/[<>"'&\u0000-\u001F]/.test(s);
const id=s=>typeof s==='string'&&/^[a-z][a-z0-9-]{1,64}$/.test(s);
function validate(c){
if(!c||!Array.isArray(c.categories)||!Array.isArray(c.products)||c.categories.length<1||c.categories.length>80||c.products.length>1000)throw Error('قائمة المنتجات أو الأقسام غير صالحة');
let cats=new Set(),prods=new Set();
for(const x of c.categories){if(!id(x.id)||cats.has(x.id)||['admin','api','assets','products','branches','sell','category-template','product-template'].includes(x.id)||!['title','short','sub','image','line'].every(k=>clean(x[k]||'')))throw Error('قسم غير صالح');cats.add(x.id);}
for(const p of c.products){
if(!id(p.id)||prods.has(p.id)||!cats.has(p.category)||!['name','brand','sub','image','variant','description'].every(k=>clean(p[k]||''))||!p.name||!p.image||!p.prices||!Array.isArray(p.specs)||p.specs.length>30)throw Error('تفاصيل منتج غير صالحة');
for(const z of ['new','used'])if(!Array.isArray(p.prices[z])||p.prices[z].length!==2||p.prices[z].some(n=>!Number.isSafeInteger(n)||n<0||n>1000000000)||p.prices[z][1]<p.prices[z][0])throw Error('السعر غير صالح');
if(!p.specs.every(x=>Array.isArray(x)&&x.length===2&&x.every(clean)))throw Error('المواصفات غير صالحة');
if(!/^([a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|gif)|uploads\/[a-z0-9-]{15,55}\.(png|jpg|jpeg|webp|gif))$/i.test(p.image))throw Error('صورة غير صالحة');
// Old items are compatible with both-condition pricing. New entries declare one condition.
if(p.condition!==undefined&&!['new','used','both'].includes(p.condition))throw Error('حالة المنتج غير صالحة');
if(p.condition==='new'||p.condition==='used'){
 const [min,max]=p.prices[p.condition];
 if(min<1||max<min)throw Error('سعر الجهاز غير صالح');
 if(p.condition==='used'&&(!Number.isInteger(p.cleanliness)||p.cleanliness<1||p.cleanliness>100))throw Error('نسبة نظافة المستعمل يجب أن تكون من 1 إلى 100');
 if(p.condition==='new'&&p.cleanliness!==undefined)throw Error('نسبة النظافة للمستعمل فقط');
}
prods.add(p.id);
}
if(c.site!==undefined){if(!c.site||typeof c.site!=='object'||!Object.values(c.site).every(clean))throw Error('إعدادات الموقع غير صالحة');if(c.site.whatsapp&&!/^\d{10,15}$/.test(c.site.whatsapp))throw Error('رقم واتساب غير صالح');}
if(JSON.stringify(c).length>800000)throw Error('المعلومات كبيرة جداً');
}
async function handleLegacy(ev){
let method=ev.httpMethod,action=ev.queryStringParameters?.action||'',conf=env();
try{
// Lambda-compatible Netlify Functions must connect the request before using Blobs.
// Netlify's modern function runtime initializes the Blobs environment automatically.
if(method==='GET'&&action==='store')return response(200,(await current()).catalog);
if(method==='GET'&&action==='image'){
let file=ev.queryStringParameters?.file||'';if(!/^uploads\/[a-z0-9-]{15,55}\.(png|jpg|jpeg|webp|gif)$/i.test(file))return error(404,'الصورة غير موجودة');
let b=await pictures().get(file,{type:'arrayBuffer'});if(!b)return error(404,'الصورة غير موجودة');
let type=/\.png$/i.test(file)?'image/png':/\.webp$/i.test(file)?'image/webp':/\.gif$/i.test(file)?'image/gif':'image/jpeg';
return{statusCode:200,isBase64Encoded:true,headers:{'Content-Type':type,'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'},body:Buffer.from(b).toString('base64')};
}
if(method==='GET'&&action==='status'){
let storage='ok',storageIssue=null;
try{await current()}catch(e){storage='error';storageIssue={type:String(e?.name||'Error').replace(/[^a-zA-Z0-9]/g,'').slice(0,48),code:String(e?.code||'').replace(/[^a-zA-Z0-9_]/g,'').slice(0,48)};console.error('Dubai admin store health:',e)}
return response(200,{configured:conf.pass.length>=12&&conf.key.length>=32,passwordReady:conf.pass.length>=12,sessionReady:conf.key.length>=32,storage,storageIssue});
}
if(conf.pass.length<12||conf.key.length<32)return error(503,'بيانات الحماية غير متاحة للوظيفة الخلفية؛ تأكد من كلمة مرور 12 حرفاً ورمز جلسة 32 حرفاً وصلاحية Functions ثم أعد النشر');
let body={};if(method==='POST'){if((ev.body||'').length>5900000)return error(413,'حجم الملف كبير');try{body=JSON.parse(ev.body||'{}')}catch{return error(400,'الطلب غير صالح')}}
if(method==='POST'&&action==='login'){if(!same(body.username||'',conf.user)||!same(body.password||'',conf.pass))return error(401,'اسم المستخدم أو كلمة المرور غير صحيحة');return response(200,{token:sign(conf)})}
if(!authorized(ev,conf))return error(401,'يرجى تسجيل الدخول');
if(method==='GET'&&action==='workspace')return response(200,await current());
if(method==='POST'&&action==='upload'){
let blob=body.image||{};if(typeof blob.data!=='string'||blob.data.length>2800000||!['png','jpg','jpeg','webp'].includes(blob.ext))return error(400,'صيغة الصورة أو حجمها غير صحيح');
let bin=Buffer.from(blob.data,'base64');if(bin.byteLength>2000000||bin.byteLength<40)return error(400,'الصورة أكبر من 2 ميغابايت');
let valid=blob.ext==='png'?bin.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')):blob.ext==='webp'?bin.toString('ascii',0,4)==='RIFF'&&bin.toString('ascii',8,12)==='WEBP':bin[0]===255&&bin[1]===216&&bin[2]===255;if(!valid)return error(400,'الصورة غير سليمة');
let name='uploads/'+crypto.randomBytes(12).toString('hex')+'.'+blob.ext;
let mime=blob.ext==='png'?'image/png':blob.ext==='webp'?'image/webp':'image/jpeg';
await pictures().set(name,new Blob([bin],{type:mime}));return response(200,{image:name});
}
if(method==='POST'&&action==='publish'){
try{validate(body.catalog)}catch(e){return error(422,String(e?.message||'تفاصيل المنتج غير صالحة').slice(0,130))}
let prev=await current();if(prev.version!==body.version)return error(409,'تغيرت بيانات المتجر من جهاز آخر، حدّث الصفحة ثم جرّب');
let old=await data().getWithMetadata('live',{type:'json',consistency:'strong'});
let result;
try{result=await data().setJSON('live',body.catalog,old?{onlyIfMatch:old.etag}:{onlyIfNew:true})}
catch(e){console.error('Dubai admin publish failed:',e);const kind=String(e?.name||'StorageError').replace(/[^a-zA-Z0-9_]/g,'').slice(0,50);return error(500,'تعذر حفظ المنتج في التخزين ('+kind+')')}
if(!result.modified)return error(409,'يوجد تعديل أحدث، حدّث الصفحة');
return response(200,{success:true,version:result.etag});
}
return error(404,'طلب غير معروف');
}catch(e){console.error('Dubai admin function:',e);return error(500,'تعذر تنفيذ الطلب، راجع سجلات Netlify أو حاول مرة أخرى');}
};
// Modern Netlify Functions v2 adapter: Request and Response unlock automatic Blobs injection.
export default async function handler(request) {
  const url = new URL(request.url);
  const event = {
    httpMethod: request.method,
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    headers: Object.fromEntries(request.headers.entries()),
    body: request.method==='GET' ? '' : await request.text()
  };
  const result = await handleLegacy(event);
  const body = result.isBase64Encoded ? Buffer.from(result.body,'base64') : result.body;
  return new Response(body,{status:result.statusCode,headers:result.headers});
}
