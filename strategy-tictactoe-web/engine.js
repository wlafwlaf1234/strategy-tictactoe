'use strict';
// RULES (v0.4): one straight line of 4-5 consecutive own stones is ONE "mok" (3 or fewer is nothing); three moks win,
// or six-or-more in one line wins alone. Cells may be shared between lines. A cell stolen from you stays locked for your
// next TWO turns (no steal-back). NOTE: kind labels '5目' (= six-in-row) and '3目×3' (= three 4-moks) are legacy identifiers.
function makeEngine(CFG){
 CFG=CFG||{};const S=CFG.S||7,NC=S*S,K=CFG.K||4,F=CFG.F||6,MID=(S-1)/2,LOCKN=CFG.LOCKN||2,LB=NC+1;
 // Lock rule. LOCKN=1: the cell just stolen from you cannot be stolen back this turn (lock is a cell index, -1 = none).
 // LOCKN=2: it also stays locked for your NEXT turn. lock is then a packed code of the last three steal slots; code<0 = none.
 function lockSlots(c){return c<0?[-1,-1,-1]:[c%LB-1,Math.floor(c/LB)%LB-1,Math.floor(c/(LB*LB))%LB-1];}
 // Protected cell: the first player's opening stone cannot be stolen on the opponent's immediate reply only. Stored as the top digit of the lock code.
 function protCell(c){return LOCKN===1||c<0?-1:Math.floor(c/(LB*LB*LB))-1;}
 function packLock(a,b,c,p){return a<0&&b<0&&c<0&&p<0?-1:(a+1)+LB*(b+1)+LB*LB*(c+1)+LB*LB*LB*(p+1);}
 function isLocked(c,i){if(LOCKN===1)return c===i;if(c<0)return false;const s=lockSlots(c);return s[0]===i||s[2]===i||protCell(c)===i;}
 function lockedCells(c){const o=[];for(let i=0;i<NC;i++)if(isLocked(c,i))o.push(i);return o;}
 function pushLock(old,cell,prot){if(LOCKN===1)return cell;const s=lockSlots(old);return packLock(cell,s[0],s[1],prot);}
 function protOnly(){return -1;} // the opening-stone protection ends after one reply, so nothing persists after a non-steal move
 const L3=[],L5=[],dirs=[[0,1],[1,0],[1,1],[1,-1]];
 for(let r=0;r<S;r++)for(let c=0;c<S;c++)for(const [dr,dc] of dirs)for(const len of [K,F]){
  const rr=r+(len-1)*dr,cc=c+(len-1)*dc;
  if(rr>=0&&rr<S&&cc>=0&&cc<S){const line=[];for(let k=0;k<len;k++)line.push((r+k*dr)*S+c+k*dc);(len===K?L3:L5).push(line);}
 }
 const lines=L5.concat(L3),N=lines.length,N5=L5.length,inc=Array.from({length:NC},()=>[]);
 lines.forEach((l,k)=>l.forEach(i=>inc[i].push(k)));
 const center=Array.from({length:NC},(_,i)=>(S-1-Math.abs((i/S|0)-MID)-Math.abs(i%S-MID))*2);
 // Window weights by stone count. F-windows: count F = win (huge). K-windows: a full window is handled by the run counter (0).
 const W5=F===5?[0,3,28,240,2600,1000000]:[0,2,14,100,700,2600,1000000].slice(0,F+1).map((v,i)=>i===F?1000000:v),
       W3=K===3?[0,2,20,0]:[0,2,14,90,0].slice(0,K+1).map((v,i)=>i===K?0:v),MATE=1e8;
 // Deterministic two-word Zobrist keys include side to move, capture lock and opening.
 let seed=0x932afb1;function rand(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;}
 const z1=Array.from({length:NC*2},rand),z2=Array.from({length:NC*2},rand);
 const TT=new Map(),clock=()=>typeof performance!=='undefined'?performance.now():Date.now();
 // Rule: a straight line of 3-4 consecutive own stones is ONE "mok" (3 shared-cell windows of a 4-run do not count twice).
 // Cells may be shared between different lines. Five or more in a row is an instant win by itself.
 const DIRS=[[0,1],[1,0],[1,1],[1,-1]];
 function runsOf(b,p){const runs=[];
  for(let r=0;r<S;r++)for(let c=0;c<S;c++)for(const [dr,dc] of DIRS){
   const pr=r-dr,pc=c-dc;if(pr>=0&&pr<S&&pc>=0&&pc<S&&b[pr*S+pc]===p)continue;
   if(b[r*S+c]!==p)continue;
   const cells=[];let rr=r,cc=c;while(rr>=0&&rr<S&&cc>=0&&cc<S&&b[rr*S+cc]===p){cells.push(rr*S+cc);rr+=dr;cc+=dc;}
   if(cells.length>=K)runs.push(cells);
  }
  return runs;
 }
 function counts(b,p){return runsOf(b,p).length;}
 function win(b,p){const five=L5.find(l=>l.every(i=>b[i]===p));if(five)return {kind:'5目',cells:five};const runs=runsOf(b,p);return runs.length>=3?{kind:'3目×3',cells:[...new Set(runs.flat())]}:null;}
 // Length of consecutive stones of side v starting next to (r,c) in direction (dr,dc).
 function ray(b,r,c,dr,dc,v){let n=0;r+=dr;c+=dc;while(r>=0&&r<S&&c>=0&&c<S&&b[r*S+c]===v){n++;r+=dr;c+=dc;}return n;}
 // Number of qualifying runs (length>=3) of side v on the four lines through cell i, if cell i holds `state`.
 function lineRuns(b,i,v,state){const r=i/S|0,c=i%S;let n=0;
  for(const [dr,dc] of DIRS){const a=ray(b,r,c,-dr,-dc,v),d=ray(b,r,c,dr,dc,v);
   n+=state===v?(a+1+d>=K?1:0):((a>=K?1:0)+(d>=K?1:0));}
  return n;
 }
 function next(s,a){const b=s.b.slice();let w=null;const used=[];for(const i of a.cells){b[i]=s.p;used.push(i);w=win(b,s.p);if(w)break;}return {b,p:-s.p,lock:pushLock(s.lock,a.type==='steal'?a.cells[0]:-1,s.first?a.cells[0]:-1),first:false,w,used};}
 function actions(s){const empty=[],caps=[];for(let i=0;i<NC;i++){if(!s.b[i])empty.push(i);else if(s.b[i]===-s.p&&!isLocked(s.lock,i)&&!s.first)caps.push({type:'steal',cells:[i]});}
  if(s.first||empty.length===1)return empty.map(i=>({type:'place',cells:[i]})).concat(caps);
  const all=caps;for(let i=0;i<empty.length;i++)for(let j=i+1;j<empty.length;j++)all.push({type:'place',cells:[empty[i],empty[j]]});return all;
 }
 function value(k,x,o){const w=k<N5?W5:W3;let v=(!o?w[x]:0)-(!x?w[o]:0);
  if(k<N5){if(x===F-1&&o===1)v+=2200;if(o===F-1&&x===1)v-=2200;}
  return v;
 }
 function build(s){const t={b:Int8Array.from(s.b),p:s.p,lock:s.lock,first:s.first,end:!!s.w,x:new Int8Array(N),o:new Int8Array(N),fx:0,fo:0,score:0,h1:0,h2:0};
  for(let i=0;i<NC;i++)if(t.b[i]){const b=t.b[i],zi=i*2+(b===1?0:1);t.h1^=z1[zi];t.h2^=z2[zi];t.score+=b*center[i];for(const k of inc[i])(b===1?t.x:t.o)[k]++;}
  for(let k=0;k<N;k++)t.score+=value(k,t.x[k],t.o[k]);
  t.fx=counts(t.b,1);t.fo=counts(t.b,-1);
  return t;
 }
 function evaluate(t){return t.p*(t.score+520*(t.fx*t.fx-t.fo*t.fo));}
 function setCell(t,i,v){const old=t.b[i];if(old===v)return;
  const ox=lineRuns(t.b,i,1,old),oo=lineRuns(t.b,i,-1,old);
  for(const k of inc[i]){t.score-=value(k,t.x[k],t.o[k]);
   if(old===1)t.x[k]--;else if(old===-1)t.o[k]--;
   if(v===1)t.x[k]++;else if(v===-1)t.o[k]++;
   t.score+=value(k,t.x[k],t.o[k]);
  }
  t.fx+=lineRuns(t.b,i,1,v)-ox;t.fo+=lineRuns(t.b,i,-1,v)-oo;
  if(old){const j=i*2+(old===1?0:1);t.h1^=z1[j];t.h2^=z2[j];}if(v){const j=i*2+(v===1?0:1);t.h1^=z1[j];t.h2^=z2[j];}
  t.score+=(v-old)*center[i];t.b[i]=v;
 }
 function apply(t,a){const u={p:t.p,lock:t.lock,first:t.first,end:t.end,cells:[],old:[]};
  for(const i of a.cells){u.cells.push(i);u.old.push(t.b[i]);setCell(t,i,t.p);
   const own=t.p===1?t.x:t.o,full=t.p===1?t.fx:t.fo;
   if(full>=3||inc[i].some(k=>k<N5&&own[k]===F)){t.end=true;break;}
  }
  t.lock=pushLock(t.lock,a.type==='steal'?a.cells[0]:-1,t.first?a.cells[0]:-1);t.first=false;t.p=-t.p;return u;
 }
 function undo(t,u){for(let j=u.cells.length-1;j>=0;j--)setCell(t,u.cells[j],u.old[j]);t.p=u.p;t.lock=u.lock;t.first=u.first;t.end=u.end;}
 function stateKey(t){return (t.h1>>>0)+':'+(t.h2>>>0)+':'+t.p+':'+t.lock+':'+(t.first?1:0);}
 function sameAction(a,b){return !!a&&!!b&&a.type===b.type&&a.cells.length===b.cells.length&&a.cells.every((v,i)=>v===b.cells[i]);}
 // Direct threat detection: a five needs <=2 empty cells, or one legal capture.
 // Three shared triples are counted using single-cell and two-cell completion sets.
 function immediate(t,p=t.p,lock=t.lock,first=t.first){const own=p===1?t.x:t.o,other=p===1?t.o:t.x,b=t.b,limit=first?1:2;
  for(let k=0;k<N5;k++){
   if(other[k]===0&&own[k]>=F-limit&&own[k]<F){const cells=lines[k].filter(i=>b[i]===0);return {type:'place',cells};}
   if(!first&&own[k]===F-1&&other[k]===1){const i=lines[k].find(j=>b[j]===-p);if(!isLocked(lock,i))return {type:'steal',cells:[i]};}
  }
  const full=p===1?t.fx:t.fo;let viable=full;
  for(let k=N5;k<N;k++)if((other[k]===0&&own[k]>=K-limit&&own[k]<K)||(!first&&own[k]===K-1&&other[k]===1))viable++;
  // Most early positions cannot form three triples: avoid allocating completion tables.
  if(viable<3)return null;
  const one=new Int8Array(NC),cap=new Int8Array(NC),pairs=[],two=new Uint8Array(NC*NC);
  // The window counts below only give an upper bound; every candidate is verified with the exact run rule.
  const verify=(type,cells)=>{const saved=[];let res=null;
   for(const i of cells){saved.push([i,t.b[i]]);setCell(t,i,p);if((p===1?t.fx:t.fo)>=3){res={type,cells:saved.map(x=>x[0])};break;}}
   for(let j=saved.length-1;j>=0;j--)setCell(t,saved[j][0],saved[j][1]);
   return res;};
  for(let k=N5;k<N;k++){
   if(other[k]===0&&own[k]>=K-limit&&own[k]<K){const miss=lines[k].filter(i=>b[i]===0);if(miss.length===1)one[miss[0]]++;else if(miss.length===2){const i=Math.min(...miss),j=Math.max(...miss),key=i*NC+j;two[key]++;pairs.push(key);}}
   else if(!first&&own[k]===K-1&&other[k]===1){const i=lines[k].find(j=>b[j]===-p);if(!isLocked(lock,i))cap[i]++;}
  }
  const hot=[];
  for(let i=0;i<NC;i++){if(!first&&cap[i]+full>=3&&cap[i]){const r=verify('steal',[i]);if(r)return r;}if(one[i]+full>=3&&one[i]){const r=verify('place',[i]);if(r)return r;}if(one[i])hot.push(i);}
  if(limit===2){const done=new Set();
   for(const key of pairs){if(done.has(key))continue;done.add(key);const i=key/NC|0,j=key%NC;if(full+one[i]+one[j]+two[key]>=3){const r=verify('place',[i,j]);if(r)return r;}}
   for(let a=0;a<hot.length;a++)for(let c=a+1;c<hot.length;c++)if(full+one[hot[a]]+one[hot[c]]>=3){const r=verify('place',[hot[a],hot[c]]);if(r)return r;}
  }
  return null;
 }
 // All two-placement scores use precomputed single-cell deltas plus shared-line corrections.
 function rank(t){const b=t.b,p=t.p,own=p===1?t.x:t.o,other=p===1?t.o:t.x,f=p===1?t.fx:t.fo,g=p===1?t.fo:t.fx;
  const delta=new Float64Array(NC),df=new Int8Array(NC),dg=new Int8Array(NC),bonus=new Float64Array(NC*NC),bf=new Int8Array(NC*NC),empty=[],caps=[],out=[];
  for(let i=0;i<NC;i++)if(!b[i]||(!t.first&&b[i]===-p&&!isLocked(t.lock,i))){
   const stolen=b[i]===-p?1:0;delta[i]=(stolen?2:1)*center[i];
   for(const k of inc[i]){const x=own[k],o=other[k];delta[i]+=value(k,x+1,o-stolen)-value(k,x,o);}
   {const r=i/S|0,c=i%S;
    for(const [dr,dc] of DIRS){const a=ray(b,r,c,-dr,-dc,p),d=ray(b,r,c,dr,dc,p);
     df[i]+=(a+1+d>=K?1:0)-(a>=K?1:0)-(d>=K?1:0);
     if(stolen){const a2=ray(b,r,c,-dr,-dc,-p),d2=ray(b,r,c,dr,dc,-p);dg[i]+=(a2>=K?1:0)+(d2>=K?1:0)-(a2+1+d2>=K?1:0);}
    }}
   if(stolen)caps.push(i);else empty.push(i);
  }
  if(!t.first&&empty.length>1)for(let k=0;k<N;k++){
   const x=own[k],o=other[k],cells=lines[k].filter(i=>b[i]===0);if(cells.length<2)continue;
   const correction=value(k,x+2,o)-2*value(k,x+1,o)+value(k,x,o);
   if(!correction)continue;
   for(let a=0;a<cells.length;a++)for(let c=a+1;c<cells.length;c++){const i=Math.min(cells[a],cells[c]),j=Math.max(cells[a],cells[c]),key=i*NC+j;bonus[key]+=correction;}
  }
  if(!t.first&&empty.length>1){const GE=n=>n>=K?1:0;
   for(const i of empty){const r=i/S|0,c=i%S;
    for(const [dr,dc] of DIRS){let rr=r+dr,cc=c+dc,between=0;
     while(rr>=0&&rr<S&&cc>=0&&cc<S&&b[rr*S+cc]===p){between++;rr+=dr;cc+=dc;}
     if(rr<0||rr>=S||cc<0||cc>=S||b[rr*S+cc]!==0)continue;
     const j=rr*S+cc,a=ray(b,r,c,-dr,-dc,p),e=ray(b,rr,cc,dr,dc,p);
     const extra=GE(a+2+between+e)-GE(a+1+between)-GE(between+1+e)+GE(between);
     if(extra)bf[Math.min(i,j)*NC+Math.max(i,j)]+=extra;
    }}
  }
  const base=evaluate(t),tripleScore=(a,o)=>520*(a*a-f*f-o*o+g*g);
  for(const i of caps)out.push({a:{type:'steal',cells:[i]},v:base+delta[i]+tripleScore(f+df[i],g+dg[i])});
  if(t.first||empty.length===1){for(const i of empty)out.push({a:{type:'place',cells:[i]},v:base+delta[i]+tripleScore(f+df[i],g+dg[i])});}
  else for(let a=0;a<empty.length;a++)for(let c=a+1;c<empty.length;c++){const i=empty[a],j=empty[c],key=i*NC+j;
   out.push({a:{type:'place',cells:[i,j]},v:base+delta[i]+delta[j]+bonus[key]+tripleScore(f+df[i]+df[j]+bf[key],g+dg[i]+dg[j])});
  }
  out.sort((a,b)=>b.v-a.v);return out;
 }
 function choose(s,level,speed='balanced'){
  const start=clock(),settings={
   // v0.5 levels. easy/medium are human-like: they sometimes overlook a winning move (missWin), sometimes fail to see the
   // opponent's winning threat (missDef), and sometimes play a random move among their top picks (noise). hard/extreme are the
   // old medium/hard engines (never overlook a one-move win or loss).
   easy:{ms:30,depth:1,root:8,width:5,missWin:.30,missDef:.60,noise:{p:.55,top:10}},
   medium:{ms:90,depth:1,root:8,width:5,missWin:.10,missDef:.30,noise:{p:.30,top:6}},
   hard:{ms:300,depth:3,root:10,width:7},
   extreme:{ms:800,depth:6,root:14,width:10}};
  const cfg=settings[level]||settings.medium,scale={fast:.55,balanced:1,deep:2.5}[speed]||1,budget=Math.round(cfg.ms*scale),deadline=start+budget,t=build(s);
  let nodes=0,cacheHits=0,depthDone=1,reason='탐색',timedOut=false;
  const TIME={},check=()=>{if(clock()>=deadline)throw TIME;},finish=(a)=>({a,nodes,cacheHits,ms:Math.round(clock()-start),depth:depthDone,budget,reason,timedOut});
  TT.clear();
  if(t.end){reason='종료된 판';return finish(null);}
  // The opening is solved by the positional preference, without a search delay.
  if(t.first&&s.b.every(v=>v===0)){reason='중앙 첫 수';nodes=1;return finish({type:'place',cells:[NC>>1]});}
  const direct=immediate(t);nodes++;
  const overlook=!!(direct&&cfg.missWin&&Math.random()<cfg.missWin);
  if(direct&&!overlook){reason='즉시 승리';return finish(direct);}
  let root=rank(t);
  // A human-like oversight: the winning moves are really left out of the candidates (the ranking would otherwise still pick them).
  if(overlook){const kept=root.filter(x=>{const u=apply(t,x.a),won=t.end;undo(t,u);return !won;});if(kept.length)root=kept;}
  nodes+=root.length;if(!root.length){reason='가능한 행동 없음';return finish(null);}
  let best=root[0].a;
  const threatened=!!immediate(t,-t.p,protOnly(t.lock),false),safe=[],careless=!!(cfg.missDef&&Math.random()<cfg.missDef);
  // If threatened, consider every legal defense. Otherwise screen the strongest candidates.
  const screen=careless?0:threatened?root.length:Math.min(root.length,cfg.root*2);
  for(let i=0;i<screen;i++){
   if(i&&clock()>=deadline){timedOut=true;break;}
   const x=root[i],u=apply(t,x.a);nodes++;const danger=immediate(t);undo(t,u);
   if(!danger){safe.push(x);if(safe.length>=cfg.root)break;}
  }
  // Broaden the safety check when the initially ranked candidates all lose immediately.
  if(!safe.length&&!threatened&&!careless)for(let i=screen;i<root.length;i++){
   if(clock()>=deadline){timedOut=true;break;}
   const x=root[i],u=apply(t,x.a);nodes++;const danger=immediate(t);undo(t,u);if(!danger){safe.push(x);break;}
  }
  // Human-like oversight: when careless against a real threat, play the best-ranked moves that do NOT defend it.
  if(careless&&threatened){for(let i=0;i<root.length&&i<400&&safe.length<4;i++){const x=root[i],u=apply(t,x.a),danger=!t.end&&!!immediate(t);undo(t,u);nodes++;if(danger)safe.push(x);}}
  let pool=(safe.length?safe:root).slice(0,cfg.root);best=pool[0].a;
  reason=careless?'방심':threatened&&safe.length?'승리 위협 방어':'전술 탐색';
  if(cfg.depth<=1){if(cfg.noise&&Math.random()<cfg.noise.p)best=pool[Math.floor(Math.random()*Math.min(cfg.noise.top,pool.length))].a;return finish(best);}
  if(timedOut)return finish(best);
  function store(k,d,v,flag,a,ply){if(TT.size>45000)TT.clear();const packed=v>MATE/2?v+ply:v<-MATE/2?v-ply:v;const old=TT.get(k);if(!old||d>=old.d)TT.set(k,{d,v:packed,flag,a});}
  function search(d,alpha,beta,ply){check();nodes++;if(t.end)return -MATE+ply;
   const k=stateKey(t),entry=TT.get(k),alphaStart=alpha,betaStart=beta;
   if(entry&&entry.d>=d){cacheHits++;let v=entry.v;if(v>MATE/2)v-=ply;else if(v<-MATE/2)v+=ply;
    if(entry.flag===0)return v;if(entry.flag===1)alpha=Math.max(alpha,v);else beta=Math.min(beta,v);if(alpha>=beta)return v;
   }
   const hit=immediate(t);if(hit){const v=MATE-ply-1;store(k,d,v,0,hit,ply);return v;}
   if(d<=0){const v=evaluate(t);store(k,0,v,0,null,ply);return v;}
   const cand=rank(t);if(!cand.length)return 0;
   if(entry&&entry.a){const index=cand.findIndex(x=>sameAction(x.a,entry.a));if(index>0)cand.unshift(cand.splice(index,1)[0]);}
   const threat=!!immediate(t,-t.p,protOnly(t.lock),false);let options;
   const width=Math.max(5,cfg.width-Math.floor(ply/2));
   if(threat){options=[];for(const x of cand){check();const u=apply(t,x.a);const lose=immediate(t);undo(t,u);if(!lose){options.push(x);if(options.length>=width)break;}}
    if(!options.length){const v=-MATE+ply+2;store(k,d,v,0,cand[0].a,ply);return v;}
   }else options=cand.slice(0,width);
   let vBest=-Infinity,aBest=options[0].a;
   for(const x of options){const u=apply(t,x.a);let v;
    try{v=-search(d-1,-beta,-alpha,ply+1);}finally{undo(t,u);}
    if(v>vBest){vBest=v;aBest=x.a;}alpha=Math.max(alpha,v);if(alpha>=beta)break;
   }
   store(k,d,vBest,vBest<=alphaStart?2:vBest>=betaStart?1:0,aBest,ply);return vBest;
  }
  for(let d=2;d<=cfg.depth;d++){
   let candidate=best,bestV=-Infinity,alpha=-Infinity;const scores=[];let complete=true;
   try{for(const x of pool){check();const u=apply(t,x.a);let v;try{v=-search(d-1,-Infinity,-alpha,1);}finally{undo(t,u);}scores.push({x,v});if(v>bestV){bestV=v;candidate=x.a;}alpha=Math.max(alpha,v);}}
   catch(e){if(e!==TIME)throw e;complete=false;timedOut=true;}
   if(!complete)break;best=candidate;depthDone=d;scores.sort((a,b)=>b.v-a.v);pool=scores.map(y=>y.x);if(Math.abs(bestV)>MATE/2){reason=bestV>0?'승리 수순 발견':'상대 강제 위협 대응';break;}
  }
  return finish(best);
 }
 return {win,counts,next,actions,choose,cfg:{S,K,F,NC,LOCKN},isLocked,pushLock,lockedCells,protectedCell:protCell,_:{build,setCell,apply,undo,immediate,rank,evaluate,runsOf,lineRuns}};
}
if(typeof module!=="undefined")module.exports={makeEngine};
