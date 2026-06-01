param(
  [Parameter(Mandatory = $true)]
  [string]$WindowHandle
)

Start-Sleep -Seconds 1

$signature = @'
[DllImport("user32.dll")]
public static extern bool ShowWindowAsync(System.IntPtr hWnd, int nCmdShow);
'@

Add-Type -Name Window -Namespace Win32 -MemberDefinition $signature
$handle = [System.IntPtr]::new([Int64]$WindowHandle)
$null = [Win32.Window]::ShowWindowAsync($handle, 0)
