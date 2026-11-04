use super::*;

fn state() -> State {
    State {
        config: serde_json::from_value(crate::config::defaults()["window"].clone()).unwrap(),
        bounds: BTreeMap::from([(
            "panel".to_owned(),
            Bounds {
                x: 10,
                y: 20,
                width: 900.,
                height: 600.,
            },
        )]),
        applying: false,
        dirty: true,
        last_state: None,
    }
}

#[test]
fn failed_flush_remains_pending_for_close_retry() {
    let state = Mutex::new(state());
    let writer = Mutex::new(());
    let failed = persist_bounds(&state, &writer, |_| Err(HostError::new("IO", "保存失败")));
    assert_eq!(failed.unwrap_err().code, "IO");
    assert!(state.lock().unwrap().dirty);
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("bounds.json");
    persist_bounds(&state, &writer, |bounds| atomic_json(&path, bounds)).unwrap();
    assert!(!state.lock().unwrap().dirty);
    let saved: BTreeMap<String, Bounds> = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
    assert_eq!(saved["panel"].width, 900.);
}

#[test]
fn close_flush_follows_in_flight_write_and_saves_latest_bounds() {
    let state = Arc::new(Mutex::new(state()));
    let writer = Arc::new(Mutex::new(()));
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("bounds.json");
    let (started_tx, started_rx) = std::sync::mpsc::channel();
    let (resume_tx, resume_rx) = std::sync::mpsc::channel();

    let background_state = Arc::clone(&state);
    let background_writer = Arc::clone(&writer);
    let background_path = path.clone();
    let background = std::thread::spawn(move || {
        persist_bounds(&background_state, &background_writer, |bounds| {
            started_tx.send(()).unwrap();
            resume_rx.recv().unwrap();
            atomic_json(&background_path, bounds)
        })
        .unwrap();
    });
    started_rx.recv().unwrap();
    // While the old snapshot is being written, normal window capture stays available.
    {
        let mut state = state.lock().unwrap();
        state.bounds.get_mut("panel").unwrap().width = 1000.;
        state.dirty = true;
    }
    let close_state = Arc::clone(&state);
    let close_writer = Arc::clone(&writer);
    let close_path = path.clone();
    let close = std::thread::spawn(move || {
        persist_bounds(&close_state, &close_writer, |bounds| {
            atomic_json(&close_path, bounds)
        })
        .unwrap();
    });
    resume_tx.send(()).unwrap();
    background.join().unwrap();
    close.join().unwrap();
    assert!(!state.lock().unwrap().dirty);
    let saved: BTreeMap<String, Bounds> = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
    assert_eq!(saved["panel"].width, 1000.);
}

#[test]
fn plan_change_non_geometric_toggle_preserves_size() {
    let current = WindowConfig {
        mode: WindowMode::Panel,
        width: 1100.0,
        height: 760.0,
        resizable: true,
        remember_bounds: true,
    };
    let bounds = BTreeMap::new();

    // Toggle resizable
    let change = WindowChange {
        mode: WindowMode::Panel,
        width: None,
        height: None,
        resizable: false,
        remember_bounds: true,
    };
    let plan = plan_change(&current, &bounds, None, change).unwrap();
    assert_eq!(
        plan,
        PlannedChange::NonGeometric {
            declared: WindowConfig {
                mode: WindowMode::Panel,
                width: 1100.0,
                height: 760.0,
                resizable: false,
                remember_bounds: true,
            }
        }
    );

    // Toggle remember_bounds
    let change = WindowChange {
        mode: WindowMode::Panel,
        width: None,
        height: None,
        resizable: true,
        remember_bounds: false,
    };
    let plan = plan_change(&current, &bounds, None, change).unwrap();
    assert_eq!(
        plan,
        PlannedChange::NonGeometric {
            declared: WindowConfig {
                mode: WindowMode::Panel,
                width: 1100.0,
                height: 760.0,
                resizable: true,
                remember_bounds: false,
            }
        }
    );
}

