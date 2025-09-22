<script>
	import { validateURL, CLIENT_API_HOST } from '$lib/utils.js';
	import { env } from '$env/dynamic/public';
	import { uploadProgress, recordedBlob, isRecording } from '$lib/stores';
	import AudioRecorder from './AudioRecorder.svelte';

	import toast from 'svelte-french-toast';

	let errorMessage = '';
	let disableSubmit = true;
	let modelSize = 'small';
	let language = 'auto';
	let sourceUrl = '';
	let fileInput;
	let device = (env.PUBLIC_WHISHPER_PROFILE || 'cpu') == 'gpu' ? 'cuda' : 'cpu';
	
	// Tab management
	let activeTab = 'file'; // 'file', 'url', 'record'
	let currentRecordedBlob = null;
	
	// Subscribe to recording stores
	$: currentRecordedBlob = $recordedBlob;

	let languages = [
		'auto',
		'ar',
		'be',
		'bg',
		'bn',
		'ca',
		'cs',
		'cy',
		'da',
		'de',
		'el',
		'en',
		'es',
		'fr',
		'it',
		'ja',
		'nl',
		'pl',
		'pt',
		'ru',
		'sk',
		'sl',
		'sv',
		'tk',
		'tr',
		'zh'
	];
	let models = [
		'tiny',
		'tiny.en',
		'base',
		'base.en',
		'small',
		'small.en',
		'medium',
		'medium.en',
		'large-v2',
		'large-v3'
	];
	// Sort the languages
	languages.sort((a, b) => {
		if (a == 'auto') return -1;
		if (b == 'auto') return 1;
		return a.localeCompare(b);
	});

	// Function that sends the data as a form to the backend
	async function sendForm() {
		// Validation based on active tab
		if (activeTab === 'url') {
			if (!sourceUrl) {
				toast.error('Please enter a URL.');
				return;
			}
			if (!validateURL(sourceUrl)) {
				toast.error('You must enter a valid URL.');
				return;
			}
		} else if (activeTab === 'file') {
			if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
				toast.error('Please select a file.');
				return;
			}
		} else if (activeTab === 'record') {
			if (!currentRecordedBlob) {
				toast.error('Please record some audio first.');
				return;
			}
		}

		let formData = new FormData();
		formData.append('language', language);
		formData.append('modelSize', modelSize);
		if (device == 'cuda' || device == 'cpu') {
			formData.append('device', device);
		} else {
			formData.append('device', 'cpu');
		}

		// Handle different input sources
		if (activeTab === 'url') {
			formData.append('sourceUrl', sourceUrl);
		} else if (activeTab === 'file') {
			formData.append('file', fileInput.files[0]);
			formData.append('sourceUrl', '');
		} else if (activeTab === 'record') {
			// Convert WebM blob to a File object with proper name
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const recordingFile = new File([currentRecordedBlob], `recording-${timestamp}.webm`, {
				type: 'audio/webm'
			});
			console.log('Submitting recording:', {
				fileName: recordingFile.name,
				fileSize: recordingFile.size,
				fileType: recordingFile.type,
				blobSize: currentRecordedBlob.size
			});
			formData.append('file', recordingFile);
			formData.append('sourceUrl', '');
		}

		console.log('Uploading to:', `${CLIENT_API_HOST}/api/transcriptions`);
		
		const uploadPromise = new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();

			// Set up progress event listener
			xhr.upload.addEventListener('progress', (event) => {
				if (event.lengthComputable) {
					const percentCompleted = Math.round((event.loaded * 100) / event.total);
					uploadProgress.set(percentCompleted);
				}
			});

			// Set up load event listener
			xhr.addEventListener('load', () => {
				if (xhr.status === 200 || xhr.status === 201) {
					console.log('Upload successful:', xhr.responseText);
					resolve(xhr.response);
					toast.success('Success!');
				} else {
					console.error('Upload failed:', xhr.status, xhr.statusText, xhr.responseText);
					reject(xhr.statusText);
					toast.error(`Upload failed: ${xhr.status} ${xhr.statusText}`);
				}
				uploadProgress.set(0); // Reset progress after completion
			});

			// Set up error event listener
			xhr.addEventListener('error', () => {
				reject(xhr.statusText);
				toast.error('An error occurred during upload');
				uploadProgress.set(0); // Reset progress on error
			});

			xhr.open('POST', `${CLIENT_API_HOST}/api/transcriptions`);
			xhr.send(formData);
		});

		// Wait for the upload to complete, then clear form
		try {
			await uploadPromise;
			
			// Clear form inputs only after successful upload
			sourceUrl = '';
			if (fileInput) fileInput.value = '';
			
			// Clear recording if it was used
			if (activeTab === 'record') {
				recordedBlob.set(null);
			}
			
			uploadProgress.set(0);
		} catch (error) {
			console.error('Upload failed:', error);
			uploadProgress.set(0);
		}
	}

	// Reactive statement for validation
	$: {
		let hasValidInput = false;
		errorMessage = '';

		if (activeTab === 'file' && fileInput?.files?.length > 0) {
			hasValidInput = true;
		} else if (activeTab === 'url' && sourceUrl) {
			if (validateURL(sourceUrl)) {
				hasValidInput = true;
			} else {
				errorMessage = 'Enter a valid URL';
			}
		} else if (activeTab === 'record' && currentRecordedBlob) {
			hasValidInput = true;
		}

		// Disable submit if currently recording or no valid input
		disableSubmit = !hasValidInput || $isRecording;
	}

	function handleTabChange(tab) {
		activeTab = tab;
		// Clear previous inputs when switching tabs
		if (tab !== 'url') sourceUrl = '';
		if (tab !== 'file' && fileInput) fileInput.value = '';
		errorMessage = '';
	}
