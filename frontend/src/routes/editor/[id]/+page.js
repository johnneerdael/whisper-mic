/** @type {import('./$types').PageLoad} */
import { currentTranscription } from '$lib/stores';
import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';

export async function load({params}) {
    // Fetch json from /api/transcriptions/{id}
    let id = params.id;
    // Use different endpoints for server-side and client-side
    const apiHost = browser ? (env.PUBLIC_API_HOST || "http://localhost:8082") : (env.PUBLIC_INTERNAL_API_HOST || "http://localhost:8082");
    const endpoint = `${apiHost}/api/transcriptions`;
    
    try {
        const response = await fetch(`${endpoint}/${id}`);
        
        if (!response.ok) {
            console.error(`Failed to fetch transcription ${id}: ${response.status}`);
            return { error: `Failed to load transcription: ${response.status}` };
        }
        
        const ts = await response.json();
        // Set currentTranscription to the fetched transcription
        currentTranscription.set(ts);
        return ts;
    } catch (error) {
        console.error('Error fetching transcription:', error);
        return { error: 'Failed to load transcription' };
    }
};