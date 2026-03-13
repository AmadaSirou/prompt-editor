/* ===================================================
   PromptVar Manager - script.js
   ===================================================
   状態:
     prompts        : プロンプトデータ配列 (最大100件)
     currentId      : 編集中プロンプトのID (null=新規)
     selectedTags   : タグ絞り込み用の選択済タグ Set
     tagSearchQuery : タグ検索文字列
     currentVars    : 変数エディタ用 [{name, value}]
   =================================================== */

const STORAGE_KEY = 'prompt_manager_data';
const MAX_PROMPTS = 100;

// ── State ──────────────────────────────────────────
let prompts      = [];   // [{id, tags, memo, prompt}]
let currentId    = null; // 編集中ID (null = 新規)
let selectedTags = new Set(); // 絞り込み中タグ
let tagSearchQuery = '';
let currentVars  = [];   // [{name, value}]

// ── Init ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
  renderAll();
});

// ── Storage ────────────────────────────────────────

/** localStorageから読み込む */
function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    prompts = raw ? JSON.parse(raw) : [];
  } catch (e) {
    prompts = [];
  }
}

/** localStorageに保存する */
function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
}

// ── 全体描画 ───────────────────────────────────────

function renderAll() {
  renderPromptCounter();
  renderCandidateTags();
  renderSelectedTagChips();
  renderPromptList();
  renderVarList();
}

// ── カウンター ─────────────────────────────────────

function renderPromptCounter() {
  document.getElementById('promptCounter').textContent =
    `${prompts.length} / ${MAX_PROMPTS}`;
}

// ── タグバー ───────────────────────────────────────

/** 全プロンプトからタグ一覧を収集してソート */
function getAllTags() {
  const set = new Set();
  prompts.forEach(p => p.tags.forEach(t => set.add(t)));
  return [...set].sort();
}

/** タグ検索入力ハンドラ */
function onTagSearchInput() {
  tagSearchQuery = document.getElementById('tagSearchInput').value.trim();
  renderCandidateTags();
}

/** 候補タグ描画 */
function renderCandidateTags() {
  const all = getAllTags();
  const q = tagSearchQuery.toLowerCase();
  const filtered = q ? all.filter(t => t.includes(q)) : all;

  const el = document.getElementById('candidateTags');
  el.innerHTML = '';

  if (filtered.length === 0) {
    el.innerHTML = '<span style="font-size:10px;color:var(--text-dim)">候補なし</span>';
    return;
  }

  filtered.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'candidate-tag' + (selectedTags.has(tag) ? ' selected' : '');
    chip.textContent = tag;
    chip.onclick = () => addSelectedTag(tag);
    el.appendChild(chip);
  });
}

/** 選択済タグを追加して絞り込み */
function addSelectedTag(tag) {
  selectedTags.add(tag);
  renderSelectedTagChips();
  renderCandidateTags();
  renderPromptList();
}

/** 選択済タグを削除 */
function removeSelectedTag(tag) {
  selectedTags.delete(tag);
  renderSelectedTagChips();
  renderCandidateTags();
  renderPromptList();
}

/** 選択済タグチップを描画 */
function renderSelectedTagChips() {
  const el = document.getElementById('selectedTags');
  el.innerHTML = '';

  if (selectedTags.size === 0) {
    el.innerHTML = '<span class="no-tags-hint" id="noSelectedHint">（なし）</span>';
    return;
  }

  selectedTags.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = `${esc(tag)} <span class="remove-tag" onclick="removeSelectedTag('${esc(tag)}')">×</span>`;
    el.appendChild(chip);
  });
}

// ── プロンプト一覧 ─────────────────────────────────

/** 選択タグでフィルタされたプロンプト一覧を取得 */
function getFilteredPrompts() {
  if (selectedTags.size === 0) return prompts;
  return prompts.filter(p =>
    [...selectedTags].every(tag => p.tags.includes(tag))
  );
}

/** プロンプト一覧を描画 */
function renderPromptList() {
  const filtered = getFilteredPrompts();
  const el = document.getElementById('promptList');
  el.innerHTML = '';

  // 件数表示
  const countEl = document.getElementById('filteredCount');
  if (selectedTags.size > 0) {
    countEl.innerHTML = `<strong>${filtered.length}</strong> 件`;
  } else {
    countEl.innerHTML = `<strong>${prompts.length}</strong> 件`;
  }

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-list';
    empty.textContent = selectedTags.size > 0 ? '該当するプロンプトがありません' : 'プロンプトがありません';
    el.appendChild(empty);
    return;
  }

  filtered.forEach(p => {
    const card = document.createElement('div');
    card.className = 'prompt-card' + (p.id === currentId ? ' active' : '');
    card.onclick = () => selectPrompt(p.id);

    // タグチップ
    const tagsHtml = p.tags.map(t =>
      `<span class="card-tag">${esc(t)}</span>`
    ).join('');

    card.innerHTML = `
      <div class="card-id">#${p.id}</div>
      <div class="card-tags">${tagsHtml}</div>
      <div class="card-preview">${esc(p.prompt || '(空のプロンプト)')}</div>
    `;
    el.appendChild(card);
  });
}

