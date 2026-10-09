/* Nullorigo · ORIGINS generator (single source of truth, runs in the browser and in headless render)
   Token number -> seeded traits -> drawing on a 1000×1000 coordinate plane. */
var ORIGINS = (function () {
  "use strict";
  var SUPPLY = 3333, SALT = "nullorigo-origins-v2";
  var FAMILIES = [["Rose",10],["Spiral",10],["Orbits",9],["Waves",8],["Phyllotaxis",8],["Lissajous",8],["Spirograph",8],
    ["Harmonograph",7],["Rings",6],["Times Table",6],["Envelope",6],["Hilbert",4],["Sierpinski",4],["Constellation",4],["Ulam",2]];
  var INKS = [["Ivory",84],["Gold",12],["Silver",4]];
  var DENSITY = [["Sparse",25],["Balanced",55],["Dense",20]];
  var RARE = {"Hilbert":1,"Sierpinski":1,"Constellation":1,"Ulam":1,"Envelope":1};
  function xmur3(str){for(var i=0,h=1779033703^str.length;i<str.length;i++){h=Math.imul(h^str.charCodeAt(i),3432918353);h=h<<13|h>>>19}
    return function(){h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return (h^=h>>>16)>>>0}}
  function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
  function rng(key){return mulberry(xmur3(key)())}
  function wpick(r,t){var tot=0,i;for(i=0;i<t.length;i++)tot+=t[i][1];var x=r()*tot;for(i=0;i<t.length;i++){x-=t[i][1];if(x<0)return t[i][0]}return t[t.length-1][0]}
  function choice(r,a){return a[Math.floor(r()*a.length)]}
  function rint(r,a,b){return a+Math.floor(r()*(b-a+1))}
  function rf(r,a,b,dp){var v=a+r()*(b-a);var m=Math.pow(10,dp||2);return Math.round(v*m)/m}
  function gcd(a,b){return b?gcd(b,a%b):a}

  function traits(no, attempt){
    var r=rng(SALT+":"+no+":"+(attempt||0));
    var fam=wpick(r,FAMILIES),ink=wpick(r,INKS),dens=wpick(r,DENSITY);
    var rot=choice(r,[0,0,0,15,30,45,60,90]);
    var dm={Sparse:.6,Balanced:1,Dense:1.6}[dens];
    var p={family:fam,ink:ink,density:dens,rotation:rot};
    switch(fam){
      case "Rose": var nd=choice(r,[[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[9,1],[5,2],[7,2],[3,2],[5,4],[7,3],[9,4],[11,6]]);
        p.n=nd[0];p.d=nd[1];p.amp=rf(r,8.2,9.6,1);p.figure=nd[1]>1?nd[0]+"/"+nd[1]+" petals":((nd[0]%2?nd[0]:2*nd[0])+" petals");break;
      case "Spiral": p.a=rf(r,.42,.78);p.arms=choice(r,[1,1,2,3]);p.cw=r()<.5;p.step=Math.round(.045/dm*10000)/10000;p.figure=p.arms+(p.arms>1?" arms":" arm");break;
      case "Orbits": p.rings=rint(r,3,7);p.sats=[];p.phase=[];for(var i=0;i<p.rings;i++)p.sats.push(rint(r,1,dens==="Dense"?5:3));for(i=0;i<12;i++)p.phase.push(rf(r,0,6.283,3));p.figure=p.rings+" rings";break;
      case "Waves": p.lines=Math.round(rint(r,5,9)*dm);p.freq=rf(r,.5,1.2);p.decay=rf(r,.12,.3);p.shift=rf(r,.25,.6);p.figure=p.lines+" lines";break;
      case "Phyllotaxis": p.count=Math.round(rint(r,260,380)*dm);p.angle=choice(r,[137.508,137.508,137.3,137.6,139,132]);p.figure=p.count+" seeds";break;
      case "Lissajous": var ab=choice(r,[[1,2],[2,3],[3,4],[3,2],[4,5],[5,6],[3,5],[5,4]]);p.a=ab[0];p.b=ab[1];p.phase=choice(r,[0,.25,.5,.785,1,1.571]);p.figure=p.a+":"+p.b;break;
      case "Spirograph": var R=rint(r,7,13),rr=rint(r,2,6);while(gcd(R,rr)===rr||rr>=R)rr=rint(r,2,6);p.R=R;p.r=rr;p.dd=rf(r,.5,1.6);p.figure=R+":"+rr;break;
      case "Harmonograph": p.f1=choice(r,[2,3,3,4]);p.f2=choice(r,[2,3,4,5]);p.det=rf(r,.002,.012,3);p.damp=rf(r,.005,.011,4);p.p1=rf(r,0,3.14);p.p2=rf(r,0,3.14);p.figure=p.f1+":"+p.f2;break;
      case "Rings": p.rings=rint(r,6,11);p.fall=rf(r,.05,.11,3);p.seed=rint(r,0,1e6);p.figure=p.rings+"";break;
      case "Times Table": p.pts=choice(r,[100,120,150,180,200]);p.mult=choice(r,[2,3,4,5,7,9,11,21,34,51,2.5,3.5]);p.figure="× "+p.mult;break;
      case "Envelope": p.lines=Math.round(rint(r,8,13)*(dens==="Dense"?1.2:1));p.quads=choice(r,["all","all","opposite","single","nested"]);p.figure=p.quads;break;
      case "Hilbert": p.order=choice(r,[3,3,4]);p.figure="order "+p.order;break;
      case "Sierpinski": var v=choice(r,[[3,.5],[3,.5],[4,.4],[5,.382],[6,.333]]);p.v=v[0];p.ratio=v[1];p.seed=rint(r,0,1e6);p.figure=v[0]+" vertices";break;
      case "Constellation": p.stars=Math.round(rint(r,9,14)*dm);p.closed=r()<.3;p.seed=rint(r,0,1e6);p.figure=p.stars+" stars";break;
      case "Ulam": p.show=choice(r,["primes","primes","twin primes","squares"]);p.figure=p.show;break;
    }
    var g=r();p.gold=g<.01?[0,0]:[rint(r,-8,8),rint(r,-8,8)];
    p.special=(p.gold[0]===0&&p.gold[1]===0)?"Origin":((ink==="Gold"&&RARE[fam])?"Gold":"None");
    return p}
  function sig(p){var c={};for(var k in p)if(k!=="phase")c[k]=p[k];return JSON.stringify(c)}
  var ALL=null;
  function all(){if(ALL)return ALL;ALL=[null];var seen={};
    for(var no=1;no<=SUPPLY;no++){var a=0;while(true){var p=traits(no,a),s=sig(p);if(!seen[s]){seen[s]=1;ALL.push(p);break}a++}}return ALL}

  /* ---------------- drawing ---------------- */
  var BG=[9,9,10],IV=[240,236,226],GOLD=[222,184,108],SILVER=[206,212,222],C=500;
  function mix(a,b,t){return "rgb("+Math.round(a[0]+(b[0]-a[0])*t)+","+Math.round(a[1]+(b[1]-a[1])*t)+","+Math.round(a[2]+(b[2]-a[2])*t)+")"}
  function rgb(a){return "rgb("+a[0]+","+a[1]+","+a[2]+")"}
  var FONT='"Jost","Futura","Century Gothic",sans-serif';
  function isPrime(n){if(n<2)return false;for(var d=2;d*d<=n;d++)if(n%d===0)return false;return true}

  function draw(ctx, no, size, opts){
    opts=opts||{};var p=all()[no];var sc=size/1000;
    ctx.save();ctx.setTransform(sc*(opts.dpr||1),0,0,sc*(opts.dpr||1),0,0);
    var ink=p.ink==="Gold"?GOLD:p.ink==="Silver"?SILVER:IV;
    var px=1/(sc*(opts.dpr||1));function LW(u){return Math.max(u,px*.9)}
    // background with vignette
    if(!opts.noBg){ctx.fillStyle=rgb(BG);ctx.fillRect(0,0,1000,1000);
    var g=ctx.createRadialGradient(500,500,120,500,500,760);g.addColorStop(0,"rgba(0,0,0,0)");g.addColorStop(1,"rgba(0,0,0,.55)");ctx.fillStyle=g;ctx.fillRect(0,0,1000,1000)}
    var st=40,rot=p.rotation*Math.PI/180,fit=(!rot||/Rose|Spiral|Phyllotaxis|Orbits|Times Table|Spirograph/.test(p.family))?1:1/(Math.abs(Math.cos(rot))+Math.abs(Math.sin(rot)));
    function P(gx,gy,norot){if(rot&&!norot){var c=Math.cos(rot),s=Math.sin(rot),x=(gx*c-gy*s)*fit,y=(gx*s+gy*c)*fit;gx=x;gy=y}return[C+gx*st,C-gy*st]}
    function sq(x,y,r,col){ctx.fillStyle=col;ctx.fillRect(x-r,y-r,2*r,2*r)}
    function path(pts,col,w){ctx.strokeStyle=col;ctx.lineWidth=LW(w||1.1);ctx.lineJoin="round";ctx.beginPath();for(var i=0;i<pts.length;i++){if(i)ctx.lineTo(pts[i][0],pts[i][1]);else ctx.moveTo(pts[i][0],pts[i][1])}ctx.stroke()}
    function seg(a,b,col,w){ctx.strokeStyle=col;ctx.lineWidth=LW(w||1);ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke()}
    // plane
    if(!opts.noPlane){var gd=mix(BG,IV,.08);for(var i=-20;i<=20;i++)for(var j=-20;j<=20;j++){var x=C+i*st,y=C+j*st;if(x>70&&x<930&&y>110&&y<890){ctx.fillStyle=gd;ctx.fillRect(x-.9,y-.9,1.8,1.8)}}
    seg([60,C],[940,C],mix(BG,IV,.2),1);seg([C,100],[C,900],mix(BG,IV,.2),1);
    var tk=mix(BG,IV,.34);for(var k=1;k<12;k++)for(var sgn=-1;sgn<=1;sgn+=2){var v=C+sgn*k*st,L=k%5===0?6:3.5;if(v>60&&v<940)seg([v,C-L],[v,C+L],tk,1);if(v>100&&v<900)seg([C-L,v],[C+L,v],tk,1)}}
    ctx.save();ctx.beginPath();ctx.rect(52,96,896,808);ctx.clip();
    var dim=mix(BG,ink,.62),inkc=rgb(ink),name=p.family,formula="";
    var f=p.family,r,pts,t;
    if(f==="Rose"){var kk=p.n/p.d,turns=p.d*((p.n%2&&p.d%2)?1:2);pts=[];for(i=0;i<=3000;i++){t=i/3000*Math.PI*turns;var rr=p.amp*Math.cos(kk*t);pts.push(P(rr*Math.cos(t),rr*Math.sin(t)))}
      path(pts,dim);for(i=0;i<=3000;i+=75)sq(pts[i][0],pts[i][1],2.4,inkc);formula="r = "+p.amp+" cos("+(p.d>1?p.n+"/"+p.d:p.n)+" t)"}
    else if(f==="Spiral"){var sg=p.cw?-1:1,tmax=10.2/p.a;for(var m=0;m<p.arms;m++){pts=[];for(t=0;t<tmax;t+=p.step){var ang=sg*t+m*2*Math.PI/p.arms;pts.push(P(p.a*t*Math.cos(ang),p.a*t*Math.sin(ang)))}
      path(pts,dim);for(i=0;i<pts.length;i+=14)sq(pts[i][0],pts[i][1],2.5,inkc)}formula="r = "+p.a+" t"}
    else if(f==="Orbits"){for(i=0;i<p.rings;i++){var R=1.6+i*(8/Math.max(1,p.rings-1));ctx.strokeStyle=mix(BG,ink,i%2?.5:.34);ctx.lineWidth=LW(1);ctx.beginPath();ctx.arc(C,C,R*st,0,7);ctx.stroke();
      for(m=0;m<p.sats[i];m++){t=p.phase[(i+m)%12]+m*2.1;var q=P(R*Math.cos(t),R*Math.sin(t),true);sq(q[0],q[1],m===0?3.2:2.4,inkc)}}sq(C,C,7,inkc);formula="x² + y² = r²"}
    else if(f==="Waves"){for(k=0;k<p.lines;k++){pts=[];var A=8.4*Math.exp(-k*p.decay),ph=k*p.shift;for(i=0;i<=880;i++){var gx=-11+i/880*22;pts.push(P(gx,A*Math.sin(gx*p.freq+ph)*Math.exp(-Math.abs(gx)*.06)))}
      path(pts,mix(BG,ink,Math.max(.22,.78-k*.07)),1)}for(gx=-10;gx<=10;gx++){q=P(gx,8.4*Math.sin(gx*p.freq)*Math.exp(-Math.abs(gx)*.06));sq(q[0],q[1],2.5,inkc)}formula="y = A sin("+p.freq+"x + p)"}
    else if(f==="Phyllotaxis"){var ga=p.angle*Math.PI/180,scl=9.6/Math.sqrt(p.count);for(i=1;i<p.count;i++){var rr2=scl*Math.sqrt(i);t=i*ga;q=P(rr2*Math.cos(t),rr2*Math.sin(t));sq(q[0],q[1],1.3+2.3*(i/p.count),inkc)}sq(C,C,5,inkc);formula="angle = n × "+p.angle+"°"}
    else if(f==="Lissajous"){pts=[];for(i=0;i<=3200;i++){t=i/3200*2*Math.PI;pts.push(P(9*Math.sin(p.a*t+p.phase),9*Math.sin(p.b*t)))}path(pts,dim,1);for(i=0;i<3200;i+=100)sq(pts[i][0],pts[i][1],2.4,inkc);formula="x = 9 sin "+p.a+"t,  y = 9 sin "+p.b+"t"}
    else if(f==="Spirograph"){var Rr=p.R-p.r,d=p.r*p.dd,turns2=p.r/gcd(p.R,p.r),scale=9.4/(Rr+d);pts=[];var N=5000;for(i=0;i<=N;i++){t=i/N*2*Math.PI*turns2;pts.push(P((Rr*Math.cos(t)+d*Math.cos(Rr/p.r*t))*scale,(Rr*Math.sin(t)-d*Math.sin(Rr/p.r*t))*scale))}
      path(pts,dim,.9);for(i=0;i<=N;i+=Math.round(N/(turns2*12)))sq(pts[i][0],pts[i][1],2.2,inkc);formula="R = "+p.R+",  r = "+p.r}
    else if(f==="Harmonograph"){pts=[];var mx=0,raw=[];for(i=0;i<=7000;i++){t=i*.05;var e=Math.exp(-p.damp*t),x2=Math.sin(p.f1*t+p.p1)*e+Math.sin((p.f2+p.det)*t)*e*.6,y2=Math.sin((p.f1+p.det)*t)*e+Math.sin(p.f2*t+p.p2)*e*.6;raw.push([x2,y2]);mx=Math.max(mx,Math.abs(x2),Math.abs(y2))}
      for(i=0;i<raw.length;i++)pts.push(P(raw[i][0]/mx*9.2,raw[i][1]/mx*9.2));path(pts,mix(BG,ink,.55),.7);for(i=0;i<raw.length;i+=350)sq(pts[i][0],pts[i][1],2.2,inkc);formula="f = "+p.f1+" : "+p.f2}
    else if(f==="Rings"){r=rng("rings"+p.seed);for(k=1;k<=p.rings;k++){var a1=P(-k-.5,k+.5,true),b1=P(k+.5,-k-.5,true);ctx.strokeStyle=mix(BG,ink,k%5?.12:.26);ctx.lineWidth=LW(1);ctx.strokeRect(a1[0],a1[1],b1[0]-a1[0],b1[1]-a1[1])}
      for(gx=-p.rings;gx<=p.rings;gx++)for(var gy=-p.rings;gy<=p.rings;gy++){k=Math.max(Math.abs(gx),Math.abs(gy));if(!k)continue;q=P(gx,gy,true);if(r()<.92-k*p.fall)sq(q[0],q[1],3,inkc);else{ctx.strokeStyle=mix(BG,ink,.35);ctx.lineWidth=LW(1);ctx.strokeRect(q[0]-3,q[1]-3,6,6)}}sq(C,C,6,inkc);formula="max(|x|, |y|) = k"}
    else if(f==="Times Table"){var NP=p.pts,RA=9.2,pp=[];for(i=0;i<NP;i++){t=i/NP*2*Math.PI+Math.PI/2;pp.push(P(RA*Math.cos(t),RA*Math.sin(t)))}
      ctx.strokeStyle=mix(BG,ink,.42);ctx.lineWidth=LW(.7);ctx.beginPath();for(i=0;i<NP;i++){var jj=Math.floor(i*p.mult)%NP;ctx.moveTo(pp[i][0],pp[i][1]);ctx.lineTo(pp[jj][0],pp[jj][1])}ctx.stroke();
      ctx.strokeStyle=mix(BG,ink,.3);ctx.lineWidth=LW(1);ctx.beginPath();ctx.arc(C,C,RA*st,0,7);ctx.stroke();for(i=0;i<NP;i+=Math.max(1,Math.round(NP/40)))sq(pp[i][0],pp[i][1],2,inkc);formula="i → "+p.mult+" · i  (mod "+NP+")"}
    else if(f==="Envelope"){var quads={all:[[1,1],[-1,1],[-1,-1],[1,-1]],opposite:[[1,1],[-1,-1]],single:[[1,1]],nested:[[1,1],[-1,1],[-1,-1],[1,-1]]}[p.quads],scales=p.quads==="nested"?[10,5]:[10];
      scales.forEach(function(S2){quads.forEach(function(qd,qi){for(var i2=0;i2<=p.lines;i2++)seg(P(qd[0]*i2*S2/p.lines,0),P(0,qd[1]*(p.lines-i2)*S2/p.lines),mix(BG,ink,qi%2?.42:.58),1);
        for(i2=0;i2<=p.lines;i2++){var a2=P(qd[0]*i2*S2/p.lines,0),b2=P(0,qd[1]*i2*S2/p.lines);sq(a2[0],a2[1],2.1,inkc);sq(b2[0],b2[1],2.1,inkc)}})});formula="x/a + y/("+p.lines+"−a) = 1"}
    else if(f==="Hilbert"){var n2=1<<p.order,spc=p.order===3?2:1,off=p.order===3?-7:-8;pts=[];
      for(i=0;i<n2*n2;i++){var xy=d2xy(n2,i);pts.push(P(off+xy[0]*spc,off+xy[1]*spc))}path(pts,dim,1.1);for(i=0;i<pts.length;i++)sq(pts[i][0],pts[i][1],p.order===3?2.8:2,inkc);formula=n2*n2+" points, one line"}
    else if(f==="Sierpinski"){r=rng("sier"+p.seed);var vs=[];for(i=0;i<p.v;i++){t=i/p.v*2*Math.PI+Math.PI/2;vs.push([9.3*Math.cos(t),9.3*Math.sin(t)])}var cx2=0,cy2=0,last=-1;ctx.fillStyle=mix(BG,ink,.85);
      for(i=0;i<9000;i++){var vi=Math.floor(r()*p.v);if(p.v===4&&vi===last)continue;last=vi;cx2+= (vs[vi][0]-cx2)*(1-p.ratio);cy2+=(vs[vi][1]-cy2)*(1-p.ratio);if(i>20){q=P(cx2,cy2);ctx.fillRect(q[0]-.9,q[1]-.9,1.8,1.8)}}
      vs.forEach(function(vv){var qq=P(vv[0],vv[1]);sq(qq[0],qq[1],3.4,inkc)});formula="ratio "+p.ratio}
    else if(f==="Constellation"){r=rng("const"+p.seed);var ps=[[0,0]];while(ps.length<p.stars){var cand=[rint(r,-9,9),rint(r,-9,9)],ok=true;for(i=0;i<ps.length;i++)if(Math.abs(cand[0]-ps[i][0])+Math.abs(cand[1]-ps[i][1])<2){ok=false;break}if(ok)ps.push(cand)}
      if(p.closed){ps.sort(function(a,b){return Math.atan2(a[1],a[0])-Math.atan2(b[1],b[0])});for(i=0;i<ps.length;i++)seg(P(ps[i][0],ps[i][1],true),P(ps[(i+1)%ps.length][0],ps[(i+1)%ps.length][1],true),dim,1.2)}
      else{var inT=[ps[0]],rest=ps.slice(1);while(rest.length){var best=null,bd=1e9;inT.forEach(function(a){rest.forEach(function(b){var dd2=Math.hypot(a[0]-b[0],a[1]-b[1]);if(dd2<bd){bd=dd2;best=[a,b]}})});seg(P(best[0][0],best[0][1],true),P(best[1][0],best[1][1],true),dim,1.2);inT.push(best[1]);rest.splice(rest.indexOf(best[1]),1)}}
      ps.forEach(function(s3){var qq=P(s3[0],s3[1],true);sq(qq[0],qq[1],4,inkc)});formula=p.closed?"closed loop":ps.length+" stars · "+(ps.length-1)+" lines"}
    else if(f==="Ulam"){var st0=st;st=26;var x3=0,y3=0,dx=1,dy=0,sl=1,up=[[0,0]];while(up.length<35*35){for(var h=0;h<2;h++){for(var s4=0;s4<sl;s4++){x3+=dx;y3+=dy;up.push([x3,y3])}var tmp=dx;dx=-dy;dy=tmp}sl++}
      path(up.slice(0,170).map(function(a){return P(a[0],a[1],true)}),mix(BG,ink,.22),.8);
      for(i=0;i<up.length;i++){var a4=up[i][0],b4=up[i][1];if(Math.abs(a4)>16||Math.abs(b4)>14)continue;var nn=i+1,lit=p.show==="primes"?isPrime(nn):p.show==="twin primes"?(isPrime(nn)&&(isPrime(nn+2)||isPrime(nn-2))):(Math.round(Math.sqrt(nn))*Math.round(Math.sqrt(nn))===nn);
        if(lit){q=P(a4,b4,true);sq(q[0],q[1],3.3,inkc)}}st=st0;formula=p.show+" on the square spiral"}
    ctx.restore();
    // golden point
    var gp=P(p.gold[0],p.gold[1],true);
    if(p.gold[0]||p.gold[1]){ctx.strokeStyle=mix(BG,IV,.45);ctx.lineWidth=LW(1);ctx.setLineDash([6,6]);ctx.beginPath();ctx.moveTo(gp[0],gp[1]);ctx.lineTo(gp[0],C);ctx.moveTo(gp[0],gp[1]);ctx.lineTo(C,gp[1]);ctx.stroke();ctx.setLineDash([])}
    sq(gp[0],gp[1],6,rgb(GOLD));
    ctx.font="300 15px "+FONT;ctx.fillStyle=mix(BG,IV,.8);var right=gp[0]>=C;ctx.textAlign=right?"left":"right";ctx.textBaseline="alphabetic";
    ctx.fillText("("+String(p.gold[0]).replace("-","−")+", "+String(p.gold[1]).replace("-","−")+")",gp[0]+(right?14:-14),gp[1]-10);
    // frame
    if(!opts.noFrame){var mu=mix(BG,IV,.58);ctx.strokeStyle=mix(BG,IV,.22);ctx.lineWidth=LW(1);ctx.strokeRect(34,34,932,932);
      ctx.fillStyle=mu;ctx.font="400 17px "+FONT;ctx.textAlign="left";ctx.fillText("O R I G I N S",60,76);ctx.textAlign="right";ctx.fillText(("000"+no).slice(-4),940,76);
      ctx.font="300 17px "+FONT;ctx.textAlign="left";ctx.fillText((p.family+" · "+p.figure).toUpperCase(),60,944);
      ctx.font="300 15px "+FONT;ctx.textAlign="right";ctx.fillText(formula,940,944);
      ctx.font="300 17px "+FONT;ctx.textAlign="center";ctx.fillStyle=mix(BG,IV,.38);ctx.fillText(no+" / "+SUPPLY,500,944)}
    if(opts.grain){var w=ctx.canvas.width,hh=ctx.canvas.height;ctx.setTransform(1,0,0,1,0,0);var im=ctx.getImageData(0,0,w,hh),dt=im.data,rg=rng("grain"+no);for(i=0;i<dt.length;i+=4){var nz=(rg()+rg()+rg()-1.5)*7;dt[i]+=nz;dt[i+1]+=nz;dt[i+2]+=nz}ctx.putImageData(im,0,0)}
    ctx.restore()}
  function d2xy(n,d){var rx,ry,s,t=d,x=0,y=0;for(s=1;s<n;s*=2){rx=1&(t/2);ry=1&(t^rx);if(ry===0){if(rx===1){x=s-1-x;y=s-1-y}var tt=x;x=y;y=tt}x+=s*rx;y+=s*ry;t=Math.floor(t/4)}return[x,y]}
  function metadata(no,base){var p=all()[no];var a=[{trait_type:"Family",value:p.family},{trait_type:"Figure",value:p.figure},{trait_type:"Ink",value:p.ink},{trait_type:"Density",value:p.density},{trait_type:"Rotation",value:p.rotation+"°"},{trait_type:"Golden point",value:"("+p.gold[0]+", "+p.gold[1]+")"}];
    if(p.special!=="None")a.push({trait_type:"Special",value:p.special});return{name:"Origins #"+("000"+no).slice(-4),description:"Origins by Nullorigo. Everything starts at (0,0).",image:(base||"ipfs://CID/")+("000"+no).slice(-4)+".png",attributes:a}}
  return{SUPPLY:SUPPLY,FAMILIES:FAMILIES,all:all,draw:draw,metadata:metadata}
})();
if(typeof module!=="undefined")module.exports=ORIGINS;
