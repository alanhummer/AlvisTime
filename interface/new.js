// Get these from Atlassian dashboard
// Need to group these under like an env.json or something
const app_id = `oJVcDRDhmFOnfsj2FLTJ9kE10vVUd7iK`

import html from "./htm-preact.js"

export { App as default }
export function App() {
	return html`
		<h1>You are a new user!</>
		<div>
			<button onClick=${(event) => oauth()}>Sign in with Atlassian</>
		</>
	`
}

function oauth() {
	// 100% exists
	console.debug(`UUID: ${uuid}`)

	// Make sure this is changed in Atlassian config too!
	const callback_url = `https://jiratime.jcbhmr.repl.co/callback.html`
	const url = `
		https://auth.atlassian.com/authorize
			?audience=api.atlassian.com
			&client_id=${app_id}
			&scope=read%3Aissue%3Ajira
			&redirect_uri=${encodeURIComponent(callback_url)}
			&state=${uuid}
			&response_type=code
			&prompt=consent
	`.replace(/\r?\n/mguid, "").replace(/\s/mguid, "")

	console.debug(`Navigating to URL ${url}`)
	location.assign(url)
}

// Sets a UUID at all times
import { v4 as uuid_v4 } from "https://esm.sh/uuid"

let uuid = localStorage.getItem("uuid")
if (uuid === null) {
	uuid = uuid_v4()
	localStorage.setItem("uuid", uuid)
	console.debug(`Set UUID in localStorage to ${uuid}`)
}
console.debug(`UUID is ${uuid}`)
