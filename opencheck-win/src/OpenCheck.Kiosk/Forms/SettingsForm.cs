using OpenCheck.Common.Http;

namespace OpenCheck.Kiosk.Forms;

// Tela de configuração — reduzida ao mínimo: Agent Key do Ponto e o
// atalho/tipo do botão AUX. A URL da API é fixa (aponta para produção) e
// não é exibida nem editável aqui — evita configuração errada por engano.
public class SettingsForm : Form
{
    private readonly KioskConfiguration _config;

    private TextBox  _txtAgentKey  = null!;
    private Label    _lblPonto     = null!;
    private ComboBox _cmbAuxTipo   = null!;
    private ComboBox _cmbAuxMod    = null!;
    private ComboBox _cmbAuxKey    = null!;

    public SettingsForm(KioskConfiguration config)
    {
        _config = config;
        BuildUI();
        LoadValues();
    }

    private void BuildUI()
    {
        Text = "OpenCheck — Configurações";
        Size = new Size(480, 430);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 9f);
        BackColor = Color.White;

        var header = new Panel { Dock = DockStyle.Top, Height = 56, BackColor = Color.FromArgb(15, 52, 96) };
        header.Controls.Add(new Label
        {
            Text = "Configurações",
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 13f, FontStyle.Bold),
            AutoSize = true,
            Location = new Point(16, 8)
        });
        header.Controls.Add(new Label
        {
            Text = "Agent Key do Ponto e atalho do AUX",
            ForeColor = Color.FromArgb(140, 185, 230),
            Font = new Font("Segoe UI", 7.5f),
            AutoSize = true,
            Location = new Point(18, 33)
        });

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(22, 18, 22, 14),
            ColumnCount = 2,
            RowCount = 8
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 130));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));  // r0 agent key
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));  // r1 test btn
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));  // r2 ponto result
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));  // r3 section header
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));  // r4 aux tipo
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));  // r5 aux hotkey
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));  // r6 spacer
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 44));  // r7 buttons

        int r = 0;

        // r0 — Agent Key do Ponto
        layout.Controls.Add(Lbl("Agent Key do Ponto:"), 0, r);
        var keyPanel = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight };
        _txtAgentKey = new TextBox { Width = 206, PasswordChar = '●', Font = new Font("Consolas", 9f) };
        var btnShow = new Button
        {
            Text = "👁", Width = 32, Height = 24,
            FlatStyle = FlatStyle.Flat, Margin = new Padding(4, 0, 0, 0), Cursor = Cursors.Hand
        };
        btnShow.FlatAppearance.BorderColor = Color.FromArgb(180, 200, 230);
        btnShow.Click += (_, _) => _txtAgentKey.PasswordChar = _txtAgentKey.PasswordChar == '\0' ? '●' : '\0';
        keyPanel.Controls.AddRange([_txtAgentKey, btnShow]);
        layout.Controls.Add(keyPanel, 1, r++);

        // r1 — Testar Conexão
        layout.Controls.Add(new Label(), 0, r);
        var btnTest = new Button
        {
            Text = "Testar Conexão",
            Width = 140, Height = 28,
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(240, 245, 252),
            ForeColor = Color.FromArgb(15, 52, 96),
            Cursor = Cursors.Hand,
            Anchor = AnchorStyles.Left | AnchorStyles.Top,
            Margin = new Padding(0, 3, 0, 0)
        };
        btnTest.FlatAppearance.BorderColor = Color.FromArgb(180, 200, 230);
        btnTest.Click += async (_, _) => await TestarConexaoAsync();
        layout.Controls.Add(btnTest, 1, r++);

        // r2 — Ponto (resultado do teste)
        layout.Controls.Add(Lbl("Ponto:"), 0, r);
        _lblPonto = new Label
        {
            Dock = DockStyle.Fill,
            ForeColor = Color.DimGray,
            TextAlign = ContentAlignment.MiddleLeft,
            Font = new Font("Segoe UI", 9f, FontStyle.Italic)
        };
        layout.Controls.Add(_lblPonto, 1, r++);

        // r3 — Seção AUX
        var secPanel = new Panel { Dock = DockStyle.Fill, BackColor = Color.FromArgb(235, 241, 250), Margin = new Padding(0, 6, 0, 4) };
        secPanel.Controls.Add(new Label
        {
            Text = "  Botão AUX",
            ForeColor = Color.FromArgb(15, 52, 96),
            Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft
        });
        layout.Controls.Add(secPanel, 0, r);
        layout.SetColumnSpan(secPanel, 2);
        r++;

        // r4 — Tipo de evento AUX
        layout.Controls.Add(Lbl("Tipo de evento:"), 0, r);
        _cmbAuxTipo = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Dock = DockStyle.Fill };
        _cmbAuxTipo.Items.AddRange(["PANICO_SILENCIOSO", "PANICO", "COACAO"]);
        layout.Controls.Add(_cmbAuxTipo, 1, r++);

        // r5 — Atalho de teclado
        layout.Controls.Add(Lbl("Atalho:"), 0, r);
        var panelHk = new FlowLayoutPanel { AutoSize = true, Margin = new Padding(0, 4, 0, 0) };
        _cmbAuxMod = ModCombo();
        _cmbAuxKey = KeyCombo();
        panelHk.Controls.AddRange([_cmbAuxMod, Plus(), _cmbAuxKey]);
        layout.Controls.Add(panelHk, 1, r++);

        // r6 — spacer
        layout.Controls.Add(new Label(), 0, r);
        layout.Controls.Add(new Label(), 1, r++);

        // r7 — Salvar / Cancelar
        var btnPanel = new FlowLayoutPanel { FlowDirection = FlowDirection.RightToLeft, Dock = DockStyle.Fill, Padding = new Padding(0, 8, 0, 0) };
        var btnCancel = new Button { Text = "Cancelar", DialogResult = DialogResult.Cancel, Width = 96, Height = 32, FlatStyle = FlatStyle.Flat };
        btnCancel.FlatAppearance.BorderColor = Color.FromArgb(200, 200, 200);
        var btnSave = new Button
        {
            Text = "Salvar", DialogResult = DialogResult.OK, Width = 96, Height = 32,
            BackColor = Color.FromArgb(15, 52, 96), ForeColor = Color.White, FlatStyle = FlatStyle.Flat,
            Margin = new Padding(8, 0, 0, 0), Font = new Font("Segoe UI", 9f, FontStyle.Bold), Cursor = Cursors.Hand
        };
        btnSave.FlatAppearance.BorderSize = 0;
        btnSave.Click += (_, _) => SalvarValores();
        btnPanel.Controls.AddRange([btnCancel, btnSave]);
        layout.Controls.Add(btnPanel, 0, r);
        layout.SetColumnSpan(btnPanel, 2);

        AcceptButton = btnSave;
        CancelButton = btnCancel;

        Controls.Add(layout);
        Controls.Add(header);
    }

    private static Label Lbl(string t) => new()
    {
        Text = t,
        AutoSize = true,
        Margin = new Padding(0, 7, 8, 0),
        ForeColor = Color.FromArgb(75, 85, 99)
    };

    private static Label Plus() => new()
    {
        Text = " + ",
        AutoSize = true,
        Margin = new Padding(4, 5, 4, 0),
        ForeColor = Color.FromArgb(100, 100, 100)
    };

    private static ComboBox ModCombo()
    {
        var c = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 115 };
        c.Items.AddRange(["Ctrl + Alt", "Ctrl + Shift", "Alt + Shift", "Ctrl"]);
        c.SelectedIndex = 0;
        return c;
    }

    private static ComboBox KeyCombo()
    {
        var c = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = 70 };
        for (char ch = 'A'; ch <= 'Z'; ch++) c.Items.Add(ch.ToString());
        for (int i = 1; i <= 12; i++) c.Items.Add($"F{i}");
        c.SelectedIndex = 0;
        return c;
    }

    private void LoadValues()
    {
        _txtAgentKey.Text = _config.AgentKeyPonto;
        _lblPonto.Text    = string.IsNullOrEmpty(_config.PontoNome) ? "" : _config.PontoNome;

        _cmbAuxTipo.SelectedItem = _config.AuxTipo;
        if (_cmbAuxTipo.SelectedIndex < 0) _cmbAuxTipo.SelectedIndex = 0;

        _cmbAuxMod.SelectedIndex = ModToIndex(_config.AuxHotkeyModifiers);
        SetKeyCombo(_cmbAuxKey, _config.AuxHotkeyKey);
    }

    private void SalvarValores()
    {
        _config.AgentKeyPonto       = _txtAgentKey.Text.Trim();
        _config.AuxTipo             = _cmbAuxTipo.SelectedItem?.ToString() ?? "PANICO_SILENCIOSO";
        _config.AuxHotkeyModifiers  = IndexToMod(_cmbAuxMod.SelectedIndex);
        _config.AuxHotkeyKey        = ItemToVk(_cmbAuxKey.SelectedItem?.ToString());
    }

    private async Task TestarConexaoAsync()
    {
        if (string.IsNullOrWhiteSpace(_txtAgentKey.Text))
        {
            MessageBox.Show("Informe a Agent Key antes de testar.", "OpenCheck", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        _lblPonto.Text      = "Testando...";
        _lblPonto.ForeColor = Color.DimGray;
        try
        {
            var client = new OpenCheckClient(_config.ApiUrl, _txtAgentKey.Text.Trim());
            var cfg    = await client.GetConfigAsync();
            var nome   = cfg?.Ponto?.Nome ?? "Ponto sem nome";
            _lblPonto.Text      = $"✓ {nome}";
            _lblPonto.ForeColor = Color.SeaGreen;
            _config.PontoNome   = nome;
        }
        catch (Exception ex)
        {
            _lblPonto.Text      = "✗ Erro de conexão";
            _lblPonto.ForeColor = Color.Crimson;
            MessageBox.Show($"Falha na conexão:\n{ex.Message}", "OpenCheck", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    // ── VK / modifier helpers ─────────────────────────────────────────────────

    private static int ModToIndex(uint mod) => mod switch
    {
        0x0003 => 0,
        0x0006 => 1,
        0x0005 => 2,
        0x0002 => 3,
        _ => 0
    };

    private static uint IndexToMod(int idx) => idx switch
    {
        1 => 0x0006,
        2 => 0x0005,
        3 => 0x0002,
        _ => 0x0003
    };

    private static void SetKeyCombo(ComboBox cmb, uint vk)
    {
        if (vk is >= 0x41 and <= 0x5A) cmb.SelectedItem = ((char)vk).ToString();
        else if (vk is >= 0x70 and <= 0x7B) cmb.SelectedItem = $"F{vk - 0x6F}";
    }

    private static uint ItemToVk(string? item)
    {
        if (item == null) return 0x50;
        if (item.Length == 1 && item[0] is >= 'A' and <= 'Z') return (uint)item[0];
        if (item.StartsWith('F') && int.TryParse(item[1..], out int n) && n is >= 1 and <= 12)
            return (uint)(0x6F + n);
        return 0x50;
    }
}
