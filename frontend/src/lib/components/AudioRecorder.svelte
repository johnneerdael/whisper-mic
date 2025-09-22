<script>
	import { onMount, onDestroy } from 'svelte';
	import { isRecording, recordedBlob, recordingDuration, recordingError } from '$lib/stores';
	import { AudioRecorderUtil, formatDuration } from '$lib/utils';
	import toast from 'svelte-french-toast';

	export let disabled = false;
	export let onRecordingComplete = null;

	let recorder = new AudioRecorderUtil();
	let duration = 0;
	let permissionGranted = false;
	let initializing = false;
	let availableDevices = [];
	let selectedDeviceId = null;
	let devicesLoaded = false;
	let audioLevel = 0;
	let levelCheckInterval = null;
	let isTestRecording = false;
	let testRecordingBlob = null;
	let testMediaRecorder = null;

	// Subscribe to stores
	let recordingState = false;
	let currentBlob = null;
	let currentError = null;

	$: recordingState = $isRecording;
	$: currentBlob = $recordedBlob;
	$: currentError = $recordingError;
	$: duration = $recordingDuration;

	onMount(async () => {
		try {
			initializing = true;
			
			// First, get available devices (this requires initial permission)
			console.log('Initializing recorder...');
			await recorder.initialize();
			permissionGranted = true;
			console.log('Recorder initialized, permission granted');
			
			// Now enumerate devices
			availableDevices = await recorder.getAvailableDevices();
			devicesLoaded = true;
			console.log('Available devices:', availableDevices);
			
			// Set default device
			if (availableDevices.length > 0) {
				selectedDeviceId = availableDevices[0].deviceId;
				console.log('Selected default device:', selectedDeviceId);
			}
			
			recordingError.set(null);
			
			// Verify the stream is actually getting audio
			const tracks = recorder.stream.getAudioTracks();
			tracks.forEach((track, index) => {
				console.log(`Audio track ${index}:`, {
					label: track.label,
					enabled: track.enabled,
					muted: track.muted,
					readyState: track.readyState,
					settings: track.getSettings()
				});
			});
			
			// Start monitoring audio levels after a short delay
			setTimeout(() => {
				startAudioLevelMonitoring();
			}, 500);
		} catch (error) {
			console.error('Failed to initialize recorder:', error);
			recordingError.set(error.message);
			toast.error('Microphone access denied or unavailable');
		} finally {
			initializing = false;
		}
	});

	onDestroy(() => {
		stopAudioLevelMonitoring();
		
		// Clean up test recording
		if (testMediaRecorder && testMediaRecorder.state === 'recording') {
			testMediaRecorder.stop();
		}
		
		recorder.cleanup();
	});

	async function startRecording() {
		if (!permissionGranted || disabled) return;

		try {
			recordingError.set(null);
			recordedBlob.set(null);
			recordingDuration.set(0);
			isRecording.set(true);

			recorder.startRecording((newDuration) => {
				recordingDuration.set(newDuration);
			});

			toast.success('Recording started');
		} catch (error) {
			console.error('Error starting recording:', error);
			recordingError.set(error.message);
			isRecording.set(false);
			toast.error('Failed to start recording');
		}
	}

	async function stopRecording() {
		if (!recordingState) return;

		try {
			const blob = await recorder.stopRecording();
			isRecording.set(false);

			if (blob && blob.size > 0) {
				recordedBlob.set(blob);
				if (onRecordingComplete) {
					onRecordingComplete(blob);
				}
				toast.success('Recording completed');
			} else {
				recordingError.set('No audio data recorded');
				toast.error('Recording failed - no audio data');
			}
		} catch (error) {
			console.error('Error stopping recording:', error);
			recordingError.set(error.message);
			isRecording.set(false);
			toast.error('Failed to stop recording');
		}
	}

	function clearRecording() {
		recordedBlob.set(null);
		recordingDuration.set(0);
		recordingError.set(null);
	}

	async function handleDeviceChange(event) {
		const newDeviceId = event.target.value;
		if (newDeviceId === selectedDeviceId) return;
		
		try {
			selectedDeviceId = newDeviceId;
			await recorder.switchDevice(selectedDeviceId);
			toast.success('Microphone switched successfully');
			recordingError.set(null);
			startAudioLevelMonitoring();
		} catch (error) {
			console.error('Failed to switch microphone:', error);
			recordingError.set('Failed to switch microphone');
			toast.error('Failed to switch microphone');
		}
	}

	function startAudioLevelMonitoring() {
		if (!recorder.stream) {
			console.warn('No stream available for audio monitoring');
			return;
		}
		
		try {
			console.log('Starting audio level monitoring...');
			const audioContext = new (window.AudioContext || window.webkitAudioContext)();
			const analyser = audioContext.createAnalyser();
			const microphone = audioContext.createMediaStreamSource(recorder.stream);
			const dataArray = new Uint8Array(analyser.frequencyBinCount);
			
			microphone.connect(analyser);
			analyser.fftSize = 512; // Increased for better accuracy
			analyser.smoothingTimeConstant = 0.3;
			
			levelCheckInterval = setInterval(() => {
				analyser.getByteTimeDomainData(dataArray); // Changed to time domain for better level detection
				
				// Calculate RMS (Root Mean Square) for more accurate audio level
				let sum = 0;
				for (let i = 0; i < dataArray.length; i++) {
					const sample = (dataArray[i] - 128) / 128; // Normalize to -1 to 1
					sum += sample * sample;
				}
				const rms = Math.sqrt(sum / dataArray.length);
				audioLevel = Math.min(100, rms * 100 * 5); // Multiply by 5 for more sensitivity
				
				// Debug logging
				if (Math.random() < 0.1) { // Log occasionally
					console.log('Audio level:', audioLevel.toFixed(1), '% RMS:', rms.toFixed(3));
				}
			}, 100);
			
			console.log('Audio level monitoring started successfully');
		} catch (error) {
			console.error('Could not start audio level monitoring:', error);
			recordingError.set('Audio monitoring failed: ' + error.message);
		}
	}

	function stopAudioLevelMonitoring() {
		if (levelCheckInterval) {
			clearInterval(levelCheckInterval);
			levelCheckInterval = null;
		}
		audioLevel = 0;
	}

	async function startTestRecording() {
		if (!recorder.stream) {
			toast.error('No microphone stream available');
			return;
		}

		try {
			isTestRecording = true;
			testRecordingBlob = null;
			
			// Try to use a more compatible format
			let mimeType = 'audio/webm;codecs=opus';
			if (!MediaRecorder.isTypeSupported(mimeType)) {
				mimeType = 'audio/webm';
				if (!MediaRecorder.isTypeSupported(mimeType)) {
					mimeType = 'audio/mp4';
					if (!MediaRecorder.isTypeSupported(mimeType)) {
						mimeType = ''; // Use default
					}
				}
			}
			
			console.log('Using MIME type for recording:', mimeType);
			
			const options = mimeType ? { mimeType } : {};
			testMediaRecorder = new MediaRecorder(recorder.stream, options);
			
			const chunks = [];
			testMediaRecorder.ondataavailable = (event) => {
				console.log('Data available, size:', event.data.size);
				if (event.data.size > 0) {
					chunks.push(event.data);
				}
			};
			
			testMediaRecorder.onstop = () => {
				console.log('Recording stopped, total chunks:', chunks.length);
				testRecordingBlob = new Blob(chunks, { type: mimeType || 'audio/webm' });
				console.log('Created blob, size:', testRecordingBlob.size, 'type:', testRecordingBlob.type);
				isTestRecording = false;
				
				if (testRecordingBlob.size > 0) {
					toast.success('Test recording complete! Click "Play Test" to hear it.', { duration: 3000 });
				} else {
					toast.error('Recording appears to be empty - check microphone');
				}
			};
			
			testMediaRecorder.onerror = (event) => {
				console.error('MediaRecorder error:', event.error);
				toast.error('Recording error: ' + event.error);
				isTestRecording = false;
			};
			
			// Start with more frequent data collection
			testMediaRecorder.start(100); // Collect data every 100ms
			console.log('Test recording started with state:', testMediaRecorder.state);
			
			toast('Recording 3-second test... Speak now!', { 
				icon: '🎤',
				duration: 3000 
			});
			
			// Stop after 3 seconds
			setTimeout(() => {
				if (testMediaRecorder && testMediaRecorder.state === 'recording') {
					console.log('Stopping test recording...');
					testMediaRecorder.stop();
				}
			}, 3000);
			
		} catch (error) {
			console.error('Test recording failed:', error);
			toast.error('Test recording failed: ' + error.message);
			isTestRecording = false;
		}
	}

	function playTestRecording() {
		if (!testRecordingBlob) {
			toast.error('No test recording available');
			return;
		}
		
		if (testRecordingBlob.size === 0) {
			toast.error('Test recording is empty - try recording again');
			return;
		}
		
		try {
			const audioUrl = URL.createObjectURL(testRecordingBlob);
			
			console.log('Playing test recording:');
			console.log('- Blob size:', testRecordingBlob.size, 'bytes');
			console.log('- Blob type:', testRecordingBlob.type);
			console.log('- Audio URL:', audioUrl);
			
			// Create audio element and add to DOM temporarily for better compatibility
			const audio = document.createElement('audio');
			audio.controls = false;
			audio.volume = 0.8;
			audio.preload = 'auto';
			
			// Handle playback events with detailed logging
			audio.addEventListener('loadstart', () => {
				console.log('Audio: Load started');
			});
			
			audio.addEventListener('loadedmetadata', () => {
				console.log('Audio: Metadata loaded, duration:', audio.duration);
			});
			
			audio.addEventListener('canplay', () => {
				console.log('Audio: Can play');
			});
			
			audio.addEventListener('play', () => {
				console.log('Audio: Playback started');
				toast.success('🔊 Playing test recording...', { duration: 2000 });
			});
			
			audio.addEventListener('ended', () => {
				console.log('Audio: Playback ended');
				URL.revokeObjectURL(audioUrl);
				audio.remove();
			});
			
			audio.addEventListener('error', (e) => {
				console.error('Audio: Playback error:', {
					error: audio.error,
					code: audio.error?.code,
					message: audio.error?.message
				});
				toast.error(`Playback failed: ${audio.error?.message || 'Unknown error'}`);
				URL.revokeObjectURL(audioUrl);
				audio.remove();
			});
			
			// Set source and try to play
			audio.src = audioUrl;
			
			// Add to DOM temporarily (required for some browsers)
			audio.style.display = 'none';
			document.body.appendChild(audio);
			
			// Attempt playback
			const playPromise = audio.play();
			
			if (playPromise !== undefined) {
				playPromise
					.then(() => {
						console.log('Audio: Play promise resolved');
					})
					.catch(error => {
						console.error('Audio: Play promise rejected:', error);
						toast.error('Playback blocked - browser may require user interaction first');
						URL.revokeObjectURL(audioUrl);
						audio.remove();
					});
			}
			
		} catch (error) {
			console.error('Playback setup failed:', error);
			toast.error('Playback setup failed: ' + error.message);
		}
	}

	function clearTestRecording() {
		testRecordingBlob = null;
		toast('Test recording cleared', { icon: '🗑️' });
	}

	function debugMicrophone() {
		if (!recorder.stream) {
			console.log('No stream available');
			return;
		}

		const tracks = recorder.stream.getAudioTracks();
		console.log('=== MICROPHONE DEBUG ===');
		console.log('Total audio tracks:', tracks.length);
		
		tracks.forEach((track, index) => {
			console.log(`Track ${index}:`, {
				label: track.label,
				enabled: track.enabled,
				muted: track.muted,
				readyState: track.readyState,
				settings: track.getSettings(),
				constraints: track.getConstraints(),
				capabilities: track.getCapabilities()
			});
			
			// Try to unmute if muted
			if (track.muted) {
				console.warn(`Track ${index} is muted!`);
				toast.error('Microphone track is muted!');
			}
			
			if (!track.enabled) {
				console.warn(`Track ${index} is disabled!`);
				track.enabled = true;
				console.log('Enabled track');
			}
		});

		// Test if we can get any audio levels at all
		if (recorder.stream.active) {
			console.log('Stream is active');
		} else {
			console.error('Stream is not active!');
		}
		
		console.log('Stream settings:', recorder.stream.getTracks().map(t => t.getSettings()));
		console.log('========================');
	}
