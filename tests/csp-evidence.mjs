// Cloudflare can inject optional Web Analytics only for browser requests.
// The self-only executable policy intentionally blocks it; never whitelist it
// in script-src or accept a report-only violation as proof of enforcement.
export function classifyPolicyViolations(pageUrl, violations) {
  const deployed = new URL(pageUrl).origin === "https://games.siachshai.online";
  const expected = [];
  const unexpected = [];
  for (const violation of violations) {
    const blockedOptionalBeacon = deployed
      && violation.directive === "script-src-elem"
      && violation.disposition === "enforce"
      && /^https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js(?:\/v[a-f0-9]+)?$/i.test(violation.resource);
    (blockedOptionalBeacon ? expected : unexpected).push(violation);
  }
  return { expected, unexpected };
}
