using OpenCheck.Common.Http;

namespace OpenCheck.Kiosk.Forms;

// Janela "Status" — três botões (CHECK-IN, CHECK-OUT, AUX) e um painel com
// os últimos eventos. Janela normal (não quiosque): pode ser movida,
// minimizada e fechada; o app continua rodando pela bandeja do sistema
// (ver MainTrayContext), igual ao app anterior.
public class MainForm : Form
{
    private readonly KioskConfiguration _config;
    private readonly EventLogger _logger;
    private readonly Func<Task> _executarAux;

    private Label _lblTitulo    = null!;
    private Label _lblSubtitulo = null!;
    private Button _btnCheckIn  = null!;
    private Button _btnCheckOut = null!;
    private Button _btnAux      = null!;
    private ListBox _lstEventos = null!;

    public MainForm(KioskConfiguration config, EventLogger logger, Func<Task> executarAux)
    {
        _config = config;
        _logger = logger;
        _executarAux = executarAux;

        BuildUI();
        CarregarEventosExistentes();

        _logger.EntradaAdicionada += OnEntradaAdicionada;
        FormClosed += (_, _) => _logger.EntradaAdicionada -= OnEntradaAdicionada;
        Load += async (_, _) => await CarregarConfigRemotaAsync();
    }

    // ── layout ───────────────────────────────────────────────────────────────

    private void BuildUI()
    {
        Text = "OpenCheck — Status";
        BackColor = Color.White;
        Font = new Font("Segoe UI", 9f);
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(480, 700);

        var root = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 3 };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 72));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 300));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        // ── Cabeçalho ──
        var header = new Panel { Dock = DockStyle.Fill, BackColor = Color.FromArgb(15, 52, 96) };
        _lblTitulo = new Label
        {
            Text = "OpenCheck",
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 15f, FontStyle.Bold),
            AutoSize = true,
            Location = new Point(16, 10)
        };
        _lblSubtitulo = new Label
        {
            Text = "Carregando...",
            ForeColor = Color.FromArgb(140, 185, 230),
            Font = new Font("Segoe UI", 8.5f),
            AutoSize = true,
            Location = new Point(18, 42)
        };
        header.Controls.AddRange([_lblTitulo, _lblSubtitulo]);

        // ── Botões principais ──
        var botoesArea = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 3,
            Padding = new Padding(24, 16, 24, 12)
        };
        botoesArea.RowStyles.Add(new RowStyle(SizeType.Percent, 33.33f));
        botoesArea.RowStyles.Add(new RowStyle(SizeType.Percent, 33.33f));
        botoesArea.RowStyles.Add(new RowStyle(SizeType.Percent, 33.33f));

        _btnCheckIn = CriarBotaoPrincipal("CHECK-IN", Color.FromArgb(0, 120, 215));
        _btnCheckIn.Click += async (_, _) => await ExecutarAcaoAsync(isCheckIn: true);

        _btnCheckOut = CriarBotaoPrincipal("CHECK-OUT", Color.FromArgb(71, 85, 105));
        _btnCheckOut.Click += async (_, _) => await ExecutarAcaoAsync(isCheckIn: false);

        _btnAux = CriarBotaoPrincipal("AUX", Color.Crimson);
        _btnAux.Click += async (_, _) => await _executarAux();

        botoesArea.Controls.Add(_btnCheckIn, 0, 0);
        botoesArea.Controls.Add(_btnCheckOut, 0, 1);
        botoesArea.Controls.Add(_btnAux, 0, 2);

        // ── Painel de notificações ──
        var eventosArea = new Panel { Dock = DockStyle.Fill, BackColor = Color.FromArgb(250, 251, 252), Padding = new Padding(24, 12, 24, 16) };
        var eventosHeader = new Label
        {
            Text = "Últimos Eventos",
            Dock = DockStyle.Top,
            Height = 26,
            Font = new Font("Segoe UI", 10f, FontStyle.Bold),
            ForeColor = Color.FromArgb(75, 85, 99)
        };
        _lstEventos = new ListBox
        {
            Dock = DockStyle.Fill,
            DrawMode = DrawMode.OwnerDrawFixed,
            ItemHeight = 24,
            BorderStyle = BorderStyle.FixedSingle,
            Font = new Font("Segoe UI", 9f)
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
            Margin = new Padding(0, 6, 0, 6),
            BackColor = cor,
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat,
            Font = new Font("Segoe UI", 16f, FontStyle.Bold),
            Cursor = Cursors.Hand
        };
        btn.FlatAppearance.BorderSize = 0;
        return btn;
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

        e.Graphics.DrawString(simbolo, fonte, brushSimbolo, e.Bounds.Left + 4, e.Bounds.Top + 2);

        var textoRect = new Rectangle(e.Bounds.Left + 22, e.Bounds.Top, Math.Max(0, e.Bounds.Width - 90), e.Bounds.Height);
        e.Graphics.DrawString(entrada.Mensagem, fonte, brushTexto, textoRect);

        var horaRect = new Rectangle(e.Bounds.Right - 64, e.Bounds.Top, 60, e.Bounds.Height);
        var sf = new StringFormat { Alignment = StringAlignment.Far, LineAlignment = StringAlignment.Center };
        e.Graphics.DrawString(entrada.Quando.ToString("HH:mm:ss"), new Font("Segoe UI", 7.5f), brushHora, horaRect, sf);

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

    private void SetBotoesHabilitados(bool habilitado)
    {
        _btnCheckIn.Enabled = habilitado;
        _btnCheckOut.Enabled = habilitado;
        // AUX permanece sempre habilitado — é um botão de emergência.
    }

    private OpenCheckClient BuildClient() => new(_config.ApiUrl, _config.AgentKeyPonto);

    // ── configuração remota (nome da loja no título) ──────────────────────────

    public async Task AtualizarAposConfiguracaoAsync() => await CarregarConfigRemotaAsync();

    private async Task CarregarConfigRemotaAsync()
    {
        if (!_config.IsConfigured)
        {
            _lblSubtitulo.Text = "Não configurado — acesse Configurações pela bandeja";
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
}
