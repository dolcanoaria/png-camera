"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $("cutout-canvas"), ctx = canvas.getContext("2d", {willReadFrequently:true});
  const source = document.createElement("canvas"), sctx = source.getContext("2d", {willReadFrequently:true});
  const mask = document.createElement("canvas"), mctx = mask.getContext("2d", {willReadFrequently:true});
  const state = { loaded:false, mode:"erase", down:false, last:null, undo:[], sourceName:"character" };
  const message = (s) => { $("cutout-status").textContent=s; };
  const limit = 1600;
  const setSize = (w,h) => { for (const c of [canvas,source,mask]) { c.width=w;c.height=h; } };
  function render() {
    if (!state.loaded) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(source,0,0);
    ctx.globalCompositeOperation="destination-in";
    ctx.drawImage(mask,0,0);
    ctx.globalCompositeOperation="source-over";
  }
  function snapshot() {
    if (!state.loaded) return;
    state.undo.push(mctx.getImageData(0,0,mask.width,mask.height));
    if (state.undo.length>5) state.undo.shift();
    $("cutout-undo").disabled=false;
  }
  function position(ev) {
    const r=canvas.getBoundingClientRect();
    return {x:Math.max(0,Math.min(canvas.width-1,(ev.clientX-r.left)*canvas.width/r.width)), y:Math.max(0,Math.min(canvas.height-1,(ev.clientY-r.top)*canvas.height/r.height))};
  }
  function brush(a,b) {
    const width=Number($("cutout-brush-size").value)*canvas.width/Math.max(canvas.getBoundingClientRect().width,1);
    mctx.save();mctx.globalCompositeOperation=state.mode==="erase"?"destination-out":"source-over";
    mctx.strokeStyle="white";mctx.fillStyle="white";mctx.lineCap="round";mctx.lineJoin="round";mctx.lineWidth=width;
    mctx.beginPath();mctx.moveTo(a.x,a.y);mctx.lineTo(b.x,b.y);mctx.stroke();
    mctx.beginPath();mctx.arc(b.x,b.y,width/2,0,2*Math.PI);mctx.fill();mctx.restore();render();
  }
  // Color-connected background removal. Does not claim to recognize people or characters.
  function removeConnectedBackground(p) {
    const w=canvas.width,h=canvas.height;
    const src=sctx.getImageData(0,0,w,h).data;
    const original=mctx.getImageData(0,0,w,h);
    const pixels=original.data;
    const seed=(Math.floor(p.y)*w+Math.floor(p.x))*4;
    const r=src[seed],g=src[seed+1],b=src[seed+2];
    const tolerance=Number($("cutout-tolerance").value);
    const threshold=tolerance*tolerance*3;
    const seen=new Uint8Array(w*h);
    const queue=new Int32Array(w*h);
    let head=0,tail=0;
    const initial=Math.floor(p.y)*w+Math.floor(p.x);
    queue[tail++]=initial;seen[initial]=1;
    const accept=(i)=>{
      if(seen[i]) return;
      seen[i]=1;
      const k=i*4;
      const dr=src[k]-r,dg=src[k+1]-g,db=src[k+2]-b;
      if(dr*dr+dg*dg+db*db<=threshold) queue[tail++]=i;
    };
    while(head<tail) {
      const i=queue[head++], k=i*4;
      pixels[k+3]=0;
      const x=i%w;
      if(x>0)accept(i-1);if(x<w-1)accept(i+1);
      if(i>=w)accept(i-w);if(i<w*(h-1))accept(i+w);
    }
    mctx.putImageData(original,0,0);render();
    message(`${tail.toLocaleString()}画素のつながった背景を透明化しました。必要に応じてブラシで修正してください。`);
  }
  canvas.addEventListener("pointerdown",ev=>{
    if(!state.loaded)return;
    ev.preventDefault();canvas.setPointerCapture(ev.pointerId);
    const p=position(ev);snapshot();
    if(state.mode==="auto") { removeConnectedBackground(p);return; }
    state.down=true;state.last=p;brush(p,p);
  });
  canvas.addEventListener("pointermove",ev=>{
    if(!state.down)return;
    ev.preventDefault();const p=position(ev);brush(state.last,p);state.last=p;
  });
  const stop=()=>{state.down=false;state.last=null;};
  canvas.addEventListener("pointerup",stop);canvas.addEventListener("pointercancel",stop);
  $("cutout-file").addEventListener("change",async(ev)=>{
    const file=ev.target.files[0];ev.target.value="";if(!file)return;
    try {
      const bitmap=await createImageBitmap(file,{imageOrientation:"from-image"});
      const ratio=Math.min(1,limit/Math.max(bitmap.width,bitmap.height));
      setSize(Math.max(1,Math.round(bitmap.width*ratio)),Math.max(1,Math.round(bitmap.height*ratio)));
      sctx.clearRect(0,0,source.width,source.height);sctx.drawImage(bitmap,0,0,source.width,source.height);bitmap.close();
      mctx.globalCompositeOperation="source-over";mctx.fillStyle="white";mctx.fillRect(0,0,mask.width,mask.height);
      state.loaded=true;state.undo=[];state.sourceName=file.name.replace(/\.[^.]+$/,"");
      $("cutout-undo").disabled=true;$("cutout-save").disabled=false;$("cutout-register").disabled=false;
      render();message("写真を読み込みました。『背景をタップ』で背景色のつながった領域を消すか、消しゴムで不要部分をなぞってください。");
    } catch {message("画像を開けませんでした。JPEGまたはPNGを選んでください。");}
  });
  $("cutout-mode").addEventListener("change",ev=>{state.mode=ev.target.value;});
  $("cutout-undo").addEventListener("click",()=>{
    const previous=state.undo.pop();if(!previous)return;mctx.putImageData(previous,0,0);render();$("cutout-undo").disabled=!state.undo.length;
  });
  $("cutout-reset").addEventListener("click",()=>{
    if(!state.loaded)return;snapshot();mctx.clearRect(0,0,mask.width,mask.height);mctx.fillStyle="white";mctx.fillRect(0,0,mask.width,mask.height);render();message("切り抜きをリセットしました。");
  });
  async function pngBlob() {return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("PNG生成失敗")),"image/png"));}
  function downloadBlob(blob,name) {
    const url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  $("cutout-save").addEventListener("click",async()=>{
    try {downloadBlob(await pngBlob(),`${state.sourceName}-cutout.png`);message("透過PNGを保存しました。端末のダウンロードを確認してください。");}
    catch {message("保存できませんでした。容量を確認してください。");}
  });
  $("cutout-register").addEventListener("click",async()=>{
    const work=$("cutout-work").value.trim(),name=$("cutout-name").value.trim()||`${state.sourceName}-cutout.png`;
    if(!work){message("登録する作品名を入力してください。");$("cutout-work").focus();return;}
    try {
      const blob=await pngBlob(), db=await openLibrary();
      const filename=/\.png$/i.test(name)?name:`${name}.png`;
      await storePng(db,[work,filename],blob);
      await refreshLibrary();
      message(`「${work} / ${filename}」を作品別ライブラリに登録しました。`);
    } catch {message("登録できませんでした。Chromeのサイトデータと空き容量を確認してください。");}
  });
})();
