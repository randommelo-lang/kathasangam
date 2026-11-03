use axum::{
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
};
use sqlx::PgPool;
use uuid::Uuid;

const BASE_HTML_TEMPLATE: &str = include_str!("../index_template.html");
const DEFAULT_CANONICAL_DOMAIN: &str = "https://kathasangam.co.in";

/// Determines the canonical public base URL for links and OG tags.
/// Checks `APP_BASE_URL` env var first, then falls back to `X-Forwarded-*` / `Host` headers,
/// and finally defaults to `https://kathasangam.co.in`.
pub fn resolve_base_url(headers: &HeaderMap) -> String {
    if let Ok(base) = std::env::var("APP_BASE_URL") {
        let trimmed = base.trim();
        if !trimmed.is_empty() {
            return trimmed.trim_end_matches('/').to_string();
        }
    }

    if let Some(host_val) = headers.get("x-forwarded-host").or_else(|| headers.get("host")) {
        if let Ok(host) = host_val.to_str() {
            let host = host.trim();
            if !host.is_empty() {
                let proto = headers
                    .get("x-forwarded-proto")
                    .and_then(|p| p.to_str().ok())
                    .unwrap_or("https");
                return format!("{}://{}", proto, host);
            }
        }
    }

    DEFAULT_CANONICAL_DOMAIN.to_string()
}

/// Escapes special HTML characters to prevent XSS / broken meta tags.
pub fn escape_html(input: &str) -> String {
    let mut escaped = String::with_capacity(input.len());
    for c in input.chars() {
        match c {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&#x27;"),
            _ => escaped.push(c),
        }
    }
    escaped
}

/// Normalizes and bounds the description string to a clean single-line summary.
pub fn truncate_description(raw: &str, max_len: usize) -> String {
    let collapsed = raw
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let trimmed = collapsed.trim();
    if trimmed.chars().count() <= max_len {
        return trimmed.to_string();
    }
    let mut truncated: String = trimmed.chars().take(max_len).collect();
    truncated.push('…');
    truncated
}

#[derive(sqlx::FromRow)]
pub struct SeoStoryRow {
    id: Uuid,
    title: String,
    description: Option<String>,
    cover: Option<String>,
    #[allow(dead_code)]
    author_name: Option<String>,
}

/// Injects story metadata into the HTML template for Open Graph and Twitter Card tags.
pub fn render_story_html(
    template: &str,
    story: &SeoStoryRow,
    base_url: &str,
) -> String {
    let clean_title = escape_html(&story.title);
    let raw_desc = story.description.as_deref().unwrap_or("Read this story on KathaSangam.");
    let clean_desc = escape_html(&truncate_description(raw_desc, 220));

    let cover_raw = story.cover.as_deref().unwrap_or("").trim();
    let cover_url = if cover_raw.starts_with("http://") || cover_raw.starts_with("https://") {
        escape_html(cover_raw)
    } else if cover_raw.starts_with('/') {
        escape_html(&format!("{}{}", base_url, cover_raw))
    } else {
        format!("{}/icons/kathasangam-banner.jpg", base_url)
    };

    let story_url = format!("{}/story/{}", base_url, story.id);

    template
        .replace(
            "<title>KathaSangam – Stories in Motion</title>",
            &format!("<title>{} – KathaSangam</title>", clean_title),
        )
        .replace(
            "<meta name=\"description\" content=\"A modern publishing platform for serialized web novels and chitrānk.\">",
            &format!(
                "<meta name=\"description\" content=\"{}\">\n  <link rel=\"canonical\" href=\"{}\">",
                clean_desc, story_url
            ),
        )
        .replace(
            "<meta property=\"og:type\" content=\"website\">",
            "<meta property=\"og:type\" content=\"article\">",
        )
        .replace(
            "<meta property=\"og:title\" content=\"KathaSangam – Stories in Motion\">",
            &format!("<meta property=\"og:title\" content=\"{}\">", clean_title),
        )
        .replace(
            "<meta property=\"og:description\" content=\"A modern publishing platform for serialized web novels and chitrānk.\">",
            &format!("<meta property=\"og:description\" content=\"{}\">", clean_desc),
        )
        .replace(
            "<meta property=\"og:image\" content=\"https://kathasangam.co.in/icons/kathasangam-banner.jpg\">",
            &format!(
                "<meta property=\"og:image\" content=\"{}\">\n  <meta property=\"og:image:alt\" content=\"{}\">",
                cover_url, clean_title
            ),
        )
        .replace(
            "<meta property=\"og:url\" content=\"https://kathasangam.co.in/\">",
            &format!("<meta property=\"og:url\" content=\"{}\">", story_url),
        )
        .replace(
            "<meta name=\"twitter:title\" content=\"KathaSangam – Stories in Motion\">",
            &format!("<meta name=\"twitter:title\" content=\"{}\">", clean_title),
        )
        .replace(
            "<meta name=\"twitter:description\" content=\"A modern publishing platform for serialized web novels and chitrānk.\">",
            &format!("<meta name=\"twitter:description\" content=\"{}\">", clean_desc),
        )
        .replace(
            "<meta name=\"twitter:image\" content=\"https://kathasangam.co.in/icons/kathasangam-banner.jpg\">",
            &format!("<meta name=\"twitter:image\" content=\"{}\">", cover_url),
        )
}

