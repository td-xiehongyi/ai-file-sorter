use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use ai_file_organizer_lib::services::secret_store::SecretStore;

#[derive(Default, Clone)]
struct FakeSecretStore {
    values: Arc<Mutex<HashMap<(String, String), String>>>,
}

impl SecretStore for FakeSecretStore {
    fn get(&self, service: &str, account: &str) -> Result<Option<String>, String> {
        Ok(self
            .values
            .lock()
            .unwrap()
            .get(&(service.into(), account.into()))
            .cloned())
    }

    fn set(&self, service: &str, account: &str, value: &str) -> Result<(), String> {
        self.values
            .lock()
            .unwrap()
            .insert((service.into(), account.into()), value.into());
        Ok(())
    }

    fn delete(&self, service: &str, account: &str) -> Result<(), String> {
        self.values
            .lock()
            .unwrap()
            .remove(&(service.into(), account.into()));
        Ok(())
    }
}

#[test]
fn secret_store_round_trips_and_deletes_a_value() {
    let store = FakeSecretStore::default();

    store
        .set("ai-file-organizer", "default", "test-secret")
        .unwrap();
    assert_eq!(
        store.get("ai-file-organizer", "default").unwrap(),
        Some("test-secret".into())
    );
    store.delete("ai-file-organizer", "default").unwrap();
    assert_eq!(store.get("ai-file-organizer", "default").unwrap(), None);
}

#[test]
fn missing_secret_is_reported_as_no_value() {
    let store = FakeSecretStore::default();

    assert_eq!(store.get("ai-file-organizer", "missing").unwrap(), None);
}
