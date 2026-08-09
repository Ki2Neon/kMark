mod discovery;
mod locator;
mod rest_client;
mod server;

use rmcp::ServiceExt;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let server = server::KmarkMcpServer::new(discovery::DiscoveryStore::from_environment()?);
    let service = server.serve(rmcp::transport::stdio()).await?;
    service.waiting().await?;
    Ok(())
}
