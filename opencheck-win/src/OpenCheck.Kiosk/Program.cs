using OpenCheck.Kiosk;
using OpenCheck.Kiosk.Forms;

Application.EnableVisualStyles();
Application.SetCompatibleTextRenderingDefault(false);

Application.ThreadException += (_, e) => LogCrash(e.Exception);
AppDomain.CurrentDomain.UnhandledException += (_, e) => LogCrash(e.ExceptionObject as Exception);

var config = KioskConfiguration.Load();

if (!config.IsConfigured)
{
    using var settings = new SettingsForm(config);
    if (settings.ShowDialog() != DialogResult.OK || !config.IsConfigured)
    {
        MessageBox.Show(
            "É necessário configurar a URL da API e a Agent Key do Ponto para iniciar o OpenCheck.",
            "OpenCheck", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        Environment.Exit(1);
    }
    config.Save();
}

var logger = new EventLogger();
Application.Run(new MainForm(config, logger));

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
