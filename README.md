# @budgetdraw/sveltekit-cloudflare-adapter

Alternative SvelteKit adaptor for Cloudflare workers. Designed to be standalone
and not use wrangler.

## Installation

```shell
npm install --save-dev @budgetdraw/sveltekit-cloudflare-adapter
```

## Usage

Add the adapter to your `svelte.config.js`:

```js
import adapter from '@budgetdraw/sveltekit-cloudflare-adapter'
export default {
	kit: {
		target: '#svelte',
		adapter: adapter()
	}
}
```

## Non-standard Addition

In addition to the normal SvelteKit API, the request object has an additional
`cfFetchEvent` property containing the
[Cloudflare Worker FetchEvent](https://developers.cloudflare.com/workers/runtime-apis/fetch-event).
This is primarily to allow for [waitUntil method](https://developers.cloudflare.com/workers/runtime-apis/fetch-event#waituntil)
in order to perform an action after the response has been sent to the user - for
example in order to pass to [toucan-js](https://github.com/robertcepa/toucan-js).
