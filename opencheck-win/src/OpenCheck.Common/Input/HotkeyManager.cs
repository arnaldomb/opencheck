using System.Runtime.InteropServices;

namespace OpenCheck.Common.Input;

public static class HotkeyManager
{
    public const int WM_HOTKEY = 0x0312;

    public const uint MOD_NONE    = 0x0000;
    public const uint MOD_ALT     = 0x0001;
    public const uint MOD_CONTROL = 0x0002;
    public const uint MOD_SHIFT   = 0x0004;
    public const uint MOD_WIN     = 0x0008;

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    public static bool Register(IntPtr hWnd, int id, uint modifiers, uint vk) =>
        RegisterHotKey(hWnd, id, modifiers, vk);

    public static void Unregister(IntPtr hWnd, int id) =>
        UnregisterHotKey(hWnd, id);
}
