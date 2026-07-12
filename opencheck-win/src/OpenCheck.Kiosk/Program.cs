using OpenCheck.Kiosk;

Application.EnableVisualStyles();
Application.SetCompatibleTextRenderingDefault(false);

Application.ThreadException += (_, e) => LogCrash(e.Exception);
AppDomain.CurrentDomain.UnhandledException += (_, e) => LogCrash(e.ExceptionObject as Exception);

var config = KioskConfiguration.Load();
var logger = new EventLogger();
var ctx = new MainTrayContext(config, logger);

Application.Run(ctx);

static void LogCrash(Exception? ex)
{
    if (ex == null) return;
    try
    {
        var path = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "OpenCheck", "crash.log");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.AppendAllText(path, $"{DateTime.Now:dd/MM/yyyy HH:mm:ss}\n{ex}\n\n");
    }
    catch { }
}
