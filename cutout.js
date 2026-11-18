"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $("cutout-canvas"), ctx = canvas.getContext("2d", {willReadFrequently:true});
  const zoomControls=document.createElement("div");
  zoomControls.style.cssText="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0";
  const viewport=document.createElement("div");
  viewport.style.cssText="display:block;width:100%;min-width:0;position:relative;overflow:hidden;height:65vh;overscroll-behavior:contain";
  canvas.before(zoomControls,viewport);
  viewport.append(canvas);
  let zoom=1;
  let panning=false;
  function zoomButton(label,action){
    const button=document.createElement("button");
    button.type="button";button.textContent=label;
    button.addEventListener("click",action);
    zoomControls.append(button);
    return button;
  }
  const zoomOut=zoomButton("縮小",()=>setZoom(zoom-0.5));
  const zoomReset=zoomButton("100%",()=>setZoom(1));
  const zoomIn=zoomButton("拡大",()=>setZoom(zoom+0.5));
  const panButton=zoomButton("表示位置を移動",()=>{
    panning=!panning;
    canvas.style.touchAction="none";
    panButton.setAttribute("aria-pressed",String(panning));
    panButton.textContent=panning?"編集に戻る":"表示位置を移動";
  });
  canvas.style.touchAction="none";
  let offsetX=0,offsetY=0,displayWidth=0,displayHeight=0;
  function moveImage(x,y){
    offsetX=Math.max(0,Math.min(x,displayWidth-viewport.clientWidth));
    offsetY=Math.max(0,Math.min(y,displayHeight-viewport.clientHeight));
    canvas.style.transform="translate("+(-offsetX)+"px,"+(-offsetY)+"px)";
  }
  let drag=null;
  canvas.addEventListener("pointerdown",ev=>{
    if(!panning || !ev.isPrimary || ev.button!==0)return;
    canvas.setPointerCapture(ev.pointerId);
    drag={id:ev.pointerId,x:ev.clientX,y:ev.clientY,left:offsetX,top:offsetY};
  });
  canvas.addEventListener("pointermove",ev=>{
    if(!panning || drag?.id!==ev.pointerId)return;
    moveImage(drag.left+drag.x-ev.clientX,drag.top+drag.y-ev.clientY);
  });
  canvas.addEventListener("lostpointercapture",ev=>{
    if(drag?.id===ev.pointerId)drag=null;
  });
  panButton.setAttribute("aria-pressed","false");
  function setZoom(value){
    const next=Math.max(1,Math.min(4,value));
    const ratio=next/zoom;
    const x=(offsetX+viewport.clientWidth/2)*ratio-viewport.clientWidth/2;
    const y=(offsetY+viewport.clientHeight/2)*ratio-viewport.clientHeight/2;
    zoom=next;
    sizeZoomCanvas();
    moveImage(x,y);
    zoomReset.textContent=(zoom*100)+"%";
    zoomOut.disabled=zoom===1;
    zoomIn.disabled=zoom===4;
  }
  function sizeZoomCanvas(){
    const width=Math.round(viewport.clientWidth*zoom);
    if(!width || !canvas.width)return;
    displayWidth=width;
    displayHeight=Math.round(width*canvas.height/canvas.width);
    canvas.style.setProperty("position","absolute","important");
    canvas.style.inset="0 auto auto 0";
    canvas.style.setProperty("width",width+"px","important");
    canvas.style.setProperty("height",displayHeight+"px","important");
    canvas.style.setProperty("max-width","none","important");
    canvas.style.setProperty("max-height","none","important");
    canvas.style.setProperty("display","block","important");
    moveImage(offsetX,offsetY);
  }
  const zoomObserver=new ResizeObserver(sizeZoomCanvas);
  zoomObserver.observe(viewport);
  setZoom(1);

  const source = document.createElement("canvas"), sctx = source.getContext("2d", {willReadFrequently:true});
  const mask = document.createElement("canvas"), mctx = mask.getContext("2d", {willReadFrequently:true});
  const state = { loaded:false, mode:"erase", down:false, last:null, undo:[], sourceName:"character", selecting:false, selection:null, anchor:null, aiBusy:false, lasso:false, lassoPoints:[] };
  const message = (s) => { $("cutout-status").textContent=s; };
  const limit = 1600;
  const setSize = (w,h) => { for (const c of [canvas,source,mask]) { c.width=w;c.height=h; } setZoom(1); };
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
    if(!state.loaded || panning)return;
    ev.preventDefault();canvas.setPointerCapture(ev.pointerId);
    const p=position(ev);
    if(state.lasso && state.lassoPoints.length>=3){eraseLasso(p);return;}
    if(state.lasso) {state.down=true;state.lassoPoints=[p];render();return;}
    if(state.selecting) {state.anchor=p;state.selection={x:p.x,y:p.y,w:0,h:0};render();return;}
    snapshot();
    if(state.mode==="auto") { removeConnectedBackground(p);return; }
    state.down=true;state.last=p;brush(p,p);
  });
  canvas.addEventListener("pointermove",ev=>{
    if(panning)return;
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
  function eraseLasso(seed) {
    const restore=state.lasso==="restore";
    const points=state.lassoPoints;
    state.down=false;state.lasso=false;
    if(points.length<3){state.lassoPoints=[];render();message("囲みが短すぎます。もう一度、大きく囲んでください。");return;}
    const w=canvas.width,h=canvas.height;
    const region=document.createElement("canvas");
    region.width=w;region.height=h;
    const rctx=region.getContext("2d");
    rctx.beginPath();rctx.moveTo(points[0].x,points[0].y);
    for(const p of points.slice(1))rctx.lineTo(p.x,p.y);
    rctx.closePath();rctx.fill();
    const inside=rctx.getImageData(0,0,w,h).data;
    if(restore){
      const edited=mctx.getImageData(0,0,w,h);
      let changed=false;
      for(let k=3;k<inside.length;k+=4){
        const a=inside[k], previous=edited.data[k];
        if(a<=previous)continue;
        edited.data[k-3]=255;edited.data[k-2]=255;edited.data[k-1]=255;
        edited.data[k]=a;
        changed=true;
      }
      if(changed){
        snapshot();
        mctx.putImageData(edited,0,0);
      }
      state.lassoPoints=[];render();
      message(changed?"囲みの中を元画像から復元しました。":"囲みの中に復元する部分がありませんでした。");
      return;
    }
    const src=sctx.getImageData(0,0,w,h).data;
    const edited=mctx.getImageData(0,0,w,h);
    const alpha=edited.data;
    const tolerance=Math.min(18,Math.max(0,Number($("cutout-tolerance").value)));
    const edge=Math.min(9,tolerance);
    const distance=(i,j)=>Math.max(
      Math.abs(src[i]-src[j]),Math.abs(src[i+1]-src[j+1]),Math.abs(src[i+2]-src[j+2])
    );
    const opaque=(i)=>src[i+3]>=250 && alpha[i+3]>0;
    const neighbors=(i,visit)=>{
      if(i%w>0)visit(i-1);
      if(i%w<w-1)visit(i+1);
      if(i>=w)visit(i-w);
      if(i<w*(h-1))visit(i+w);
    };
    const samples=[];
    let perimeter=0;
    for(let i=0;i<w*h;i++){
      const k=i*4;
      if(inside[k+3]!==255)continue;
      let boundary=false,continues=false;
      neighbors(i,(j)=>{
        const n=j*4;
        if(inside[n+3]===255)return;
        boundary=true;
        if(opaque(k) && opaque(n) && distance(k,n)<=edge)continues=true;
      });
      if(boundary)perimeter++;
      if(continues)samples.push(i);
    }
    // Require one dominant boundary color before changing the mask.
    const bins=new Map();
    for(const i of samples){
      const k=i*4;
      const key=(src[k]>>4)*256+(src[k+1]>>4)*16+(src[k+2]>>4);
      const bin=bins.get(key);
      if(bin)bin.count++;
      else bins.set(key,{index:k,count:1});
    }
    const ranked=[...bins.values()].sort((a,b)=>b.count-a.count);
    const background=seed ? (Math.floor(seed.y)*w+Math.floor(seed.x))*4 : ranked[0]?.index;
    const queue=new Int32Array(w*h);
    const seen=new Uint8Array(w*h);
    let head=0,tail=0;
    if(seed){
      if(inside[background+3]===255 && opaque(background)){
        const i=background/4;
        seen[i]=1;queue[tail++]=i;
      }
    }else if(background!==undefined){
      for(const i of samples){
        if(distance(i*4,background)>tolerance)continue;
        seen[i]=1;queue[tail++]=i;
      }
    }
    if(tail>=(seed ? 1 : Math.max(8,Math.ceil(perimeter*0.65)))){
      while(head<tail){
        const i=queue[head++],k=i*4;
        alpha[k+3]=0;
        neighbors(i,(j)=>{
          const n=j*4;
          if(seen[j] || inside[n+3]!==255 || !opaque(n))return;
          if(distance(k,n)>edge || distance(n,background)>tolerance)return;
          seen[j]=1;queue[tail++]=j;
        });
      }
      snapshot();
      mctx.putImageData(edited,0,0);
      message("背景と判定した部分を透明にしました。必要に応じて「元に戻す」を押してください。");
    }else{
      state.lasso=true;
      message("囲みの内側に残った背景色をタップしてください。髪や服は避けてください。");
      render();return;
    }
    state.lassoPoints=[];render();
  }
  const stop=()=>{
    if(panning)return;
    if(state.lasso && state.down){eraseLasso();return;}
    if(state.selecting && state.anchor){state.anchor=null;state.selecting=false;
      $("cutout-ai-run").disabled=!(state.selection && state.selection.w>10 && state.selection.h>10);
      message("囲む範囲を指定しました。『AIで切り抜く』を押してください。");render();
    }
    state.down=false;state.last=null;
  };
  canvas.addEventListener("pointerup",stop);canvas.addEventListener("pointercancel",()=>{
    if(panning)return;
    if(state.lasso){state.down=false;state.lassoPoints=[];render();return;}
    stop();
  });
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
      // Preserve model alpha, including light foreground that meets the crop edge.
      for(let k=0;k<rgba.data.length;k+=4){
        rgba.data[k]=255;rgba.data[k+1]=255;rgba.data[k+2]=255;
      }
      rctx.putImageData(rgba,0,0);
      mctx.drawImage(result,x,y);
      state.selection=null;render();
      message("AI切り抜きが完了しました。輪郭を確認し、必要に応じてブラシで修正してください。");
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
  lassoButton.title="囲みの縁に続く背景色を検出して透明にします";
  lassoButton.disabled=true;
  $("cutout-ai-select").insertAdjacentElement("afterend",lassoButton);
  $("cutout-file").addEventListener("change",()=>{lassoButton.disabled=false;});
  lassoButton.addEventListener("click",()=>{
    if(!state.loaded || state.aiBusy)return;
    state.selecting=false;state.anchor=null;state.selection=null;
    $("cutout-ai-run").disabled=true;
    state.lasso=true;state.down=false;state.lassoPoints=[];
    message("囲みの縁が背景を通るように指で囲んでください。囲みの中で背景と判定した部分を透明にします。");render();
  });
  const restoreButton=document.createElement("button");
  restoreButton.type="button";
  restoreButton.textContent="囲んで復元";
  lassoButton.after(restoreButton);
  restoreButton.addEventListener("click",()=>{
    if(!state.loaded || state.aiBusy)return;
    state.selection=null;state.selecting=false;state.anchor=null;
    $("cutout-ai-run").disabled=true;
    state.lasso="restore";state.down=false;state.lassoPoints=[];
    message("花や手袋など、戻したい部分を囲んでください。背景を含めると背景も戻ります。");
    render();
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








