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
  selectedKey: string | null;
}

type TurnstileApi = {
  render: (container: string, options: Record<string, unknown>) => string;
  reset: () => void;
};

const getTurnstile = () => (window as Window & { turnstile?: TurnstileApi }).turnstile;

const fallbackResources: Resource[] = [
  {
    category: 'notes',
    storage_bucket: 'study-hub-resources',
    storage_path: 'chemistry/organic-chemistry-notes.pdf',
    original_filename: 'organic-chemistry-notes.pdf',
    title: 'Organic Chemistry Notes',
    size_bytes: 1240000,
    level: 'A-Level',
    year: 2024,
    resource_type: 'pdf',
    uploaded_at: '2024-08-18T12:00:00.000Z'
  },
  {
    category: 'notes',
    storage_bucket: 'study-hub-resources',
    storage_path: 'chemistry/periodic-table-summary.pdf',
    original_filename: 'periodic-table-summary.pdf',
    title: 'Periodic Table Summary',
    size_bytes: 680000,
    level: 'O-Level',
    year: 2023,
    resource_type: 'pdf',
    uploaded_at: '2023-09-10T09:30:00.000Z'
  },
  {
    category: 'papers',
    storage_bucket: 'study-hub-resources',
    storage_path: 'chemistry/chemistry-past-paper-2022.pdf',
    original_filename: 'chemistry-past-paper-2022.pdf',
    title: 'Chemistry Past Paper 2022',
    size_bytes: 2200000,
    level: 'A-Level',
    year: 2022,
    resource_type: 'pdf',
    uploaded_at: '2022-11-20T14:45:00.000Z'
  },
  {
    category: 'notes',
    storage_bucket: 'study-hub-resources',
    storage_path: 'chemistry/chemical-equations-guide.pdf',
    original_filename: 'chemical-equations-guide.pdf',
    title: 'Chemical Equations Guide',
    size_bytes: 930000,
    level: 'S.5',
    year: 2024,
    resource_type: 'pdf',
    uploaded_at: '2024-02-04T08:20:00.000Z'
  }
];

const archive = document.querySelector<HTMLElement>('[data-chemistry-archive]');

