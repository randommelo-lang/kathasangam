use crate::db::AuthUser;
use crate::models::UploadResponse;
use crate::errors::AppError;
use axum::{extract::Multipart, Json};
use uuid::Uuid;
use tokio::io::AsyncWriteExt;

const MAX_UPLOAD_SIZE: usize = 10 * 1024 * 1024; // 10 MB

const VALID_IMAGE_EXTENSIONS: [&str; 5] = ["webp", "png", "jpg", "jpeg", "gif"];
const STORAGE_BUCKET: &str = "kathasangam";

/// Validates that a stored media reference is one this application could have produced.
///
/// SB-08: story `cover` values were previously accepted verbatim and later handed to
/// [`delete_uploaded_file`], which builds a service-role `DELETE` from whatever follows
/// `/storage/v1/object/public/` in the URL. An author could therefore set a cover of
/// `…/public/kathasangam/../<other-bucket>/<file>` and delete arbitrary objects
/// anywhere in the Supabase project just by deleting or editing their story.
///
/// Accepted forms:
/// * empty — clears the reference
/// * `/uploads/<file>.<ext>` — local storage
/// * `<SUPABASE_URL>/storage/v1/object/public/kathasangam/<file>.<ext>`
/// * a built-in `linear-gradient(...)` placeholder
///
/// Rejects any `..`, any additional path separator, any query or fragment, and any
/// extension outside [`VALID_IMAGE_EXTENSIONS`].
pub fn is_valid_stored_media_url(url: &str) -> bool {
    let url = url.trim();

    if url.is_empty() {
        return true;
    }

    // Built-in placeholder covers assigned by `random_cover()`.
    if url.starts_with("linear-gradient(") && url.ends_with(')') {
        return true;
    }

    let is_valid_filename = |filename: &str| -> bool {
        if filename.is_empty()
            || filename.contains('/')
            || filename.contains('\\')
            || filename.contains("..")
            || filename.contains('?')
            || filename.contains('#')
        {
            return false;
        }
        filename
            .rsplit('.')
            .next()
            .map(|ext| VALID_IMAGE_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
            .unwrap_or(false)
    };

    if let Some(filename) = url.strip_prefix("/uploads/") {
        return is_valid_filename(filename);
    }

    if let Ok(supabase_url) = std::env::var("SUPABASE_URL") {
        if !supabase_url.is_empty() {
            let prefix = format!(
                "{}/storage/v1/object/public/{}/",
                supabase_url, STORAGE_BUCKET
            );
            if let Some(filename) = url.strip_prefix(&prefix) {
                return is_valid_filename(filename);
            }
        }
    }

    false
}

async fn compress_image_with_bun(
    raw_temp_path: &str,
    compressed_temp_path: &str,
) -> Option<Vec<u8>> {
    // 2. Resolve Bun path (locating local .bun/bin/bun if not in PATH)
    let bun_exe = if let Ok(profile) = std::env::var("USERPROFILE") {
        let path = format!(r"{}\.bun\bin\bun.exe", profile);
        if std::path::Path::new(&path).exists() {
            path
        } else {
            "bun".to_string()
        }
    } else if let Ok(home) = std::env::var("HOME") {
        let path = format!("{}/.bun/bin/bun", home);
        if std::path::Path::new(&path).exists() {
            path
        } else {
            "bun".to_string()
        }
    } else {
        "bun".to_string()
    };

    // 3. Spawn bun command asynchronously
    let status = tokio::process::Command::new(bun_exe)
        .args(&["run", "compress.js", raw_temp_path, compressed_temp_path])
        .status()
        .await;

    match status {
        Ok(s) if s.success() => {
            // 5. Read compressed webp bytes
            match tokio::fs::read(compressed_temp_path).await {
                Ok(compressed_data) => {
                    // Clean up compressed temp file
                    let _ = tokio::fs::remove_file(compressed_temp_path).await;
                    tracing::info!("✅ Bun image compression complete (WebP)");
                    Some(compressed_data)
                }
                Err(e) => {
                    tracing::error!("⚠️ Failed to read compressed temp file: {:?}", e);
                    let _ = tokio::fs::remove_file(compressed_temp_path).await;
                    None
                }
            }
        }
        Ok(s) => {
            tracing::error!("⚠️ Bun compression script exited with non-zero status: {:?}", s);
            let _ = tokio::fs::remove_file(compressed_temp_path).await;
            None
        }
        Err(e) => {
            tracing::error!("⚠️ Failed to execute Bun compression: {:?}", e);
            let _ = tokio::fs::remove_file(compressed_temp_path).await;
            None
        }
    }
}

fn validate_image_magic_bytes(data: &[u8]) -> bool {
    if data.len() < 4 {
        return false;
    }
    
    // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
    if data.starts_with(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) {
        return true;
    }
    
    // JPEG magic bytes: FF D8 FF
    if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return true;
    }
    
    // WEBP magic bytes: RIFF (first 4 bytes) and WEBP (bytes 8-11)
    if data.starts_with(&[0x52, 0x49, 0x46, 0x46]) && data.len() >= 12 {
        if &data[8..12] == &[0x57, 0x45, 0x42, 0x50] {
            return true;
        }
    }
    
    // GIF magic bytes: GIF8
    if data.starts_with(&[0x47, 0x49, 0x46, 0x38]) {
        return true;
    }
    
    false
}

