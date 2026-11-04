use crate::{assets, backup, config, error::Result, model::*, storage, workspace};
use serde_json::{json, Value};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::fs;

async fn database(root: &std::path::Path) -> sqlx::SqlitePool {
    let pool = SqlitePoolOptions::new()
        .max_connections(4)
        .connect_with(
            SqliteConnectOptions::new()
                .filename(root.join("test.sqlite"))
                .create_if_missing(true)
                .foreign_keys(true),
        )
        .await
        .unwrap();
    sqlx::migrate::Migrator::new(std::path::Path::new(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/migrations"
    )))
    .await
    .unwrap()
    .run(&pool)
    .await
    .unwrap();
    pool
}

fn create(id: &str, collection: &str) -> Operation {
    serde_json::from_value(json!({"type":"create", "id":id, "collection":collection,
        "data":{"payload":{"title":"test", "nested":{"score":2}}, "tags":["focus"], "businessDate":"2026-10-30"}})).unwrap()
}

async fn records(pool: &sqlx::SqlitePool, collection: &str) -> Vec<Record> {
    storage::query(
        pool,
        serde_json::from_value(json!({"collection":collection})).unwrap(),
    )
    .await
    .unwrap()
}

#[test]
fn batch_rollback_and_revision_conflict() {
    tauri::async_runtime::block_on(async {
        let dir = tempfile::tempdir().unwrap();
        let pool = database(dir.path()).await;
        let error = storage::batch(
            &pool,
            vec![
                create("one", "tasks"),
                create("two", "notes"),
                create("three", "tasks"),
                create("one", "tasks"),
            ],
        )
        .await
        .unwrap_err();
        assert_eq!(error.code, "CONFLICT");
        assert_eq!(error.context.operation_index, Some(3));
        assert!(records(&pool, "tasks").await.is_empty());
        assert!(records(&pool, "notes").await.is_empty());
        storage::batch(&pool, vec![create("one", "custom")])
            .await
            .unwrap();
        let initial = records(&pool, "custom").await.remove(0);
        let update = || {
            serde_json::from_value(json!({"type":"update", "id":"one", "expectedUpdatedAt":initial.updated_at, "data":{"payload":{"changed":true}}})).unwrap()
        };
        storage::batch(&pool, vec![update()]).await.unwrap();
        assert_eq!(
            storage::batch(&pool, vec![update()])
                .await
                .unwrap_err()
                .code,
            "CONFLICT"
        );
        pool.close().await;
        let reopened = database(dir.path()).await;
        assert_eq!(
            records(&reopened, "custom").await[0].data.payload,
            json!({"changed":true})
        );
        reopened.close().await;
    });
}

#[test]
fn query_nested_payload_and_parameter_binding() {
    tauri::async_runtime::block_on(async {
        let dir = tempfile::tempdir().unwrap();
        let pool = database(dir.path()).await;
        storage::batch(&pool, vec![create("one", "tasks"), create("two", "notes")])
            .await
            .unwrap();
        let query: RecordQuery = serde_json::from_value(json!({"collection":"tasks", "tags":["focus"], "businessDate":"2026-10-30", "filters":[{"path":["nested","score"], "value":2}]})).unwrap();
        assert_eq!(storage::query(&pool, query).await.unwrap().len(), 1);
        let query: RecordQuery = serde_json::from_value(
            json!({"collection":"tasks", "filters":[{"path":["title"], "value":"' OR 1=1 --"}]}),
        )
        .unwrap();
        assert!(storage::query(&pool, query).await.unwrap().is_empty());
        assert_eq!(
            storage::query(
                &pool,
                serde_json::from_value(json!({"collection":"tasks", "limit":1001})).unwrap()
            )
            .await
            .unwrap_err()
            .code,
            "VALIDATION"
        );
        pool.close().await;
    });
}

