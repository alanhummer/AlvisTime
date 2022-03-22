/**
 * This file will dynamically import() whichever route was actually intended to be visited by the user.
 */

import { render } from "https://esm.sh/preact"
import html from "./htm-preact.js"

let route = null
let token = localStorage.getItem(`atlassian_token`)
if (token === null) {
	// We know the user is NOT signed in yet
	route = await import(`./new.js`)
} else {
	route = await import(`./existing.js`)
}

const App = route.default
render(html`<${App} />`, document.body)