if (archive) {
  const supabaseUrl = archive.dataset.supabaseUrl || '';
  const anonKey = archive.dataset.supabaseAnonKey || '';
  const submitFunctionUrl = archive.dataset.submitFunctionUrl || '';
  const turnstileSiteKey = archive.dataset.turnstileSiteKey || '';
  const state: ArchiveState = { items: [], category: 'all', selectedKey: null };
  const list = document.querySelector<HTMLElement>('#resource-list')!;
  const resourceIndex = document.querySelector<HTMLElement>('#resource-index')!;
  const resourceIndexCount = document.querySelector<HTMLElement>('#resource-index-count')!;
  const status = document.querySelector<HTMLElement>('#archive-status')!;
  const search = document.querySelector<HTMLInputElement>('#archive-search')!;
  const levelFilter = document.querySelector<HTMLSelectElement>('#level-filter')!;
  const sortOrder = document.querySelector<HTMLSelectElement>('#sort-order')!;
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

  function readerUrl(item: Resource): string {
    const url = new URL('https://trustjonathan.github.io/STUDY-HUB/full_page_flipbook_viewer/index.html');
    url.searchParams.set('file', publicObjectUrl(item));
    url.searchParams.set('title', item.title || item.original_filename || 'Chemistry resource');
    return url.href;
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

  function resourceKey(item: Resource): string {
    return `${item.category}:${item.storage_bucket}:${item.storage_path}`;
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
    list.replaceChildren();
    resourceIndex.replaceChildren();
    status.textContent = `${filtered.length} resource${filtered.length === 1 ? '' : 's'} found`;
    resourceIndexCount.textContent = String(filtered.length);

    if (!filtered.length) {
      const message = state.items.length ? 'No resources match those filters.' : 'No published Chemistry resources yet.';
      resourceIndex.append(makeState(message));
      list.append(makeState(message));
      return;
    }

    if (!filtered.some((item) => resourceKey(item) === state.selectedKey)) {
      state.selectedKey = resourceKey(filtered[0]);
    }

    filtered.forEach((item, index) => {
      const key = resourceKey(item);
      const entryId = `chemistry-resource-${index + 1}`;
      const itemTitle = item.title || item.original_filename || 'Chemistry resource';

      const indexButton = document.createElement('button');
      indexButton.className = 'resource-index-item';
      indexButton.type = 'button';
      indexButton.dataset.resourceKey = key;
      indexButton.setAttribute('aria-pressed', String(key === state.selectedKey));
      const number = document.createElement('span');
      number.className = 'resource-index-number';
      number.textContent = String(index + 1).padStart(3, '0');
      const indexTitle = document.createElement('span');
      indexTitle.className = 'resource-index-title';
      indexTitle.textContent = itemTitle;
      indexButton.append(number, indexTitle);
      indexButton.addEventListener('click', () => {
        state.selectedKey = key;
        resourceIndex.querySelectorAll<HTMLButtonElement>('.resource-index-item').forEach((button) => {
          button.setAttribute('aria-pressed', String(button.dataset.resourceKey === key));
        });
        list.querySelectorAll<HTMLElement>('.resource-entry').forEach((entry) => {
          entry.classList.toggle('is-selected', entry.dataset.resourceKey === key);
        });
        document.getElementById(entryId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      resourceIndex.append(indexButton);

      const row = document.createElement('article');
      row.id = entryId;
      row.className = `resource-entry${key === state.selectedKey ? ' is-selected' : ''}`;
      row.dataset.resourceKey = key;
      row.setAttribute('aria-labelledby', `${entryId}-title`);

      const heading = document.createElement('div');
      heading.className = 'resource-entry-heading';
      const details = document.createElement('div');
      const title = document.createElement('h3');
      title.className = 'resource-title';
      title.id = `${entryId}-title`;
      title.textContent = itemTitle;
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
      heading.append(details);

      if (item.original_filename) {
        const filename = document.createElement('p');
        filename.className = 'resource-filename';
        filename.textContent = item.original_filename;
        row.append(heading, filename);
      } else {
        row.append(heading);
      }

      const open = document.createElement('a');
      open.className = 'resource-open';
      open.href = readerUrl(item);
      open.textContent = 'Read in Study Hub';
      open.setAttribute('aria-label', `Open ${title.textContent}`);
      row.append(open);
      list.append(row);

      if ((index + 1) % 8 === 0 && index < filtered.length - 1) {
        const adSlot = document.createElement('div');
        adSlot.className = 'archive-ad-slot';
        adSlot.dataset.adSlot = `chemistry-archive-${Math.floor((index + 1) / 8)}`;
        list.append(adSlot);
      }
    });
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

  function applyResourceSet(items: Resource[]): void {
    state.items = items;
    const levels = [...new Set(items.map((item) => item.level).filter((value): value is string => Boolean(value)))].sort();
    levelFilter.replaceChildren(new Option('All levels', ''));
    for (const level of levels) levelFilter.add(new Option(level, level));
    render();
  }

  async function loadArchive(): Promise<void> {
    if (!supabaseUrl || !anonKey) {
      status.textContent = 'Using the Chemistry preview archive until live data is connected.';
      list.replaceChildren(makeState('Showing preview resources while the live archive is being configured.'));
      resourceIndex.replaceChildren();
      applyResourceSet(fallbackResources);
      return;
    }

    status.textContent = 'Loading Chemistry resources...';
    list.replaceChildren(makeState('Connecting to the shared archive...'));
    try {
      const [notes, papers] = await Promise.all([fetchCategory('notes'), fetchCategory('papers')]);
      applyResourceSet([...notes, ...papers]);
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'The Chemistry archive could not be loaded.';
      list.replaceChildren(makeState('The archive could not be loaded. Check the connection and try again.', true));
      resourceIndex.replaceChildren();
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
    tabs.forEach((tab) => tab.setAttribute('aria-pressed', String(tab === button)));
    render();
  }));
  search.addEventListener('input', render);
  levelFilter.addEventListener('change', render);
  sortOrder.addEventListener('change', render);

  initializeTurnstile();
  void loadArchive();
}
