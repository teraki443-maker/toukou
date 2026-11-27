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
       onSave(blob,pose,meta)、meta={name,tags,cat}（最初からあるポーズを使ったとき）。lib は保存したポーズの入れ物（list・save・del）。
   ・物体（v96）：glb ファイルを取り込んで、人物のほかに置ける（椅子・ベッド・車など）。
       取り込んだ glb は、この端末の IndexedDB「toukou3d」にしまう（list：名前など、data：ファイルの中身）。次からは「📦 物体」から呼び出せる。
       物体ごとに 位置（x,y,z、m）・角度（x,y,z、度）・伸縮（x,y,z、倍）。深度の画像にも写る。
       角度は、関節と同じく赤（X）・緑（Y）・青（Z）の輪をなぞって回す（v97。軸は物体といっしょに傾く）。
   ・人物ごとのタグ（v98）：figs[i].tags。「📂 ポーズ」で入れて保存する。深度ポーズとして保存すると、onSave の meta に tags（人物1）・tags2（人物2）・n（人数）を渡す。
     保存したポーズの呼び出し：足す（addPose）・入れかえる（loadPose）・形だけ当てる（applyOne、1人のポーズだけ）。
   ・移動の矢印（v99）：人物・物体をダブルタップすると、X・Y・Z の矢印（mgiz）が出る。矢印をなぞると、その軸の向きに動く（S.mv）。
   ・深度の画像（v99）：距離を 16bit で測り、明るさは 1/z。外れ値を除いて広げ、重なりの境目を少し暗くし、2倍で作って縮める（measure・shade・depthCanvas）。
       物体を選んでいるときは、設定が道具の欄のいちばん上に出て、3Dの画面が上に止まる（#p3d に class p3om）。
       pose.objs=[{id,name,pos:[x,y,z],rot:[x,y,z],scl:[x,y,z]}]。id は取り込んだ glb の id（別の端末では見つからないので、置かない）。
       物体の中心が位置の点。大きすぎる・小さすぎる glb（いちばん長い辺が 20m より上、2cm より下）は、1m に合わせて読み込む。 */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
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

/* ===== 取り込んだ glb（物体）の入れ物：IndexedDB「toukou3d」。list={id,name,size,created}、data={id,buf} ===== */
const ODB=(()=>{let p=null;
  const open=()=>p||(p=new Promise((res,rej)=>{const r=indexedDB.open('toukou3d',1);r.onupgradeneeded=()=>{const d=r.result;for(const s of['list','data'])if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:'id'});};r.onsuccess=()=>res(r.result);r.onerror=()=>{p=null;rej(r.error);};}));
  const run=(st,mode,fn)=>open().then(d=>new Promise((res,rej)=>{const t=d.transaction(st,mode);const q=fn(st.map?st.map(s=>t.objectStore(s)):t.objectStore(st));let out;if(q)q.onsuccess=()=>{out=q.result;};t.oncomplete=()=>res(out);t.onerror=t.onabort=()=>rej(t.error);}));
  return{list:()=>run('list','readonly',s=>s.getAll()).then(r=>(r||[]).sort((a,b)=>b.created-a.created)),
    data:id=>run('data','readonly',s=>s.get(id)),
    add:(m,buf)=>run(['list','data'],'readwrite',([l,d])=>{l.put(m);d.put({id:m.id,buf});}),
    rename:m=>run('list','readwrite',s=>s.put(m)),
    del:id=>run(['list','data'],'readwrite',([l,d])=>{l.delete(id);d.delete(id);})};})();
