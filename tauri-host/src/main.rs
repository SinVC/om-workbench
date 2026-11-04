// Release 构建时不弹出 Windows 控制台窗口。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri_host_lib::run()
}
