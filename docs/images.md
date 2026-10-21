# Listing images in MongoDB GridFS

GridFS uses the existing Mongoose MongoDB connection, with bucket `images` (`images.files` and `images.chunks`). No new service or dependency is required. Uploaded file metadata includes the owning business and detected content type; filenames are generated from a content hash. Listing details are MongoDB documents; listing image arrays reference GridFS files through `/media/images/<ObjectId>` paths. New/changed image arrays reject external URLs and base64 data. The API verifies every referenced file exists and belongs to the listing business before create/update. Existing records are not rewritten just by changing validation. Files are streamed from GridFS on reads.

## Upload and retrieval

The existing product form accepts an optional image file, with no page redesign. The former external image URL input has been removed so users cannot bypass GridFS storage. File size is limited to 5 MiB; PNG, JPEG, GIF and WebP signatures must match declared MIME types. Raw SVG/HTML uploads are rejected. Multipart parsing is bounded by actual byte count (5 MiB plus 64 KiB form overhead); arbitrary image URLs are not fetched server-side.

The resource endpoint `POST /media/images?business=<businessId>` accepts raw image bytes with the matching image Content-Type, using the existing server session and business membership/active-business checks. It returns `{data: {id, url}}`. Mutations enforce existing origin protections. A direct upload remains private until attached to an eligible listing. The product form removes its newly uploaded file if listing creation returns an explicit failure; it does not remove files on ambiguous failures where a listing might have committed.

`GET`/`HEAD /media/images/:id` serves an image publicly only when its owning business is active and a published product/livestock listing or active trailer belonging to that business references the image. Other reads require existing business access. Responses use detected Content-Type, nosniff, a restrictive CSP and same-origin resource policy. Public responses cache for 60 seconds; private responses are no-store. Private health/licence documents remain separate URL fields and are not moved into this public-image bucket.

## Existing sample images

Run `npm run images:migrate-samples` after `npm run seed`. It processes only deterministic seeded Product/Livestock/Trailer IDs and only when their first image still equals the original sample source. Remote fetches are restricted to the repository's known HTTPS Unsplash sources, disallow redirects, and enforce time/size bounds. A successful GridFS upload precedes the conditional listing update, so failures retain the working source reference. Stock, prices, other images and user listing edits are preserved. Existing completed seed-key uploads can be reused on a retry; run one migration process at a time.

The repository trailer SVG is the only trusted SVG exception, imported from the fixed local file, never from user upload or an arbitrary URL. Taxi departures currently have no image field, so the migration does not invent one. Browser demo images remain in the local sample catalog; MongoDB-backed listings use the migrated paths.

GridFS uploads and listing writes do not share a transaction. Interrupted uploads may require administrative orphan-chunk cleanup; completed unattached files can also remain after interrupted listing creation. No automatic deletion of unreferenced files, retention policy, quota system, antivirus processing or image resizing is introduced. Add these as operational requirements grow. Do not run broad cleanup against customer data without a reviewed retention policy.

After a fresh `npm run build`, `npm run images:migrate-samples -- --verify` also checks all migrated sample images through the actual built React Router resource handler. It reads each image body and validates a successful response and nosniff header, without starting a web server. This uses the configured Atlas database and reruns the migration's safe conditional updates before verification.

Use `npm run typecheck` and `npm test`. Automated checks cover MIME/signature validation, body bounds, origin/session boundaries, invalid IDs and listing/document schema separation. Successful live migration and image retrieval must be verified separately. MongoDB's [GridFS Node driver guide](https://www.mongodb.com/docs/drivers/node/current/crud/gridfs/) describes the underlying bucket/stream APIs.

Live verification in this implementation migrated all 13 eligible seeded listing images with zero failures. A second run skipped all 13, and the built resource handler successfully served each stored file. Browser form interactions still require manual verification. The production build and 78 automated tests passed.
