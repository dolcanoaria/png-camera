"use strict";
// Minimal self-contained JPEG EXIF reader/writer: capture date and GPS only.
// All processing stays on device; no external libraries or requests.
window.PNGCameraExif = (() => {
  const pad = n => String(n).padStart(2, "0");
  const dateString = d => `${d.getFullYear()}:${pad(d.getMonth()+1)}:${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  function readTiff(bytes) {
    if (bytes.length < 8) return {};
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const little = bytes[0] === 0x49 && bytes[1] === 0x49;
    if (!little && !(bytes[0] === 0x4d && bytes[1] === 0x4d)) return {};
    const u16 = p => p + 2 <= bytes.length ? dv.getUint16(p, little) : null;
    const u32 = p => p + 4 <= bytes.length ? dv.getUint32(p, little) : null;
    if (u16(2) !== 42) return {};
    const typeSize = {1:1,2:1,3:2,4:4,5:8,7:1,10:8};
    function entries(offset) {
      const result = new Map(), count = u16(offset);
      if (count === null || count > 100 || offset + 2 + count*12 + 4 > bytes.length) return result;
      for (let i=0;i<count;i++) {
        const p=offset+2+i*12, tag=u16(p), type=u16(p+2), n=u32(p+4);
        const size=typeSize[type];
        if (!size || n === null || n > 4096 || n*size > bytes.length) continue;
        const start=n*size<=4?p+8:u32(p+8);
        if (start === null || start+n*size > bytes.length) continue;
        result.set(tag,{type,n,start});
      }
      return result;
    }
    function number(e,i=0) {
      if (!e || i>=e.n) return null;
      const p=e.start+i*(typeSize[e.type]||1);
      if (e.type===3) return u16(p);
      if (e.type===4) return u32(p);
      if (e.type===5 || e.type===10) {
        const a=e.type===10?dv.getInt32(p,little):u32(p);
        const b=e.type===10?dv.getInt32(p+4,little):u32(p+4);
        return b ? a/b : null;
      }
      if (e.type===1) return bytes[p];
      return null;
    }
    function ascii(e) { return e && e.type===2 ? String.fromCharCode(...bytes.slice(e.start,e.start+e.n)).replace(/\0.*$/,'') : ''; }
    const root=entries(u32(4));
    const exif=entries(number(root.get(0x8769))||0);
    const gps=entries(number(root.get(0x8825))||0);
    const date=ascii(exif.get(0x9003)) || ascii(root.get(0x0132));
    function coordinate(refTag,coordTag,positive,negative) {
      const ref=ascii(gps.get(refTag)), v=gps.get(coordTag);
      if (!v || v.n!==3 || ![positive,negative].includes(ref)) return null;
      const d=number(v,0),m=number(v,1),s=number(v,2);
      if (![d,m,s].every(Number.isFinite)) return null;
      return (d+m/60+s/3600)*(ref===negative?-1:1);
    }
    return {date: /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(date)?date:null,
      lat:coordinate(1,2,'N','S'), lon:coordinate(3,4,'E','W')};
  }
  async function fromFile(file) {
    if (!/jpe?g/i.test(file.type) && !/\.jpe?g$/i.test(file.name)) return {};
    const bytes=new Uint8Array(await file.arrayBuffer());
    if (bytes[0]!==0xff || bytes[1]!==0xd8) return {};
    let p=2;
    while(p+4<bytes.length) {
      if(bytes[p]!==0xff) break;
      const marker=bytes[p+1];
      if(marker===0xda || marker===0xd9) break;
      const len=(bytes[p+2]<<8)|bytes[p+3];
      if(len<2 || p+2+len>bytes.length) break;
      if(marker===0xe1 && len>=8 && String.fromCharCode(...bytes.slice(p+4,p+10))==='Exif\0\0')
        return readTiff(bytes.subarray(p+10,p+2+len));
      p+=2+len;
    }
    return {};
  }
  function makeExif(meta) {
    const gpsOK=Number.isFinite(meta.lat)&&Number.isFinite(meta.lon) && Math.abs(meta.lat)<=90 && Math.abs(meta.lon)<=180;
    const date=meta.date || dateString(new Date());
    const enc = new TextEncoder();
    const dateBytes=enc.encode(date+'\0');
    const ifd0Count=gpsOK?3:2;
    const ifd0Start=8, ifd0Size=2+ifd0Count*12+4;
    const exifStart=ifd0Start+ifd0Size, exifSize=2+12+4;
    const gpsStart=gpsOK?exifStart+exifSize:0, gpsSize=gpsOK?2+4*12+4:0;
    const dateStart=exifStart+exifSize+gpsSize;
    const gpsRatStart=dateStart+dateBytes.length;
    const length=gpsRatStart+(gpsOK?48:0);
    const b=new Uint8Array(length), v=new DataView(b.buffer);
    b[0]=0x49;b[1]=0x49;v.setUint16(2,42,true);v.setUint32(4,8,true);
    const w16=(p,n)=>v.setUint16(p,n,true), w32=(p,n)=>v.setUint32(p,n,true);
    function entry(p,tag,type,count,value) {
      w16(p,tag);w16(p+2,type);w32(p+4,count);w32(p+8,value);
    }
    w16(ifd0Start,ifd0Count);
    entry(ifd0Start+2,0x0112,3,1,1); // Orientation 1: pixels already rotated by canvas
    entry(ifd0Start+14,0x8769,4,1,exifStart);
    if(gpsOK) entry(ifd0Start+26,0x8825,4,1,gpsStart);
    w32(ifd0Start+2+ifd0Count*12,0);
    w16(exifStart,1);
    entry(exifStart+2,0x9003,2,dateBytes.length,dateStart);
    w32(exifStart+14,0);
    b.set(dateBytes,dateStart);
    if(gpsOK) {
      w16(gpsStart,4);
      function refEntry(p,tag,ref) {
        w16(p,tag);w16(p+2,2);w32(p+4,2);b[p+8]=ref.charCodeAt(0);b[p+9]=0;
      }
      refEntry(gpsStart+2,1,meta.lat<0?'S':'N');
      entry(gpsStart+14,2,5,3,gpsRatStart);
      refEntry(gpsStart+26,3,meta.lon<0?'W':'E');
      entry(gpsStart+38,4,5,3,gpsRatStart+24);
      w32(gpsStart+50,0);
      function coord(p,value) {
        const abs=Math.abs(value),d=Math.floor(abs),m=Math.floor((abs-d)*60);
        const sec=Math.round(((abs-d)*60-m)*60*10000);
        [[d,1],[m,1],[sec,10000]].forEach(([a,z],i)=>{w32(p+i*8,a);w32(p+i*8+4,z);});
      }
      coord(gpsRatStart,meta.lat);coord(gpsRatStart+24,meta.lon);
    }
    const payload=new Uint8Array(6+b.length);
    payload.set([69,120,105,102,0,0]);payload.set(b,6);
    return payload;
  }
  async function write(blob,meta) {
    const jpeg=new Uint8Array(await blob.arrayBuffer());
    if(jpeg[0]!==0xff || jpeg[1]!==0xd8) throw new Error('JPEGではありません');
    const payload=makeExif(meta);
    const len=payload.length+2;
    if(len>65535) throw new Error('EXIFが大きすぎます');
    const out=new Uint8Array(jpeg.length+4+payload.length);
    out.set(jpeg.subarray(0,2),0);
    out.set([0xff,0xe1,len>>8,len&255],2);
    out.set(payload,6);out.set(jpeg.subarray(2),6+payload.length);
    return new Blob([out],{type:'image/jpeg'});
  }
  function locate(timeout=7000) {
    return new Promise(resolve=>{
      if(!navigator.geolocation || !window.isSecureContext) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        p=>resolve({lat:p.coords.latitude,lon:p.coords.longitude}),
        ()=>resolve(null),{enableHighAccuracy:true,timeout,maximumAge:30000});
    });
  }
  return {fromFile,write,locate,dateString};
})();
