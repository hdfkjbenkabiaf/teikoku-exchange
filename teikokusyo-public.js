// ============================================================
//  ★ このページは拡張機能なしで誰でも開ける「一般公開ページ」（GitHub Pages等に設置）。
//    bot.js → background.js（拡張機能） → Firebase Realtime Database、と中継されたデータを
//    このページがREST APIで定期的に取得(polling)して表示する。
//    ※ Firebase側のルールで、この合言葉パス配下だけpublicに読めるようにしてある。
// ============================================================
const FIREBASE_DB_URL = "https://daitoucha-teikoku-default-rtdb.firebaseio.com";
const FIREBASE_SECRET = "daitoucha2026x"; // ★ Firebaseの「ルール」タブで設定した合言葉と一致させること
const FIREBASE_FETCH_URL = FIREBASE_DB_URL + "/stocks/" + FIREBASE_SECRET + ".json";
const POLL_INTERVAL_MS = 3000; // 3秒ごとにFirebaseへ取りに行く

// ★ この時間だけFirebase側のupdatedAtが進まなかったら「取得はできているが中身が更新されていない」
//   ＝BOT側（background.js〜Firebase書き込み）が止まっている、とみなして警告表示に切り替える。
const STALE_WARN_MS = 20000; // 20秒（BOT側のFirebase同期は最短1.5秒間隔で動くはずなので十分な余裕を持たせる）

// 既存のrender系関数をそのまま使い回すため、storageCacheのキー名はこれまでと同じにしておく
const STOCK_KEY           = "daitoucha_stocks";
const MARKET_MOOD_KEY     = "daitoucha_market_mood";
const STOCK_LIST_DIFF_KEY = "daitoucha_stocklist_diff";

// Firebaseから取得した最新データをここにキャッシュしておき、renderAllは同期的に読む
// 形： { stockData: {...}, mood: {...}, diff: {...}, updatedAt: number }
let storageCache = {};

