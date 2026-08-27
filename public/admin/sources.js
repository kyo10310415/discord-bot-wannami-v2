(() => {
  const API_BASE = '/api/admin/knowledge-sources';
  const isPreview = new URLSearchParams(window.location.search).get('preview') === '1';
  const state = { sources: [], status: 'all', query: '' };

  const elements = {
    modal: document.querySelector('#sourceModal'),
    modalTitle: document.querySelector('#sourceModalTitle'),
    openButton: document.querySelector('#openCreateButton'),
    closeButton: document.querySelector('#closeModalButton'),
    cancelButton: document.querySelector('#cancelModalButton'),
    form: document.querySelector('#sourceForm'),
    submitButton: document.querySelector('#sourceSubmitButton'),
    sourceId: document.querySelector('#sourceId'),
    name: document.querySelector('#sourceName'),
    url: document.querySelector('#sourceUrl'),
    classification: document.querySelector('#sourceClassification'),
    category: document.querySelector('#sourceCategory'),
    documentType: document.querySelector('#sourceDocumentType'),
    exampleType: document.querySelector('#sourceExampleType'),
    remarks: document.querySelector('#sourceRemarks'),
    isActive: document.querySelector('#sourceIsActive'),
    tableBody: document.querySelector('#sourceTableBody'),
    emptyState: document.querySelector('#emptyState'),
    search: document.querySelector('#sourceSearch'),
    filterButtons: [...document.querySelectorAll('.filter-chip')],
    refreshButton: document.querySelector('#refreshKnowledgeButton'),
    importButton: document.querySelector('#importSpreadsheetButton'),
    testForm: document.querySelector('#searchTestForm'),
    testQuery: document.querySelector('#searchTestQuery'),
    testResults: document.querySelector('#searchTestResults'),
    toast: document.querySelector('#toast'),
    total: document.querySelector('#totalSources'),
    ready: document.querySelector('#readySources'),
    processing: document.querySelector('#processingSources'),
    error: document.querySelector('#errorSources'),
    monthly: document.querySelector('#monthlySources')
  };

  const statusLabels = {
    pending: '取込待ち',
    processing: '処理中',
    ready: '利用可能',
    error: '要確認',
    disabled: '無効'
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async function api(path = '', options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-wannav-admin-request': '1',
        ...(options.headers || {})
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || '処理に失敗しました');
    return body;
  }

  function showToast(message, isError = false) {
    elements.toast.textContent = message;
    elements.toast.classList.toggle('is-error', isError);
    elements.toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => { elements.toast.hidden = true; }, 4200);
  }

  function openModal(source = null) {
    elements.form.reset();
    elements.sourceId.value = source?.id || '';
    elements.name.value = source?.name || '';
    elements.url.value = source?.url || '';
    elements.classification.value = source?.classification || '';
    elements.category.value = source?.category || '';
    elements.documentType.value = source?.documentType || '';
    elements.exampleType.value = source?.exampleType || '';
    elements.remarks.value = source?.remarks || '';
    elements.isActive.checked = source ? source.isActive : true;
    elements.modalTitle.textContent = source ? 'ソースを編集' : 'ソースを追加';
    elements.submitButton.textContent = source ? '変更を保存して反映' : '登録して取り込む';
    elements.modal.hidden = false;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => elements.name.focus(), 0);
  }

  function closeModal() {
    elements.modal.hidden = true;
    document.body.style.overflow = '';
    elements.openButton.focus();
  }

  function relativeTime(value) {
    if (!value) return '未取得';
    const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
    if (!Number.isFinite(seconds)) return '—';
    if (seconds < 60) return 'たった今';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分前`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}時間前`;
    if (seconds < 86400 * 14) return `${Math.floor(seconds / 86400)}日前`;
    return new Intl.DateTimeFormat('ja-JP', { month: 'short', day: 'numeric' }).format(new Date(value));
  }

  function displayUrl(url) {
    try {
      const parsed = new URL(url);
      const text = `${parsed.hostname}${parsed.pathname}`;
      return text.length > 54 ? `${text.slice(0, 51)}…` : text;
    } catch (_) {
      return url;
    }
  }

  function sourceType(source) {
    const value = `${source.documentType || ''} ${source.url || ''}`.toLowerCase();
    if (value.includes('presentation') || value.includes('slide') || value.includes('スライド')) {
      return { letter: 'S', className: 'source-type-slide' };
    }
    if (value.includes('document') || value.includes('doc') || value.includes('ドキュメント')) {
      return { letter: 'D', className: 'source-type-doc' };
    }
    return { letter: 'W', className: 'source-type-web' };
  }

  function categoryClass(source) {
    const text = `${source.classification} ${source.category}`;
    if (text.includes('ミッション')) return 'category-pill category-pill-purple';
    if (text.includes('SNS') || text.includes('YouTube')) return 'category-pill category-pill-blue';
    return 'category-pill';
  }

  function renderSources() {
    const query = state.query.toLowerCase();
    const filtered = state.sources.filter((source) => {
      const matchesStatus = state.status === 'all' ||
        source.syncStatus === state.status ||
        (state.status === 'processing' && source.syncStatus === 'pending');
      const haystack = [source.name, source.url, source.classification, source.category, source.remarks]
        .join(' ')
        .toLowerCase();
      return matchesStatus && (!query || haystack.includes(query));
    });

    elements.emptyState.hidden = filtered.length > 0;
    elements.tableBody.hidden = filtered.length === 0;
    elements.tableBody.innerHTML = filtered.map((source) => {
      const type = sourceType(source);
      const statusClass = source.syncStatus === 'pending' ? 'processing' : source.syncStatus;
      const category = source.category || source.classification || '未分類';
      const error = source.lastError
        ? `<small class="error-detail" title="${escapeHtml(source.lastError)}">${escapeHtml(source.lastError)}</small>`
        : '';
      return `
        <tr data-source-id="${escapeHtml(source.id)}">
          <td><div class="source-cell"><span class="source-type ${type.className}">${type.letter}</span><div><strong>${escapeHtml(source.name)}</strong><small title="${escapeHtml(source.url)}">${escapeHtml(displayUrl(source.url))}</small></div></div></td>
          <td><span class="${categoryClass(source)}">${escapeHtml(category)}</span></td>
          <td><span class="status status-${statusClass}"><i></i>${statusLabels[source.syncStatus] || escapeHtml(source.syncStatus)}</span>${error}</td>
          <td><time datetime="${escapeHtml(source.updatedAt || '')}">${relativeTime(source.updatedAt)}</time></td>
          <td><div class="row-actions"><button class="icon-button" type="button" data-action="menu" aria-label="${escapeHtml(source.name)}の操作">•••</button><div class="action-menu" hidden><button type="button" data-action="edit">編集</button><button type="button" data-action="toggle">${source.isActive ? '無効にする' : '有効にする'}</button><button class="is-danger" type="button" data-action="delete">削除</button></div></div></td>
        </tr>`;
    }).join('');
  }

  function renderStats(stats) {
    elements.total.textContent = stats.total ?? 0;
    elements.ready.textContent = stats.ready ?? 0;
    elements.processing.textContent = stats.processing ?? 0;
    elements.error.textContent = stats.error ?? 0;
    elements.monthly.textContent = `＋${stats.addedThisMonth ?? 0}`;
  }

  async function loadData({ quiet = false } = {}) {
    if (isPreview) return;
    if (!quiet) {
      elements.tableBody.hidden = false;
      elements.emptyState.hidden = true;
      elements.tableBody.innerHTML = '<tr><td colspan="5" style="padding:38px;text-align:center;color:#7f8a84">ソースを読み込んでいます…</td></tr>';
    }
    try {
      const [sourceResponse, stats] = await Promise.all([api('/'), api('/stats')]);
      state.sources = sourceResponse.sources;
      renderSources();
      renderStats(stats);
      const hasWork = stats.processing > 0 || sourceResponse.refresh?.running;
      window.clearTimeout(loadData.timer);
      if (hasWork) loadData.timer = window.setTimeout(() => loadData({ quiet: true }), 4000);
    } catch (error) {
      elements.tableBody.innerHTML = `<tr><td colspan="5" style="padding:38px;text-align:center;color:#ad3c3c">${escapeHtml(error.message)}</td></tr>`;
      showToast(error.message, true);
    }
  }

  async function saveSource(event) {
    event.preventDefault();
    const id = elements.sourceId.value;
    const input = {
      name: elements.name.value,
      url: elements.url.value,
      classification: elements.classification.value,
      category: elements.category.value,
      documentType: elements.documentType.value,
      exampleType: elements.exampleType.value,
      remarks: elements.remarks.value,
      isActive: elements.isActive.checked
    };

    elements.submitButton.disabled = true;
    try {
      await api(id ? `/${id}` : '/', { method: id ? 'PUT' : 'POST', body: JSON.stringify(input) });
      closeModal();
      showToast(id ? 'ソースを更新し、AI回答への反映を開始しました' : 'ソースを登録し、取り込みを開始しました');
      await loadData();
    } catch (error) {
      showToast(error.message, true);
    } finally {
      elements.submitButton.disabled = false;
    }
  }

  async function handleTableAction(event) {
    const button = event.target.closest('[data-action]');
    const row = event.target.closest('tr[data-source-id]');
    if (!button || !row) return;
    const source = state.sources.find((item) => item.id === row.dataset.sourceId);
    if (!source) return;

    if (button.dataset.action === 'menu') {
      const menu = button.nextElementSibling;
      document.querySelectorAll('.action-menu').forEach((item) => {
        if (item !== menu) item.hidden = true;
      });
      menu.hidden = !menu.hidden;
      return;
    }
    if (button.dataset.action === 'edit') return openModal(source);

    if (button.dataset.action === 'toggle') {
      try {
        await api(`/${source.id}`, { method: 'PUT', body: JSON.stringify({ isActive: !source.isActive }) });
        showToast(source.isActive ? 'ソースをAI回答の対象外にしました' : 'ソースの再取り込みを開始しました');
        await loadData();
      } catch (error) {
        showToast(error.message, true);
      }
    }

    if (button.dataset.action === 'delete') {
      if (!window.confirm(`「${source.name}」を削除しますか？\nこの操作は元に戻せません。`)) return;
      try {
        await api(`/${source.id}`, { method: 'DELETE' });
        showToast('ソースを削除しました');
        await loadData();
      } catch (error) {
        showToast(error.message, true);
      }
    }
  }

  async function refreshKnowledge() {
    elements.refreshButton.disabled = true;
    elements.refreshButton.textContent = '反映しています…';
    try {
      const result = await api('/actions/refresh', { method: 'POST', body: '{}' });
      showToast(`${result.documentCount}件のソースをAI回答へ反映しました`);
      await loadData();
    } catch (error) {
      showToast(error.message, true);
    } finally {
      elements.refreshButton.disabled = false;
      elements.refreshButton.innerHTML = '<span aria-hidden="true">↻</span> 回答へ反映';
    }
  }

  async function importSpreadsheet() {
    if (!window.confirm('既存スプレッドシートのAI回答用ソース一覧を取り込みます。\n同じURLの登録内容は更新されます。続行しますか？')) return;
    elements.importButton.disabled = true;
    elements.importButton.textContent = '移行しています…';
    try {
      const result = await api('/actions/import-spreadsheet', { method: 'POST', body: '{}' });
      const summary = result.summary;
      showToast(`${summary.imported}件を移行しました（新規${summary.created}件・更新${summary.updated}件）`);
      await loadData();
    } catch (error) {
      showToast(error.message, true);
    } finally {
      elements.importButton.disabled = false;
      elements.importButton.innerHTML = '<span aria-hidden="true">⇩</span> シートから移行';
    }
  }

  async function testSearch(event) {
    event.preventDefault();
    const query = elements.testQuery.value.trim();
    if (!query) return;
    const button = elements.testForm.querySelector('button');
    button.disabled = true;
    elements.testResults.hidden = false;
    elements.testResults.textContent = '検索しています…';
    try {
      const response = await api('/actions/test-search', { method: 'POST', body: JSON.stringify({ query }) });
      if (!response.results.length) {
        elements.testResults.innerHTML = '<p>関連するソースが見つかりませんでした。</p>';
      } else {
        elements.testResults.innerHTML = response.results.map((result) => `
          <article class="result-card">
            <span class="result-score">${Math.min(100, Math.round(result.score * 100))}%</span>
            <div><strong>${escapeHtml(result.title)}</strong><p>${escapeHtml(result.preview)}</p></div>
          </article>
        `).join('');
      }
    } catch (error) {
      elements.testResults.innerHTML = `<p style="color:#ad3c3c">${escapeHtml(error.message)}</p>`;
    } finally {
      button.disabled = false;
    }
  }

  elements.openButton.addEventListener('click', () => openModal());
  elements.closeButton.addEventListener('click', closeModal);
  elements.cancelButton.addEventListener('click', closeModal);
  elements.form.addEventListener('submit', saveSource);
  elements.tableBody.addEventListener('click', handleTableAction);
  elements.refreshButton.addEventListener('click', refreshKnowledge);
  elements.importButton.addEventListener('click', importSpreadsheet);
  elements.testForm.addEventListener('submit', testSearch);
  elements.search.addEventListener('input', () => {
    state.query = elements.search.value.trim();
    renderSources();
  });
  elements.filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      elements.filterButtons.forEach((item) => item.classList.remove('is-selected'));
      button.classList.add('is-selected');
      state.status = button.dataset.status;
      renderSources();
    });
  });
  elements.modal.addEventListener('click', (event) => {
    if (event.target === elements.modal) closeModal();
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.row-actions')) {
      document.querySelectorAll('.action-menu').forEach((menu) => { menu.hidden = true; });
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !elements.modal.hidden) closeModal();
  });

  loadData();
})();
