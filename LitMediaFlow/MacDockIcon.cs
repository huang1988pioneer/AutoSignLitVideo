using System.Runtime.InteropServices;
using Avalonia.Platform;

namespace LitMediaFlow;

// Avalonia's window icon is a no-op on macOS, so the Dock keeps the generic executable icon
// unless the running process sets NSApplication.applicationIconImage itself.
internal static class MacDockIcon
{
    public static void ApplyFromResource()
    {
        if (!OperatingSystem.IsMacOS()) return;

        var path = Path.Combine(Path.GetTempPath(), "LitMediaFlow-app-icon.png");
        using (var input = AssetLoader.Open(new Uri("avares://LitMediaFlow/Assets/app-icon.png")))
        using (var output = File.Create(path))
            input.CopyTo(output);

        var image = NsImage(path);
        if (image == IntPtr.Zero) throw new InvalidOperationException("無法讀取 App 圖示。");

        var app = MsgSend(objc_getClass("NSApplication"), sel_registerName("sharedApplication"));
        if (app == IntPtr.Zero) throw new InvalidOperationException("NSApplication 尚未啟動。");
        MsgSend(app, sel_registerName("setApplicationIconImage:"), image);
    }

    private static IntPtr NsImage(string path)
    {
        var utf8 = Marshal.StringToCoTaskMemUTF8(path);
        try
        {
            var nsPath = MsgSend(objc_getClass("NSString"), sel_registerName("stringWithUTF8String:"), utf8);
            var allocated = MsgSend(objc_getClass("NSImage"), sel_registerName("alloc"));
            return MsgSend(allocated, sel_registerName("initWithContentsOfFile:"), nsPath);
        }
        finally
        {
            Marshal.FreeCoTaskMem(utf8);
        }
    }

    private const string ObjC = "/usr/lib/libobjc.dylib";

    [DllImport(ObjC)]
    private static extern IntPtr objc_getClass(string name);

    [DllImport(ObjC)]
    private static extern IntPtr sel_registerName(string name);

    [DllImport(ObjC, EntryPoint = "objc_msgSend")]
    private static extern IntPtr MsgSend(IntPtr receiver, IntPtr selector);

    [DllImport(ObjC, EntryPoint = "objc_msgSend")]
    private static extern IntPtr MsgSend(IntPtr receiver, IntPtr selector, IntPtr arg);
}