// bot.js の BASE_STOCK_LIST と同一内容（銘柄コード・社名・基準株価・業種・企業規模）
const BASE_STOCK_LIST = [
  { id:"TREX", name:"大紅茶農園",             basePrice:4800,  sector:"農業",      tier:"small"  },
  { id:"TPOT", name:"皇帝茶器製造所",         basePrice:11800, sector:"製造",      tier:"medium" },
  { id:"TMIL", name:"帝国近衛軍需産業",       basePrice:6900,  sector:"軍需",      tier:"small"  },
  { id:"TMED", name:"紅茶帝国放送局",         basePrice:3400,  sector:"メディア",  tier:"small"  },
  { id:"TBNK", name:"大紅茶帝国銀行",         basePrice:26400, sector:"金融",      tier:"medium" },
  { id:"TEXP", name:"帝国海外遺跡探索隊",     basePrice:5900,  sector:"冒険",      tier:"small"  },
  { id:"TFOD", name:"帝国食糧公社",           basePrice:4100,  sector:"食料",      tier:"small"  },
  { id:"TBRD", name:"皇帝パン工房",           basePrice:3000,  sector:"食料",      tier:"small"  },
  { id:"TWNE", name:"帝国醸造所",             basePrice:5500,  sector:"食料",      tier:"small"  },
  { id:"THSP", name:"帝国総合医療院",         basePrice:22700, sector:"医療",      tier:"medium" },
  { id:"TPHR", name:"帝国製薬会社",           basePrice:30000, sector:"医療",      tier:"medium" },
  { id:"TVET", name:"帝国獣医局",             basePrice:7600,  sector:"医療",      tier:"small"  },
  { id:"TRWY", name:"帝国鉄道公社",           basePrice:10000, sector:"交通",      tier:"medium" },
  { id:"TSHP", name:"帝国海運会社",           basePrice:6600,  sector:"交通",      tier:"small"  },
  { id:"TAIR", name:"帝国航空局",             basePrice:19100, sector:"交通",      tier:"medium" },
  { id:"TTEC", name:"紅茶帝国テック社",       basePrice:45500, sector:"テック",    tier:"large"  },
  { id:"TNET", name:"帝国通信網",             basePrice:40000, sector:"テック",    tier:"large"  },
  { id:"TRBT", name:"帝国ロボット研究所",     basePrice:56400, sector:"テック",    tier:"large"  },
  { id:"TENR", name:"帝国エネルギー公社",     basePrice:43300, sector:"エネルギー",tier:"large"  },
  { id:"TSOL", name:"帝国太陽光発電所",       basePrice:15500, sector:"エネルギー",tier:"medium" },
  { id:"TNUC", name:"帝国核融合研究所",       basePrice:67300, sector:"エネルギー",tier:"large"  },
  { id:"TMIN", name:"紅帝採掘",               basePrice:8000,  sector:"資源",      tier:"small"  },
  { id:"TINS", name:"紅帝保険",               basePrice:20900, sector:"金融",      tier:"medium" },
  { id:"TCAF", name:"紅茶カフェチェーン",     basePrice:3700,  sector:"食料",      tier:"small"  },
  { id:"TFLW", name:"帝国花卉園芸",           basePrice:4400,  sector:"農業",      tier:"small"  },
  { id:"TTOY", name:"皇帝玩具工房",           basePrice:5100,  sector:"製造",      tier:"small"  },
  { id:"TPRT", name:"帝国印刷出版社",         basePrice:4600,  sector:"メディア",  tier:"small"  },
  { id:"TFSH", name:"帝国漁業組合",           basePrice:4900,  sector:"食料",      tier:"small"  },
  { id:"TSEC", name:"帝国警備保障",           basePrice:13600, sector:"軍需",      tier:"medium" },
  { id:"TEDU", name:"紅茶帝国教育機構",       basePrice:17300, sector:"メディア",  tier:"medium" },
  { id:"TAGR", name:"大紅茶アグリビジネス",   basePrice:24500, sector:"農業",      tier:"medium" },
  { id:"TCHM", name:"帝国化学工業",           basePrice:28200, sector:"製造",      tier:"medium" },
  { id:"TZAI", name:"紅茶帝国財閥コングロマリット",basePrice:100000,sector:"金融", tier:"large"  },
  { id:"TGAF", name:"帝国宇宙開発機構",       basePrice:89100, sector:"テック",    tier:"large"  },
  { id:"TWLD", name:"世界紅茶物流帝国",       basePrice:78200, sector:"交通",      tier:"large"  },
  { id:"TSBX", name:"茶星バックス",           basePrice:6600,  sector:"食料",      tier:"small"  },
  { id:"TGOK", name:"緑旭飲料",               basePrice:5400,  sector:"食料",      tier:"small"  },
  { id:"TMCD", name:"紅ドナルド",             basePrice:19000, sector:"食料",      tier:"medium" },
  { id:"TNEK", name:"紅猫運輸",               basePrice:15800, sector:"交通",      tier:"medium" },
  { id:"TKEN", name:"紅東建設",               basePrice:13900, sector:"建設",      tier:"medium" },
  { id:"TSEI", name:"紅帝製菓",               basePrice:4800,  sector:"食料",      tier:"small"  },
  { id:"TBKG", name:"バーガー紅王",           basePrice:7200,  sector:"食料",      tier:"small"  },
  { id:"TSVN", name:"7紅フードフォールディング",basePrice:62400, sector:"流通",     tier:"large"  },
  { id:"TFMT", name:"家族の紅マート",         basePrice:31700, sector:"流通",      tier:"medium" },
  { id:"TENT", name:"帝国娯楽公社",           basePrice:12200, sector:"娯楽",      tier:"medium" }
];

const MOOD_META = {
  boom:       { name:"好景気",   color:"var(--mood-boom)"   },
  bubble:     { name:"バブル",   color:"var(--mood-bubble)" },
  crash:      { name:"暴落",     color:"var(--mood-crash)"  },
  depression: { name:"世界恐慌", color:"var(--mood-depr)"   }
};

let activeSector = "全て";
let prevPriceById = {}; // 直前に「このページで」表示していた価格（flash演出用）

function loadJSON(key, fallback){
  const v = storageCache[key];
  return v === undefined || v === null ? fallback : v;
}

// bot.js側のM&A差分（上場廃止・新会社誕生）を反映した「現在の銘柄一覧」を組み立てる
function getEffectiveStockList(){
  const diff = loadJSON(STOCK_LIST_DIFF_KEY, { removed: [], added: [] });
  const removed = diff.removed || [];
  const added = diff.added || [];
  return BASE_STOCK_LIST.filter(s => removed.indexOf(s.id) === -1).concat(added);
}

function clamp(base, price){ return Math.max(Math.round(base*0.1), Math.min(Math.round(base*5), price)); }

function setMoodBar(mood){
  const dot = document.getElementById('moodDot');
  const text = document.getElementById('moodText');
  const meta = mood && MOOD_META[mood.type];
  if (!meta){
    dot.style.background = 'var(--muted)';
    text.className = 'mood-text';
    text.textContent = '市況は平常。全銘柄がゆるやかに変動しています。';
    return;
  }
  dot.style.background = meta.color;
  text.className = 'mood-text active';
  const phaseLabel = mood.phase === 'cooldown' ? '（収束中）' : '';
  text.textContent = '【' + meta.name + phaseLabel + '】 市場全体が' + meta.name + 'の影響を受けています。';
}

