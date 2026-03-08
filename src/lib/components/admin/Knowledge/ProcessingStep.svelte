<script>
	export let task = {
		task_id: '',
		status: 'pending',
		current_step: '',
		progress_percent: 0,
		filename: '',
		source_type: '',
		category: '',
		error: null
	};

	// Pipeline 的 6 个处理步骤及对应的 ProcessingStatus 值
	const STEPS = [
		{ key: 'extracting', label: 'Extract', icon: '1' },
		{ key: 'structuring', label: 'Structure', icon: '2' },
		{ key: 'enriching', label: 'Enrich', icon: '3' },
		{ key: 'storing', label: 'Store', icon: '4' },
		{ key: 'chunking', label: 'Chunk', icon: '5' },
		{ key: 'embedding', label: 'Embed', icon: '6' }
	];

	// 步骤顺序索引
	const STEP_ORDER = Object.fromEntries(STEPS.map((s, i) => [s.key, i]));

	function getStepState(stepKey) {
		if (task.status === 'completed') return 'done';
		if (task.status === 'failed') {
			const failIdx = STEP_ORDER[task.status] ?? -1;
			const stepIdx = STEP_ORDER[stepKey];
			if (stepIdx < failIdx) return 'done';
			if (stepIdx === failIdx) return 'error';
			return 'pending';
		}
		const currentIdx = STEP_ORDER[task.status] ?? -1;
		const stepIdx = STEP_ORDER[stepKey];
		if (stepIdx < currentIdx) return 'done';
		if (stepIdx === currentIdx) return 'active';
		return 'pending';
	}
</script>

<div class="border border-gray-200 dark:border-gray-700 rounded-xl p-4 mb-3">
	<!-- Header -->
	<div class="flex items-center justify-between mb-3">
		<div class="text-sm font-medium truncate max-w-[60%]">{task.filename}</div>
		<div class="flex items-center gap-2 text-xs text-gray-500">
			<span class="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800">{task.source_type}</span>
			<span class="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800">{task.category}</span>
		</div>
	</div>

	<!-- Progress bar -->
	<div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-3">
		<div
			class="h-2 rounded-full transition-all duration-500 {task.status === 'failed'
				? 'bg-red-500'
				: task.status === 'completed'
					? 'bg-green-500'
					: 'bg-blue-500'}"
			style="width: {task.progress_percent}%"
		></div>
	</div>

	<!-- Step indicators -->
	<div class="flex items-center justify-between gap-1 mb-2">
		{#each STEPS as step}
			{@const state = getStepState(step.key)}
			<div class="flex flex-col items-center gap-1 flex-1">
				<div
					class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all duration-300
					{state === 'done'
						? 'bg-green-500 text-white'
						: state === 'active'
							? 'bg-blue-500 text-white animate-pulse'
							: state === 'error'
								? 'bg-red-500 text-white'
								: 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'}"
				>
					{#if state === 'done'}
						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
					{:else if state === 'error'}
						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					{:else}
						{step.icon}
					{/if}
				</div>
				<span class="text-[10px] text-gray-500 dark:text-gray-400 whitespace-nowrap">{step.label}</span>
			</div>
		{/each}
	</div>

	<!-- Status text -->
	<div class="flex items-center justify-between text-xs">
		<span class="text-gray-500 dark:text-gray-400">
			{#if task.status === 'completed'}
				Processing complete
			{:else if task.status === 'failed'}
				<span class="text-red-500">{task.error || 'Processing failed'}</span>
			{:else if task.current_step}
				{task.current_step}
			{:else}
				Waiting...
			{/if}
		</span>
		<span class="text-gray-400">{task.progress_percent}%</span>
	</div>
</div>
