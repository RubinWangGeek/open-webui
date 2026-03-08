<script>
	import { onMount, onDestroy, getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { processContent, processUrl, getTaskProgress, listTasks } from '$lib/apis/agentcore';
	import ProcessingStep from './ProcessingStep.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';

	const i18n = getContext('i18n');

	// 输入模式: 'file' | 'url'
	let inputMode = 'file';

	// 文件上传状态
	let fileInput;
	let selectedFiles = [];
	let sourceType = 'auto';
	let category = 'generic';
	let uploading = false;

	const MAX_FILES = 20;

	// URL 输入状态
	let urlInput = '';
	let urlSourceType = 'video';
	let submittingUrl = false;

	// 任务队列
	let tasks = [];
	let pollInterval = null;

	// 扩展名 → source_type 映射（用于自动识别提示）
	const EXT_TYPE_MAP = {
		pdf: 'pdf',
		txt: 'text',
		md: 'text',
		csv: 'text',
		log: 'text',
		mp3: 'audio',
		wav: 'audio',
		m4a: 'audio',
		mp4: 'video',
		mkv: 'video',
		webm: 'video'
	};

	const DEFAULT_CATEGORIES = [
		{ value: 'generic', label: 'Generic' },
		{ value: 'first_principles', label: 'First Principles' },
		{ value: 'game_theory', label: 'Game Theory' },
		{ value: 'sawi_personality', label: 'SAWI Personality' },
		{ value: 'decision_matrix', label: 'Decision Matrix' },
		{ value: 'mental_models', label: 'Mental Models' }
	];

	let customCategories = [];
	$: categories = [...DEFAULT_CATEGORIES, ...customCategories];

	let showNewCategory = false;
	let newCategoryValue = '';

	function addCategory() {
		const val = newCategoryValue.trim().toLowerCase().replace(/\s+/g, '_');
		if (!val) return;
		if (categories.some((c) => c.value === val)) {
			toast.error('Category already exists');
			return;
		}
		customCategories = [...customCategories, { value: val, label: newCategoryValue.trim() }];
		category = val;
		newCategoryValue = '';
		showNewCategory = false;
	}

	const SOURCE_TYPES = [
		{ value: 'auto', label: 'Auto Detect' },
		{ value: 'pdf', label: 'PDF' },
		{ value: 'text', label: 'Text' },
		{ value: 'audio', label: 'Audio' },
		{ value: 'video', label: 'Video' }
	];

	const URL_SOURCE_TYPES = [
		{ value: 'video', label: 'Video' },
		{ value: 'audio', label: 'Audio' }
	];

	function onFileSelect(e) {
		const files = Array.from(e.target.files || []);
		if (files.length > MAX_FILES) {
			toast.error(`Maximum ${MAX_FILES} files allowed`);
			selectedFiles = files.slice(0, MAX_FILES);
		} else {
			selectedFiles = files;
		}
	}

	async function handleUpload() {
		if (selectedFiles.length === 0) {
			toast.error('Please select at least one file');
			return;
		}

		uploading = true;
		const filesToUpload = [...selectedFiles];
		selectedFiles = [];
		if (fileInput) fileInput.value = '';

		let successCount = 0;
		for (const file of filesToUpload) {
			try {
				const result = await processContent(file, sourceType, category);
				if (result?.task_id) {
					tasks = [
						{
							task_id: result.task_id,
							status: 'pending',
							current_step: '',
							progress_percent: 0,
							filename: file.name,
							source_type: sourceType === 'auto' ? guessType(file.name) : sourceType,
							category: category,
							error: null
						},
						...tasks
					];
					successCount++;
				}
			} catch (err) {
				toast.error(`Upload failed: ${file.name} - ${err}`);
			}
		}

		if (successCount > 0) {
			toast.success(`Processing started: ${successCount} file${successCount > 1 ? 's' : ''}`);
			startPolling();
		}
		uploading = false;
	}

	async function handleUrlSubmit() {
		const url = urlInput.trim();
		if (!url) {
			toast.error('Please enter a URL');
			return;
		}
		// 基本 URL 校验
		if (!url.startsWith('http://') && !url.startsWith('https://')) {
			toast.error('Please enter a valid URL (http:// or https://)');
			return;
		}

		submittingUrl = true;
		try {
			const result = await processUrl(url, urlSourceType, category);
			if (result?.task_id) {
				// 从 URL 提取简短显示名
				let displayName;
				try {
					const urlObj = new URL(url);
					displayName = urlObj.hostname + urlObj.pathname.slice(0, 30);
				} catch {
					displayName = url.slice(0, 50);
				}

				tasks = [
					{
						task_id: result.task_id,
						status: 'pending',
						current_step: '',
						progress_percent: 0,
						filename: displayName,
						source_type: urlSourceType,
						category: category,
						error: null
					},
					...tasks
				];
				toast.success('Processing started for URL');
				urlInput = '';
				startPolling();
			}
		} catch (err) {
			toast.error(`URL processing failed: ${err}`);
		} finally {
			submittingUrl = false;
		}
	}

	function guessType(filename) {
		const ext = filename.split('.').pop()?.toLowerCase() || '';
		return EXT_TYPE_MAP[ext] || 'text';
	}

	function startPolling() {
		if (pollInterval) return;
		pollInterval = setInterval(pollProgress, 2000);
	}

	function stopPolling() {
		if (pollInterval) {
			clearInterval(pollInterval);
			pollInterval = null;
		}
	}

	async function pollProgress() {
		const activeTasks = tasks.filter(
			(t) => t.status !== 'completed' && t.status !== 'failed'
		);

		if (activeTasks.length === 0) {
			stopPolling();
			return;
		}

		for (const task of activeTasks) {
			try {
				const progress = await getTaskProgress(task.task_id);
				if (progress) {
					const idx = tasks.findIndex((t) => t.task_id === task.task_id);
					if (idx >= 0) {
						tasks[idx] = { ...tasks[idx], ...progress };
						tasks = tasks;
					}

					if (progress.status === 'completed') {
						toast.success(`Completed: ${task.filename}`);
					} else if (progress.status === 'failed') {
						toast.error(`Failed: ${task.filename}`);
					}
				}
			} catch {
				// 轮询失败时静默忽略
			}
		}
	}

	onMount(async () => {
		try {
			const result = await listTasks();
			if (result?.tasks) {
				tasks = result.tasks;
				const hasActive = tasks.some(
					(t) => t.status !== 'completed' && t.status !== 'failed'
				);
				if (hasActive) startPolling();
			}
		} catch {
			// agent-core 可能未启动，静默忽略
		}
	});

	onDestroy(() => {
		stopPolling();
	});
</script>

<div class="max-w-4xl">
	<!-- Input mode toggle + form -->
	<div class="border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-6">
		<!-- Mode toggle -->
		<div class="flex items-center gap-1 mb-4">
			<button
				class="px-3 py-1.5 text-sm font-medium rounded-lg transition
					{inputMode === 'file'
					? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
					: 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}"
				on:click={() => (inputMode = 'file')}
			>
				{$i18n.t('Upload Files')}
			</button>
			<button
				class="px-3 py-1.5 text-sm font-medium rounded-lg transition
					{inputMode === 'url'
					? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
					: 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}"
				on:click={() => (inputMode = 'url')}
			>
				{$i18n.t('Video / Audio URL')}
			</button>
		</div>

		{#if inputMode === 'file'}
			<!-- File upload mode -->
			<div class="mb-4">
				<label class="block text-sm text-gray-600 dark:text-gray-400 mb-1" for="file-input">
					{$i18n.t('Files')} <span class="text-xs text-gray-400">({$i18n.t('max 20')})</span>
				</label>
				<input
					id="file-input"
					bind:this={fileInput}
					type="file"
					multiple
					accept=".pdf,.txt,.md,.csv,.log,.mp3,.wav,.m4a,.flac,.ogg,.mp4,.mkv,.avi,.webm"
					on:change={onFileSelect}
					class="block w-full text-sm text-gray-500 dark:text-gray-400
						file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0
						file:text-sm file:font-medium
						file:bg-blue-50 file:text-blue-700 dark:file:bg-gray-700 dark:file:text-gray-300
						file:cursor-pointer hover:file:bg-blue-100 dark:hover:file:bg-gray-600"
				/>
				{#if selectedFiles.length > 0}
					<div class="mt-1 text-xs text-gray-400">
						{selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
						({(selectedFiles.reduce((sum, f) => sum + f.size, 0) / 1024).toFixed(1)} KB total)
					</div>
					{#if selectedFiles.length <= 5}
						<div class="mt-1 flex flex-wrap gap-1">
							{#each selectedFiles as file}
								<span class="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">{file.name}</span>
							{/each}
						</div>
					{/if}
				{/if}
			</div>

			<!-- Source type + Category -->
			<div class="grid grid-cols-2 gap-4 mb-4">
				<div>
					<label class="block text-sm text-gray-600 dark:text-gray-400 mb-1" for="source-type">
						{$i18n.t('Source Type')}
					</label>
					<select
						id="source-type"
						bind:value={sourceType}
						class="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm dark:text-gray-300"
					>
						{#each SOURCE_TYPES as st}
							<option value={st.value}>{st.label}</option>
						{/each}
					</select>
				</div>
				<div>
					<label class="block text-sm text-gray-600 dark:text-gray-400 mb-1" for="category">
						{$i18n.t('Category')}
					</label>
					<div class="flex gap-2">
						<select
							id="category"
							bind:value={category}
							class="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm dark:text-gray-300"
						>
							{#each categories as cat}
								<option value={cat.value}>{cat.label}</option>
							{/each}
						</select>
						<button
							type="button"
							class="px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-blue-600 hover:border-blue-400 transition"
							on:click={() => (showNewCategory = !showNewCategory)}
							title={$i18n.t('Add new category')}
						>+</button>
					</div>
					{#if showNewCategory}
						<div class="flex gap-2 mt-2">
							<input
								type="text"
								bind:value={newCategoryValue}
								placeholder={$i18n.t('New category name')}
								class="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-1.5 text-sm dark:text-gray-300"
								on:keydown={(e) => e.key === 'Enter' && addCategory()}
							/>
							<button
								type="button"
								class="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
								on:click={addCategory}
							>{$i18n.t('Add')}</button>
						</div>
					{/if}
				</div>
			</div>

			<!-- Upload button -->
			<button
				class="px-4 py-2 rounded-lg text-sm font-medium text-white
					{uploading || selectedFiles.length === 0
					? 'bg-gray-400 cursor-not-allowed'
					: 'bg-blue-600 hover:bg-blue-700'} transition flex items-center gap-2"
				disabled={uploading || selectedFiles.length === 0}
				on:click={handleUpload}
			>
				{#if uploading}
					<Spinner className="size-4" />
					{$i18n.t('Uploading...')}
				{:else}
					{$i18n.t('Upload & Process')}
				{/if}
			</button>
		{:else}
			<!-- URL input mode -->
			<div class="mb-4">
				<label class="block text-sm text-gray-600 dark:text-gray-400 mb-1" for="url-input">
					{$i18n.t('Video / Audio URL')}
				</label>
				<input
					id="url-input"
					type="url"
					bind:value={urlInput}
					placeholder="https://www.youtube.com/watch?v=... / https://www.bilibili.com/video/..."
					class="block w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm dark:text-gray-300 placeholder:text-gray-400"
					on:keydown={(e) => e.key === 'Enter' && handleUrlSubmit()}
				/>
				<p class="mt-1 text-xs text-gray-400">
					{$i18n.t('Supports YouTube, Bilibili, and 1000+ platforms via yt-dlp')}
				</p>
			</div>

			<!-- URL source type + Category -->
			<div class="grid grid-cols-2 gap-4 mb-4">
				<div>
					<label class="block text-sm text-gray-600 dark:text-gray-400 mb-1" for="url-source-type">
						{$i18n.t('Source Type')}
					</label>
					<select
						id="url-source-type"
						bind:value={urlSourceType}
						class="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm dark:text-gray-300"
					>
						{#each URL_SOURCE_TYPES as st}
							<option value={st.value}>{st.label}</option>
						{/each}
					</select>
				</div>
				<div>
					<label class="block text-sm text-gray-600 dark:text-gray-400 mb-1" for="url-category">
						{$i18n.t('Category')}
					</label>
					<div class="flex gap-2">
						<select
							id="url-category"
							bind:value={category}
							class="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm dark:text-gray-300"
						>
							{#each categories as cat}
								<option value={cat.value}>{cat.label}</option>
							{/each}
						</select>
						<button
							type="button"
							class="px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-blue-600 hover:border-blue-400 transition"
							on:click={() => (showNewCategory = !showNewCategory)}
							title={$i18n.t('Add new category')}
						>+</button>
					</div>
					{#if showNewCategory}
						<div class="flex gap-2 mt-2">
							<input
								type="text"
								bind:value={newCategoryValue}
								placeholder={$i18n.t('New category name')}
								class="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-1.5 text-sm dark:text-gray-300"
								on:keydown={(e) => e.key === 'Enter' && addCategory()}
							/>
							<button
								type="button"
								class="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
								on:click={addCategory}
							>{$i18n.t('Add')}</button>
						</div>
					{/if}
				</div>
			</div>

			<!-- Submit URL button -->
			<button
				class="px-4 py-2 rounded-lg text-sm font-medium text-white
					{submittingUrl || !urlInput.trim()
					? 'bg-gray-400 cursor-not-allowed'
					: 'bg-blue-600 hover:bg-blue-700'} transition flex items-center gap-2"
				disabled={submittingUrl || !urlInput.trim()}
				on:click={handleUrlSubmit}
			>
				{#if submittingUrl}
					<Spinner className="size-4" />
					{$i18n.t('Submitting...')}
				{:else}
					{$i18n.t('Download & Process')}
				{/if}
			</button>
		{/if}
	</div>

	<!-- Processing queue -->
	{#if tasks.length > 0}
		<div>
			<h3 class="text-base font-medium mb-3">{$i18n.t('Processing Queue')}</h3>
			{#each tasks as task (task.task_id)}
				<ProcessingStep {task} />
			{/each}
		</div>
	{/if}
</div>
