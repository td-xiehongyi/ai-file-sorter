use std::io::Read;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::services::path_policy;

#[derive(Debug, Clone, Copy)]
pub struct ExtractionLimits {
    pub max_characters: usize,
    pub max_bytes: u64,
    pub max_archive_entries: usize,
    pub max_archive_entry_bytes: u64,
    pub max_archive_total_bytes: u64,
}

impl Default for ExtractionLimits {
    fn default() -> Self {
        Self {
            max_characters: 100_000,
            max_bytes: 20 * 1024 * 1024,
            max_archive_entries: 2_048,
            max_archive_entry_bytes: 8 * 1024 * 1024,
            max_archive_total_bytes: 32 * 1024 * 1024,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ExtractedDocument {
    pub source_path: PathBuf,
    pub text: String,
    pub content_fingerprint: String,
}

pub fn is_supported_text_document(path: &Path) -> bool {
    let filename = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if matches!(
        filename.as_str(),
        "dockerfile" | "makefile" | "cmakelists.txt"
    ) {
        return true;
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    matches!(
        extension.as_str(),
        "txt"
            | "md"
            | "pdf"
            | "docx"
            | "c"
            | "h"
            | "cc"
            | "cpp"
            | "cxx"
            | "hpp"
            | "hxx"
            | "cs"
            | "java"
            | "kt"
            | "kts"
            | "go"
            | "rs"
            | "py"
            | "pyw"
            | "js"
            | "jsx"
            | "mjs"
            | "cjs"
            | "ts"
            | "tsx"
            | "php"
            | "rb"
            | "swift"
            | "dart"
            | "lua"
            | "r"
            | "sh"
            | "bash"
            | "zsh"
            | "fish"
            | "ps1"
            | "sql"
            | "html"
            | "htm"
            | "css"
            | "scss"
            | "less"
            | "json"
            | "jsonc"
            | "yaml"
            | "yml"
            | "toml"
            | "xml"
            | "ini"
            | "conf"
            | "properties"
    )
}

pub fn document_language(path: &Path) -> Option<&'static str> {
    let filename = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if filename == "dockerfile" {
        return Some("Dockerfile");
    }
    if filename == "makefile" {
        return Some("Makefile");
    }
    if filename == "cmakelists.txt" {
        return Some("CMake");
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    Some(match extension.as_str() {
        "txt" => "Plain text",
        "md" => "Markdown",
        "pdf" => "PDF",
        "docx" => "DOCX",
        "c" | "h" => "C",
        "cc" | "cpp" | "cxx" | "hpp" | "hxx" => "C++",
        "cs" => "C#",
        "java" => "Java",
        "kt" | "kts" => "Kotlin",
        "go" => "Go",
        "rs" => "Rust",
        "py" | "pyw" => "Python",
        "js" | "jsx" | "mjs" | "cjs" => "JavaScript",
        "ts" | "tsx" => "TypeScript",
        "php" => "PHP",
        "rb" => "Ruby",
        "swift" => "Swift",
        "dart" => "Dart",
        "lua" => "Lua",
        "r" => "R",
        "sh" | "bash" | "zsh" | "fish" => "Shell",
        "ps1" => "PowerShell",
        "sql" => "SQL",
        "html" | "htm" => "HTML",
        "css" | "scss" | "less" => "CSS",
        "json" | "jsonc" => "JSON",
        "yaml" | "yml" => "YAML",
        "toml" => "TOML",
        "xml" => "XML",
        "ini" | "conf" | "properties" => "Configuration",
        _ => return None,
    })
}

pub fn extract_document(
    root: &Path,
    source: &Path,
    limits: ExtractionLimits,
) -> Result<ExtractedDocument, String> {
    let (source, metadata) = resolve_authorized_source(root, source)?;
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if metadata.len() > limits.max_bytes {
        return Err("文件字节大小超过内容分析资源上限".into());
    }
    let (bytes, fingerprint) = read_limited_and_fingerprint(&source, limits.max_bytes)?;
    let text = match extension.as_str() {
        "txt" | "md" | "c" | "h" | "cc" | "cpp" | "cxx" | "hpp" | "hxx" | "cs" | "java" | "kt"
        | "kts" | "go" | "rs" | "py" | "pyw" | "js" | "jsx" | "mjs" | "cjs" | "ts" | "tsx"
        | "php" | "rb" | "swift" | "dart" | "lua" | "r" | "sh" | "bash" | "zsh" | "fish"
        | "ps1" | "sql" | "html" | "htm" | "css" | "scss" | "less" | "json" | "jsonc" | "yaml"
        | "yml" | "toml" | "xml" | "ini" | "conf" | "properties" => decode_text(&bytes)?,
        "pdf" => extract_pdf(&bytes)?,
        "docx" => extract_docx(&bytes, limits)?,
        _ if is_supported_text_document(&source) => decode_text(&bytes)?,
        _ => return Err("当前提取器尚不支持此文件格式".into()),
    };
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err("文件正文为空，无法分析".into());
    }
    if text.chars().count() > limits.max_characters {
        return Err("文件正文超过内容分析资源上限".into());
    }
    Ok(ExtractedDocument {
        source_path: source,
        text,
        content_fingerprint: fingerprint,
    })
}

fn reject_link_components(root: &Path, source: &Path) -> Result<(), String> {
    if !source.starts_with(root) || source == root {
        return Err("文件不在当前授权目录内".into());
    }
    let relative = source
        .strip_prefix(root)
        .map_err(|_| "文件不在当前授权目录内".to_string())?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        current.push(component);
        let metadata = std::fs::symlink_metadata(&current)
            .map_err(|error| format!("无法读取文件状态：{error}"))?;
        if metadata.file_type().is_symlink() {
            return Err("内容分析不允许通过符号链接或目录链接读取文件".into());
        }
    }
    Ok(())
}

fn read_limited_and_fingerprint(path: &Path, max_bytes: u64) -> Result<(Vec<u8>, String), String> {
    let file = std::fs::File::open(path).map_err(|error| format!("无法读取文件正文：{error}"))?;
    let mut reader = file.take(max_bytes.saturating_add(1));
    let mut bytes = Vec::new();
    reader
        .read_to_end(&mut bytes)
        .map_err(|error| format!("无法读取文件正文：{error}"))?;
    if bytes.len() as u64 > max_bytes {
        return Err("文件字节大小超过内容分析资源上限".into());
    }
    let fingerprint = format!("{:x}", Sha256::digest(&bytes));
    Ok((bytes, fingerprint))
}

pub fn fingerprint_file(path: &Path) -> Result<String, String> {
    let metadata = std::fs::symlink_metadata(path)
        .map_err(|error| format!("无法读取文件以复核内容指纹：{error}"))?;
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
        return Err("内容指纹复核只支持普通文件".into());
    }
    if metadata.len() > ExtractionLimits::default().max_bytes {
        return Err("文件字节大小超过内容指纹复核资源上限".into());
    }
    let mut file = std::fs::File::open(path)
        .map_err(|error| format!("无法读取文件以复核内容指纹：{error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("无法读取文件以复核内容指纹：{error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

pub fn fingerprint_authorized_file(root: &Path, source: &Path) -> Result<String, String> {
    let (source, metadata) = resolve_authorized_source(root, source)?;
    if metadata.len() > ExtractionLimits::default().max_bytes {
        return Err("文件字节大小超过内容指纹复核资源上限".into());
    }
    fingerprint_file(&source)
}

fn resolve_authorized_source(
    root: &Path,
    source: &Path,
) -> Result<(PathBuf, std::fs::Metadata), String> {
    let requested_root = root.to_path_buf();
    let root = path_policy::normalize_root(root)?;
    let unresolved_source = if source.is_absolute() {
        source.to_path_buf()
    } else {
        requested_root.join(source)
    };
    let lexical_root = if unresolved_source.starts_with(&root) {
        &root
    } else {
        &requested_root
    };
    reject_link_components(lexical_root, &unresolved_source)?;
    let source = std::fs::canonicalize(&unresolved_source)
        .map_err(|error| format!("无法读取所选文件：{error}"))?;
    if !source.starts_with(&root) || source == root {
        return Err("文件不在当前授权目录内".into());
    }
    let metadata =
        std::fs::symlink_metadata(&source).map_err(|error| format!("无法读取文件状态：{error}"))?;
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
        return Err("内容分析只支持授权目录内的普通文件".into());
    }
    Ok((source, metadata))
}

fn extract_pdf(bytes: &[u8]) -> Result<String, String> {
    if !bytes.starts_with(b"%PDF-") {
        return Err("文件扩展名与真实 PDF 格式不符".into());
    }
    pdf_extract::extract_text_from_mem(bytes)
        .map_err(|error| format!("PDF 已加密、损坏或无法提取正文：{error}"))
}

fn extract_docx(bytes: &[u8], limits: ExtractionLimits) -> Result<String, String> {
    if !bytes.starts_with(b"PK") {
        return Err("文件扩展名与真实 DOCX 格式不符".into());
    }
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes))
        .map_err(|error| format!("DOCX 已损坏或无法读取：{error}"))?;
    if archive.len() > limits.max_archive_entries {
        return Err("DOCX 条目数量超过内容分析资源上限".into());
    }
    let mut total_size = 0_u64;
    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|error| format!("DOCX 已损坏或无法读取：{error}"))?;
        let size = entry.size();
        if size > limits.max_archive_entry_bytes {
            return Err("DOCX 单个条目展开大小超过内容分析资源上限".into());
        }
        total_size = total_size
            .checked_add(size)
            .ok_or_else(|| "DOCX 累计展开大小超过内容分析资源上限".to_string())?;
        if total_size > limits.max_archive_total_bytes {
            return Err("DOCX 累计展开大小超过内容分析资源上限".into());
        }
    }
    let document = archive
        .by_name("word/document.xml")
        .map_err(|_| "DOCX 缺少正文文档，可能已损坏或格式伪装".to_string())?;
    let mut xml = String::new();
    document
        .take(limits.max_archive_entry_bytes.saturating_add(1))
        .read_to_string(&mut xml)
        .map_err(|error| format!("DOCX 正文不是有效的 UTF-8 XML：{error}"))?;
    if xml.len() as u64 > limits.max_archive_entry_bytes {
        return Err("DOCX 正文展开大小超过内容分析资源上限".into());
    }
    extract_docx_xml(&xml)
}

