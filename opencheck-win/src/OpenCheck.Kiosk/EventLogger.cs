namespace OpenCheck.Kiosk;

public class EventEntry
{
    public DateTime Quando { get; }
    public bool Sucesso { get; }
    public string Mensagem { get; }

    public EventEntry(DateTime quando, bool sucesso, string mensagem)
    {
        Quando = quando;
        Sucesso = sucesso;
        Mensagem = mensagem;
    }
}

// Painel "Últimos Eventos" da tela principal: mantém as últimas entradas em
// memória (mais recente primeiro) e persiste tudo em disco para auditoria.
public class EventLogger
{
    private const int MaxEmMemoria = 100;

    private static readonly string LogPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "OpenCheck", "eventos.log");

    private readonly object _lock = new();
    private readonly List<EventEntry> _entradas = [];

    public event Action<EventEntry>? EntradaAdicionada;

    public IReadOnlyList<EventEntry> Entradas
    {
        get { lock (_lock) return _entradas.ToList(); }
    }

    public void Registrar(bool sucesso, string mensagem)
    {
        var entrada = new EventEntry(DateTime.Now, sucesso, mensagem);
        lock (_lock)
        {
            _entradas.Insert(0, entrada);
            if (_entradas.Count > MaxEmMemoria) _entradas.RemoveAt(_entradas.Count - 1);
        }

        try
        {
            var dir = Path.GetDirectoryName(LogPath)!;
            Directory.CreateDirectory(dir);
            var linha = $"{entrada.Quando:dd/MM/yyyy HH:mm:ss} | {(sucesso ? "OK" : "ERRO")} | {mensagem}";
            File.AppendAllLines(LogPath, [linha]);
        }
        catch { }

        EntradaAdicionada?.Invoke(entrada);
    }
}
