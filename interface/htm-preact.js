import { h } from "https://esm.sh/preact"
import htm from "https://esm.sh/htm"

export { html as default }
export const html = htm.bind(h)
