using System.Text.Json.Serialization;

namespace OpenCheck.Common.Models;

public class PontoInfo
{
    [JsonPropertyName("id")]
    public string? Id { get; set; }

    [JsonPropertyName("nome")]
    public string? Nome { get; set; }
}

public class EmpresaInfo
{
    [JsonPropertyName("id")]
    public string? Id { get; set; }

    [JsonPropertyName("nome")]
    public string? Nome { get; set; }
}

public class AtorInfo
{
    [JsonPropertyName("id")]
    public string? Id { get; set; }

    [JsonPropertyName("nome")]
    public string? Nome { get; set; }

    // OPERADOR | SUPERVISOR
    [JsonPropertyName("tipo")]
    public string? Tipo { get; set; }
}

public class ConfigResponse
{
    [JsonPropertyName("ponto")]
    public PontoInfo? Ponto { get; set; }

    [JsonPropertyName("empresa")]
    public EmpresaInfo? Empresa { get; set; }
}

public class AberturaRequest
{
    [JsonPropertyName("codigo")]
    public string Codigo { get; set; } = string.Empty;

    [JsonPropertyName("nomeComputador")]
    public string? NomeComputador { get; set; }

    [JsonPropertyName("usuarioWindows")]
    public string? UsuarioWindows { get; set; }
}

// Resposta unificada de POST /abertura/checkin e /abertura/fechamento.
// Sucesso e erro usam o mesmo formato JSON (aceito/mensagem/erro), então um
// único modelo cobre os dois casos sem precisar ramificar por status HTTP.
public class AcaoResult
{
    [JsonPropertyName("aceito")]
    public bool Aceito { get; set; }

    // ABERTURA | FECHAMENTO | ENTRADA | SAIDA
    [JsonPropertyName("tipo")]
    public string? Tipo { get; set; }

    // NO_PRAZO | ATRASADO — só quando o ator é operador
    [JsonPropertyName("status")]
    public string? Status { get; set; }

    [JsonPropertyName("erro")]
    public string? Erro { get; set; }

    [JsonPropertyName("mensagem")]
    public string? Mensagem { get; set; }

    [JsonPropertyName("ponto")]
    public PontoInfo? Ponto { get; set; }

    [JsonPropertyName("registradoPor")]
    public AtorInfo? RegistradoPor { get; set; }
}

public class PanicoRequest
{
    // PANICO | PANICO_SILENCIOSO | COACAO
    [JsonPropertyName("tipo")]
    public string? Tipo { get; set; }

    [JsonPropertyName("observacao")]
    public string? Observacao { get; set; }
}

public class AuxResult
{
    [JsonPropertyName("aceito")]
    public bool Aceito { get; set; }

    [JsonPropertyName("erro")]
    public string? Erro { get; set; }

    [JsonPropertyName("mensagem")]
    public string? Mensagem { get; set; }

    [JsonPropertyName("tipo")]
    public string? Tipo { get; set; }

    [JsonPropertyName("codigoEvento")]
    public string? CodigoEvento { get; set; }

    [JsonPropertyName("eventoId")]
    public string? EventoId { get; set; }
}
