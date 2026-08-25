"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STORAGE_BUCKET = void 0;
exports.uploadFileToStorage = uploadFileToStorage;
exports.downloadFileFromStorage = downloadFileFromStorage;
exports.deleteFileFromStorage = deleteFileFromStorage;
exports.deleteFilesFromStorage = deleteFilesFromStorage;
exports.getSignedStorageUrl = getSignedStorageUrl;
const supabase_js_1 = require("@supabase/supabase-js");
// Distinct from the DATABASE_URL used for Postgres access — this project's
// Supabase instance is used for both, but Storage goes through its own
// REST API and needs its own client + service-role key (not the DB connection
// string), so these are separate required env vars.
//
// Checked lazily (on first actual storage call) rather than at module load —
// unlike JWT_SECRET (needed by every request), file storage is only used by a
// subset of features, so a missing key here shouldn't stop the whole backend
// from booting for someone not touching uploads/downloads yet.
let supabaseAdmin = null;
function getSupabaseAdmin() {
    if (supabaseAdmin)
        return supabaseAdmin;
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY environment variables are not set — required for file storage.");
    }
    // Service-role key bypasses Row Level Security entirely — this client must
    // only ever run on the server (never sent to the frontend) and every access
    // check must happen in application code before calling these helpers, same
    // as the local-disk code they replace.
    supabaseAdmin = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
    return supabaseAdmin;
}
// Single private bucket for every upload type (Documents, task attachments,
// purchase requests/orders, proforma invoices, customs docs, goods receipts,
// inventory attachments) — each keeps the same "<category>/<id>/<filename>"
// key layout it used as a local disk path before this migration, so existing
// stored DB paths/keys don't need backfilling.
exports.STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "uploads";
/** Uploads a buffer to the bucket at `key`. Throws on failure — callers decide how to respond. */
async function uploadFileToStorage(key, buffer, contentType) {
    const { error } = await getSupabaseAdmin().storage.from(exports.STORAGE_BUCKET).upload(key, buffer, {
        contentType: contentType || "application/octet-stream",
        upsert: false,
    });
    if (error)
        throw error;
}
/** Downloads an object's bytes into memory. Throws if it doesn't exist or the fetch fails. */
async function downloadFileFromStorage(key) {
    const { data, error } = await getSupabaseAdmin().storage.from(exports.STORAGE_BUCKET).download(key);
    if (error || !data)
        throw error || new Error(`File not found in storage: ${key}`);
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
/** Best-effort delete of a single object — mirrors the old fs.unlink(..., () => {}) "don't care if it fails" cleanup calls. */
async function deleteFileFromStorage(key) {
    try {
        await getSupabaseAdmin().storage.from(exports.STORAGE_BUCKET).remove([key]);
    }
    catch (error) {
        console.error(`Failed to delete storage object "${key}":`, error);
    }
}
/** Best-effort batch delete. Supabase caps remove() at 1000 keys per call, well above anything this app produces. */
async function deleteFilesFromStorage(keys) {
    if (keys.length === 0)
        return;
    try {
        await getSupabaseAdmin().storage.from(exports.STORAGE_BUCKET).remove(keys);
    }
    catch (error) {
        console.error(`Failed to delete ${keys.length} storage object(s):`, error);
    }
}
/**
 * Mints a temporary public URL for one object — used for the Office-document
 * preview flow, where Microsoft's Office Online viewer fetches the file
 * itself and has no way to send our session cookie. The read-access check
 * still happens in application code before this is ever called; the URL
 * itself expires after `expiresInSeconds`.
 */
async function getSignedStorageUrl(key, expiresInSeconds) {
    const { data, error } = await getSupabaseAdmin()
        .storage.from(exports.STORAGE_BUCKET)
        .createSignedUrl(key, expiresInSeconds);
    if (error || !data)
        throw error || new Error(`Failed to create signed URL for: ${key}`);
    return data.signedUrl;
}
//# sourceMappingURL=supabaseStorage.js.map