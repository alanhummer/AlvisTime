# Dev Docs
If you are a user, you might be better seved by [`readme.md`](./readme.md)!

## Goal UX

- One-click popup Chrome extension
    - Future: Web Extension
- Use configurable remote Jira instance
    - ❓: Should it be "administratively" configurable on a per-extension basis instead of a per-cookie basis?
- Add hours by 15 min precision for each day of the week (Mon-Sun)
    - Use fancy up/down arrows _in addition to_ raw numeric input

### Mockup UI

Tables
![](https://i.imgur.com/OAIjZ5J.png)

Choose your JIRA host
![](https://i.imgur.com/vCdKO6H.png)

## How it Works

Why not have all the parts embedded in the Chrome extension? Why not use the same `index.html` file for the UI in the popup (no `<iframe>` trickery) as well as jiratime.dev? Why two seperate "apps"? Well, it has to do with cross-origin data! If these two apps were the same HTML content/pages and JS scripts, and a user added their JIRA remote to the extension, it would _not_ I repeat **_not_** update that setting in the jiratime.dev instance! Why? Because the `localStorage.set()` or whatever tech we end up using is scoped to the origin of that Chrome extension! That is something like `chrome-extension://b2af7b42-d3fc-4435-8bde-d0b7d19d8beb` which is a _completely different_ origin from `https://jiratime.dev`. This means they are two effectively seperate apps.

> Of course, this could be solved by _only_ supporting a Chrome extension, but that would mean anyone on a Firefox browser, or who is on a different PC can't use it

How do we solve that problem? Well! It turns out you can just forward the extension back to the lower-common-denominator which is the website via an `<iframe>`! This means the embedded site now has all the access it needs to the `localStorage` that is scoped to its own origin (this is why sites can embed "Sign in with Google" banners -- Google _knows_ via cookies that you are signed in!).

So, with that out of the way...

There are a few moving parts
- The Chrome extension wrapper itself that is literally just a popup with an `<iframe src=jiratime.dev>`
- jiratime.dev which hosts a frontend interface to JIRA issues based on a locally stored URL that points to a remote config file
    - This config file is mutable! That means you can change the config of a bunch of your users (and they should be _your users_ if they are using your config URL!) at once!
- The config WebDAV server (or static file server) that is hosted per-organization
    - This is the URL that you tell people to hook into if they want to use that particular config
    - Why WebDAV? It supports user auth out of the box! It also happens to be an extension to HTTP. And, as a bonus, [it integrates well with Windows!](https://help.dreamhost.com/hc/en-us/articles/216473357-Accessing-WebDAV-with-Windows)

## Links
- [Chrome Extension `manifest.json` Docs](https://developer.chrome.com/docs/extensions/mv3/manifest/#overview)
- [Manifest v2 Sunset](https://developer.chrome.com/docs/extensions/mv3/mv2-sunset/)
- [Manifest v3 Overview](https://developer.chrome.com/docs/extensions/mv3/intro/mv3-overview/)
- [Chrome Extensions Samples](https://github.com/GoogleChrome/chrome-extensions-samples)

## Notes

If the URL of the hosted app server changes, make sure the `<iframe src="https://example.org/">` URL is also update to reflect that!
Current URL: <https://f5oz5f.csb.app/> ([editable](https://codesandbox.io/s/jiratimefrontend-f5oz5f?file=/index.html))

`package.json` is there because CodeSandbox requires a `package.json` to do _anything_. This repo is **not** an NPM package! The `private` attr is set to prevent accidental publication.