fn extract_docx_xml(xml: &str) -> Result<String, String> {
    use quick_xml::events::Event;

    let mut reader = quick_xml::Reader::from_str(xml);
    reader.config_mut().trim_text(false);
    let mut output = String::new();
    let mut inside_text = false;
    loop {
        match reader.read_event() {
            Ok(Event::Start(start)) => {
                inside_text = start.local_name().as_ref() == b"t";
                if start.local_name().as_ref() == b"p" && !output.is_empty() {
                    output.push('\n');
                }
            }
            Ok(Event::End(end)) if end.local_name().as_ref() == b"t" => inside_text = false,
            Ok(Event::Text(text)) if inside_text => output.push_str(
                &text
                    .decode()
                    .map_err(|error| format!("DOCX 正文解码失败：{error}"))?,
            ),
            Ok(Event::Eof) => break,
            Ok(_) => {}
            Err(error) => return Err(format!("DOCX 正文 XML 无效：{error}")),
        }
    }
    Ok(output)
}

fn decode_text(bytes: &[u8]) -> Result<String, String> {
    if bytes.starts_with(&[0xef, 0xbb, 0xbf]) {
        return String::from_utf8(bytes[3..].to_vec())
            .map_err(|_| "文件不是有效的 UTF-8 文本".into());
    }
    if bytes.starts_with(&[0xff, 0xfe]) {
        return decode_utf16(&bytes[2..], true);
    }
    if bytes.starts_with(&[0xfe, 0xff]) {
        return decode_utf16(&bytes[2..], false);
    }
    String::from_utf8(bytes.to_vec()).map_err(|_| "文件不是有效的 UTF-8 文本".into())
}

fn decode_utf16(bytes: &[u8], little_endian: bool) -> Result<String, String> {
    if !bytes.len().is_multiple_of(2) {
        return Err("UTF-16 文件字节数无效".into());
    }
    let units = bytes.as_chunks::<2>().0.iter().map(|pair| {
        if little_endian {
            u16::from_le_bytes([pair[0], pair[1]])
        } else {
            u16::from_be_bytes([pair[0], pair[1]])
        }
    });
    char::decode_utf16(units)
        .collect::<Result<String, _>>()
        .map_err(|_| "文件不是有效的 UTF-16 文本".into())
}
