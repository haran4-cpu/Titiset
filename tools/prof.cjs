const {load}=require('./load.cjs'); const X=load(`
var __prof = function(gid, seed, secs, bar){ const sr=44100; const s=composeTrack(gid, seed); const d=new Deck(sr,0); const M=new Master(sr);
 d.load(s,null); d.playing=1; M.setTempo(s.meta.bpm); d.seek(bar*16);
 const L=new Float32Array(128),R=new Float32Array(128); const T=new Float64Array(16); const names=['kick','snare','hats','perc','bass','chords','pad','leadM','leadP','arp','fx','tex','mix','master','events'];
 const Mx=d.mix; const insts=[d.kick,d.snare,d.hats,d.perc,d.bass,d.chords,d.pad,d.leadMono,d.leadPoly,d.arp,d.fx,d.tex];
 const chi=[0,1,2,3,4,5,6,7,7,8,9,10];
 for(let b=0;b<secs*sr/128;b++){ let t=performance.now();
   // events only (copy of process without rendering)
   const sps=d.sps,end=d.pos+128/sps,E=d.ev; while(d.ei<d.N&&E.t[d.ei]<end){ d.dispatch(d.ei, Math.max(0,Math.min(127,Math.round((E.t[d.ei]-d.pos)*sps)))); d.ei++; } d.pos=end; d.automate();
   for(let c=0;c<11;c++){Mx.bufL[c].fill(0);Mx.bufR[c].fill(0);}
   let t1=performance.now(); T[14]+=t1-t;
   for(let k=0;k<insts.length;k++){ t=performance.now(); insts[k].render(Mx.bufL[chi[k]],Mx.bufR[chi[k]],128); t1=performance.now(); T[k]+=t1-t; }
   t=performance.now(); Mx.mix(128); t1=performance.now(); T[12]+=t1-t; M.run([Mx],1,L,R,128); T[13]+=performance.now()-t1; }
 const out={}; let tot=0; for(let k=0;k<15;k++){ out[names[k]]=+(T[k]/secs/10).toFixed(2); tot+=T[k]; } out.totalPct=+(tot/secs/10).toFixed(1); return out; };`);
const g=process.argv[2]||'tech-house'; console.log(g, JSON.stringify(X.__prof?X.__prof(g,7,20,+process.argv[3]||96):null));
