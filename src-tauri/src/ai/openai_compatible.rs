use std::time::Duration;

use serde_json::json;

use crate::ai::ollama::suggestion_schema;
use crate::ai::{AiProvider, PROMPT_VERSION, ProviderAnalysisRequest, ProviderStatus};
use crate::models::ai::AiSuggestionPayload;
use crate::models::ai_provider::{AiProviderConfig, ProviderKind, validate_provider_config};

pub struct OpenAiCompatibleProvider {
    base_url: reqwest::Url,
    model: String,
    api_key: String,
    client: reqwest::blocking::Client,
}

impl OpenAiCompatibleProvider {
    pub fn new(config: AiProviderConfig, api_key: String) -> Result<Self, String> {
        if config.kind != ProviderKind::OpenAiCompatible {
            return Err("Provider 类型不是 OpenAI 兼容 API".into());
        }
        validate_provider_config(&config)?;
        if api_key.trim().is_empty() {
            return Err("API Key 不能为空".into());
        }
        let mut base_url =
            reqwest::Url::parse(config.base_url.trim()).map_err(|_| "API 地址无效".to_string())?;
        if !base_url.path().ends_with('/') {
            let path = format!("{}/", base_url.path());
            base_url.set_path(&path);
        }
        let client = reqwest::blocking::Client::builder()
            .connect_timeout(Duration::from_secs(3))
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|_| "无法初始化 API 客户端".to_string())?;
        Ok(Self {
            base_url,
            model: config.model,
            api_key,
            client,
        })
    }

    fn url(&self, path: &str) -> Result<reqwest::Url, String> {
        self.base_url
            .join(path)
            .map_err(|_| "无法构造 API 请求地址".to_string())
    }

    fn request_builder(
        &self,
        request: reqwest::blocking::RequestBuilder,
    ) -> reqwest::blocking::RequestBuilder {
        request.bearer_auth(&self.api_key)
    }
}

impl AiProvider for OpenAiCompatibleProvider {
    fn provider_id(&self) -> &'static str {
        "open_ai_compatible"
    }

    fn model(&self) -> &str {
        &self.model
    }

    fn health(&self) -> Result<ProviderStatus, String> {
        let response = self
            .request_builder(self.client.get(self.url("models")?))
            .send()
            .map_err(|_| "无法连接外部 API".to_string())?;
        if !response.status().is_success() {
            return Err(format!(
                "外部 API 健康检查失败：HTTP {}",
                response.status().as_u16()
            ));
        }
        let body: serde_json::Value = response
            .json()
            .map_err(|_| "外部 API 健康检查响应无效".to_string())?;
        let available = body["data"].as_array().is_some_and(|models| {
            models
                .iter()
                .any(|model| model["id"].as_str() == Some(&self.model))
        });
        Ok(ProviderStatus {
            available,
            provider: self.provider_id().into(),
            model: self.model.clone(),
            message: if available {
                "外部 API 模型已就绪".into()
            } else {
                "外部 API 可用，但未找到配置的模型".into()
            },
        })
    }

    fn analyze(&self, request: &ProviderAnalysisRequest) -> Result<AiSuggestionPayload, String> {
        let categories: Vec<_> = request
            .categories
            .iter()
            .filter(|category| category.enabled)
            .map(|category| {
                json!({
                    "id": category.id,
                    "name": category.name,
                    "description": category.description,
                })
            })
            .collect();
        let body = json!({
            "model": self.model,
            "stream": false,
            "temperature": 0.1,
            "max_tokens": 1024,
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "file_organizer_suggestion",
                    "strict": true,
                    "schema": suggestion_schema(),
                }
            },
            "messages": [
                {
                    "role": "system",
                    "content": format!("你是文件整理助手。输出必须完全符合 JSON Schema。摘要和理由使用中文；不得输出路径、创建目录或改变扩展名。根据文件语言类型理解正文：{}。提示词版本：{PROMPT_VERSION}", request.language.as_deref().unwrap_or("未知"))
                },
                {
                    "role": "user",
                    "content": format!("文件名：{}\n语言类型：{}\n可选分类：{}\n正文：\n{}", request.filename, request.language.as_deref().unwrap_or("未知"), serde_json::to_string(&categories).unwrap_or_else(|_| "[]".into()), request.text)
                }
            ]
        });
        let response = self
            .request_builder(self.client.post(self.url("chat/completions")?))
            .json(&body)
            .send()
            .map_err(|_| "外部 API 推理失败或超时".to_string())?;
        if !response.status().is_success() {
            return Err(format!(
                "外部 API 推理失败：HTTP {}",
                response.status().as_u16()
            ));
        }
        let response: serde_json::Value = response
            .json()
            .map_err(|_| "外部 API 响应不是有效 JSON".to_string())?;
        let content = response["choices"][0]["message"]["content"]
            .as_str()
            .ok_or_else(|| "外部 API 响应缺少 choices.message.content".to_string())?;
        serde_json::from_str(content).map_err(|_| "模型输出不符合封闭结构".into())
    }
}
