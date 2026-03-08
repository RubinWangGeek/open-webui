<script>
	import { onMount, getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { listSources, getSource, deleteSource } from '$lib/apis/agentcore';
	import Spinner from '$lib/components/common/Spinner.svelte';
	import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
	import SourceDetailModal from './SourceDetailModal.svelte';

	const i18n = getContext('i18n');

	let sources = [];
	let loading = true;
	let searchQuery = '';

	// Modal 状态
	let showDetail = false;
	let selectedSource = null;

	// 删除确认
	let showConfirmDelete = false;
	let deleteTargetId = '';
	let deleteTargetTitle = '';

	// 搜索过滤
	$: filteredSources = sources.filter((s) => {
		if (!searchQuery) return true;
		const q = searchQuery.toLowerCase();
		return (
			(s.title || '').toLowerCase().includes(q) ||
			(s.source_name || '').toLowerCase().includes(q) ||
			(s.source_id || '').toLowerCase().includes(q) ||
			(s.category || '').toLowerCase().includes(q) ||
			(s.topics || []).some((t) => t.toLowerCase().includes(q))
		);
	});

	async function loadSources() {
		loading = true;
		try {
			const result = await listSources();
			if (result?.sources) {
				sources = result.sources;
			}
		} catch (err) {
			toast.error(`Failed to load sources: ${err}`);
		} finally {
			loading = false;
		}
	}

	async function openDetail(source) {
		try {
			const detail = await getSource(source.source_id);
			if (detail) {
				selectedSource = detail;
				showDetail = true;
			}
		} catch (err) {
			toast.error(`Failed to load source detail: ${err}`);
		}
	}

	function confirmDelete(source) {
		deleteTargetId = source.source_id;
		deleteTargetTitle = source.title || source.source_id;
		showConfirmDelete = true;
	}

	async function handleDelete() {
		try {
			await deleteSource(deleteTargetId);
			toast.success(`Deleted: ${deleteTargetTitle}`);
			sources = sources.filter((s) => s.source_id !== deleteTargetId);
		} catch (err) {
			toast.error(`Failed to delete: ${err}`);
		}
		showConfirmDelete = false;
	}

	function formatDate(dateStr) {
		if (!dateStr) return '-';
		try {
			return new Date(dateStr).toLocaleDateString('zh-CN', {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return dateStr;
		}
	}

	onMount(() => {
		loadSources();
	});
</script>

<div class="max-w-6xl">
	<!-- Search -->
	<div class="mb-4">
		<input
			type="text"
			bind:value={searchQuery}
			placeholder={$i18n.t('Search sources...')}
			class="w-full max-w-md rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm dark:text-gray-300 placeholder:text-gray-400"
		/>
	</div>

	{#if loading}
		<div class="flex items-center justify-center py-12">
			<Spinner className="size-6" />
		</div>
	{:else if filteredSources.length === 0}
		<div class="text-center py-12 text-gray-400 dark:text-gray-500">
			{#if searchQuery}
				{$i18n.t('No sources match your search')}
			{:else}
				{$i18n.t('No sources yet. Upload content to get started.')}
			{/if}
		</div>
	{:else}
		<!-- Source table -->
		<div class="overflow-x-auto">
			<table class="w-full text-sm text-left">
				<thead class="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
					<tr>
						<th class="px-3 py-2 font-medium">{$i18n.t('Title')}</th>
						<th class="px-3 py-2 font-medium">{$i18n.t('Source')}</th>
						<th class="px-3 py-2 font-medium">{$i18n.t('Category')}</th>
						<th class="px-3 py-2 font-medium">{$i18n.t('Type')}</th>
						<th class="px-3 py-2 font-medium">{$i18n.t('Topics')}</th>
						<th class="px-3 py-2 font-medium">{$i18n.t('Created')}</th>
						<th class="px-3 py-2 font-medium w-16"></th>
					</tr>
				</thead>
				<tbody>
					{#each filteredSources as source (source.source_id)}
						<tr
							class="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition"
							on:click={() => openDetail(source)}
						>
							<td class="px-3 py-2.5 font-medium max-w-[200px] truncate">
								{source.title || source.source_id}
							</td>
							<td class="px-3 py-2.5 text-xs text-gray-500 max-w-[150px] truncate" title={source.source_name || ''}>
								{source.source_name || '-'}
							</td>
							<td class="px-3 py-2.5">
								<span class="px-2 py-0.5 text-xs rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
									{source.category || '-'}
								</span>
							</td>
							<td class="px-3 py-2.5 text-gray-500">{source.source_type || '-'}</td>
							<td class="px-3 py-2.5">
								<div class="flex flex-wrap gap-1">
									{#each (source.topics || []).slice(0, 3) as topic}
										<span class="text-xs text-gray-400">#{topic}</span>
									{/each}
									{#if (source.topics || []).length > 3}
										<span class="text-xs text-gray-300">+{source.topics.length - 3}</span>
									{/if}
								</div>
							</td>
							<td class="px-3 py-2.5 text-gray-500 text-xs">{formatDate(source.created_at)}</td>
							<td class="px-3 py-2.5">
								<button
									class="text-gray-400 hover:text-red-500 transition p-1"
									on:click|stopPropagation={() => confirmDelete(source)}
									title={$i18n.t('Delete')}
								>
									<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
									</svg>
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="mt-3 text-xs text-gray-400">
			{filteredSources.length} {$i18n.t('sources')}
		</div>
	{/if}
</div>

<!-- Modals -->
<SourceDetailModal bind:show={showDetail} source={selectedSource} />

<ConfirmDialog
	bind:show={showConfirmDelete}
	title={$i18n.t('Delete Source')}
	message={$i18n.t('Are you sure you want to delete "{{title}}"? This cannot be undone.', { title: deleteTargetTitle })}
	on:confirm={handleDelete}
/>
