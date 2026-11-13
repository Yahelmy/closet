/* Closet Index backend adapter.
   Gives the app its login, saved data, photo storage and AI calls through your own Supabase project.
   You should not need to edit this file. Your project's address and key go in config.js. */
(function(){
"use strict";
var cfg=window.CLOSET_CONFIG||{},sb=null,uid=null,email="",pending=0;
var openGate,gate=new Promise(function(r){openGate=r});

function el(tag,attrs,text){var e=document.createElement(tag);for(var k in attrs||{})e.setAttribute(k,attrs[k]);if(text!=null)e.textContent=text;return e}
function fail(code,message){var e=new Error(message||code);e.code=code;return e}
function chk(r){if(r&&r.error)throw r.error;return r}
function notice(msg){
  var n=document.getElementById("svcNote");
  if(!n){n=el("div",{id:"svcNote","class":"svc",role:"alert"});document.body.appendChild(n);n.addEventListener("click",function(){n.hidden=true})}
  n.textContent=msg+" (tap to dismiss)";n.hidden=false;
}

/* ---------- sign in ---------- */
function showLogin(problem){
  var box=el("div",{id:"login","class":"login"});
  box.innerHTML='<form class="card" id="loginForm"><div class="brand">Closet <i>Index</i></div><p class="lede" id="loginMsg"></p>'+
    '<div class="field"><label for="loginEmail">Email</label><input type="text" inputmode="email" autocomplete="username" autocapitalize="none" id="loginEmail"></div>'+
    '<div class="field"><label for="loginPass">Password</label><input type="password" autocomplete="current-password" id="loginPass"></div>'+
    '<button class="btn primary" type="submit" id="loginGo">Sign in</button></form>';
  document.body.appendChild(box);
  var msg=document.getElementById("loginMsg"),form=document.getElementById("loginForm");
  if(problem){
    msg.textContent=problem==="setup"
      ?"Setup isn't finished. Open config.js, paste in your Supabase project URL and key, and upload the site again."
      :"The app couldn't load its sign-in service. Check your internet connection and reload.";
    form.querySelectorAll(".field,button").forEach(function(x){x.hidden=true});
    return;
  }
  msg.textContent="Sign in to open your wardrobe.";
  form.addEventListener("submit",function(e){
    e.preventDefault();
    var go=document.getElementById("loginGo");go.disabled=true;go.textContent="Signing in…";
    sb.auth.signInWithPassword({email:document.getElementById("loginEmail").value.trim(),password:document.getElementById("loginPass").value})
      .then(function(r){
        if(r.error||!r.data||!r.data.session)throw r.error||new Error("no session");
        uid=r.data.session.user.id;email=r.data.session.user.email||"";box.remove();addAccount();openGate();
      })
      .catch(function(){go.disabled=false;go.textContent="Sign in";msg.textContent="That email and password didn't match. Try again."});
  });
}
function signOut(){sb.auth.signOut().then(function(){location.reload()},function(){location.reload()})}
function addAccount(){
  var row=document.querySelector(".top .row");if(!row)return;
  var b=el("button",{"class":"btn small",type:"button"},"Account");
  b.addEventListener("click",openAccount);row.appendChild(b);
}

/* ---------- account sheet and closet import ---------- */
var KINDS_OK={item:1,outfit:1,wear:1,plan:1,shop:1,taste:1};
function closeAccount(){var o=document.getElementById("acct");if(o)o.remove()}
function card(){
  closeAccount();
  var o=el("div",{"class":"login",id:"acct"}),c=el("div",{"class":"card"});
  o.appendChild(c);document.body.appendChild(o);return c;
}
function button(c,label,primary,fn){
  var b=el("button",{"class":"btn"+(primary?" primary":""),type:"button"},label);
  b.addEventListener("click",fn);c.appendChild(b);return b;
}
function who(c){
  c.appendChild(el("div",{"class":"mono"},"Signed in as"));
  c.appendChild(el("h3",{"class":"acct-who"},email||"this login"));
}
function openAccount(){
  var c=card();who(c);
  c.appendChild(el("p",{"class":"lede"},"Everything you add or import goes into this login's closet only."));
  var file=el("input",{type:"file",accept:".json,application/json",id:"importFile"});file.hidden=true;c.appendChild(file);
  file.addEventListener("change",function(){var f=file.files&&file.files[0];if(f)checkImport(f)});
  button(c,"Import a closet file",false,function(){file.click()});
  button(c,"Sign out",false,signOut);
  button(c,"Close",true,closeAccount);
}
function readText(f){return new Promise(function(res,rej){var r=new FileReader();r.onload=function(){res(String(r.result))};r.onerror=rej;r.readAsText(f)})}
function b64Blob(b){var s=atob(b),n=s.length,u=new Uint8Array(n);for(var i=0;i<n;i++)u[i]=s.charCodeAt(i);return new Blob([u],{type:"image/jpeg"})}
function checkImport(f){
  var c=card();c.appendChild(el("p",{"class":"lede"},"Reading the file…"));
  readText(f).then(function(t){return JSON.parse(t)}).then(function(data){
    if(!data||data.format!=="closet-index-export"||!Array.isArray(data.docs))throw new Error("format");
    var docs=data.docs.filter(function(d){return d&&typeof d.id==="string"&&/^[A-Za-z0-9_-]{1,64}$/.test(d.id)&&KINDS_OK[d.kind]===1});
    var photos=data.photos&&typeof data.photos==="object"?data.photos:{};
    var ids=Object.keys(photos).filter(function(k){return /^[A-Za-z0-9_-]{8,64}$/.test(k)&&typeof photos[k]==="string"});
    var n=function(k){return docs.filter(function(d){return d.kind===k}).length};
    c=card();who(c);
    c.appendChild(el("p",{"class":"lede"},"This file holds "+n("item")+" clothing items, "+n("outfit")+" saved looks and "+ids.length+
      " photos. They will be added to the closet of the login shown above, and to no other login."));
    c.appendChild(el("p",{"class":"lede"},"If that is not the right login, cancel, sign out and sign in as the right person first."));
    button(c,"Import into this login",true,function(){runImport(docs,photos,ids)});
    button(c,"Cancel",false,closeAccount);
  }).catch(function(){
    c=card();c.appendChild(el("p",{"class":"lede"},"That file isn't a Closet Index export, or it couldn't be read."));
    button(c,"Close",true,closeAccount);
  });
}
async function runImport(docs,photos,ids){
  var me=uid,c=card(),line=el("p",{"class":"lede"},"Starting…");who(c);c.appendChild(line);
  c.appendChild(el("p",{"class":"lede"},"Keep this page open until it finishes."));
  var missed=0,saved=0;
  try{
    for(var i=0;i<ids.length;i++){
      line.textContent="Uploading photo "+(i+1)+" of "+ids.length+"…";
      try{chk(await sb.storage.from("photos").upload(me+"/"+ids[i]+".jpg",b64Blob(photos[ids[i]]),{contentType:"image/jpeg",upsert:true}))}catch(e){missed++}
    }
    for(var j=0;j<docs.length;j+=10){
      line.textContent="Saving "+Math.min(j+10,docs.length)+" of "+docs.length+"…";
      var rows=docs.slice(j,j+10).map(function(d){return {user_id:me,id:d.id,data:d,updated_at:new Date().toISOString()}});
      chk(await sb.from("docs").upsert(rows));saved+=rows.length;
    }
  }catch(e){
    c=card();who(c);
    c.appendChild(el("p",{"class":"lede"},"The import stopped after saving "+saved+" of "+docs.length+" entries. Check your connection and run it again; it is safe to repeat."));
    button(c,"Close",true,function(){location.reload()});return;
  }
  c=card();who(c);
  c.appendChild(el("p",{"class":"lede"},"Imported "+docs.length+" entries into this login."+
    (missed?" "+missed+" of "+ids.length+" full-size photos could not be uploaded; those items will show their small photo. Running the import again may fix that.":"")));
  button(c,"Open my wardrobe",true,function(){location.reload()});
}
/* Supabase's newer "publishable" keys belong in the apikey header only. Before sign-in the client library also
   repeats the key as a Bearer token, so drop that copy. A signed-in person's own token is left untouched. */
function keyFetch(input,init){
  try{
    if(/^sb_publishable_/.test(cfg.key)&&init&&init.headers){
      var h=new Headers(init.headers);
      if(h.get("authorization")==="Bearer "+cfg.key){h["delete"]("authorization");init=Object.assign({},init,{headers:h})}
    }
  }catch(e){}
  return fetch(input,init);
}
function start(){
  if(!cfg.url||!cfg.key||/YOUR[-_ ]/i.test(cfg.url+" "+cfg.key)){showLogin("setup");return}
  if(!window.supabase||!window.supabase.createClient){showLogin("offline");return}
  sb=window.supabase.createClient(cfg.url,cfg.key,{global:{fetch:keyFetch}});
  sb.auth.getSession().then(function(r){
    var s=r&&r.data&&r.data.session;
    if(s){uid=s.user.id;email=s.user.email||"";addAccount();openGate()}else showLogin();
  },function(){showLogin()});
}

/* ---------- saved data: one row per item, look, wear, plan… private to the signed-in person ---------- */
function fetchAll(){
  var rows=[],from=0,size=200;
  function page(){
    return sb.from("docs").select("id,data").eq("user_id",uid).order("id").range(from,from+size-1).then(function(r){
      chk(r);rows=rows.concat(r.data||[]);
      if((r.data||[]).length===size){from+=size;return page()}
      return rows;
    });
  }
  return page();
}
function track(p){pending++;var done=function(){pending--};p.then(done,done);return p}
var db={
  collection:function(){
    return {
      doc:function(id){return {
        set:function(d){return track(Promise.resolve(sb.from("docs").upsert({user_id:uid,id:id,data:d,updated_at:new Date().toISOString()})).then(chk))},
        "delete":function(){return track(Promise.resolve(sb.from("docs")["delete"]().eq("user_id",uid).eq("id",id)).then(chk))}
      }},
      onSnapshot:function(cb){
        var last=0,first=true;
        function load(){
          if(pending){setTimeout(load,1500);return}
          fetchAll().then(function(rows){
            last=Date.now();first=false;
            cb({metadata:{fromCache:false},docs:rows.filter(function(r){return r.id!=="trends"}).map(function(r){return {id:r.id,data:function(){return r.data}}})});
          },function(){if(first)setTimeout(load,5000)});
        }
        load();
        document.addEventListener("visibilitychange",function(){if(!document.hidden&&last&&Date.now()-last>60000)load()});
        return function(){};
      }
    };
  },
  doc:function(){
    return {get:function(){
      return Promise.resolve(sb.from("docs").select("data").eq("user_id",uid).eq("id","trends").maybeSingle()).then(function(r){
        var d=(r&&r.data&&r.data.data)||window.CLOSET_TRENDS||null;
        return {exists:!!d,data:function(){return d}};
      },function(){var d=window.CLOSET_TRENDS||null;return {exists:!!d,data:function(){return d}}});
    }};
  }
};
var user={id:function(){return Promise.resolve(uid)}};

/* ---------- photos ---------- */
function photoPath(id){return uid+"/"+id+".jpg"}
var assets={
  upload:function(blob){
    var id=Date.now().toString(36)+Math.random().toString(36).slice(2,10);
    return sb.storage.from("photos").upload(photoPath(id),blob,{contentType:"image/jpeg",upsert:false}).then(function(r){chk(r);return {id:id}});
  },
  "delete":function(id){return sb.storage.from("photos").remove([photoPath(id)]).then(chk)},
  url:function(id){return sb.storage.from("photos").createSignedUrl(photoPath(id),3600).then(function(r){chk(r);return r.data&&r.data.signedUrl})}
};

/* ---------- AI: every call goes through your "ai" Edge Function, which holds the API key ---------- */
function toB64(blob){return new Promise(function(res,rej){var f=new FileReader();f.onload=function(){res(String(f.result).split(",")[1]||"")};f.onerror=rej;f.readAsDataURL(blob)})}
async function callAI(body,signal){
  var s=(await sb.auth.getSession()).data.session;
  if(!s)throw fail("session_expired");
  var res;
  try{
    res=await fetch(cfg.url.replace(/\/+$/,"")+"/functions/v1/"+(cfg.functionName||"ai"),{method:"POST",signal:signal,
      headers:{"content-type":"application/json",authorization:"Bearer "+s.access_token,apikey:cfg.key},body:JSON.stringify(body)});
  }catch(e){throw fail(e&&e.name==="AbortError"?"cancelled":"upstream_error")}
  var out=null;try{out=await res.json()}catch(e){}
  if(!res.ok){
    if(res.status===401)throw fail("session_expired");
    if(out&&out.error==="rate_limited")throw fail("rate_limited");
    notice("AI service problem: "+((out&&out.message)||("error "+res.status)));
    throw fail("upstream_error");
  }
  return String((out&&out.text)||"");
}
function parseJSON(t){
  t=String(t).replace(/```(?:json)?/gi,"").trim();
  var a=t.search(/[\[{]/);if(a<0)throw fail("invalid_json");
  var b=t.lastIndexOf(t[a]==="{"?"}":"]");if(b<a)throw fail("invalid_json");
  try{return JSON.parse(t.slice(a,b+1))}catch(e){throw fail("invalid_json")}
}
function run(input,opts){
  opts=opts||{};
  var prompt=typeof input==="string"?input:(input||[]).map(function(m){return m.content}).join("\n\n");
  return Promise.all((opts.images||[]).map(toB64)).then(function(imgs){return callAI({prompt:prompt,images:imgs},opts.signal)});
}
var sample=function(input,opts){return run(input,opts).then(function(t){return {text:t,truncated:false}})};
sample.json=function(input,opts){return run(input,opts).then(parseJSON)};
sample.limits=function(){return Promise.resolve({images:{maxCount:4}})};
/* Searches the web for this season's trends and saves a fresh brief for the signed-in person. */
sample.trends=function(){
  var today=new Date().toISOString().slice(0,10);
  return callAI({mode:"trends",prompt:"Today is "+today+". Search the web for the fashion trends that are current right now and for the coming season, "+
    "covering both menswear and womenswear. Include Pinterest's trend reports and major fashion publications. Then reply with ONLY a JSON object in this shape: "+
    '{"season": a short label such as "Spring/summer 2027", "items": 14 to 22 entries of {"name": short trend name, add "(menswear)" where it applies only to men, '+
    '"note": one plain sentence in your own words describing the garments, shapes or colours involved}, "colors": up to 8 entries of {"name": a colour, '+
    '"note": "with ..." naming the colours it is being paired with}, "sources": up to 8 entries of {"title", "url"} for the pages you relied on}. '+
    "Paraphrase everything; do not quote the sources. No text outside the JSON."})
  .then(parseJSON).then(function(t){
    var list=function(a,n){return (Array.isArray(a)?a:[]).filter(function(x){return x&&x.name&&x.note}).slice(0,n).map(function(x){
      return {name:String(x.name).slice(0,70),note:String(x.note).slice(0,260)}})};
    var brief={kind:"trends",id:"trends",updated:today,season:String((t&&t.season)||"Current trends").slice(0,120),items:list(t&&t.items,30),colors:list(t&&t.colors,10),
      sources:(Array.isArray(t&&t.sources)?t.sources:[]).filter(function(s){return s&&/^https:\/\//.test(s.url||"")}).slice(0,8).map(function(s){
        return {title:String(s.title||"Source").slice(0,100),url:String(s.url).slice(0,400)}})};
    if(!brief.items.length)throw fail("invalid_json");
    return Promise.resolve(sb.from("docs").upsert({user_id:uid,id:"trends",data:brief,updated_at:new Date().toISOString()})).then(function(){return brief},function(){return brief});
  });
};

window.claude={use:function(name){return gate.then(function(){return ({db:db,user:user,sample:sample,assets:assets})[name]||null})}};
start();
})();