#[test]
fn query_json_semantics_and_hyphen_paths() {
    tauri::async_runtime::block_on(async {
        let dir = tempfile::tempdir().unwrap();
        let pool = database(dir.path()).await;
        let create_record = |id: &str, payload: Value| -> Operation {
            serde_json::from_value(json!({
                "type": "create",
                "id": id,
                "collection": "items",
                "data": { "payload": payload }
            }))
            .unwrap()
        };
        storage::batch(
            &pool,
            vec![
                create_record("with-null", json!({"status": null})),
                create_record("missing-key", json!({})),
                create_record("bool-true", json!({"flag": true})),
                create_record("int-one", json!({"flag": 1})),
                create_record("float-one", json!({"flag": 1.0})),
                create_record(
                    "hyphen-key",
                    json!({"due-date": "2026-11-01", "nested": {"sub-key": 42}}),
                ),
                create_record(
                    "unicode-key",
                    json!({"标题": "读书", "详情": {"完成-日期": "2026-11-01"}}),
                ),
            ],
        )
        .await
        .unwrap();

        // 1. null matching must match explicit null and NOT missing key
        let query_null: RecordQuery = serde_json::from_value(
            json!({"collection": "items", "filters": [{"path": ["status"], "value": null}]}),
        )
        .unwrap();
        let results = storage::query(&pool, query_null).await.unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "with-null");

        // 2. bool true must NOT match integer 1
        let query_bool: RecordQuery = serde_json::from_value(
            json!({"collection": "items", "filters": [{"path": ["flag"], "value": true}]}),
        )
        .unwrap();
        let results = storage::query(&pool, query_bool).await.unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "bool-true");

        // 3. integer 1 must match both 1 and 1.0, but NOT bool true
        let query_num: RecordQuery = serde_json::from_value(
            json!({"collection": "items", "filters": [{"path": ["flag"], "value": 1}]}),
        )
        .unwrap();
        let mut num_ids: Vec<String> = storage::query(&pool, query_num)
            .await
            .unwrap()
            .into_iter()
            .map(|r| r.id)
            .collect();
        num_ids.sort();
        assert_eq!(num_ids, vec!["float-one", "int-one"]);

        // 4. hyphenated JSONPath keys
        let query_hyphen: RecordQuery = serde_json::from_value(
            json!({"collection": "items", "filters": [{"path": ["due-date"], "value": "2026-11-01"}]}),
        )
        .unwrap();
        let results = storage::query(&pool, query_hyphen).await.unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "hyphen-key");

        for (path, value) in [
            (json!(["标题"]), json!("读书")),
            (json!(["详情", "完成-日期"]), json!("2026-11-01")),
        ] {
            let query = serde_json::from_value(
                json!({"collection":"items", "filters":[{"path":path,"value":value}]}),
            )
            .unwrap();
            let results = storage::query(&pool, query).await.unwrap();
            assert_eq!(results.len(), 1);
            assert_eq!(results[0].id, "unicode-key");
        }

        let query_nested_hyphen: RecordQuery = serde_json::from_value(
            json!({"collection": "items", "filters": [{"path": ["nested", "sub-key"], "value": 42}]}),
        )
        .unwrap();
        let results = storage::query(&pool, query_nested_hyphen).await.unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "hyphen-key");

        pool.close().await;
    });
}

#[test]
fn request_errors_identify_the_command() {
    for request in [
        None,
        Some(json!({"collection":123})),
        Some(json!({"unexpected":true})),
    ] {
        let error = crate::gateway::parse_request::<RecordQuery>(request, "records_query")
            .err()
            .unwrap();
        assert_eq!(error.code, "VALIDATION");
        assert_eq!(error.context.operation, "records_query");
    }
}

#[test]
fn window_patch_validates_before_application_and_resets_null_fields() {
    let mut current: config::WindowConfig =
        serde_json::from_value(config::defaults()["window"].clone()).unwrap();
    current.resizable = false;
    current.mode = config::WindowMode::Sidebar;
    assert!(
        current
            .patched(&json!({"resizable":null}))
            .unwrap()
            .resizable
    );
    assert_eq!(
        current.patched(&json!({"mode":null})).unwrap().mode,
        config::WindowMode::Panel
    );
    assert_eq!(
        current.patched(&json!({"width": null})).unwrap().width,
        360.0
    );
    for patch in [
        json!([]),
        json!(null),
        json!({"resizable":"wrong"}),
        json!({"rememberBounds":123}),
        json!({"width":-1}),
        json!({"unknown":true}),
    ] {
        assert_eq!(current.patched(&patch).err().unwrap().code, "VALIDATION");
    }
    assert!(!current.resizable);
}

