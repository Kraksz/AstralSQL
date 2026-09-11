use windows_sys::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR,
};

pub fn apply(window: &tauri::WebviewWindow) {
    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    // COLORREF is 0x00BBGGRR. Match .astral-studio .app-header (#080f18).
    let background: u32 = 0x0018_0f08;
    let text: u32 = 0x00fc_faf8;
    for (attribute, color) in [
        (DWMWA_CAPTION_COLOR, background),
        (DWMWA_BORDER_COLOR, background),
        (DWMWA_TEXT_COLOR, text),
    ] {
        // SAFETY: hwnd belongs to this live Tauri window; color is a valid COLORREF
        // for the duration of this synchronous Windows call. Older Windows versions
        // reject these attributes and retain their normal native window frame.
        let result = unsafe {
            DwmSetWindowAttribute(
                hwnd.0,
                attribute as u32,
                (&color as *const u32).cast(),
                std::mem::size_of::<u32>() as u32,
            )
        };
        if result < 0 {
            eprintln!(
                "Native frame color unavailable (attribute {attribute}, HRESULT {result:#x})."
            );
        }
    }
}
