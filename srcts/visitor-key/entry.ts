// The entry in the browser's local storage that keeps the visitor's own key
// for one base URL, where the deployment sets the blockr option
// assistant_key_secret (./visitor-key.ts).
//
// Every page of the app's origin can read local storage, so the entry holds
// the key encrypted with the secret, which R hands the page with the other
// blockr options. The page encrypts and decrypts the key itself, so the key
// never reaches R:
// - The page derives a key for AES-GCM from the secret, through HKDF with
//   SHA-256. HKDF has no means to slow down a guess at the secret
//   (https://www.rfc-editor.org/rfc/rfc5869#section-4), so the secret has to
//   be a long random string, which nobody can guess, as the help page of
//   new_assistant_plugin() says. A hash for passwords, such as PBKDF2, would
//   slow down a guess, but each page that reads the key would wait for it, by
//   about half a second with the 600,000 rounds that OWASP asks for, to
//   protect only a secret that the help page rules out.
// - Each write encrypts the visitor's key with a random IV. The entry holds
//   the IV and the encrypted key, in base64.
// - The entry's name holds the base URL, so a key only goes to the host for
//   which the visitor gave it. The name holds for whom the entry keeps the
//   key as well, by the blockr option assistant_key_scope:
//   - For the app alone, by default, the name holds the app's path. So local
//     storage holds one entry for each app and base URL to which the visitor
//     gave a key, and another app of the same origin finds no key that the
//     visitor gave this app.
//   - For the apps of the origin, the name holds an id of the secret, which
//     HKDF derives from the secret with another info than the key for
//     AES-GCM. So every app of the origin that keeps the key with the same
//     secret finds the key, whatever its path, while an app with another
//     secret keeps an entry of its own. The id, in hex, never starts with the
//     slash that starts a path, so the names of the two scopes never meet.
//
// An entry that the page cannot read counts as none, and the page removes it.
// Every entry becomes unreadable once the deployment changes its secret, so
// each visitor then gives their key again. For the apps of the origin, the
// entry of the former secret stays, unread, since the entry of the new one
// holds another id in its name.
//
// The browser may refuse local storage while the page runs, as when the
// storage is full. The entry then writes nothing and reads none, as on a page
// on which the browser refuses local storage from the start (keepKey() in
// ./visitor-key.ts).

import type { KeyScope } from "../deployment/index.ts";

// The start of the entry's name, which names the info of HKDF for the key for
// AES-GCM too.
const PREFIX = "blockr.assistant-visitor_key";

// The info of HKDF for the secret's id.
const ID_INFO = `${PREFIX} id`;

// The bytes of AES-GCM's IV, and of the secret's id.
const IV_BYTES = 12;
const ID_BYTES = 16;

export interface KeyEntry {
  // For whom the entry keeps the key.
  readonly scope: KeyScope;
  // The key that the entry holds, or undefined where it holds none that the
  // page can read. It never rejects.
  read(): Promise<string | undefined>;
  // Keeps the key given in the entry, in place of the key that it held.
  write(key: string): Promise<void>;
  // Removes the entry where it holds the key given or one that the page
  // cannot read. So a key that another tab of the app wrote meanwhile stays.
  // It never rejects.
  remove(key: string): Promise<void>;
}

export interface KeyEntryOptions {
  // The secret of the blockr option assistant_key_secret.
  readonly secret: string;
  // For whom the entry keeps the key, by the blockr option
  // assistant_key_scope.
  readonly scope: KeyScope;
  // The base URL that the key is for.
  readonly baseUrl: string;
  // The app's path, such as /content/0b2c9a41/.
  readonly path: string;
  // The page's Web Crypto and local storage.
  readonly subtle: SubtleCrypto;
  readonly storage: Storage;
}

export function keyEntry(options: KeyEntryOptions): KeyEntry {
  const { scope, subtle, storage } = options;
  let derived: Promise<Derived> | undefined;
  const derive = (): Promise<Derived> => (derived ??= deriveFrom(subtle, options.secret));
  // The app's path or the secret's id, by the scope, then the base URL.
  const nameOf = async (): Promise<string> => `${PREFIX} ${JSON.stringify([scope === "app" ? options.path : (await derive()).id, options.baseUrl])}`;

  async function read(): Promise<string | undefined> {
    const name = await nameOf();
    const held = getItem(storage, name);
    if (held === undefined) return undefined;
    let key: string | undefined;
    try {
      const bytes = fromBase64(held);
      const opened = await subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, IV_BYTES) }, (await derive()).key, bytes.slice(IV_BYTES));
      key = new TextDecoder().decode(opened);
    } catch {
      key = undefined;
    }
    if (key === undefined || key === "") {
      removeItem(storage, name);
      return undefined;
    }
    return key;
  }

  return {
    scope,
    read,
    async write(key) {
      const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
      const sealed = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, (await derive()).key, encode(key)));
      const bytes = new Uint8Array(IV_BYTES + sealed.length);
      bytes.set(iv);
      bytes.set(sealed, IV_BYTES);
      setItem(storage, await nameOf(), toBase64(bytes));
    },
    async remove(key) {
      // A read removes an entry that the page cannot read.
      if ((await read()) === key) removeItem(storage, await nameOf());
    },
  };
}

// What HKDF derives from the secret: the key for AES-GCM, and the secret's id.
interface Derived {
  readonly key: CryptoKey;
  readonly id: string;
}

async function deriveFrom(subtle: SubtleCrypto, secret: string): Promise<Derived> {
  const material = await subtle.importKey("raw", encode(secret), "HKDF", false, ["deriveKey", "deriveBits"]);
  const hkdf = (info: string): HkdfParams => ({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: encode(info) });
  const [key, id] = await Promise.all([
    subtle.deriveKey(hkdf(PREFIX), material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]),
    subtle.deriveBits(hkdf(ID_INFO), material, ID_BYTES * 8),
  ]);
  return { key, id: toHex(new Uint8Array(id)) };
}

// What local storage holds under the name, or undefined where it holds
// nothing or the browser refuses local storage.
function getItem(storage: Storage, name: string): string | undefined {
  try {
    return storage.getItem(name) ?? undefined;
  } catch {
    return undefined;
  }
}

function setItem(storage: Storage, name: string, value: string): void {
  try {
    storage.setItem(name, value);
  } catch {
    // The browser refuses local storage, or it is full, so a reload asks for
    // the key again.
  }
}

function removeItem(storage: Storage, name: string): void {
  try {
    storage.removeItem(name);
  } catch {
    // The browser refuses local storage, so it holds no entry to remove.
  }
}

function encode(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// The bytes of the base64 given. It throws where the text is no base64.
function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}