// ★ 接続状態インジケーター（追加）：
//   「fetch自体が失敗している」のか「fetchは成功しているがFirebase側の中身(updatedAt)が
//   全く進んでいない＝BOT側で書き込みが止まっている」のかを見分けられるようにする。
//   これがないと、両方とも見た目は「価格が変わらないまま」にしか見えず切り分けができなかった。
function setStatusBar(state, detail){
  const bar = document.getElementById('statusBar');
  const text = document.getElementById('statusText');
  if (!bar || !text) return;
  bar.classList.remove('warn', 'error');
  if (state === 'ok') {
    bar.classList.remove('warn', 'error');
    text.textContent = '接続OK・最終更新 ' + detail;
  } else if (state === 'stale') {
    bar.classList.add('warn');
    text.textContent = 'Firebase取得は成功していますが、' + Math.round(detail/1000) + '秒間データが更新されていません（BOT側のFirebase同期が止まっている可能性）。最終更新 ' + new Date(lastUpdatedAt).toLocaleTimeString('ja-JP');
  } else if (state === 'error') {
    bar.classList.add('error');
    text.textContent = 'Firebaseへの接続に失敗しています（' + detail + '）。ネットワークまたはFirebaseルール設定を確認してください';
  } else {
    text.textContent = '接続中…';
  }
}

function sparkline(hist, up){
  const w=100,h=32;
  // データ点が1点しかない場合はフラットな線として2点に複製する
  const points = hist.length >= 2 ? hist : [hist[0], hist[0]];
  const min = Math.min(...points), max = Math.max(...points);
  const range = (max-min) || 1;
  const pts = points.map((v,i)=>{
    const x = (i/(points.length-1))*w;
    const y = h - ((v-min)/range)*h;
    return x.toFixed(1)+","+y.toFixed(1);
  }).join(" ");
  const color = up ? "var(--up)" : "var(--down)";
  return '<svg class="spark" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none"><polyline points="'+pts+'" fill="none" stroke="'+color+'" stroke-width="1.5"/></svg>';
}

function buildFilters(stockList){
  const sectors = ["全て", ...new Set(stockList.map(s=>s.sector))];
  if (sectors.indexOf(activeSector) === -1) activeSector = "全て";
  const el = document.getElementById('filters');
  el.innerHTML = sectors.map(s=>
    '<button class="filter-btn'+(s===activeSector?' active':'')+'" data-sector="'+s+'">'+s+'</button>'
  ).join('');
  el.querySelectorAll('.filter-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      activeSector = btn.dataset.sector;
      renderAll();
    });
  });
}

function buildDisplayState(stockList, stockData){
  // bot.js の data[id] = { price, history } をそのまま使う。
  // 「変動率」は bot.js が直近ティックで押し込んだ history の最後の値（＝直前価格）と比較して算出する。
  return stockList.map(s=>{
    const entry = (stockData && stockData[s.id]) ? stockData[s.id] : { price: s.basePrice, history: [] };
    const price = entry.price != null ? entry.price : s.basePrice;
    const history = (entry.history || []).concat([price]);
    const lastTickPrice = (entry.history && entry.history.length) ? entry.history[entry.history.length-1] : price;
    const up = price >= lastTickPrice;
    const pctChange = lastTickPrice ? ((price-lastTickPrice)/lastTickPrice*100) : 0;
    return { stock:s, price, history, up, pctChange };
  });
}

function render(rows){
  const grid = document.getElementById('grid');
  const list = activeSector==="全て" ? rows : rows.filter(r=>r.stock.sector===activeSector);
  grid.innerHTML = list.map(r=>{
    const s = r.stock;
    const prev = prevPriceById[s.id];
    const flash = (prev===undefined || prev===r.price) ? '' : (r.price>prev ? ' flash-up' : ' flash-down');
    return '<div class="card'+flash+'" data-id="'+s.id+'">'+
      '<div class="card-top">'+
        '<div><div class="cname">'+s.name+'</div><div class="cid">'+s.id+'</div></div>'+
        '<div class="sector-tag">'+s.sector+'</div>'+
      '</div>'+
      '<div class="price-row">'+
        '<span class="price">'+r.price.toLocaleString()+'</span>'+
        '<span class="change '+(r.up?'up':'down')+'">'+(r.up?'▲':'▼')+' '+Math.abs(r.pctChange).toFixed(2)+'%</span>'+
      '</div>'+
      sparkline(r.history, r.up)+
      '<div class="tier-tag">'+({small:"中小企業",medium:"中堅企業",large:"大企業"}[s.tier]||"—")+'</div>'+
    '</div>';
  }).join('');
}

