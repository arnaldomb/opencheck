# OpenCheck Windows — App de Quiosque

Aplicativo Windows instalado no computador da loja para registrar, em modo quiosque:

- Check-in (abertura da loja, se o código for de operador; entrada da visita, se for de supervisor)
- Check-out (fechamento da loja, ou saída da visita)
- AUX (equivalente ao antigo botão de pânico, com rótulo neutro)

Toda a identificação de quem está agindo (operador ou supervisor) e a decisão de qual ação executar ficam no servidor — o app só coleta um código de 4 dígitos e mostra o resultado.

## Estrutura

```
opencheck-win/
  src/
    OpenCheck.Common/   — cliente HTTP da Field API, modelos, gerenciador de atalhos globais
    OpenCheck.Kiosk/     — app WinForms (tela principal, diálogo de código, configurações)
  installer/             — script Inno Setup (setup.iss) + ícone + licença
```

## Build

Requer .NET 8 SDK (Windows) e Visual Studio 2022 ou `dotnet` CLI.

```bash
dotnet build opencheck-win.sln -c Release
```

O executável fica em `src/OpenCheck.Kiosk/bin/Release/net8.0-windows/OpenCheck.exe`.

## Configuração

Na primeira execução (ou enquanto a Agent Key não estiver preenchida), o app abre a tela de Configurações automaticamente. É preciso informar:

- **API URL** — ex.: `https://api.opencheck.ggtronic.com.br`
- **Agent Key do Ponto** — a chave `oc_...` gerada no painel web em Pontos, para a loja onde o computador está instalado
- **Tela cheia** — liga o modo quiosque (sem bordas, maximizado); pode ser desligado para testes locais
- **Tipo de evento AUX** e **atalho de teclado** (padrão: `Ctrl+Alt+P`)

Depois de configurado, o app não pede mais nada nas telas do dia a dia — os operadores/supervisores só digitam o código de 4 dígitos.

O arquivo de configuração fica em `%LOCALAPPDATA%\OpenCheck\config.json`; o histórico de eventos em `%LOCALAPPDATA%\OpenCheck\eventos.log`.

## Instalador

Gerado com [Inno Setup 6](https://jrsoftware.org/isinfo.php):

```bash
cd installer
iscc setup.iss
```

Gera `installer/output/OpenCheck_Setup_1.0.0.exe`. O instalador:

- Detecta instalação anterior e oferece reparar/atualizar ou remover
- Cria atalho opcional na Área de Trabalho
- Cria entrada opcional no Registro para iniciar com o Windows (recomendado para quiosque)

## Contrato de API usado

Ver `postman.json` na raiz do repositório — pasta **"2. Check-in / Check-out"** é o contrato usado por este app:

- `GET /api/field/v1/config` — nome da loja/empresa para o título da tela
- `POST /api/field/v1/abertura/checkin` — `{ codigo, nomeComputador, usuarioWindows }`
- `POST /api/field/v1/abertura/fechamento` — mesmo formato
- `POST /api/field/v1/panico` — `{ tipo, observacao }`, sem código (ligado ao ponto, não a uma pessoa)

Todas as requisições usam o header `x-agent-key` com a Agent Key do Ponto.
