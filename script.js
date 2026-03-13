/* ===================================================
   PromptVar Manager - script.js
   ===================================================
   State:
     prompts        : [{id, tags, prompt}] 最大100件
     currentId      : 編集中ID (null = 新規)
     selectedTags   : 絞り込み中タグ Set
     tagSearchQuery : タグバー検索文字列
     currentVars    : 変数エディタ [{name, value}]
   =================================================== */

const STORAGE_KEY = 'prompt_manager_data';
const MAX_PROMPTS = 100;

let prompts        = [];
let currentId      = null;
let selectedTags   = new Set();
let tagSearchQuery = '';
let currentVars    = [];

// ── Init ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
  renderAll();
});

// ── Storage ────────────────────────────────────────

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    prompts = raw ? JSON.parse(raw) : [];
  } catch (e) {
    prompts = [];
  }
}

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
}

// ── 全体再描画 ─────────────────────────────────────

function renderAll() {
  renderPromptCounter();
  renderTagBar();
  renderPromptList();
  renderVarList();
}

// ── カウンター ─────────────────────────────────────

function renderPromptCounter() {
  document.getElementById('promptCountDisplay').textContent = prompts.length;
}

// ── 編集中ID表示 ───────────────────────────────────

function renderEditingId() {
  const el = document.getElementById('editingId');
  el.textContent = currentId !== null ? `#${currentId}` : '';
}

// ── タグバー ───────────────────────────────────────

/** 全プロンプトからユニークタグをソートして返す */
function getAllTags() {
  const set = new Set();
  prompts.forEach(p => p.tags.forEach(t => set.add(t)));
  return [...set].sort();
}

/** タグバー全体を再描画 */
function renderTagBar() {
  renderSelectedTagChips();
  renderCandidateTags();
}

/** タグ検索インプット変更ハンドラ */
function onTagSearchInput() {
  tagSearchQuery = document.getElementById('tagSearchInput').value.trim().toLowerCase();
  renderCandidateTags();
}

/** 候補タグ一覧を描画
 *  - tagSearchQuery でフィルタ (tag.includes(query))
 *  - selectedTags に含まれるものは already-selected スタイル
 */
function renderCandidateTags() {
  const all = getAllTags();

  // 検索フィルタ
  const filtered = tagSearchQuery
    ? all.filter(t => t.toLowerCase().includes(tagSearchQuery))
    : all;

  const el = document.getElementById('candidateTags');
  el.innerHTML = '';

  if (filtered.length === 0) {
    el.innerHTML = '<span class="no-tags-hint">候補なし</span>';
    return;
  }

  filtered.forEach(tag => {
    const span = document.createElement('span');
    span.className = 'candidate-tag' + (selectedTags.has(tag) ? ' already-selected' : '');
    span.textContent = tag;
    span.onclick = () => addSelectedTag(tag);
    el.appendChild(span);
  });
}

/** 選択済タグチップを描画 */
function renderSelectedTagChips() {
  const el = document.getElementById('selectedTags');
  el.innerHTML = '';

  if (selectedTags.size === 0) {
    el.innerHTML = '<span class="no-tags-hint">（なし）</span>';
    return;
  }

  selectedTags.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    // onclick 文字列でシングルクォートが壊れないよう data属性経由で削除
    chip.innerHTML = `${esc(tag)} <span class="remove-tag" data-tag="${esc(tag)}" onclick="removeSelectedTag(this.dataset.tag)">×</span>`;
    el.appendChild(chip);
  });
}

/** タグを選択済に追加 → 一覧絞り込み */
function addSelectedTag(tag) {
  selectedTags.add(tag);
  renderTagBar();
  renderPromptList();
}

/** タグを選択済から削除 → 絞り込み解除 */
function removeSelectedTag(tag) {
  selectedTags.delete(tag);
  renderTagBar();
  renderPromptList();
}

// ── プロンプト一覧 ─────────────────────────────────

