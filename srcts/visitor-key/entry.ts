// The entry in the browser's local storage that keeps the visitor's own key
// for one app and one base URL, where the deployment sets the blockr option
// assistant_key_secret (./visitor-key.ts).
//
// Every page of the app's origin can read local storage, so the entry holds
// the key encrypted with the secret, which R hands the page with the other
// blockr options. The page encrypts and decrypts the key itself, so the key
// never reaches R:
// - The page derives a key for AES-GCM from the secret, through HKDF with
//   SHA-256.
// - Each write encrypts the visitor's key with a random IV. The entry holds
//   the IV and the encrypted key, in base64.
// - The entry's name holds the app's path and the base URL. So local storage
//   holds one entry for each app and base URL to which the visitor gave a key.
//   Another app of the same origin finds no key that the visitor gave this
//   app, and a key only goes to the host for which the visitor gave it.
//
// An entry that the page cannot read counts as none, and the page removes it.
// Every entry becomes unreadable once the deployment changes its secret, so
// each visitor then gives their key again.
//
// The browser may refuse local storage while the page runs, as when the
// storage is full. The entry then writes nothing and reads none, as on a page
// on which the browser refuses local storage from the start (keepKey() in
// ./visitor-key.ts).

// The start of the entry's name, which names the info of HKDF too.
const PREFIX = "blockr.assistant-visitor_key";

// The bytes of AES-GCM's IV.
const IV_BYTES = 12;

export interface KeyEntry {
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
  // The base URL that the key is for.
  readonly baseUrl: string;
  // The app's path, such as /content/0b2c9a41/.
  readonly path: string;
  // The page's Web Crypto and local storage.
  readonly subtle: SubtleCrypto;
  readonly storage: Storage;
}

export function keyEntry(options: KeyEntryOptions): KeyEntry {
  const { subtle, storage } = options;
  const name = `${PREFIX} ${JSON.stringify([options.path, options.baseUrl])}`;
  let derived: Promise<CryptoKey> | undefined;
  const cryptoKey = (): Promise<CryptoKey> => (derived ??= deriveKey(subtle, options.secret));

  async function read(): Promise<string | undefined> {
    const held = getItem(storage, name);
    if (held === undefined) return undefined;
    let key: string | undefined;
    try {
      const bytes = fromBase64(held);
      const opened = await subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, IV_BYTES) }, await cryptoKey(), bytes.slice(IV_BYTES));
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
    read,
    async write(key) {
      const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
      const sealed = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(), encode(key)));
      const bytes = new Uint8Array(IV_BYTES + sealed.length);
      bytes.set(iv);
      bytes.set(sealed, IV_BYTES);
      setItem(storage, name, toBase64(bytes));
    },
    async remove(key) {
      // A read removes an entry that the page cannot read.
      if ((await read()) === key) removeItem(storage, name);
    },
  };
}

// The key for AES-GCM that HKDF derives from the secret.
async function deriveKey(subtle: SubtleCrypto, secret: string): Promise<CryptoKey> {
  const material = await subtle.importKey("raw", encode(secret), "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: encode(PREFIX) }, material, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
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

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// The bytes of the base64 given. It throws where the text is no base64.
function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
}
