import { init, render } from '../output/server/app.js'
import manifest from '../output/manifest.json'
import mime from 'mime'

init()

const kvAssets = Object.fromEntries(
    Object.values(manifest).map(entry => [entry.file, true])
)

addEventListener('fetch', (event) => {
	event.respondWith(handle(event))
})

async function handle(event) {
	const request = event.request
	const url = new URL(request.url)

    if (! url.pathname.endsWith('/') &&
        (url.pathname.startsWith('/_app/') || /^\/(?:(?=a)b|static_paths)$/.test(url.pathname))
    ) {
        if (! safeMethod(request)) {
            return methodNotAllowedResponse()
        }
        const body = await __STATIC_CONTENT.get(url.pathname.slice(1))
        if (body !== null) {
            return staticResponse(url, body)
        }
    }

    const response = await renderResponse(request, url)
    if (response) {
        return response
    }

    return notFoundResponse()
}

function safeMethod (request) {
    return request.method == 'GET' || request.method == 'HEAD'
}

function internalServerErrorResponse (err) {
    console.error('err', err)
    return new Response(err, {
        headers: { 'Content-Type': 'text/plain' },
        status: 500,
        statusText: 'Internal Server Error'
    })
}

function methodNotAllowedResponse () {
    return new Response('405 Method Not Allowed', {
        status: 405,
        statusText: 'Method Not Allowed',
        headers: { 'content-type': 'text/plain' }
    })
}

function notFoundResponse () {
    return new Response('404 Not Found', {
		status: 404,
		statusText: 'Not Found',
        headers: { 'content-type': 'text/plain' }
	});
}

async function renderResponse(request, url) {
    try {
        const response = await render({
            headers: Object.fromEntries(request.headers),
            host: url.host,
            method: request.method,
            path: url.pathname,
            query: url.searchParams,
            rawBody: request.body ? await read(request) : null
        })
        if (response) {
            const headers = new Headers
            for (const [key, value] of Object.entries(response.headers)) {
                if (key.toLowerCase() == 'set-cookie' && Array.isArray(value)) {
                    for (let i = 0; i < value.length; i++) {
                        headers.append(key, value[i])
                    }
                } else {
                    headers.append(key, value)
                }
            }

            return new Response(response.body, {
                headers,
                status: response.status
            })
        }
	} catch (err) {
        console.error(err.stack)
		return internalServerErrorResponse(`Error rendering route: ${err.message || err}`)
	}
}

function staticResponse(url, body) {
    let mimeType = mime.getType(url.pathname) || 'text/plain'
    if (mimeType.startsWith('text') || mimeType === 'application/javascript') {
        mimeType += '; charset=utf-8'
    }
    return new Response(body, {
        status: 200,
        headers: {
            'Content-Type': mimeType
        }
    })
}
