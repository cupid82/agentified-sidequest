// Optional Google sign-in, with no server: OpenID Connect with an id_token sent back to
// auth.html. The token is checked, reduced to a name, email and picture, and thrown away.
// Nothing is sent to the activity groups or to the AI provider. The planner never needs it.
export const CLIENT_ID = "840248138633-a8bir22s6qmee27rbcodijboi9b5m1n6.apps.googleusercontent.com";
const PROFILE_KEY = "campus-sidequest-profile-v1";
const PENDING_KEY = "campus-sidequest-signin";

const random = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
export const redirectUri = () => new URL("auth.html", location.href.split(/[?#]/)[0]).href;

export function readProfile() {
  try {
    const profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
    return profile && typeof profile.name === "string" ? profile : null;
  } catch { return null; }
}

export function signOut() {
  try { localStorage.removeItem(PROFILE_KEY); } catch {}
  window.dispatchEvent(new CustomEvent("sidequest:changed", { detail: PROFILE_KEY }));
}

/**
 * Go to Google to sign in.
 *
 * :param back: The page to return to. It stays in this tab; Google does not get it.
 */
export function signIn(back = "") {
  const pending = { state: random(), nonce: random() };
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ ...pending, back }));
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: redirectUri(), response_type: "id_token",
    scope: "openid email profile", prompt: "select_account", ...pending,
  }).toString();
  location.assign(url.href);
}

const decode = (part) => Uint8Array.from(atob(part.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const json = (part) => JSON.parse(new TextDecoder().decode(decode(part)));

/**
 * Check Google's signature on a token, and that it was issued for this sign-in.
 *
 * :param token: The id_token.
 * :param nonce: The nonce this tab sent.
 * :return: The token's claims.
 */
export async function verifyToken(token, nonce) {
  const [head, body, signature] = token.split(".");
  if (!signature) throw new Error("Google sent no sign-in token.");
  const header = json(head), claims = json(body);
  const { keys } = await (await fetch("https://www.googleapis.com/oauth2/v3/certs")).json();
  const jwk = keys.find((key) => key.kid === header.kid);
  if (header.alg !== "RS256" || !jwk) throw new Error("Google's signing key was not found.");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decode(signature), new TextEncoder().encode(`${head}.${body}`));
  if (!valid || claims.aud !== CLIENT_ID || claims.nonce !== nonce || claims.exp * 1000 < Date.now()
    || !["https://accounts.google.com", "accounts.google.com"].includes(claims.iss)) throw new Error("This sign-in could not be verified.");
  return claims;
}

/** Finish a sign-in on auth.html. Returns the page signIn() was asked to return to. */
export async function finishSignIn() {
  const params = new URLSearchParams(location.hash.slice(1));
  // The token must not stay in the address bar or the history.
  history.replaceState(null, "", location.pathname);
  const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null");
  sessionStorage.removeItem(PENDING_KEY);
  if (params.get("error")) throw new Error(params.get("error") === "access_denied" ? "Sign-in was cancelled." : "Google refused the sign-in.");
  if (!pending || !params.get("state") || params.get("state") !== pending.state) throw new Error("This sign-in did not start in this tab. Please try again.");
  const claims = await verifyToken(params.get("id_token") || "", pending.nonce);
  const picture = /^https:\/\/lh3\.googleusercontent\.com\//.test(claims.picture || "") ? claims.picture : "";
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ name: String(claims.name || claims.email || "Student"), email: String(claims.email || ""), picture }));
  return String(pending.back || "");
}
