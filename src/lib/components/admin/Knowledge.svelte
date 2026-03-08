<script>
	import { getContext, onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { user } from '$lib/stores';

	import UploadPanel from './Knowledge/UploadPanel.svelte';
	import SourceList from './Knowledge/SourceList.svelte';
	import AgentSettings from './Knowledge/AgentSettings.svelte';

	const i18n = getContext('i18n');

	let selectedTab;
	$: {
		const pathParts = $page.url.pathname.split('/');
		const tabFromPath = pathParts[pathParts.length - 1];
		selectedTab = ['upload', 'sources', 'settings'].includes(tabFromPath) ? tabFromPath : 'upload';
	}

	let loaded = false;

	onMount(async () => {
		if ($user?.role !== 'admin') {
			await goto('/');
		}
		loaded = true;
	});
</script>

{#if loaded}
	<div class="flex flex-col w-full h-full pb-2">
		<!-- Tab navigation -->
		<div
			class="mx-4 flex flex-row gap-2.5 text-sm font-medium scrollbar-none overflow-x-auto"
		>
			<button
				class="px-0.5 py-1 min-w-fit rounded-lg transition {selectedTab === 'upload'
					? ''
					: 'text-gray-300 dark:text-gray-600 hover:text-gray-700 dark:hover:text-white'}"
				on:click={() => goto('/admin/knowledge/upload')}
			>
				{$i18n.t('Upload')}
			</button>
			<button
				class="px-0.5 py-1 min-w-fit rounded-lg transition {selectedTab === 'sources'
					? ''
					: 'text-gray-300 dark:text-gray-600 hover:text-gray-700 dark:hover:text-white'}"
				on:click={() => goto('/admin/knowledge/sources')}
			>
				{$i18n.t('Sources')}
			</button>
			<button
				class="px-0.5 py-1 min-w-fit rounded-lg transition {selectedTab === 'settings'
					? ''
					: 'text-gray-300 dark:text-gray-600 hover:text-gray-700 dark:hover:text-white'}"
				on:click={() => goto('/admin/knowledge/settings')}
			>
				{$i18n.t('Settings')}
			</button>
		</div>

		<!-- Tab content -->
		<div class="flex-1 overflow-y-auto px-4 pt-3">
			{#if selectedTab === 'upload'}
				<UploadPanel />
			{:else if selectedTab === 'sources'}
				<SourceList />
			{:else if selectedTab === 'settings'}
				<AgentSettings />
			{/if}
		</div>
	</div>
{/if}
