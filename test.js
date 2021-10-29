import test from 'ava'
import { promisify } from 'util'
import { exec as execWithCallback } from 'child_process'
import { createTestApp } from 'cloudflare-worker-local'
import path from 'path';
import { fileURLToPath } from 'url';
import got from 'got'
import { promises as fs } from 'fs'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const exec = promisify(execWithCallback)

async function children (dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    let result = []
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            result = result.concat(await children(fullPath))
        } else {
            result.push(fullPath)
        }
    }
    return result
}

function removePrefix (value, prefix) {
    if (value.indexOf(prefix) != 0) {
        throw new Error(`value "${value}" did not have prefix "${prefix}"`)
    }
    return value.slice(prefix.length)
}

const putKVAssets = async (path, store) => {
    const files = await children(path)
    for (const file of files) {
        const key = removePrefix(file, path + '/')
        await store.put(key, await fs.readFile(file))
    }
}

test.before(async t => {
    const { stdout } = await exec('cd test-app && npm run build')
    const workerContent = await fs.readFile(path.join(__dirname, 'test-app', 'target', 'worker.js'));
    const server = createTestApp(workerContent, fallback, { kvStores: [ "__STATIC_CONTENT" ]})
    await putKVAssets(path.join(__dirname, 'test-app', 'target', 'assets'), server.stores.__STATIC_CONTENT)
    t.context.server = server
    const prefixUrl = await listenEphemeralPrefix(server)
    t.context.get = async url => {
        try {
            return await got(url.replace(/^\//, ''), { prefixUrl })
        } catch (err) {
            if (err.response) {
                return err.response
            }
            throw err
        }
    }
})

test.after(async t => {
    t.context.server.close()
})

test.serial('basic request', async t => {
    const response = await t.context.get('/')
    t.is(response.statusCode, 200)
    t.regex(response.body, /Welcome to SvelteKit/)
})

test.serial('empty body', async t => {
    const response = await t.context.get('/empty')
    t.is(response.statusCode, 200)
    t.is(response.body, '')
})

test.serial('set cookies', async t => {
    const response = await t.context.get('/set-cookies')
    // not possible to test this currently since cloudflare-worker-local has the
    // Headers implementation from node-fetch, which doesn't include these differences:
    // https://developers.cloudflare.com/workers/runtime-apis/headers#differences
    t.is(response.headers['set-cookie'][0], 'a=b, c=d')
})

test.serial('not found', async t => {
    let response = await t.context.get('/does-not-exist')
    t.is(response.statusCode, 404)
})

test.serial('linked assets', async t => {
    const response = await t.context.get('/')
    const hrefs = linkHrefs(response.body)
    t.assert(hrefs.length > 3, 'links in page')
    for (const href of hrefs) {
        const assetResponse = await t.context.get(href)
        t.is(assetResponse.statusCode, 200, 'status of ' + href)
        t.assert(assetResponse.body.length > 10, 'got content back: ' + assetResponse.body)
        t.not(response.body, assetResponse.body)
        if (href.endsWith('.js')) {
            t.is(assetResponse.headers['content-type'], 'application/javascript; charset=utf-8')
        } else if (href.endsWith('.css')) {
            t.is(assetResponse.headers['content-type'], 'text/css; charset=utf-8')
        }
    }
})

function listenEphemeralPrefix (server) {
    return new Promise((resolve, reject) =>
        server.listen(0, err => {
            if (err) {
            reject(err)
            } else {
                const address = server.address()
                resolve(`http://[${address.address}]:${address.port}`)
            }
            err ? reject(err) : resolve(server.address())
        })
    )
}

const fallback = () => {
    console.error('fallback called unexpectedly')
    process.exit(1)
}

function linkHrefs (source) {
    return [...source.matchAll(/<link rel="\w+" href="([^"]+)">/g)]
        .map(match => match[1])
        .map(href => href.replace(/^\/\.\//, '/')) // not sure why this is present but seems redundant
}