#[test]
fn delete_validation_order_and_bounds_fault_tolerance() {
    tauri::async_runtime::block_on(async {
        let dir = tempfile::tempdir().unwrap();
        let pool = database(dir.path()).await;

        // Delete with invalid identifier returns VALIDATION error before querying DB
        let invalid_delete: Operation = serde_json::from_value(json!({
            "type": "delete",
            "id": "bad identifier with spaces!",
        }))
        .unwrap();
        let err = storage::batch(&pool, vec![invalid_delete])
            .await
            .unwrap_err();
        assert_eq!(err.code, "VALIDATION");
        assert_eq!(err.context.operation_index, Some(0));

        // WindowManager gracefully handles corrupted window-bounds.json
        let bounds_path = dir.path().join("window-bounds.json");
        fs::write(&bounds_path, "not a valid json {[[[").unwrap();
        let loaded = crate::window::WindowManager::load_bounds(&bounds_path);
        assert!(loaded.is_empty());

        // Corrupted dimension slots (e.g. width < 280) are discarded, valid offscreen retained
        let corrupt_json = json!({
            "panel": { "x": 100, "y": 100, "width": 50.0, "height": 760.0 },
            "sidebar": { "x": -2000, "y": 100, "width": 360.0, "height": 760.0 }
        });
        fs::write(&bounds_path, serde_json::to_vec(&corrupt_json).unwrap()).unwrap();
        let loaded = crate::window::WindowManager::load_bounds(&bounds_path);
        assert!(!loaded.contains_key("panel"));
        assert!(loaded.contains_key("sidebar"));
        assert_eq!(loaded["sidebar"].x, -2000);
        assert_eq!(loaded["sidebar"].width, 360.0);

        pool.close().await;
    });
}

fn png() -> Vec<u8> {
    let mut bytes = std::io::Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(2, 3)
        .write_to(&mut bytes, image::ImageFormat::Png)
        .unwrap();
    bytes.into_inner()
}

#[test]
fn full_backup_roundtrip_and_invalid_restore_preserves_data() {
    tauri::async_runtime::block_on(async {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let pool = database(dir.path()).await;
        let bytes = png();
        let image = assets::inspect(&bytes, "image-one".to_owned()).unwrap();
        let key = assets::write(&root, &bytes).unwrap();
        storage::insert_asset(&mut pool.acquire().await.unwrap(), &image, &key)
            .await
            .unwrap();
        let operation = serde_json::from_value(json!({"type":"create", "collection":"tasks", "id":"one", "data":{"payload":{"title":"with image"}, "assetIds":["image-one"]}})).unwrap();
        storage::batch(&pool, vec![operation]).await.unwrap();
        let mut tx = pool.begin().await.unwrap();
        assert!(sqlx::query("DELETE FROM assets WHERE id='image-one'")
            .execute(&mut *tx)
            .await
            .is_err());
        tx.rollback().await.unwrap();
        let full = backup::export(&pool, &root, true).await.unwrap();
        let serialized = serde_json::to_value(full).unwrap();
        // Confirm the public JSON shape also deserializes, including flattened envelopes.
        let full: Backup = serde_json::from_value(serialized.clone()).unwrap();
        assert_eq!(
            backup::validate(&pool, &root, &full)
                .await
                .unwrap()
                .asset_count,
            1
        );
        let mut invalid = serialized.clone();
        invalid["schemaVersion"] = json!(999);
        assert_eq!(
            backup::restore(&pool, &root, serde_json::from_value(invalid).unwrap())
                .await
                .unwrap_err()
                .code,
            "UNSUPPORTED_VERSION"
        );
        let mut invalid = serialized.clone();
        invalid["assets"][0]["bytes"] = json!([0, 1, 2]);
        assert_eq!(
            backup::restore(&pool, &root, serde_json::from_value(invalid).unwrap())
                .await
                .unwrap_err()
                .code,
            "VALIDATION"
        );
        assert_eq!(records(&pool, "tasks").await.len(), 1);
        backup::clear(&pool, &root).await.unwrap();
        assert!(records(&pool, "tasks").await.is_empty());
        backup::restore(&pool, &root, full).await.unwrap();
        let restored = records(&pool, "tasks").await;
        assert_eq!(restored[0].data.asset_ids, vec!["image-one"]);
        let (_, restored_key) = storage::asset(&mut pool.acquire().await.unwrap(), "image-one")
            .await
            .unwrap();
        assert_eq!(
            fs::read(assets::path(&root, &restored_key).unwrap()).unwrap(),
            bytes
        );
        pool.close().await;
        // Full bundles restore on another machine without any previous files or metadata.
        let other = tempfile::tempdir().unwrap();
        let other_pool = database(other.path()).await;
        backup::restore(
            &other_pool,
            &other.path().canonicalize().unwrap(),
            serde_json::from_value(serialized).unwrap(),
        )
        .await
        .unwrap();
        assert_eq!(records(&other_pool, "tasks").await.len(), 1);
        other_pool.close().await;
    });
}