/// GET /
/// Serves the single-page application homepage HTML with default Open Graph and Twitter Card tags.
pub async fn serve_home_page() -> impl IntoResponse {
    let html = if let Ok(content) = std::fs::read_to_string("dist/public/index.html") {
        content
    } else if let Ok(content) = std::fs::read_to_string("../dist/public/index.html") {
        content
    } else if let Ok(content) = std::fs::read_to_string("index.html") {
        content
    } else if let Ok(content) = std::fs::read_to_string("../index.html") {
        content
    } else {
        BASE_HTML_TEMPLATE.to_string()
    };

    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "text/html; charset=utf-8"),
            (header::CACHE_CONTROL, "public, max-age=60"),
        ],
        html,
    )
}

/// GET /story/:id
/// Serves the single-page application index HTML with Open Graph & Twitter meta tags
/// tailored to the specific story so WhatsApp, Instagram, Telegram, Twitter and Facebook
/// render rich cards with title and cover.
pub async fn serve_story_page(
    State(pool): State<PgPool>,
    Path(id_param): Path<String>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let base_url = resolve_base_url(&headers);

    let parsed_uuid = Uuid::parse_str(&id_param)
        .ok()
        .or_else(|| {
            if id_param.len() >= 36 {
                Uuid::parse_str(&id_param[..36]).ok()
            } else {
                None
            }
        });

    let story_opt: Option<SeoStoryRow> = match parsed_uuid {
        Some(uuid) => {
            sqlx::query_as(
                "SELECT stories.id, stories.title, stories.description, stories.cover, \
                 COALESCE(profiles.username, 'Author') AS author_name \
                 FROM stories \
                 LEFT JOIN profiles ON profiles.id = stories.author_id \
                 WHERE stories.id = $1",
            )
            .bind(uuid)
            .fetch_optional(&pool)
            .await
            .unwrap_or(None)
        }
        None => None,
    };

    if let Some(story) = story_opt {
        let html = render_story_html(BASE_HTML_TEMPLATE, &story, &base_url);
        (
            StatusCode::OK,
            [
                (header::CONTENT_TYPE, "text/html; charset=utf-8"),
                (header::CACHE_CONTROL, "public, max-age=60, stale-while-revalidate=300"),
            ],
            html,
        )
    } else {
        (
            StatusCode::OK,
            [
                (header::CONTENT_TYPE, "text/html; charset=utf-8"),
                (header::CACHE_CONTROL, "public, max-age=60"),
            ],
            BASE_HTML_TEMPLATE.to_string(),
        )
    }
}

/// GET /robots.txt
/// Search engine crawl directives allowing public stories, assets, and specifying the sitemap.
pub async fn serve_robots_txt() -> impl IntoResponse {
    let robots_content = "\
User-agent: *
Allow: /
Allow: /story/
Allow: /icons/
Allow: /styles.css
Allow: /js/
Disallow: /api/
Disallow: /studio
Disallow: /settings
Disallow: /moderation

Sitemap: https://kathasangam.co.in/sitemap.xml
";
    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "text/plain; charset=utf-8"),
            (header::CACHE_CONTROL, "public, max-age=86400"),
        ],
        robots_content,
    )
}

