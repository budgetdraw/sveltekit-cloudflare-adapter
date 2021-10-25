import fetch from 'node-fetch'
import { promises as fs } from 'fs'
import path from 'path'
import mime from 'mime'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

const apiBase = 'https://api.cloudflare.com/client/v4'
const accountsUri = `${apiBase}/accounts?per_page=50`
const workerScriptUri = (accountID, scriptName) =>
    `${apiBase}/accounts/${accountID}/workers/scripts/${scriptName}`
const writeKVPairUri = (accountID, namespaceID, keyName) =>
    `${apiBase}/accounts/${accountID}/storage/kv/namespaces/${namespaceID}/values/${keyName}`

const getOptions = (argv) => yargs(hideBin(argv))
    .usage("Usage: -n <name>")
    .option("n", { alias: "name", describe: "Name of the Cloudflare worker", type: "string", demandOption: true })
    .option("s", { alias: "namespace", description: "Namespace to upload KV assets to", type: "string", demandOption: true })
    .option("a", { alias: "accountid", describe: "Cloudflare Account ID", type: "string", demandOption: false })
    .argv

const run = async (argv, env) => {
    const options = getOptions(argv)
    const token = env.CLOUDFLARE_TOKEN
    if (! token) {
        throw new Error('could not find CLOUDFLARE_TOKEN environment variable')
    }
    const accountID = options.accountid || await getAccountID(token)
    const assetsDir = 'target/assets/'
    const workerFilename = 'target/worker.js'
    await uploadAssets(token, accountID, options.namespace, assetsDir)
    await uploadWorker(token, accountID, options.name, workerFilename)
}

const getAccountID = async (token) => {
    const response = await fetchJson(accountsUri, token)
    if (response.result.length == 0) {
        throw new Error('could not find account ID - endpoint returned no accounts')
    }
    if (response.result.length > 1) {
        throw new Error('could not find account ID - endpoint returned multiple accounts')
    }
    return response.result[0].id
}

const uploadAssets = async (token, accountID, namespaceID, assetsDir) => {
    const paths = await children(assetsDir)
    const uploads = paths.map(filename => uploadKV(token, accountID, namespaceID, filename.slice(assetsDir.length), filename))
    await Promise.all(uploads)
}

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

async function uploadKV (token, accountID, namespaceID, key, filename) {
    const data = await fs.readFile(filename);
    const mimeType = mime.getType(filename)
    if (! mimeType) {
        throw new Error(`unknown mime type for ${filename}`);
    }
    const response = await fetchJson(writeKVPairUri(accountID, namespaceID, key), token, {
        method: 'PUT',
        body: data,
        headers: {
            'content-type': mimeType,
            'content-length': data.length
        }
    })
    if (! response.success) {
        throw new Error('error uploading to KV:\n' + JSON.stringify(response, 2))
    }
    console.log('uploaded', filename)
}

const uploadWorker = async (token, accountID, name, filename) => {
    const data = await fs.readFile(filename)

    const response = await fetchJson(workerScriptUri(accountID, name), token, {
        method: 'PUT',
        body: data,
        headers: {
            'Content-Type': 'application/javascript'
        }
    })
    if (! response.success) {
        throw new Error('error uploading worker:\n' + JSON.stringify(response, 2))
    }
    console.log(`uploaded worker ${name}`)
}

const fetchJson = async (url, token, opts = {}) => {
    opts.headers = opts.headers || {}
    opts.headers['Authorization'] = `Bearer ${token}`
    const response = await fetch(url, opts)
    return await response.json()
}

await run(process.argv, process.env)