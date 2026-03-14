const STORAGE_KEY = 'promptTags';
let currentVars = []; // [{ name, value }]
let savedTags = [];   // [{ id, prompt, tagname, updatedAt }]
let activeTagId = null;

function scanVars() {
  const prompt = document.getElementById('promptArea').value;
  const regex = /\{\{([^}]+)\}\}/g;
  const found = new Set();
  let m;
  while ((m = regex.exec(prompt)) !== null) {
    found.add(m[1].trim());
  }

  const names = [...found];

  // Count total occurrences (including duplicates) for display
  const totalOcc = (prompt.match(/\{\{[^}]+\}\}/g) || []).length;
  updateVarCount(names.length, totalOcc);

  // Preserve existing input values
  const prev = {};
  currentVars.forEach(v => { prev[v.name] = v.value; });

  currentVars = names.map(name => ({
    name,
    value: prev[name] ?? ''
  }));

  renderVarList();
}

function updateVarCount(unique, total) {
  const el = document.getElementById('varCount');
  if (unique === 0) { el.innerHTML = ''; return; }
  el.innerHTML = `変数 <strong>${unique}</strong> 種類`;
}

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

  if (focusedVar) {
    const el = list.querySelector(`input[data-var="${CSS.escape(focusedVar)}"]`);
    if (el) { el.focus(); const l = el.value.length; el.setSelectionRange(l, l); }
  }
}

function saveVal(input) {
  const v = currentVars.find(x => x.name === input.dataset.var);
  if (v) v.value = input.value;
}

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

function clearPrompt() {
  document.getElementById('promptArea').value = '';
  currentVars = [];
  renderVarList();
  updateVarCount(0, 0);
  showToast('クリアしました');
}

function copyPrompt() {
  const text = document.getElementById('promptArea').value;
  if (!text.trim()) { showToast('コピーする内容がありません'); return; }
  navigator.clipboard.writeText(text).then(() => showToast('コピーしました ✓'));
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  clearTimeout(t._tid);
  t.classList.add('show');
  t._tid = setTimeout(() => t.classList.remove('show'), 2200);
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escRx(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('.var-input')) {
    e.preventDefault();
    applyVars();
  }
});

function exportTags() {
  const blob = new Blob([JSON.stringify(savedTags, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'prompt-tags.json';
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('Export しました');
}

function importTags(fileInput) {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data)) throw new Error('JSON は配列である必要があります');
      savedTags = data
        .filter(t => t && typeof t === 'object')
        .map(t => ({
          id: t.id ?? Date.now() + Math.random(),
          prompt: String(t.prompt ?? ''),
          tagname: String(t.tagname ?? ''),
          updatedAt: t.updatedAt ?? Date.now()
        }));
      activeTagId = null;
      persistTags();
      renderTagList();
      showToast(`${savedTags.length} 件を Import しました`);
    } catch (e) {
      showToast('Import に失敗しました');
    }
  };
  reader.readAsText(file);
}

function saveCurrentPrompt() {
  const tagInput = document.getElementById('tagNameInput');
  const tagname = tagInput.value.trim();
  const prompt = document.getElementById('promptArea').value;

  if (!tagname) {
    showToast('プロンプト名 を入力してください');
    tagInput.focus();
    return;
  }
  if (!prompt.trim()) {
    showToast('保存するプロンプトがありません');
    return;
  }

  const now = Date.now();

  // 既存タグを tagname で検索（同じ tagname は1件だけ扱う）
  let tag = savedTags.find(t => t.tagname === tagname);

  if (tag) {
    tag.prompt = prompt;
    tag.tagname = tagname;
    tag.updatedAt = now;
    activeTagId = tag.id;
  } else {
    const id = now;
    tag = { id, prompt, tagname, updatedAt: now };
    savedTags.push(tag);
    activeTagId = id;
  }

  persistTags();
  renderTagList();
  showToast('保存しました ✓');
}

function newTag() {
  activeTagId = null;
  const tagInput = document.getElementById('tagNameInput');
  const promptArea = document.getElementById('promptArea');
  tagInput.value = '';
  promptArea.value = '';
  currentVars = [];
  renderVarList();
  updateVarCount(0, 0);
  tagInput.focus();
  showToast('新しい tagname を作成します');
}

function deleteTag() {
  if (!savedTags.length) {
    showToast('削除できるタグがありません');
    return;
  }

  const tagInput = document.getElementById('tagNameInput');
  const inputName = tagInput.value.trim();

  let targetId = activeTagId;
  if (!targetId && inputName) {
    const found = savedTags.find(t => t.tagname === inputName);
    if (found) targetId = found.id;
  }

  if (!targetId) {
    showToast('削除するタグを選択してください');
    return;
  }

  savedTags = savedTags.filter(t => t.id !== targetId);
  activeTagId = null;
  persistTags();
  renderTagList();

  // 現在の編集内容もクリア
  tagInput.value = '';
  document.getElementById('promptArea').value = '';
  currentVars = [];
  renderVarList();
  updateVarCount(0, 0);

  showToast('タグを削除しました');
}

function renderTagList() {
  const list = document.getElementById('tagList');
  if (!list) return;

  list.innerHTML = '';
  if (!savedTags.length) return;

  const sorted = [...savedTags].sort((a, b) => b.updatedAt - a.updatedAt);

  sorted.forEach(tag => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-pill' + (tag.id === activeTagId ? ' active' : '');
    btn.textContent = tag.tagname;
    btn.onclick = () => selectTag(tag.id);
    list.appendChild(btn);
  });
}

function selectTag(id) {
  const tag = savedTags.find(t => t.id === id);
  if (!tag) return;

  activeTagId = id;
  document.getElementById('tagNameInput').value = tag.tagname;
  document.getElementById('promptArea').value = tag.prompt;

  renderTagList();
  scanVars();
  showToast(`"${tag.tagname}" を読み込みました`);
}

function persistTags() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedTags));
  } catch (e) {
    console.error(e);
    showToast('localStorage への保存に失敗しました');
  }
}

function loadTags() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      savedTags = [];
      return;
    }
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      // 仕様の形式を保証
      savedTags = data
        .filter(t => t && typeof t === 'object')
        .map(t => ({
          id: t.id ?? Date.now(),
          prompt: String(t.prompt ?? ''),
          tagname: String(t.tagname ?? ''),
          updatedAt: t.updatedAt ?? Date.now()
        }));
    } else {
      savedTags = [];
    }
  } catch (e) {
    console.error(e);
    savedTags = [];
  }
  renderTagList();
}

document.addEventListener('DOMContentLoaded', () => {
  loadTags();
});
