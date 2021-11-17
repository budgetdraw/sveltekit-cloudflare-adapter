let waited = false

export async function handle({ request, resolve }) {
    if (request.path == '/wait-until') {
        request.cfFetchEvent.waitUntil(new Promise(resolve => setTimeout(() => {
            waited = true
            resolve()
        }, 500)))
        return {
            status: 200,
            body: JSON.stringify(waited),
            headers: { 'content-type': 'application/json' },
        }
    }
	return await resolve(request);
}