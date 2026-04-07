// src/popup/popup.js — v0.5.1
// ─────────────────────────────────────────────────────────────────────────────
// 修正内容:
//   - Connection error を適切にハンドリングし、ユーザーに原因を表示
//   - getXTab() の精度向上（x.com の /home タブを優先）
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

import { getAIStatus, buildNounSet, clearNounCache, loadCache } from '../lib/ai-nlp.js';

let _isAnalyzing = false;

// ── X タブを探す ─────────────────────────────────────────────────────────────
// 優先度: currentWindow の x.com タブ → 全ウィンドウの x.com タブ
function getXTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      // currentWindow 内で x.com を開いているタブを探す（/home 優先）
      const homeTab = tabs.find(t => t.url && t.url.match(/https?:\/\/(x|twitter)\.com\/home/));
      if (homeTab) { resolve(homeTab); return; }

      const anyXTab = tabs.find(t => t.url && t.url.match(/https?:\/\/(x|twitter)\.com/));
      if (anyXTab) { resolve(anyXTab); return; }

      // currentWindow になければ全ウィンドウから探す
      chrome.tabs.query({}, (allTabs) => {
        const found = allTabs.find(t => t.url && t.url.match(/https?:\/\/(x|twitter)\.com/));
        resolve(found || null);
      });
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
        // content script がまだ起動していない（ページロード直後など）
        resolve({ success: false, reason: 'NOT_READY', error: chrome.runtime.lastError.message });
        return;
      }
      resolve(res || { success: false, reason: 'NO_RESPONSE' });
    });
  });
}

// ── データ取得・削除 ─────────────────────────────────────────────────────────
async function getRecentTweets() {
  const res = await sendToXTab({ type: 'GET_TWEETS' });

  if (!res.success) {
    // reason ごとにユーザー向けメッセージを返す
    const msgs = {
      NO_TAB:    'Xのタブが見つかりません。x.com を開いてください。',
      NOT_READY: 'Xのページを再読み込みするか、拡張機能の更新ボタンをお試しください。',
      NO_RESPONSE: '応答がありませんでした。拡張機能を更新してください。',
    };
    throw new Error(msgs[res.reason] || res.error || '不明なエラー');
  }

  return res.tweets || [];
}

async function clearAllTweets() {
  const res = await sendToXTab({ type: 'CLEAR_TWEETS' });
  if (!res.success) {
    const msgs = {
      NO_TAB:    'Xのタブが見つかりません。x.com を開いてください。',
      NOT_READY: 'Xのページを再読み込みしてから再度お試しください。',
    };
    throw new Error(msgs[res.reason] || res.error || 'クリア失敗');
  }
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

const segmenter = new window.TinySegmenter();

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
  for (const t of arr) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

function topN(m, n = 10) {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

async function analyze(tweets) {
  if (!tweets.length) return null;

  const allTokensRaw = [];
  const tweetTokens = [];
  for (const t of tweets) {
    const tokens = removeStop(tokenize(t.text));
    tweetTokens.push(tokens);
    allTokensRaw.push(...tokens);
  }

  const nounSet = await buildNounSet(allTokensRaw, tweets.length);

  const kwFreq = new Map();
  for (const tokens of tweetTokens) {
    const filtered = new Set(tokens.filter(t => nounSet.has(t)));
    for (const token of filtered) {
      kwFreq.set(token, (kwFreq.get(token) || 0) + 1);
    }
  }

  const topKw = topN(kwFreq, 10);

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

  const authFreq = new Map([...authMap.entries()].map(([a, d]) => [a, d.count]));

  return { topKw, topAuth, total: tweets.length, uniqueAuthors: authFreq.size };
}

// ── Chart.js ─────────────────────────────────────────────────────────────────
let kwChart = null;
const PALETTE = [
  '#7c6af7','#f76a8a','#6af7c8','#f7c56a','#6ab4f7',
  '#f76af7','#a0f76a','#f7976a','#6af7f7','#c86af7',
];

function renderKeywordChart(topKw, totalTweets) {
  const ctx = document.getElementById('kwChart').getContext('2d');
  if (kwChart) kwChart.destroy();
  const kwMaxCount = topKw.length > 0 ? topKw[0][1] : 1;
  const dataLabelPlugin = {
    id: 'dataLabel',
    afterDatasetsDraw(chart) {
      const { ctx, data, chartArea } = chart;
      ctx.save();
      ctx.font = '9px sans-serif';
      ctx.textBaseline = 'middle';
      data.datasets[0].data.forEach((_, i) => {
        const bar = chart.getDatasetMeta(0).data[i];
        const color = data.datasets[0].backgroundColor[i];
        const count = topKw[i][1];
        const pct = Math.round(count / totalTweets * 100);
        const x = chartArea.right + 6;
        const y = bar.y;
        ctx.fillStyle = color;
        ctx.fillText(`${count}件 (${pct}%)`, x, y);
      });
      ctx.restore();
    }
  };
  kwChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: topKw.map(([w]) => w),
      datasets: [{
        data: topKw.map(([, c]) => Math.round(c / kwMaxCount * 100)),
        backgroundColor: PALETTE.slice(0, topKw.length),
        borderRadius: 3,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { right: 70 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a1a26', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1,
          titleColor: '#e8e8f0', bodyColor: '#9090b0', padding: 10,
          callbacks: {
            title: () => '',
            label: ctx => {
              const count = topKw[ctx.dataIndex][1];
              const pct = Math.round(count / totalTweets * 100);
              return ` ${ctx.label}: ${count}件 (${pct}%)`;
            }
          }
        },
      },
      onClick: (event, elements) => {
        if (!elements.length) return;
        const [word] = topKw[elements[0].index];
        const dashUrl = chrome.runtime.getURL('src/dashboard/dashboard.html');
        const targetUrl = dashUrl + '?keyword=' + encodeURIComponent(word);
        chrome.tabs.query({}, (tabs) => {
          const existing = tabs.find(t => t.url && t.url.startsWith(dashUrl));
          if (existing) {
            chrome.tabs.update(existing.id, { url: targetUrl, active: true });
          } else {
            chrome.tabs.create({ url: targetUrl });
          }
        });
      },
      animation: { duration: 600, easing: 'easeInOutQuart' },
      scales: {
        x: {
          max: 100,
          grid: { display: false },
          ticks: { display: false },
        },
        y: {
          grid: { display: false },
          ticks: { color: '#e8e8f0', font: { size: 10 } },
        },
      },
    },
    plugins: [dataLabelPlugin],
  });
}

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