/// POST /api/upload/image
pub async fn upload_image(_auth: AuthUser, mut multipart: Multipart) -> Result<Json<UploadResponse>, AppError> {
    while let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(|_| AppError::bad_request("Failed to read upload form data."))?
    {
        let name = field.name().unwrap_or("").to_string();
        if name == "file" {
            let filename = field.file_name().unwrap_or("upload.png").to_string();
            let ext = filename.rsplit('.').next().unwrap_or("png").to_string();

            let uuid = Uuid::new_v4();
            let raw_temp_path = format!("temp_raw_{}.{}", uuid, ext);
            let compressed_temp_path = format!("temp_compressed_{}.webp", uuid);

            let mut file = match tokio::fs::File::create(&raw_temp_path).await {
                Ok(f) => f,
                Err(e) => {
                    tracing::error!("Failed to create temporary file: {:?}", e);
                    return Err(AppError::internal_server_error("Failed to save uploaded file temporarily."));
                }
            };

            let mut total_written = 0;
            let mut magic_buffer = Vec::new();
            let mut magic_validated = false;

            while let Some(chunk) = field.chunk().await
                .map_err(|e| {
                    tracing::error!("Error reading chunk: {:?}", e);
                    AppError::bad_request("Failed to read uploaded file chunk.")
                })?
            {
                if total_written + chunk.len() > MAX_UPLOAD_SIZE {
                    drop(file);
                    let _ = tokio::fs::remove_file(&raw_temp_path).await;

                    // Drain remaining chunks of the current field
                    while let Ok(Some(_)) = field.chunk().await {}
                    // Drain any remaining fields in the multipart form
                    while let Ok(Some(mut next_field)) = multipart.next_field().await {
                        while let Ok(Some(_)) = next_field.chunk().await {}
                    }

                    return Err(AppError::bad_request("Upload size limit exceeded. Max 10MB allowed."));
                }

                if !magic_validated {
                    let needed = 12 - magic_buffer.len();
                    let to_copy = std::cmp::min(needed, chunk.len());
                    magic_buffer.extend_from_slice(&chunk[..to_copy]);
                    if magic_buffer.len() >= 12 {
                        if !validate_image_magic_bytes(&magic_buffer) {
                            drop(file);
                            let _ = tokio::fs::remove_file(&raw_temp_path).await;

                            // Drain remaining chunks of the current field
                            while let Ok(Some(_)) = field.chunk().await {}
                            // Drain any remaining fields in the multipart form
                            while let Ok(Some(mut next_field)) = multipart.next_field().await {
                                while let Ok(Some(_)) = next_field.chunk().await {}
                            }

                            return Err(AppError::bad_request("Unsupported image format. Please upload PNG, JPEG, WebP, or GIF."));
                        }
                        magic_validated = true;
                    }
                }

                if let Err(e) = file.write_all(&chunk).await {
                    tracing::error!("Error writing chunk to file: {:?}", e);
                    drop(file);
                    let _ = tokio::fs::remove_file(&raw_temp_path).await;
                    return Err(AppError::internal_server_error("Failed to write uploaded file chunk."));
                }

                total_written += chunk.len();
            }

            if let Err(e) = file.flush().await {
                tracing::error!("Failed to flush temporary file: {:?}", e);
                let _ = tokio::fs::remove_file(&raw_temp_path).await;
                return Err(AppError::internal_server_error("Failed to flush temporary file."));
            }
            drop(file);

            if total_written == 0 {
                let _ = tokio::fs::remove_file(&raw_temp_path).await;
                return Err(AppError::bad_request("Uploaded file is empty."));
            }

            if !magic_validated {
                if !validate_image_magic_bytes(&magic_buffer) {
                    let _ = tokio::fs::remove_file(&raw_temp_path).await;

                    // Drain any remaining fields in the multipart form
                    while let Ok(Some(mut next_field)) = multipart.next_field().await {
                        while let Ok(Some(_)) = next_field.chunk().await {}
                    }

                    return Err(AppError::bad_request("Unsupported image format. Please upload PNG, JPEG, WebP, or GIF."));
                }
            }

            // Attempt to compress image using Bun
            let mut final_ext = ext;
            let data = match compress_image_with_bun(&raw_temp_path, &compressed_temp_path).await {
                Some(compressed_data) => {
                    final_ext = "webp".to_string();
                    compressed_data
                }
                None => {
                    // Compression failed or skipped, read raw data from disk
                    match tokio::fs::read(&raw_temp_path).await {
                        Ok(raw_data) => raw_data,
                        Err(e) => {
                            tracing::error!("Failed to read raw temp file: {:?}", e);
                            let _ = tokio::fs::remove_file(&raw_temp_path).await;
                            return Err(AppError::internal_server_error("Failed to read uploaded file."));
                        }
                    }
                }
            };

            // Clean up raw temp file
            let _ = tokio::fs::remove_file(&raw_temp_path).await;

            let stored_name = format!("{}.{}", Uuid::new_v4(), final_ext);
            let supabase_url = std::env::var("SUPABASE_URL").ok();
            let service_role_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY").ok();

            // Convert to Bytes to avoid cloning the large byte buffer
            let data_bytes = bytes::Bytes::from(data);

            if let (Some(url), Some(key)) = (supabase_url, service_role_key) {
                if !url.is_empty() && !key.is_empty() {
                    let bucket = "kathasangam";
                    let upload_url = format!("{}/storage/v1/object/{}/{}", url, bucket, stored_name);

                    let client = reqwest::Client::new();
                    let content_type = match final_ext.to_lowercase().as_str() {
                        "png" => "image/png",
                        "jpg" | "jpeg" => "image/jpeg",
                        "webp" => "image/webp",
                        "gif" => "image/gif",
                        _ => "application/octet-stream",
                    };

                    tracing::info!("🔶 Uploading to Supabase Storage bucket '{}': {}", bucket, stored_name);
                    let res = client
                        .post(&upload_url)
                        .header("apikey", &key)
                        .header("Authorization", format!("Bearer {}", key))
                        .header("Content-Type", content_type)
                        .body(data_bytes.clone())
                        .send()
                        .await;

                    match res {
                        Ok(resp) => {
                            if resp.status().is_success() {
                                let public_url = format!("{}/storage/v1/object/public/{}/{}", url, bucket, stored_name);
                                tracing::info!("✅ Uploaded successfully to Supabase Storage: {}", public_url);
                                return Ok(Json(UploadResponse { url: public_url }));
                            } else {
                                let err_status = resp.status();
                                let err_text = resp.text().await.unwrap_or_default();
                                tracing::error!("⚠️ Supabase Storage upload failed (status {}): {}. Falling back to local storage.", err_status, err_text);
                            }
                        }
                        Err(e) => {
                            tracing::error!("⚠️ Supabase Storage request failed: {}. Falling back to local storage.", e);
                        }
                    }
                }
            }

            // Fallback: local disk storage
            let path = format!("uploads/{}", stored_name);
            tokio::fs::write(&path, &data_bytes)
                .await?;

            return Ok(Json(UploadResponse {
                url: format!("/uploads/{}", stored_name),
            }));
        }
    }
    Err(AppError::bad_request("No file field found in upload request."))
}

