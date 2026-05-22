use crate::models::UploadResponse;
use axum::{extract::Multipart, http::StatusCode, Json};
use uuid::Uuid;

/// POST /api/upload/image
pub async fn upload_image(mut multipart: Multipart) -> Result<Json<UploadResponse>, StatusCode> {
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?
    {
        let name = field.name().unwrap_or("").to_string();
        if name == "file" {
            let filename = field.file_name().unwrap_or("upload.png").to_string();
            let ext = filename.rsplit('.').next().unwrap_or("png");
            let stored_name = format!("{}.{}", Uuid::new_v4(), ext);
            let data = field.bytes().await.map_err(|_| StatusCode::BAD_REQUEST)?;

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

