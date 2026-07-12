namespace OpenCheck.Kiosk.Forms;

// Diálogo simples exibido ao clicar em Check-in ou Check-out: o usuário
// informa apenas o código de 4 dígitos (operador ou supervisor — o servidor
// decide). Inclui teclado numérico na tela para quiosques touchscreen sem
// teclado físico.
public class CodeEntryForm : Form
{
    private TextBox _txtCodigo = null!;
    private Button _btnConfirmar = null!;

    public string Codigo => _txtCodigo.Text.Trim();

    public CodeEntryForm(string titulo)
    {
        BuildUI(titulo);
    }

    private void BuildUI(string titulo)
    {
        Text = "OpenCheck";
        Size = new Size(380, 460);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.White;
        Font = new Font("Segoe UI", 9f);

        var header = new Panel { Dock = DockStyle.Top, Height = 56, BackColor = Color.FromArgb(15, 52, 96) };
        header.Controls.Add(new Label
        {
            Text = titulo,
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 14f, FontStyle.Bold),
            AutoSize = true,
            Location = new Point(16, 14)
        });

        var lblSubtitulo = new Label
        {
            Text = "Informe seu código",
            Dock = DockStyle.Top,
            Height = 40,
            TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font("Segoe UI", 11f),
            ForeColor = Color.FromArgb(75, 85, 99),
            Margin = new Padding(0, 16, 0, 0)
        };

        _txtCodigo = new TextBox
        {
            Dock = DockStyle.Top,
            Height = 56,
            Font = new Font("Consolas", 28f, FontStyle.Bold),
            TextAlign = HorizontalAlignment.Center,
            MaxLength = 4,
            PasswordChar = '●'
        };
        _txtCodigo.KeyPress += (_, e) =>
        {
            if (!char.IsDigit(e.KeyChar) && !char.IsControl(e.KeyChar)) e.Handled = true;
            if (e.KeyChar == (char)Keys.Enter) { e.Handled = true; TryConfirmar(); }
        };

        var keypad = BuildKeypad();

        var btnPanel = new TableLayoutPanel
        {
            Dock = DockStyle.Bottom,
            Height = 60,
            ColumnCount = 2,
            Padding = new Padding(24, 8, 24, 16)
        };
        btnPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));
        btnPanel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50));

        var btnCancelar = new Button
        {
            Text = "Cancelar",
            DialogResult = DialogResult.Cancel,
            Dock = DockStyle.Fill,
            FlatStyle = FlatStyle.Flat,
            Margin = new Padding(0, 0, 6, 0)
        };
        btnCancelar.FlatAppearance.BorderColor = Color.FromArgb(200, 200, 200);

        _btnConfirmar = new Button
        {
            Text = "Confirmar",
            Dock = DockStyle.Fill,
            BackColor = Color.FromArgb(0, 120, 215),
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat,
            Font = new Font("Segoe UI", 10f, FontStyle.Bold),
            Cursor = Cursors.Hand,
            Margin = new Padding(6, 0, 0, 0)
        };
        _btnConfirmar.FlatAppearance.BorderSize = 0;
        _btnConfirmar.Click += (_, _) => TryConfirmar();

        btnPanel.Controls.Add(btnCancelar, 0, 0);
        btnPanel.Controls.Add(_btnConfirmar, 1, 0);

        AcceptButton = _btnConfirmar;
        CancelButton = btnCancelar;

        var contentPad = new Panel { Dock = DockStyle.Fill };
        contentPad.Controls.Add(keypad);
        contentPad.Controls.Add(_txtCodigo);
        contentPad.Controls.Add(lblSubtitulo);

        Controls.Add(contentPad);
        Controls.Add(btnPanel);
        Controls.Add(header);
    }

    private TableLayoutPanel BuildKeypad()
    {
        var grid = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 3,
            RowCount = 4,
            Padding = new Padding(40, 16, 40, 8)
        };
        for (int i = 0; i < 3; i++) grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.33f));
        for (int i = 0; i < 4; i++) grid.RowStyles.Add(new RowStyle(SizeType.Percent, 25f));

        void AddDigit(string texto, int col, int row)
        {
            var btn = new Button
            {
                Text = texto,
                Dock = DockStyle.Fill,
                Margin = new Padding(4),
                Font = new Font("Segoe UI", 14f, FontStyle.Bold),
                FlatStyle = FlatStyle.Flat,
                BackColor = Color.FromArgb(245, 247, 250),
                Cursor = Cursors.Hand
            };
            btn.FlatAppearance.BorderColor = Color.FromArgb(220, 225, 232);
            btn.Click += (_, _) => AppendDigit(texto);
            grid.Controls.Add(btn, col, row);
        }

        AddDigit("1", 0, 0); AddDigit("2", 1, 0); AddDigit("3", 2, 0);
        AddDigit("4", 0, 1); AddDigit("5", 1, 1); AddDigit("6", 2, 1);
        AddDigit("7", 0, 2); AddDigit("8", 1, 2); AddDigit("9", 2, 2);

        var btnClear = new Button
        {
            Text = "Limpar",
            Dock = DockStyle.Fill,
            Margin = new Padding(4),
            Font = new Font("Segoe UI", 9.5f),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(245, 247, 250),
            Cursor = Cursors.Hand
        };
        btnClear.FlatAppearance.BorderColor = Color.FromArgb(220, 225, 232);
        btnClear.Click += (_, _) => _txtCodigo.Clear();
        grid.Controls.Add(btnClear, 0, 3);

        AddDigit("0", 1, 3);

        var btnBack = new Button
        {
            Text = "⌫",
            Dock = DockStyle.Fill,
            Margin = new Padding(4),
            Font = new Font("Segoe UI", 14f),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(245, 247, 250),
            Cursor = Cursors.Hand
        };
        btnBack.FlatAppearance.BorderColor = Color.FromArgb(220, 225, 232);
        btnBack.Click += (_, _) =>
        {
            if (_txtCodigo.Text.Length > 0)
                _txtCodigo.Text = _txtCodigo.Text[..^1];
        };
        grid.Controls.Add(btnBack, 2, 3);

        return grid;
    }

    private void AppendDigit(string d)
    {
        if (_txtCodigo.Text.Length < 4)
            _txtCodigo.Text += d;
    }

    private void TryConfirmar()
    {
        if (_txtCodigo.Text.Trim().Length != 4)
        {
            MessageBox.Show("Informe os 4 dígitos do código.", "OpenCheck", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }
        DialogResult = DialogResult.OK;
        Close();
    }

    protected override void OnShown(EventArgs e)
    {
        base.OnShown(e);
        _txtCodigo.Focus();
    }
}