// ── プロンプト選択・編集 ───────────────────────────

/** プロンプトカードをクリックして編集エリアに読み込む */
function selectPrompt(id) {
  const p = prompts.find(x => x.id === id);
  if (!p) return;

  currentId = id;

  document.getElementById('promptArea').value = p.prompt || '';
  document.getElementById('memoArea').value = p.memo || '';

  // 変数スキャン
  scanVars();
  // タグ編集エリアを更新
  renderEditTags(p.tags);
  // 削除ボタン表示
  document.getElementById('deleteBtn').style.display = '';
  // カード選択ハイライト
  renderPromptList();
}

/** 新規プロンプト入力モードに切り替え */
function addNewPrompt() {
  if (prompts.length >= MAX_PROMPTS) {
    showToast(`最大${MAX_PROMPTS}件まで保存できます`);
    return;
  }

  currentId = null;
  document.getElementById('promptArea').value = '';
  document.getElementById('memoArea').value = '';
  currentVars = [];
  renderVarList();
  renderEditTags([]);
  document.getElementById('deleteBtn').style.display = 'none';
  renderPromptList();
}

/** 現在の編集内容を保存 */
function saveCurrentPrompt() {
  const promptText = document.getElementById('promptArea').value.trim();
  const memoText = document.getElementById('memoArea').value.trim();
  const tags = getEditTags();

  if (currentId === null) {
    // 新規作成
    if (prompts.length >= MAX_PROMPTS) {
      showToast(`最大${MAX_PROMPTS}件まで保存できます`);
      return;
    }
    const newId = prompts.length > 0 ? Math.max(...prompts.map(p => p.id)) + 1 : 1;
    prompts.push({ id: newId, tags, memo: memoText, prompt: promptText });
    currentId = newId;
    document.getElementById('deleteBtn').style.display = '';
    showToast('保存しました ✓');
  } else {
    // 既存更新
    const idx = prompts.findIndex(p => p.id === currentId);
    if (idx !== -1) {
      prompts[idx] = { id: currentId, tags, memo: memoText, prompt: promptText };
    }
    showToast('更新しました ✓');
  }

  saveToStorage();
  renderAll();
}

/** 現在のプロンプトを削除 */
function deleteCurrentPrompt() {
  if (currentId === null) return;
  if (!confirm('このプロンプトを削除しますか？')) return;

  prompts = prompts.filter(p => p.id !== currentId);
  saveToStorage();

  // 編集エリアをリセット
  currentId = null;
  document.getElementById('promptArea').value = '';
  document.getElementById('memoArea').value = '';
  currentVars = [];
  renderVarList();
  renderEditTags([]);
  document.getElementById('deleteBtn').style.display = 'none';

  renderAll();
  showToast('削除しました');
}

// ── タグ編集 (右列) ────────────────────────────────

/** 編集中のタグ配列を取得 (DOM から読む) */
function getEditTags() {
  return [...document.querySelectorAll('.edit-tag-chip[data-tag]')]
    .map(el => el.dataset.tag);
}

/** 編集タグエリアを描画 */
function renderEditTags(tags) {
  const row = document.getElementById('currentTags');
  row.innerHTML = '';

  tags.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'edit-tag-chip';
    chip.dataset.tag = tag;
    chip.innerHTML = `${esc(tag)} <span class="rm" onclick="removeEditTag(this)">×</span>`;
    row.appendChild(chip);
  });
}

/** タグ追加インプット - Enterで追加 */
function onTagAddKeydown(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();

  const input = document.getElementById('tagAddInput');
  const tag = input.value.trim();
  if (!tag) return;

  // 重複チェック
  const existing = getEditTags();
  if (existing.includes(tag)) {
    showToast('既に追加されています');
    return;
  }

  const row = document.getElementById('currentTags');
  const chip = document.createElement('span');
  chip.className = 'edit-tag-chip';
  chip.dataset.tag = tag;
  chip.innerHTML = `${esc(tag)} <span class="rm" onclick="removeEditTag(this)">×</span>`;
  row.appendChild(chip);

  input.value = '';

  // 候補タグに自動反映（自動保存はしない）
  renderCandidateTags();
}

