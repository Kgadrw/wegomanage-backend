type TemplateOpts = {
  title: string;
  bannerText: string;
  greeting: string;
  bodyHtml: string;
  ctaText: string;
  ctaUrl?: string;
  footerText?: string;
};

function esc(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderEmailTemplate(opts: TemplateOpts) {
  const footer = opts.footerText ? esc(opts.footerText) : "WegoConnect • Automated email";

  return `
  <div style="background:#f5f6f8; padding:32px 12px;">
    <div style="max-width:620px; margin:0 auto; text-align:center;">
      <div style="width:44px; height:44px; margin:0 auto 18px; border-radius:999px; background:#ff2d6d; display:flex; align-items:center; justify-content:center;">
        <div style="width:0;height:0;border-left:12px solid transparent;border-right:12px solid transparent;border-bottom:18px solid #ffffff; transform:rotate(180deg);"></div>
      </div>

      <div style="background:#ffffff; border-radius:18px; box-shadow:0 1px 0 rgba(16,24,40,.02), 0 2px 18px rgba(16,24,40,.06); overflow:hidden;">
        <div style="background:#f59e0b; color:#111827; padding:14px 18px; font-weight:700; font-size:16px;">
          ${esc(opts.bannerText)}
        </div>
        <div style="padding:26px 24px; text-align:left; color:#111827;">
          <div style="font-size:18px; font-weight:700; margin:0 0 6px;">${esc(opts.title)}</div>
          <div style="font-size:16px; margin:14px 0 12px;">${esc(opts.greeting)}</div>

          <div style="font-size:16px; line-height:1.55; margin:0 0 18px;">
            ${opts.bodyHtml}
          </div>

          <div style="font-size:14px; color:#374151; margin-top:16px;">
            Thanks, WegoConnect.
          </div>
        </div>
      </div>

      <div style="max-width:620px; margin:16px auto 0; color:#9ca3af; font-size:12px; line-height:1.4;">
        ${footer}
      </div>
    </div>
  </div>
  `.trim();
}

