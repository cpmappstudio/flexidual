const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
function unhex(value: string) {
  if (!/^(?:[a-f0-9]{2})+$/i.test(value))
    throw new Error("INVALID_ENCRYPTED_SESSION");
  return Uint8Array.from(value.match(/../g)!, (byte) => parseInt(byte, 16));
}

async function key(secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(secret))
    throw new Error("ABEKA_ENCRYPTION_NOT_CONFIGURED");
  const bytes = Uint8Array.from(secret.match(/../g)!, (value) =>
    parseInt(value, 16),
  );
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptSession(
  session: string,
  secret: string,
  schoolId: string,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(schoolId) },
    await key(secret),
    encoder.encode(session),
  );
  return {
    iv: hex(iv),
    ciphertext: hex(new Uint8Array(ciphertext)),
  };
}

export async function decryptSession(
  encrypted: { iv: string; ciphertext: string },
  secret: string,
  schoolId: string,
) {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: unhex(encrypted.iv),
      additionalData: encoder.encode(schoolId),
    },
    await key(secret),
    unhex(encrypted.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

// Purpose-bound associated data prevents substituting a cookie for credentials.
export async function encryptCredentials(
  credentials: { username: string; password: string },
  secret: string,
  schoolId: string,
) {
  return encryptSession(
    JSON.stringify(credentials),
    secret,
    `abeka-credentials:${schoolId}`,
  );
}

export async function decryptCredentials(
  encrypted: { iv: string; ciphertext: string },
  secret: string,
  schoolId: string,
): Promise<unknown> {
  return JSON.parse(
    await decryptSession(encrypted, secret, `abeka-credentials:${schoolId}`),
  );
}
