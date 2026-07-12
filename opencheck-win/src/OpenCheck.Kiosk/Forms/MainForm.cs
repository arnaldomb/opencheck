using OpenCheck.Common.Http;
using OpenCheck.Common.Input;

namespace OpenCheck.Kiosk.Forms;

// Tela principal do quiosque: três botões (CHECK-IN, CHECK-OUT, AUX) e um
// painel com os últimos eventos. Nenhuma seleção de perfil — o servidor
// decide, a partir do código de 4 dígitos, se é operador ou supervisor.
public class MainForm : Form
{
    private const int HotkeyAux = 1;

    private readonly KioskConfiguration _config;
    private readonly EventLogger _logger;

    private Label _lblTitulo    = null!;
    private Label _lblSubtitulo = null!;
    private Button _btnCheckIn  = null!;
    private Button _btnCheckOut = null!;
    private Button _btnAux      = null!;
    private ListBox _lstEventos = null!;

    public MainForm(KioskConfiguration config, EventLogger logger)
    {
        _config = config;
        _logger = logger;

        BuildUI();
        ApplyDisplayMode();
        CarregarEventosExistentes();

        _logger.EntradaAdicionada += OnEntradaAdicionada;
        HandleCreated += (_, _) => RegisterAuxHotkey();
        FormClosed += (_, _) => UnregisterAuxHotkey();
        Load += async (_, _) => await CarregarConfigRemotaAsync();
    }

    // ── layout ───────────────────────────────────────────────────────────────

