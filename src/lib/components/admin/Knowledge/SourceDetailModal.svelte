<script>
	import { getContext } from 'svelte';
	import Modal from '$lib/components/common/Modal.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';
	import { getSourceChunks } from '$lib/apis/agentcore';

	const i18n = getContext('i18n');

	export let show = false;
	export let source = null;

	let activeTab = 'markdown';

	// Chunks 状态
	let chunks = [];
	let chunksTotal = 0;
	let chunksLoading = false;
	let chunksLoaded = false;

	// 切换到 chunks 标签时加载
	async function loadChunks() {
		if (chunksLoaded || !source?.source_id) return;
		chunksLoading = true;
		try {
			const result = await getSourceChunks(source.source_id);
			if (result) {
				chunks = result.chunks || [];
				chunksTotal = result.total || 0;
			}
			chunksLoaded = true;
		} catch (err) {
			console.error('Failed to load chunks:', err);
		} finally {
			chunksLoading = false;
		}
	}

	function onTabClick(tab) {
		activeTab = tab;
		if (tab === 'chunks') {
			loadChunks();
		}
	}

	// source 变化时重置 chunks 缓存
	$: if (source) {
		chunks = [];
		chunksTotal = 0;
		chunksLoaded = false;
	}

	const TABS = [
		{ id: 'markdown', label: 'Markdown' },
		{ id: 'chunks', label: 'Chunks' },
		{ id: 'json', label: 'JSON' },
		{ id: 'raw', label: 'Raw' }
	];
</script>

<Modal bind:show size="lg">
	{#if source}
		<div class="p-6">
			<!-- Header -->
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-lg font-semibold truncate max-w-[80%]">
					{source.metadata?.title || source.source_id}
				</h2>
				<button
					class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
					on:click={() => (show = false)}
				>
					<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Metadata badges -->
			<div class="flex flex-wrap gap-2 mb-4 text-xs">
				{#if source.metadata?.source_type}
					<span class="px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
						{source.metadata.source_type}
					</span>
				{/if}
				{#if source.metadata?.category}
					<span class="px-2 py-1 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
						{source.metadata.category}
					</span>
				{/if}
				{#each source.metadata?.topics || [] as topic}
					<span class="px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
						#{topic}
					</span>
				{/each}
			</div>

			<!-- Tabs -->
			<div class="flex gap-2 border-b border-gray-200 dark:border-gray-700 mb-4">
				{#each TABS as tab}
					<button
						class="px-3 py-1.5 text-sm font-medium border-b-2 transition {activeTab === tab.id
							? 'border-blue-500 text-blue-600 dark:text-blue-400'
							: 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}"
						on:click={() => onTabClick(tab.id)}
					>
						{tab.label}
						{#if tab.id === 'chunks' && chunksLoaded}
							<span class="ml-1 text-xs text-gray-400">({chunksTotal})</span>
						{/if}
					</button>
				{/each}
			</div>

			<!-- Tab content -->
			<div class="max-h-[60vh] overflow-y-auto">
				{#if activeTab === 'markdown'}
					<div class="prose dark:prose-invert max-w-none text-sm whitespace-pre-wrap">
						{source.markdown || 'No markdown content available'}
					</div>
				{:else if activeTab === 'chunks'}
					{#if chunksLoading}
						<div class="flex items-center justify-center py-8">
							<Spinner className="size-5" />
						</div>
					{:else if chunks.length === 0}
						<div class="text-center py-8 text-gray-400">
							{$i18n.t('No chunks found for this source')}
						</div>
					{:else}
						<div class="space-y-3">
							<!-- 统计概览 -->
							<div class="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 pb-2 border-b border-gray-100 dark:border-gray-800">
								<span>{$i18n.t('Total chunks')}: <strong>{chunksTotal}</strong></span>
								<span>{$i18n.t('Avg length')}: <strong>{Math.round(chunks.reduce((sum, c) => sum + c.text.length, 0) / chunks.length)}</strong> {$i18n.t('chars')}</span>
							</div>

							<!-- 切片列表 -->
							{#each chunks as chunk, i (chunk.chunk_id)}
								<div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
									<!-- Chunk 头部 -->
									<div class="flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-gray-800/50 text-xs">
										<div class="flex items-center gap-2">
											<span class="font-mono font-medium text-blue-600 dark:text-blue-400">
												#{chunk.index}
											</span>
											<span class="text-gray-400">
												{chunk.text.length} {$i18n.t('chars')}
											</span>
											<span class="text-gray-300 dark:text-gray-600">
												pos {chunk.start}-{chunk.end}
											</span>
										</div>
										<span class="font-mono text-gray-300 dark:text-gray-600 text-[10px]">
											{chunk.chunk_id}
										</span>
									</div>
									<!-- Chunk 内容 -->
									<div class="px-3 py-2 text-xs leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
										{chunk.text}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				{:else if activeTab === 'json'}
					<pre class="text-xs bg-gray-50 dark:bg-gray-800 rounded-lg p-4 overflow-x-auto">{JSON.stringify(source.content || {}, null, 2)}</pre>
				{:else}
					<pre class="text-xs bg-gray-50 dark:bg-gray-800 rounded-lg p-4 overflow-x-auto">{JSON.stringify(source.metadata || {}, null, 2)}</pre>
				{/if}
			</div>
		</div>
	{/if}
</Modal>