// ── インラインローディング制御 ─────────────────────────────────────────────────
function showInlineLoading(text = 'AI解析中です、少々お待ちください...') {
  const el = document.getElementById('inlineLoading');
  const textEl = document.getElementById('inlineLoadingText');
  if (el) { el.style.display = 'flex'; }
  if (textEl) { textEl.textContent = text; }
  document.getElementById('btnAnalyze').disabled = true;
  document.getElementById('btnRefresh').disabled = true;
}

function hideInlineLoading() {
  const el = document.getElementById('inlineLoading');
  if (el) { el.style.display = 'none'; }
  document.getElementById('btnAnalyze').disabled = false;
  document.getElementById('btnRefresh').disabled = false;
}

// ── メイン解析 ───────────────────────────────────────────────────────────────
async function runAnalysis() {
  if (_isAnalyzing) return;
  _isAnalyzing = true;

  const empty = document.getElementById('emptyState');
  empty.style.display = 'none';

  try {
    const tweets = await getRecentTweets();

    if (tweets.length === 0) {
      empty.style.display = 'block';
      empty.querySelector('.empty-icon').textContent = '📡';
      empty.querySelector('.empty-title').textContent = 'データがまだありません';
      empty.querySelector('.empty-desc').innerHTML =
        'X のタイムラインをスクロールしてください。<br>しばらくブラウジング後に再確認してください。';
      return;
    }

    // キャッシュ確認：あれば即座に表示、なければローディング表示
    const cached = await loadCache();
    const cachedCount = cached?.tweetCount || 0;
    const needsAI = !cached || Math.abs(tweets.length - cachedCount) >= 100;
    if (needsAI) {
      showInlineLoading('AI解析中です、少々お待ちください...');
      await clearNounCache();
    }

    const result = await analyze(tweets);
    const oldest = Math.min(...tweets.map(t => t.savedAt));
    const days   = Math.max(1, Math.round((Date.now() - oldest) / 86400000));
    document.getElementById('statusMeta').textContent =
      `${tweets.length}件 ・ ${result.uniqueAuthors}アカウント ・ 過去${days}日`;
    document.getElementById('kwCount').textContent   = `${result.topKw.length} キーワード`;
    document.getElementById('authCount').textContent = `${result.uniqueAuthors} アカウント`;
    renderKeywordChart(result.topKw, result.total);
    renderAuthorBars(result.topAuth, result.total);

  } catch (e) {
    document.getElementById('statusMeta').textContent = '接続エラー';
    console.warn('[IBC Popup]', e.message);
  } finally {
    hideInlineLoading();
    _isAnalyzing = false;
  }
}

