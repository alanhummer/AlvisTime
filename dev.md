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

TODO: Finish and fill out the "How it Works" section

## Links
- [Chrome Extension `manifest.json` Docs](https://developer.chrome.com/docs/extensions/mv3/manifest/#overview)
- [Manifest v2 Sunset](https://developer.chrome.com/docs/extensions/mv3/mv2-sunset/)
- [Manifest v3 Overview](https://developer.chrome.com/docs/extensions/mv3/intro/mv3-overview/)

## Notes

If the URL of the hosted app server changes, make sure the `<iframe src="https://example.org/">` URL is also update to reflect that!
Current URL: <https://f5oz5f.csb.app/> ([editable](https://codesandbox.io/s/jiratimefrontend-f5oz5f?file=/index.html))
