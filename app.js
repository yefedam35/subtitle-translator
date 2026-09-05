
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

    // The video is deliberately rendered with object-fit: fill, so the
    // yellow on-screen OCR box maps directly to camera pixels.
    let sx=(r.left-v.left)*(vw/v.width);
    let sy=(r.top-v.top)*(vh/v.height);
    let sw=r.width*(vw/v.width);
    let sh=r.height*(vh/v.height);

    sx=Math.max(0,Math.min(vw-2,sx));
    sy=Math.max(0,Math.min(vh-2,sy));
    sw=Math.max(2,Math.min(vw-sx,sw));
    sh=Math.max(2,Math.min(vh-sy,sh));

    // Ignore a tiny border around the selection so the yellow frame/handle
    // never becomes OCR input.
    const marginX=sw*0.012, marginY=sh*0.05;
    sx+=marginX; sy+=marginY; sw-=marginX*2; sh-=marginY*2;

    // Upscale the subtitle crop. Camera subtitles are often small, so
    // several lightweight preprocessing variants are tested and the
    // highest-confidence result is selected.
    const factor=Math.min(3.0,Math.max(1.8,1300/Math.max(sw,1)));
    canvas.width=Math.max(2,Math.round(sw*factor));
    canvas.height=Math.max(2,Math.round(sh*factor));
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality="high";
    ctx.drawImage(video,sx,sy,sw,sh,0,0,canvas.width,canvas.height);

    const baseImage=ctx.getImageData(0,0,canvas.width,canvas.height);
    const variants=[];

    // Variant A: contrast + brightness.
    variants.push(makeVariant(baseImage, "normal"));
    // Variant B: grayscale with adaptive-ish threshold.
    variants.push(makeVariant(baseImage, "threshold"));
    // Variant C: grayscale with softer threshold, useful for outlined subtitles.
    variants.push(makeVariant(baseImage, "soft"));

    const results=[];
    for(const variant of variants){
      ctx.putImageData(variant,0,0);
      try{
        const o=await worker.recognize(canvas);
        const t=clean((o.data.text||"").replace(/\s+/g," ").trim());
        const conf=Number(o.data.confidence||0);
        if(t.length>=2) results.push({text:t,conf});
      }catch(_){}
    }

    // Prefer a longer, high-confidence single-line reading and reject
    // obvious OCR noise.
    results.sort((a,b)=>(b.conf + Math.min(b.text.length,40)*0.15) -
                         (a.conf + Math.min(a.text.length,40)*0.15));
    const best=results[0];
    if(best && best.text.length>=4){
      handleOCR(best.text);
    }else{
      // A short result such as "Ei1" is usually OCR noise. Try a stronger
      // online OCR only in this case, so normal scanning remains lightweight.
      try{
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",0.88));
        if(blob){
          const fd=new FormData();
          fd.append("apikey","helloworld");
          fd.append("language","eng");
          fd.append("isOverlayRequired","false");
          fd.append("OCREngine","2");
          fd.append("file",blob,"subtitle.jpg");
          const rr=await fetch("https://api.ocr.space/parse/image",{method:"POST",body:fd});
          if(rr.ok){
            const dd=await rr.json();
            const ot=clean((dd.ParsedResults||[]).map(x=>x.ParsedText||"").join(" ").replace(/\s+/g," ").trim());
            if(ot.length>=3) handleOCR(ot);
          }
        }
      }catch(_){}
    }

    function makeVariant(imageData, mode){
      const copy=new ImageData(
        new Uint8ClampedArray(imageData.data),
        imageData.width,
        imageData.height
      );
      const d=copy.data;
      for(let i=0;i<d.length;i+=4){
        const g=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
        let v;
        if(mode==="threshold"){
          v=g>150?255:0;
        }else if(mode==="soft"){
          v=g>115?Math.min(255,g*1.75):Math.max(0,g*0.65);
        }else{
          v=Math.max(0,Math.min(255,(g-105)*1.8+135));
        }
        d[i]=d[i+1]=d[i+2]=v;
      }
      return copy;
    }
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

function layoutBounds(){
  const appRect=document.querySelector("#app").getBoundingClientRect();
  const cameraRect=video.getBoundingClientRect();
  return {
    app:appRect,
    camera:cameraRect
  };
}

box.addEventListener("pointerdown",e=>{
  e.preventDefault();
  box.setPointerCapture(e.pointerId);
  const r=box.getBoundingClientRect();
  const edge=(r.right-e.clientX<35 && r.bottom-e.clientY<35);
  if(edge) resize={x:e.clientX,y:e.clientY,l:r.left,t:r.top,w:r.width,h:r.height};
  else drag={x:e.clientX,y:e.clientY,l:r.left,t:r.top,w:r.width,h:r.height};
});

box.addEventListener("pointermove",e=>{
  if(!drag&&!resize)return;
  e.preventDefault();

  const {camera}=layoutBounds();

  if(drag){
    const newLeft=drag.l + e.clientX-drag.x;
    const newTop=drag.t + e.clientY-drag.y;

    const left=Math.max(camera.left,Math.min(camera.right-drag.w,newLeft));
    const top=Math.max(camera.top,Math.min(camera.bottom-drag.h,newTop));

    box.style.left=(left-camera.left)+"px";
    box.style.top=(top-camera.top)+"px";
    box.style.width=drag.w+"px";
    box.style.height=drag.h+"px";
  }else{
    const newW=resize.w + e.clientX-resize.x;
    const newH=resize.h + e.clientY-resize.y;

    const maxW=camera.right-resize.l;
    const maxH=camera.bottom-resize.t;

    box.style.width=Math.max(120,Math.min(maxW,newW))+"px";
    box.style.height=Math.max(70,Math.min(maxH,newH))+"px";
  }
});

["pointerup","pointercancel"].forEach(x=>box.addEventListener(x,()=>{
  drag=resize=null;
}));

if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
