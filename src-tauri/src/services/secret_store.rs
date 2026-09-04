pub const SECRET_SERVICE: &str = "ai-file-organizer";

pub trait SecretStore: Send + Sync {
    fn get(&self, service: &str, account: &str) -> Result<Option<String>, String>;
    fn set(&self, service: &str, account: &str, value: &str) -> Result<(), String>;
    fn delete(&self, service: &str, account: &str) -> Result<(), String>;
}

#[derive(Debug, Default, Clone, Copy)]
pub struct PlatformSecretStore;

impl SecretStore for PlatformSecretStore {
    fn get(&self, service: &str, account: &str) -> Result<Option<String>, String> {
        let entry = keyring::Entry::new(service, account)
            .map_err(|_| "无法访问系统凭据存储".to_string())?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err("无法读取系统凭据".into()),
        }
    }

    fn set(&self, service: &str, account: &str, value: &str) -> Result<(), String> {
        if value.trim().is_empty() {
            return Err("API Key 不能为空".into());
        }
        let entry = keyring::Entry::new(service, account)
            .map_err(|_| "无法访问系统凭据存储".to_string())?;
        entry
            .set_password(value)
            .map_err(|_| "无法保存 API Key 到系统凭据存储".into())
    }

    fn delete(&self, service: &str, account: &str) -> Result<(), String> {
        let entry = keyring::Entry::new(service, account)
            .map_err(|_| "无法访问系统凭据存储".to_string())?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err("无法删除系统凭据".into()),
        }
    }
}
