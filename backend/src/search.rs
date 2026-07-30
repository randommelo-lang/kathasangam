use uuid::Uuid;

async fn send_to_meili(path: &str, body: serde_json::Value, method: &str) -> Result<serde_json::Value, String> {
    let base_url = std::env::var("MEILI_URL")
        .or_else(|_| std::env::var("MEILISEARCH_URL"))
        .unwrap_or_else(|_| "http://localhost:7700".to_string());
    let key = std::env::var("MEILI_MASTER_KEY")
        .or_else(|_| std::env::var("MEILISEARCH_KEY"))
        .ok();

    let client = reqwest::Client::new();
    let url = format!("{}{}", base_url, path);
    
    let mut req = match method {
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "PATCH" => client.patch(&url),
        "DELETE" => client.delete(&url),
        "GET" => client.get(&url),
        _ => return Err(format!("Unsupported method: {}", method)),
    };

    if let Some(ref k) = key {
        if !k.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", k));
        }
    }

    if method != "GET" && method != "DELETE" {
        req = req.json(&body);
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    
    if !resp.status().is_success() {
        let status = resp.status();
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("Meilisearch error {}: {}", status, err_text));
    }

    let val = if method == "DELETE" {
        serde_json::Value::Null
    } else {
        resp.json::<serde_json::Value>().await.unwrap_or(serde_json::Value::Null)
    };

    Ok(val)
}

pub async fn init_search_index() -> Result<(), String> {
    let settings = serde_json::json!({
        "searchableAttributes": ["title", "author", "description", "tags"],
        "filterableAttributes": ["genre", "type", "language", "tags"],
    });

    tracing::info!("🔶 Initializing Meilisearch index 'stories' settings...");
    send_to_meili("/indexes/stories/settings", settings, "PATCH").await?;
    tracing::info!("✅ Meilisearch index 'stories' configured successfully");
    Ok(())
}

pub async fn index_story(pool: &sqlx::PgPool, story_id: Uuid) -> Result<(), String> {
    let row: Option<crate::models::StoryRow> = sqlx::query_as(
        "SELECT stories.id, stories.author_id, COALESCE(profiles.username, 'You') AS author_name, stories.title, stories.type, stories.genre, stories.language, stories.license, stories.status, stories.tags, stories.description, stories.cover, stories.followers, stories.views, stories.likes, stories.earnings, stories.progress, stories.created_at, stories.is_nsfw \
         FROM stories \
         LEFT JOIN profiles ON profiles.id = stories.author_id \
         WHERE stories.id = $1"
    )
    .bind(story_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some(story) = row {
        let tags: Vec<String> = story.tags
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(ToString::to_string))
                    .collect()
            })
            .unwrap_or_default();

        let doc = serde_json::json!({
            "id": story.id,
            "title": story.title,
            "author": story.author_name,
            "type": story.story_type,
            "genre": story.genre,
            "language": story.language,
            "tags": tags,
            "description": story.description,
        });

        send_to_meili("/indexes/stories/documents", serde_json::json!([doc]), "PUT").await?;
    }
    Ok(())
}

pub async fn deindex_story(story_id: Uuid) -> Result<(), String> {
    let path = format!("/indexes/stories/documents/{}", story_id);
    send_to_meili(&path, serde_json::Value::Null, "DELETE").await?;
    Ok(())
}

pub async fn search_stories(q: &str, limit: usize) -> Result<Vec<Uuid>, String> {
    let body = serde_json::json!({
        "q": q,
        "limit": limit,
    });

    let resp = send_to_meili("/indexes/stories/search", body, "POST").await?;
    
    let mut ids = Vec::new();
    if let Some(hits) = resp.get("hits").and_then(|h| h.as_array()) {
        for hit in hits {
            if let Some(id_str) = hit.get("id").and_then(|id| id.as_str()) {
                if let Ok(uuid) = Uuid::parse_str(id_str) {
                    ids.push(uuid);
                }
            }
        }
    }
    
    Ok(ids)
}

pub async fn backfill_all_stories(pool: &sqlx::PgPool) -> Result<(), String> {
    let rows: Vec<crate::models::StoryRow> = sqlx::query_as(
        "SELECT stories.id, stories.author_id, COALESCE(profiles.username, 'You') AS author_name, stories.title, stories.type, stories.genre, stories.language, stories.license, stories.status, stories.tags, stories.description, stories.cover, stories.followers, stories.views, stories.likes, stories.earnings, stories.progress, stories.created_at, stories.is_nsfw \
         FROM stories \
         LEFT JOIN profiles ON profiles.id = stories.author_id"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    tracing::info!("🔶 Syncing {} stories to Meilisearch index...", rows.len());

    let mut docs = Vec::new();
    for story in rows {
        let tags: Vec<String> = story.tags
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(ToString::to_string))
                    .collect()
            })
            .unwrap_or_default();

        docs.push(serde_json::json!({
            "id": story.id,
            "title": story.title,
            "author": story.author_name,
            "type": story.story_type,
            "genre": story.genre,
            "language": story.language,
            "tags": tags,
            "description": story.description,
        }));
    }

    if !docs.is_empty() {
        send_to_meili("/indexes/stories/documents", serde_json::json!(docs), "PUT").await?;
    }

    tracing::info!("✅ Meilisearch backfill of {} stories complete", docs.len());
    Ok(())
}

pub async fn check_health() -> Result<(), String> {
    let base_url = std::env::var("MEILI_URL")
        .or_else(|_| std::env::var("MEILISEARCH_URL"))
        .unwrap_or_else(|_| "http://localhost:7700".to_string());
    let key = std::env::var("MEILI_MASTER_KEY")
        .or_else(|_| std::env::var("MEILISEARCH_KEY"))
        .ok();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
        .map_err(|e| e.to_string())?;
    
    let url = format!("{}/health", base_url);
    let mut req = client.get(&url);

    if let Some(ref k) = key {
        if !k.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", k));
        }
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Meilisearch status error: {}", resp.status()));
    }

    let val: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    if val.get("status").and_then(|s| s.as_str()) == Some("available") {
        Ok(())
    } else {
        Err("Meilisearch not available".to_string())
    }
}

