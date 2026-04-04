// src/dashboard/dashboard.js
// ─────────────────────────────────────────────────────────────────────────────
// IBC Dashboard – 解析ロジック（dashboard.html から分離）
// CSP 準拠：インラインスクリプト不使用
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

// ── X タブを探す ─────────────────────────────────────────────────────────────
// ダッシュボードは別タブで開くため currentWindow: true は使わず全タブから検索
// 優先度: /home タブ → x.com の任意タブ
function getXTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({}, (allTabs) => {
      const homeTab = allTabs.find(t => t.url && t.url.match(/https?:\/\/(x|twitter)\.com\/home/));
      if (homeTab) { resolve(homeTab); return; }
      const found = allTabs.find(t => t.url && t.url.match(/https?:\/\/(x|twitter)\.com/));
      resolve(found || null);
    });
  });
}

// ── X タブへメッセージ送信 ───────────────────────────────────────────────────
function sendToXTab(message) {
  return new Promise(async (resolve) => {
    const tab = await getXTab();

    if (!tab) {
      resolve({ success: false, reason: 'NO_TAB' });
      return;
    }

    chrome.tabs.sendMessage(tab.id, message, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, reason: 'NOT_READY', error: chrome.runtime.lastError.message });
        return;
      }
      resolve(res || { success: false, reason: 'NO_RESPONSE' });
    });
  });
}

async function getRecentTweets() {
  const res = await sendToXTab({ type: 'GET_TWEETS' });
  if (!res.success) return [];
  return res.tweets || [];
}

// ── NLP ─────────────────────────────────────────────────────────────────────
const JP_STOP = new Set([
  'の','に','は','を','が','で','て','と','や','も','か','な','へ','より','から','まで','にて',
  'において','については','について','による','によって','として','にとって','をめぐって',
  'た','だ','です','ます','ない','ある','いる','する','れる','られる','させる','せる',
  'てる','でる','てい','でい','ており','でいる','してい','している',
  'し','れ','さ','も','こと','として','い','や','れる','など','なり','って','ない',
  'この','ため','その','あの','これ','それ','あれ','よう','という','か','ね','よ','わ',
  'でも','しかし','ただ','また','さらに','そして','なお','ところ','あと','まあ','もう',
  'やはり','やっぱり','ちょっと','とても','すごく','かなり','なんか','なんて','けど',
  'けれど','だから','なので','ので','のに','って','かな','かも','らしい','みたい',
  'ほど','くらい','ぐらい','だけ','しか','ばかり','など','なんて','ってか',
  'いう','いか','いて','いた','おり','おる','あり','あっ','なっ','なく','なる',
  'あと','まず','特に','実は','実際','一応','一番','最も','全て','全部',
  'もの','こと','ところ','わけ','はず','つもり','ため','通り','感じ','意味','必要',
  'ん','て','で','に','は','を','が','の','と','も','や','か','へ','より',
  'ー','・','…','「','」','（','）','、','。','！','？','〜','※','→','←',
  'https','http','com','jp','rt','amp','www','co','pic','twitter','status',
]);
const EN_STOP = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by','from',
  'this','that','is','are','was','were','be','been','have','has','had','do','does','did',
  'will','would','could','should','may','might','can','shall','must','need',
  'it','i','you','he','she','we','they','my','your','his','her','our','their','its',
  'me','him','us','them','who','what','which','where','when','how','why',
  'not','no','nor','so','if','as','up','out','about','into','than','then','there',
  'just','also','like','get','got','all','more','now','new','good','very',
  'know','think','make','say','see','look','want','use','find','give','tell','work',
  'really','actually','basically','literally','definitely','absolutely',
  'one','two','three','first','last','next','same','other','many','much','some','any',
  'here','still','even','back','well','way','day','time','year','people',
  'im','ive','dont','cant','wont','isnt','arent','wasnt','didnt','havent',
  'via','re','amp','rt','cc','vs','etc',
  'today','month','week','started','starting','start','every','always','never','often',
  'sometimes','already','again','another','between','without','through','during','before','after',
  'around','because','while','though','although','however','therefore',
  'something','anything','everything','nothing','someone','anyone','everyone','those','these',
  'made','making','take','took','taking','come','came','coming','going','gone','went',
  'saw','seen','knew','known','thought','thinking','wanted','needed',
  'feel','felt','feeling','show','showed','shown','keep','kept',
  'let','put','set','run','ran',
  'high','low','big','small','long','short','old','young','early','late','hard','easy',
  'free','full','open','close','closed',
  'per','ago','yet','too','each','both','few','lot','lots','enough','almost',
  'maybe','perhaps','probably','quickly','slowly','simply',
  'using','used','being','having',
  'said','says','told','called','call','calls','trying','tried','try',
]);

