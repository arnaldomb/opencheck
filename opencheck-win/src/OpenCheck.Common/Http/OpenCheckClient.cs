using System.Net.Http.Json;
using System.Text.Json;
using OpenCheck.Common.Models;

namespace OpenCheck.Common.Http;

// Cliente da Field API (/api/field/v1). Toda a identificação de loja vem da
// agentKeyPonto no header; check-in/check-out usam apenas um código de 4
// dígitos — o servidor decide se é abertura/fechamento (operador) ou
// entrada/saída de visita (supervisor).
public class OpenCheckClient
{
    private readonly HttpClient _http;

    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public OpenCheckClient(string apiUrl, string agentKeyPonto)
    {
        _http = new HttpClient
        {
            BaseAddress = new Uri(apiUrl.TrimEnd('/') + "/api/field/v1/"),
            Timeout = TimeSpan.FromSeconds(15)
        };
        _http.DefaultRequestHeaders.Add("x-agent-key", agentKeyPonto);
    }

    public async Task<ConfigResponse?> GetConfigAsync(CancellationToken ct = default)
    {
        var resp = await _http.GetAsync("config", ct);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadFromJsonAsync<ConfigResponse>(Json, ct);
    }

    public async Task<bool> TestConnectionAsync(CancellationToken ct = default)
    {
        try
        {
            var resp = await _http.GetAsync("config", ct);
            return resp.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }

    public Task<AcaoResult> CheckInAsync(string codigo, string? nomeComputador, string? usuarioWindows, CancellationToken ct = default) =>
        PostAcaoAsync("abertura/checkin", codigo, nomeComputador, usuarioWindows, ct);

    public Task<AcaoResult> CheckOutAsync(string codigo, string? nomeComputador, string? usuarioWindows, CancellationToken ct = default) =>
        PostAcaoAsync("abertura/fechamento", codigo, nomeComputador, usuarioWindows, ct);

    private async Task<AcaoResult> PostAcaoAsync(string path, string codigo, string? nomeComputador, string? usuarioWindows, CancellationToken ct)
    {
        var body = new AberturaRequest { Codigo = codigo, NomeComputador = nomeComputador, UsuarioWindows = usuarioWindows };
        var resp = await _http.PostAsJsonAsync(path, body, Json, ct);
        var result = await ReadJsonSafeAsync<AcaoResult>(resp, ct);
        return result ?? new AcaoResult { Aceito = false, Mensagem = "Resposta vazia do servidor" };
    }

    public async Task<AuxResult> SendAuxAsync(string tipo, string? observacao, CancellationToken ct = default)
    {
        var body = new PanicoRequest { Tipo = tipo, Observacao = observacao };
        var resp = await _http.PostAsJsonAsync("panico", body, Json, ct);
        var result = await ReadJsonSafeAsync<AuxResult>(resp, ct);
        return result ?? new AuxResult { Aceito = false, Mensagem = "Resposta vazia do servidor" };
    }

    // O corpo de erro do servidor (400/401/404/409) usa o mesmo formato JSON
    // da resposta de sucesso, então lemos o corpo independente do status HTTP.
    private static async Task<T?> ReadJsonSafeAsync<T>(HttpResponseMessage resp, CancellationToken ct)
    {
        try
        {
            return await resp.Content.ReadFromJsonAsync<T>(Json, ct);
        }
        catch
        {
            return default;
        }
    }
}
