import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { clientKey, rateLimit } from "@/lib/rate-limit";

/**
 * Takes the picture itself, rather than a link to one.
 *
 * A link puts the token's logo on somebody else's host, and it stays there: the
 * day that host expires, rate limits us, or hotlink-blocks us, the logo is gone
 * from a token that may be years old by then. Uploading moves it somewhere we
 * control once, at launch, and it is also simply what people expect a form to
 * do with an image.
 *
 * This route is unauthenticated on purpose, because it runs *before* the token
 * exists. Artwork is chosen while filling in the form, and there is no token
 * address to check a creator against until the launch has been signed. So the
 * defences here are shape and volume rather than identity:
 *
 *   - a hard byte cap, enforced here and again by the bucket
 *   - an allowlist of image types, checked against the file's own leading bytes
 *     rather than its declared type or its name, both of which the caller picks
 *   - a rate limit per client, so this cannot become free image hosting
 *
 * The worst an abusive caller achieves is storing a handful of small images
 * that nothing links to.
 */

/** Two megabytes. Comfortably more than a logo needs and small enough to post. */
const MAX_BYTES = 2 * 1024 * 1024;

const BUCKET = "token-images";

/**
 * Magic bytes, because a declared content type is a claim by the uploader.
 *
 * Each entry is the signature at the start of the file. GIF and WebP both begin
 * with a fixed ASCII tag; PNG and JPEG have byte prefixes.
 */
function sniff(bytes: Uint8Array): { type: string; ext: string } | null {
  const starts = (...sig: number[]) =>
    sig.every((b, i) => bytes[i] === b);

  if (starts(0x89, 0x50, 0x4e, 0x47)) return { type: "image/png", ext: "png" };
  if (starts(0xff, 0xd8, 0xff)) return { type: "image/jpeg", ext: "jpg" };
  if (starts(0x47, 0x49, 0x46, 0x38)) return { type: "image/gif", ext: "gif" };
  // RIFF....WEBP
  if (
    starts(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { type: "image/webp", ext: "webp" };
  }
  return null;
}

export async function POST(request: Request) {
  const limited = rateLimit(clientKey(request, "token-image"), 12, 3_600_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many uploads. Try again later." },
      { status: 429 },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const entry = form.get("file");
    if (entry instanceof File) file = entry;
  } catch {
    return NextResponse.json({ error: "Could not read the upload." }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "No file was sent." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "That image is over 2MB. Try a smaller one." },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) {
    return NextResponse.json(
      { error: "That is not a PNG, JPEG, WebP or GIF." },
      { status: 415 },
    );
  }

  // Named by us, never by the uploader. A caller-supplied name is a path
  // traversal and an overwrite of somebody else's artwork waiting to happen.
  const name = `${Date.now().toString(36)}-${crypto.randomUUID()}.${kind.ext}`;

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error } = await db.storage.from(BUCKET).upload(name, bytes, {
    contentType: kind.type,
    // Long, because the name is unique and the bytes behind it never change.
    cacheControl: "31536000",
    upsert: false,
  });

  if (error) {
    return NextResponse.json(
      { error: "The upload did not save. Try again." },
      { status: 502 },
    );
  }

  const {
    data: { publicUrl },
  } = db.storage.from(BUCKET).getPublicUrl(name);

  return NextResponse.json({ url: publicUrl });
}