#[derive(sqlx::FromRow)]
struct SitemapStory {
    id: Uuid,
    created_at: Option<chrono::NaiveDateTime>,
}

/// GET /sitemap.xml
/// Dynamically queries PostgreSQL for all published stories and renders a standards-compliant XML sitemap.
pub async fn serve_sitemap_xml(
    State(pool): State<PgPool>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let base_url = resolve_base_url(&headers);

    let rows: Vec<SitemapStory> = sqlx::query_as(
        "SELECT id, created_at FROM stories \
         WHERE status NOT IN ('draft', 'unpublished') \
         ORDER BY created_at DESC NULLS LAST \
         LIMIT 50000",
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();

    let mut xml = String::with_capacity(4096 + rows.len() * 200);
    xml.push_str("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
    xml.push_str("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");

    // Homepage
    xml.push_str(&format!(
        "  <url>\n    <loc>{}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n",
        base_url
    ));
    // About
    xml.push_str(&format!(
        "  <url>\n    <loc>{}/#about</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.5</priority>\n  </url>\n",
        base_url
    ));

    // Dynamic story entries
    for story in rows {
        let lastmod = story
            .created_at
            .map(|dt| dt.format("%Y-%m-%d").to_string())
            .unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%d").to_string());

        xml.push_str("  <url>\n");
        xml.push_str(&format!("    <loc>{}/story/{}</loc>\n", base_url, story.id));
        xml.push_str(&format!("    <lastmod>{}</lastmod>\n", lastmod));
        xml.push_str("    <changefreq>weekly</changefreq>\n");
        xml.push_str("    <priority>0.8</priority>\n");
        xml.push_str("  </url>\n");
    }

    xml.push_str("</urlset>\n");

    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/xml; charset=utf-8"),
            (header::CACHE_CONTROL, "public, max-age=3600"),
        ],
        xml,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_escape_html() {
        assert_eq!(
            escape_html("Tom & Jerry <cartoon> \"quotes\" 'single'"),
            "Tom &amp; Jerry &lt;cartoon&gt; &quot;quotes&quot; &#x27;single&#x27;"
        );
    }

    #[test]
    fn test_truncate_description() {
        let input = "Line 1\nLine 2\n\tLine 3 with lots of extra text to truncate";
        let truncated = truncate_description(input, 20);
        assert!(truncated.ends_with('…'));
        assert!(truncated.chars().count() <= 21);
    }

    #[test]
    fn test_render_story_html() {
        let story = SeoStoryRow {
            id: Uuid::nil(),
            title: "Test <Story> Title".to_string(),
            description: Some("A wonderful test story description".to_string()),
            cover: Some("https://example.com/cover.jpg".to_string()),
            author_name: Some("TestAuthor".to_string()),
        };

        let rendered = render_story_html(BASE_HTML_TEMPLATE, &story, "https://kathasangam.co.in");
        assert!(rendered.contains("<title>Test &lt;Story&gt; Title – KathaSangam</title>"));
        assert!(rendered.contains("property=\"og:title\" content=\"Test &lt;Story&gt; Title\""));
        assert!(rendered.contains("property=\"og:image\" content=\"https://example.com/cover.jpg\""));
        assert!(rendered.contains("property=\"og:url\" content=\"https://kathasangam.co.in/story/00000000-0000-0000-0000-000000000000\""));
        assert!(rendered.contains("name=\"twitter:card\" content=\"summary_large_image\""));
    }

    #[tokio::test]
    async fn test_serve_robots_txt() {
        let resp = serve_robots_txt().await.into_response();
        assert_eq!(resp.status(), StatusCode::OK);
        let content_type = resp.headers().get(header::CONTENT_TYPE).unwrap().to_str().unwrap();
        assert!(content_type.starts_with("text/plain"));
    }

    #[test]
    fn test_resolve_base_url() {
        let mut headers = HeaderMap::new();
        headers.insert("host", "example.com".parse().unwrap());
        assert_eq!(resolve_base_url(&headers), "https://example.com");

        let mut forwarded = HeaderMap::new();
        forwarded.insert("x-forwarded-host", "custom.domain.org".parse().unwrap());
        forwarded.insert("x-forwarded-proto", "http".parse().unwrap());
        assert_eq!(resolve_base_url(&forwarded), "http://custom.domain.org");
    }
}
