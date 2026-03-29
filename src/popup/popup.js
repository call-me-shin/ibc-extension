// src/popup/popup.js — v0.3.0
// ─────────────────────────────────────────────────────────────────────────────
// 修正内容:
//   - Connection error を適切にハンドリングし、ユーザーに原因を表示
//   - getXTab() の精度向上（x.com の /home タブを優先）
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

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
      NOT_READY: 'Xのページを再読み込みしてから、もう一度お試しください。',
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
  'の','に','は','を','た','が','で','て','と','し','れ','さ','ある','いる','も',
  'する','から','な','こと','として','い','や','れる','など','なり','って','ない',
  'この','ため','その','あの','これ','それ','あれ','よう','という','か','ね','よ',
  'ー','・','…','「','」','（','）','、','。','！','？','https','http','com','jp','rt','amp','www',
]);
const EN_STOP = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by','from',
  'this','that','is','are','was','were','be','been','have','has','had','do','does','did',
  'will','would','could','should','it','i','you','he','she','we','they','not','no','so',
  'if','as','up','out','just','also','get','all','more','now','new','like',
]);

function tokenize(text) {
  const jp = text.match(/[\u3000-\u9FFF\uF900-\uFAFF]{2,8}/g) || [];
  const en = (text.match(/[a-zA-Z][a-zA-Z'-]{2,}/g) || []).map(t => t.toLowerCase());
  const ht = text.match(/#[\w\u3040-\u9FFF]+/g) || [];
  return [...jp, ...en, ...ht];
}

function removeStop(tokens) {
  return tokens.filter(t => !JP_STOP.has(t) && !EN_STOP.has(t));
}

function freqMap(arr) {
  const m = new Map();
  for (const t of arr) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

function topN(m, n = 10) {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function shannonEntropy(m, total) {
  let h = 0;
  for (const [, v] of m) { const p = v / total; if (p > 0) h -= p * Math.log2(p); }
  const maxH = Math.log2(m.size || 1);
  return maxH === 0 ? 0 : h / maxH;
}

function analyze(tweets) {
  if (!tweets.length) return null;
  const allTokens = tweets.flatMap(t => removeStop(tokenize(t.text)));
  const kwFreq    = freqMap(allTokens);
  const topKw     = topN(kwFreq, 10);
  const authFreq  = freqMap(tweets.map(t => t.author || '不明'));
  const topAuth   = topN(authFreq, 10);
  const kwEnt     = shannonEntropy(kwFreq,  allTokens.length || 1);
  const authEnt   = shannonEntropy(authFreq, tweets.length);
  const score     = Math.min(100, Math.round(((1 - kwEnt) * 0.6 + (1 - authEnt) * 0.4) * 100));
  return { topKw, topAuth, score, total: tweets.length, uniqueAuthors: authFreq.size };
}

// ── Chart.js ─────────────────────────────────────────────────────────────────
let kwChart = null;
const PALETTE = [
  '#7c6af7','#f76a8a','#6af7c8','#f7c56a','#6ab4f7',
  '#f76af7','#a0f76a','#f7976a','#6af7f7','#c86af7',
];

function renderKeywordChart(topKw) {
  const ctx = document.getElementById('kwChart').getContext('2d');
  if (kwChart) kwChart.destroy();
  kwChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: topKw.map(([w]) => w),
      datasets: [{
        data: topKw.map(([, c]) => c),
        backgroundColor: PALETTE,
        borderColor: 'rgba(10,10,15,0.8)',
        borderWidth: 2, hoverOffset: 6,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '62%',
      plugins: {
        legend: { position: 'right', labels: { color: '#9090b0', font: { size: 10, family: "'IBM Plex Sans JP', sans-serif" }, boxWidth: 10, padding: 8 } },
        tooltip: { backgroundColor: '#1a1a26', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, titleColor: '#e8e8f0', bodyColor: '#9090b0', padding: 10,
          callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} 回` } },
      },
      animation: { duration: 600, easing: 'easeInOutQuart' },
    },
  });
}

function renderAuthorBars(topAuth) {
  const wrap = document.getElementById('authorBars');
  if (!topAuth.length) {
    wrap.innerHTML = '<div style="color:var(--text-dim);font-size:11px;text-align:center;padding:16px">データなし</div>';
    return;
  }
  const max = topAuth[0][1];
  wrap.innerHTML = topAuth.map(([author, count], i) => `
    <div class="bar-item">
      <div class="bar-label" title="${author}">${author}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${(count / max * 100).toFixed(1)}%;background:${PALETTE[i % PALETTE.length]}"></div>
      </div>
      <div class="bar-value">${count}</div>
    </div>`).join('');
}

// ── バイアス UI ──────────────────────────────────────────────────────────────
const LEVELS = [
  { max: 20,  label: '健全',     color: '#6af7a0', desc: 'バランスの取れた情報環境です。多様な話題と投稿者が確認されています。' },
  { max: 40,  label: '軽度偏向', color: '#a0f76a', desc: '若干の偏りが見られます。特定の話題が少し優勢になっています。' },
  { max: 60,  label: '中程度',   color: '#f7c56a', desc: '情報の偏りが検出されています。意識的に異なる視点を取り入れましょう。' },
  { max: 80,  label: '高偏向',   color: '#f7976a', desc: 'かなり偏った情報環境です。エコーチェンバーが形成されている可能性があります。' },
  { max: 101, label: '危険',     color: '#f76a6a', desc: '強烈なフィルターバブルが形成されています。情報源の多様化を強くお勧めします。' },
];

function updateScoreUI(score) {
  const level = LEVELS.find(l => score < l.max) || LEVELS[LEVELS.length - 1];
  document.getElementById('scoreNum').textContent   = score;
  document.getElementById('scoreNum').style.color   = level.color;
  document.getElementById('scoreBar').style.width   = `${score}%`;
  document.getElementById('scoreBadge').textContent = level.label;
  document.getElementById('scoreBadge').style.color = level.color;
  document.getElementById('scoreDesc').textContent  = level.desc;
  document.getElementById('scoreCard').style.setProperty('--score-gradient', `linear-gradient(90deg, #6af7a0, ${level.color})`);
}

function setStatusMessage(msg, isError = false) {
  const el = document.getElementById('scoreDesc');
  el.textContent  = msg;
  el.style.color  = isError ? '#f76a6a' : '';
}

// ── メイン解析 ───────────────────────────────────────────────────────────────
async function runAnalysis() {
  const loading = document.getElementById('loading');
  const empty   = document.getElementById('emptyState');

  loading.classList.remove('hidden');
  empty.style.display = 'none';

  try {
    const tweets = await getRecentTweets();

    document.getElementById('statusMeta').textContent = `${tweets.length} 件 / 7日間`;

    if (tweets.length === 0) {
      empty.style.display = 'block';
      document.getElementById('scoreNum').textContent = '—';
      setStatusMessage('データがありません。おすすめタブをスクロールしてください。');
      return;
    }

    const result = analyze(tweets);
    updateScoreUI(result.score);
    document.getElementById('kwCount').textContent   = `${result.topKw.length} トークン種`;
    document.getElementById('authCount').textContent = `${result.uniqueAuthors} アカウント`;
    renderKeywordChart(result.topKw);
    renderAuthorBars(result.topAuth);

  } catch (e) {
    // Connection error など、ユーザーに分かりやすいメッセージを表示
    document.getElementById('scoreNum').textContent = '—';
    document.getElementById('statusMeta').textContent = '接続エラー';
    setStatusMessage(e.message, true);
    console.warn('[IBC Popup]', e.message);
  } finally {
    loading.classList.add('hidden');
  }
}

// ── イベント登録 ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

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
      await clearAllTweets();
      console.log('[IBC Popup] Tweets cleared.');
      await runAnalysis();
    } catch (e) {
      alert(`削除に失敗しました: ${e.message}`);
    }
  });

  document.getElementById('btnDash').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html') });
  });

  runAnalysis();
});
