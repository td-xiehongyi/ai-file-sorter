mod commands;
mod models;
mod services;
mod storage;

pub fn app_builder<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    app_builder(tauri::Builder::default())
        .run(tauri::generate_context!())
        .expect("error while running AI File Organizer");
}
