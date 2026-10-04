export const AS_CONTEXT = "https://www.w3.org/ns/activitystreams";
export const SECURITY_CONTEXT = "https://w3id.org/security/v1";
export const PUBLIC_ADDRESS = "https://www.w3.org/ns/activitystreams#Public";

/**
 * Mastodon-compatible JSON-LD context: required for PropertyValue fields and
 * the toot: extensions (discoverable, indexable, Emoji, …).
 */
export const DEFAULT_CONTEXT = [
  AS_CONTEXT,
  SECURITY_CONTEXT,
  {
    manuallyApprovesFollowers: "as:manuallyApprovesFollowers",
    toot: "http://joinmastodon.org/ns#",
    featured: { "@id": "toot:featured", "@type": "@id" },
    featuredTags: { "@id": "toot:featuredTags", "@type": "@id" },
    alsoKnownAs: { "@id": "as:alsoKnownAs", "@type": "@id" },
    movedTo: { "@id": "as:movedTo", "@type": "@id" },
    schema: "http://schema.org#",
    PropertyValue: "schema:PropertyValue",
    value: "schema:value",
    discoverable: "toot:discoverable",
    indexable: "toot:indexable",
    suspended: "toot:suspended",
    memorial: "toot:memorial",
    Hashtag: "as:Hashtag",
    Emoji: "toot:Emoji",
    focalPoint: { "@container": "@list", "@id": "toot:focalPoint" },
  },
] as never[];