/** selectedTags で絞り込んだプロンプト一覧 */
function getFilteredPrompts() {
  if (selectedTags.size === 0) return prompts;
  return prompts.filter(p =>
    [...selectedTags].every(tag => p.tags.includes(tag))
  );
}

/** プロンプトカード一覧を描画 */
function renderPromptList() {
  const filtered = getFilteredPrompts();
  const el = document.getElementById('promptList');
  el.innerHTML = '';

  // 件数
  const countEl = document.getElementById('filteredCount');
  countEl.innerHTML = selectedTags.size > 0
    ? `<strong>${filtered.length}</strong> / ${prompts.length} 件`
    : `<strong>${prompts.length}</strong> 件`;

  if (filtered.length === 0) {
    const div = document.createElement('div');
    div.className = 'empty-list';
    div.textContent = selectedTags.size > 0 ? '該当なし' : 'プロンプトがありません';
    el.appendChild(div);
    return;
  }

  filtered.forEach(p => {
    const card = document.createElement('div');
    card.className = 'prompt-card' + (p.id === currentId ? ' active' : '');
    card.onclick = () => selectPrompt(p.id);

    const tagsHtml = p.tags.map(t => `<span class="card-tag">${esc(t)}</span>`).join('');
    card.innerHTML = `
      <div class="card-id">#${p.id}</div>
      <div class="card-tags">${tagsHtml}</div>
      <div class="card-preview">${esc(p.prompt || '(空のプロンプト)')}</div>
    `;
    el.appendChild(card);
  });
}

// ── プロンプト選択・編集 ───────────────────────────

/** カードクリック → 編集エリアに読み込む */
function selectPrompt(id) {
  const p = prompts.find(x => x.id === id);
  if (!p) return;

  currentId = id;
  document.getElementById('promptArea').value = p.prompt || '';
  document.getElementById('deleteBtn').style.display = '';

  renderEditTags(p.tags);
  renderEditingId();
  renderPromptList();
  scanVars();
}

/** [Addtag] ボタン → 新規入力モード */
function addNewPrompt() {
  if (prompts.length >= MAX_PROMPTS) {
    showToast(`最大${MAX_PROMPTS}件まで保存できます`);
    return;
  }
  currentId = null;
  document.getElementById('promptArea').value = '';
  document.getElementById('tagAddInput').value = '';
  document.getElementById('deleteBtn').style.display = 'none';
  currentVars = [];

  renderEditTags([]);
  renderEditingId();
  renderPromptList();
  renderVarList();
}

/** [Save] ボタン
 *  - tagAddInput に未確定テキストがある場合 → 新タグとして自動追加
 *  - currentId === null → 新規作成
 *  - currentId !== null → 既存更新
 */
function saveCurrentPrompt() {
  // tagAddInput に残っている入力を自動タグ追加
  flushTagInput();

  const promptText = document.getElementById('promptArea').value.trim();
  const tags = getEditTags();

  if (currentId === null) {
    // 新規
    if (prompts.length >= MAX_PROMPTS) {
      showToast(`最大${MAX_PROMPTS}件まで保存できます`);
      return;
    }
    const newId = prompts.length > 0 ? Math.max(...prompts.map(p => p.id)) + 1 : 1;
    prompts.push({ id: newId, tags, prompt: promptText });
    currentId = newId;
    document.getElementById('deleteBtn').style.display = '';
    showToast('保存しました ✓');
  } else {
    // 更新
    const idx = prompts.findIndex(p => p.id === currentId);
    if (idx !== -1) {
      prompts[idx] = { id: currentId, tags, prompt: promptText };
    }
    showToast('更新しました ✓');
  }

  saveToStorage();
  renderEditingId();
  renderAll();
}

/** [Delete] ボタン */
function deleteCurrentPrompt() {
  if (currentId === null) return;
  if (!confirm('このプロンプトを削除しますか？')) return;

  prompts = prompts.filter(p => p.id !== currentId);
  saveToStorage();

  currentId = null;
  document.getElementById('promptArea').value = '';
  document.getElementById('deleteBtn').style.display = 'none';
  currentVars = [];

  renderEditTags([]);
  renderEditingId();
  renderAll();
  showToast('削除しました');
}

