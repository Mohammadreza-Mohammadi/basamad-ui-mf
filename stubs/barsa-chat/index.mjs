// جایگزین موقت (placeholder) برای پکیج داخلیِ `barsa-chat` (روی npm منتشر نشده).
// barsa-sap-ui این را به‌صورت `BarsaChat: () => import('barsa-chat')` لِیزی لود می‌کند؛ basamad-ui
// هیچ‌وقت فیچر چت را باز نمی‌کند، پس این ماژول فقط برای resolvable بودن در build وجود دارد و
// طبق درخواست، یک <div> ساده با توضیح نشان می‌دهد.

const STYLE =
    'padding:16px;margin:8px;border:1px dashed #c0392b;border-radius:8px;' +
    'background:#fff8f7;color:#611a15;direction:rtl;font-family:Tahoma,sans-serif;line-height:1.7;';

const HTML =
    '<strong>ماژول چت (barsa-chat) فعلاً در دسترس نیست</strong>' +
    '<p style="margin:6px 0 0;">این یک placeholder موقت است. پکیج اصلی <code>barsa-chat</code> ' +
    'داخلیِ monorepo باراساست و روی npm منتشر نشده، بنابراین در این پروژه‌ی مستقل با یک div ساده ' +
    'جایگزین شده. فیچر چت در <code>basamad-ui</code> استفاده نمی‌شود.</p>';

// یک <div> ساده‌ی توضیحی می‌سازد.
export function createBarsaChatPlaceholder() {
    const div = document.createElement('div');
    div.className = 'barsa-chat-stub';
    div.setAttribute('style', STYLE);
    div.innerHTML = HTML;
    return div;
}

// اگر تگ اصلیِ چت (bc-barsa-chat) جایی رندر شد، به‌صورت custom element همان div توضیحی را نشان می‌دهد.
if (typeof customElements !== 'undefined' && !customElements.get('bc-barsa-chat')) {
    customElements.define(
        'bc-barsa-chat',
        class extends HTMLElement {
            connectedCallback() {
                this.appendChild(createBarsaChatPlaceholder());
            }
        }
    );
}

export default { createBarsaChatPlaceholder };