/** タグ削除 */
function removeEditTag(rmEl) {
  rmEl.parentElement.remove();
}

// ── メモ入力ハンドラ ───────────────────────────────

function onMemoInput() {
  // 自動保存はしない（Saveボタン押下時に保存）
}

// ── 変数エディタ (既存機能) ────────────────────────

/** プロンプトが変更されたとき */
function onPromptInput() {
  scanVars();
}

/** {{変数名}} を検出して変数リストを更新 */
function scanVars() {
  const prompt = document.getElementById('promptArea').value;
  const regex = /\{\{([^}]+)\}\}/g;
  const found = new Set();
  let m;
  while ((m = regex.exec(prompt)) !== null) {
    found.add(m[1].trim());
  }

  const names = [...found];
  const totalOcc = (prompt.match(/\{\{[^}]+\}\}/g) || []).length;
  updateVarCount(names.length, totalOcc);

  // 既存の値を保持
  const prev = {};
  currentVars.forEach(v => { prev[v.name] = v.value; });
  currentVars = names.map(name => ({ name, value: prev[name] ?? '' }));

  renderVarList();
}

/** 変数件数の表示更新 */
function updateVarCount(unique, total) {
  const el = document.getElementById('varCount');
  if (unique === 0) { el.innerHTML = ''; return; }
  el.innerHTML = `変数 <strong>${unique}</strong> 種類`;
}

/** 変数リストを描画 */
function renderVarList() {
  const list = document.getElementById('varList');

  if (currentVars.length === 0) {
    list.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'var-list-empty';
    empty.innerHTML = '変数がありません<br><span class="hint">プロンプトに {{変数名}} を入力してください</span>';
    list.appendChild(empty);
    return;
  }

  const focusedVar = document.activeElement?.dataset?.var ?? null;
  list.innerHTML = '';

  currentVars.forEach(v => {
    const row = document.createElement('div');
    row.className = 'var-row';
    row.innerHTML = `
      <div class="var-name" title="${esc(v.name)}"><span>${esc(v.name)}</span></div>
      <input class="var-input" type="text" data-var="${esc(v.name)}"
        value="${esc(v.value)}" placeholder="値を入力..."
        oninput="saveVal(this)">
    `;
    list.appendChild(row);
  });

  // フォーカス復元
  if (focusedVar) {
    const el = list.querySelector(`input[data-var="${CSS.escape(focusedVar)}"]`);
    if (el) { el.focus(); const l = el.value.length; el.setSelectionRange(l, l); }
  }
}

/** 変数の値を保存 */
function saveVal(input) {
  const v = currentVars.find(x => x.name === input.dataset.var);
  if (v) v.value = input.value;
}

/** 変数を一括適用 */
function applyVars() {
  const ta = document.getElementById('promptArea');
  const original = ta.value;
  if (!original.trim()) { showToast('プロンプトが空です'); return; }

  let result = original;
  let replaced = 0;

  currentVars.forEach(v => {
    if (!v.value.trim()) return;
    const rx = new RegExp('\\{\\{' + escRx(v.name) + '\\}\\}', 'g');
    const before = result;
    result = result.replace(rx, v.value);
    if (result !== before) replaced++;
  });

  ta.value = result;
  scanVars();
  showToast(replaced > 0 ? `${replaced} 件の変数を適用しました ✓` : '適用できる値がありません');
}

/** プロンプトエリアをクリア */
function clearPromptArea() {
  document.getElementById('promptArea').value = '';
  currentVars = [];
  renderVarList();
  updateVarCount(0, 0);
  showToast('クリアしました');
}

/** プロンプトをクリップボードにコピー */
function copyPrompt() {
  const text = document.getElementById('promptArea').value;
  if (!text.trim()) { showToast('コピーする内容がありません'); return; }
  navigator.clipboard.writeText(text).then(() => showToast('コピーしました ✓'));
}

// ── キーボードショートカット ───────────────────────

document.addEventListener('keydown', e => {
  // 変数インプットでEnter → 適用
  if (e.key === 'Enter' && e.target.matches('.var-input')) {
    e.preventDefault();
    applyVars();
  }
});

// ── ユーティリティ ─────────────────────────────────

/** HTMLエスケープ */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 正規表現エスケープ */
function escRx(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** トースト通知 */
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  clearTimeout(t._tid);
  t.classList.add('show');
  t._tid = setTimeout(() => t.classList.remove('show'), 2200);
}
