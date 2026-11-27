/* ===== 3Dの人形で深度ポーズを作る（v91〜v93） =====
   ・人形：models/female.glb・male.glb（Quaternius「Universal Base Characters」、CC0。models/LICENSE-models.txt）
   ・three.js 0.160.0 を jsdelivr から読み込む（index.html の importmap。sw.js が端末にしまうので、2回目からはネットなしで動く）
   ・関節は「前後・左右・ひねり」の角度で覚える（ang[骨]=[前後,左右,ひねり]、度）。ふつうに曲がる範囲（LIM）より10度先で止める。
       向きの決まり：前後の＋は前へ（ひざは－で曲がる）、左右の＋は体の外へ（腕・脚を広げる）、胴・首は＋で左へ傾く。
       骨の回り方 ＝ 前後の回り × 左右の回り ×（二の腕は 腕を下ろす回り）× 休めの姿勢 × ひねり（前後・左右の軸は親の骨といっしょに動く）。
       二の腕は、腕を下ろした形が 0°（前後＝前へ振る、左右＝横へ広げる。T の形は 左右 80°）。
   ・関節を選ぶと、赤（前後）・緑（左右）・青（ひねり）の輪が出る。輪を指でなぞると、その向きに回る。
   ・人物は2人まで（figs）。人物ごとに 人形・関節の角度・位置（x,y,z、m）・大きさ。
     位置は数字か ▲▼ で動かし、「地面につける」で体のいちばん低い所を床（高さ0）に合わせる。
   ・変更は直近3回まで戻せる（undo）。
   ・画面を長押し（0.45秒）してからなぞると、カメラが平行に動く（向きは変わらない）。
   ・上半身（肩・二の腕・ひじ・手首）・下半身（もも・ひざ・足首）を、左右どちらかに合わせて対称にできる（角度の決まりが左右で鏡写しなので、角度をそのまま写す）。
   ・最初からあるポーズ（PRESETS）。呼び出すと、名前・タグ・カテゴリも覚え、保存するときに部品に入れる（onSave の3つめ）。
   ・深度の画像は、手前ほど白、奥ほど黒（背景は透明）。800×912 の PNG。
   ・open3D({pose,onSave,lib}) で開く。
       pose={figs:[{model,a:{骨:[前後,左右,ひねり]},pos:[x,y,z],scale}],cam:{p,t}}（v92 の pos:[x,z] も読める）
       onSave(blob,pose,meta)、meta={name,tags,cat}（最初からあるポーズを使ったとき）。lib は保存したポーズの入れ物（list・save・del）。 */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {clone as cloneSkel} from 'three/addons/utils/SkeletonUtils.js';

const OW=800,OH=912,D2R=Math.PI/180,MARGIN=10,UNDO=3;
/* 選べる関節（骨・呼び名・種類）。左右は人形から見た左右。種類：torso 胴・首、arm 腕、leg 脚、foot 足首 */
const JOINTS=[['pelvis','腰（体ぜんたい）','torso'],['spine_01','おなか','torso'],['spine_03','胸','torso'],['neck_01','首','torso'],['Head','頭','torso'],
  ['clavicle_l','左肩','arm'],['upperarm_l','左の二の腕','arm'],['lowerarm_l','左ひじ','arm'],['hand_l','左手首','arm'],
  ['clavicle_r','右肩','arm'],['upperarm_r','右の二の腕','arm'],['lowerarm_r','右ひじ','arm'],['hand_r','右手首','arm'],
  ['thigh_l','左もも','leg'],['calf_l','左ひざ','leg'],['foot_l','左足首','foot'],['thigh_r','右もも','leg'],['calf_r','右ひざ','leg'],['foot_r','右足首','foot']];
const CHILD={pelvis:'spine_01',spine_01:'spine_02',spine_03:'neck_01',neck_01:'Head',clavicle_l:'upperarm_l',upperarm_l:'lowerarm_l',lowerarm_l:'hand_l',hand_l:'middle_01_l',
  clavicle_r:'upperarm_r',upperarm_r:'lowerarm_r',lowerarm_r:'hand_r',hand_r:'middle_01_r',thigh_l:'calf_l',calf_l:'foot_l',foot_l:'ball_l',thigh_r:'calf_r',calf_r:'foot_r',foot_r:'ball_r'};
/* ふつうに曲がる範囲（度）[前後, 左右, ひねり]。休めの姿勢からの角度（二の腕だけは、腕を下ろした形が 0°。横に広げると 左右 80°）。ここから10度先で止める */
const LIM={pelvis:[[-180,180],[-180,180],[-180,180]],spine_01:[[-30,50],[-35,35],[-35,35]],spine_03:[[-25,35],[-25,25],[-30,30]],neck_01:[[-45,50],[-35,35],[-70,70]],Head:[[-30,30],[-25,25],[-20,20]],
  clavicle:[[-20,20],[-15,35],[-10,10]],upperarm:[[-60,180],[-20,180],[-90,90]],lowerarm:[[0,150],[-5,5],[-80,80]],hand:[[-80,80],[-25,35],[-10,10]],
  thigh:[[-30,125],[-30,45],[-45,45]],calf:[[-150,0],[-5,5],[-20,20]],foot:[[-80,30],[-30,30],[-20,20]]};
