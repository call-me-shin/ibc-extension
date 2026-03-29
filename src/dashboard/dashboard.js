// src/dashboard/dashboard.js
// ─────────────────────────────────────────────────────────────────────────────
// IBC Dashboard – 解析ロジック（dashboard.html から分離）
// CSP 準拠：インラインスクリプト不使用
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

// ── X タブへのメッセージ送信 ─────────────────────────────────────────────────
function getXTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const active = tabs.find(t => t.url && (t.url.includes('x.com') || t.url.includes('twitter.com')));
      if (active) { resolve(active); return; }
      chrome.tabs.query({}, (allTabs) => {
        const found = allTabs.find(t => t.url && (t.url.includes('x.com') || t.url.includes('twitter.com')));
        resolve(found || null);
      });
    });
  });
}

async function getRecentTweets() {
  const tab = await getXTab();
  if (!tab) return [];
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, { type: 'GET_TWEETS' }, (res) => {
      if (chrome.runtime.lastError || !res) { resolve([]); return; }
      resolve(res.tweets || []);
    });
  });
}

// ── NLP ─────────────────────────────────────────────────────────────────────
const JP_STOP = new Set(['の','に','は','を','た','が','で','て','と','し','れ','さ','ある','いる','も','する','から','な','こと','として','い','や','れる','など','なり','って','ない','この','ため','その','あの','これ','それ','あれ','よう','という','か','ね','よ','ー','・','…','「','」','（','）','、','。','！','？','https','http','com','jp','rt','amp','www']);
const EN_STOP = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','this','that','is','are','was','were','be','been','have','has','had','do','does','did','will','would','could','should','it','i','you','he','she','we','they','not','no','so','if','as','up','out','just','also','get','all','more','now','new','like']);

function tokenize(text) {
  return [
    ...(text.match(/[\u3000-\u9FFF\uF900-\uFAFF]{2,8}/g) || []),
    ...(text.match(/[a-zA-Z][a-zA-Z'-]{2,}/g) || []).map(t => t.toLowerCase()),
    ...(text.match(/#[\w\u3040-\u9FFF]+/g) || []),
  ].filter(t => !JP_STOP.has(t) && !EN_STOP.has(t));
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

// ── メイン解析 ───────────────────────────────────────────────────────────────
async function runAnalysis() {
  document.getElementById('loading').classList.remove('hidden');

  const tweets = await getRecentTweets().catch(() => []);
  document.getElementById('loading').classList.add('hidden');

  if (!tweets.length) {
    document.getElementById('metaChip').textContent = 'データなし — /home をスクロールしてください';
    return;
  }

  const allTokens = tweets.flatMap(t => tokenize(t.text));
  const kwFreq    = freqMap(allTokens);
  const authFreq  = freqMap(tweets.map(t => t.author || '不明'));
  const topKw     = topN(kwFreq, 10);
  const topAuth   = topN(authFreq, 10);

  const kwEnt   = entropy(kwFreq,   allTokens.length || 1);
  const authEnt = entropy(authFreq, tweets.length);
  const score   = Math.min(100, Math.round(((1 - kwEnt) * 0.6 + (1 - authEnt) * 0.4) * 100));
  const level   = LEVELS.find(l => score < l.max) || LEVELS[4];
  const topA    = topAuth[0];
  const share   = topA ? Math.round(topA[1] / tweets.length * 100) : 0;

  // KPI 更新
  document.getElementById('kpiBias').textContent      = score;
  document.getElementById('kpiBias').style.color      = level.color;
  document.getElementById('kpiBiasLabel').textContent = level.label;
  document.getElementById('kpiTotal').textContent     = tweets.length;
  document.getElementById('kpiAuthors').textContent   = authFreq.size;
  document.getElementById('kpiTopShare').textContent  = share;
  document.getElementById('kpiTopName').textContent   = topA ? topA[0] : '—';

  const oldest = Math.min(...tweets.map(t => t.savedAt));
  const days   = Math.max(1, Math.round((Date.now() - oldest) / 86400000));
  document.getElementById('metaChip').textContent = `${tweets.length} 件 / 過去 ${days} 日`;

  // Donut チャート
  if (charts.kw) charts.kw.destroy();
  charts.kw = new Chart(document.getElementById('kwDonut').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: topKw.map(([w]) => w),
      datasets: [{ data: topKw.map(([, c]) => c), backgroundColor: PALETTE, borderColor: 'rgba(8,8,16,0.8)', borderWidth: 2, hoverOffset: 8 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: {
        legend:  { position: 'right', labels: { color: '#8080a0', font: { size: 11, family: "'IBM Plex Sans JP',sans-serif" }, boxWidth: 12, padding: 10 } },
        tooltip: { backgroundColor: '#16162a', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, titleColor: '#e0e0f0', bodyColor: '#8080a0', padding: 12 },
      },
      animation: { duration: 700, easing: 'easeInOutQuart' },
    },
  });

  // 著者バー
  const maxCount = topAuth[0] ? topAuth[0][1] : 1;
  document.getElementById('authorBars').innerHTML = topAuth.map(([a, c], i) => `
    <div class="bar-item">
      <div class="bar-label" title="${a}">${a}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(c / maxCount * 100).toFixed(1)}%;background:${PALETTE[i % PALETTE.length]}"></div></div>
      <div class="bar-value">${c}</div>
    </div>`).join('');

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
  runAnalysis();
});