</script>

<div class="w-full max-w-xs form-control">
	<div class="label">
		<span class="label-text">Record Audio</span>
	</div>

	{#if currentError}
		<div class="alert alert-error mb-2 text-sm">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="w-4 h-4 stroke-current shrink-0"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<span class="text-xs">{currentError}</span>
		</div>
	{/if}

	{#if initializing}
		<div class="flex items-center justify-center p-4">
			<span class="loading loading-spinner loading-md"></span>
			<span class="ml-2 text-sm">Initializing microphone...</span>
		</div>
	{:else if !permissionGranted}
		<div class="text-center p-4">
			<p class="text-sm opacity-70 mb-2">Microphone access required</p>
			<button
				class="btn btn-sm btn-outline"
				on:click={() => window.location.reload()}
			>
				Retry
			</button>
		</div>
	{:else}
		<!-- Microphone Selection -->
		{#if devicesLoaded && availableDevices.length > 1}
			<div class="w-full max-w-xs form-control mb-3">
				<label class="label" for="microphone-select">
					<span class="label-text">Select Microphone</span>
				</label>
				<select 
					id="microphone-select"
					class="select select-bordered select-sm" 
					bind:value={selectedDeviceId}
					on:change={handleDeviceChange}
					disabled={recordingState}
				>
					{#each availableDevices as device}
						<option value={device.deviceId}>
							{device.label || `Microphone ${availableDevices.indexOf(device) + 1}`}
						</option>
					{/each}
				</select>
			</div>
		{/if}

		<div class="flex flex-col items-center space-y-3 p-4 border border-base-300 rounded-lg bg-base-50">
			<!-- Audio Level Indicator -->
			{#if permissionGranted && !recordingState}
				<div class="w-full max-w-xs">
					<div class="flex items-center space-x-2 mb-2">
						<span class="text-xs text-base-content opacity-70">Audio Level:</span>
						<div class="flex-1 bg-base-300 rounded-full h-3">
							<div 
								class="h-3 rounded-full transition-all duration-100 {audioLevel > 30 ? 'bg-green-500' : audioLevel > 5 ? 'bg-yellow-500' : 'bg-red-500'}"
								style="width: {Math.max(2, audioLevel)}%"
							></div>
						</div>
						<span class="text-xs font-mono w-10">{audioLevel.toFixed(1)}%</span>
					</div>
					<div class="flex items-center justify-between mb-2">
						{#if audioLevel < 1}
							<div class="text-xs text-error">No audio detected</div>
						{:else if audioLevel < 5}
							<div class="text-xs text-warning">Low audio level</div>
						{:else if audioLevel > 80}
							<div class="text-xs text-info">Excellent audio level! 🎤</div>
						{:else}
							<div class="text-xs text-success">Good audio level ✓</div>
						{/if}
					</div>
					
					<!-- Test Recording Controls -->
					<div class="flex gap-2 justify-center flex-wrap">
						<button 
							class="btn btn-xs btn-outline btn-primary"
							on:click={startTestRecording}
							disabled={isTestRecording || recordingState}
						>
							{#if isTestRecording}
								<span class="loading loading-spinner loading-xs"></span>
								Recording...
							{:else}
								🎤 Test Record
							{/if}
						</button>
						
						<button 
							class="btn btn-xs btn-outline btn-warning"
							on:click={debugMicrophone}
							disabled={isTestRecording || recordingState}
						>
							🔍 Debug Mic
						</button>
						
						{#if testRecordingBlob}
							<button 
								class="btn btn-xs btn-outline btn-success"
								on:click={playTestRecording}
								disabled={isTestRecording || recordingState}
							>
								🔊 Play Test
							</button>
							<button 
								class="btn btn-xs btn-outline btn-info"
								on:click={() => {
									const url = URL.createObjectURL(testRecordingBlob);
									const a = document.createElement('a');
									a.href = url;
									a.download = `test-recording-${Date.now()}.webm`;
									a.click();
									URL.revokeObjectURL(url);
									toast('Test recording downloaded for inspection');
								}}
								disabled={isTestRecording || recordingState}
							>
								📥 Download
							</button>
							<button 
								class="btn btn-xs btn-outline btn-error"
								on:click={clearTestRecording}
								disabled={isTestRecording || recordingState}
							>
								🗑️ Clear
							</button>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Recording Status Indicator -->
			<div class="flex items-center space-x-3">
				{#if recordingState}
					<div class="relative">
						<div class="w-4 h-4 bg-red-500 rounded-full animate-pulse"></div>
						<div class="absolute top-0 left-0 w-4 h-4 bg-red-500 rounded-full animate-ping opacity-75"></div>
					</div>
					<span class="text-sm font-mono text-red-600">REC</span>
				{:else if currentBlob}
					<div class="w-4 h-4 bg-green-500 rounded-full"></div>
					<span class="text-sm font-mono text-green-600">READY</span>
				{:else}
					<div class="w-4 h-4 bg-gray-400 rounded-full"></div>
					<span class="text-sm font-mono text-gray-600">IDLE</span>
				{/if}
			</div>

			<!-- Duration Display -->
			<div class="text-lg font-mono {recordingState ? 'text-red-600' : 'text-base-content'}">
				{formatDuration(duration)}
			</div>

			<!-- Control Buttons -->
			<div class="flex space-x-2">
				{#if !recordingState && !currentBlob}
					<button
						class="btn btn-sm btn-primary {disabled ? 'btn-disabled' : ''}"
						on:click={startRecording}
						disabled={disabled || !permissionGranted}
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 mr-1" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
							<path stroke="none" d="M0 0h24v24H0z" fill="none"/>
							<rect x="9" y="2" width="6" height="11" rx="3"/>
							<path d="M12 18l0 3"/>
							<path d="M8 21l8 0"/>
							<path d="M19 11a7 7 0 0 1 -14 0"/>
						</svg>
						Start Recording
					</button>
				{:else if recordingState}
					<button
						class="btn btn-sm btn-error"
						on:click={stopRecording}
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 mr-1" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
							<path stroke="none" d="M0 0h24v24H0z" fill="none"/>
							<rect x="6" y="6" width="12" height="12" rx="2"/>
						</svg>
						Stop Recording
					</button>
				{:else if currentBlob}
					<button
						class="btn btn-sm btn-secondary"
						on:click={startRecording}
						disabled={disabled}
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 mr-1" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
							<path stroke="none" d="M0 0h24v24H0z" fill="none"/>
							<rect x="9" y="2" width="6" height="11" rx="3"/>
							<path d="M12 18l0 3"/>
							<path d="M8 21l8 0"/>
							<path d="M19 11a7 7 0 0 1 -14 0"/>
						</svg>
						Record Again
					</button>
					<button
						class="btn btn-sm btn-outline"
						on:click={clearRecording}
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 mr-1" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
							<path stroke="none" d="M0 0h24v24H0z" fill="none"/>
							<path d="M4 7l16 0"/>
							<path d="M10 11l0 6"/>
							<path d="M14 11l0 6"/>
							<path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/>
							<path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/>
						</svg>
						Clear
					</button>
				{/if}
			</div>

			<!-- Audio Playback (if recording exists) -->
			{#if currentBlob && !recordingState}
				<div class="w-full">
					<audio controls class="w-full h-8">
						<source src={URL.createObjectURL(currentBlob)} type="audio/webm" />
						Your browser does not support the audio element.
					</audio>
				</div>
			{/if}
		</div>
	{/if}
</div>