#[test]
fn plan_change_mode_switch_without_size_uses_memory_without_polluting_declared() {
    let current = WindowConfig {
        mode: WindowMode::Panel,
        width: 1100.0,
        height: 760.0,
        resizable: true,
        remember_bounds: true,
    };
    let mut bounds = BTreeMap::new();
    bounds.insert(
        "sidebar".to_owned(),
        Bounds {
            x: 100,
            y: 150,
            width: 400.0,
            height: 800.0,
        },
    );

    // Mode switch with remember_bounds: true -> uses memory geometry, but declared stays default
    let change = WindowChange {
        mode: WindowMode::Sidebar,
        width: None,
        height: None,
        resizable: true,
        remember_bounds: true,
    };
    let plan = plan_change(&current, &bounds, None, change).unwrap();
    assert_eq!(
        plan,
        PlannedChange::Geometric {
            capture_before: true,
            capture_after: false,
            declared: WindowConfig {
                mode: WindowMode::Sidebar,
                width: 360.0,
                height: 760.0,
                resizable: true,
                remember_bounds: true,
            },
            width: 400.0,
            height: 800.0,
            target_pos: Some((100, 150)),
        }
    );

    // Mode switch with remember_bounds: false -> ignores memory, uses defaults for both
    let change = WindowChange {
        mode: WindowMode::Sidebar,
        width: None,
        height: None,
        resizable: false,
        remember_bounds: false,
    };
    let plan = plan_change(&current, &bounds, None, change).unwrap();
    assert_eq!(
        plan,
        PlannedChange::Geometric {
            capture_before: true,
            capture_after: false,
            declared: WindowConfig {
                mode: WindowMode::Sidebar,
                width: 360.0,
                height: 760.0,
                resizable: false,
                remember_bounds: false,
            },
            width: 360.0,
            height: 760.0,
            target_pos: None,
        }
    );
}

#[test]
fn plan_change_cross_mode_single_dimension_does_not_inherit_previous_mode_size() {
    let current = WindowConfig {
        mode: WindowMode::Panel,
        width: 1100.0,
        height: 760.0,
        resizable: true,
        remember_bounds: true,
    };

    // Case 1: Switching to sidebar with remembered bounds, only height is passed
    let mut bounds = BTreeMap::new();
    bounds.insert(
        "sidebar".to_owned(),
        Bounds {
            x: 200,
            y: 300,
            width: 380.0,
            height: 850.0,
        },
    );
    let change = WindowChange {
        mode: WindowMode::Sidebar,
        width: None,
        height: Some(900.0),
        resizable: true,
        remember_bounds: true,
    };
    let plan = plan_change(&current, &bounds, None, change).unwrap();
    assert_eq!(
        plan,
        PlannedChange::Geometric {
            capture_before: true,
            capture_after: true,
            declared: WindowConfig {
                mode: WindowMode::Sidebar,
                width: 360.0, // Default width for Sidebar, NOT 1100.0 from Panel!
                height: 900.0,
                resizable: true,
                remember_bounds: true,
            },
            width: 380.0, // Fallback width from Sidebar bounds, NOT 1100.0!
            height: 900.0,
            target_pos: Some((200, 300)),
        }
    );

    // Case 2: Switching to sidebar without remembered bounds, only height is passed
    let empty_bounds = BTreeMap::new();
    let change = WindowChange {
        mode: WindowMode::Sidebar,
        width: None,
        height: Some(900.0),
        resizable: true,
        remember_bounds: true,
    };
    let plan = plan_change(&current, &empty_bounds, None, change).unwrap();
    assert_eq!(
        plan,
        PlannedChange::Geometric {
            capture_before: true,
            capture_after: true,
            declared: WindowConfig {
                mode: WindowMode::Sidebar,
                width: 360.0,
                height: 900.0,
                resizable: true,
                remember_bounds: true,
            },
            width: 360.0, // Default width for Sidebar
            height: 900.0,
            target_pos: None,
        }
    );
}