    private void BuildUI()
    {
        Text = "OpenCheck";
        BackColor = Color.White;
        Font = new Font("Segoe UI", 9f);
        MinimumSize = new Size(480, 640);

        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 3 };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 96));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 55));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 45));

        // ── Cabeçalho ──
        var header = new Panel { Dock = DockStyle.Fill, BackColor = Color.FromArgb(15, 52, 96) };
        _lblTitulo = new Label
        {
            Text = "OpenCheck",
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 20f, FontStyle.Bold),
            AutoSize = true,
            Location = new Point(24, 16)
        };
        _lblSubtitulo = new Label
        {
            Text = "Carregando...",
            ForeColor = Color.FromArgb(140, 185, 230),
            Font = new Font("Segoe UI", 9.5f),
            AutoSize = true,
            Location = new Point(26, 58)
        };
        var btnConfig = new Button
        {
            Text = "⚙",
            Size = new Size(44, 44),
            Location = new Point(header.Width - 60, 26),
            Anchor = AnchorStyles.Top | AnchorStyles.Right,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(15, 52, 96),
            ForeColor = Color.FromArgb(140, 185, 230),
            Font = new Font("Segoe UI", 16f),
            Cursor = Cursors.Hand
        };
        btnConfig.FlatAppearance.BorderSize = 0;
        btnConfig.Click += OnConfiguracoesClick;
        header.Resize += (_, _) => btnConfig.Location = new Point(header.Width - 60, 26);
        header.Controls.AddRange([_lblTitulo, _lblSubtitulo, btnConfig]);

        // ── Botões principais ──
        var botoesArea = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 3,
            Padding = new Padding(40, 24, 40, 16)
        };
        botoesArea.RowStyles.Add(new RowStyle(SizeType.Percent, 33.33f));
        botoesArea.RowStyles.Add(new RowStyle(SizeType.Percent, 33.33f));
        botoesArea.RowStyles.Add(new RowStyle(SizeType.Percent, 33.33f));

        _btnCheckIn = CriarBotaoPrincipal("CHECK-IN", Color.FromArgb(0, 120, 215));
        _btnCheckIn.Click += async (_, _) => await ExecutarAcaoAsync(isCheckIn: true);

        _btnCheckOut = CriarBotaoPrincipal("CHECK-OUT", Color.FromArgb(71, 85, 105));
        _btnCheckOut.Click += async (_, _) => await ExecutarAcaoAsync(isCheckIn: false);

        _btnAux = CriarBotaoPrincipal("AUX", Color.Crimson);
        _btnAux.Click += async (_, _) => await ExecutarAuxAsync();

        botoesArea.Controls.Add(_btnCheckIn, 0, 0);
        botoesArea.Controls.Add(_btnCheckOut, 0, 1);
        botoesArea.Controls.Add(_btnAux, 0, 2);

        // ── Painel de notificações ──
        var eventosArea = new Panel { Dock = DockStyle.Fill, BackColor = Color.FromArgb(250, 251, 252), Padding = new Padding(24, 12, 24, 16) };
        var eventosHeader = new Label
        {
            Text = "Últimos Eventos",
            Dock = DockStyle.Top,
            Height = 28,
            Font = new Font("Segoe UI", 10f, FontStyle.Bold),
            ForeColor = Color.FromArgb(75, 85, 99)
        };
        _lstEventos = new ListBox
        {
            Dock = DockStyle.Fill,
            DrawMode = DrawMode.OwnerDrawFixed,
            ItemHeight = 26,
            BorderStyle = BorderStyle.FixedSingle,
            Font = new Font("Segoe UI", 10f)
        };
        _lstEventos.DrawItem += OnDrawEventoItem;

        eventosArea.Controls.Add(_lstEventos);
        eventosArea.Controls.Add(eventosHeader);

        root.Controls.Add(header, 0, 0);
        root.Controls.Add(botoesArea, 0, 1);
        root.Controls.Add(eventosArea, 0, 2);

        Controls.Add(root);
    }

    private static Button CriarBotaoPrincipal(string texto, Color cor)
    {
        var btn = new Button
        {
            Text = texto,
            Dock = DockStyle.Fill,
            Margin = new Padding(0, 8, 0, 8),
            BackColor = cor,
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat,
            Font = new Font("Segoe UI", 22f, FontStyle.Bold),
            Cursor = Cursors.Hand
        };
        btn.FlatAppearance.BorderSize = 0;
        return btn;
    }

    private void ApplyDisplayMode()
    {
        if (_config.TelaCheia)
        {
            FormBorderStyle = FormBorderStyle.None;
            WindowState = FormWindowState.Maximized;
            TopMost = true;
        }
        else
        {
            FormBorderStyle = FormBorderStyle.Sizable;
            WindowState = FormWindowState.Normal;
            TopMost = false;
            Size = new Size(900, 700);
            StartPosition = FormStartPosition.CenterScreen;
        }
    }

    // ── eventos (painel "Últimos Eventos") ─────────────────────────────────────

    private void CarregarEventosExistentes()
    {
        foreach (var entrada in _logger.Entradas)
            _lstEventos.Items.Add(entrada);
    }

    private void OnEntradaAdicionada(EventEntry entrada)
    {
        if (InvokeRequired) { BeginInvoke(() => OnEntradaAdicionada(entrada)); return; }
        _lstEventos.Items.Insert(0, entrada);
        if (_lstEventos.Items.Count > 100) _lstEventos.Items.RemoveAt(_lstEventos.Items.Count - 1);
    }

    private void OnDrawEventoItem(object? sender, DrawItemEventArgs e)
    {
        e.DrawBackground();
        if (e.Index < 0 || e.Index >= _lstEventos.Items.Count) return;

        var entrada = (EventEntry)_lstEventos.Items[e.Index];
        var cor = entrada.Sucesso ? Color.SeaGreen : Color.Crimson;
        var simbolo = entrada.Sucesso ? "✓" : "✗";

        using var brushSimbolo = new SolidBrush(cor);
        using var brushTexto = new SolidBrush(Color.FromArgb(40, 40, 40));
        using var brushHora = new SolidBrush(Color.Gray);
        var fonte = e.Font ?? Font;

        e.Graphics.DrawString(simbolo, fonte, brushSimbolo, e.Bounds.Left + 4, e.Bounds.Top + 3);

        var textoRect = new Rectangle(e.Bounds.Left + 26, e.Bounds.Top, Math.Max(0, e.Bounds.Width - 100), e.Bounds.Height);
        e.Graphics.DrawString(entrada.Mensagem, fonte, brushTexto, textoRect);

        var horaRect = new Rectangle(e.Bounds.Right - 70, e.Bounds.Top, 66, e.Bounds.Height);
        var sf = new StringFormat { Alignment = StringAlignment.Far, LineAlignment = StringAlignment.Center };
        e.Graphics.DrawString(entrada.Quando.ToString("HH:mm:ss"), new Font("Segoe UI", 8f), brushHora, horaRect, sf);

        e.DrawFocusRectangle();
    }

    // ── ações ────────────────────────────────────────────────────────────────

    private async Task ExecutarAcaoAsync(bool isCheckIn)
    {
        var acao = isCheckIn ? "Check-in" : "Check-out";

        if (!_config.IsConfigured)
        {
            MessageBox.Show("Configure a URL da API e a Agent Key do Ponto em Configurações.", "OpenCheck", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        using var dlg = new CodeEntryForm(acao);
        if (dlg.ShowDialog(this) != DialogResult.OK) return;

        SetBotoesHabilitados(false);
        try
        {
            var client = BuildClient();
            var resultado = isCheckIn
                ? await client.CheckInAsync(dlg.Codigo, Environment.MachineName, Environment.UserName)
                : await client.CheckOutAsync(dlg.Codigo, Environment.MachineName, Environment.UserName);

            var mensagem = resultado.Mensagem ?? (resultado.Aceito ? "Ação registrada com sucesso." : "Ocorreu um erro ao registrar.");
            _logger.Registrar(resultado.Aceito, mensagem);
        }
        catch (Exception ex)
        {
            _logger.Registrar(false, $"Erro ao registrar {acao}: {ex.Message}");
        }
        finally
        {
            SetBotoesHabilitados(true);
        }
    }

    private async Task ExecutarAuxAsync()
    {
        if (!_config.IsConfigured)
        {
            MessageBox.Show("Configure a URL da API e a Agent Key do Ponto em Configurações.", "OpenCheck", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        try
        {
            var client = BuildClient();
            var resultado = await client.SendAuxAsync(_config.AuxTipo, "AUX via aplicativo Windows");
            if (resultado.Aceito)
                _logger.Registrar(true, "Evento AUX enviado com sucesso");
            else
                _logger.Registrar(false, resultado.Mensagem ?? "Erro ao enviar evento AUX");
        }
        catch (Exception ex)
        {
            _logger.Registrar(false, $"Erro ao enviar evento AUX: {ex.Message}");
        }
    }

    private void SetBotoesHabilitados(bool habilitado)
    {
        _btnCheckIn.Enabled = habilitado;
        _btnCheckOut.Enabled = habilitado;
        // AUX permanece sempre habilitado — é um botão de emergência.
    }

    private OpenCheckClient BuildClient() => new(_config.ApiUrl, _config.AgentKeyPonto);

    // ── configuração remota (nome da loja no título) ──────────────────────────

    private async Task CarregarConfigRemotaAsync()
    {
        if (!_config.IsConfigured)
        {
            _lblSubtitulo.Text = "Não configurado — clique na engrenagem para configurar";
            return;
        }

        try
        {
            var cfg = await BuildClient().GetConfigAsync();
            var nomePonto = cfg?.Ponto?.Nome;
            if (!string.IsNullOrWhiteSpace(nomePonto))
            {
                _config.PontoNome = nomePonto!;
                _config.Save();
            }
            AtualizarTitulo();
            _lblSubtitulo.Text = cfg?.Empresa?.Nome ?? "Conectado";
        }
        catch
        {
            AtualizarTitulo();
            _lblSubtitulo.Text = "Sem conexão com o servidor";
        }
    }

    private void AtualizarTitulo()
    {
        _lblTitulo.Text = string.IsNullOrWhiteSpace(_config.PontoNome)
            ? "OpenCheck"
            : $"OpenCheck — {_config.PontoNome}";
    }

    // ── configurações ────────────────────────────────────────────────────────

    private void OnConfiguracoesClick(object? sender, EventArgs e)
    {
        using var form = new SettingsForm(_config);
        if (form.ShowDialog(this) == DialogResult.OK)
        {
            _config.Save();
            ApplyDisplayMode();
            RegisterAuxHotkey();
            _ = CarregarConfigRemotaAsync();
        }
    }

    // ── atalho global do AUX ───────────────────────────────────────────────────

    private void RegisterAuxHotkey()
    {
        HotkeyManager.Unregister(Handle, HotkeyAux);
        var ok = HotkeyManager.Register(Handle, HotkeyAux, _config.AuxHotkeyModifiers, _config.AuxHotkeyKey);
        if (!ok)
            _logger.Registrar(false, $"Não foi possível registrar o atalho do AUX ({_config.AuxHotkeyText}) — pode estar em uso por outro programa.");
    }

    private void UnregisterAuxHotkey() => HotkeyManager.Unregister(Handle, HotkeyAux);

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == HotkeyManager.WM_HOTKEY && m.WParam.ToInt32() == HotkeyAux)
            _ = ExecutarAuxAsync();
        base.WndProc(ref m);
    }
}
