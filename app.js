
const video=document.querySelector("#camera"), canvas=document.querySelector("#frame");
const ctx=canvas.getContext("2d",{willReadFrequently:true});
const box=document.querySelector("#ocrBox"), statusEl=document.querySelector("#status");
const enEl=document.querySelector("#en"), trEl=document.querySelector("#tr");
const startBtn=document.querySelector("#start"), speakBtn=document.querySelector("#speak"), muteBtn=document.querySelector("#mute");
const settingsBtn=document.querySelector("#settings"), dialog=document.querySelector("#settingsDialog");
let stream=null, worker=null, busy=false, lastText="", stableText="", stableCount=0, timer=null;
let interval=1600, rate=.85;

async function startCamera(){
  if(!navigator.mediaDevices?.getUserMedia){status("Bu tarayıcı kamera erişimini desteklemiyor.");return}
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment",width:{ideal:1920},height:{ideal:1080}},audio:false});
    video.srcObject=stream; await video.play();
    status("OCR motoru hazırlanıyor…");
    worker=await Tesseract.createWorker("eng",1,{logger:m=>{if(m.status) status(`OCR: ${m.status} ${Math.round((m.progress||0)*100)}%`) }});
    status("Hazır — altyazı kutusunu altyazının üzerine getir.");
    schedule();
  }catch(e){status("Kamera açılamadı: "+e.message)}
}
function schedule(){clearTimeout(timer);timer=setTimeout(async()=>{await scan();schedule()},interval)}
async function scan(){
  if(busy||!worker||video.readyState<2)return;
  busy=true;
  try{
    const r=box.getBoundingClientRect(), v=video.getBoundingClientRect();
    const scaleX=video.videoWidth/v.width, scaleY=video.videoHeight/v.height;
    let sx=(r.left-v.left)*scaleX, sy=(r.top-v.top)*scaleY, sw=r.width*scaleX, sh=r.height*scaleY;
    sx=Math.max(0,sx);sy=Math.max(0,sy);sw=Math.min(video.videoWidth-sx,sw);sh=Math.min(video.videoHeight-sy,sh);
    canvas.width=Math.max(2,Math.round(sw));canvas.height=Math.max(2,Math.round(sh));
    ctx.drawImage(video,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
    const out=await worker.recognize(canvas);
    let text=(out.data.text||"").replace(/\s+/g," ").trim();
    text=clean(text);
    if(text.length>=2) handleOCR(text);
  }catch(e){console.warn(e)}
  busy=false;
}
function clean(t){return t.replace(/[|{}[\]<>]/g," ").replace(/\s+/g," ").trim()}
function norm(t){return t.toLowerCase().replace(/[.,!?;:]/g,"").replace(/\s+/g," ").trim()}
function sim(a,b){
  a=norm(a);b=norm(b); if(a===b)return 1;if(!a||!b)return 0;
  const A=[...a],B=[...b];let p=Array(B.length+1).fill(0).map((_,i)=>i);
  for(let i=1;i<=A.length;i++){let c=[i];for(let j=1;j<=B.length;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(A[i-1]===B[j-1]?0:1));p=c}
  return 1-p[B.length]/Math.max(A.length,B.length)
}
async function handleOCR(text){
  if(stableText && sim(text,stableText)>=.82){stableCount++}else{stableText=text;stableCount=1}
  if(stableCount<2)return;
  if(lastText && sim(text,lastText)>=.9)return;
  lastText=text; enEl.textContent=text; status("Çevriliyor…");
  const tr=await translate(text);
  trEl.textContent=tr; status("Hazır");
}
async function translate(text){
  const q=text.slice(0,480);
  try{
    const u="https://api.mymemory.translated.net/get?q="+encodeURIComponent(q)+"&langpair=en|tr";
    const r=await fetch(u); if(!r.ok)throw Error("HTTP "+r.status);
    const d=await r.json();
    return d.responseData?.translatedText || d.matches?.[0]?.translation || text;
  }catch(e){status("Çeviri bağlantısı başarısız");return text}
}
function status(t){statusEl.textContent=t}
function speak(){
  const t=trEl.textContent.trim(); if(!t)return;
  if(!("speechSynthesis" in window)){status("Bu cihazda seslendirme desteklenmiyor.");return}
  speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(t);
  u.lang="tr-TR";u.rate=rate;speechSynthesis.speak(u);
}
startBtn.onclick=startCamera;speakBtn.onclick=speak;muteBtn.onclick=()=>speechSynthesis?.cancel();
settingsBtn.onclick=()=>dialog.showModal();
document.querySelector("#interval").oninput=e=>{interval=+e.target.value};
document.querySelector("#rate").oninput=e=>{rate=+e.target.value};

let drag=null,resize=null;
box.addEventListener("pointerdown",e=>{
  e.preventDefault();box.setPointerCapture(e.pointerId);
  const r=box.getBoundingClientRect();
  const edge=(r.right-e.clientX<35&&r.bottom-e.clientY<35);
  if(edge)resize={x:e.clientX,y:e.clientY,w:r.width,h:r.height}; else drag={x:e.clientX,y:e.clientY,l:r.left,t:r.top};
});
box.addEventListener("pointermove",e=>{
  if(!drag&&!resize)return;
  const app=document.querySelector("#app").getBoundingClientRect();
  if(drag){
    const r=box.getBoundingClientRect();
    box.style.left=Math.max(0,Math.min(app.width-r.width,drag.l+e.clientX-drag.x))+"px";
    box.style.top=Math.max(0,Math.min(app.height-r.height,drag.t+e.clientY-drag.y))+"px";
    box.style.width=r.width+"px";box.style.height=r.height+"px";
  }else{
    const r=box.getBoundingClientRect();
    box.style.width=Math.max(120,Math.min(app.width-r.left,resize.w+e.clientX-resize.x))+"px";
    box.style.height=Math.max(70,Math.min(app.height-r.top,resize.h+e.clientY-resize.y))+"px";
  }
});
["pointerup","pointercancel"].forEach(x=>box.addEventListener(x,()=>{drag=resize=null}));
if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
