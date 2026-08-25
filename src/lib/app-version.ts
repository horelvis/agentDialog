/**
 * What version this build is.
 *
 * The deploy builds the image from the release tag, so the tag is the only
 * thing that knows the truth. Stamping it in at build time keeps the value the
 * service reports from drifting away from the release it came from — the root
 * endpoint said "0.1.0" while production ran v0.8.6.
 *
 * An unstamped build says "dev", which is honest. It must not fall back to a
 * version number: a number that is right for one release and silently wrong for
 * every one after is exactly the failure being removed.
 */
export function appVersion(env: Record<string, string | undefined> = process.env): string {
  const stamped = env.APP_VERSION?.trim();
  return stamped ? stamped : "dev";
}
