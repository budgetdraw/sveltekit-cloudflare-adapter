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

