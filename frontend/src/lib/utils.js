import {transcriptions} from './stores';
import { dev } from '$app/environment';
import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';

export let CLIENT_API_HOST = browser ? `${dev ? env.PUBLIC_API_HOST || "http://localhost:8082" : ""}` : `${env.PUBLIC_INTERNAL_API_HOST || "http://localhost:8082"}`;
export let CLIENT_WS_HOST = browser ? `${dev ? (env.PUBLIC_API_HOST || "http://localhost:8082").replace("http://", "").replace("https://", "") : ""}` :  `${dev ? (env.PUBLIC_INTERNAL_API_HOST || "http://localhost:8082").replace("http://", "").replace("https://", "") : ""}`;

// URL Validator
export const validateURL = function (url) {
    try {
        new URL(url);
        return true;
    } catch (e) {
        return false;
    }
}

export const deleteTranscription = async function (id) {
    const res = await fetch(`${CLIENT_API_HOST}/api/transcriptions/${id}`, {
        method: "DELETE"
    });

    if (res.ok) {
        transcriptions.update((_transcriptions) => _transcriptions.filter(t => t.id !== id));
    }
}

export const getRandomSentence = function () {
    const sentences = [
        "Audio in, text out. What's your sound about?",
        "Drop the beat, I'll drop the text!",
        "Everybody knows the bird is the word!",
        "From soundcheck to spellcheck!",
        "I got 99 problems but transcribing ain't one!",
        "I'm all ears!",
        "iTranscribe, you dictate!",
        "Lost for words?",
        "Sound check 1, 2, 3...",
        "Sound's up! What's your script?",
        "Transcribe, transcribe, transcribe!",
        "What are you transcribing today?",
        "What's the story, morning wordy?",
        "Words, don't come easy, but I can help find the way.",
        "You speak, I write. It's no magic, just AI!",
        "Can't understand that language? I can translate!",
        "I mean every word I say!"
    ]

    const randomSentence = sentences[Math.floor(Math.random() * sentences.length)];

    return randomSentence;
}

// Expects a segments array with start, end and text properties
export const downloadSRT = function (jsonData, title) {
    let srtContent = '';
    
    jsonData.forEach((segment, index) => {
        let startSeconds = Math.floor(segment.start);
        let startMillis = Math.floor((segment.start - startSeconds) * 1000);
        let start = new Date(startSeconds * 1000 + startMillis).toISOString().substr(11, 12);
        let endSeconds = Math.floor(segment.end);
        let endMillis = Math.floor((segment.end - endSeconds) * 1000);
        let end = new Date(endSeconds * 1000 + endMillis).toISOString().substr(11, 12);
    
        srtContent += `${index + 1}\n${start} --> ${end}\n${segment.text}\n\n`;
    });
  
    let srtBlob = new Blob([srtContent], {type: 'text/plain'});
    let url = URL.createObjectURL(srtBlob);
    let link = document.createElement('a');
    link.href = url;
    link.download = `${title}.srt`;
    link.click();
}

// Downloads received text as a TXT file
export const downloadTXT = function (text, title) {
    let srtBlob = new Blob([text], {type: 'text/plain'});
    let url = URL.createObjectURL(srtBlob);
    let link = document.createElement('a');
    link.href = url;
    link.download = `${title}.txt`;
    link.click();
}

// Downloads received JSON data as a JSON file
export const downloadJSON = function (jsonData, title) {
    let srtBlob = new Blob([JSON.stringify(jsonData)], {type: 'text/plain'});
    let url = URL.createObjectURL(srtBlob);
    let link = document.createElement('a');
    link.href = url;
    link.download = `${title}.json`;
    link.click();
}

// Expects a segments array with start, end and text properties
export const downloadVTT = function (jsonData, title) {
    let vttContent = 'WEBVTT\n\n'; // VTT files start with "WEBVTT" line
  
    jsonData.forEach((segment, index) => {
      let startSeconds = Math.floor(segment.start);
      let startMillis = Math.floor((segment.start - startSeconds) * 1000);
      let start = new Date(startSeconds * 1000 + startMillis).toISOString().substr(11, 12);
  
      let endSeconds = Math.floor(segment.end);
      let endMillis = Math.floor((segment.end - endSeconds) * 1000);
      let end = new Date(endSeconds * 1000 + endMillis).toISOString().substr(11, 12);
  
      vttContent += `${index + 1}\n${start} --> ${end}\n${segment.text}\n\n`;
    });
  
    let vttBlob = new Blob([vttContent], {type: 'text/plain'});
    let url = URL.createObjectURL(vttBlob);
    let link = document.createElement('a');
    link.href = url;
    link.download = `${title}.vtt`;
    link.click();
}

// Audio Recording Utilities
export class AudioRecorderUtil {
    constructor() {
        this.mediaRecorder = null;
        this.stream = null;
        this.chunks = [];
        this.startTime = null;
        this.durationInterval = null;
        this.selectedDeviceId = null;
    }

    async getAvailableDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');
            return audioInputs;
        } catch (error) {
            console.error('Error enumerating devices:', error);
            return [];
        }
    }

    async initialize(deviceId = null) {
        try {
            this.selectedDeviceId = deviceId;
            const constraints = {
                audio: {
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                    sampleRate: 16000,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            };
            
            console.log('Requesting microphone access with constraints:', constraints);
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Verify stream
            const tracks = this.stream.getAudioTracks();
            console.log('Audio tracks obtained:', tracks.length);
            if (tracks.length > 0) {
                console.log('Active track:', tracks[0].label, 'enabled:', tracks[0].enabled);
                console.log('Track settings:', tracks[0].getSettings());
            }
            
            return true;
        } catch (error) {
            console.error('Error accessing microphone:', error);
            throw new Error('Unable to access microphone. Please check permissions and device selection.');
        }
    }

    async switchDevice(deviceId) {
        // Clean up current stream
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        
        // Initialize with new device
        return await this.initialize(deviceId);
    }

    startRecording(onDurationUpdate) {
        if (!this.stream) {
            throw new Error('Microphone not initialized. Call initialize() first.');
        }

        this.chunks = [];
        this.mediaRecorder = new MediaRecorder(this.stream, { 
            mimeType: 'audio/webm;codecs=opus' 
        });

        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.chunks.push(event.data);
            }
        };

        this.startTime = Date.now();
        if (onDurationUpdate) {
            this.durationInterval = setInterval(() => {
                const duration = Math.floor((Date.now() - this.startTime) / 1000);
                onDurationUpdate(duration);
            }, 100);
        }

        this.mediaRecorder.start();
    }

    stopRecording() {
        return new Promise((resolve) => {
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.onstop = () => {
                    const blob = new Blob(this.chunks, { type: 'audio/webm' });
                    resolve(blob);
                };
                this.mediaRecorder.stop();
            } else {
                resolve(null);
            }

            if (this.durationInterval) {
                clearInterval(this.durationInterval);
                this.durationInterval = null;
            }
        });
    }

    cleanup() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.durationInterval) {
            clearInterval(this.durationInterval);
        }
        this.mediaRecorder = null;
        this.chunks = [];
    }
}

// Format duration from seconds to MM:SS format
export const formatDuration = function(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
  
