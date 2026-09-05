const video=document.querySelector("#camera"), canvas=document.querySelector("#frame");
const ctx=canvas.getContext("2d",{willReadFrequently:true});
const box=document.querySelector("#ocrBox"), statusEl=document.querySelector("#status");
const enEl=document.querySelector("#en"), trEl=document.querySelector("#tr");
const startBtn=document.querySelector("#start"), speakBtn=document.querySelector("#speak"), muteBtn=document.querySelector("#mute");
const settingsBtn=document.querySelector("#settings"), dialog=document.querySelector("#settingsDialog");
let stream=null,busy=false,lastText="",stableText="",stableCount=0,timer=null;
let interval=1700,rate=.9;
let ocrApiKey=localStorage.getItem("ocrApiKey")||"helloworld";

function status(t){statusEl.textContent=t}

async function startCamera(){
  if(stream)return;
  if(!window.isSecureContext){status("Kamera için HTTPS gerekiyor.");return}
  if(!navigator.mediaDevices?.getUserMedia){status("iPhone Safari kamera erişimini desteklemiyor.");return}

  status("Kamera izni isteniyor…");
  try{
    stream=await navigator.mediaDevices.getUserMedia({
      audio:false,
      video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}}
    });
    video.srcObject=stream;
    await new Promise((resolve,reject)=>{
      const to=setTimeout(()=>reject(new Error("Kamera zaman aşımı.")),8000);
      video.onloadedmetadata=()=>{clearTimeout(to);resolve()};
    });
    await video.play();
    if(!video.videoWidth||!video.videoHeight)throw new Error("Kamera görüntüsü alınamadı.");

    startBtn.textContent="Kamera Açık";
    startBtn.disabled=true;
    status("Hazır — sarı kutuyu altyazının tamamına getir.");
    schedule();
  }catch(e){
    console.error(e);
    if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
    const n=e?.name||"";
    const msg=n==="NotAllowedError"?"Kamera izni verilmedi. Safari kamera iznini aç."
      :n==="NotReadableError"?"Kamera başka bir uygulamada kullanılıyor."
      :e?.message||"Kamera açılamadı.";
    status(msg);
    startBtn.disabled=false;
    startBtn.textContent="Kamerayı Tekrar Aç";
  }
}

function schedule(){
  clearTimeout(timer);
  timer=setTimeout(async()=>{await scanOnlineOCR();schedule()},interval);
}

function getCrop(){
  const r=box.getBoundingClientRect(),v=video.getBoundingClientRect();
  const vw=video.videoWidth,vh=video.videoHeight;
  let sx=(r.left-v.left)*(vw/v.width);
  let sy=(r.top-v.top)*(vh/v.height);
  let sw=r.width*(vw/v.width),sh=r.height*(vh/v.height);

  const mx=sw*.012,my=sh*.06;
  sx+=mx;sy+=my;sw-=mx*2;sh-=my*2;
  sx=Math.max(0,Math.min(vw-2,sx));sy=Math.max(0,Math.min(vh-2,sy));
  sw=Math.max(2,Math.min(vw-sx,sw));sh=Math.max(2,Math.min(vh-sy,sh));

  const factor=Math.min(2.4,Math.max(1.5,1200/Math.max(sw,1)));
  canvas.width=Math.round(sw*factor);
  canvas.height=Math.round(sh*factor);
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality="high";
  ctx.filter="contrast(1.28) brightness(1.05)";
  ctx.drawImage(video,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
  ctx.filter="none";
}

async function scanOnlineOCR(){
  if(busy||!stream||video.readyState<2||!video.videoWidth)return;
  busy=true;
  try{
    getCrop();
    status("OCR okunuyor…");

    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.86));
    if(!blob)throw new Error("Görüntü hazırlanamadı.");

    const fd=new FormData();
    fd.append("apikey",ocrApiKey||"helloworld");
    fd.append("language","eng");
    fd.append("isOverlayRequired","false");
    fd.append("OCREngine","3");
    fd.append("scale","true");
    fd.append("detectOrientation","false");
    fd.append("file",blob,"subtitle.jpg");

    const response=await fetch("https://api.ocr.space/parse/image",{method:"POST",body:fd});
    if(!response.ok)throw new Error("OCR HTTP "+response.status);

    const data=await response.json();
    if(data.IsErroredOnProcessing){
      throw new Error((data.ErrorMessage||["OCR başarısız"])[0]);
    }

    const text=clean((data.ParsedResults||[])
      .map(x=>x.ParsedText||"").join(" ")
      .replace(/\s+/g," ").trim());

    if(text.length>=3){
      handleOCR(text);
    }else{
      status("Altyazı bulunamadı");
    }
  }catch(e){
    console.warn("Online OCR:",e);
    status("OCR bağlantısı başarısız — ayarlardan API anahtarını kontrol et.");
  }finally{
    busy=false;
  }
}

