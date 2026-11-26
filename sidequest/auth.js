import { finishSignIn } from "./google-auth.js";
import { afterSignIn, readYou } from "./you.js";

try {
  const back = await finishSignIn();
  // Someone who just joined sets up their experience first.
  location.replace(afterSignIn(readYou().setup, back));
} catch (error) {
  document.querySelector("#auth-status").textContent = error.message || "Sign-in failed.";
  document.querySelector("#auth-back").hidden = false;
}
