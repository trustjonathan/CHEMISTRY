interface Resource {
  category: 'notes' | 'papers';
  storage_bucket: string;
  storage_path: string;
  original_filename: string | null;
  title: string | null;
  size_bytes: number | null;
  level: string | null;
  year: number | null;
  resource_type: string | null;
  uploaded_at: string | null;
}

interface ArchiveState {
  items: Resource[];
  category: 'all' | 'notes' | 'papers';
  page: number;
  pageSize: number;
}

type TurnstileApi = {
  render: (container: string, options: Record<string, unknown>) => string;
  reset: () => void;
};

const getTurnstile = () => (window as Window & { turnstile?: TurnstileApi }).turnstile;

const archive = document.querySelector<HTMLElement>('[data-chemistry-archive]');

if (archive) {
  const supabaseUrl = archive.dataset.supabaseUrl || '';
  const anonKey = archive.dataset.supabaseAnonKey || '';
  const submitFunctionUrl = archive.dataset.submitFunctionUrl || '';
  const turnstileSiteKey = archive.dataset.turnstileSiteKey || '';
  const state: ArchiveState = { items: [], category: 'all', page: 1, pageSize: 24 };
  const list = document.querySelector<HTMLElement>('#resource-list')!;
  const status = document.querySelector<HTMLElement>('#archive-status')!;
  const search = document.querySelector<HTMLInputElement>('#archive-search')!;
  const levelFilter = document.querySelector<HTMLSelectElement>('#level-filter')!;
  const sortOrder = document.querySelector<HTMLSelectElement>('#sort-order')!;
  const loadMore = document.querySelector<HTMLButtonElement>('#load-more')!;
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('.archive-tabs button')];
  const contributionDialog = document.querySelector<HTMLDialogElement>('#contribution-dialog')!;
  const contributionForm = document.querySelector<HTMLFormElement>('#contribution-form')!;
  const uploadStatus = document.querySelector<HTMLElement>('#upload-status')!;
  const submitButton = document.querySelector<HTMLButtonElement>('#submit-contribution')!;
  const turnstileInput = document.createElement('input');
  turnstileInput.type = 'hidden';
  turnstileInput.name = 'cf-turnstile-response';
  contributionForm.append(turnstileInput);

  function setUploadMessage(message: string, stateName = ''): void {
    uploadStatus.textContent = message;
    uploadStatus.dataset.state = stateName;
  }

  function initializeTurnstile(): void {
    if (!turnstileSiteKey) {
      setUploadMessage('Uploads are not enabled yet. Secure verification is being configured.');
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const turnstile = getTurnstile();
      if (!turnstile) {
        setUploadMessage('Verification could not load. Please try again later.', 'error');
        return;
      }
      turnstile.render('#turnstile-widget', {
        sitekey: turnstileSiteKey,
        callback(token: string) {
          turnstileInput.value = token;
          submitButton.disabled = false;
        },
        'expired-callback'() {
          turnstileInput.value = '';
          submitButton.disabled = true;
        },
        'error-callback'() {
          turnstileInput.value = '';
          submitButton.disabled = true;
          setUploadMessage('Verification failed to load. Please try again later.', 'error');
        }
      });
    };
    script.onerror = () => setUploadMessage('Verification could not load. Please try again later.', 'error');
    document.head.append(script);
  }

  function publicObjectUrl(item: Resource): string {
    const bucket = encodeURIComponent(item.storage_bucket || 'study-hub-resources');
    const path = String(item.storage_path || '').split('/').map(encodeURIComponent).join('/');
    return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${bucket}/${path}`;
  }

  function formatBytes(value: number | null): string {
    const bytes = Number(value) || 0;
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
  }

  function makeState(message: string, isError = false): HTMLDivElement {
    const element = document.createElement('div');
    element.className = 'archive-empty';
    element.textContent = message;
    if (isError) element.setAttribute('role', 'alert');
    return element;
  }

  function filteredItems(): Resource[] {
    const query = search.value.trim().toLowerCase();
    const level = levelFilter.value;
    const filtered = state.items.filter((item) => {
      if (state.category !== 'all' && item.category !== state.category) return false;
      if (level && item.level !== level) return false;
      const haystack = `${item.title || ''} ${item.original_filename || ''} ${item.year || ''}`.toLowerCase();
      return !query || haystack.includes(query);
    });

    if (sortOrder.value === 'recent') {
      filtered.sort((left, right) => String(right.uploaded_at || '').localeCompare(String(left.uploaded_at || '')));
    } else if (sortOrder.value === 'year') {
      filtered.sort((left, right) => (Number(right.year) || 0) - (Number(left.year) || 0));
    } else {
      filtered.sort((left, right) => String(left.title || left.original_filename).localeCompare(String(right.title || right.original_filename)));
    }

    return filtered;
  }

  function render(): void {
    const filtered = filteredItems();
    const visible = filtered.slice(0, state.page * state.pageSize);
    list.replaceChildren();
    status.textContent = `${filtered.length} resource${filtered.length === 1 ? '' : 's'} found`;

    if (!filtered.length) {
      list.append(makeState(state.items.length ? 'No resources match those filters.' : 'No published Chemistry resources yet.'));
      loadMore.hidden = true;
      return;
    }

    for (const item of visible) {
      const row = document.createElement('article');
      row.className = 'resource-row';
      const details = document.createElement('div');
      const title = document.createElement('h3');
      title.className = 'resource-title';
      title.textContent = item.title || item.original_filename || 'Chemistry resource';
      const meta = document.createElement('div');
      meta.className = 'resource-meta';
      const category = document.createElement('span');
      category.className = 'resource-category';
      category.textContent = item.category === 'papers' ? 'Past paper' : 'Notes';
      meta.append(category);
      for (const value of [item.level, item.year ? String(item.year) : '', formatBytes(item.size_bytes)]) {
        if (!value) continue;
        const detail = document.createElement('span');
        detail.textContent = value;
        meta.append(detail);
      }
      details.append(title, meta);

      const open = document.createElement('a');
      open.className = 'resource-open';
      open.href = publicObjectUrl(item);
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      open.textContent = 'Open resource';
      open.setAttribute('aria-label', `Open ${title.textContent}`);
      row.append(details, open);
      list.append(row);
    }

    loadMore.hidden = visible.length >= filtered.length;
  }

  async function fetchCategory(category: 'notes' | 'papers'): Promise<Resource[]> {
    const endpoint = new URL('/rest/v1/study_hub_resources', supabaseUrl);
    endpoint.searchParams.set('select', 'category,storage_bucket,storage_path,original_filename,title,size_bytes,level,year,resource_type,uploaded_at');
    endpoint.searchParams.set('subject', 'eq.chemistry');
    endpoint.searchParams.set('category', `eq.${category}`);
    endpoint.searchParams.set('order', 'uploaded_at.desc,title.asc');
    endpoint.searchParams.set('limit', '1000');
    const headers: Record<string, string> = { apikey: anonKey };
    if (anonKey.startsWith('eyJ')) headers.Authorization = `Bearer ${anonKey}`;

    const response = await fetch(endpoint, { headers });
    if (!response.ok) throw new Error(`Archive request failed (HTTP ${response.status}).`);
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) throw new Error('Archive returned an invalid resource list.');
    return rows as Resource[];
  }

  async function loadArchive(): Promise<void> {
    if (!supabaseUrl || !anonKey) {
      status.textContent = 'The archive is not connected yet. Supabase public configuration is required.';
      list.replaceChildren(makeState('Chemistry resources are temporarily unavailable.', true));
      loadMore.hidden = true;
      return;
    }

    status.textContent = 'Loading Chemistry resources...';
    list.replaceChildren(makeState('Connecting to the shared archive...'));
    try {
      const [notes, papers] = await Promise.all([fetchCategory('notes'), fetchCategory('papers')]);
      state.items = [...notes, ...papers];
      const levels = [...new Set(state.items.map((item) => item.level).filter((value): value is string => Boolean(value)))].sort();
      levelFilter.replaceChildren(new Option('All levels', ''));
      for (const level of levels) levelFilter.add(new Option(level, level));
      render();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'The Chemistry archive could not be loaded.';
      list.replaceChildren(makeState('The archive could not be loaded. Check the connection and try again.', true));
      const retry = document.createElement('button');
      retry.className = 'button button-outline';
      retry.type = 'button';
      retry.textContent = 'Retry';
      retry.addEventListener('click', () => void loadArchive());
      list.append(retry);
    }
  }

  document.querySelector<HTMLButtonElement>('#open-contribution')?.addEventListener('click', () => contributionDialog.showModal());
  document.querySelector<HTMLButtonElement>('#close-contribution')?.addEventListener('click', () => contributionDialog.close());
  document.querySelector<HTMLButtonElement>('#cancel-contribution')?.addEventListener('click', () => contributionDialog.close());
  contributionDialog.addEventListener('click', (event) => {
    if (event.target === contributionDialog) contributionDialog.close();
  });

  contributionForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!submitFunctionUrl || !anonKey || !turnstileInput.value) {
      setUploadMessage('Secure upload is not configured yet. Please try again later.', 'error');
      return;
    }

    submitButton.disabled = true;
    setUploadMessage('Sending your resource for review...');
    try {
      const response = await fetch(submitFunctionUrl, {
        method: 'POST',
        headers: { apikey: anonKey },
        body: new FormData(contributionForm)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Upload failed (HTTP ${response.status}).`);
      contributionForm.reset();
      turnstileInput.value = '';
      getTurnstile()?.reset();
      submitButton.disabled = true;
      setUploadMessage('Thank you. Your upload is private and will appear after review.', 'success');
    } catch (error) {
      submitButton.disabled = !turnstileInput.value;
      setUploadMessage(error instanceof Error ? error.message : 'The resource could not be submitted.', 'error');
    }
  });

  tabs.forEach((button) => button.addEventListener('click', () => {
    state.category = (button.dataset.category as ArchiveState['category']) || 'all';
    state.page = 1;
    tabs.forEach((tab) => tab.setAttribute('aria-pressed', String(tab === button)));
    render();
  }));
  search.addEventListener('input', () => { state.page = 1; render(); });
  levelFilter.addEventListener('change', () => { state.page = 1; render(); });
  sortOrder.addEventListener('change', render);
  loadMore.addEventListener('click', () => { state.page += 1; render(); });

  initializeTurnstile();
  void loadArchive();
}
