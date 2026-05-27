use crate::db::AuthUser;
use crate::models::UploadResponse;
use axum::{extract::Multipart, http::StatusCode, Json};
use uuid::Uuid;

async fn compress_image_with_bun(
    raw_data: &[u8],
    original_ext: &str,
) -> Option<(Vec<u8>, String)> {
    let uuid = Uuid::new_v4();
    let raw_temp_path = format!("temp_raw_{}.{}", uuid, original_ext);
    let compressed_temp_path = format!("temp_compressed_{}.webp", uuid);

    // 1. Write raw bytes to temporary file
    if let Err(e) = tokio::fs::write(&raw_temp_path, raw_data).await {
        eprintln!("⚠️ Failed to write raw temp file: {:?}", e);
        return None;
    }

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
        .args(&["run", "compress.js", &raw_temp_path, &compressed_temp_path])
        .status()
        .await;

    // 4. Clean up raw temp file
    let _ = tokio::fs::remove_file(&raw_temp_path).await;

    match status {
        Ok(s) if s.success() => {
            // 5. Read compressed webp bytes
            match tokio::fs::read(&compressed_temp_path).await {
                Ok(compressed_data) => {
                    // Clean up compressed temp file
                    let _ = tokio::fs::remove_file(&compressed_temp_path).await;
                    println!("✅ Bun image compression complete (WebP)");
                    Some((compressed_data, "webp".to_string()))
                }
                Err(e) => {
                    eprintln!("⚠️ Failed to read compressed temp file: {:?}", e);
                    let _ = tokio::fs::remove_file(&compressed_temp_path).await;
                    None
                }
            }
        }
        Ok(s) => {
            eprintln!("⚠️ Bun compression script exited with non-zero status: {:?}", s);
            let _ = tokio::fs::remove_file(&compressed_temp_path).await;
            None
        }
        Err(e) => {
            eprintln!("⚠️ Failed to execute Bun compression: {:?}", e);
            let _ = tokio::fs::remove_file(&compressed_temp_path).await;
            None
        }
    }
}

/// POST /api/upload/image
pub async fn upload_image(_auth: AuthUser, mut multipart: Multipart) -> Result<Json<UploadResponse>, StatusCode> {
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?
    {
        let name = field.name().unwrap_or("").to_string();
        if name == "file" {
            let filename = field.file_name().unwrap_or("upload.png").to_string();
            let mut ext = filename.rsplit('.').next().unwrap_or("png").to_string();
            let mut data = field.bytes().await.map_err(|_| StatusCode::BAD_REQUEST)?.to_vec();

            // Attempt to compress image using Bun
            if let Some((compressed_data, new_ext)) = compress_image_with_bun(&data, &ext).await {
                data = compressed_data;
                ext = new_ext;
            }

            let stored_name = format!("{}.{}", Uuid::new_v4(), ext);
            let supabase_url = std::env::var("SUPABASE_URL").ok();
            let service_role_key = std::env::var("SUPABASE_SERVICE_ROLE_KEY").ok();

            if let (Some(url), Some(key)) = (supabase_url, service_role_key) {
                if !url.is_empty() && !key.is_empty() {
                    let bucket = "kathasangam";
                    let upload_url = format!("{}/storage/v1/object/{}/{}", url, bucket, stored_name);

                    let client = reqwest::Client::new();
                    let content_type = match ext.to_lowercase().as_str() {
                        "png" => "image/png",
                        "jpg" | "jpeg" => "image/jpeg",
                        "webp" => "image/webp",
                        "gif" => "image/gif",
                        _ => "application/octet-stream",
                    };

                    println!("🔶 Uploading to Supabase Storage bucket '{}': {}", bucket, stored_name);
                    let res = client
                        .post(&upload_url)
                        .header("apikey", &key)
                        .header("Authorization", format!("Bearer {}", key))
                        .header("Content-Type", content_type)
                        .body(data.clone())
                        .send()
                        .await;

                    match res {
                        Ok(resp) => {
                            if resp.status().is_success() {
                                let public_url = format!("{}/storage/v1/object/public/{}/{}", url, bucket, stored_name);
                                println!("✅ Uploaded successfully to Supabase Storage: {}", public_url);
                                return Ok(Json(UploadResponse { url: public_url }));
                            } else {
                                let err_status = resp.status();
                                let err_text = resp.text().await.unwrap_or_default();
                                eprintln!("⚠️ Supabase Storage upload failed (status {}): {}. Falling back to local storage.", err_status, err_text);
                            }
                        }
                        Err(e) => {
                            eprintln!("⚠️ Supabase Storage request failed: {}. Falling back to local storage.", e);
                        }
                    }
                }
            }

            // Fallback: local disk storage
            let path = format!("uploads/{}", stored_name);
            tokio::fs::write(&path, &data)
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

            return Ok(Json(UploadResponse {
                url: format!("/uploads/{}", stored_name),
            }));
        }
    }
    Err(StatusCode::BAD_REQUEST)
}
