/**
 * One-shot patch: add i18n chrome + content attrs to listing detail pages.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const HEADER = `  <a class="skip-link" href="#main" data-i18n="a11y.skipToContent">Skip to content</a>

  <header class="site-header site-header--luxury">
    <div class="wrap">
      <div class="header-inner">
        <a class="brand" href="index.html">
          <img
            src="https://static.wixstatic.com/media/bd2954_619ef44cea334d0584a901e26860bb71~mv2.png/v1/fill/w_200,h_106,al_c,q_85,enc_auto/bd2954_619ef44cea334d0584a901e26860bb71~mv2.png"
            srcset="https://static.wixstatic.com/media/bd2954_619ef44cea334d0584a901e26860bb71~mv2.png/v1/fill/w_200,h_106,al_c,q_85,enc_auto/bd2954_619ef44cea334d0584a901e26860bb71~mv2.png 1x,
                    https://static.wixstatic.com/media/bd2954_619ef44cea334d0584a901e26860bb71~mv2.png/v1/fill/w_400,h_212,al_c,q_85,enc_auto/bd2954_619ef44cea334d0584a901e26860bb71~mv2.png 2x"
            width="200"
            height="106"
            alt="Martins & Associates Real Estate"
            data-i18n-alt="a11y.brandAlt">
          <span class="visually-hidden" data-i18n="a11y.brandHome">Martins &amp; Associates — home</span>
        </a>
        <nav class="nav-desktop" aria-label="Primary" data-i18n-aria="a11y.primaryNav">
          <a class="nav-link" href="index.html" data-i18n="nav.home">Home</a>
          <a class="nav-link" href="book.html" data-i18n="nav.book">Book online</a>
          <a class="nav-link" href="buy-sell.html" data-i18n="nav.buySell">Buy &amp; Sell</a>
          <a class="nav-link" href="renting.html" data-i18n="nav.renting">Renting</a>
          <a class="nav-link" href="listings.html" data-i18n="nav.listings">Listings</a>
          <a class="nav-link" href="about.html" data-i18n="nav.about">About</a>
        </nav>
        <div class="lang-switcher">
          <label class="visually-hidden" for="lang-select-desktop" data-i18n="a11y.langSwitcher">Select language</label>
          <select id="lang-select-desktop" class="lang-select" aria-label="Select language" data-i18n-aria="a11y.langSwitcher">
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="pt">Português</option>
            <option value="ht">Kreyòl Ayisyen</option>
            <option value="kea">Kabuverdianu</option>
            <option value="fr">Français</option>
            <option value="zh">中文</option>
          </select>
        </div>
        <button type="button" class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="nav-mobile" aria-label="Open menu" data-i18n-aria="a11y.openMenu">
          <span></span><span></span><span></span>
        </button>
      </div>
      <nav class="nav-mobile" id="nav-mobile" aria-label="Mobile" data-i18n-aria="a11y.mobileNav">
        <div class="lang-switcher">
          <label class="visually-hidden" for="lang-select-mobile" data-i18n="a11y.langSwitcher">Select language</label>
          <select id="lang-select-mobile" class="lang-select" aria-label="Select language" data-i18n-aria="a11y.langSwitcher">
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="pt">Português</option>
            <option value="ht">Kreyòl Ayisyen</option>
            <option value="kea">Kabuverdianu</option>
            <option value="fr">Français</option>
            <option value="zh">中文</option>
          </select>
        </div>
        <a class="nav-link" href="index.html" data-i18n="nav.home">Home</a>
        <a class="nav-link" href="book.html" data-i18n="nav.book">Book online</a>
        <a class="nav-link" href="buy-sell.html" data-i18n="nav.buySell">Buy &amp; Sell</a>
        <a class="nav-link" href="renting.html" data-i18n="nav.renting">Renting</a>
        <a class="nav-link" href="listings.html" data-i18n="nav.listings">Listings</a>
        <a class="nav-link" href="about.html" data-i18n="nav.about">About</a>
      </nav>
    </div>
  </header>`;

const FOOTER = `  <footer>
    <div class="wrap">
      <div class="footer-grid">
        <div class="footer-brand-block">
          <img
            src="https://static.wixstatic.com/media/bd2954_619ef44cea334d0584a901e26860bb71~mv2.png/v1/fill/w_180,h_95,al_c,q_85,enc_auto/bd2954_619ef44cea334d0584a901e26860bb71~mv2.png"
            alt="Martins & Associates"
            width="180"
            height="95"
            loading="lazy"
            data-i18n-alt="a11y.brandAlt">
          <div class="name">MARTINS &amp; ASSOCIATES<span class="name-sub">REAL ESTATE</span></div>
          <p data-i18n="footer.tagline">Massachusetts, Rhode Island &amp; international referrals.</p>
        </div>
        <div class="footer-col">
          <h4 data-i18n="footer.navigate">Navigate</h4>
          <ul>
            <li><a href="index.html" data-i18n="nav.home">Home</a></li>
            <li><a href="book.html" data-i18n="nav.book">Book online</a></li>
            <li><a href="buy-sell.html" data-i18n="nav.buySell">Buy &amp; Sell</a></li>
            <li><a href="renting.html" data-i18n="nav.renting">Renting</a></li>
            <li><a href="listings.html" data-i18n="nav.listings">Listings</a></li>
            <li><a href="about.html" data-i18n="nav.about">About</a></li>
          </ul>
        </div>
        <div class="footer-col footer-social">
          <h4 data-i18n="footer.followUs">Follow Us!</h4>
          <ul class="social-icons" role="list">
            <li><a href="https://www.instagram.com/martinsrealestate/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" data-i18n-aria="a11y.instagram"><img src="https://static.wixstatic.com/media/e1aa082f7c0747168d9cf43e77046142.png/v1/fill/w_43,h_43,al_c,q_85,enc_auto/e1aa082f7c0747168d9cf43e77046142.png" alt="" width="43" height="43" loading="lazy"></a></li>
            <li><a href="https://www.facebook.com/p/Martins-Associates-Real-Estate-61550247932841/" target="_blank" rel="noopener noreferrer" aria-label="Facebook" data-i18n-aria="a11y.facebook"><img src="https://static.wixstatic.com/media/4057345bcf57474b96976284050c00df.png/v1/fill/w_43,h_43,al_c,q_85,enc_auto/4057345bcf57474b96976284050c00df.png" alt="" width="43" height="43" loading="lazy"></a></li>
            <li><a href="https://www.tiktok.com/@martinsrealestate" target="_blank" rel="noopener noreferrer" aria-label="TikTok" data-i18n-aria="a11y.tiktok"><img src="https://static.wixstatic.com/media/11062b_66167d61316d4665841f3397360d54a9~mv2.png/v1/fill/w_43,h_43,al_c,q_85,enc_auto/11062b_66167d61316d4665841f3397360d54a9~mv2.png" alt="" width="43" height="43" loading="lazy"></a></li>
          </ul>
          <p class="footer-note" data-i18n="footer.contactNote">Contact us to inquire today!</p>
          <p style="margin:0;"><a href="tel:+15085836060">(508) 583-6060</a></p>
        </div>
      </div>
      <div class="footer-base">
        <span data-i18n="footer.copyright">© 2003–2026 Martins &amp; Associates Real Estate. All rights reserved.</span>
        <p class="footer-disclaimer" data-i18n="footer.disclaimer">Equal Housing Opportunity. Licensed in Massachusetts and Rhode Island. Information is deemed reliable but not guaranteed.</p>
      </div>
    </div>
  </footer>

  <div class="mobile-call-bar" role="navigation" aria-label="Quick call" data-i18n-aria="a11y.quickCall">
    <a class="btn" href="tel:+15085836060" data-i18n="mobileBar.call">Call now</a>
    <a class="btn btn-ghost" href="#" data-modal-open="listing-contact" data-i18n="mobileBar.email">Email us</a>
  </div>

  <script src="i18n/translations.js" defer></script>
  <script src="i18n.js" defer></script>
  <script src="site.js" defer></script>`;

const COMMON = [
  [/  <a class="skip-link" href="#main">Skip to content<\/a>[\s\S]*?<\/header>/, HEADER],
  [/  <footer>[\s\S]*?<script src="site\.js" defer><\/script>/, FOOTER],
  [/<title>([^<]+)<\/title>/, (_, t) => `<title data-i18n-title="META_TITLE">${t}</title>`],
  [/aria-label="Breadcrumb"/, 'aria-label="Breadcrumb" data-i18n-aria="a11y.breadcrumb"'],
  [/<li><a href="index\.html">Home<\/a><\/li>/, '<li><a href="index.html" data-i18n="nav.home">Home</a></li>'],
  [/<li><a href="listings\.html">Listings<\/a><\/li>/, '<li><a href="listings.html" data-i18n="nav.listings">Listings</a></li>'],
  [/aria-label="Property photos"/, 'aria-label="Property photos" data-i18n-aria="a11y.propertyPhotos"'],
  [/aria-label="Property facts"/, 'aria-label="Property facts" data-i18n-aria="a11y.propertyFacts"'],
  [/aria-label="Listing summary"/, 'aria-label="Listing summary" data-i18n-aria="a11y.listingSummary"'],
  [/<span class="listing-z__pill">For sale<\/span>/, '<span class="listing-z__pill" data-i18n="listing.forSale">For sale</span>'],
  [/<h2 id="overview-heading" class="listing-z__h2">Overview<\/h2>/, '<h2 id="overview-heading" class="listing-z__h2" data-i18n="listing.overviewHeading">Overview</h2>'],
  [/<span class="listing-z__fact-label">MLS ID<\/span>/, '<span class="listing-z__fact-label" data-i18n="listing.mlsIdLabel">MLS ID</span>'],
  [/<span class="listing-z__fact-label">Property type<\/span>/, '<span class="listing-z__fact-label" data-i18n="listing.propertyTypeLabel">Property type</span>'],
  [/<span class="listing-z__fact-label">County<\/span>/, '<span class="listing-z__fact-label" data-i18n="listing.countyLabel">County</span>'],
  [/<span class="listing-z__fact-label">Zoning<\/span>/, '<span class="listing-z__fact-label" data-i18n="listing.zoningLabel">Zoning</span>'],
  [/<span class="listing-z__fact-label">Lot<\/span>/, '<span class="listing-z__fact-label" data-i18n="listing.lotLabel">Lot</span>'],
  [/<span class="listing-z__fact-label">Construction<\/span>/, '<span class="listing-z__fact-label" data-i18n="listing.constructionLabel">Construction</span>'],
  [/<span class="listing-z__fact-label">Business hours<\/span>/, '<span class="listing-z__fact-label" data-i18n="listing.hoursLabel">Business hours</span>'],
  [/<strong>~3,100<\/strong> sqft lot/, '<strong>~3,100</strong> <span data-i18n="listing.sqftLot">sqft lot</span>'],
  [/<strong>9,999<\/strong> sqft lot/, '<strong>9,999</strong> <span data-i18n="listing.sqftLot">sqft lot</span>'],
  [/download>Download listing sheet \(PDF\)<\/a>/, 'download data-i18n="listing.downloadPdf">Download listing sheet (PDF)</a>'],
  [/noreferrer">Open in Google Maps<\/a>/, 'noreferrer" data-i18n="listing.openMaps">Open in Google Maps</a>'],
  [/data-modal-open="listing-contact">\s*Contact us about this property/, 'data-modal-open="listing-contact" data-i18n="listing.contactCta">Contact us about this property'],
  [/<p class="listing-z__cta-note">We’ll respond by phone or email—usually within one business day\.<\/p>/, '<p class="listing-z__cta-note" data-i18n="listing.ctaNote">We’ll respond by phone or email—usually within one business day.</p>'],
  [/<h3 class="listing-z__card-title">Listed by<\/h3>/, '<h3 class="listing-z__card-title" data-i18n="listing.sidebarListedBy">Listed by</h3>'],
  [/<p class="listing-z__card-name">Martins &amp; Associates<\/p>/, '<p class="listing-z__card-name" data-i18n="listing.sidebarName">Martins &amp; Associates</p>'],
  [/<p class="listing-z__card-meta">Massachusetts &amp; Rhode Island<\/p>/, '<p class="listing-z__card-meta" data-i18n="listing.sidebarMeta">Massachusetts &amp; Rhode Island</p>'],
  [/data-modal-open="listing-contact">Ask a question<\/button>/, 'data-modal-open="listing-contact" data-i18n="listing.askQuestion">Ask a question</button>'],
  [/<h2 id="modal-contact-title" class="modal__title">Ask about this property<\/h2>/, '<h2 id="modal-contact-title" class="modal__title" data-i18n="listing.modalTitle">Ask about this property</h2>'],
  [/data-modal-close aria-label="Close"/, 'data-modal-close aria-label="Close" data-i18n-aria="a11y.close"'],
  [/<p class="form-note form-success" id="form-success" hidden role="status">\s*Thanks — your message was sent\. We’ll get back to you soon\.\s*<\/p>/, '<p class="form-note form-success" id="form-success" hidden role="status" data-i18n="listing.modalSuccess">Thanks — your message was sent. We’ll get back to you soon.</p>'],
  [/<label for="listing-inq-name-645">Full name<\/label>/, '<label for="listing-inq-name-645" data-i18n="form.fullName">Full name</label>'],
  [/<label for="listing-inq-email-645">Email<\/label>/, '<label for="listing-inq-email-645" data-i18n="form.email">Email</label>'],
  [/<label for="listing-inq-phone-645">Phone<\/label>/, '<label for="listing-inq-phone-645" data-i18n="form.phone">Phone</label>'],
  [/<label for="listing-inq-message-645">Message<\/label>/, '<label for="listing-inq-message-645" data-i18n="form.message">Message</label>'],
  [/<label for="listing-inq-name-686">Full name<\/label>/, '<label for="listing-inq-name-686" data-i18n="form.fullName">Full name</label>'],
  [/<label for="listing-inq-email-686">Email<\/label>/, '<label for="listing-inq-email-686" data-i18n="form.email">Email</label>'],
  [/<label for="listing-inq-phone-686">Phone<\/label>/, '<label for="listing-inq-phone-686" data-i18n="form.phone">Phone</label>'],
  [/<label for="listing-inq-message-686">Message<\/label>/, '<label for="listing-inq-message-686" data-i18n="form.message">Message</label>'],
  [/<button class="btn" type="submit">Send message<\/button>/, '<button class="btn" type="submit" data-i18n="form.sendMessage">Send message</button>'],
];

const P645 = [
  ['META_TITLE', 'meta.listing645.title'],
  [/<li aria-current="page">645 River St, Boston<\/li>/, '<li aria-current="page" data-i18n="listing645.breadcrumbCurrent">645 River St, Boston</li>'],
  [/<p class="listing-z__photos-soon">Photos coming soon<\/p>/, '<p class="listing-z__photos-soon" data-i18n="listings.card645.soon">Photos coming soon</p>'],
  [/<span class="listing-z__pill" style="background:var\(--accent\);margin-left:0\.35rem;">Commercial land<\/span>/, '<span class="listing-z__pill" style="background:var(--accent);margin-left:0.35rem;" data-i18n="listing645.statusType">Commercial land</span>'],
  [/<strong>0\.07<\/strong> acres/, '<strong>0.07</strong> <span data-i18n="listing645.statsAcres">acres</span>'],
  [/<strong>Zone C<\/strong> commercial/, '<strong data-i18n="listing645.statsZoneStrong">Zone C</strong> <span data-i18n="listing645.statsZone">commercial</span>'],
  [/<strong>Transit<\/strong> nearby/, '<strong data-i18n="listing645.statsTransitStrong">Transit</strong> <span data-i18n="listing645.statsTransit">nearby</span>'],
  [/<span class="listing-z__fact-value">Land — commercial<\/span>/, '<span class="listing-z__fact-value" data-i18n="listing645.factsTypeValue">Land — commercial</span>'],
  [/<span class="listing-z__fact-value">Suffolk<\/span>/, '<span class="listing-z__fact-value" data-i18n="listing645.factsCountyValue">Suffolk</span>'],
  [/<span class="listing-z__fact-value">C — commercial<\/span>/, '<span class="listing-z__fact-value" data-i18n="listing645.factsZoningValue">C — commercial</span>'],
  [/<span class="listing-z__fact-value">Level · public road<\/span>/, '<span class="listing-z__fact-value" data-i18n="listing645.factsLotValue">Level · public road</span>'],
  [/<span class="listing-z__fact-label">Assessed \(2024\)<\/span>/, '<span class="listing-z__fact-label" data-i18n="listing645.factsAssessedLabel">Assessed (2024)</span>'],
  [/<span class="listing-z__fact-value">\$1,300,000<\/span>/, '<span class="listing-z__fact-value" data-i18n="listing645.factsAssessedValue">$1,300,000</span>'],
  [/<div class="listing-z__description">\s*<p>[\s\S]*?<\/p>\s*<p>[\s\S]*?<\/p>\s*<\/div>/, '<div class="listing-z__description"><p data-i18n-html="listing645.descriptionP1"></p><p data-i18n-html="listing645.descriptionP2"></p></div>'],
  [/<h2 id="site-heading" class="listing-z__h2">Site &amp; utilities<\/h2>/, '<h2 id="site-heading" class="listing-z__h2" data-i18n="listing645.siteHeading">Site &amp; utilities</h2>'],
  [/<li>Public water and sewer<\/li>/, '<li data-i18n="listing645.siteB1">Public water and sewer</li>'],
  [/<li>Electric on-site · gas at street<\/li>/, '<li data-i18n="listing645.siteB2">Electric on-site · gas at street</li>'],
  [/<li>Curbs and gutters · public road<\/li>/, '<li data-i18n="listing645.siteB3">Curbs and gutters · public road</li>'],
  [/<li>Area amenities include public transportation<\/li>/, '<li data-i18n="listing645.siteB4">Area amenities include public transportation</li>'],
  [/<li>Permitted zone usage includes multi-family and commercial \(verify with the City\)<\/li>/, '<li data-i18n="listing645.siteB5">Permitted zone usage includes multi-family and commercial (verify with the City)</li>'],
  [/<h2 id="tax-heading" class="listing-z__h2">Tax snapshot<\/h2>/, '<h2 id="tax-heading" class="listing-z__h2" data-i18n="listing645.taxHeading">Tax snapshot</h2>'],
  [/<p class="listing-z__description" style="margin:0;">[\s\S]*?<\/p>/, '<p class="listing-z__description" style="margin:0;" data-i18n-html="listing645.taxText"></p>'],
  [/<p class="listing-z__disclaimer">[\s\S]*?<\/p>/, '<p class="listing-z__disclaimer" data-i18n="listing645.disclaimer"></p>'],
  [/placeholder="Tour request, due diligence questions, or best time to call\."/, 'placeholder="Tour request, due diligence questions, or best time to call." data-i18n-placeholder="listing645.formMessagePlaceholder"'],
];

const P686 = [
  ['META_TITLE', 'meta.listing686.title'],
  [/alt="686 Broadway, Raynham — listing photo 1"/, 'alt="686 Broadway, Raynham — listing photo 1" data-i18n-alt="listing686.galleryHeroAlt"'],
  [/<span class="listing-z__pill" style="background:var\(--accent\);margin-left:0\.35rem;">Business opportunity<\/span>/, '<span class="listing-z__pill" style="background:var(--accent);margin-left:0.35rem;" data-i18n="listing686.statusType">Business opportunity</span>'],
  [/<strong>16<\/strong> parking/, '<strong>16</strong> <span data-i18n="listing686.statsParking">parking</span>'],
  [/<strong>C1<\/strong> zoning/, '<strong data-i18n="listing686.statsZoningStrong">C1</strong> <span data-i18n="listing686.statsZoning">zoning</span>'],
  [/<strong>Est\. 2023<\/strong>/, '<strong data-i18n="listing686.statsEst">Est. 2023</strong>'],
  [/<span class="listing-z__fact-value">Business opportunity<\/span>/, '<span class="listing-z__fact-value" data-i18n="listing686.factsTypeValue">Business opportunity</span>'],
  [/<span class="listing-z__fact-value">Bristol<\/span>/, '<span class="listing-z__fact-value" data-i18n="listing686.factsCountyValue">Bristol</span>'],
  [/<span class="listing-z__fact-value">C1<\/span>/, '<span class="listing-z__fact-value" data-i18n="listing686.factsZoningValue">C1</span>'],
  [/<span class="listing-z__fact-value">Frame<\/span>/, '<span class="listing-z__fact-value" data-i18n="listing686.factsConstructionValue">Frame</span>'],
  [/<span class="listing-z__fact-value">9am–9pm<\/span>/, '<span class="listing-z__fact-value" data-i18n="listing686.factsHoursValue">9am–9pm</span>'],
  [/<div class="listing-z__description">\s*<p>[\s\S]*?<\/p>\s*<p>[\s\S]*?<\/p>\s*<\/div>/, '<div class="listing-z__description"><p data-i18n-html="listing686.descriptionP1"></p><p data-i18n-html="listing686.descriptionP2"></p></div>'],
  [/<h2 id="features-heading" class="listing-z__h2">Building &amp; systems<\/h2>/, '<h2 id="features-heading" class="listing-z__h2" data-i18n="listing686.featuresHeading">Building &amp; systems</h2>'],
  [/<li>Security system · security lighting<\/li>/, '<li data-i18n="listing686.featuresB1">Security system · security lighting</li>'],
  [/<li>Wet sprinkler · dry sprinkler<\/li>/, '<li data-i18n="listing686.featuresB2">Wet sprinkler · dry sprinkler</li>'],
  [/<li>16 parking spaces<\/li>/, '<li data-i18n="listing686.featuresB3">16 parking spaces</li>'],
  [/<li>Basement: none \(per listing\)<\/li>/, '<li data-i18n="listing686.featuresB4">Basement: none (per listing)</li>'],
  [/<p class="listing-z__disclaimer">[\s\S]*?<\/p>/, '<p class="listing-z__disclaimer" data-i18n="listing686.disclaimer"></p>'],
  [/placeholder="Tour request, questions, or best time to call\."/, 'placeholder="Tour request, questions, or best time to call." data-i18n-placeholder="listing686.formMessagePlaceholder"'],
];

function patch(file, extra) {
  let html = fs.readFileSync(path.join(root, file), "utf8");
  for (const [re, rep] of COMMON) {
    html = typeof rep === "function" ? html.replace(re, rep) : html.replace(re, rep);
  }
  for (const item of extra) {
    if (item[0] === "META_TITLE") {
      html = html.replace("META_TITLE", item[1]);
      continue;
    }
    html = html.replace(item[0], item[1]);
  }
  fs.writeFileSync(path.join(root, file), html);
  console.log("patched", file);
}

patch("listing-645-river-st-boston.html", P645);
patch("listing-686-broadway-raynham.html", P686);
