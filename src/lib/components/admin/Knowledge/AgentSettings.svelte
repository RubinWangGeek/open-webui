<script>
	import { onMount, getContext } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { getLLMSettings, saveLLMSettings, testLLMConnection, getSkills, updateSkill, deleteSkill } from '$lib/apis/agentcore';

	const i18n = getContext('i18n');

	let loading = true;
	let saving = false;

	// Settings state
	let activeModel = '';
	let models = [];
	let retrievalTopK = 10;
	let temperature = 0.3;

	// Track which model is being tested
	let testingModelId = '';

	// Skills state
	let skills = [];

	const PRESETS = [
		{ model_id: 'claude-opus-4-1-20250805-thinking', display_name: 'Claude Opus 4.1' },
		{ model_id: 'claude-sonnet-4-20250514', display_name: 'Claude Sonnet 4' },
		{ model_id: 'gpt-4o', display_name: 'GPT-4o' },
		{ model_id: 'gpt-4o-mini', display_name: 'GPT-4o Mini' },
		{ model_id: 'gemini-2.5-pro-preview-06-05', display_name: 'Gemini 2.5 Pro' },
		{ model_id: 'gemini-2.0-flash', display_name: 'Gemini 2.0 Flash' },
		{ model_id: 'deepseek-chat', display_name: 'DeepSeek V3' }
	];

	async function loadSettings() {
		loading = true;
		try {
			const data = await getLLMSettings();
			if (data) {
				activeModel = data.active_model || '';
				models = (data.models || []).map((m) => ({ ...m, showKey: false }));
				retrievalTopK = data.retrieval_top_k ?? 10;
				temperature = data.temperature ?? 0.3;
			}
		} catch (err) {
			toast.error('Failed to load settings: ' + err);
		}
		// 加载 Skills
		try {
			const skillsData = await getSkills();
			if (skillsData) {
				skills = skillsData.skills || [];
			}
		} catch (err) {
			console.error('Failed to load skills:', err);
		}
		loading = false;
	}

	async function handleSave() {
		saving = true;
		try {
			const payload = {
				active_model: activeModel,
				models: models.map((m) => ({
					model_id: m.model_id,
					display_name: m.display_name,
					api_key: m.api_key,
					api_base: m.api_base
				})),
				retrieval_top_k: retrievalTopK,
				temperature: temperature
			};
			await saveLLMSettings(payload);
			toast.success($i18n.t('Settings saved successfully!'));
		} catch (err) {
			toast.error('Failed to save: ' + err);
		}
		saving = false;
	}

	async function handleTest(model) {
		testingModelId = model.model_id;
		try {
			const result = await testLLMConnection({
				model_id: model.model_id,
				display_name: model.display_name,
				api_key: model.api_key,
				api_base: model.api_base
			});
			if (result?.status === 'ok') {
				toast.success(`${model.display_name}: ${result.response}`);
			} else {
				toast.error(`${model.display_name}: ${result?.error || 'Unknown error'}`);
			}
		} catch (err) {
			toast.error(`Test failed: ${err}`);
		}
		testingModelId = '';
	}

	function addModel() {
		models = [
			...models,
			{
				model_id: '',
				display_name: '',
				api_key: '',
				api_base: 'https://api.apiyi.com/v1',
				showKey: false
			}
		];
	}

	function addPreset(preset) {
		// Don't add duplicates
		if (models.some((m) => m.model_id === preset.model_id)) {
			toast.warning(`${preset.display_name} already exists`);
			return;
		}
		models = [
			...models,
			{
				...preset,
				api_key: '',
				api_base: 'https://api.apiyi.com/v1',
				showKey: false
			}
		];
	}

	function removeModel(index) {
		const removed = models[index];
		models = models.filter((_, i) => i !== index);
		// If removed model was active, clear active
		if (removed.model_id === activeModel) {
			activeModel = '';
		}
	}

	async function handleSaveSkill(skill) {
		try {
			await updateSkill(skill.skill_id, skill);
			toast.success(`Skill "${skill.display_name}" updated`);
			const data = await getSkills();
			skills = data?.skills || [];
		} catch (err) {
			toast.error('Failed to save skill: ' + err);
		}
	}

	async function handleDeleteSkill(skillId) {
		try {
			await deleteSkill(skillId);
			toast.success('Skill deleted');
			const data = await getSkills();
			skills = data?.skills || [];
		} catch (err) {
			toast.error('Failed to delete skill: ' + err);
		}
	}

	async function handleToggleSkill(skill) {
		skill.enabled = !skill.enabled;
		await handleSaveSkill(skill);
	}

	onMount(() => loadSettings());
