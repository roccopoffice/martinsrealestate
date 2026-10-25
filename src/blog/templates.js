export const TEMPLATE_META = [
  {
    id: "editorial",
    name: "Editorial Feature",
    description: "A prominent cover image, elegant headline, introduction, and long-form text."
  },
  {
    id: "market",
    name: "Market Update",
    description: "Statistics, highlights, an optional chart, and explanatory sections."
  },
  {
    id: "guide",
    name: "Step-by-Step Guide",
    description: "Numbered sections, practical tips, and supporting images."
  },
  {
    id: "spotlight",
    name: "Property Spotlight",
    description: "Large photography, a gallery, and structured property details."
  },
  {
    id: "advice",
    name: "Expert Advice",
    description: "Author context, pull quotes, advice sections, and supporting photography."
  }
];

export function starterFor(template, author = {}) {
  const name = author.name || "Martins & Associates";
  const title = author.title || "Massachusetts & Rhode Island real estate";
  switch (template) {
    case "market":
      return marketStarter(name);
    case "guide":
      return guideStarter(name);
    case "spotlight":
      return spotlightStarter(name);
    case "advice":
      return adviceStarter(name, title);
    default:
      return editorialStarter(name);
  }
}

function block(type, data) {
  return { id: crypto.randomUUID(), type, data };
}

function editorialStarter(name) {
  return {
    title: "A closer look at living well in our communities",
    excerpt:
      "An in-depth note on neighborhoods, timing, and what thoughtful buyers and sellers are asking us this season.",
    authorName: name,
    authorTitle: "Martins & Associates Real Estate",
    seoTitle: "",
    seoDescription: "",
    blocks: [
      block("heading", { text: "What we are seeing on the ground" }),
      block("paragraph", {
        html: "<p>Use this opening to set the scene. Speak to the reader the way you would in a consultation: clearly, calmly, and with local context. Replace this paragraph with your story, then add supporting images as you go.</p>"
      }),
      block("image", { mediaId: "", alt: "Neighborhood or home exterior", caption: "Add a caption that names the place." }),
      block("paragraph", {
        html: "<p>Continue with two or three short sections. Keep sentences readable on a phone. Link to <a href=\"/book.html\">Book online</a> if the reader should take a next step.</p>"
      }),
      block("quote", {
        text: "A home decision is rarely only a number. It is timing, family, and a street you can picture coming home to.",
        citation: name
      }),
      block("paragraph", {
        html: "<p>Close with a practical takeaway and an invitation to call (508) 583-6060 or send a message.</p>"
      })
    ]
  };
}

function marketStarter(name) {
  return {
    title: "Market update: Massachusetts & Rhode Island snapshot",
    excerpt: "A concise briefing on pricing, inventory, and what it means for buyers and sellers this month.",
    authorName: name,
    authorTitle: "Market notes",
    blocks: [
      block("heading", { text: "This month at a glance" }),
      block("stats", {
        items: [
          { label: "Median sale", value: "$—" },
          { label: "Homes listed", value: "—" },
          { label: "Days on market", value: "—" },
          { label: "Sale-to-list", value: "—" }
        ]
      }),
      block("chart", {
        title: "Activity by week",
        items: [
          { label: "Wk 1", value: 40 },
          { label: "Wk 2", value: 55 },
          { label: "Wk 3", value: 48 },
          { label: "Wk 4", value: 62 }
        ]
      }),
      block("subheading", { text: "What this means for buyers" }),
      block("paragraph", {
        html: "<p>Replace these figures with the numbers you want to publish. Add one paragraph of interpretation — not just the data.</p>"
      }),
      block("subheading", { text: "What this means for sellers" }),
      block("paragraph", {
        html: "<p>Note pricing strategy, preparation, and timing. Invite readers to request a more specific briefing for their town.</p>"
      }),
      block("tip", {
        title: "Ask us for a town-level read",
        html: "<p>Statewide averages hide street-level differences. We will walk you through comps in your neighborhood.</p>"
      })
    ]
  };
}

function guideStarter(name) {
  return {
    title: "How to prepare your home for listing",
    excerpt: "A practical sequence our team uses with sellers before photos, showings, and offers.",
    authorName: name,
    authorTitle: "Seller guidance",
    blocks: [
      block("heading", { text: "A clear sequence, not a scramble" }),
      block("paragraph", {
        html: "<p>Use numbered sections for each step. Keep each step to a few sentences and one supporting image when it helps.</p>"
      }),
      block("subheading", { text: "1. Walk the house as a buyer would" }),
      block("paragraph", {
        html: "<p>Note repairs, paint, and anything that distracts from the rooms you want people to remember.</p>"
      }),
      block("tip", {
        title: "Tip",
        html: "<p>Photograph the house at the time of day you will later use for listing photos.</p>"
      }),
      block("subheading", { text: "2. Decide what to repair, replace, or leave" }),
      block("list", {
        ordered: false,
        items: ["Safety and function first", "Fresh paint in high-traffic rooms", "Neutral staging over personal collections"]
      }),
      block("subheading", { text: "3. Plan photos, showings, and the first weekend" }),
      block("paragraph", {
        html: "<p>Close with how our team sequences listing week, and a link to book a consultation.</p>"
      })
    ]
  };
}

function spotlightStarter(name) {
  return {
    title: "Property spotlight: a home worth a closer look",
    excerpt: "Photography, facts, and the story behind a listing our clients should not miss.",
    authorName: name,
    authorTitle: "Listing notes",
    blocks: [
      block("heading", { text: "The first impression" }),
      block("image", { mediaId: "", alt: "Primary property photograph", caption: "Lead with the strongest exterior or living space." }),
      block("propertyDetails", {
        name: "Property name or headline",
        address: "Street, City, ST",
        price: "$—",
        beds: "— bd",
        baths: "— ba",
        sqft: "— sqft",
        details: "Add zoning, lot, parking, or the details a serious buyer will ask first."
      }),
      block("gallery", {
        items: [
          { mediaId: "", alt: "Kitchen", caption: "Kitchen" },
          { mediaId: "", alt: "Living area", caption: "Living area" },
          { mediaId: "", alt: "Outdoor space", caption: "Outdoor space" }
        ]
      }),
      block("paragraph", {
        html: "<p>Tell the story of the street, the light, and who this home is for. Invite a showing through Book online.</p>"
      })
    ]
  };
}

function adviceStarter(name, title) {
  return {
    title: "Advice from the desk: buying with a long view",
    excerpt: "Practical counsel from our agents on timing, inspections, and living with the choice you make.",
    authorName: name,
    authorTitle: title,
    authorBio: "Share a short bio so readers know whose advice they are reading.",
    blocks: [
      block("authorCard", {
        name,
        title,
        bio: "A few sentences about the agent writing this piece and the communities they serve.",
        mediaId: ""
      }),
      block("heading", { text: "Start with how you want to live" }),
      block("paragraph", {
        html: "<p>Open with the human question, then move to process. Keep the tone like a conversation after a showing.</p>"
      }),
      block("pullquote", {
        text: "The right house is the one you can live in while the market does what the market does.",
        citation: name
      }),
      block("image", { mediaId: "", alt: "Supporting photograph", caption: "Use photography that supports the advice, not stock that feels generic." }),
      block("subheading", { text: "What I tell clients before they write an offer" }),
      block("paragraph", {
        html: "<p>Replace this with two or three concrete recommendations. End with an invitation to talk.</p>"
      })
    ]
  };
}