// ── イベント登録 ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // URLパラメータまたはウィンドウタイプでサイドパネルを判定
  const isSidePanel = window.self !== window.top ||
    document.documentElement.clientWidth < 400;

  if (isSidePanel) {
    document.body.style.width = '100%';
    document.body.style.minWidth = '320px';
    document.body.style.maxWidth = '100%';
  } else {
    document.body.style.width = '400px';
  }

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  document.getElementById('btnAnalyze').addEventListener('click', runAnalysis);
  document.getElementById('btnRefresh').addEventListener('click', runAnalysis);

  document.getElementById('btnClear').addEventListener('click', async () => {
    if (!confirm('蓄積したデータをすべて削除しますか？\n削除後はおすすめタブをスクロールすると再収集されます。')) return;
    try {
      await clearNounCache();
      await clearAllTweets();
      console.log('[IBC Popup] Tweets and noun cache cleared.');
      await runAnalysis();
    } catch (e) {
      alert(`削除に失敗しました: ${e.message}`);
    }
  });

  document.getElementById('btnDash').addEventListener('click', () => {
    const dashUrl = chrome.runtime.getURL('src/dashboard/dashboard.html');
    chrome.tabs.query({}, (tabs) => {
      const existing = tabs.find(t => t.url && t.url.startsWith(dashUrl));
      if (existing) {
        chrome.tabs.update(existing.id, { active: true });
        chrome.windows.update(existing.windowId, { focused: true });
      } else {
        chrome.tabs.create({ url: dashUrl });
      }
    });
  });

  document.getElementById('btnSidePanel').addEventListener('click', () => {
    chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
    window.close();
  });

  updateAIStatus();
  updateStatusBar();
  runAnalysis();

  // タブの切り替えを監視（サイドパネル常時表示対応）
  chrome.tabs.onActivated.addListener(() => {
    updateStatusBar();
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
      updateStatusBar();
    }
  });
});

// ── AI 状態表示 ───────────────────────────────────────────────────────────────
async function updateAIStatus() {
  const el = document.getElementById('aiStatus');
  if (!el) return;
  const status = await getAIStatus();
  if (status === 'ready') {
    el.textContent = 'AI強化: 有効';
    el.style.color = '#6af7a0';
  } else if (status === 'downloading') {
    el.textContent = 'AI強化: 準備中';
    el.style.color = '#f7c56a';
  } else {
    el.textContent = 'AI強化: 非対応';
    el.style.color = '#6060a0';
  }
}

// ── ステータスバー更新 ────────────────────────────────────────────────────────
async function updateStatusBar() {
  const statusBar = document.querySelector('.status-bar span:first-child');
  if (!statusBar) return;

  const [activeTab] = await new Promise(resolve =>
    chrome.tabs.query({ active: true, currentWindow: true }, resolve)
  );

  const isHome = activeTab && activeTab.url && activeTab.url.includes('x.com/home');
  const banner = document.getElementById('waitingBanner');

  if (!isHome) {
    statusBar.innerHTML = '<span class="status-dot" style="background:#888888;animation:none;display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:5px;"></span>待機中 — X タイムライン';
    if (banner) banner.style.display = 'block';
    return;
  }

  // isHome が true の場合、おすすめタブかどうかを content script に問い合わせる
  const statusRes = await sendToXTab({ type: 'GET_STATUS' });

  // 失敗時はフォールバック：チェック中扱い
  if (!statusRes || !statusRes.success) {
    statusBar.innerHTML = '<span class="status-dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:5px;animation:pulse 2s infinite;background:#6af7a0;"></span>チェック中 — X タイムライン';
    if (banner) banner.style.display = 'none';
    return;
  }

  if (statusRes.isForYou) {
    statusBar.innerHTML = '<span class="status-dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:5px;animation:pulse 2s infinite;background:#6af7a0;"></span>チェック中 — X タイムライン';
    if (banner) banner.style.display = 'none';
  } else {
    statusBar.innerHTML = '<span class="status-dot" style="background:#888888;animation:none;display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:5px;"></span>待機中 — X タイムライン';
    if (banner) banner.style.display = 'block';
  }
}
