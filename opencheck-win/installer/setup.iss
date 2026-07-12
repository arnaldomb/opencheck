#define MyAppName      "OpenCheck"
#define MyAppVersion   "1.0.0"
#define MyAppPublisher "ggtronic.com.br"
#define MyAppURL       "https://opencheck.ggtronic.com.br"
#define MyAppExeName   "OpenCheck.exe"
#define MyAppId        "{{F4A8D3E2-7C1B-4A9F-8E2D-3B6C9A0F1D2E}"
#define BuildDir       "..\src\OpenCheck.Kiosk\bin\Release\net8.0-windows"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\OpenCheck
DefaultGroupName=ggtronic.com.br
DisableProgramGroupPage=yes
LicenseFile=.\License.rtf
SetupIconFile=.\app.ico
OutputDir=.\output
OutputBaseFilename=OpenCheck_Setup_{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=120
PrivilegesRequired=admin
UninstallDisplayName={#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}
MinVersion=10.0
ArchitecturesInstallIn64BitMode=x64compatible
ShowLanguageDialog=no
CloseApplications=yes
CloseApplicationsFilter=*{#MyAppExeName}
RestartApplications=no

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na Área de Trabalho"; GroupDescription: "Atalhos adicionais:"
Name: "autostart";   Description: "Iniciar automaticamente com o Windows (recomendado para quiosque)"; GroupDescription: "Inicialização:"; Flags: checkedonce

[Files]
Source: "{#BuildDir}\{#MyAppExeName}";                DestDir: "{app}"; Flags: ignoreversion
Source: "{#BuildDir}\OpenCheck.dll";                  DestDir: "{app}"; Flags: ignoreversion
Source: "{#BuildDir}\OpenCheck.Common.dll";           DestDir: "{app}"; Flags: ignoreversion
Source: "{#BuildDir}\OpenCheck.deps.json";            DestDir: "{app}"; Flags: ignoreversion
Source: "{#BuildDir}\OpenCheck.runtimeconfig.json";   DestDir: "{app}"; Flags: ignoreversion
Source: "{#BuildDir}\*.dll";                          DestDir: "{app}"; Flags: ignoreversion recursesubdirs

[Icons]
Name: "{group}\OpenCheck";             Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{group}\Desinstalar OpenCheck"; Filename: "{uninstallexe}"
Name: "{commondesktop}\OpenCheck";     Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
Root: HKLM; Subkey: "SOFTWARE\Microsoft\Windows\CurrentVersion\Run"; \
    ValueType: string; ValueName: "OpenCheck"; \
    ValueData: """{app}\{#MyAppExeName}"""; \
    Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{app}\{#MyAppExeName}"; \
    Description: "Iniciar o OpenCheck agora"; \
    Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "taskkill"; Parameters: "/f /im {#MyAppExeName}"; \
    Flags: runhidden waituntilterminated; RunOnceId: "KillApp"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]

var
  UpgradePage: TInputOptionWizardPage;
  IsAlreadyInstalled: Boolean;

function GetUninstallString(): String;
var
  sUnInstPath: String;
  sUnInstallString: String;
begin
  sUnInstPath := ExpandConstant('Software\Microsoft\Windows\CurrentVersion\Uninstall\{#emit SetupSetting("AppId")}_is1');
  sUnInstallString := '';
  if not RegQueryStringValue(HKLM, sUnInstPath, 'UninstallString', sUnInstallString) then
    RegQueryStringValue(HKCU, sUnInstPath, 'UninstallString', sUnInstallString);
  Result := sUnInstallString;
end;

function IsUpgrade(): Boolean;
begin
  Result := (GetUninstallString() <> '');
end;

function InitializeSetup(): Boolean;
begin
  IsAlreadyInstalled := IsUpgrade();
  Result := True;
end;

procedure InitializeWizard();
begin
  UpgradePage := CreateInputOptionPage(
    wpLicense,
    'Manutenção do OpenCheck',
    'O OpenCheck já está instalado neste computador.',
    'Selecione a operação desejada e clique em Avançar:',
    True,
    False
  );
  UpgradePage.Add('Reparar / Atualizar a instalação atual');
  UpgradePage.Add('Remover o OpenCheck deste computador');
  UpgradePage.SelectedValueIndex := 0;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  if PageID = UpgradePage.ID then
    Result := not IsAlreadyInstalled;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  UninstStr: String;
  ResultCode: Integer;
begin
  Result := True;
  if (CurPageID = UpgradePage.ID) and (UpgradePage.SelectedValueIndex = 1) then
  begin
    if MsgBox(
      'Confirma a remoção do OpenCheck?' + #13#10 + #13#10 +
      'Todos os arquivos do programa serão removidos.',
      mbConfirmation, MB_YESNO) = IDYES then
    begin
      UninstStr := RemoveQuotes(GetUninstallString());
      Exec(UninstStr, '/SILENT', '', SW_SHOW, ewWaitUntilTerminated, ResultCode);
      WizardForm.Close();
    end;
    Result := False;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssInstall then
    Exec('taskkill', '/f /im {#MyAppExeName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ResultCode: Integer;
begin
  if CurUninstallStep = usUninstall then
    Exec('taskkill', '/f /im {#MyAppExeName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;