#[test]
fn config_merges_defaults_and_failed_write_keeps_previous() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("config.json");
    let store = config::ConfigStore::open(path.clone()).unwrap();
    let next = store.update("window", Some(&json!({"width":420}))).unwrap();
    assert_eq!(next["window"]["width"], 420.0);
    assert_eq!(next["window"]["rememberBounds"], true);
    assert_eq!(
        store
            .update("window", Some(&json!({"width":-5})))
            .unwrap_err()
            .code,
        "VALIDATION"
    );
    assert_eq!(store.get().unwrap(), next);
    assert_eq!(
        store
            .update("window", Some(&json!({"width":null})))
            .unwrap()["window"]["width"],
        1100.0
    );
    let updated_sidebar = store
        .update("window", Some(&json!({"mode": "sidebar", "width": null})))
        .unwrap();
    assert_eq!(updated_sidebar["window"]["mode"], "sidebar");
    assert_eq!(updated_sidebar["window"]["width"], 360.0);
    store
        .update("workbench", Some(&json!({"tokens":{"accent":"green"}})))
        .unwrap();
    assert_eq!(
        config::ConfigStore::open(path).unwrap().get().unwrap()["workbench"]["tokens"]["accent"],
        "green"
    );
    let sidebar_dir = tempfile::tempdir().unwrap();
    let sidebar_cfg_path = sidebar_dir.path().join("config.json");
    fs::write(
        &sidebar_cfg_path,
        serde_json::to_vec(&json!({"window": {"mode": "sidebar"}})).unwrap(),
    )
    .unwrap();
    let sidebar_store = config::ConfigStore::open(sidebar_cfg_path).unwrap();
    assert_eq!(sidebar_store.get().unwrap()["window"]["width"], 360.0);
    let blocked = dir.path().join("blocked");
    fs::create_dir(&blocked).unwrap();
    let failed: Result<()> = config::atomic_json(&blocked, &json!({}));
    let error = failed.unwrap_err();
    assert_eq!(error.code, "IO");
    assert!(!serde_json::to_string(&error)
        .unwrap()
        .contains(&dir.path().to_string_lossy().to_string()));
}

#[test]
fn workspace_paths_and_empty_initialization() {
    let dir = tempfile::tempdir().unwrap();
    let root = workspace::initialize(dir.path().join("web"), |root| {
        fs::write(root.join("index.html"), "template")?;
        Ok(())
    })
    .unwrap();
    assert!(workspace::resolve(&root, "/")
        .unwrap()
        .ends_with("index.html"));
    assert_eq!(
        workspace::resolve(&root, "/missing.js").unwrap_err().code,
        "NOT_FOUND"
    );
    let subdir = root.join("existing_dir");
    fs::create_dir(&subdir).unwrap();
    assert_eq!(
        workspace::resolve(&root, "/existing_dir").unwrap_err().code,
        "NOT_FOUND"
    );
    assert_eq!(
        workspace::resolve(&root, "/existing_dir/")
            .unwrap_err()
            .code,
        "NOT_FOUND"
    );
    fs::write(root.join("index.html"), "custom").unwrap();
    workspace::initialize(root.clone(), |_| panic!("不得覆盖非空工作区")).unwrap();
    assert_eq!(
        fs::read_to_string(root.join("index.html")).unwrap(),
        "custom"
    );
    for path in [
        "/../secret",
        "/%2e%2e/secret",
        "/C:/Windows/win.ini",
        "/..%5csecret",
        "//server/share",
        "/%00",
    ] {
        let err = workspace::resolve(&root, path).unwrap_err();
        assert_eq!(err.code, "PERMISSION_DENIED", "{path}");
    }
    assert!(!workspace::is_local_navigation(
        &"https://example.com".parse().unwrap()
    ));
    assert!(workspace::is_local_navigation(
        &"http://workbench.localhost/index.html".parse().unwrap()
    ));
    assert_eq!(
        assets::inspect(b"not an image", "one".to_owned())
            .unwrap_err()
            .code,
        "VALIDATION"
    );
    assert_eq!(assets::inspect(&png(), "one".to_owned()).unwrap().height, 3);
}

#[test]
fn capability_exposes_only_p0_commands() {
    let capability: Value =
        serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
    assert_eq!(capability["windows"], json!(["main"]));
    for permission in capability["permissions"].as_array().unwrap() {
        let permission = permission.as_str().unwrap();
        assert!(
            !permission.starts_with("sql:")
                && !permission.starts_with("fs:")
                && permission != "core:default"
        );
    }
}