/// Returns true only for `<STORAGE_BUCKET>/<filename>` where `filename` is a single
/// path segment carrying an allowed image extension.
///
/// Rejects traversal segments, backslashes, URL-encoded separators, empty segments,
/// and any bucket name other than the configured one.
fn is_safe_storage_object_path(path: &str) -> bool {
    let (bucket, filename) = match path.split_once('/') {
        Some(parts) => parts,
        None => return false,
    };

    if bucket != STORAGE_BUCKET || filename.is_empty() {
        return false;
    }
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return false;
    }
    // Reject percent-encoding so `%2e%2e%2f` cannot slip past the literal checks above.
    if filename.contains('%') {
        return false;
    }

    filename
        .rsplit('.')
        .next()
        .map(|ext| VALID_IMAGE_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Helper to delete a file from either Supabase Storage or local uploads folder based on its URL
pub async fn delete_uploaded_file(file_url: &str) {
    if file_url.is_empty() {
        return;
    }

    // Check if it's a Supabase Storage public URL
    // e.g., "https://vvljxgoprncblowdmfxi.supabase.co/storage/v1/object/public/kathasangam/some-uuid.webp"
    if file_url.contains("/storage/v1/object/public/") {
        let supabase_url = std::env::var("SUPABASE_URL").ok();
        let service_role_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY").ok();

        if let (Some(url), Some(key)) = (supabase_url, service_role_key) {
            if !url.is_empty() && !key.is_empty() {
                // Parse out the part after "/storage/v1/object/public/"
                // E.g., from ".../storage/v1/object/public/kathasangam/some-uuid.webp"
                // we want "kathasangam/some-uuid.webp"
                if let Some(pos) = file_url.find("/storage/v1/object/public/") {
                    let path_part = &file_url[pos + "/storage/v1/object/public/".len()..];

                    // SB-08 defence in depth: refuse anything that is not exactly
                    // `<bucket>/<filename>`. This function issues a service-role DELETE,
                    // so a `..` segment or a different bucket name would authorise
                    // deleting objects the caller does not own.
                    if !is_safe_storage_object_path(path_part) {
                        tracing::warn!(
                            "Refusing to delete storage object: path {:?} is outside the {} bucket or is not a plain filename",
                            path_part,
                            STORAGE_BUCKET
                        );
                        return;
                    }

                    let delete_url = format!("{}/storage/v1/object/{}", url, path_part);

                    let client = reqwest::Client::new();
                    tracing::info!("🔶 Attempting to delete from Supabase Storage: {}", delete_url);
                    let res = client
                        .delete(&delete_url)
                        .header("apikey", &key)
                        .header("Authorization", format!("Bearer {}", key))
                        .send()
                        .await;

                    match res {
                        Ok(resp) => {
                            if resp.status().is_success() {
                                tracing::info!("✅ Deleted successfully from Supabase Storage: {}", file_url);
                            } else {
                                let status = resp.status();
                                let text = resp.text().await.unwrap_or_default();
                                tracing::error!("⚠️ Supabase Storage delete failed (status {}): {}", status, text);
                            }
                        }
                        Err(e) => {
                            tracing::error!("⚠️ Supabase Storage delete request failed: {}", e);
                        }
                    }
                }
            }
        }
    } else if file_url.starts_with("/uploads/") {
        // Local file fallback.
        // E.g., file_url = "/uploads/some-uuid.webp"
        //
        // SB-08: the filename was previously passed straight to `remove_file`, so a
        // value like "/uploads/../../etc/passwd" escaped the uploads directory and
        // deleted arbitrary files on the host. Validate the whole reference first.
        if !is_valid_stored_media_url(file_url) {
            tracing::warn!(
                "Refusing to delete local upload: {:?} is not a valid stored media reference",
                file_url
            );
            return;
        }

        let relative_path = &file_url[1..]; // "uploads/some-uuid.webp"
        if std::path::Path::new(relative_path).exists() {
            if let Err(e) = tokio::fs::remove_file(relative_path).await {
                tracing::error!("⚠️ Failed to delete local upload file '{}': {:?}", relative_path, e);
            } else {
                tracing::info!("✅ Deleted local upload file successfully: {}", relative_path);
            }
        }
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    // SB-08 regression tests. These lock in the containment that prevents a
    // service-role storage DELETE or a local remove_file from escaping the bucket.

    #[test]
    fn rejects_traversal_in_supabase_object_path() {
        assert!(!is_safe_storage_object_path(
            "kathasangam/../secrets/private.json"
        ));
        assert!(!is_safe_storage_object_path("kathasangam/../../etc/passwd"));
    }

    #[test]
    fn rejects_other_buckets() {
        assert!(!is_safe_storage_object_path("other-bucket/file.webp"));
        assert!(!is_safe_storage_object_path("../other-bucket/file.webp"));
    }

    #[test]
    fn rejects_percent_encoding_and_backslashes() {
        assert!(!is_safe_storage_object_path("kathasangam/%2e%2e%2fadmin.webp"));
        assert!(!is_safe_storage_object_path("kathasangam/a\\b.webp"));
    }

    #[test]
    fn rejects_extra_path_segments() {
        assert!(!is_safe_storage_object_path("kathasangam/nested/file.webp"));
    }

    #[test]
    fn rejects_disallowed_extension() {
        assert!(!is_safe_storage_object_path("kathasangam/evil.html"));
        assert!(!is_safe_storage_object_path("kathasangam/evil.svg"));
    }

    #[test]
    fn accepts_plain_image_object() {
        assert!(is_safe_storage_object_path("kathasangam/6f1c.webp"));
        assert!(is_safe_storage_object_path("kathasangam/6f1c.PNG"));
    }

    #[test]
    fn media_url_validator_accepts_local_uploads() {
        assert!(is_valid_stored_media_url("/uploads/abc-123.webp"));
        assert!(is_valid_stored_media_url("/uploads/abc-123.png"));
    }

    #[test]
    fn media_url_validator_rejects_traversal() {
        assert!(!is_valid_stored_media_url("/uploads/../../etc/passwd"));
        assert!(!is_valid_stored_media_url("/uploads/../secrets.env"));
        assert!(!is_valid_stored_media_url("/uploads/nested/evil.webp"));
    }

    #[test]
    fn media_url_validator_rejects_arbitrary_hosts() {
        assert!(!is_valid_stored_media_url("https://evil.example/x.webp"));
        assert!(!is_valid_stored_media_url("https://attacker.supabase.co/storage/v1/object/public/kathasangam/a.webp"));
    }

    #[test]
    fn media_url_validator_accepts_placeholder_and_empty() {
        assert!(is_valid_stored_media_url(""));
        assert!(is_valid_stored_media_url(
            "linear-gradient(135deg, #7b3a12 0%, #e57c33 46%, #fdc5a0 47%, #263746 100%)"
        ));
    }
}
