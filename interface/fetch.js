// Sets a UUID at all times
import { v4 as uuid_v4 } from "https://esm.sh/uuid"

let uuid = localStorage.getItem("uuid")
if (uuid === null) {
	uuid = uuid_v4()
	localStorage.setItem("uuid", uuid)
	console.debug(`Set UUID in localStorage to ${uuid}`)
}
console.debug(`UUID is ${uuid}`)

if (!localStorage.getItem(`atlassian_token`)) {
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

async function do_jql() {
    const url = `https://api.atlassian.com/ex/jira/${cloudid}/rest/api/3/search`
    const method = "POST"
    const headers = [
        [`content-type`, `application/json`],
        [`authorization`, `Bearer ${token}`],
        [`accept`, `application/json`]
    ]
    const body = JSON.stringify({
        jql: `assignee = currentuser()`,
        fields: [`*all`],
    })
    
    const response = await fetch(url, { method, headers, body })
    const json = await response.json()
    console.debug(`JQL query issues returned ${response.status} {json}`, json)

    return json
}

do_jql()