function renderTicker(rows){
  const track = document.getElementById('tickerTrack');
  const items = rows.map(r=>{
    const s = r.stock;
    return '<span class="tick-item">'+s.id+' <b>'+r.price.toLocaleString()+'</b> <span class="'+(r.up?'up':'down')+'">'+(r.up?'▲':'▼')+Math.abs(r.pctChange).toFixed(2)+'%</span></span>';
  }).join('');
  track.innerHTML = items + items;
}

function renderAll(){
  const stockList = getEffectiveStockList();
  const stockData = loadJSON(STOCK_KEY, null);
  const mood = loadJSON(MARKET_MOOD_KEY, null);

  buildFilters(stockList);

  if (!stockData){
    document.getElementById('grid').innerHTML =
      '<div class="card" style="grid-column:1/-1;text-align:center;color:var(--muted);">'+
      'まだ株価データが届いていません。<br>BOTが起動して最初の価格更新が送信されるまでお待ちください。'+
      '</div>';
    document.getElementById('tickerTrack').innerHTML = '';
    setMoodBar(mood);
    return;
  }

  const rows = buildDisplayState(stockList, stockData);
  render(rows);
  renderTicker(rows);
  setMoodBar(mood);

  const nextPrev = {};
  rows.forEach(r => { nextPrev[r.stock.id] = r.price; });
  prevPriceById = nextPrev;
}

// Firebaseから最新データを取得してstorageCacheへ反映し、再描画する。
// リアルタイムDBのWebSocket購読は使わず、シンプルなREST pollingにしている
// （公開ページなので依存を減らし、GitHub Pagesにそのまま置けるようにするため）。
let lastUpdatedAt = null;
let lastUpdatedAtChangedTs = null; // ★ lastUpdatedAtが最後に「実際に進んだ」時刻（鮮度判定用・追加）
async function pollLoop(){
  try {
    // ★ バグ修正: fetchに`cache:"no-store"`を付けてもURLが常に同一のままだと、
    //   環境によっては経路上のプロキシ/CDNキャッシュにヒットして同じレスポンスが
    //   返り続けることがある。タイムスタンプ付きのクエリを付けて確実に毎回ユニークな
    //   リクエストにする。
    const res = await fetch(FIREBASE_FETCH_URL + "?_=" + Date.now(), { cache: "no-store" });
    if (!res.ok) { setStatusBar('error', 'HTTP ' + res.status); return; }
    const data = await res.json();
    if (!data) {
      storageCache = {};
      renderAll();
      setStatusBar('error', 'データなし（まだBOTから一度も送信されていません）');
      return;
    }

    const now = Date.now();
    const updatedAtChanged = !data.updatedAt || data.updatedAt !== lastUpdatedAt;

    if (updatedAtChanged) {
      lastUpdatedAt = data.updatedAt || null;
      lastUpdatedAtChangedTs = now;
      storageCache = {
        [STOCK_KEY]: data.stockData || null,
        [MARKET_MOOD_KEY]: data.mood || null,
        [STOCK_LIST_DIFF_KEY]: data.diff || { removed: [], added: [] }
      };
      renderAll();
    }

    // ★ 追加: fetch自体は成功し続けているのに、updatedAtが長時間まったく進んでいない場合は
    //   「表示側は正常だがBOT→Firebaseの書き込みが止まっている」ことが分かるよう警告表示に切り替える。
    //   （これまでは無音でconsole.warnされるだけの通信エラー時以外、常に「接続中」のような無表示で、
    //   価格が固まっていてもページを見ただけでは原因を切り分けられなかった）
    if (lastUpdatedAtChangedTs && (now - lastUpdatedAtChangedTs) > STALE_WARN_MS) {
      setStatusBar('stale', now - lastUpdatedAtChangedTs);
    } else if (lastUpdatedAt) {
      setStatusBar('ok', new Date(lastUpdatedAt).toLocaleTimeString('ja-JP'));
    }
  } catch(e) {
    console.warn('[teikokusyo-public] Firebase取得エラー:', e);
    setStatusBar('error', e.message || String(e));
  }
}

function updateClock(){
  document.getElementById('clock').textContent = new Date().toLocaleTimeString('ja-JP');
}

// 初回ロード
pollLoop();
updateClock();
setInterval(updateClock, 1000);
setInterval(pollLoop, POLL_INTERVAL_MS);
