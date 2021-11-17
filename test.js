import test from 'ava'
import { promisify } from 'util'
import { exec as execWithCallback } from 'child_process'
import { Miniflare } from "miniflare";
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const urlPrefix = 'http://localhost:8787'

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
    t.context.mf = new Miniflare({
        script: workerContent,
        kvNamespaces: [ '__STATIC_CONTENT' ],
    })
    const kvNamespace = await t.context.mf.getKVNamespace("__STATIC_CONTENT");
    await putKVAssets(path.join(__dirname, 'test-app', 'target', 'assets'), kvNamespace)
})

test('basic request', async t => {
    const response = await t.context.mf.dispatchFetch(`${urlPrefix}/`)
    t.is(response.status, 200)
    t.regex(await response.text(), /Welcome to SvelteKit/)
})

test('empty body', async t => {
    const response = await t.context.mf.dispatchFetch(`${urlPrefix}/empty`)
    t.is(response.status, 200)
    t.is(await response.text(), '')
})

test('set cookies', async t => {
    const response = await t.context.mf.dispatchFetch(`${urlPrefix}/set-cookies`)
    // can replace with getAll if https://github.com/mrbbot/node-fetch/pull/2 is applied
    t.deepEqual(response.headers.raw()["set-cookie"], ['a=b', 'c=d'])
})

test('not found', async t => {
    let response = await t.context.mf.dispatchFetch(`${urlPrefix}/does-not-exist`)
    t.is(response.status, 404)
})

test('linked assets', async t => {
    const response = await t.context.mf.dispatchFetch(`${urlPrefix}/`)
    const hrefs = linkHrefs(await response.text())
    t.assert(hrefs.length > 3, 'links in page')
    for (const href of hrefs) {
        const assetResponse = await t.context.mf.dispatchFetch(urlPrefix + href)
        t.is(assetResponse.status, 200, 'status of ' + href)
        const body = await assetResponse.text()
        t.assert(body.length > 10, 'got content back: ' + body)
        t.not(response.body, body)
        if (href.endsWith('.js')) {
            t.is(assetResponse.headers.get('content-type'), 'application/javascript; charset=utf-8')
        } else if (href.endsWith('.css')) {
            t.is(assetResponse.headers.get('content-type'), 'text/css; charset=utf-8')
        }
    }
})

test('pass waitUntil', async t => {
    const response = await t.context.mf.dispatchFetch(`${urlPrefix}/wait-until`)
    t.is(response.status, 200)
    t.is(await response.json(), false)
    await sleep(1000)
    const response2 = await t.context.mf.dispatchFetch(`${urlPrefix}/wait-until`)
    t.is(response2.status, 200)
    t.is(await response2.json(), true)
})

function linkHrefs (source) {
    return [...source.matchAll(/<link rel="\w+" href="([^"]+)">/g)]
        .map(match => match[1])
        .map(href => href.replace(/^\/\.\//, '/')) // not sure why this is present but seems redundant
}