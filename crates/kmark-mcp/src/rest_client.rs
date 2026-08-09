use std::time::Duration;

use kmark_api_contract::ApiErrorResponse;
use reqwest::{Method, StatusCode};
use serde::{de::DeserializeOwned, Serialize};

use crate::discovery::DiscoveryRecord;

#[derive(Clone)]
pub struct RestClient {
    client: reqwest::Client,
    record: DiscoveryRecord,
}

impl RestClient {
    pub fn new(record: DiscoveryRecord) -> Result<Self, RestClientError> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(RestClientError::Build)?;
        Ok(Self { client, record })
    }

    pub fn instance_id(&self) -> &str {
        &self.record.instance_id
    }

    pub async fn get<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, &str)],
    ) -> Result<T, RestClientError> {
        self.request::<(), T>(Method::GET, path, query, None).await
    }

    pub async fn post<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T, RestClientError> {
        self.request(Method::POST, path, &[], Some(body)).await
    }

    pub async fn get_bytes(&self, path: &str) -> Result<Vec<u8>, RestClientError> {
        if !path.starts_with('/') || path.contains("..") {
            return Err(RestClientError::InvalidPath);
        }
        let url = format!("{}{}", self.record.endpoint.trim_end_matches('/'), path);
        let response = self
            .client
            .get(url)
            .bearer_auth(&self.record.auth_token)
            .send()
            .await
            .map_err(RestClientError::Request)?;
        let status = response.status();
        let bytes = response.bytes().await.map_err(RestClientError::Request)?;
        if !status.is_success() {
            let api_error = serde_json::from_slice::<ApiErrorResponse>(&bytes).ok();
            return Err(RestClientError::Api {
                status,
                code: api_error
                    .as_ref()
                    .map(|error| error.code.clone())
                    .unwrap_or_else(|| "invalid_response".to_owned()),
                message: api_error
                    .map(|error| error.message)
                    .unwrap_or_else(|| "Kmark REST request failed".to_owned()),
            });
        }
        Ok(bytes.to_vec())
    }

    async fn request<B: Serialize, T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
        query: &[(&str, &str)],
        body: Option<&B>,
    ) -> Result<T, RestClientError> {
        if !path.starts_with('/') || path.contains("..") {
            return Err(RestClientError::InvalidPath);
        }
        let url = format!("{}{}", self.record.endpoint.trim_end_matches('/'), path);
        let mut request = self
            .client
            .request(method, url)
            .bearer_auth(&self.record.auth_token)
            .query(query);
        if let Some(body) = body {
            request = request.json(body);
        }
        let response = request.send().await.map_err(RestClientError::Request)?;
        let status = response.status();
        let bytes = response.bytes().await.map_err(RestClientError::Request)?;
        if !status.is_success() {
            let api_error = serde_json::from_slice::<ApiErrorResponse>(&bytes).ok();
            return Err(RestClientError::Api {
                status,
                code: api_error
                    .as_ref()
                    .map(|error| error.code.clone())
                    .unwrap_or_else(|| "invalid_response".to_owned()),
                message: api_error
                    .map(|error| error.message)
                    .unwrap_or_else(|| "Kmark REST request failed".to_owned()),
            });
        }
        serde_json::from_slice(&bytes).map_err(RestClientError::Decode)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum RestClientError {
    #[error("failed to build loopback REST client")]
    Build(#[source] reqwest::Error),
    #[error("invalid REST path")]
    InvalidPath,
    #[error("Kmark REST connection failed: {0}")]
    Request(#[source] reqwest::Error),
    #[error("Kmark REST response could not be decoded")]
    Decode(#[source] serde_json::Error),
    #[error("Kmark REST error {status}: {code}: {message}")]
    Api {
        status: StatusCode,
        code: String,
        message: String,
    },
}
