import { transcriptions } from '$lib/stores';
import { browser, dev } from '$app/environment';
import { env } from '$env/dynamic/public';

/** @type {import('./$types').PageLoad} */
export async function load({ fetch }) {
    // Use different endpoints for server-side and client-side
    const apiHost = browser ? (env.PUBLIC_API_HOST || "http://localhost:8082") : (env.PUBLIC_INTERNAL_API_HOST || "http://localhost:8082");
    const endpoint = `${apiHost}/api/transcriptions`;

    try {
        const response = await fetch(endpoint);
        
        if (!response.ok) {
            console.warn(`Failed to fetch transcriptions: ${response.status}`);
            transcriptions.update(_ => []);
            return {};
        }

        const ts = await response.json();
        
        if (ts) {
            transcriptions.update(_ => ts.length > 0 ? ts : []);
        } else {
            transcriptions.update(_ => []);
        }
    } catch (error) {
        console.warn('Error fetching transcriptions:', error);
        transcriptions.update(_ => []);
    }
    
    return {};
}