const limOf=b=>LIM[b]||LIM[b.replace(/_[lr]$/,'')];
const AXN=['前後','左右','ひねり'],AXC=[0xe03131,0x2f9e44,0x1c7ed6];
const MODELS={female:'女性',male:'男性'};
/* 最初からあるポーズ。a は関節の角度 [前後,左右,ひねり]。tags はプロンプトに入るタグ、cat は深度ポーズのカテゴリ、view は呼び出したときのカメラ */
const PRESETS=[
  {name:'うつ伏せ・腕枕',tags:'lying, on stomach, head on arms',cat:'lie',view:'side',pose:{figs:[{a:{pelvis:[90,0,0],thigh_l:[0,5,0],thigh_r:[0,5,0],foot_l:[-40,0,0],foot_r:[-40,0,0],neck_01:[-30,0,0],Head:[-15,0,0],upperarm_l:[80,-10,0],upperarm_r:[80,-10,0],lowerarm_l:[110,0,0],lowerarm_r:[110,0,0]}}]}},
  {name:'しゃがみ・膝に手',tags:'squatting, hands on own knees',cat:'squat',view:'side',pose:{figs:[{a:{spine_01:[30,0,0],spine_03:[15,0,0],neck_01:[-25,0,0],Head:[-10,0,0],upperarm_l:[20,15,0],upperarm_r:[20,15,0],lowerarm_l:[110,0,0],lowerarm_r:[110,0,0],thigh_l:[110,15,0],thigh_r:[110,15,0],calf_l:[-140,0,0],calf_r:[-140,0,0],foot_l:[30,0,0],foot_r:[30,0,0]}}]}},
  {name:'前かがみ・膝に手',tags:'leaning forward, bent over, hands on own knees',cat:'lean',view:'side',pose:{figs:[{a:{pelvis:[60,0,0],thigh_l:[85,5,0],thigh_r:[85,5,0],calf_l:[-45,0,0],calf_r:[-45,0,0],foot_l:[20,0,0],foot_r:[20,0,0],spine_01:[15,0,0],spine_03:[5,0,0],neck_01:[-40,0,0],Head:[-15,0,0],upperarm_l:[45,-10,0],upperarm_r:[45,-10,0],lowerarm_l:[5,0,0],lowerarm_r:[5,0,0]}}]}},
  {name:'女の子座り・両手を腿に',tags:'wariza, sitting, hands on own thighs',cat:'wariza',view:'front',pose:{figs:[{a:{spine_01:[5,0,0],neck_01:[5,0,0],upperarm_l:[25,-10,0],upperarm_r:[25,-10,0],lowerarm_l:[5,0,0],lowerarm_r:[5,0,0],thigh_l:[65,0,45],thigh_r:[65,0,45],calf_l:[-140,0,0],calf_r:[-140,0,0],foot_l:[-80,0,0],foot_r:[-80,0,0]}}]}},
  {name:'四つん這い',tags:'all fours',cat:'other',view:'side',pose:{figs:[{a:{pelvis:[78,0,0],thigh_l:[78,5,0],thigh_r:[78,5,0],calf_l:[-90,0,0],calf_r:[-90,0,0],foot_l:[-60,0,0],foot_r:[-60,0,0],neck_01:[-40,0,0],Head:[-20,0,0],upperarm_l:[73,-3,0],upperarm_r:[73,-3,0],lowerarm_l:[10,0,0],lowerarm_r:[10,0,0],hand_l:[80,0,0],hand_r:[80,0,0]}}]}}];