let glLd=null;
const glLoader=()=>{if(glLd)return glLd;glLd=new GLTFLoader();const d=new DRACOLoader();d.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/');glLd.setDRACOLoader(d);glLd.setMeshoptDecoder(MeshoptDecoder);return glLd;};
const parseGlb=buf=>new Promise((res,rej)=>glLoader().parse(buf,'',res,rej));
const objCache={};
const loadObj=id=>objCache[id]||(objCache[id]=ODB.data(id).then(r=>{if(!r||!r.buf)throw new Error('none');return parseGlb(r.buf);}).catch(e=>{delete objCache[id];throw e;}));
const kb=n=>n>=1048576?(n/1048576).toFixed(1)+'MB':Math.max(1,Math.round(n/1024))+'KB';
/* 物体の数字の欄：p 位置（m、画面は cm）、r 角度（度）、s 伸縮（倍、画面は %） */
const OK={p:{lab:'位置',u:'cm',st:.05,show:v=>Math.round(v*100),read:v=>v/100},r:{lab:'角度',u:'度',st:15,show:v=>Math.round(v),read:v=>v},s:{lab:'伸縮',u:'%',st:.1,show:v=>Math.round(v*100),read:v=>v/100}};
const r4=v=>+(+v).toFixed(4);
const wrapDeg=v=>{v=((v+180)%360+360)%360-180;return v===-180?180:v;};

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
      <div class="p3obj"><div class="p3ph"><b>物体（glb）</b><button type="button" class="p3lb" data-a="objLib" style="margin-left:auto">📦 物体を呼び出す</button></div>
        <div class="p3ol"></div></div>
      <!-- 物体の設定。選んでいるときだけ出す。開いたあと、道具の欄のいちばん上へ移す -->
      <div class="p3oe" hidden><div class="p3oh"><b class="p3on"></b><button type="button" data-oa="desel" class="p3oc">✓ 調整を終える</button></div>
          <div class="p3og">角度<small>（輪を指でなぞると回ります）</small></div>
          <div class="p3row p3oax">${['X','Y','Z'].map((x,k)=>`<button type="button" data-oa="ax" data-k="${k}" style="--c:${hex(AXC[k])}">● ${x}</button>`).join('')}<button type="button" data-oa="rs" data-d="-1">－5°</button><button type="button" data-oa="rs" data-d="1">＋5°</button><button type="button" data-oa="rot0">角度を戻す</button></div>
          ${Object.entries(OK).filter(([k])=>k!=='r').map(([k,K])=>`<div class="p3og">${K.lab}<small>（${K.u}）</small>${k==='s'?`<span class="p3st">全体<button type="button" data-oa="sAll" data-d="-1" aria-label="全体を小さく">－</button><button type="button" data-oa="sAll" data-d="1" aria-label="全体を大きく">＋</button></span>`:''}</div>`
            +['X','Y','Z'].map((x,i)=>`<div class="p3pr"><span>${x}<small>${k==='p'?['（左右）','（上下）','（奥・手前）'][i]:''}</small></span><button type="button" data-ok="${k}" data-oi="${i}" data-d="-1" aria-label="${K.lab}${x}を減らす">▼</button><input type="number" inputmode="decimal" step="1" data-ov="${k}" data-oi="${i}" aria-label="${K.lab}${x}（${K.u}）"><button type="button" data-ok="${k}" data-oi="${i}" data-d="1" aria-label="${K.lab}${x}を増やす">▲</button></div>`).join('')).join('')}
          <div class="p3row"><button type="button" class="btn sm" data-oa="ground">⬇ 地面につける</button><button type="button" data-oa="scl0">伸縮を戻す</button><button type="button" data-oa="dup">複製</button><button type="button" data-oa="del">この物体を外す</button></div>
          <p class="p3hint" style="margin:4px 0 0">物体のまわりの赤（X）・緑（Y）・青（Z）の輪を指でなぞると、その軸のまわりに回ります（軸は物体といっしょに傾きます）。－5°・＋5° は、選んだ色の軸で回します。▲▼ で 位置は 5cm、伸縮は 10% ずつ変わります。伸縮の「全体」は、形を変えずに大きさだけ変えます。</p></div>
      <p class="p3hint">体の点をタップすると、その関節に輪が出ます。輪を指でなぞると回ります（ふつうに曲がる範囲より10°先で止まります）。左右は人形から見た左右です。何もない所をなぞるとカメラが回り、長押ししてからなぞるとカメラが平行に動きます。2本の指で拡大・移動です。人物や物体を<b>ダブルタップ</b>すると、赤（左右）・緑（上下）・青（奥と手前）の矢印が出て、矢印をなぞるとその向きに動きます（何もない所をタップすると終わります）。「左右対称」の「左→右」は、人形の左側の形を右側に写します。「↶ 戻す」で、直近3回までの変更を戻せます。</p>
      <label class="p3sepl"><input type="checkbox" class="p3sep"> 重なった所の境目をはっきりさせる<small>手足が体の前にあるとき、奥側の縁を少し暗くして、AI が手足と体をくっつけたり、形を崩したりしにくくします。</small></label>
      <div class="p3row p3save"><button type="button" class="btn" data-a="save">深度ポーズとして保存</button><button type="button" class="btn ghost" data-a="png">PNG を保存</button></div>
    </div>
    <div class="p3lib" hidden><div class="p3libin"><div class="p3top"><b>保存したポーズ</b><button type="button" class="p3x" data-a="libClose" aria-label="閉じる">✕</button></div>
      <div class="p3row" style="padding:0 10px"><input class="p3nm" placeholder="ポーズの名前（例：2人で並んで立つ）"><button type="button" class="btn sm" data-a="libSave">今のポーズを保存</button></div>
      <div class="p3ltags"></div>
      <p class="p3hint" style="padding:0 10px">保存したポーズには、人物（人形・関節・位置・大きさ・タグ）・物体・カメラが入ります。「足す」は今の人物・物体を残したまま、保存した人物（2人まで）と物体を横に足します。「入れかえる」は保存したときと同じにします。「形だけ当てる」は、選んでいる人物に関節の角度とタグだけを当てます。最初からあるポーズは、深度ポーズとして保存するときに、名前・タグ・カテゴリも入ります。</p><div class="p3list"></div>
      <div class="p3top" style="position:static"><b>最初からあるポーズ</b></div><div class="p3pre"></div></div></div>
    <div class="p3olib" hidden><div class="p3libin"><div class="p3top"><b>物体（glb）を呼び出す</b><button type="button" class="p3x" data-a="objLibClose" aria-label="閉じる">✕</button></div>
      <div class="p3row" style="padding:0 10px"><label class="btn sm">＋ glb ファイルを取り込む<input type="file" accept=".glb,model/gltf-binary" multiple hidden class="p3oin"></label></div>
      <p class="p3hint" style="padding:0 10px">取り込んだ glb は、この端末の中にしまわれ、次からはこの一覧から呼び出せます（ほかの端末には送られません）。.glb の形のファイルだけ使えます（.gltf は、Blender などで .glb に書き出してください）。</p>
      <div class="p3olist"></div></div></div>`;
  document.body.appendChild(el);history.pushState({p3d:1},'');
  const $=s=>el.querySelector(s),$$=s=>[...el.querySelectorAll(s)];
  const cv=$('.p3cv'),stage=$('.p3stage'),msg=$('.p3msg');
  $('.p3tool').prepend($('.p3oe'));/* 物体の設定は、道具の欄のいちばん上（画面のすぐ下）に出す */
  const toast3=t=>{if(window.toast)window.toast(t);};
  const renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
  const scene=new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff,0x555566,1.6));const dl=new THREE.DirectionalLight(0xffffff,1.6);dl.position.set(1.5,3,2.5);scene.add(dl);
  const grid=new THREE.GridHelper(6,24,0x9aa3b5,0xc9ced8);scene.add(grid);
  const cam=new THREE.PerspectiveCamera(30,OW/OH,0.05,50);
  /* 深度を測る材質（v99）：カメラからの距離（near〜far を 0〜1）を、R と G の2つで 16bit にしまう。骨で曲げた体にも効く */
  const linMat=new THREE.ShaderMaterial({side:THREE.DoubleSide,uniforms:{uN:{value:.1},uF:{value:10}},
    vertexShader:'#include <common>\n#include <skinning_pars_vertex>\nvarying float vZ;\nvoid main(){\n#include <skinbase_vertex>\n#include <begin_vertex>\n#include <skinning_vertex>\n#include <project_vertex>\nvZ=-mvPosition.z;}',
    fragmentShader:'uniform float uN,uF;varying float vZ;void main(){float d=clamp((vZ-uN)/(uF-uN),0.,1.)*255.;gl_FragColor=vec4(floor(d)/255.,fract(d),0.,1.);}'});
  /* 「深度で見る」の絵を画面いっぱいに貼る板 */
  const dvScene=new THREE.Scene(),dvCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1),dvMat=new THREE.MeshBasicMaterial({toneMapped:false});dvScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),dvMat));let dvTex=null;
  /* 重なりの境目をはっきりさせる（手足が体の前にあるとき、奥側の縁を少し暗くする）。端末に覚える */
  let sepOn=true;try{sepOn=localStorage.getItem('p3sep')!=='0';}catch(_){}
  const markers=new THREE.Group();scene.add(markers);
  const mkGeo=new THREE.SphereGeometry(1,12,8),mkMat=new THREE.MeshBasicMaterial({color:0x4c5fd5,depthTest:false,transparent:true,opacity:.85}),mkSel=new THREE.MeshBasicMaterial({color:0xff8a00,depthTest:false});
  /* 回す輪（赤・緑・青）。見える細い輪と、つかみやすい太い見えない輪 */
  const gizmo=new THREE.Group();gizmo.visible=false;scene.add(gizmo);const rings=[],hits=[];
  for(let k=0;k<3;k++){const r=new THREE.Mesh(new THREE.TorusGeometry(1,.035,8,64),new THREE.MeshBasicMaterial({color:AXC[k],depthTest:false,transparent:true,opacity:.95}));r.renderOrder=1000;gizmo.add(r);rings.push(r);
    const h=new THREE.Mesh(new THREE.TorusGeometry(1,.2,6,40),new THREE.MeshBasicMaterial({visible:false}));h.userData.k=k;r.add(h);hits.push(h);}
  /* 移動の矢印（v99）：人物・物体をダブルタップすると、X（赤）・Y（緑）・Z（青）の矢印が出る。矢印をなぞると、その向きに動く。
     矢印は画面の上でいつも同じくらいの大きさ（カメラからの距離に合わせて大きさを変える）。見えない太い棒でつかみやすくする */
  const mgiz=new THREE.Group();mgiz.visible=false;scene.add(mgiz);const ahits=[],AXV=[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)];
  for(let k=0;k<3;k++){const g=new THREE.Group(),mat=new THREE.MeshBasicMaterial({color:AXC[k],depthTest:false,transparent:true,opacity:.95});
    const sh=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,.78,10),mat);sh.position.y=.39;const hd=new THREE.Mesh(new THREE.ConeGeometry(.075,.22,16),mat);hd.position.y=.89;sh.renderOrder=hd.renderOrder=1001;
    const ht=new THREE.Mesh(new THREE.CylinderGeometry(.14,.14,1.1,8),new THREE.MeshBasicMaterial({visible:false}));ht.position.y=.55;ht.userData.k=k;
    g.add(sh,hd,ht);g.quaternion.setFromUnitVectors(AXV[1],AXV[k]);mgiz.add(g);ahits.push(ht);}
  const ball=new THREE.Mesh(new THREE.SphereGeometry(.06,12,8),new THREE.MeshBasicMaterial({color:0xffffff,depthTest:false}));ball.renderOrder=1001;mgiz.add(ball);
  /* 選んだ物体のオレンジの枠 */
  const obox=new THREE.BoxHelper(undefined,0xff8a00);obox.visible=false;obox.material.depthTest=false;obox.renderOrder=998;scene.add(obox);
  const S={figs:[],cur:0,sel:null,ax:0,depthView:false,undo:[],meta:null,objs:[],osel:null,oax:1,mv:null};/* mv：移動の矢印を出している相手 {t:'fig'|'obj',i} *//* oax：物体の －5°・＋5° で回す軸（0 X・1 Y・2 Z） */el.__p3=S;/* 確かめるとき用 */
  const F=()=>S.figs[S.cur];
  let raf=0;const draw=()=>{if(!raf)raf=requestAnimationFrame(()=>{raf=0;render();});};
  const size=()=>{const w=stage.clientWidth,h=Math.round(w*OH/OW);const mh=Math.max(240,Math.round(window.innerHeight*.5));const ww=h>mh?Math.round(mh*OW/OH):w,hh=Math.min(h,mh);
    cv.style.width=ww+'px';cv.style.height=hh+'px';renderer.setSize(ww,hh,false);cam.aspect=OW/OH;cam.updateProjectionMatrix();draw();};

  /* ===== 人形を1体作る ===== */
  async function makeFig(model){const g=await loadModel(model);const obj=cloneSkel(g.scene);const G=new THREE.Group();G.add(obj);
    const f={model,G,obj,bones:{},rest:{},info:{},ang:{},pos:[0,0,0],scale:1,meshes:[],marks:{},tags:''};/* tags：この人物のプロンプトのタグ（v98） */
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
  /* ===== 物体（glb）を1つ作る。d={id,name,pos,rot,scl}。中心を位置の点にする（inner の中で中心を原点へ） ===== */
  async function makeObj(d){const g=await loadObj(d.id);const raw=cloneSkel(g.scene);
    raw.traverse(n=>{if(n.isMesh)n.frustumCulled=false;});raw.updateMatrixWorld(true);
    const bb=new THREE.Box3().setFromObject(raw),sz=bb.isEmpty()?new THREE.Vector3(1,1,1):bb.getSize(V()),c=bb.isEmpty()?V():bb.getCenter(V());
    const mx=Math.max(sz.x,sz.y,sz.z)||1,k=(mx>20||mx<.02)?1/mx:1;
    raw.position.sub(c);const inner=new THREE.Group();inner.add(raw);inner.scale.setScalar(k);const G=new THREE.Group();G.add(inner);
    const v3=(a,z)=>Array.isArray(a)&&a.length===3?a.map(Number):[z,z,z];
    return{id:d.id,name:d.name||'物体',G,size:sz.clone().multiplyScalar(k),fit:k!==1,pos:v3(d.pos,0),rot:v3(d.rot,0),scl:v3(d.scl,1)};}
  const poseObj=o=>{o.G.position.fromArray(o.pos);o.G.rotation.set(o.rot[0]*D2R,o.rot[1]*D2R,o.rot[2]*D2R);o.G.scale.fromArray(o.scl.map(v=>v||.001));o.G.updateMatrixWorld(true);};
  const objGround=o=>{poseObj(o);const b=new THREE.Box3().setFromObject(o.G);if(!b.isEmpty())o.pos[1]=r4(o.pos[1]-b.min.y);};
  const O=()=>S.osel==null?null:S.objs[S.osel]||null;
  const removeObj=o=>scene.remove(o.G);
  /* 物体を丸ごと入れかえる（見つからない glb は飛ばす） */
  const setObjs=async list=>{for(const o of S.objs)removeObj(o);S.objs=[];S.osel=null;let miss=0;
    for(const d of list||[]){try{const o=await makeObj(d);scene.add(o.G);S.objs.push(o);}catch(e){miss++;}}
    if(miss)toast3(miss+'個の物体が見つかりませんでした（この端末に取り込まれていない glb です）');drawObjs();};
  /* 戻すとき：同じ物体の並びなら数字だけ写す */
  const syncObjs=async(list,osel)=>{list=list||[];const same=list.length===S.objs.length&&list.every((d,i)=>d.id===S.objs[i].id);
    if(!same)await setObjs(list);else list.forEach((d,i)=>{const o=S.objs[i];o.pos=d.pos.slice();o.rot=d.rot.slice();o.scl=d.scl.slice();});
    S.osel=osel!=null&&S.objs[osel]?osel:null;drawObjs();};
  const objData=o=>({id:o.id,name:o.name,pos:o.pos.map(r4),rot:o.rot.map(v=>Math.round(v*10)/10),scl:o.scl.map(v=>+v.toFixed(3))});
  const eachV=(f,step,fn)=>{const v=V();for(const m of f.meshes){const n=m.geometry.attributes.position.count;for(let i=0;i<n;i+=step){m.getVertexPosition(i,v);v.applyMatrix4(m.matrixWorld);fn(v);}}};
  /* 地面につける：体のいちばん低い所を床（高さ0）に */
  const toGround=f=>{pose(f);let lo=1e9;eachV(f,3,v=>{if(v.y<lo)lo=v.y;});if(lo<1e8)f.pos[1]=+(f.pos[1]-lo).toFixed(4);};
  /* figs を渡さないときは、人物ぜんぶと物体ぜんぶ（深度の範囲）。渡したときは、その人物だけ（カメラの向け先・最初からあるポーズの絵） */
  const figBox=figs=>{const all=!figs;figs=figs||S.figs;const box=new THREE.Box3();for(const f of figs){pose(f);eachV(f,6,v=>box.expandByPoint(v));}
    if(all)for(const o of S.objs)if(o.G.visible){poseObj(o);box.expandByObject(o.G);}return box;};
  /* 輪の向き（今の姿勢での、前後・左右・ひねりの回る軸） */
  const axisW=(f,b,k)=>{const I=f.info[b],bone=f.bones[b],pq=bone.parent.getWorldQuaternion(Q());
    if(k===0)return I.pL.clone().applyQuaternion(pq).normalize();
    if(k===1)return I.rL.clone().applyQuaternion(Q().setFromAxisAngle(I.pL,f.ang[b][0]*D2R)).applyQuaternion(pq).normalize();
    return I.tL.clone().applyQuaternion(bone.getWorldQuaternion(Q())).normalize();};
  const placeMarkers=()=>{const f=F();for(const[i,g]of S.figs.entries())for(const[b]of JOINTS){const m=g.marks[b];if(!m)continue;m.visible=i===S.cur&&!S.depthView;if(!m.visible)continue;g.bones[b].getWorldPosition(m.position);const sc=g.height*g.scale*.018;m.scale.setScalar(b===S.sel?sc*1.5:sc);m.material=b===S.sel?mkSel:mkMat;}
    placeMove();
    const z=new THREE.Vector3(0,0,1),jo=!!(f&&S.sel&&f.info[S.sel]),o=O();
    gizmo.visible=!S.depthView&&!S.mv&&(jo||!!o);if(!gizmo.visible)return;
    if(jo){f.bones[S.sel].getWorldPosition(gizmo.position);gizmo.scale.setScalar(f.height*f.scale*(S.sel==='pelvis'?.16:.09));}
    else{/* 物体：中心に、物体より少し大きい輪 */poseObj(o);gizmo.position.copy(o.G.position);const s=o.size;
      gizmo.scale.setScalar(Math.max(.12,Math.max(s.x*Math.abs(o.scl[0]),s.y*Math.abs(o.scl[1]),s.z*Math.abs(o.scl[2]))*.62));}
    for(let k=0;k<3;k++)rings[k].quaternion.setFromUnitVectors(z,gAxis(k));gizmo.updateMatrixWorld(true);};
  /* 移動の矢印の相手：人物は腰の骨、物体は中心。相手がいなくなっていたら矢印をやめる */
  const mvTarget=()=>{const m=S.mv;if(!m)return null;if(m.t==='fig'){const f=S.figs[m.i];if(!f)return null;return{pos:f.pos,at:f.bones.pelvis?f.bones.pelvis.getWorldPosition(V()):f.G.position.clone()};}
    const o=S.objs[m.i];if(!o)return null;poseObj(o);return{pos:o.pos,at:o.G.position.clone()};};
  const placeMove=()=>{const t=mvTarget();if(S.mv&&!t)S.mv=null;mgiz.visible=!!(t&&!S.depthView);if(!mgiz.visible)return;
    mgiz.position.copy(t.at);mgiz.scale.setScalar(Math.max(.05,cam.position.distanceTo(t.at)*.16));mgiz.updateMatrixWorld(true);};
  const enterMove=tg=>{S.mv=tg;if(tg.t==='fig'){S.cur=tg.i;S.osel=null;selJoint(null);drawFigs();drawObjs();}else{S.osel=tg.i;selJoint(null);drawObjs();}
    toast3('矢印をなぞると、その向きに動きます（赤 左右・緑 上下・青 奥と手前）。何もない所をタップすると終わります');draw();};
  /* 輪の軸（関節を選んでいれば関節、そうでなければ選んでいる物体の X・Y・Z。物体の軸は物体といっしょに傾く） */
  const gAxis=k=>{const f=F();if(f&&S.sel&&f.info[S.sel])return axisW(f,S.sel,k);const o=O();
    return new THREE.Vector3(k===0?1:0,k===1?1:0,k===2?1:0).applyQuaternion(o?o.G.quaternion:Q()).normalize();};
  /* 物体を、自分の軸 k のまわりに deg 度回す（角度は X→Y→Z の順のオイラー角でしまう） */
  const objRot=(k,deg)=>{const o=O();if(!o)return;S.oax=k;poseObj(o);
    const q=o.G.quaternion.clone().multiply(Q().setFromAxisAngle(new THREE.Vector3(k===0?1:0,k===1?1:0,k===2?1:0),deg*D2R));
    const e=new THREE.Euler().setFromQuaternion(q,'XYZ');o.rot=[e.x,e.y,e.z].map(v=>{const d=Math.round(v/D2R*100)/100;return d===-180?180:(Object.is(d,-0)?0:d);});drawOAx();draw();};
  const render=()=>{if(!S.figs.length)return;for(const f of S.figs)pose(f);for(const o of S.objs)poseObj(o);scene.updateMatrixWorld(true);placeMarkers();
    const so=O();obox.visible=!!(so&&!S.depthView);if(obox.visible){obox.setFromObject(so.G);}
    grid.visible=!S.depthView;
    if(S.depthView)drawDepthView();
    else{cam.near=.05;cam.far=50;cam.updateProjectionMatrix();scene.overrideMaterial=null;renderer.setClearColor(0x000000,0);renderer.render(scene,cam);}
    drawPos();drawObjVals();};
  const poseAll=()=>{for(const f of S.figs)pose(f);for(const o of S.objs)poseObj(o);scene.updateMatrixWorld(true);};
  /* ===== 深度の画像の作り方（v99）=====
     1) カメラからの距離 z を測る（16bit。境目はぼかさない）。
     2) 明るさは 1/z（近いほど大きい。AI の深度の学習に使われた画像と同じ考え方）。いちばん近い所・遠い所の 0.5% ずつは外れ値として除いて、30〜255 に広げる。
     3) 重なりの境目：すぐ近く（1px・2px 以内）に 3cm 以上手前の所があれば、奥側を少し暗くする（手足と体がくっつかないように）。
     4) 2倍の大きさで作って縮める（輪郭がなめらかになる）。 */
  const rts={};const rtOf=(w,h)=>rts[w+'x'+h]||(rts[w+'x'+h]=new THREE.WebGLRenderTarget(w,h));
  const measure=(c,w,h,figs)=>{fitDepth(c,figs);linMat.uniforms.uN.value=c.near;linMat.uniforms.uF.value=c.far;
    const hid=[markers,gizmo,grid,obox,mgiz].map(o=>[o,o.visible]);hid.forEach(([o])=>o.visible=false);
    const rt=rtOf(w,h),oc=renderer.getClearColor(new THREE.Color()),oa=renderer.getClearAlpha();
    scene.overrideMaterial=linMat;renderer.setRenderTarget(rt);renderer.setClearColor(0x000000,0);renderer.clear();renderer.render(scene,c);
    const buf=new Uint8Array(w*h*4);renderer.readRenderTargetPixels(rt,0,0,w,h,buf);renderer.setRenderTarget(null);scene.overrideMaterial=null;renderer.setClearColor(oc,oa);hid.forEach(([o,v])=>o.visible=v);
    const z=new Float32Array(w*h),N=c.near,FA=c.far;for(let i=0,j=0;i<z.length;i++,j+=4)if(buf[j+3])z[i]=N+((buf[j]+buf[j+1]/255)/255)*(FA-N);return z;};
  /* 縦横 R 画素の中のいちばん小さい値（横→縦の2回に分けて速くする） */
  const minF=(src,w,h,R)=>{const t=new Float32Array(w*h),o=new Float32Array(w*h);
    for(let y=0;y<h;y++){const b=y*w;for(let x=0;x<w;x++){let m=1e9;for(let k=Math.max(0,x-R),e=Math.min(w-1,x+R);k<=e;k++){const v=src[b+k];if(v<m)m=v;}t[b+x]=m;}}
    for(let x=0;x<w;x++)for(let y=0;y<h;y++){let m=1e9;for(let k=Math.max(0,y-R),e=Math.min(h-1,y+R);k<=e;k++){const v=t[k*w+x];if(v<m)m=v;}o[y*w+x]=m;}return o;};
  /* 距離 z から明るさ v を作る。ss は何倍で作ったか（境目の幅に使う） */
  const shade=(z,w,h,ss)=>{const n=w*h,qs=[];for(let i=0;i<n;i+=3)if(z[i])qs.push(1/z[i]);if(!qs.length)return null;qs.sort((a,b)=>a-b);
    const lo=qs[Math.floor(qs.length*.005)],hi=qs[Math.min(qs.length-1,Math.floor(qs.length*.995))],sp=Math.max(1e-6,hi-lo);
    const v=new Float32Array(n);for(let i=0;i<n;i++)if(z[i])v[i]=30+225*Math.max(0,Math.min(1,(1/z[i]-lo)/sp));
    if(sepOn){const zz=new Float32Array(n);for(let i=0;i<n;i++)zz[i]=z[i]||1e9;const m1=minF(zz,w,h,ss),m2=minF(zz,w,h,ss*2),TH=.03;
      for(let i=0;i<n;i++){if(!z[i])continue;if(m1[i]<z[i]-TH)v[i]=Math.max(12,v[i]-55);else if(m2[i]<z[i]-TH)v[i]=Math.max(12,v[i]-25);}}
    return v;};
  /* 「深度で見る」：今の画面の大きさで作って、画面に貼る */
  const drawDepthView=()=>{const s=renderer.getDrawingBufferSize(new THREE.Vector2()),w=s.x,h=s.y,z=measure(cam,w,h),v=shade(z,w,h,1);
    if(!dvTex||dvTex.image.width!==w||dvTex.image.height!==h){if(dvTex)dvTex.dispose();dvTex=new THREE.DataTexture(new Uint8Array(w*h*4),w,h);dvTex.colorSpace=THREE.SRGBColorSpace;dvMat.map=dvTex;dvMat.needsUpdate=true;}
    const a=dvTex.image.data;for(let i=0,j=0;i<w*h;i++,j+=4){const c=v&&z[i]?Math.round(v[i]):0;a[j]=a[j+1]=a[j+2]=c;a[j+3]=255;}dvTex.needsUpdate=true;
    renderer.setClearColor(0x000000,1);renderer.render(dvScene,dvCam);};
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
  const snapData=()=>({figs:S.figs.map(f=>({model:f.model,ang:JSON.parse(JSON.stringify(f.ang)),pos:f.pos.slice(),scale:f.scale,tags:f.tags||''})),cur:S.cur,
    objs:S.objs.map(o=>({id:o.id,name:o.name,pos:o.pos.slice(),rot:o.rot.slice(),scl:o.scl.slice()})),osel:S.osel});
  const snap=()=>{S.undo.push(snapData());if(S.undo.length>UNDO)S.undo.shift();drawUndo();};
  const drawUndo=()=>{const n=S.undo.length;$('.p3un').textContent=n?`（${n}）`:'';$('[data-a="undo"]').disabled=!n;};
  const restore=async d=>{const same=d.figs.length===S.figs.length&&d.figs.every((x,i)=>x.model===S.figs[i].model);
    if(!same){const c={p:cam.position.toArray(),t:ctl.target.toArray()};await loadPose({figs:d.figs.map(x=>({model:x.model,a:x.ang,pos:x.pos,scale:x.scale,tags:x.tags})),cam:c},true);}
    else d.figs.forEach((x,i)=>{const f=S.figs[i];for(const b in f.ang)f.ang[b]=(x.ang[b]||[0,0,0]).slice();f.pos=x.pos.slice();f.scale=x.scale;f.tags=x.tags||'';});
    await syncObjs(d.objs,d.osel);
    S.cur=Math.min(d.cur||0,S.figs.length-1);selJoint(S.sel);drawFigs();draw();};

  /* ===== 人物の切りかえ・足す・外す ===== */
  const drawFigs=()=>{const f=F();
    $('.p3figs').innerHTML=S.figs.map((x,i)=>`<button type="button" data-fig="${i}" class="${i===S.cur?'on':''}">人物${i+1}（${MODELS[x.model]}）</button>`).join('')
      +(S.figs.length<2?'<button type="button" data-fa="add">＋ 2人目を足す</button>':`<button type="button" data-fa="swap">人物1 ⇄ 人物2</button><button type="button" data-fa="del">人物${S.cur+1}を外す</button>`)
      +`<span class="p3sel">${Object.entries(MODELS).map(([k,l])=>`<button type="button" data-model="${k}" class="${f&&f.model===k?'on':''}">${l}</button>`).join('')}</span>`;
    $$('[data-fig]').forEach(b=>b.onclick=()=>{S.cur=+b.dataset.fig;selJoint(null);drawFigs();});
    $$('[data-model]').forEach(b=>b.onclick=()=>changeModel(b.dataset.model));
    $$('[data-fa]').forEach(b=>b.onclick=()=>({add:act.addFig,del:act.delFig,swap:act.swapFig})[b.dataset.fa]());
    $('.p3sz').textContent=f?Math.round(f.scale*100)+'%':'';drawPos();};
  const drawPos=()=>{const f=F();if(!f)return;$$('[data-pv]').forEach(i=>{if(document.activeElement!==i)i.value=Math.round(f.pos[+i.dataset.pv]*100);});};
  const removeFig=f=>{scene.remove(f.G);for(const m of Object.values(f.marks))markers.remove(m);};
  const addFig=async d=>{const f=await makeFig(d.model||'female');if(d.a)for(const[b,v]of Object.entries(d.a))if(f.ang[b])f.ang[b]=v.slice(0,3);
    const p=d.pos;f.pos=!p?[0,0,0]:p.length===2?[p[0],0,p[1]]:p.slice(0,3);f.scale=d.scale||1;f.tags=d.tags||'';if(!p||p.length===2)toGround(f);scene.add(f.G);S.figs.push(f);return f;};
  const changeModel=async m=>{const f=F();if(!f||f.model===m)return;msg.hidden=false;msg.textContent='人形を読み込んでいます…';let n;
    try{n=await makeFig(m);}catch(e){msg.hidden=true;toast3('人形を読み込めませんでした');return;}
    snap();n.ang=JSON.parse(JSON.stringify(f.ang));n.pos=f.pos.slice();n.scale=f.scale;n.tags=f.tags;removeFig(f);scene.add(n.G);S.figs[S.cur]=n;msg.hidden=true;selJoint(null);drawFigs();draw();};
  /* ポーズを丸ごと読みこむ（keep が true なら、戻すの記録は消さない） */
  const loadPose=async(ps,keep)=>{msg.hidden=false;msg.textContent='人形を読み込んでいます…';
    for(const f of S.figs)removeFig(f);S.figs=[];S.cur=0;if(!keep){S.undo=[];drawUndo();}
    const figs=ps&&ps.figs&&ps.figs.length?ps.figs:[{model:'female'}];
    try{for(const d of figs.slice(0,2))await addFig(d);}catch(e){msg.textContent='人形を読み込めませんでした。はじめはネットにつないで開いてください。';return;}
    /* 物体：ポーズに objs があれば入れかえる（ない古いポーズを呼び出したときは、今の物体をそのまま残す） */
    if(ps&&Array.isArray(ps.objs))await setObjs(ps.objs);
    msg.hidden=true;selJoint(null);drawFigs();render();
    if(ps&&ps.cam){cam.position.fromArray(ps.cam.p);ctl.target.fromArray(ps.cam.t);ctl.update();draw();}else setView('front');};
  /* 1人分のポーズ d を、今選んでいる人物だけに当てる（人形・位置の左右と奥行き・大きさはそのまま。地面につけ直す）。ほかの人物はそのまま */
  const applyOne=d=>{const f=F();if(!f)return;for(const b in f.ang)f.ang[b]=d.a&&d.a[b]?d.a[b].slice(0,3):[0,0,0];toGround(f);selJoint(null);drawFigs();draw();};
  /* 保存したポーズ ps を、今の人物・物体に足す（v98）。人物は2人まで（入らない人物は飛ばす）。
     保存したときの並び方を保ったまま、全体を今の人物（人物1）の横へずらす。戻り値：飛ばした人物の数 */
  const p3=p=>!p?[0,0,0]:p.length===2?[p[0],0,p[1]]:p.slice(0,3);
  const addPose=async ps=>{const fs=(ps&&ps.figs)||[],os=(ps&&ps.objs)||[],room=Math.max(0,2-S.figs.length),take=fs.slice(0,room);
    const a=S.figs[0],src=fs.length?p3(fs[0].pos):os.length?os[0].pos.slice():[0,0,0];
    let off=[0,0,0];if(a){const gap=a.height*a.scale*.5+(fs.length?0:.3),side=a.frame.lf.clone().multiplyScalar(-gap);off=[a.pos[0]+side.x-src[0],0,a.pos[2]+side.z-src[2]];}
    msg.hidden=false;msg.textContent='人形を読み込んでいます…';let first=-1;
    try{for(const d of take){const q=p3(d.pos),f=await addFig(Object.assign({},d,{pos:[r4(q[0]+off[0]),q[1],r4(q[2]+off[2])]}));if(!d.pos||d.pos.length===2)toGround(f);if(first<0)first=S.figs.indexOf(f);}}
    catch(e){toast3('人形を読み込めませんでした');}
    let miss=0;for(const d of os){try{const o=await makeObj(Object.assign({},d,{pos:[r4(d.pos[0]+off[0]),d.pos[1],r4(d.pos[2]+off[2])]}));scene.add(o.G);S.objs.push(o);}catch(e){miss++;}}
    if(miss)toast3(miss+'個の物体が見つかりませんでした（この端末に取り込まれていない glb です）');
    msg.hidden=true;if(first>=0)S.cur=first;S.osel=null;selJoint(null);drawFigs();drawObjs();render();return fs.length-take.length;};
  /* 深度ポーズとして保存するときに渡す情報。tags は人物1、tags2 は人物2 のタグ、n は人数 */
  const metaOut=()=>({name:(S.meta&&S.meta.name)||'',cat:(S.meta&&S.meta.cat)||'',tags:(S.figs[0]&&S.figs[0].tags)||'',tags2:(S.figs[1]&&S.figs[1].tags)||'',n:S.figs.length});
  const poseData=()=>({figs:S.figs.map(f=>{const a={};for(const[b,v]of Object.entries(f.ang))if(v.some(x=>x))a[b]=v.map(x=>Math.round(x*10)/10);return{model:f.model,a,pos:f.pos.map(x=>+x.toFixed(4)),scale:+f.scale.toFixed(3),...(f.tags?{tags:f.tags}:{})};}),
    cam:{p:cam.position.toArray().map(v=>+v.toFixed(4)),t:ctl.target.toArray().map(v=>+v.toFixed(4))},...(S.objs.length?{objs:S.objs.map(objData)}:{})});

  /* ===== 物体の画面 ===== */
  const drawObjs=()=>{const so=O();
    $('.p3ol').innerHTML=S.objs.length?S.objs.map((o,i)=>`<button type="button" data-osel="${i}" class="${i===S.osel?'on':''}">${esc(o.name)}</button>`).join('')
      :'<p class="p3hint" style="margin:6px 0 0">まだ置いていません。「📦 物体を呼び出す」から glb ファイルを取り込むと、椅子・ベッドなどの物を置けます。</p>';
    /* 選んでいるとき：設定を道具の欄のいちばん上に出し、画面（3D）を上に止めて、見ながら調整できるようにする（class p3om） */
    if(so&&S.sel)selJoint(null);
    const was=!$('.p3oe').hidden;$('.p3oe').hidden=!so;el.classList.toggle('p3om',!!so);
    if(so){$('.p3on').textContent='物体：'+so.name;if(!was||S._olast!==S.osel){stickTop();el.scrollTop=0;}}else stage.style.top='';/* 止めないときは top を外す（.p3stage は position:relative なので、残すと下にずれる） */S._olast=S.osel;
    drawOAx();drawObjVals();draw();};
  const drawOAx=()=>{$$('[data-oa="ax"]').forEach(b=>b.classList.toggle('on',+b.dataset.k===S.oax));};
  /* 止めた画面の上の位置（いちばん上の帯の高さ） */
  const stickTop=()=>{stage.style.top=$('.p3top').offsetHeight+'px';};
  const drawObjVals=()=>{const o=O();if(!o)return;$$('[data-ov]').forEach(i=>{if(document.activeElement===i)return;const k=i.dataset.ov,v=o[{p:'pos',r:'rot',s:'scl'}[k]][+i.dataset.oi];i.value=OK[k].show(v);});};
  const KEY={p:'pos',r:'rot',s:'scl'};
  const setOV=(o,k,i,v)=>{if(k==='r')v=wrapDeg(v);if(k==='s')v=Math.max(.01,Math.min(100,v));o[KEY[k]][i]=k==='p'?r4(v):+(+v).toFixed(4);};
  const objAdd=async(d,quiet)=>{msg.hidden=false;msg.textContent='物体を読み込んでいます…';let o;
    try{o=await makeObj(d);}catch(e){msg.hidden=true;toast3('物体を読み込めませんでした');return null;}
    snap();if(!d.pos){const f=F(),gap=f?f.height*f.scale*.25+Math.max(o.size.x,o.size.z)/2+.1:0,off=f?f.frame.lf.clone().multiplyScalar(-gap):V();
      o.pos=[r4((f?f.pos[0]:0)+off.x),0,r4((f?f.pos[2]:0)+off.z)];objGround(o);}
    scene.add(o.G);S.objs.push(o);S.osel=S.objs.length-1;msg.hidden=true;drawObjs();
    if(!quiet)toast3('「'+o.name+'」を置きました'+(o.fit?'（大きさを 1m に合わせました）':''));return o;};
  /* 物体のボタン（.p3obj の一覧と、いちばん上の .p3oe の設定）。data-osel・data-ok・data-oa だけを受ける */
  $('.p3tool').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const ds=b.dataset;
    if(ds.osel!=null){const i=+ds.osel;S.osel=S.osel===i?null:i;drawObjs();return;}
    const o=O();if(!o)return;
    if(ds.oa==='desel'){S.osel=null;drawObjs();$('.p3obj').scrollIntoView({block:'nearest'});return;}
    if(ds.oa==='ax'){S.oax=+ds.k;drawOAx();return;}
    if(ds.oa==='rs'){snap();objRot(S.oax,(+ds.d)*5);return;}
    if(ds.ok){snap();const k=ds.ok,i=+ds.oi;setOV(o,k,i,o[KEY[k]][i]+(+ds.d)*OK[k].st);draw();return;}
    if(!ds.oa)return;
    if(ds.oa==='sAll'){snap();const m=+ds.d>0?1.1:1/1.1;for(let i=0;i<3;i++)setOV(o,'s',i,o.scl[i]*m);draw();}
    else if(ds.oa==='ground'){snap();objGround(o);draw();toast3('物体のいちばん低い所を地面につけました');}
    else if(ds.oa==='rot0'){snap();o.rot=[0,0,0];draw();}
    else if(ds.oa==='scl0'){snap();o.scl=[1,1,1];draw();}
    else if(ds.oa==='dup'){const d=objData(o);d.pos=[r4(d.pos[0]+.2),d.pos[1],d.pos[2]];objAdd(d,true);}
    else if(ds.oa==='del'){snap();removeObj(o);S.objs.splice(S.osel,1);S.osel=null;drawObjs();}});
  $('.p3tool').addEventListener('change',e=>{const inp=e.target.closest('[data-ov]');const o=O();if(!inp||!o)return;const v=parseFloat(inp.value);if(!isFinite(v))return drawObjVals();
    snap();const k=inp.dataset.ov;setOV(o,k,+inp.dataset.oi,OK[k].read(v));draw();});
  /* 取り込んだ glb の一覧 */
  const drawOLib=async()=>{const box=$('.p3olist');let L=[];try{L=await ODB.list();}catch(e){box.innerHTML='<p class="p3hint" style="padding:0 10px">この端末の入れ物を開けませんでした。</p>';return;}
    box.innerHTML=L.length?L.map(it=>`<div class="p3it p3oit"><div><b>${esc(it.name)}</b><small>${kb(it.size||0)}</small>
      <div class="p3row"><button type="button" class="btn sm" data-oput="${it.id}">呼び出す</button><button type="button" class="btn ghost sm" data-oren="${it.id}">名前を変える</button><button type="button" class="btn ghost sm" data-odel="${it.id}">消す</button></div></div></div>`).join('')
      :'<p class="p3hint" style="padding:0 10px">まだありません。上の「＋ glb ファイルを取り込む」から取り込めます。</p>';
    const find=id=>L.find(x=>x.id===id);
    box.querySelectorAll('[data-oput]').forEach(b=>b.onclick=async()=>{const it=find(b.dataset.oput);if(!it)return;$('.p3olib').hidden=true;await objAdd({id:it.id,name:it.name});});
    box.querySelectorAll('[data-oren]').forEach(b=>b.onclick=async()=>{const it=find(b.dataset.oren);if(!it)return;const nm=prompt('物体の名前',it.name);if(!nm||!nm.trim())return;
      it.name=nm.trim();await ODB.rename(it);for(const o of S.objs)if(o.id===it.id)o.name=it.name;drawObjs();drawOLib();});
    box.querySelectorAll('[data-odel]').forEach(b=>b.onclick=async()=>{const it=find(b.dataset.odel);if(!it||!confirm('「'+it.name+'」をこの端末から消しますか？\n（今置いている物体はそのまま残りますが、保存したポーズで呼び出せなくなります）'))return;
      await ODB.del(it.id);drawOLib();});};
  $('.p3oin').onchange=async e=>{const fs=[...e.target.files];e.target.value='';let n=0,last=null;
    for(const f of fs){try{const buf=await f.arrayBuffer();const head=new TextDecoder().decode(new Uint8Array(buf,0,Math.min(4,buf.byteLength)));if(head!=='glTF'){toast3('「'+f.name+'」は glb ではありません');continue;}
        await parseGlb(buf.slice(0));const m={id:'g'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:f.name.replace(/\.glb$/i,''),size:buf.byteLength,created:Date.now()};
        await ODB.add(m,buf);n++;last=m;}catch(err){toast3('「'+f.name+'」を読み込めませんでした');}}
    await drawOLib();
    /* 1つだけ取り込んだときは、そのまま置く */
    if(n===1&&fs.length===1){$('.p3olib').hidden=true;await objAdd({id:last.id,name:last.name});}else if(n)toast3(n+'個の glb を取り込みました');};

  /* ===== 関節 ===== */
  const showAng=()=>{const f=F(),b=S.sel;if(!f||!b||!f.info[b]){$('.p3ang').textContent='';return;}const k=S.ax,L=f.info[b].lim[k];
    $('.p3ang').innerHTML=`<span style="color:${hex(AXC[k])}">${AXN[k]}</span> ${Math.round(f.ang[b][k])}°`+(b==='pelvis'?'':`（ふつうは ${L[0]}〜${L[1]}°）`);};
  const selJoint=b=>{S.sel=b&&F()&&F().info[b]?b:null;if(S.sel)S.mv=null;if(S.sel&&S.osel!=null){S.osel=null;drawObjs();}/* 関節を選んだら、物体の選択はやめる */const j=JOINTS.find(x=>x[0]===S.sel);$('.p3jn b').textContent=j?j[1]:'（体の点をタップ）';showAng();draw();};
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
  let rd=null,pd=null,pan=null,nPtr=0,mvd=null,lastTap=null;
  const scr=p=>{const r=cv.getBoundingClientRect(),q=p.clone().project(cam);return{x:r.left+(q.x+1)/2*r.width,y:r.top+(1-q.y)/2*r.height};};
  const rayAt=e=>{const r=cv.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,cam);};
  /* 指の下の人物・物体（いちばん手前）。なければ null */
  const pickAt=e=>{rayAt(e);const L=[...S.figs.map((f,i)=>({G:f.G,t:'fig',i})),...S.objs.map((o,i)=>({G:o.G,t:'obj',i}))];
    const h=ray.intersectObjects(L.map(x=>x.G),true)[0];if(!h)return null;return L.find(x=>{let n=h.object;while(n){if(n===x.G)return true;n=n.parent;}return false;})||null;};
  /* 長押しで、カメラを平行に動かす（OrbitControls を止めて、画面のなぞった分だけ動かす） */
  const panBy=(dx,dy)=>{const h=cv.getBoundingClientRect().height||1,dist=cam.position.distanceTo(ctl.target),k=2*dist*Math.tan(cam.fov*D2R/2)/h;
    const rgt=new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld,0),upv=new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld,1);
    const off=rgt.multiplyScalar(-dx*k).add(upv.multiplyScalar(dy*k));cam.position.add(off);ctl.target.add(off);ctl.update();draw();};
  const endPan=()=>{if(pd&&pd.lp)clearTimeout(pd.lp);if(pan){pan=null;ctl.enabled=true;cv.classList.remove('p3pan');}};
  cv.addEventListener('pointerdown',()=>{nPtr++;if(nPtr>1)endPan();},true);
  cv.addEventListener('pointerup',()=>{nPtr=Math.max(0,nPtr-1);},true);cv.addEventListener('pointercancel',()=>{nPtr=Math.max(0,nPtr-1);endPan();},true);
  cv.addEventListener('pointerdown',e=>{if(pd&&pd.lp)clearTimeout(pd.lp);pd={x:e.clientX,y:e.clientY,lx:e.clientX,ly:e.clientY,moved:false,id:e.pointerId};
    pd.lp=setTimeout(()=>{if(!pd||pd.moved||rd||nPtr>1)return;pan={id:pd.id};ctl.enabled=false;cv.classList.add('p3pan');if(navigator.vibrate)try{navigator.vibrate(15);}catch(_){}},450);
    /* ダブルタップの2回目（0.35秒以内・30px 以内）は、輪や矢印をつかまない（1回目で関節を選ぶと、指の下に輪が出るため） */
    if(lastTap&&Date.now()-lastTap.t<350&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<30)return;
    /* 移動の矢印をつかんだ：矢印の画面の上の向きに、なぞった分だけ動かす（矢印が画面の奥を向いているときは、上下になぞる） */
    if(mgiz.visible){rayAt(e);const ah=ray.intersectObjects(ahits,false)[0],t=ah&&mvTarget();
      if(t){e.preventDefault();e.stopImmediatePropagation();try{cv.setPointerCapture(e.pointerId);}catch(_){}clearTimeout(pd.lp);snap();
        const k=ah.object.userData.k,L=mgiz.scale.x,s0=scr(mgiz.position),s1=scr(mgiz.position.clone().addScaledVector(AXV[k],L));let dx=s1.x-s0.x,dy=s1.y-s0.y,len=Math.hypot(dx,dy);
        let dir,mpp;if(len>=15){dir={x:dx/len,y:dy/len};mpp=L/len;}
        else{const h=cv.getBoundingClientRect().height||1,away=AXV[k].dot(new THREE.Vector3().subVectors(mgiz.position,cam.position))>0;dir={x:0,y:away?-1:1};mpp=2*cam.position.distanceTo(mgiz.position)*Math.tan(cam.fov*D2R/2)/h;}
        mvd={k,id:e.pointerId,x0:e.clientX,y0:e.clientY,dir,mpp,start:t.pos[k]};return;}}
    if(!gizmo.visible)return;rayAt(e);
    const hit=ray.intersectObjects(hits,false)[0];if(!hit)return;
    e.preventDefault();e.stopImmediatePropagation();try{cv.setPointerCapture(e.pointerId);}catch(_){}
    clearTimeout(pd.lp);const c=ctr();snap();const jo=!!(F()&&S.sel&&F().info[S.sel]);rd={k:hit.object.userData.k,c,a:scrAng(e,c),id:e.pointerId,obj:!jo};
    if(jo){S.ax=rd.k;showAng();}else{S.oax=rd.k;drawOAx();}});
  const ctl=new OrbitControls(cam,cv);ctl.enableDamping=false;ctl.rotateSpeed=.8;ctl.addEventListener('change',draw);
  cv.addEventListener('pointermove',e=>{
    if(pan&&pan.id===e.pointerId&&pd){panBy(e.clientX-pd.lx,e.clientY-pd.ly);pd.lx=e.clientX;pd.ly=e.clientY;pd.moved=true;return;}
    if(pd&&pd.id===e.pointerId){pd.lx=e.clientX;pd.ly=e.clientY;if(Math.hypot(e.clientX-pd.x,e.clientY-pd.y)>8){pd.moved=true;clearTimeout(pd.lp);}}
    if(mvd&&mvd.id===e.pointerId){const t=mvTarget();if(!t)return;const d=((e.clientX-mvd.x0)*mvd.dir.x+(e.clientY-mvd.y0)*mvd.dir.y)*mvd.mpp;t.pos[mvd.k]=r4(mvd.start+d);draw();return;}
    if(!rd||rd.id!==e.pointerId)return;const a=scrAng(e,rd.c);let d=a-rd.a;if(d>Math.PI)d-=2*Math.PI;if(d<-Math.PI)d+=2*Math.PI;rd.a=a;
    const n=gAxis(rd.k),tow=cam.position.clone().sub(gizmo.position).dot(n)>0?1:-1;if(rd.obj)objRot(rd.k,d/D2R*tow);else rotate(rd.k,d/D2R*tow);});
  cv.addEventListener('pointerup',e=>{if(pd&&pd.lp)clearTimeout(pd.lp);if(pan&&pan.id===e.pointerId){endPan();pd=null;return;}if(rd&&rd.id===e.pointerId){rd=null;pd=null;return;}if(mvd&&mvd.id===e.pointerId){mvd=null;pd=null;return;}if(!pd||pd.id!==e.pointerId)return;const t=!pd.moved;pd=null;if(!t)return;
    /* ダブルタップ（0.35秒以内・30px 以内）：人物・物体に移動の矢印を出す */
    const now=Date.now(),dbl=!!(lastTap&&now-lastTap.t<350&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<30);lastTap=dbl?null:{t:now,x:e.clientX,y:e.clientY};
    if(dbl){const tg=pickAt(e);if(tg){enterMove({t:tg.t,i:tg.i});return;}}
    if(S.mv){S.mv=null;draw();}
    const f=F();if(!f)return;const r=cv.getBoundingClientRect();let best=null,bd=1e9;for(const[b]of JOINTS){const m=f.marks[b];if(!m)continue;const p=m.position.clone().project(cam);const d=Math.hypot(r.left+(p.x+1)/2*r.width-e.clientX,r.top+(1-p.y)/2*r.height-e.clientY);if(d<bd){bd=d;best=b;}}
    if(bd<34)return selJoint(best);
    /* 関節の点から遠いときは、物体をタップしたか見る */
    if(S.objs.length){ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,cam);
      const h=ray.intersectObjects(S.objs.map(o=>o.G),true)[0];
      if(h){const i=S.objs.findIndex(o=>{let n=h.object;while(n){if(n===o.G)return true;n=n.parent;}return false;});if(i>=0){S.osel=i;selJoint(null);drawObjs();return;}}}
    selJoint(null);});
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
    objLib:()=>{$('.p3olib').hidden=false;drawOLib();},
    objLibClose:()=>{$('.p3olib').hidden=true;},
    libSave:()=>{if(!o.lib)return;const nm=$('.p3nm').value.trim()||('ポーズ '+((o.lib.list()||[]).length+1));const th=thumb();o.lib.save({id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:nm,pose:poseData(),thumb:th,meta:S.meta||null,created:Date.now()});$('.p3nm').value='';drawLib();toast3('「'+nm+'」を保存しました');},
    save:async()=>{const b=await depthBlob(OW,OH);if(!b)return;o.onSave&&o.onSave(b,poseData(),metaOut());history.back();},
    swapFig:()=>{if(S.figs.length<2)return;snap();S.figs.reverse();S.cur=1-S.cur;selJoint(null);drawFigs();draw();toast3('人物1と人物2を入れかえました');},
    png:async()=>{const b=await depthBlob(OW,OH);if(!b)return;const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='depth3d_'+Date.now()+'.png';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},4000);}};
  $$('[data-a]').forEach(b=>{if(act[b.dataset.a])b.onclick=act[b.dataset.a];});
  {const c=$('.p3sep');c.checked=sepOn;c.onchange=()=>{sepOn=c.checked;try{localStorage.setItem('p3sep',sepOn?'1':'0');}catch(_){}for(const k in PRE_IMG)delete PRE_IMG[k];draw();};}
  /* 保存したポーズの一覧 */
  /* 人物ごとのタグの欄（今の人物の順。入れるとすぐ人物に覚える） */
  const drawLTags=()=>{const box=$('.p3ltags');box.innerHTML=S.figs.map((f,i)=>`<label class="p3tg"><span>人物${i+1}（${MODELS[f.model]}）のタグ</span><input data-ltag="${i}" value="${esc(f.tags||'')}" placeholder="例：hand on hip, looking at viewer"></label>`).join('')
      +`<p class="p3hint" style="margin:4px 0 0">タグは人物ごとに、ポーズといっしょに保存されます。深度ポーズとして保存すると部品にも入り、シーンでは人物ごとにプロンプトに入ります。人物1・人物2の順は、人物の欄の「人物1 ⇄ 人物2」で入れかえられます。</p>`;
    box.querySelectorAll('[data-ltag]').forEach(inp=>inp.oninput=()=>{const f=S.figs[+inp.dataset.ltag];if(f)f.tags=inp.value.trim();});};
  /* 古い保存（タグが meta にだけある1人のポーズ）は、人物1のタグとして読む */
  const poseOf=it=>{const ps=JSON.parse(JSON.stringify(it.pose||{}));const fs=ps.figs||[];if(fs.length===1&&!fs[0].tags&&it.meta&&it.meta.tags)fs[0].tags=it.meta.tags;return ps;};
  const fmtPose=it=>{const fs=(it.pose&&it.pose.figs)||[],os=(it.pose&&it.pose.objs)||[];
    return fs.map(f=>MODELS[f.model]||'人物').join('＋')+(os.length?'＋'+os.map(x=>x.name||'物体').join('・'):'')+(fs.some(f=>f.tags)?'<br>タグ：'+fs.map((f,i)=>f.tags?`人物${i+1} ${esc(f.tags)}`:'').filter(Boolean).join(' ／ '):'');};
  const drawLib=()=>{const L=(o.lib&&o.lib.list())||[];const box=$('.p3list');drawLTags();
    box.innerHTML=L.length?L.map(it=>{const n=((it.pose&&it.pose.figs)||[]).length;return `<div class="p3it">${it.thumb?`<img src="${it.thumb}" alt="">`:'<span class="p3noimg"></span>'}<div><b>${esc(it.name)}</b><small>${fmtPose(it)}</small>
      <div class="p3row"><button type="button" class="btn sm" data-ladd="${it.id}">足す</button><button type="button" class="btn ghost sm" data-lu="${it.id}">入れかえる</button>${n===1?`<button type="button" class="btn ghost sm" data-lone="${it.id}">形だけ当てる</button>`:''}<button type="button" class="btn ghost sm" data-ld="${it.id}">消す</button></div></div></div>`;}).join('')
      :'<p class="p3hint" style="padding:0 10px">まだありません。上の「今のポーズを保存」で保存できます。</p>';
    const pick=b=>{const it=L.find(x=>x.id===(b.dataset.ladd||b.dataset.lu||b.dataset.lone));if(it){$('.p3lib').hidden=true;snap();}return it;};
    /* 足す：今の人物・物体はそのまま、保存した人物（2人まで）と物体を横に足す */
    $$('[data-ladd]').forEach(b=>b.onclick=async()=>{const it=pick(b);if(!it)return;const skip=await addPose(poseOf(it));if(!S.meta)S.meta=it.meta||null;
      toast3('「'+it.name+'」を足しました'+(skip?'（人物は2人までなので、人物'+skip+'人は足していません）':''));});
    /* 入れかえる：保存したときと同じにする（人物・物体・カメラ） */
    $$('[data-lu]').forEach(b=>b.onclick=async()=>{const it=pick(b);if(!it)return;const ps=poseOf(it);ps.objs=ps.objs||[];await loadPose(ps,true);S.meta=it.meta||null;toast3('「'+it.name+'」に入れかえました');});
    /* 形だけ当てる（1人のポーズ）：選んでいる人物に関節の角度とタグだけを当てる */
    $$('[data-lone]').forEach(b=>b.onclick=()=>{const it=pick(b);if(!it)return;const d=poseOf(it).figs[0];applyOne(d);if(d.tags&&F())F().tags=d.tags;S.meta=it.meta||null;toast3('「'+it.name+'」の形を人物'+(S.cur+1)+'に当てました');});
    $$('[data-ld]').forEach(b=>b.onclick=()=>{const it=L.find(x=>x.id===b.dataset.ld);if(!it||!confirm('「'+it.name+'」を消しますか？'))return;o.lib.del(it.id);drawLib();});
    $('.p3pre').innerHTML=PRESETS.map((it,i)=>`<div class="p3it">${PRE_IMG[i]?`<img src="${PRE_IMG[i]}" alt="" data-pimg="${i}">`:`<span class="p3noimg" data-pimg="${i}"></span>`}<div><b>${esc(it.name)}</b><small>タグ：${esc(it.tags)}</small>
      <div class="p3row"><button type="button" class="btn sm" data-pre="${i}">呼び出す</button></div></div></div>`).join('');
    makePreImgs();
    $$('[data-pre]').forEach(b=>b.onclick=async()=>{const it=PRESETS[+b.dataset.pre];if(!it)return;$('.p3lib').hidden=true;snap();
      applyOne(it.pose.figs[0]);if(F())F().tags=it.tags;S.meta={name:it.name,tags:it.tags,cat:it.cat};if(S.figs.length<2)setView(it.view||'front');toast3('「'+it.name+'」を呼び出しました'+(S.figs.length>1?'（人物'+(S.cur+1)+'に当てました）':''));});};
  /* 最初からあるポーズの絵：見えない人形を1体作り、ポーズを当てて、その人形だけを深度で描く */
  let preBusy=false;
  const makePreImgs=async()=>{if(preBusy)return;preBusy=true;
    try{for(let i=0;i<PRESETS.length;i++){if(PRE_IMG[i])continue;const it=PRESETS[i];const t=await makeFig(F()?F().model:'female');
        for(const m of Object.values(t.marks))markers.remove(m);for(const b in t.ang)t.ang[b]=it.pose.figs[0].a[b]?it.pose.figs[0].a[b].slice():[0,0,0];
        scene.add(t.G);toGround(t);const hide=[...S.figs,...S.objs],vis=hide.map(f=>f.G.visible);hide.forEach(f=>f.G.visible=false);
        const c2=cam.clone();c2.aspect=OW/OH;c2.updateProjectionMatrix();frameCam(c2,[t],it.view);PRE_IMG[i]=thumb([t],c2);
        hide.forEach((f,j)=>f.G.visible=vis[j]);scene.remove(t.G);
        const im=el.querySelector(`.p3pre [data-pimg="${i}"]`);if(im&&PRE_IMG[i])im.outerHTML=`<img src="${PRE_IMG[i]}" alt="" data-pimg="${i}">`;}}
    finally{preBusy=false;draw();}};
  /* 深度の画像：手前ほど白、背景は透明（作り方は上の「深度の画像の作り方」）。2倍で作って、縮めるときに輪郭の半透明も作る */
  /* figs と c2 を渡すと、その人物だけを、そのカメラで描く（最初からあるポーズの絵に使う） */
  const depthCanvas=(W,H,figs,c2)=>{if(!S.figs.length&&!figs)return null;poseAll();
    if(!c2){c2=cam.clone();c2.aspect=OW/OH;c2.updateProjectionMatrix();}
    const SS=2,w=W*SS,h=H*SS,z=measure(c2,w,h,figs),v=shade(z,w,h,SS);draw();
    const k=document.createElement('canvas');k.width=W;k.height=H;if(!v)return k;const g=k.getContext('2d'),d=g.createImageData(W,H),a=d.data;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){let s=0,c=0;for(let yy=0;yy<SS;yy++)for(let xx=0;xx<SS;xx++){const i=(y*SS+yy)*w+x*SS+xx;if(z[i]){s+=v[i];c++;}}
      if(!c)continue;const o=((H-1-y)*W+x)*4;a[o]=a[o+1]=a[o+2]=Math.round(s/c);a[o+3]=Math.round(255*c/(SS*SS));}/* 測った絵は下の行から並ぶので、上下を返す */
    g.putImageData(d,0,0);return k;};
  const depthBlob=(W,H)=>{const k=depthCanvas(W,H);return k?new Promise(r=>k.toBlob(r,'image/png')):Promise.resolve(null);};
  const thumb=(figs,c2)=>{const k=depthCanvas(120,137,figs,c2);if(!k)return null;const t=document.createElement('canvas');t.width=120;t.height=137;const g=t.getContext('2d');g.fillStyle='#000';g.fillRect(0,0,120,137);g.drawImage(k,0,0);return t.toDataURL('image/jpeg',.8);};
  window.__p3dClose=()=>{window.__p3dClose=null;cancelAnimationFrame(raf);ctl.dispose();renderer.dispose();window.removeEventListener('resize',size);el.remove();};
  el.__api={draw,setView,loadPose,cam,pickAt,scr,thumb:()=>thumb(),toGround:()=>{for(const f of S.figs)toGround(f);draw();}};/* 確かめるとき用 */
  window.addEventListener('resize',size);size();drawUndo();drawObjs();
  await loadPose(o.pose||null);size();
}
