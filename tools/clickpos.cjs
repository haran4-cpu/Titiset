const {X,renderTrack}=require('./render.cjs'); const C=require('./critic.cjs');
const [gid,seed,ch]=[process.argv[2],+process.argv[3],+process.argv[4]];
const sc=X.composeTrack(gid,seed); const sec=sc.sections.find(s=>s.type==="drop")||sc.sections[2];
const r=renderTrack(gid,seed,{fromBar:sec.bar0,toBar:sec.bar0+4,stems:true,score:sc});
const x=C.mono(r.stems[ch]); const sr=r.sr, sps=r.sps, from=sec.bar0*16, ev=sc.ev;
const n=x.length, d=new Float32Array(n); for(let i=2;i<n;i++) d[i]=Math.abs(x[i]-2*x[i-1]+x[i-2]);
const B=Math.round(sr*0.001), nb=Math.ceil(n/B), bm=new Float32Array(nb); for(let i=0;i<n;i++){ const k=(i/B)|0; if(d[i]>bm[k]) bm[k]=d[i]; }
const pos=[]; let last=-1e9; for(let i=0;i<n;i++){ if(d[i]<=0.05||i-last<sr*0.05) continue; const k=(i/B)|0; let pm=0; for(let j=Math.max(0,k-42);j<k-2;j++) if(bm[j]>pm) pm=bm[j]; if(k>42&&d[i]>3*pm){ pos.push(i); last=i; } }
for(const p of pos.slice(0,10)){ const st=p/sps; let near=''; let bestDt=1e9; for(let i=0;i<ev.n;i++) if(ev.ch[i]===ch){ const t=ev.t[i]-from; const dt=(st-t)*sps/sr*1000; if(Math.abs(dt)<Math.abs(bestDt)){bestDt=dt; near=`note ${ev.a[i]} d${ev.d[i].toFixed(2)} f${ev.f[i]} y${ev.y[i]}`;} }
  const ctx=[]; for(let k=-3;k<=3;k++) ctx.push(x[p+k].toFixed(3));
  console.log(`click @${(p/sr*1000).toFixed(1)}ms step ${st.toFixed(2)} d2 ${d[p].toFixed(3)} nearest onset ${bestDt.toFixed(1)}ms (${near}) ctx ${ctx.join(' ')}`); }
console.log('total', pos.length);
