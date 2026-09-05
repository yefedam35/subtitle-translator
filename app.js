
const video=document.querySelector("#camera"), canvas=document.querySelector("#frame");
const ctx=canvas.getContext("2d",{willReadFrequently:true});
const box=document.querySelector("#ocrBox"), statusEl=document.querySelector("#status");
const enEl=document.querySelector("#en"), trEl=document.querySelector("#tr");
const startBtn=document.querySelector("#start"), speakBtn=document.querySelector("#speak"), muteBtn=document.querySelector("#mute");
const settingsBtn=document.querySelector("#settings"), dialog=document.querySelector("#settingsDialog");
let stream=null, worker=null, busy=false, lastText="", stableText="", stableCount=0, timer=null, lastOCRAt=0;
let interval=750, rate=.95;

async function startCamera(){
  if(stream) return;

  if(!window.isSecureContext){
    status("Kamera için HTTPS gerekiyor. GitHub Pages adresini kullan.");
    return;
  }

  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    status("Bu tarayıcı kamera erişimini desteklemiyor. iPhone'da Safari kullan.");
    return;
  }

  status("Kamera izni isteniyor…");

  try{
    const constraints = {
      audio:false,
      video:{
        facingMode:{ideal:"environment"},
        width:{ideal:1280},
        height:{ideal:720}
      }
    };

    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;

    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error("Kamera görüntüsü zaman aşımına uğradı.")),8000);
      video.onloadedmetadata=()=>{
        clearTimeout(timeout);
        resolve();
      };
    });

    await video.play();

    if(!video.videoWidth || !video.videoHeight){
      throw new Error("Kamera görüntüsü alınamadı.");
    }

    startBtn.textContent="Kamera Açık";
    startBtn.disabled=true;
    status("OCR motoru hazırlanıyor…");

    worker=await Tesseract.createWorker("eng",1,{
      logger:m=>{
        if(m.status){
          status(`OCR: ${m.status} ${Math.round((m.progress||0)*100)}%`);
        }
      }
    });

    try{
      await worker.setParameters({
        tessedit_pageseg_mode:"7",
        preserve_interword_spaces:"1",
        user_defined_dpi:"300"
      });
    }catch(_){}
    status("Hazır — sarı kutuyu altyazının üzerine getir.");
    schedule();

  }catch(e){
    console.error("Camera error:",e);
    if(stream){
      stream.getTracks().forEach(t=>t.stop());
      stream=null;
    }

    let msg=e?.name || "";
    if(msg==="NotAllowedError"){
      msg="Kamera izni verilmedi. Safari → Ayarlar → Kamera iznini kontrol et.";
    }else if(msg==="NotFoundError"){
      msg="Kamera bulunamadı.";
    }else if(msg==="NotReadableError"){
      msg="Kamera başka bir uygulama tarafından kullanılıyor.";
    }else if(msg==="SecurityError"){
      msg="Kamera erişimi güvenlik nedeniyle engellendi. HTTPS kullan.";
    }else{
      msg=e?.message || "Kamera açılamadı.";
    }

    status(msg);
    startBtn.disabled=false;
    startBtn.textContent="Kamerayı Tekrar Aç";
  }
}

function schedule(){clearTimeout(timer);timer=setTimeout(async()=>{await scan();schedule()},interval)}
async function scan(){
  if(busy||!worker||video.readyState<2||!video.videoWidth||!video.videoHeight)return;
  busy=true;
  try{
    const r=box.getBoundingClientRect(), v=video.getBoundingClientRect();
    const vw=video.videoWidth, vh=video.videoHeight;
    const coverScale=Math.max(v.width/vw, v.height/vh);
    const renderedW=vw*coverScale, renderedH=vh*coverScale;
    const cropX=(renderedW-v.width)/2, cropY=(renderedH-v.height)/2;

    // Map the on-screen yellow box to the actual camera pixels.
    let sx=((r.left-v.left)+cropX)/coverScale;
    let sy=((r.top-v.top)+cropY)/coverScale;
    let sw=r.width/coverScale, sh=r.height/coverScale;
    sx=Math.max(0,Math.min(vw-2,sx)); sy=Math.max(0,Math.min(vh-2,sy));
    sw=Math.max(2,Math.min(vw-sx,sw)); sh=Math.max(2,Math.min(vh-sy,sh));

    // Upscale the subtitle area for better recognition.
    const factor=Math.min(2.4,Math.max(1.5,1100/Math.max(sw,1)));
    canvas.width=Math.max(2,Math.round(sw*factor));
    canvas.height=Math.max(2,Math.round(sh*factor));
    ctx.filter="contrast(1.35) brightness(1.08)";
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality="high";
    ctx.drawImage(video,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
    ctx.filter="none";
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
  const n=norm(text);
  if(!n)return;

  // A high-confidence, readable line is translated after the first stable read.
  // If OCR is still changing, require a second similar frame.
  const current = stableText ? sim(text,stableText) : 0;
  if(current>=0.82) stableCount++; else { stableText=text; stableCount=1; }

  const fastAccept = text.length >= 4;
  if(!fastAccept && stableCount<2)return;
  if(lastText && sim(text,lastText)>=0.90)return;

  lastText=text;
  enEl.textContent=text;
  status("Çevriliyor…");

  const tr=await translate(text);
  if(!tr || tr===text){
    status("Çeviri başarısız");
    return;
  }
  trEl.textContent=tr;
  status("Hazır");
}
async function translate(text){
  const q=text.slice(0,480);
  // Google Translate's public web endpoint is usually faster for short subtitle lines.
  try{
    const u="https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&q="+encodeURIComponent(q);
    const r=await fetch(u,{cache:"no-store"});
    if(r.ok){
      const d=await r.json();
      const out=(d[0]||[]).map(x=>x[0]||"").join("").trim();
      if(out)return out;
    }
  }catch(e){}

  try{
    const u="https://api.mymemory.translated.net/get?q="+encodeURIComponent(q)+"&langpair=en|tr";
    const r=await fetch(u,{cache:"no-store"}); if(!r.ok)throw Error("HTTP "+r.status);
    const d=await r.json();
    return d.responseData?.translatedText || d.matches?.[0]?.translation || "";
  }catch(e){
    return "";
  }
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