/** [Clear] ボタン → 編集エリアの全入力をクリア (保存データは消さない) */
function clearAll() {
  currentId = null;
  document.getElementById('promptArea').value = '';
  document.getElementById('tagAddInput').value = '';
  document.getElementById('deleteBtn').style.display = 'none';
  currentVars = [];

  renderEditTags([]);
  renderEditingId();
  renderPromptList();
  renderVarList();
  updateVarCount(0);
  showToast('クリアしました');
}

// ── タグ編集 (編集エリア内) ────────────────────────

/** 編集エリアの現在タグ配列を DOM から取得 */
function getEditTags() {
  return [...document.querySelectorAll('.edit-tag-chip[data-tag]')]
    .map(el => el.dataset.tag);
}

/** 編集タグエリアを描画 */
function renderEditTags(tags) {
  const row = document.getElementById('currentTags');
  row.innerHTML = '';
  tags.forEach(tag => appendEditTagChip(tag));
}

/** タグチップを1件追加 */
function appendEditTagChip(tag) {
  const row = document.getElementById('currentTags');
  const chip = document.createElement('span');
  chip.className = 'edit-tag-chip';
  chip.dataset.tag = tag;
  chip.innerHTML = `${esc(tag)} <span class="rm" onclick="removeEditTag(this)">×</span>`;
  row.appendChild(chip);
}

/** タグインプット - 入力変化時 (候補タグ更新は不要、ここでは何もしない) */
function onTagAddInputChange() {
  // 将来的な補完などのフック用
}

/** タグインプット - Enter キーでタグ確定 */
function onTagAddKeydown(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  flushTagInput();
}

/** tagAddInput の値をタグとして確定する
 *  - 空文字は無視
 *  - 既存タグと重複する場合は無視
 *  - 登録済みタグと異なる値でも新タグとして追加（Save時に保存）
 */
function flushTagInput() {
  const input = document.getElementById('tagAddInput');
  const tag = input.value.trim();
  if (!tag) return;

  const existing = getEditTags();
  if (existing.includes(tag)) {
    showToast('既に追加されています');
    input.value = '';
    return;
  }

  appendEditTagChip(tag);
  input.value = '';
}

/** 編集タグを削除 */
function removeEditTag(rmEl) {
  rmEl.parentElement.remove();
}

// ── 変数エディタ (既存機能) ────────────────────────

function onPromptInput() {
  scanVars();
}

/** {{変数名}} を検出して変数リスト更新 */
function scanVars() {
  const prompt = document.getElementById('promptArea').value;
  const regex = /\{\{([^}]+)\}\}/g;
  const found = new Set();
  let m;
  while ((m = regex.exec(prompt)) !== null) found.add(m[1].trim());

  const names = [...found];
  updateVarCount(names.length);

  // 既存入力値を保持
  const prev = {};
  currentVars.forEach(v => { prev[v.name] = v.value; });
  currentVars = names.map(name => ({ name, value: prev[name] ?? '' }));

  renderVarList();
}

function updateVarCount(unique) {
  const el = document.getElementById('varCount'); // 左ペインには置いていないが念のため
  // varCount は prompt-list-pane 内。変数数は topbar の varCount は削除したので不要。
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

/** プロンプトをクリップボードにコピー */
function copyPrompt() {
  const text = document.getElementById('promptArea').value;
  if (!text.trim()) { showToast('コピーする内容がありません'); return; }
  navigator.clipboard.writeText(text).then(() => showToast('コピーしました ✓'));
}

// ── キーボードショートカット ───────────────────────

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('.var-input')) {
    e.preventDefault();
    applyVars();
  }
});

// ── ユーティリティ ─────────────────────────────────

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escRx(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  clearTimeout(t._tid);
  t.classList.add('show');
  t._tid = setTimeout(() => t.classList.remove('show'), 2200);
}
