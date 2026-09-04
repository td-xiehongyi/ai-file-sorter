use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;

use ai_file_organizer_lib::ai::openai_compatible::OpenAiCompatibleProvider;
use ai_file_organizer_lib::ai::{AiProvider, ProviderAnalysisRequest};
use ai_file_organizer_lib::models::ai::Category;
use ai_file_organizer_lib::models::ai_provider::{AiProviderConfig, ProviderKind};

fn serve_once(
    response_body: &'static str,
    status: &'static str,
) -> (String, thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let handle = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut request = Vec::new();
        let mut buffer = [0_u8; 4096];
        loop {
            let read = stream.read(&mut buffer).unwrap();
            if read == 0 {
                break;
            }
            request.extend_from_slice(&buffer[..read]);
            if let Some(header_end) = request.windows(4).position(|window| window == b"\r\n\r\n") {
                let headers = String::from_utf8_lossy(&request[..header_end]);
                let length = headers
                    .lines()
                    .find_map(|line| {
                        line.to_ascii_lowercase()
                            .strip_prefix("content-length: ")
                            .and_then(|value| value.parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                if request.len() >= header_end + 4 + length {
                    break;
                }
            }
        }
        let response = format!(
            "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            response_body.len(),
            response_body
        );
        stream.write_all(response.as_bytes()).unwrap();
        String::from_utf8(request).unwrap()
    });
    (format!("http://{address}/v1"), handle)
}

fn config(base_url: &str) -> AiProviderConfig {
    AiProviderConfig {
        id: "remote".into(),
        kind: ProviderKind::OpenAiCompatible,
        display_name: "兼容 API".into(),
        base_url: base_url.into(),
        model: "gpt-test".into(),
        enabled: true,
    }
}

fn request() -> ProviderAnalysisRequest {
    ProviderAnalysisRequest {
        filename: "notes.md".into(),
        language: Some("Markdown".into()),
        text: "项目会议纪要".into(),
        categories: vec![Category {
            id: "work".into(),
            name: "工作".into(),
            description: "工作资料".into(),
            directory_path: r"C:\organized\work".into(),
            enabled: true,
        }],
    }
}

#[test]
fn health_check_uses_models_endpoint_and_bearer_authentication() {
    let (endpoint, server) = serve_once(r#"{"data":[{"id":"gpt-test"}]}"#, "200 OK");
    let provider = OpenAiCompatibleProvider::new(config(&endpoint), "test-secret".into()).unwrap();

    let status = provider.health().unwrap();

    assert!(status.available);
    assert_eq!(status.provider, "open_ai_compatible");
    assert_eq!(status.model, "gpt-test");
    let wire_request = server.join().unwrap();
    assert!(wire_request.starts_with("GET /v1/models"));
    assert!(
        wire_request
            .to_ascii_lowercase()
            .contains("authorization: bearer test-secret")
    );
}

#[test]
fn analysis_sends_openai_messages_and_parses_closed_suggestion() {
    let content = r#"{"summary":"会议纪要","keywords":["项目"],"suggested_filename":"项目会议.md","category_id":"work","confidence":0.9,"reason":"属于工作资料"}"#;
    let body = format!(r#"{{"choices":[{{"message":{{"content":{content:?}}}}}]}}"#);
    let leaked: &'static str = Box::leak(body.into_boxed_str());
    let (endpoint, server) = serve_once(leaked, "200 OK");
    let provider = OpenAiCompatibleProvider::new(config(&endpoint), "test-secret".into()).unwrap();

    let result = provider.analyze(&request()).unwrap();

    assert_eq!(result.category_id.as_deref(), Some("work"));
    let wire_request = server.join().unwrap();
    assert!(wire_request.starts_with("POST /v1/chat/completions"));
    assert!(
        wire_request
            .to_ascii_lowercase()
            .contains("authorization: bearer test-secret")
    );
    assert!(wire_request.contains("\"model\":\"gpt-test\""));
    assert!(wire_request.contains("项目会议纪要"));
    assert!(wire_request.contains("response_format"));
}

#[test]
fn provider_errors_do_not_echo_the_api_key_or_request_body() {
    let (endpoint, server) = serve_once(r#"{"error":"bad request"}"#, "500 Internal Server Error");
    let provider = OpenAiCompatibleProvider::new(config(&endpoint), "test-secret".into()).unwrap();

    let error = provider.health().unwrap_err();

    assert!(error.contains("HTTP 500"));
    assert!(!error.contains("test-secret"));
    assert!(!error.contains("bad request"));
    server.join().unwrap();
}
