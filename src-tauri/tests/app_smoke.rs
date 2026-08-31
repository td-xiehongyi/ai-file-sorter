#[test]
fn application_builder_assembles_the_configured_main_window() {
    let app = ai_file_organizer_lib::app_builder(tauri::test::mock_builder())
        .build(tauri::generate_context!())
        .expect("application should assemble with the mock runtime");

    assert_eq!(
        app.config().product_name.as_deref(),
        Some("AI File Organizer")
    );
    assert!(
        app.config()
            .app
            .windows
            .iter()
            .any(|window| window.label == "main")
    );

    let dev_csp = app
        .config()
        .app
        .security
        .dev_csp
        .as_ref()
        .expect("development mode should have a Vite-compatible CSP")
        .to_string();
    assert!(dev_csp.contains("'unsafe-inline'"));
    assert!(dev_csp.contains("ws://localhost:1500"));
}
