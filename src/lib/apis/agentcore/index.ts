// Agent Core API 客户端 — 直接调用 agent-core (port 8000)
// 无鉴权 token，agent-core 是本地个人服务

const AGENT_CORE_URL = 'http://localhost:8000';

export const processContent = async (
	file: File,
	sourceType: string = 'auto',
	category: string = 'generic'
) => {
	let error = null;

	const formData = new FormData();
	formData.append('file', file);
	formData.append('source_type', sourceType);
	formData.append('category', category);

	const res = await fetch(`${AGENT_CORE_URL}/v1/content/process`, {
		method: 'POST',
		body: formData
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err.detail || err.message || 'Upload failed';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const processUrl = async (
	url: string,
	sourceType: string = 'video',
	category: string = 'generic'
) => {
	let error = null;

	const res = await fetch(`${AGENT_CORE_URL}/v1/content/process-url`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			url,
			source_type: sourceType,
			category
		})
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err.detail || err.message || 'URL processing failed';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const getTaskProgress = async (taskId: string) => {
	let error = null;

	const res = await fetch(`${AGENT_CORE_URL}/v1/content/progress/${taskId}`, {
		method: 'GET',
		headers: { Accept: 'application/json' }
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err.detail || err.message || 'Failed to get progress';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const getTaskResult = async (taskId: string) => {
	let error = null;

	const res = await fetch(`${AGENT_CORE_URL}/v1/content/result/${taskId}`, {
		method: 'GET',
		headers: { Accept: 'application/json' }
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err.detail || err.message || 'Failed to get result';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const listTasks = async () => {
	let error = null;

	const res = await fetch(`${AGENT_CORE_URL}/v1/content/tasks`, {
		method: 'GET',
		headers: { Accept: 'application/json' }
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err.detail || err.message || 'Failed to list tasks';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const listSources = async () => {
	let error = null;

	const res = await fetch(`${AGENT_CORE_URL}/v1/kb/sources`, {
		method: 'GET',
		headers: { Accept: 'application/json' }
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err.detail || err.message || 'Failed to list sources';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const getSource = async (sourceId: string) => {
	let error = null;

	const res = await fetch(`${AGENT_CORE_URL}/v1/kb/sources/${sourceId}`, {
		method: 'GET',
		headers: { Accept: 'application/json' }
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err.detail || err.message || 'Failed to get source';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const getSourceChunks = async (sourceId: string) => {
	let error = null;

	const res = await fetch(`${AGENT_CORE_URL}/v1/kb/sources/${sourceId}/chunks`, {
		method: 'GET',
		headers: { Accept: 'application/json' }
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err.detail || err.message || 'Failed to get chunks';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const deleteSource = async (sourceId: string) => {
	let error = null;

	const res = await fetch(`${AGENT_CORE_URL}/v1/kb/sources/${sourceId}`, {
		method: 'DELETE',
		headers: { Accept: 'application/json' }
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err.detail || err.message || 'Failed to delete source';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

// === Skill Settings ===

export const getSkills = async () => {
	let error = null;

	const res = await fetch(`${AGENT_CORE_URL}/v1/settings/skills`, {
		method: 'GET',
		headers: { Accept: 'application/json' }
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err.detail || err.message || 'Failed to get skills';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const createSkill = async (skill: {
	skill_id: string;
	display_name: string;
	description: string;
	system_prompt: string;
	trigger_words: string[];
	category_filter?: string;
	enabled?: boolean;
}) => {
	let error = null;

	const res = await fetch(`${AGENT_CORE_URL}/v1/settings/skills`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(skill)
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err.detail || err.message || 'Failed to create skill';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const updateSkill = async (
	skillId: string,
	skill: {
		skill_id: string;
		display_name: string;
		description: string;
		system_prompt: string;
		trigger_words: string[];
		category_filter?: string;
		enabled?: boolean;
	}
) => {
	let error = null;

	const res = await fetch(`${AGENT_CORE_URL}/v1/settings/skills/${skillId}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(skill)
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err.detail || err.message || 'Failed to update skill';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const deleteSkill = async (skillId: string) => {
	let error = null;

	const res = await fetch(`${AGENT_CORE_URL}/v1/settings/skills/${skillId}`, {
		method: 'DELETE',
		headers: { Accept: 'application/json' }
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err.detail || err.message || 'Failed to delete skill';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

// === LLM Settings ===

export const getLLMSettings = async () => {
	let error = null;

	const res = await fetch(`${AGENT_CORE_URL}/v1/settings/llm`, {
		method: 'GET',
		headers: { Accept: 'application/json' }
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err.detail || err.message || 'Failed to get LLM settings';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const saveLLMSettings = async (settings: {
	active_model: string;
	models: Array<{
		model_id: string;
		display_name: string;
		api_key: string;
		api_base: string;
	}>;
	retrieval_top_k: number;
	temperature: number;
}) => {
	let error = null;

	const res = await fetch(`${AGENT_CORE_URL}/v1/settings/llm`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(settings)
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err.detail || err.message || 'Failed to save LLM settings';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const testLLMConnection = async (model: {
	model_id: string;
	display_name: string;
	api_key: string;
	api_base: string;
}) => {
	let error = null;

	const res = await fetch(`${AGENT_CORE_URL}/v1/settings/llm/test`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(model)
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err.detail || err.message || 'Failed to test connection';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

// === Knowledge Base ===

export const getKbStats = async () => {
	let error = null;

	const res = await fetch(`${AGENT_CORE_URL}/v1/kb/stats`, {
		method: 'GET',
		headers: { Accept: 'application/json' }
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err.detail || err.message || 'Failed to get stats';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};
