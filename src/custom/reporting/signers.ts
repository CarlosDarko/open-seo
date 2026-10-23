// Who signs a report: the account that generated it. Carlos signs his own and
// Laura Calvache hers. The photos are small squares inlined in the page (the
// report's security policy only allows its own origin).
import carlosAvatar from "../../../logo/avatar-carlos-ortega.jpg?inline";
import lauraAvatar from "../../../logo/avatar-laura-calvache.jpg?inline";

export type Network = "x" | "linkedin" | "instagram" | "youtube" | "tiktok";

export type Signer = {
  name: string;
  title: string;
  avatar: string;
  /** Profiles shown as icons under the signature, in this order. */
  social: { network: Network; url: string }[];
};

export const CARLOS: Signer = {
  name: "Carlos Ortega",
  title: "Consultor SEO técnico y estratégico independiente",
  avatar: carlosAvatar,
  social: [
    { network: "x", url: "https://x.com/carlos_darko" },
    { network: "linkedin", url: "https://www.linkedin.com/in/carlosdarko/" },
    {
      network: "instagram",
      url: "https://www.instagram.com/carlos.darko.seo/",
    },
    { network: "youtube", url: "https://www.youtube.com/@carlos_darko" },
    { network: "tiktok", url: "https://www.tiktok.com/@carlos.darko" },
  ],
};

const LAURA: Signer = {
  name: "Laura Calvache",
  title: "Consultora SEO técnico y estratégico independiente",
  avatar: lauraAvatar,
  social: [
    { network: "x", url: "https://x.com/LauCalvache" },
    {
      network: "linkedin",
      url: "https://www.linkedin.com/in/laura-calvache-gil/",
    },
    {
      network: "instagram",
      url: "https://www.instagram.com/lauracalvache.seo/",
    },
  ],
};

// SHA-256 of the account's lowercase email, so the address itself is not in
// the (public) repository.
const BY_ACCOUNT: Record<string, Signer> = {
  "9a91681741de2f7e108fb08e5da33b1214c3324d246958eb4fdfac0efc87a0de": LAURA,
};

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** The signature for the account that created the report (Carlos otherwise). */
export async function signerFor(email: string | null): Promise<Signer> {
  if (!email) return CARLOS;
  return BY_ACCOUNT[await sha256(email.trim().toLowerCase())] ?? CARLOS;
}