</script>

{#if loading}
	<div class="flex justify-center items-center h-32">
		<div class="text-gray-500">{$i18n.t('Loading')}...</div>
	</div>
{:else}
	<div class="flex flex-col gap-6 max-w-4xl">
		<!-- Active Model Selection -->
		<div>
			<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
				{$i18n.t('Active Model')}
			</label>
			<select
				bind:value={activeModel}
				class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
			>
				<option value="">{$i18n.t('None (use .env fallback)')}</option>
				{#each models as model}
					<option value={model.model_id}>{model.display_name} ({model.model_id})</option>
				{/each}
			</select>
		</div>

		<!-- Quick Add Preset -->
		<div>
			<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
				{$i18n.t('Quick Add Preset')}
			</label>
			<div class="flex flex-wrap gap-2">
				{#each PRESETS as preset}
					<button
						class="px-2.5 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600
							hover:bg-gray-100 dark:hover:bg-gray-700 transition"
						on:click={() => addPreset(preset)}
					>
						+ {preset.display_name}
					</button>
				{/each}
			</div>
		</div>

		<!-- Models List -->
		<div>
			<div class="flex items-center justify-between mb-2">
				<label class="text-sm font-medium text-gray-700 dark:text-gray-300">
					{$i18n.t('Configured Models')} ({models.length})
				</label>
				<button
					class="px-3 py-1 text-xs rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition"
					on:click={addModel}
				>
					+ {$i18n.t('Add Model')}
				</button>
			</div>

			{#if models.length === 0}
				<div class="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
					{$i18n.t('No models configured. Add a preset or create one manually.')}
				</div>
			{/if}

			<div class="flex flex-col gap-3">
				{#each models as model, index}
					<div
						class="border rounded-lg p-3 {model.model_id === activeModel
							? 'border-green-500 bg-green-50 dark:bg-green-900/10'
							: 'border-gray-300 dark:border-gray-600'}"
					>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
							<div>
								<label class="text-xs text-gray-500">{$i18n.t('Display Name')}</label>
								<input
									type="text"
									bind:value={model.display_name}
									placeholder="Claude Sonnet 4"
									class="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
								/>
							</div>
							<div>
								<label class="text-xs text-gray-500">{$i18n.t('Model ID')}</label>
								<input
									type="text"
									bind:value={model.model_id}
									placeholder="claude-sonnet-4-20250514"
									class="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
								/>
							</div>
						</div>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
							<div>
								<label class="text-xs text-gray-500">{$i18n.t('API Key')}</label>
								<div class="flex gap-1">
									<input
										type={model.showKey ? 'text' : 'password'}
										bind:value={model.api_key}
										placeholder="sk-..."
										class="flex-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
									/>
									<button
										class="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
										on:click={() => (model.showKey = !model.showKey)}
									>
										{model.showKey ? 'Hide' : 'Show'}
									</button>
								</div>
							</div>
							<div>
								<label class="text-xs text-gray-500">{$i18n.t('API Base URL')}</label>
								<input
									type="text"
									bind:value={model.api_base}
									placeholder="https://api.apiyi.com/v1"
									class="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
								/>
							</div>
						</div>
						<div class="flex justify-end gap-2">
							<button
								class="px-2.5 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600
									hover:bg-gray-100 dark:hover:bg-gray-700 transition
									disabled:opacity-50"
								disabled={testingModelId === model.model_id || !model.api_key}
								on:click={() => handleTest(model)}
							>
								{testingModelId === model.model_id ? 'Testing...' : 'Test'}
							</button>
							{#if model.model_id !== activeModel}
								<button
									class="px-2.5 py-1 text-xs rounded-lg bg-green-500 text-white hover:bg-green-600 transition"
									on:click={() => (activeModel = model.model_id)}
								>
									{$i18n.t('Set Active')}
								</button>
							{:else}
								<span class="px-2.5 py-1 text-xs text-green-600 font-medium">Active</span>
							{/if}
							<button
								class="px-2.5 py-1 text-xs rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
								on:click={() => removeModel(index)}
							>
								{$i18n.t('Delete')}
							</button>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Skills Management -->
		<div class="border-t border-gray-200 dark:border-gray-700 pt-4">
			<div class="flex items-center justify-between mb-3">
				<label class="text-sm font-medium text-gray-700 dark:text-gray-300">
					{$i18n.t('Skills')} ({skills.length})
				</label>
			</div>

			{#if skills.length === 0}
				<div class="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
					{$i18n.t('No skills configured. Upload content with a category to auto-generate.')}
				</div>
			{/if}

			<div class="flex flex-col gap-3">
				{#each skills as skill}
					<div class="border rounded-lg p-3 {skill.enabled
						? 'border-gray-300 dark:border-gray-600'
						: 'border-gray-200 dark:border-gray-700 opacity-60'}">
						<div class="flex items-center justify-between mb-2">
							<div class="flex items-center gap-2">
								<span class="font-medium text-sm">{skill.display_name}</span>
								{#if skill.auto_generated}
									<span class="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
										Auto
									</span>
								{/if}
								<span class="text-xs text-gray-400">{skill.skill_id}</span>
							</div>
							<div class="flex items-center gap-1">
								<button
									class="px-2 py-1 text-xs rounded {skill.enabled
										? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
										: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}"
									on:click={() => handleToggleSkill(skill)}
								>
									{skill.enabled ? 'Enabled' : 'Disabled'}
								</button>
								<button
									class="px-2 py-1 text-xs rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
									on:click={() => handleDeleteSkill(skill.skill_id)}
								>
									Delete
								</button>
							</div>
						</div>

						<div class="text-xs text-gray-500 mb-2">{skill.description}</div>

						<!-- Editable fields -->
						<details class="text-sm">
							<summary class="cursor-pointer text-xs text-blue-500 hover:text-blue-600 mb-2">
								Edit details
							</summary>
							<div class="flex flex-col gap-2 mt-2">
								<div>
									<label class="text-xs text-gray-500">Display Name</label>
									<input
										type="text"
										bind:value={skill.display_name}
										class="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
									/>
								</div>
								<div>
									<label class="text-xs text-gray-500">Description</label>
									<input
										type="text"
										bind:value={skill.description}
										class="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
									/>
								</div>
								<div>
									<label class="text-xs text-gray-500">Trigger Words (comma separated)</label>
									<input
										type="text"
										value={skill.trigger_words?.join(', ') || ''}
										on:change={(e) => { skill.trigger_words = e.target.value.split(',').map(s => s.trim()).filter(Boolean); }}
										class="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
									/>
								</div>
								<div>
									<label class="text-xs text-gray-500">System Prompt</label>
									<textarea
										bind:value={skill.system_prompt}
										rows="4"
										class="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
									/>
								</div>
								<div class="flex justify-end">
									<button
										class="px-3 py-1 text-xs rounded-lg bg-blue-500 text-white hover:bg-blue-600"
										on:click={() => handleSaveSkill(skill)}
									>
										Save Changes
									</button>
								</div>
							</div>
						</details>
					</div>
				{/each}
			</div>
		</div>

		<!-- Retrieval Settings -->
		<div class="border-t border-gray-200 dark:border-gray-700 pt-4">
			<label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
				{$i18n.t('Retrieval Settings')}
			</label>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div>
					<label class="text-xs text-gray-500">Top K ({$i18n.t('number of chunks to retrieve')})</label>
					<input
						type="number"
						bind:value={retrievalTopK}
						min="1"
						max="50"
						class="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
					/>
				</div>
				<div>
					<label class="text-xs text-gray-500">Temperature ({temperature})</label>
					<input
						type="range"
						bind:value={temperature}
						min="0"
						max="1"
						step="0.1"
						class="w-full"
					/>
				</div>
			</div>
		</div>

		<!-- Save -->
		<div class="flex justify-end pt-2">
			<button
				class="px-6 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition
					disabled:opacity-50 text-sm font-medium"
				disabled={saving}
				on:click={handleSave}
			>
				{saving ? $i18n.t('Saving...') : $i18n.t('Save')}
			</button>
		</div>
	</div>
{/if}
