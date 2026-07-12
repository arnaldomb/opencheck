using System.Text.Json;
using System.Text.Json.Serialization;

namespace OpenCheck.Kiosk;

public class KioskConfiguration
{
    private static readonly string ConfigPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "OpenCheck", "config.json");

    private static readonly JsonSerializerOptions WriteOpts = new() { WriteIndented = true };

    [JsonPropertyName("apiUrl")]
    public string ApiUrl { get; set; } = "https://api.opencheck.ggtronic.com.br";

    [JsonPropertyName("agentKeyPonto")]
    public string AgentKeyPonto { get; set; } = string.Empty;

    [JsonPropertyName("pontoNome")]
    public string PontoNome { get; set; } = string.Empty;

    // PANICO | PANICO_SILENCIOSO | COACAO — tipo do evento enviado pelo botão AUX
    [JsonPropertyName("auxTipo")]
    public string AuxTipo { get; set; } = "PANICO_SILENCIOSO";

    // Ctrl+Alt+P = modifiers 0x0003, key 0x50
    [JsonPropertyName("auxHotkeyModifiers")]
    public uint AuxHotkeyModifiers { get; set; } = 0x0003;

    [JsonPropertyName("auxHotkeyKey")]
    public uint AuxHotkeyKey { get; set; } = 0x50;

    [JsonIgnore]
    public bool IsConfigured => !string.IsNullOrWhiteSpace(AgentKeyPonto) && !string.IsNullOrWhiteSpace(ApiUrl);

    [JsonIgnore]
    public string AuxHotkeyText => FormatHotkey(AuxHotkeyModifiers, AuxHotkeyKey);

    public static string FormatHotkey(uint modifiers, uint vk)
    {
        var parts = new List<string>();
        if ((modifiers & 0x0002) != 0) parts.Add("Ctrl");
        if ((modifiers & 0x0001) != 0) parts.Add("Alt");
        if ((modifiers & 0x0004) != 0) parts.Add("Shift");
        if ((modifiers & 0x0008) != 0) parts.Add("Win");
        if (vk is >= 0x41 and <= 0x5A) parts.Add(((char)vk).ToString());
        else if (vk is >= 0x70 and <= 0x7B) parts.Add($"F{vk - 0x6F}");
        return string.Join("+", parts);
    }

    public static KioskConfiguration Load()
    {
        try
        {
            if (File.Exists(ConfigPath))
            {
                var json = File.ReadAllText(ConfigPath);
                return JsonSerializer.Deserialize<KioskConfiguration>(json) ?? new KioskConfiguration();
            }
        }
        catch { }
        return new KioskConfiguration();
    }

    public void Save()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(ConfigPath)!);
        File.WriteAllText(ConfigPath, JsonSerializer.Serialize(this, WriteOpts));
    }
}
