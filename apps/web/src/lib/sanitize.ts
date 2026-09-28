// Whitelist sanitizer for rich text authored in the editor. Rebuilds every tag from scratch,
// so only the listed tags/attributes survive; all other markup is dropped and stray angle brackets are escaped.

const TAGS = new Set(["b", "strong", "i", "em", "u", "s", "strike", "br", "span", "div", "p", "ul", "ol", "li", "a", "font", "h1", "h2", "h3", "blockquote"]);
const STYLE_PROPS = new Set(["color", "background-color", "font-size", "font-weight", "font-style", "font-family", "text-decoration", "text-align"]);

function cleanStyle(style: string) {
  return style.split(";").map((rule) => rule.split(":").map((part) => part.trim())).filter(([prop, value]) => prop && value && STYLE_PROPS.has(prop.toLowerCase()) && !/url\(|expression|javascript:|[<>"]/i.test(value)).map(([prop, value]) => `${prop.toLowerCase()}: ${value}`).join("; ");
}

const attr = (attrs: string, name: string) => attrs.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(2).find((value) => value !== undefined) ?? "";
const escapeText = (text: string) => text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function sanitizeHtml(html: string): string {
  let output = "";
  let last = 0;
  for (const match of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^<>]*)>/g)) {
    output += escapeText(html.slice(last, match.index));
    last = match.index! + match[0].length;
    const [, closing, rawTag, attrs] = match;
    const tag = rawTag.toLowerCase();
    if (!TAGS.has(tag)) continue;
    if (closing) { if (tag !== "br") output += `</${tag === "font" ? "span" : tag}>`; continue; }
    if (tag === "br") { output += "<br>"; continue; }
    let style = cleanStyle(attr(attrs, "style"));
    if (tag === "font") { const color = attr(attrs, "color"); if (/^#?[\w(),.\s%]+$/.test(color)) style = [style, `color: ${color}`].filter(Boolean).join("; "); }
    const styleAttr = style ? ` style="${escapeAttr(style)}"` : "";
    if (tag === "a") {
      const href = attr(attrs, "href");
      output += /^(https?:|mailto:)/i.test(href) ? `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer"${styleAttr}>` : "<a>";
      continue;
    }
    output += `<${tag === "font" ? "span" : tag}${styleAttr}>`;
  }
  return output + escapeText(html.slice(last));
}

export const plainText = (html: string) => html.replace(/<br\s*\/?>/gi, " ").replace(/<\/(p|div|li|h\d)>/gi, " ").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
