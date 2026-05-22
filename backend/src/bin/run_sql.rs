use sqlx::postgres::PgPoolOptions;
use std::env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    let db_url = env::var("DATABASE_URL").expect("DATABASE_URL missing");
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&db_url)
        .await?;

    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        println!("Usage: cargo run --bin run_sql \"<SQL query>\" or cargo run --bin run_sql --file <filepath>");
        return Ok(());
    }

    if args[1] == "--file" && args.len() >= 3 {
        let filepath = &args[2];
        println!("Running SQL from file: {}", filepath);
        let sql = std::fs::read_to_string(filepath)?;
        let mut tx = pool.begin().await?;
        sqlx::query(&sql).execute(&mut *tx).await?;
        tx.commit().await?;
        println!("SQL file executed successfully!");
    } else {
        let query = &args[1];
        println!("Running query: {}", query);
        let rows = sqlx::query(query).execute(&pool).await?;
        println!("Query executed successfully! Rows affected: {}", rows.rows_affected());
    }

    Ok(())
}
