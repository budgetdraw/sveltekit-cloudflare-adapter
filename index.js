import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import esbuild from 'esbuild'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function createAdapter () {
    /** @type {import('@sveltejs/kit').Adapter} */
    return {
        'name': 'sveltekit-cloudflare-adapter',
        async adapt ({ utils }) {
            const staticAssets = await writeAssets(utils)
            await writeWorker(utils, staticAssets)
        }
    }
}

export default createAdapter

async function  writeWorker (utils, staticAssets) {

    const source = path.join('.svelte-kit', 'cloudflare-workers-standalone', 'worker.js')
    utils.copy(path.join(__dirname, 'entry.js'), source)

    const target = path.join('target', 'worker.js')
    utils.log.minor(`Creating worker ${target}...`)

    await esbuild.build({
        bundle: true,
        entryPoints: [ source ],
        outfile: target,
        platform: 'browser',
        target: 'es2020'
    })

    const pattern = staticAssets
      .filter(path => ! path.startsWith('_app/'))
      .map(path => '|' + regexEscape(path))
      .join('')

    await replaceInFile(target, '|static_paths', pattern)
}

async function replaceInFile (filename, placeholder, replacement) {
    const content = await fs.readFile(filename)
    await fs.writeFile(filename, content.toString('utf8').replace(placeholder, replacement))
}

const regexEscape = v => v.replace(/\W/g, v => `\\${v}`)

async function writeAssets (utils) {
    const target = path.join('target', 'assets')

    utils.log.minor(`Copying assets to ${target}...`)
    utils.rimraf(target)
    utils.copy_static_files(target)
    utils.copy_client_files(target)
    return await relativeChildren(target)
}

function removePrefix (value, prefix) {
    if (value.indexOf(prefix) != 0) {
        throw new Error(`value "${value}" did not have prefix "${prefix}"`)
    }
    return value.slice(prefix.length)
}

async function relativeChildren (base) {
    if (! base.endsWith('/')) {
        base += '/'
    }
    return (await children(base)).map(path => removePrefix(path, base))
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
