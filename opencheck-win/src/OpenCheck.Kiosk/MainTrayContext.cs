using OpenCheck.Common.Http;
using OpenCheck.Common.Input;
using OpenCheck.Kiosk.Forms;

namespace OpenCheck.Kiosk;

// Contexto raiz do app: quem mantém o processo vivo é o ícone da bandeja,
// não a janela principal. A janela Status (MainForm) é comum — pode ser
// fechada/minimizada normalmente — e reaberta a qualquer momento pela
// bandeja, igual ao app anterior (alerta-vigia-win).
public class MainTrayContext : ApplicationContext
{
    private const int HotkeyAux = 1;

    private readonly KioskConfiguration _config;
    private readonly EventLogger _logger;
    private readonly NotifyIcon _tray;
    private readonly MsgWindow _msgWin;
    private MainForm? _mainForm;

    public MainTrayContext(KioskConfiguration config, EventLogger logger)
    {
        _config = config;
        _logger = logger;

        _msgWin = new MsgWindow();
        _msgWin.HotkeyPressed += OnHotkeyPressed;

        _tray = new NotifyIcon
        {
            Icon = BuildIcon(),
            Visible = true,
            Text = "OpenCheck",
            ContextMenuStrip = BuildMenu()
        };
        _tray.DoubleClick += (_, _) => ShowMain();

        RegisterHotkey();
        ShowMain();

        if (!_config.IsConfigured)
            _tray.ShowBalloonTip(5000, "OpenCheck", "Configure a URL da API e a Agent Key do Ponto em Configurações.", ToolTipIcon.Info);
    }

    // ── bandeja ──────────────────────────────────────────────────────────────

    private ContextMenuStrip BuildMenu()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add(new ToolStripMenuItem("Abrir OpenCheck", null, (_, _) => ShowMain()));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("Configurações", null, (_, _) => ShowSettings()));
        return menu;
    }

    private void ShowMain()
    {
        if (_mainForm is { IsDisposed: false })
        {
            if (_mainForm.WindowState == FormWindowState.Minimized)
                _mainForm.WindowState = FormWindowState.Normal;
            _mainForm.BringToFront();
            _mainForm.Activate();
            return;
        }
        _mainForm = new MainForm(_config, _logger, ExecutarAuxAsync);
        _mainForm.FormClosed += (_, _) => _mainForm = null;
        _mainForm.Show();
    }

    private void ShowSettings()
    {
        using var form = new SettingsForm(_config);
        if (form.ShowDialog() == DialogResult.OK)
        {
            _config.Save();
            RegisterHotkey();
            if (_mainForm is { IsDisposed: false })
                _ = _mainForm.AtualizarAposConfiguracaoAsync();
        }
    }

    private static Icon BuildIcon()
    {
        var bmp = new Bitmap(32, 32);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        g.Clear(Color.Transparent);
        g.FillEllipse(new SolidBrush(Color.FromArgb(15, 52, 96)), 1, 1, 30, 30);
        using var font = new Font("Arial", 8f, FontStyle.Bold);
        var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
        g.DrawString("OC", font, Brushes.White, new RectangleF(0, 0, 32, 32), sf);
        return Icon.FromHandle(bmp.GetHicon());
    }

    // ── atalho global do AUX ───────────────────────────────────────────────────
    // Funciona mesmo com a janela Status fechada — registrado numa janela
    // invisível dedicada só a receber WM_HOTKEY.

    private void RegisterHotkey()
    {
        HotkeyManager.Unregister(_msgWin.Handle, HotkeyAux);
        var ok = HotkeyManager.Register(_msgWin.Handle, HotkeyAux, _config.AuxHotkeyModifiers, _config.AuxHotkeyKey);
        if (!ok)
            _logger.Registrar(false, $"Não foi possível registrar o atalho do AUX ({_config.AuxHotkeyText}) — pode estar em uso por outro programa.");
    }

    private async void OnHotkeyPressed(int id)
    {
        if (id == HotkeyAux)
            await ExecutarAuxAsync();
    }

    private async Task ExecutarAuxAsync()
    {
        if (!_config.IsConfigured)
        {
            _tray.ShowBalloonTip(4000, "OpenCheck", "Configure a API em Configurações primeiro.", ToolTipIcon.Warning);
            return;
        }

        try
        {
            var client = new OpenCheckClient(_config.ApiUrl, _config.AgentKeyPonto);
            var resultado = await client.SendAuxAsync(_config.AuxTipo, "AUX via aplicativo Windows");
            if (resultado.Aceito)
            {
                _logger.Registrar(true, "Evento AUX enviado com sucesso");
                _tray.ShowBalloonTip(3000, "OpenCheck", "AUX confirmado", ToolTipIcon.Info);
            }
            else
            {
                var mensagem = resultado.Mensagem ?? "Erro ao enviar evento AUX";
                _logger.Registrar(false, mensagem);
                _tray.ShowBalloonTip(4000, "OpenCheck", mensagem, ToolTipIcon.Error);
            }
        }
        catch (Exception ex)
        {
            _logger.Registrar(false, $"Erro ao enviar evento AUX: {ex.Message}");
            _tray.ShowBalloonTip(4000, "OpenCheck", "Erro ao enviar evento AUX", ToolTipIcon.Error);
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            HotkeyManager.Unregister(_msgWin.Handle, HotkeyAux);
            _tray.Dispose();
            _msgWin.DestroyHandle();
        }
        base.Dispose(disposing);
    }

    // ── janela invisível para receber WM_HOTKEY ───────────────────────────────

    private sealed class MsgWindow : NativeWindow
    {
        public event Action<int>? HotkeyPressed;

        public MsgWindow() => CreateHandle(new CreateParams());

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == HotkeyManager.WM_HOTKEY)
                HotkeyPressed?.Invoke(m.WParam.ToInt32());
            base.WndProc(ref m);
        }
    }
}