</script>

<dialog id="modalNewTranscription" class="modal">
	<div class="modal-box max-w-lg">
		<form method="dialog">
			<button class="absolute btn btn-sm btn-circle btn-ghost right-2 top-2">✕</button>
		</form>
		
		<h3 class="font-bold text-lg mb-4">New Transcription</h3>

		{#if errorMessage != ''}
			<div class="alert alert-error mb-4">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="w-6 h-6 stroke-current shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					><path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/></svg
				>
				<span>{errorMessage}</span>
			</div>
		{/if}

		<!-- Tabs -->
		<div class="tabs tabs-boxed mb-4">
			<button 
				class="tab {activeTab === 'file' ? 'tab-active' : ''}"
				on:click={() => handleTabChange('file')}
				type="button"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 mr-1" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
					<path stroke="none" d="M0 0h24v24H0z" fill="none"/>
					<path d="M14 3v4a1 1 0 0 0 1 1h4"/>
					<path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z"/>
				</svg>
				File
			</button>
			<button 
				class="tab {activeTab === 'url' ? 'tab-active' : ''}"
				on:click={() => handleTabChange('url')}
				type="button"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 mr-1" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
					<path stroke="none" d="M0 0h24v24H0z" fill="none"/>
					<path d="M10 14a3.5 3.5 0 0 0 5 0l4 -4a3.5 3.5 0 0 0 -5 -5l-.5 .5"/>
					<path d="M14 10a3.5 3.5 0 0 0 -5 0l-4 4a3.5 3.5 0 0 0 5 5l.5 -.5"/>
				</svg>
				URL
			</button>
			<button 
				class="tab {activeTab === 'record' ? 'tab-active' : ''}"
				on:click={() => handleTabChange('record')}
				type="button"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 mr-1" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
					<path stroke="none" d="M0 0h24v24H0z" fill="none"/>
					<rect x="9" y="2" width="6" height="11" rx="3"/>
					<path d="M12 18l0 3"/>
					<path d="M8 21l8 0"/>
					<path d="M19 11a7 7 0 0 1 -14 0"/>
				</svg>
				Record
			</button>
		</div>

		<!-- Tab Content -->
		<div class="mb-4">
			{#if activeTab === 'file'}
				<div class="w-full form-control">
					<label for="file" class="label">
						<span class="label-text">Choose an audio or video file</span>
					</label>
					<input
						name="file"
						bind:this={fileInput}
						type="file"
						accept="audio/*,video/*"
						class="w-full file-input file-input-sm file-input-bordered file-input-primary"
					/>
				</div>
			{:else if activeTab === 'url'}
				<div class="w-full form-control">
					<label for="sourceUrl" class="label">
						<span class="label-text">Enter a media URL</span>
					</label>
					<input
						name="sourceUrl"
						bind:value={sourceUrl}
						type="text"
						placeholder="https://youtube.com/watch?v=..."
						class="w-full input input-sm input-bordered input-primary"
					/>
					<div class="label">
						<span class="label-text-alt">Supports YouTube, direct media URLs, etc.</span>
					</div>
				</div>
			{:else if activeTab === 'record'}
				<AudioRecorder disabled={$isRecording} />
			{/if}
		</div>

		<div class="mb-0 divider" />
		<!-- Whisper Configuration -->
		<div class="flex space-x-4">
			<div class="w-full max-w-xs form-control">
				<label for="modelSize" class="label">
					<span class="label-text">Whisper model</span>
				</label>
				<select name="modelSize" bind:value={modelSize} class="select select-bordered">
					{#each models as m}
						<option value={m}>{m}</option>
					{/each}
				</select>
			</div>

			<div class="w-full max-w-xs form-control">
				<label for="language" class="label">
					<span class="label-text">Language</span>
				</label>
				<select name="language" bind:value={language} class="select select-bordered">
					{#each languages as l}
						<option value={l}>{l}</option>
					{/each}
				</select>
			</div>

			<div class="w-full max-w-xs form-control">
				<label for="language" class="label">
					<span class="label-text">Device</span>
				</label>
				<select name="device" bind:value={device} class="select select-bordered">
					{#if (env.PUBLIC_WHISHPER_PROFILE || 'cpu') == 'gpu'}
						<option selected value="cuda">GPU</option>
						<option value="cpu">CPU</option>
					{:else}
						<option selected value="cpu">CPU</option>
						<option disabled value="cuda">GPU</option>
					{/if}
				</select>
			</div>
		</div>

		<div class="mb-0 divider" />
		<!--Actions-->
		<button class="btn btn-wide btn-primary" on:click={sendForm} disabled={disableSubmit}
			>Start</button
		>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>close</button>
	</form>
</dialog>
