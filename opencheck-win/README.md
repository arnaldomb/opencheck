# OpenCheck Windows

Aplicativo Windows instalado no computador da loja para registrar:

- Check-in (abertura da loja, se o código for de operador; entrada da visita, se for de supervisor)
- Check-out (fechamento da loja, ou saída da visita)
- AUX (equivalente ao antigo botão de pânico, com rótulo neutro)

Toda a identificação de quem está agindo (operador ou supervisor) e a decisão de qual ação executar ficam no servidor — o app só coleta um código de 4 dígitos e mostra o resultado.

## Comportamento (igual ao app anterior, alerta-vigia-win)

- Roda residente na **bandeja do sistema** — o processo continua vivo mesmo com a janela fechada.
- O menu da bandeja **não tem opção de sair** (só "Abrir OpenCheck" e "Configurações"), assim como o app anterior.
- A janela **Status** (CHECK-IN / CHECK-OUT / AUX + últimos eventos) é uma janela comum: pode ser movida, minimizada e fechada normalmente. Fechar a janela não encerra o app — clique duplo no ícone da bandeja (ou "Abrir OpenCheck" no menu) reabre.
- **Inicia automaticamente com o Windows** — o instalador grava a entrada no Registro sempre, sem checkbox opcional.
- O atalho do AUX (padrão `Ctrl+Alt+P`) funciona mesmo com a janela Status fechada.

## Estrutura

```
opencheck-win/
  src/
    OpenCheck.Common/   — cliente HTTP da Field API, modelos, gerenciador de atalhos globais
    OpenCheck.Kiosk/
      MainTrayContext.cs — contexto raiz: ícone da bandeja, atalho global do AUX, abre/fecha a janela Status
      Forms/              — MainForm (janela Status), CodeEntryForm (diálogo de código), SettingsForm
  installer/             — script Inno Setup (setup.iss) + ícone + licença
```

## Build

Requer .NET 8 SDK (Windows) e Visual Studio 2022 ou `dotnet` CLI.

```bash
dotnet build opencheck-win.sln -c Release
```

O executável fica em `src/OpenCheck.Kiosk/bin/Release/net8.0-windows/OpenCheck.exe`.

## Configuração

O app inicia direto na bandeja; se ainda não configurado, mostra um aviso (balão) sugerindo configurar. Pela bandeja, em **Configurações**, é preciso informar:

- **API URL** — ex.: `https://api.opencheck.ggtronic.com.br`
- **Agent Key do Ponto** — a chave `oc_...` gerada no painel web em Pontos, para a loja onde o computador está instalado
- **Tipo de evento AUX** e **atalho de teclado** (padrão: `Ctrl+Alt+P`)

Depois de configurado, o app não pede mais nada nas telas do dia a dia — os operadores/supervisores só digitam o código de 4 dígitos na janela Status.

O arquivo de configuração fica em `%LOCALAPPDATA%\OpenCheck\config.json`; o histórico de eventos em `%LOCALAPPDATA%\OpenCheck\eventos.log`.

## Instalador

Gerado com [Inno Setup 6](https://jrsoftware.org/isinfo.php):

```bash
cd installer
iscc setup.iss
```

Gera `installer/output/OpenCheck_Setup_1.0.0.exe`. O instalador:

- Instala em Program Files e cria os atalhos do Menu Iniciar / Desinstalar, igual a qualquer programa comum
- Detecta instalação anterior e oferece reparar/atualizar ou remover
- Cria atalho opcional na Área de Trabalho
- Grava a entrada no Registro para iniciar com o Windows automaticamente (sempre, sem checkbox)

## Contrato de API usado

Ver `postman.json` na raiz do repositório — pasta **"2. Check-in / Check-out"** é o contrato usado por este app:

- `GET /api/field/v1/config` — nome da loja/empresa para o título da janela
- `POST /api/field/v1/abertura/checkin` — `{ codigo, nomeComputador, usuarioWindows }`
- `POST /api/field/v1/abertura/fechamento` — mesmo formato
- `POST /api/field/v1/panico` — `{ tipo, observacao }`, sem código (ligado ao ponto, não a uma pessoa)

Todas as requisições usam o header `x-agent-key` com a Agent Key do Ponto.