const segmenter = new TinySegmenter();

function tokenize(text) {
  const cleaned = text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/@\w+/g, '')
    .replace(/pic\.twitter\S*/g, '')
    .trim();

  const tokens = [];

  const jpText = cleaned.replace(/[a-zA-Z0-9]/g, ' ');
  const jpTokens = segmenter.segment(jpText);
  for (const w of jpTokens) {
    const trimmed = w.trim();
    if (trimmed.length >= 2) tokens.push(trimmed);
  }

  const enMatches = cleaned.match(/[a-zA-Z]{3,}/g) || [];
  tokens.push(...enMatches.map(w => w.toLowerCase()));

  const htMatches = text.match(/#[\w\u3040-\u9FFF]{2,}/g) || [];
  tokens.push(...htMatches);

  return tokens;
}

function removeStop(tokens) {
  return tokens.filter(t => {
    if (JP_STOP.has(t)) return false;
    if (EN_STOP.has(t)) return false;
    return true;
  });
}

function freqMap(arr) {
  const m = new Map();
  arr.forEach(t => m.set(t, (m.get(t) || 0) + 1));
  return m;
}

function topN(m, n = 10) {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function entropy(m, total) {
  let h = 0;
  for (const [, v] of m) { const p = v / total; if (p > 0) h -= p * Math.log2(p); }
  const maxH = Math.log2(m.size || 1);
  return maxH === 0 ? 0 : h / maxH;
}

const PALETTE  = ['#7c6af7','#f76a8a','#6af7c8','#f7c56a','#6ab4f7','#f76af7','#a0f76a','#f7976a','#6af7f7','#c86af7'];
const LEVELS   = [
  { max: 20,  label: '健全',     color: '#6af7a0' },
  { max: 40,  label: '軽度偏向', color: '#a0f76a' },
  { max: 60,  label: '中程度',   color: '#f7c56a' },
  { max: 80,  label: '高偏向',   color: '#f7976a' },
  { max: 101, label: '危険',     color: '#f76a6a' },
];

let charts = {};


// ── 著者バー描画 ─────────────────────────────────────────────────────────────
function renderAuthorBars(topAuth, totalTweets) {
  const wrap = document.getElementById('authorBars');
  if (!topAuth.length) {
    wrap.innerHTML = '<div style="color:var(--text-dim);font-size:11px;text-align:center;padding:16px">データなし</div>';
    return;
  }
  const max = topAuth[0].count;
  const CUD_PALETTE = [
    '#4477AA', // 青
    '#EE6677', // 赤
    '#228833', // 緑
    '#CCBB44', // 黄
    '#66CCEE', // 水色
    '#AA3377', // 紫
    '#EE7733', // オレンジ
    '#009988', // 青緑
  ];

  wrap.innerHTML = topAuth.map(({ author, count, avatar }, i) => {
    const pct    = Math.round(count / totalTweets * 100);
    const color  = CUD_PALETTE[i % CUD_PALETTE.length];
    const handle = author.startsWith('@') ? author.slice(1) : author;
    const link   = `https://x.com/${handle}`;
    const avatarHtml = avatar
      ? `<img src="${avatar}" style="width:20px;height:20px;border-radius:50%;margin-right:6px;vertical-align:middle;" />`
      : `<span style="width:20px;height:20px;border-radius:50%;background:${color};display:inline-block;margin-right:6px;vertical-align:middle;font-size:9px;line-height:20px;text-align:center;">${handle[0]?.toUpperCase() || '?'}</span>`;

    return `
      <div class="bar-item">
        <div class="bar-label">
          ${avatarHtml}
          <a href="${link}" target="_blank"
             style="color:var(--text);text-decoration:none;"
             title="${author}">${author}</a>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${(count/max*100).toFixed(1)}%;background:${color}"></div>
        </div>
        <div class="bar-value" style="color:${color}">${count}回 (${pct}%)</div>
      </div>`;
  }).join('');
}

let allTweets = [];

function updateKeywordSelect(topKw) {
  const select = document.getElementById('keywordSelect');
  const current = select.value;
  select.innerHTML = '<option value="">キーワードを選択</option>';
  topKw.forEach(([word]) => {
    const opt = document.createElement('option');
    opt.value = word;
    opt.textContent = word;
    select.appendChild(opt);
  });
  if (current) select.value = current;
}

function renderPostList(keyword) {
  const listEl = document.getElementById('postList');
  if (!keyword) {
    listEl.innerHTML = '<div style="color:#6060a0;font-size:12px;text-align:center;padding:20px;">キーワードを選択すると該当投稿が表示されます</div>';
    return;
  }

  const matched = allTweets.filter(t => {
    const tokens = new Set(removeStop(tokenize(t.text)));
    return tokens.has(keyword);
  });

  if (!matched.length) {
    listEl.innerHTML = '<div style="color:#6060a0;font-size:12px;text-align:center;padding:20px;">該当投稿が見つかりませんでした</div>';
    return;
  }

  listEl.innerHTML = '';
  matched.forEach((t, index) => {
    const handle = t.author.startsWith('@') ? t.author.slice(1) : t.author;
    const profileUrl = `https://x.com/${handle}`;
    const tweetUrl = t.tweetId
      ? `https://x.com/${handle}/status/${t.tweetId}`
      : null;

    const highlighted = t.text.replace(
      new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
      `<mark style="background:#f7c56a;color:#0a0a0f;border-radius:2px;padding:0 2px;">$&</mark>`
    );

    // 外側コンテナ
    const outer = tweetUrl ? document.createElement('a') : document.createElement('div');
    if (tweetUrl) {
      outer.href = tweetUrl;
      outer.target = '_blank';
      outer.style.cssText = 'text-decoration:none;display:block;';
    }

    // カード
    const card = document.createElement('div');
    card.style.cssText = `background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px;display:flex;gap:10px;${tweetUrl ? 'cursor:pointer;' : ''}`;

    // 番号
    const num = document.createElement('div');
    num.style.cssText = 'color:#6060a0;font-size:11px;flex-shrink:0;min-width:20px;padding-top:8px;';
    num.textContent = index + 1;

    // アバター
    const avatarLink = document.createElement('a');
    avatarLink.href = profileUrl;
    avatarLink.target = '_blank';
    avatarLink.style.flexShrink = '0';
    if (t.avatar) {
      const img = document.createElement('img');
      img.src = t.avatar;
      img.style.cssText = 'width:32px;height:32px;border-radius:50%;';
      avatarLink.appendChild(img);
    } else {
      const span = document.createElement('span');
      span.style.cssText = 'width:32px;height:32px;border-radius:50%;background:#4477AA;display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;';
      span.textContent = handle[0]?.toUpperCase() || '?';
      avatarLink.appendChild(span);
    }

    // テキスト部分
    const textWrap = document.createElement('div');
    textWrap.style.cssText = 'flex:1;min-width:0;';

    const authorLink = document.createElement('a');
    authorLink.href = profileUrl;
    authorLink.target = '_blank';
    authorLink.style.cssText = 'color:var(--text);text-decoration:none;font-size:12px;font-weight:500;';
    authorLink.textContent = t.author;

    const textEl = document.createElement('div');
    textEl.style.cssText = 'color:#a0a0c0;font-size:12px;margin-top:4px;line-height:1.6;word-break:break-word;';
    textEl.innerHTML = highlighted;

    textWrap.appendChild(authorLink);
    textWrap.appendChild(textEl);

    card.appendChild(num);
    card.appendChild(avatarLink);
    card.appendChild(textWrap);
    outer.appendChild(card);
    listEl.appendChild(outer);
  });

  // 投稿一覧セクションにスクロール
  document.getElementById('postListSection').scrollIntoView({ behavior: 'smooth' });
}

// ── メイン解析 ───────────────────────────────────────────────────────────────
async function runAnalysis() {
  document.getElementById('loading').classList.remove('hidden');

  const tweets = await getRecentTweets().catch(() => []);
  allTweets = tweets;
  document.getElementById('loading').classList.add('hidden');

  if (!tweets.length) {
    document.getElementById('metaChip').textContent = 'データなし — /home をスクロールしてください';
    return;
  }

  // 各投稿をtokenizeして投稿数ベースで集計
  const kwFreq = new Map();
  for (const t of tweets) {
    const tokens = new Set(removeStop(tokenize(t.text)));
    for (const token of tokens) {
      kwFreq.set(token, (kwFreq.get(token) || 0) + 1);
    }
  }

  const topKw     = topN(kwFreq, 10);

  // 投稿者ごとの出現回数とアバターURLを集計
  const authMap = new Map();
  for (const t of tweets) {
    const a = t.author || '不明';
    if (!authMap.has(a)) {
      authMap.set(a, { count: 0, avatar: t.avatar || '' });
    }
    authMap.get(a).count++;
  }
  const topAuth = [...authMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([author, data]) => ({ author, count: data.count, avatar: data.avatar }));

  // スコア計算用に authFreq を作成
  const authFreq = new Map([...authMap.entries()].map(([a, d]) => [a, d.count]));

  // フィルターバブル指数：上位10キーワードの占有率
  const totalForEntropy = [...kwFreq.values()].reduce((a, b) => a + b, 0);
  const top10kwSum = topN(kwFreq, 10).reduce((a, [, v]) => a + v, 0);
  const filterBubbleScore = Math.min(100, Math.round(top10kwSum / totalForEntropy * 100));

  // エコーチェンバー指数：上位5投稿者の占有率
  const top5authSum = topN(authFreq, 5).reduce((a, [, v]) => a + v, 0);
  const echoChamberScore = Math.min(100, Math.round(top5authSum / tweets.length * 100));
  // KPI 更新
  document.getElementById('kpiFilterBubble').textContent = filterBubbleScore;
  document.getElementById('kpiEchoChamber').textContent  = echoChamberScore;
  document.getElementById('kpiTotal').textContent        = tweets.length;
  document.getElementById('kpiAuthors').textContent      = authFreq.size;

  const days = tweets.length > 0
    ? Math.max(1, Math.round((Date.now() - Math.min(...tweets.map(t => t.savedAt))) / 86400000))
    : 0;
  document.getElementById('metaChip').textContent =
    `${tweets.length}件 ・ ${authFreq.size}アカウント ・ 過去${days}日`;

  // キーワード横棒グラフ
  if (charts.kw) charts.kw.destroy();
  const dataLabelPlugin = {
    id: 'dataLabel',
    afterDatasetsDraw(chart) {
      const { ctx, data, chartArea } = chart;
      ctx.save();
      ctx.font = '9px sans-serif';
      ctx.textBaseline = 'middle';
      data.datasets[0].data.forEach((value, i) => {
        const bar = chart.getDatasetMeta(0).data[i];
        const color = data.datasets[0].backgroundColor[i];
        const pct = Math.round(value / tweets.length * 100);
        const x = chartArea.right + 6;
        const y = bar.y;
        ctx.fillStyle = color;
        ctx.fillText(`${value}件 (${pct}%)`, x, y);
      });
      ctx.restore();
    }
  };
  charts.kw = new Chart(document.getElementById('kwDonut').getContext('2d'), {
    type: 'bar',
    data: {
      labels: topKw.map(([w]) => w),
      datasets: [{
        data: topKw.map(([, c]) => c),
        backgroundColor: PALETTE.slice(0, topKw.length),
        borderRadius: 3,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: 80 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#16162a', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1,
          titleColor: '#e0e0f0', bodyColor: '#8080a0', padding: 12,
          callbacks: {
            title: () => '',
            label: ctx => {
              const count = ctx.parsed.x;
              const pct = Math.round(count / tweets.length * 100);
              return ` ${ctx.label}: ${count}件 (${pct}%)`;
            }
          }
        },
      },
      onClick: (event, elements) => {
        if (!elements.length) return;
        const [keyword] = topKw[elements[0].index];
        const select = document.getElementById('keywordSelect');
        select.value = keyword;
        renderPostList(keyword);
      },
      animation: { duration: 700, easing: 'easeInOutQuart' },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#6060a0', font: { size: 9 } },
        },
        y: {
          grid: { display: false },
          ticks: { color: '#e0e0f0', font: { size: 10 } },
        },
      },
    },
    plugins: [dataLabelPlugin],
  });

  // 著者バー
  renderAuthorBars(topAuth, tweets.length);

  updateKeywordSelect(topKw);
  renderPostList(document.getElementById('keywordSelect').value);

  // タイムラインチャート（直近24時間・時間帯別）
  const now     = Date.now();
  const buckets = Array.from({ length: 24 }, (_, i) => ({ h: i, count: 0 }));
  tweets.forEach(t => {
    const hoursAgo = Math.floor((now - t.savedAt) / 3600000);
    if (hoursAgo < 24) buckets[23 - hoursAgo].count++;
  });

  if (charts.tl) charts.tl.destroy();
  charts.tl = new Chart(document.getElementById('timelineChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: buckets.map(b => `-${23 - b.h}h`),
      datasets: [{
        data: buckets.map(b => b.count),
        backgroundColor: 'rgba(124,106,247,0.5)',
        borderColor:     'rgba(124,106,247,0.9)',
        borderWidth: 1, borderRadius: 3,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#16162a', titleColor: '#e0e0f0', bodyColor: '#8080a0', padding: 10 } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6060a0', font: { size: 9 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6060a0', font: { size: 9 } } },
      },
    },
  });
}

// ── イベント登録 ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnReanalyze').addEventListener('click', runAnalysis);
  document.getElementById('keywordSelect').addEventListener('change', e => {
    renderPostList(e.target.value);
  });

  // URLパラメータからキーワードを自動選択
  runAnalysis().then(() => {
    const params = new URLSearchParams(window.location.search);
    const keyword = params.get('keyword');
    if (keyword) {
      const select = document.getElementById('keywordSelect');
      select.value = keyword;
      renderPostList(keyword);
    }
  });
});