#[test]
fn plan_change_same_mode_single_dimension_uses_live_or_fallback_memory() {
    let current = WindowConfig {
        mode: WindowMode::Panel,
        width: 1100.0,
        height: 760.0,
        resizable: true,
        remember_bounds: true,
    };
    let mut bounds = BTreeMap::new();
    bounds.insert(
        "panel".to_owned(),
        Bounds {
            x: 70,
            y: 80,
            width: 1300.0,
            height: 820.0,
        },
    );

    // Case 1: Window has live geometry (e.g. user dragged/resized to (50, 60), 1400x950)
    let live = Some(((50, 60), (1400.0, 950.0)));
    let change = WindowChange {
        mode: WindowMode::Panel,
        width: Some(1200.0),
        height: None,
        resizable: true,
        remember_bounds: true,
    };
    let plan = plan_change(&current, &bounds, live, change).unwrap();
    assert_eq!(
        plan,
        PlannedChange::Geometric {
            capture_before: false,
            capture_after: true,
            declared: WindowConfig {
                mode: WindowMode::Panel,
                width: 1200.0,
                height: 760.0, // Declared keeps current.height
                resizable: true,
                remember_bounds: true,
            },
            width: 1200.0,
            height: 950.0,              // Live height preserved
            target_pos: Some((50, 60)), // Live position preserved
        }
    );

    // Case 2: Window has NO live geometry (e.g. maximized state, live is None) -> falls back to memory bounds
    let change = WindowChange {
        mode: WindowMode::Panel,
        width: Some(1200.0),
        height: None,
        resizable: true,
        remember_bounds: true,
    };
    let plan = plan_change(&current, &bounds, None, change).unwrap();
    assert_eq!(
        plan,
        PlannedChange::Geometric {
            capture_before: false,
            capture_after: true,
            declared: WindowConfig {
                mode: WindowMode::Panel,
                width: 1200.0,
                height: 760.0,
                resizable: true,
                remember_bounds: true,
            },
            width: 1200.0,
            height: 820.0,              // Fallback from remembered bounds
            target_pos: Some((70, 80)), // Fallback from remembered position
        }
    );

    // Case 3: live is None and NO bounds -> falls back to current config
    let empty_bounds = BTreeMap::new();
    let change = WindowChange {
        mode: WindowMode::Panel,
        width: None,
        height: Some(600.0),
        resizable: true,
        remember_bounds: true,
    };
    let plan = plan_change(&current, &empty_bounds, None, change).unwrap();
    assert_eq!(
        plan,
        PlannedChange::Geometric {
            capture_before: false,
            capture_after: true,
            declared: WindowConfig {
                mode: WindowMode::Panel,
                width: 1100.0,
                height: 600.0,
                resizable: true,
                remember_bounds: true,
            },
            width: 1100.0,
            height: 600.0,
            target_pos: None,
        }
    );
}

#[test]
fn plan_change_rejects_out_of_bounds_or_invalid_dimensions() {
    let current = WindowConfig {
        mode: WindowMode::Panel,
        width: 1100.0,
        height: 760.0,
        resizable: true,
        remember_bounds: true,
    };
    let bounds = BTreeMap::new();

    // Width too small (< 280.0)
    let change = WindowChange {
        mode: WindowMode::Panel,
        width: Some(100.0),
        height: None,
        resizable: true,
        remember_bounds: true,
    };
    assert_eq!(
        plan_change(&current, &bounds, None, change)
            .unwrap_err()
            .code,
        "VALIDATION"
    );

    // Width too large (> 7680.0)
    let change = WindowChange {
        mode: WindowMode::Panel,
        width: Some(8000.0),
        height: None,
        resizable: true,
        remember_bounds: true,
    };
    assert_eq!(
        plan_change(&current, &bounds, None, change)
            .unwrap_err()
            .code,
        "VALIDATION"
    );

    // Height too small (< 240.0)
    let change = WindowChange {
        mode: WindowMode::Panel,
        width: None,
        height: Some(200.0),
        resizable: true,
        remember_bounds: true,
    };
    assert_eq!(
        plan_change(&current, &bounds, None, change)
            .unwrap_err()
            .code,
        "VALIDATION"
    );

    // NaN dimension
    let change = WindowChange {
        mode: WindowMode::Panel,
        width: Some(f64::NAN),
        height: None,
        resizable: true,
        remember_bounds: true,
    };
    assert_eq!(
        plan_change(&current, &bounds, None, change)
            .unwrap_err()
            .code,
        "VALIDATION"
    );

    // Cross-mode with invalid dimension
    let change = WindowChange {
        mode: WindowMode::Sidebar,
        width: Some(10.0),
        height: None,
        resizable: true,
        remember_bounds: true,
    };
    assert_eq!(
        plan_change(&current, &bounds, None, change)
            .unwrap_err()
            .code,
        "VALIDATION"
    );
}