const gltfCache={},PRE_IMG={};/* PRE_IMG：最初からあるポーズの絵（作ったら覚えておく） */
const loadModel=name=>gltfCache[name]||(gltfCache[name]=new Promise((res,rej)=>new GLTFLoader().load(new URL('./models/'+name+'.glb',location.href).href,res,undefined,e=>{delete gltfCache[name];rej(e);})));
const V=()=>new THREE.Vector3(),Q=()=>new THREE.Quaternion();
const esc=t=>String(t==null?'':t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const hex=c=>'#'+c.toString(16).padStart(6,'0');

export async function open3D(o){o=o||{};
  document.querySelectorAll('#p3d').forEach(x=>x.remove());
  const el=document.createElement('div');el.id='p3d';
  el.innerHTML=`<div class="p3top"><button type="button" class="p3x" data-a="close" aria-label="閉じる">✕</button><b>3Dで深度ポーズを作る</b>
      <button type="button" class="p3lb" data-a="undo">↶ 戻す<i class="p3un"></i></button><button type="button" class="p3lb" data-a="lib">📂 ポーズ</button></div>
    <div class="p3stage"><canvas class="p3cv"></canvas><div class="p3msg">人形を読み込んでいます…</div>
      <div class="p3view">${[['front','正面'],['side','横'],['back','後ろ'],['above','上から'],['below','下から']].map(([k,l])=>`<button type="button" data-view="${k}">${l}</button>`).join('')}</div>
      <div class="p3zoom"><button type="button" data-zoom="-1" aria-label="小さく">－</button><button type="button" data-zoom="1" aria-label="大きく">＋</button></div>
      <button type="button" class="p3look" data-a="look">深度で見る</button></div>
    <div class="p3tool">
      <div class="p3figs"></div>
      <div class="p3joint"><span class="p3jn">関節：<b>（体の点をタップ）</b></span> <span class="p3ang"></span>
        <div class="p3leg"><span style="color:${hex(AXC[0])}">● 前後</span><span style="color:${hex(AXC[1])}">● 左右</span><span style="color:${hex(AXC[2])}">● ひねり</span><span>輪を指でなぞると回ります</span></div>
        <div class="p3row"><button type="button" data-step="-5">－5°</button><button type="button" data-step="5">＋5°</button><button type="button" data-a="resetJ">この関節を戻す</button><button type="button" data-a="armsDown">腕を下ろす</button><button type="button" data-a="resetAll">この人物を戻す</button></div>
        <div class="p3sym"><span>左右対称</span><span class="p3sg">上半身<button type="button" data-sym="up" data-from="l">左→右</button><button type="button" data-sym="up" data-from="r">右→左</button></span><span class="p3sg">下半身<button type="button" data-sym="low" data-from="l">左→右</button><button type="button" data-sym="low" data-from="r">右→左</button></span></div></div>
      <div class="p3pos"><div class="p3ph"><b>人物の位置</b><span class="p3u">（cm）</span><span class="p3st">大きさ<button type="button" data-size="-1" aria-label="小さく">－</button><b class="p3sz"></b><button type="button" data-size="1" aria-label="大きく">＋</button></span></div>
        ${[['x','左右'],['y','上下'],['z','奥・手前']].map(([k,l],i)=>`<div class="p3pr"><span>${l}<small>（${k.toUpperCase()}）</small></span><button type="button" data-mv="${i}" data-d="-1" aria-label="${l}を減らす">▼</button><input type="number" inputmode="decimal" step="1" data-pv="${i}" aria-label="${l}（cm）"><button type="button" data-mv="${i}" data-d="1" aria-label="${l}を増やす">▲</button></div>`).join('')}
        <div class="p3row"><button type="button" class="btn sm" data-a="ground">⬇ 地面につける</button></div>
        <p class="p3hint" style="margin:4px 0 0">▲▼ で 5cm ずつ動きます。数字を入れて動かすこともできます。左右は画面の右が＋（正面から見たとき）、上下は上が＋、奥・手前は手前が＋です。動かしたあと「地面につける」を押すと、体のいちばん低い所が地面につきます。</p></div>
      <p class="p3hint">体の点をタップすると、その関節に輪が出ます。輪を指でなぞると回ります（ふつうに曲がる範囲より10°先で止まります）。左右は人形から見た左右です。何もない所をなぞるとカメラが回り、長押ししてからなぞるとカメラが平行に動きます。2本の指で拡大・移動です。「左右対称」の「左→右」は、人形の左側の形を右側に写します。「↶ 戻す」で、直近3回までの変更を戻せます。</p>
      <div class="p3row p3save"><button type="button" class="btn" data-a="save">深度ポーズとして保存</button><button type="button" class="btn ghost" data-a="png">PNG を保存</button></div>
    </div>
    <div class="p3lib" hidden><div class="p3libin"><div class="p3top"><b>保存したポーズ</b><button type="button" class="p3x" data-a="libClose" aria-label="閉じる">✕</button></div>
      <div class="p3row" style="padding:0 10px"><input class="p3nm" placeholder="ポーズの名前（例：2人で並んで立つ）"><button type="button" class="btn sm" data-a="libSave">今のポーズを保存</button></div>
      <p class="p3hint" style="padding:0 10px">呼び出すと、人物・人形・関節・位置・大きさ・カメラが、保存したときと同じになります。最初からあるポーズは、深度ポーズとして保存するときに、名前・タグ・カテゴリも入ります。</p><div class="p3list"></div>
      <div class="p3top" style="position:static"><b>最初からあるポーズ</b></div><div class="p3pre"></div></div></div>`;
  document.body.appendChild(el);history.pushState({p3d:1},'');
  const $=s=>el.querySelector(s),$$=s=>[...el.querySelectorAll(s)];
  const cv=$('.p3cv'),stage=$('.p3stage'),msg=$('.p3msg');
  const toast3=t=>{if(window.toast)window.toast(t);};
  const renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
  const scene=new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff,0x555566,1.6));const dl=new THREE.DirectionalLight(0xffffff,1.6);dl.position.set(1.5,3,2.5);scene.add(dl);
  const grid=new THREE.GridHelper(6,24,0x9aa3b5,0xc9ced8);scene.add(grid);
  const cam=new THREE.PerspectiveCamera(30,OW/OH,0.05,50);
  const depthMat=new THREE.MeshDepthMaterial();
  const markers=new THREE.Group();scene.add(markers);
  const mkGeo=new THREE.SphereGeometry(1,12,8),mkMat=new THREE.MeshBasicMaterial({color:0x4c5fd5,depthTest:false,transparent:true,opacity:.85}),mkSel=new THREE.MeshBasicMaterial({color:0xff8a00,depthTest:false});
  /* 回す輪（赤・緑・青）。見える細い輪と、つかみやすい太い見えない輪 */
  const gizmo=new THREE.Group();gizmo.visible=false;scene.add(gizmo);const rings=[],hits=[];
  for(let k=0;k<3;k++){const r=new THREE.Mesh(new THREE.TorusGeometry(1,.035,8,64),new THREE.MeshBasicMaterial({color:AXC[k],depthTest:false,transparent:true,opacity:.95}));r.renderOrder=1000;gizmo.add(r);rings.push(r);
    const h=new THREE.Mesh(new THREE.TorusGeometry(1,.2,6,40),new THREE.MeshBasicMaterial({visible:false}));h.userData.k=k;r.add(h);hits.push(h);}
  const S={figs:[],cur:0,sel:null,ax:0,depthView:false,undo:[],meta:null};el.__p3=S;/* 確かめるとき用 */
  const F=()=>S.figs[S.cur];
  let raf=0;const draw=()=>{if(!raf)raf=requestAnimationFrame(()=>{raf=0;render();});};
  const size=()=>{const w=stage.clientWidth,h=Math.round(w*OH/OW);const mh=Math.max(240,Math.round(window.innerHeight*.5));const ww=h>mh?Math.round(mh*OW/OH):w,hh=Math.min(h,mh);
    cv.style.width=ww+'px';cv.style.height=hh+'px';renderer.setSize(ww,hh,false);cam.aspect=OW/OH;cam.updateProjectionMatrix();draw();};

  /* ===== 人形を1体作る ===== */
  async function makeFig(model){const g=await loadModel(model);const obj=cloneSkel(g.scene);const G=new THREE.Group();G.add(obj);
    const f={model,G,obj,bones:{},rest:{},info:{},ang:{},pos:[0,0,0],scale:1,meshes:[],marks:{}};
    obj.traverse(n=>{if(n.isBone){f.bones[n.name]=n;f.rest[n.name]=n.quaternion.clone();}if(n.isMesh){n.frustumCulled=false;n.material=new THREE.MeshStandardMaterial({color:0xcfcfcf,roughness:.75});if(n.isSkinnedMesh)f.meshes.push(n);}});
    G.updateMatrixWorld(true);
    const bb=new THREE.Box3().setFromObject(obj);f.height=bb.max.y-bb.min.y||1.7;
    /* 体の向き（前 fw・左 lf・上 up）：足首→つま先を前にする */
    const wp=n=>f.bones[n].getWorldPosition(V());const up=new THREE.Vector3(0,1,0);
    const fw=wp('ball_l').sub(wp('foot_l')).add(wp('ball_r').sub(wp('foot_r')));fw.y=0;fw.normalize();const lf=new THREE.Vector3().crossVectors(up,fw).normalize();f.frame={fw,lf,up};
    /* 関節ごとに、前後・左右の軸（親の骨の中の向き）と、ひねりの軸（自分の骨の中の向き）を決める */
    for(const[b,,kind]of JOINTS){const bone=f.bones[b];if(!bone)continue;const s=/_r$/.test(b)?-1:1;
      const pq=bone.parent.getWorldQuaternion(Q()).invert();
      /* 二の腕は、腕を下ろした形（T の形から 80° 下げた形）を 0° にして、前後は前へ振る向き、左右は横へ広げる向きにする（dn） */
      const ua=/^upperarm_/.test(b);
      let pW,rW;if(kind==='torso'){pW=lf.clone();rW=fw.clone().negate();}else if(kind==='arm'&&!ua){pW=up.clone().multiplyScalar(-s);rW=fw.clone().multiplyScalar(s);}else{pW=lf.clone().negate();rW=fw.clone().multiplyScalar(s);}
      const ch=CHILD[b]&&f.bones[CHILD[b]];const tL=ch?ch.position.clone().normalize().multiplyScalar(s):new THREE.Vector3(0,1,0);
      f.info[b]={pL:pW.applyQuaternion(pq).normalize(),rL:rW.applyQuaternion(pq).normalize(),tL,lim:limOf(b),dn:ua?-80:0};f.ang[b]=[0,0,0];}
    for(const[b]of JOINTS)if(f.bones[b]){const m=new THREE.Mesh(mkGeo,mkMat);m.renderOrder=999;f.marks[b]=m;markers.add(m);}
    return f;}
  const applyBone=(f,b)=>{const I=f.info[b],a=f.ang[b],bone=f.bones[b];if(!I||!bone)return;
    const qp=Q().setFromAxisAngle(I.pL,a[0]*D2R),qr=Q().setFromAxisAngle(I.rL,a[1]*D2R),qt=Q().setFromAxisAngle(I.tL,a[2]*D2R);
    bone.quaternion.copy(qp).multiply(qr);if(I.dn)bone.quaternion.multiply(Q().setFromAxisAngle(I.rL,I.dn*D2R));bone.quaternion.multiply(f.rest[b]).multiply(qt);};
  /* 姿勢・位置・大きさを当てる（骨の行列も今の姿勢にする。しないと体の形の計算が1回遅れる） */
  const pose=f=>{for(const b in f.info)applyBone(f,b);f.G.position.set(f.pos[0],f.pos[1],f.pos[2]);f.G.scale.setScalar(f.scale);f.G.updateMatrixWorld(true);for(const m of f.meshes)m.skeleton.update();};
  const eachV=(f,step,fn)=>{const v=V();for(const m of f.meshes){const n=m.geometry.attributes.position.count;for(let i=0;i<n;i+=step){m.getVertexPosition(i,v);v.applyMatrix4(m.matrixWorld);fn(v);}}};
  /* 地面につける：体のいちばん低い所を床（高さ0）に */
  const toGround=f=>{pose(f);let lo=1e9;eachV(f,3,v=>{if(v.y<lo)lo=v.y;});if(lo<1e8)f.pos[1]=+(f.pos[1]-lo).toFixed(4);};
  const figBox=(figs=S.figs)=>{const box=new THREE.Box3();for(const f of figs){pose(f);eachV(f,6,v=>box.expandByPoint(v));}return box;};
  /* 輪の向き（今の姿勢での、前後・左右・ひねりの回る軸） */
  const axisW=(f,b,k)=>{const I=f.info[b],bone=f.bones[b],pq=bone.parent.getWorldQuaternion(Q());
    if(k===0)return I.pL.clone().applyQuaternion(pq).normalize();
    if(k===1)return I.rL.clone().applyQuaternion(Q().setFromAxisAngle(I.pL,f.ang[b][0]*D2R)).applyQuaternion(pq).normalize();
    return I.tL.clone().applyQuaternion(bone.getWorldQuaternion(Q())).normalize();};
  const placeMarkers=()=>{const f=F();for(const[i,g]of S.figs.entries())for(const[b]of JOINTS){const m=g.marks[b];if(!m)continue;m.visible=i===S.cur&&!S.depthView;if(!m.visible)continue;g.bones[b].getWorldPosition(m.position);const sc=g.height*g.scale*.018;m.scale.setScalar(b===S.sel?sc*1.5:sc);m.material=b===S.sel?mkSel:mkMat;}
    gizmo.visible=!!(f&&S.sel&&f.info[S.sel]&&!S.depthView);if(!gizmo.visible)return;
    f.bones[S.sel].getWorldPosition(gizmo.position);gizmo.scale.setScalar(f.height*f.scale*(S.sel==='pelvis'?.16:.09));
    const z=new THREE.Vector3(0,0,1);for(let k=0;k<3;k++)rings[k].quaternion.setFromUnitVectors(z,axisW(f,S.sel,k));gizmo.updateMatrixWorld(true);};
  const render=()=>{if(!S.figs.length)return;for(const f of S.figs)pose(f);scene.updateMatrixWorld(true);placeMarkers();
    grid.visible=!S.depthView;
    if(S.depthView){fitDepth(cam);scene.overrideMaterial=depthMat;renderer.setClearColor(0x000000,1);}else{cam.near=.05;cam.far=50;cam.updateProjectionMatrix();scene.overrideMaterial=null;renderer.setClearColor(0x000000,0);}
    renderer.render(scene,cam);drawPos();};
  /* 深度の範囲を人形にぴったり合わせる（手前が白、奥が黒） */
  const fitDepth=(c,figs)=>{const box=figBox(figs);
    const pts=[];for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z])pts.push(new THREE.Vector3(x,y,z));
    c.updateMatrixWorld();const inv=c.matrixWorldInverse;let n=1e9,fa=-1e9;for(const p of pts){const z=-p.applyMatrix4(inv).z;n=Math.min(n,z);fa=Math.max(fa,z);}c.near=Math.max(.01,n-.02);c.far=Math.max(c.near+.1,fa+.02);c.updateProjectionMatrix();};
  /* カメラ c を、人物 figs の全体が入るように、向き k（正面・横・後ろ・上から・下から）から向ける。見る先を返す */
  const frameCam=(c,figs,k)=>{const box=figBox(figs),t=box.getCenter(V()),sz=box.getSize(V());
    const d=Math.max(sz.y,Math.max(sz.x,sz.z)*OH/OW)*2.4,{fw,lf,up}=figs[0].frame;
    const dir={front:fw.clone(),back:fw.clone().negate(),side:lf.clone().negate(),above:fw.clone().multiplyScalar(.55).add(up.clone().multiplyScalar(.85)).normalize(),below:fw.clone().multiplyScalar(.8).add(up.clone().multiplyScalar(-.55)).normalize()}[k]||fw.clone();
    c.position.copy(t).add(dir.multiplyScalar(d));c.up.set(0,1,0);c.lookAt(t);c.updateMatrixWorld();return t;};
  const setView=k=>{if(!S.figs.length)return;const t=frameCam(cam,S.figs,k);ctl.target.copy(t);ctl.update();draw();};

  /* ===== 戻す（直近3回まで） ===== */
  const snapData=()=>({figs:S.figs.map(f=>({model:f.model,ang:JSON.parse(JSON.stringify(f.ang)),pos:f.pos.slice(),scale:f.scale})),cur:S.cur});
  const snap=()=>{S.undo.push(snapData());if(S.undo.length>UNDO)S.undo.shift();drawUndo();};
  const drawUndo=()=>{const n=S.undo.length;$('.p3un').textContent=n?`（${n}）`:'';$('[data-a="undo"]').disabled=!n;};
  const restore=async d=>{const same=d.figs.length===S.figs.length&&d.figs.every((x,i)=>x.model===S.figs[i].model);
    if(!same){const c={p:cam.position.toArray(),t:ctl.target.toArray()};await loadPose({figs:d.figs.map(x=>({model:x.model,a:x.ang,pos:x.pos,scale:x.scale})),cam:c},true);}
    else d.figs.forEach((x,i)=>{const f=S.figs[i];for(const b in f.ang)f.ang[b]=(x.ang[b]||[0,0,0]).slice();f.pos=x.pos.slice();f.scale=x.scale;});
    S.cur=Math.min(d.cur||0,S.figs.length-1);selJoint(S.sel);drawFigs();draw();};

  /* ===== 人物の切りかえ・足す・外す ===== */
  const drawFigs=()=>{const f=F();
    $('.p3figs').innerHTML=S.figs.map((x,i)=>`<button type="button" data-fig="${i}" class="${i===S.cur?'on':''}">人物${i+1}（${MODELS[x.model]}）</button>`).join('')
      +(S.figs.length<2?'<button type="button" data-fa="add">＋ 2人目を足す</button>':`<button type="button" data-fa="del">人物${S.cur+1}を外す</button>`)
      +`<span class="p3sel">${Object.entries(MODELS).map(([k,l])=>`<button type="button" data-model="${k}" class="${f&&f.model===k?'on':''}">${l}</button>`).join('')}</span>`;
    $$('[data-fig]').forEach(b=>b.onclick=()=>{S.cur=+b.dataset.fig;selJoint(null);drawFigs();});
    $$('[data-model]').forEach(b=>b.onclick=()=>changeModel(b.dataset.model));
    $$('[data-fa]').forEach(b=>b.onclick=()=>(b.dataset.fa==='add'?act.addFig:act.delFig)());
    $('.p3sz').textContent=f?Math.round(f.scale*100)+'%':'';drawPos();};
  const drawPos=()=>{const f=F();if(!f)return;$$('[data-pv]').forEach(i=>{if(document.activeElement!==i)i.value=Math.round(f.pos[+i.dataset.pv]*100);});};
  const removeFig=f=>{scene.remove(f.G);for(const m of Object.values(f.marks))markers.remove(m);};
  const addFig=async d=>{const f=await makeFig(d.model||'female');if(d.a)for(const[b,v]of Object.entries(d.a))if(f.ang[b])f.ang[b]=v.slice(0,3);
    const p=d.pos;f.pos=!p?[0,0,0]:p.length===2?[p[0],0,p[1]]:p.slice(0,3);f.scale=d.scale||1;if(!p||p.length===2)toGround(f);scene.add(f.G);S.figs.push(f);return f;};
  const changeModel=async m=>{const f=F();if(!f||f.model===m)return;msg.hidden=false;msg.textContent='人形を読み込んでいます…';let n;
    try{n=await makeFig(m);}catch(e){msg.hidden=true;toast3('人形を読み込めませんでした');return;}
    snap();n.ang=JSON.parse(JSON.stringify(f.ang));n.pos=f.pos.slice();n.scale=f.scale;removeFig(f);scene.add(n.G);S.figs[S.cur]=n;msg.hidden=true;selJoint(null);drawFigs();draw();};
  /* ポーズを丸ごと読みこむ（keep が true なら、戻すの記録は消さない） */
  const loadPose=async(ps,keep)=>{msg.hidden=false;msg.textContent='人形を読み込んでいます…';
    for(const f of S.figs)removeFig(f);S.figs=[];S.cur=0;if(!keep){S.undo=[];drawUndo();}
    const figs=ps&&ps.figs&&ps.figs.length?ps.figs:[{model:'female'}];
    try{for(const d of figs.slice(0,2))await addFig(d);}catch(e){msg.textContent='人形を読み込めませんでした。はじめはネットにつないで開いてください。';return;}
    msg.hidden=true;selJoint(null);drawFigs();render();
    if(ps&&ps.cam){cam.position.fromArray(ps.cam.p);ctl.target.fromArray(ps.cam.t);ctl.update();draw();}else setView('front');};
  /* 1人分のポーズ d を、今選んでいる人物だけに当てる（人形・位置の左右と奥行き・大きさはそのまま。地面につけ直す）。ほかの人物はそのまま */
  const applyOne=d=>{const f=F();if(!f)return;for(const b in f.ang)f.ang[b]=d.a&&d.a[b]?d.a[b].slice(0,3):[0,0,0];toGround(f);selJoint(null);drawFigs();draw();};
  const poseData=()=>({figs:S.figs.map(f=>{const a={};for(const[b,v]of Object.entries(f.ang))if(v.some(x=>x))a[b]=v.map(x=>Math.round(x*10)/10);return{model:f.model,a,pos:f.pos.map(x=>+x.toFixed(4)),scale:+f.scale.toFixed(3)};}),
    cam:{p:cam.position.toArray().map(v=>+v.toFixed(4)),t:ctl.target.toArray().map(v=>+v.toFixed(4))}});

  /* ===== 関節 ===== */
  const showAng=()=>{const f=F(),b=S.sel;if(!f||!b||!f.info[b]){$('.p3ang').textContent='';return;}const k=S.ax,L=f.info[b].lim[k];
    $('.p3ang').innerHTML=`<span style="color:${hex(AXC[k])}">${AXN[k]}</span> ${Math.round(f.ang[b][k])}°`+(b==='pelvis'?'':`（ふつうは ${L[0]}〜${L[1]}°）`);};
  const selJoint=b=>{S.sel=b&&F()&&F().info[b]?b:null;const j=JOINTS.find(x=>x[0]===S.sel);$('.p3jn b').textContent=j?j[1]:'（体の点をタップ）';showAng();draw();};
  let limT=0;
  const rotate=(k,deg)=>{const f=F(),b=S.sel;if(!f||!b||!f.info[b])return;S.ax=k;const L=f.info[b].lim[k],a=f.ang[b];
    let v=a[k]+deg;
    if(b==='pelvis')v=((v+180)%360+360)%360-180;
    else{const lo=L[0]-MARGIN,hi=L[1]+MARGIN;if(v<lo||v>hi){v=Math.max(lo,Math.min(hi,v));if(Date.now()-limT>1500){limT=Date.now();toast3('これ以上は曲がりません（ふつうの範囲＋10°で止めています）');}}}
    a[k]=v;showAng();draw();};

  /* ===== 指の操作：輪をなぞる→回す。点をタップ→関節を選ぶ。ほかはカメラ（OrbitControls より先に受ける） ===== */
  const ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
  const scrAng=(e,c)=>Math.atan2(-(e.clientY-c.y),e.clientX-c.x);
  const ctr=()=>{const r=cv.getBoundingClientRect(),p=gizmo.position.clone().project(cam);return{x:r.left+(p.x+1)/2*r.width,y:r.top+(1-p.y)/2*r.height};};
  let rd=null,pd=null,pan=null,nPtr=0;
  /* 長押しで、カメラを平行に動かす（OrbitControls を止めて、画面のなぞった分だけ動かす） */
  const panBy=(dx,dy)=>{const h=cv.getBoundingClientRect().height||1,dist=cam.position.distanceTo(ctl.target),k=2*dist*Math.tan(cam.fov*D2R/2)/h;
    const rgt=new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld,0),upv=new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld,1);
    const off=rgt.multiplyScalar(-dx*k).add(upv.multiplyScalar(dy*k));cam.position.add(off);ctl.target.add(off);ctl.update();draw();};
  const endPan=()=>{if(pd&&pd.lp)clearTimeout(pd.lp);if(pan){pan=null;ctl.enabled=true;cv.classList.remove('p3pan');}};
  cv.addEventListener('pointerdown',()=>{nPtr++;if(nPtr>1)endPan();},true);
  cv.addEventListener('pointerup',()=>{nPtr=Math.max(0,nPtr-1);},true);cv.addEventListener('pointercancel',()=>{nPtr=Math.max(0,nPtr-1);endPan();},true);
  cv.addEventListener('pointerdown',e=>{if(pd&&pd.lp)clearTimeout(pd.lp);pd={x:e.clientX,y:e.clientY,lx:e.clientX,ly:e.clientY,moved:false,id:e.pointerId};
    pd.lp=setTimeout(()=>{if(!pd||pd.moved||rd||nPtr>1)return;pan={id:pd.id};ctl.enabled=false;cv.classList.add('p3pan');if(navigator.vibrate)try{navigator.vibrate(15);}catch(_){}},450);
    if(!gizmo.visible)return;const r=cv.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,cam);
    const hit=ray.intersectObjects(hits,false)[0];if(!hit)return;
    e.preventDefault();e.stopImmediatePropagation();try{cv.setPointerCapture(e.pointerId);}catch(_){}
    clearTimeout(pd.lp);const c=ctr();snap();rd={k:hit.object.userData.k,c,a:scrAng(e,c),id:e.pointerId};S.ax=rd.k;showAng();});
  const ctl=new OrbitControls(cam,cv);ctl.enableDamping=false;ctl.rotateSpeed=.8;ctl.addEventListener('change',draw);
  cv.addEventListener('pointermove',e=>{
    if(pan&&pan.id===e.pointerId&&pd){panBy(e.clientX-pd.lx,e.clientY-pd.ly);pd.lx=e.clientX;pd.ly=e.clientY;pd.moved=true;return;}
    if(pd&&pd.id===e.pointerId){pd.lx=e.clientX;pd.ly=e.clientY;if(Math.hypot(e.clientX-pd.x,e.clientY-pd.y)>8){pd.moved=true;clearTimeout(pd.lp);}}
    if(!rd||rd.id!==e.pointerId)return;const a=scrAng(e,rd.c);let d=a-rd.a;if(d>Math.PI)d-=2*Math.PI;if(d<-Math.PI)d+=2*Math.PI;rd.a=a;
    const n=axisW(F(),S.sel,rd.k),tow=cam.position.clone().sub(gizmo.position).dot(n)>0?1:-1;rotate(rd.k,d/D2R*tow);});
  cv.addEventListener('pointerup',e=>{if(pd&&pd.lp)clearTimeout(pd.lp);if(pan&&pan.id===e.pointerId){endPan();pd=null;return;}if(rd&&rd.id===e.pointerId){rd=null;pd=null;return;}if(!pd||pd.id!==e.pointerId)return;const t=!pd.moved;pd=null;if(!t)return;
    const f=F();if(!f)return;const r=cv.getBoundingClientRect();let best=null,bd=1e9;for(const[b]of JOINTS){const m=f.marks[b];if(!m)continue;const p=m.position.clone().project(cam);const d=Math.hypot(r.left+(p.x+1)/2*r.width-e.clientX,r.top+(1-p.y)/2*r.height-e.clientY);if(d<bd){bd=d;best=b;}}
    selJoint(bd<34?best:null);});
  const SYM={up:['clavicle','upperarm','lowerarm','hand'],low:['thigh','calf','foot']};
  $$('[data-sym]').forEach(b=>b.onclick=()=>{const f=F();if(!f)return;snap();const fr=b.dataset.from,to=fr==='l'?'r':'l';
    for(const n of SYM[b.dataset.sym]){const A=f.ang[n+'_'+fr],B=f.ang[n+'_'+to];if(A&&B)f.ang[n+'_'+to]=A.slice();}showAng();draw();
    toast3((b.dataset.sym==='up'?'上半身':'下半身')+'を'+(fr==='l'?'左→右':'右→左')+'に写しました');});
  $$('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
  $$('[data-zoom]').forEach(b=>b.onclick=()=>{const v=cam.position.clone().sub(ctl.target);v.multiplyScalar(b.dataset.zoom>0?1/1.25:1.25);cam.position.copy(ctl.target).add(v);ctl.update();draw();});
  $$('[data-step]').forEach(b=>b.onclick=()=>{if(!S.sel)return toast3('先に関節を選んでください');snap();rotate(S.ax,+b.dataset.step);});
  $$('[data-size]').forEach(b=>b.onclick=()=>{const f=F();if(!f)return;snap();f.scale=Math.max(.6,Math.min(1.4,Math.round((f.scale+(+b.dataset.size)*.05)*100)/100));drawFigs();draw();});
  $$('[data-mv]').forEach(b=>b.onclick=()=>{const f=F();if(!f)return;snap();const i=+b.dataset.mv;f.pos[i]=+(f.pos[i]+(+b.dataset.d)*.05).toFixed(4);draw();});
  $$('[data-pv]').forEach(inp=>inp.onchange=()=>{const f=F();if(!f)return;const v=parseFloat(inp.value);if(!isFinite(v))return drawPos();snap();f.pos[+inp.dataset.pv]=v/100;draw();});
  const act={
    close:()=>history.back(),
    undo:()=>{const d=S.undo.pop();drawUndo();if(d)restore(d);},
    look:()=>{S.depthView=!S.depthView;$('[data-a="look"]').textContent=S.depthView?'人形で見る':'深度で見る';draw();},
    resetJ:()=>{const f=F();if(!f||!S.sel)return;snap();f.ang[S.sel]=[0,0,0];showAng();draw();},
    resetAll:()=>{const f=F();if(!f)return;snap();for(const b in f.ang)f.ang[b]=[0,0,0];showAng();draw();},
    armsDown:()=>{const f=F();if(!f)return;snap();for(const b of['upperarm_l','upperarm_r'])if(f.ang[b])f.ang[b]=[0,0,0];showAng();draw();},
    ground:()=>{const f=F();if(!f)return;snap();toGround(f);draw();toast3('体のいちばん低い所を地面につけました');},
    addFig:async()=>{if(S.figs.length>=2)return;msg.hidden=false;msg.textContent='人形を読み込んでいます…';
      try{const a=S.figs[0];const gap=a?a.height*a.scale*.5:0;const side=a?a.frame.lf.clone().multiplyScalar(-gap):V();snap();
        const f=await addFig({model:a&&a.model==='female'?'male':'female'});f.pos[0]=+((a?a.pos[0]:0)+side.x).toFixed(4);f.pos[2]=+((a?a.pos[2]:0)+side.z).toFixed(4);S.cur=S.figs.indexOf(f);}catch(e){toast3('人形を読み込めませんでした');}
      msg.hidden=true;selJoint(null);drawFigs();render();setView('front');},
    delFig:()=>{if(S.figs.length<2)return;snap();removeFig(F());S.figs.splice(S.cur,1);S.cur=0;selJoint(null);drawFigs();draw();},
    lib:()=>{$('.p3lib').hidden=false;drawLib();},
    libClose:()=>{$('.p3lib').hidden=true;},
    libSave:()=>{if(!o.lib)return;const nm=$('.p3nm').value.trim()||('ポーズ '+((o.lib.list()||[]).length+1));const th=thumb();o.lib.save({id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:nm,pose:poseData(),thumb:th,meta:S.meta||null,created:Date.now()});$('.p3nm').value='';drawLib();toast3('「'+nm+'」を保存しました');},
    save:async()=>{const b=await depthBlob(OW,OH);if(!b)return;o.onSave&&o.onSave(b,poseData(),S.meta);history.back();},
    png:async()=>{const b=await depthBlob(OW,OH);if(!b)return;const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='depth3d_'+Date.now()+'.png';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},4000);}};
  $$('[data-a]').forEach(b=>{if(act[b.dataset.a])b.onclick=act[b.dataset.a];});
  /* 保存したポーズの一覧 */
  const drawLib=()=>{const L=(o.lib&&o.lib.list())||[];const box=$('.p3list');
    box.innerHTML=L.length?L.map(it=>`<div class="p3it">${it.thumb?`<img src="${it.thumb}" alt="">`:'<span class="p3noimg"></span>'}<div><b>${esc(it.name)}</b><small>${(it.pose&&it.pose.figs||[]).length||1}人</small>
      <div class="p3row"><button type="button" class="btn sm" data-lu="${it.id}">呼び出す</button><button type="button" class="btn ghost sm" data-ld="${it.id}">消す</button></div></div></div>`).join(''):'<p class="p3hint" style="padding:0 10px">まだありません。上の「今のポーズを保存」で保存できます。</p>';
    /* 1人のポーズは今の人物だけに当てる。2人のポーズは、人物・カメラも丸ごと呼び出す */
    $$('[data-lu]').forEach(b=>b.onclick=async()=>{const it=L.find(x=>x.id===b.dataset.lu);if(!it)return;$('.p3lib').hidden=true;snap();
      const fs=(it.pose&&it.pose.figs)||[];if(fs.length===1&&S.figs.length)applyOne(fs[0]);else await loadPose(it.pose,true);S.meta=it.meta||null;toast3('「'+it.name+'」を呼び出しました'+(fs.length===1&&S.figs.length>1?'（人物'+(S.cur+1)+'に当てました）':''));});
    $$('[data-ld]').forEach(b=>b.onclick=()=>{const it=L.find(x=>x.id===b.dataset.ld);if(!it||!confirm('「'+it.name+'」を消しますか？'))return;o.lib.del(it.id);drawLib();});
    $('.p3pre').innerHTML=PRESETS.map((it,i)=>`<div class="p3it">${PRE_IMG[i]?`<img src="${PRE_IMG[i]}" alt="" data-pimg="${i}">`:`<span class="p3noimg" data-pimg="${i}"></span>`}<div><b>${esc(it.name)}</b><small>タグ：${esc(it.tags)}</small>
      <div class="p3row"><button type="button" class="btn sm" data-pre="${i}">呼び出す</button></div></div></div>`).join('');
    makePreImgs();
    $$('[data-pre]').forEach(b=>b.onclick=async()=>{const it=PRESETS[+b.dataset.pre];if(!it)return;$('.p3lib').hidden=true;snap();
      applyOne(it.pose.figs[0]);S.meta={name:it.name,tags:it.tags,cat:it.cat};if(S.figs.length<2)setView(it.view||'front');toast3('「'+it.name+'」を呼び出しました'+(S.figs.length>1?'（人物'+(S.cur+1)+'に当てました）':''));});};
  /* 最初からあるポーズの絵：見えない人形を1体作り、ポーズを当てて、その人形だけを深度で描く */
  let preBusy=false;
  const makePreImgs=async()=>{if(preBusy)return;preBusy=true;
    try{for(let i=0;i<PRESETS.length;i++){if(PRE_IMG[i])continue;const it=PRESETS[i];const t=await makeFig(F()?F().model:'female');
        for(const m of Object.values(t.marks))markers.remove(m);for(const b in t.ang)t.ang[b]=it.pose.figs[0].a[b]?it.pose.figs[0].a[b].slice():[0,0,0];
        scene.add(t.G);toGround(t);const vis=S.figs.map(f=>f.G.visible);S.figs.forEach(f=>f.G.visible=false);
        const c2=cam.clone();c2.aspect=OW/OH;c2.updateProjectionMatrix();frameCam(c2,[t],it.view);PRE_IMG[i]=thumb([t],c2);
        S.figs.forEach((f,j)=>f.G.visible=vis[j]);scene.remove(t.G);
        const im=el.querySelector(`.p3pre [data-pimg="${i}"]`);if(im&&PRE_IMG[i])im.outerHTML=`<img src="${PRE_IMG[i]}" alt="" data-pimg="${i}">`;}}
    finally{preBusy=false;draw();}};
  /* 深度の画像：手前ほど白、背景は透明。人形の中の明るさを 30〜255 に広げる */
  /* figs と c2 を渡すと、その人物だけを、そのカメラで描く（最初からあるポーズの絵に使う） */
  const depthCanvas=(W,H,figs,c2)=>{if(!S.figs.length&&!figs)return null;render();const r2=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});r2.setPixelRatio(1);r2.setSize(W,H,false);
    if(!c2){c2=cam.clone();c2.aspect=OW/OH;c2.updateProjectionMatrix();}fitDepth(c2,figs);markers.visible=false;gizmo.visible=false;grid.visible=false;scene.overrideMaterial=depthMat;r2.setClearColor(0x000000,0);r2.render(scene,c2);
    const k=document.createElement('canvas');k.width=W;k.height=H;const g=k.getContext('2d');g.drawImage(r2.domElement,0,0);r2.dispose();scene.overrideMaterial=null;markers.visible=true;draw();
    const d=g.getImageData(0,0,W,H),a=d.data;let lo=255,hi=0;for(let i=0;i<a.length;i+=4)if(a[i+3]>200){lo=Math.min(lo,a[i]);hi=Math.max(hi,a[i]);}
    const sp=Math.max(1,hi-lo);for(let i=0;i<a.length;i+=4){if(!a[i+3])continue;const v=Math.round(30+225*Math.max(0,Math.min(1,(a[i]-lo)/sp)));a[i]=a[i+1]=a[i+2]=v;}
    g.putImageData(d,0,0);return k;};
  const depthBlob=(W,H)=>{const k=depthCanvas(W,H);return k?new Promise(r=>k.toBlob(r,'image/png')):Promise.resolve(null);};
  const thumb=(figs,c2)=>{const k=depthCanvas(120,137,figs,c2);if(!k)return null;const t=document.createElement('canvas');t.width=120;t.height=137;const g=t.getContext('2d');g.fillStyle='#000';g.fillRect(0,0,120,137);g.drawImage(k,0,0);return t.toDataURL('image/jpeg',.8);};
  window.__p3dClose=()=>{window.__p3dClose=null;cancelAnimationFrame(raf);ctl.dispose();renderer.dispose();window.removeEventListener('resize',size);el.remove();};
  el.__api={draw,setView,loadPose,thumb:()=>thumb(),toGround:()=>{for(const f of S.figs)toGround(f);draw();}};/* 確かめるとき用 */
  window.addEventListener('resize',size);size();drawUndo();
  await loadPose(o.pose||null);size();
}
