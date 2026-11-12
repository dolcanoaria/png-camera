"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $("cutout-canvas"), ctx = canvas.getContext("2d", {willReadFrequently:true});
  const source = document.createElement("canvas"), sctx = source.getContext("2d", {willReadFrequently:true});
  const mask = document.createElement("canvas"), mctx = mask.getContext("2d", {willReadFrequently:true});
  const state = { loaded:false, mode:"erase", down:false, last:null, undo:[], sourceName:"character", selecting:false, selection:null, anchor:null, aiBusy:false, lasso:false, lassoPoints:[] };
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
    if (state.lassoPoints.length) {
      ctx.save();ctx.strokeStyle="#ffb02e";ctx.lineWidth=Math.max(2,canvas.width/450);ctx.setLineDash([9,5]);
      ctx.beginPath();ctx.moveTo(state.lassoPoints[0].x,state.lassoPoints[0].y);
      for(const p of state.lassoPoints.slice(1))ctx.lineTo(p.x,p.y);
      if(!state.down && state.lassoPoints.length>2)ctx.closePath();
      ctx.stroke();ctx.restore();
    }
    if (state.selection) {
      const b=state.selection;
      ctx.save();ctx.strokeStyle="#00d9ff";ctx.lineWidth=Math.max(2,canvas.width/500);ctx.setLineDash([12,7]);
      ctx.strokeRect(b.x,b.y,b.w,b.h);ctx.restore();
    }
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
    const p=position(ev);
    if(state.lasso) {state.down=true;state.lassoPoints=[p];render();return;}
    if(state.selecting) {state.anchor=p;state.selection={x:p.x,y:p.y,w:0,h:0};render();return;}
    snapshot();
    if(state.mode==="auto") { removeConnectedBackground(p);return; }
    state.down=true;state.last=p;brush(p,p);
  });
  canvas.addEventListener("pointermove",ev=>{
    if(state.lasso && state.down){
      ev.preventDefault();const p=position(ev),last=state.lassoPoints[state.lassoPoints.length-1];
      if(Math.hypot(p.x-last.x,p.y-last.y)>Math.max(2,canvas.width/400)){state.lassoPoints.push(p);render();}
      return;
    }
    if(state.selecting && state.anchor){
      ev.preventDefault();const p=position(ev),a=state.anchor;
      state.selection={x:Math.min(a.x,p.x),y:Math.min(a.y,p.y),w:Math.abs(a.x-p.x),h:Math.abs(a.y-p.y)};
      render();return;
    }
    if(!state.down)return;
    ev.preventDefault();const p=position(ev);brush(state.last,p);state.last=p;
  });
  function eraseLasso() {
    const points=state.lassoPoints;
    state.down=false;state.lasso=false;
    if(points.length<3){state.lassoPoints=[];render();message("囲みが短すぎます。もう一度、大きく囲んでください。");return;}
    // Erase only pixels inside the closed freehand polygon, leaving all other pixels intact.
    snapshot();
    mctx.save();mctx.globalCompositeOperation="destination-out";
    mctx.fillStyle="rgba(0,0,0,1)";
    mctx.beginPath();mctx.moveTo(points[0].x,points[0].y);
    for(let i=1;i<points.length;i++)mctx.lineTo(points[i].x,points[i].y);
    mctx.closePath();mctx.fill();mctx.restore();
    state.lassoPoints=[];render();
    message("囲んだ部分を透明にしました。間違えた場合は『元に戻す』を押してください。");
  }
  const stop=()=>{
    if(state.lasso){eraseLasso();return;}
    if(state.selecting && state.anchor){state.anchor=null;state.selecting=false;
      $("cutout-ai-run").disabled=!(state.selection && state.selection.w>10 && state.selection.h>10);
      message("囲む範囲を指定しました。『AIで切り抜く』を押してください。");render();
    }
    state.down=false;state.last=null;
  };
  canvas.addEventListener("pointerup",stop);canvas.addEventListener("pointercancel",stop);
  $("cutout-file").addEventListener("change",async(ev)=>{
    const file=ev.target.files[0];ev.target.value="";if(!file)return;
    try {
      const bitmap=await createImageBitmap(file,{imageOrientation:"from-image"});
      const ratio=Math.min(1,limit/Math.max(bitmap.width,bitmap.height));
      setSize(Math.max(1,Math.round(bitmap.width*ratio)),Math.max(1,Math.round(bitmap.height*ratio)));
      sctx.clearRect(0,0,source.width,source.height);sctx.drawImage(bitmap,0,0,source.width,source.height);bitmap.close();
      mctx.globalCompositeOperation="source-over";mctx.fillStyle="white";mctx.fillRect(0,0,mask.width,mask.height);
      state.loaded=true;state.undo=[];state.selection=null;state.selecting=false;state.lasso=false;state.lassoPoints=[];$("cutout-ai-select").disabled=false;$("cutout-ai-run").disabled=true;state.sourceName=file.name.replace(/\.[^.]+$/,"");
      $("cutout-undo").disabled=true;$("cutout-save").disabled=false;$("cutout-register").disabled=false;
      render();message("写真を読み込みました。『背景をタップ』で背景色のつながった領域を消すか、消しゴムで不要部分をなぞってください。");
    } catch {message("画像を開けませんでした。JPEGまたはPNGを選んでください。");}
  });
  $("cutout-ai-select").addEventListener("click",()=>{
    if(!state.loaded || state.aiBusy)return;
    state.lasso=false;state.lassoPoints=[];state.selecting=true;state.selection=null;$("cutout-ai-run").disabled=true;
    message("キャラクター全体を指で四角く囲んでください。少し余白を入れると切れにくくなります。");render();
  });
  $("cutout-ai-run").addEventListener("click",async()=>{
    if(!state.loaded || !state.selection || state.aiBusy)return;
    if(!navigator.onLine){message("AIモデルの取得にはインターネット接続が必要です。手動編集はオフラインでも使えます。");return;}
    const b=state.selection;
    const pad=Math.round(Math.max(b.w,b.h)*.06);
    const x=Math.max(0,Math.floor(b.x-pad)),y=Math.max(0,Math.floor(b.y-pad));
    const right=Math.min(source.width,Math.ceil(b.x+b.w+pad)),bottom=Math.min(source.height,Math.ceil(b.y+b.h+pad));
    const w=right-x,h=bottom-y;
    if(w<16 || h<16)return;
    state.aiBusy=true;$("cutout-ai-run").disabled=true;$("cutout-ai-select").disabled=true;
    message("① AIライブラリを読み込み中です（ネット接続が必要）…");
    try {
      // IMG.LY's open-source, in-browser background-removal library. No external image upload.
      // Loaded only when the user explicitly requests AI; it is not part of the offline shell.
      const module=await import("https://esm.sh/@imgly/background-removal@1.7.0?bundle");
      message("② AIライブラリの読み込み完了。画像を準備しています…");
      const removeBackground=module.removeBackground || module.default;
      if(typeof removeBackground!=="function")throw new Error("AIライブラリを読み込めませんでした");
      const crop=document.createElement("canvas");
      const scale=Math.min(1,640/Math.max(w,h));
      crop.width=Math.max(1,Math.round(w*scale));crop.height=Math.max(1,Math.round(h*scale));
      crop.getContext("2d").drawImage(source,x,y,w,h,0,0,crop.width,crop.height);
      const input=await new Promise((resolve,reject)=>crop.toBlob(blob=>blob?resolve(blob):reject(new Error("画像変換失敗")),"image/png"));
      message("③ AIモデルとWASMを指定CDNから取得・初期化しています…");
      // The ESM CDN bundle cannot reliably infer where its separately fetched
      // WASM/model assets live. Use a fixed, version-matched public asset root.
      const assetRoot="https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/";
      const output=await removeBackground(input,{publicPath:assetRoot,model:"isnet_quint8",device:"cpu",progress:(key,current,total)=>{
        if(total>0){const pct=Math.min(100,Math.round(current/total*100));message(`③ モデル取得中：${String(key).slice(0,45)} ${pct}%`);}
      }});
      message("④ 輪郭を合成しています…");
      const bitmap=await createImageBitmap(output);
      snapshot();mctx.clearRect(0,0,mask.width,mask.height);
      // Preserve the model's alpha channel as the editable mask.
      const result=document.createElement("canvas");result.width=w;result.height=h;
      const rctx=result.getContext("2d");rctx.drawImage(bitmap,0,0,w,h);bitmap.close();
      const rgba=rctx.getImageData(0,0,w,h);
      // Improve the AI alpha matte without changing any source RGB colors.
      // Strong foreground pixels become opaque; uncertain edge pixels stay feathered.
      const rw=w,rh=h,alpha=new Uint8Array(rw*rh);
      for(let p=0;p<alpha.length;p++){
        const a=rgba.data[p*4+3]/255;
        const t=Math.max(0,Math.min(1,(a-0.12)/0.68));
        alpha[p]=Math.round(255*t*t*(3-2*t));
      }
      // Remove near-white backing connected to the crop border, but never
      // remove enclosed white highlights or disconnected light clothing.
      const srcPixels=sctx.getImageData(x,y,w,h).data;
      const visited=new Uint8Array(rw*rh);
      const queue=new Int32Array(rw*rh);
      let head=0,tail=0;
      const isBacking=(p)=>{
        const k=p*4,r=srcPixels[k],g=srcPixels[k+1],b=srcPixels[k+2];
        const hi=Math.max(r,g,b),lo=Math.min(r,g,b);
        return lo>=196 && hi-lo<=39;
      };
      const enqueue=(p)=>{
        if(visited[p])return;
        visited[p]=1;
        if(isBacking(p))queue[tail++]=p;
      };
      for(let xx=0;xx<rw;xx++){enqueue(xx);enqueue((rh-1)*rw+xx);}
      for(let yy=0;yy<rh;yy++){enqueue(yy*rw);enqueue(yy*rw+rw-1);}
      while(head<tail){
        const p=queue[head++];alpha[p]=0;
        const xx=p%rw;
        if(xx>0)enqueue(p-1);
        if(xx+1<rw)enqueue(p+1);
        if(p>=rw)enqueue(p-rw);
        if(p+rw<rw*rh)enqueue(p+rw);
      }
      // Keep the editable mask white; only its alpha channel controls cutout.
      for(let p=0;p<alpha.length;p++){
        const k=p*4;
        rgba.data[k]=255;rgba.data[k+1]=255;rgba.data[k+2]=255;
        rgba.data[k+3]=alpha[p];
      }
      rctx.putImageData(rgba,0,0);
      mctx.drawImage(result,x,y);
      state.selection=null;render();
      message("AI切り抜きが完了しました（v1.4.5相当の内部不透明度補正・外周白背景除去）。輪郭を確認し、必要に応じてブラシで修正してください。");
    }catch(err){
      console.error("AI cutout error",err);
      const detail=String(err?.stack || err?.message || err || "原因不明").slice(0,500);
      message(`AI切り抜き失敗：${detail}。この表示を教えてください。手動編集は引き続き利用できます。`);
    }finally{state.aiBusy=false;$("cutout-ai-select").disabled=false;$("cutout-ai-run").disabled=!state.selection;}
  });
  // Add the lasso control alongside the existing AI selection control, without
  // changing the established page layout or requiring an index.html update.
  const lassoButton=document.createElement("button");
  lassoButton.type="button";lassoButton.id="cutout-lasso";
  lassoButton.textContent="囲んで透明化";
  lassoButton.title="不要な部分を指で囲んで離すと、内側をまとめて透明にします";
  lassoButton.disabled=true;
  $("cutout-ai-select").insertAdjacentElement("afterend",lassoButton);
  $("cutout-file").addEventListener("change",()=>{lassoButton.disabled=false;});
  lassoButton.addEventListener("click",()=>{
    if(!state.loaded || state.aiBusy)return;
    state.selecting=false;state.anchor=null;state.selection=null;
    $("cutout-ai-run").disabled=true;
    state.lasso=true;state.down=false;state.lassoPoints=[];
    message("消したい部分を指で一筆書きで囲み、指を離してください。囲んだ内側だけ透明になります。");render();
  });
  $("cutout-mode").addEventListener("change",ev=>{state.mode=ev.target.value;});
  $("cutout-undo").addEventListener("click",()=>{
    const previous=state.undo.pop();if(!previous)return;mctx.putImageData(previous,0,0);render();$("cutout-undo").disabled=!state.undo.length;
  });
  $("cutout-reset").addEventListener("click",()=>{
    if(!state.loaded)return;state.selection=null;state.selecting=false;state.lasso=false;state.lassoPoints=[];$("cutout-ai-run").disabled=true;snapshot();mctx.clearRect(0,0,mask.width,mask.height);mctx.fillStyle="white";mctx.fillRect(0,0,mask.width,mask.height);render();message("切り抜きをリセットしました。");
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