function clean(t){
  return t.replace(/[|{}[\]<>]/g," ").replace(/\s+/g," ").trim();
}
function norm(t){
  return t.toLowerCase().replace(/[.,!?;:]/g,"").replace(/\s+/g," ").trim();
}
function sim(a,b){
  a=norm(a);b=norm(b);
  if(a===b)return 1;if(!a||!b)return 0;
  const A=[...a],B=[...b];let p=Array(B.length+1).fill(0).map((_,i)=>i);
  for(let i=1;i<=A.length;i++){
    let c=[i];
    for(let j=1;j<=B.length;j++){
      c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(A[i-1]===B[j-1]?0:1));
    }
    p=c;
  }
  return 1-p[B.length]/Math.max(A.length,B.length);
}

async function handleOCR(text){
  if(stableText&&sim(text,stableText)>=.82)stableCount++;
  else{stableText=text;stableCount=1}
  if(stableCount<2)return;
  if(lastText&&sim(text,lastText)>=.9)return;

  lastText=text;
  enEl.textContent=text;
  status("Çevriliyor…");
  const tr=await translate(text);
  trEl.textContent=tr;
  status("Hazır");
}

async function translate(text){
  const q=text.slice(0,480);
  try{
    const r=await fetch("https://api.mymemory.translated.net/get?q="+encodeURIComponent(q)+"&langpair=en|tr");
    if(!r.ok)throw Error("HTTP "+r.status);
    const d=await r.json();
    return d.responseData?.translatedText||d.matches?.[0]?.translation||text;
  }catch(e){
    status("Çeviri bağlantısı başarısız");
    return text;
  }
}

function speak(){
  const t=trEl.textContent.trim();
  if(!t)return;
  if(!("speechSynthesis"in window)){status("Seslendirme desteklenmiyor.");return}
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(t);
  u.lang="tr-TR";u.rate=rate;
  speechSynthesis.speak(u);
}

startBtn.onclick=startCamera;
speakBtn.onclick=speak;
muteBtn.onclick=()=>speechSynthesis?.cancel();
settingsBtn.onclick=()=>{
  document.querySelector("#ocrKey").value=ocrApiKey;
  document.querySelector("#interval").value=interval;
  document.querySelector("#rate").value=rate;
  dialog.showModal();
};
document.querySelector("#saveSettings").onclick=()=>{
  ocrApiKey=document.querySelector("#ocrKey").value.trim()||"helloworld";
  localStorage.setItem("ocrApiKey",ocrApiKey);
  interval=+document.querySelector("#interval").value;
  rate=+document.querySelector("#rate").value;
  dialog.close();
};

let drag=null,resize=null;
function layoutBounds(){return {camera:video.getBoundingClientRect()}}
box.addEventListener("pointerdown",e=>{
  e.preventDefault();box.setPointerCapture(e.pointerId);
  const r=box.getBoundingClientRect();
  const edge=r.right-e.clientX<35&&r.bottom-e.clientY<35;
  if(edge)resize={x:e.clientX,y:e.clientY,l:r.left,t:r.top,w:r.width,h:r.height};
  else drag={x:e.clientX,y:e.clientY,l:r.left,t:r.top,w:r.width,h:r.height};
});
box.addEventListener("pointermove",e=>{
  if(!drag&&!resize)return;e.preventDefault();
  const c=layoutBounds().camera;
  if(drag){
    const left=Math.max(c.left,Math.min(c.right-drag.w,drag.l+e.clientX-drag.x));
    const top=Math.max(c.top,Math.min(c.bottom-drag.h,drag.t+e.clientY-drag.y));
    box.style.left=(left-c.left)+"px";box.style.top=(top-c.top)+"px";
    box.style.width=drag.w+"px";box.style.height=drag.h+"px";
  }else{
    const maxW=c.right-resize.l,maxH=c.bottom-resize.t;
    box.style.width=Math.max(120,Math.min(maxW,resize.w+e.clientX-resize.x))+"px";
    box.style.height=Math.max(70,Math.min(maxH,resize.h+e.clientY-resize.y))+"px";
  }
});
["pointerup","pointercancel"].forEach(x=>box.addEventListener(x,()=>{drag=resize=null}));
