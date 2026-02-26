Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipPath   = "D:\Worksync\VibeCoding\pnl-dashboard\public\downloads\pnl-sync.zip"
$pluginDir = "D:\Worksync\VibeCoding\pnl-dashboard\wordpress-plugin\pnl-sync"

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$zipStream = [System.IO.File]::Create($zipPath)
$archive   = New-Object System.IO.Compression.ZipArchive($zipStream, [System.IO.Compression.ZipArchiveMode]::Create)

$files = @(
    @{ src = "$pluginDir\pnl-sync.php";                       entry = "pnl-sync/pnl-sync.php" },
    @{ src = "$pluginDir\includes\class-pnl-auth.php";        entry = "pnl-sync/includes/class-pnl-auth.php" },
    @{ src = "$pluginDir\includes\class-pnl-product-api.php"; entry = "pnl-sync/includes/class-pnl-product-api.php" },
    @{ src = "$pluginDir\includes\class-pnl-order-api.php";   entry = "pnl-sync/includes/class-pnl-order-api.php" },
    @{ src = "$pluginDir\includes\class-pnl-webhook.php";     entry = "pnl-sync/includes/class-pnl-webhook.php" },
    @{ src = "$pluginDir\admin\class-pnl-settings.php";       entry = "pnl-sync/admin/class-pnl-settings.php" }
)

foreach ($f in $files) {
    $entry       = $archive.CreateEntry($f.entry, [System.IO.Compression.CompressionLevel]::Optimal)
    $entryStream = $entry.Open()
    $fileBytes   = [System.IO.File]::ReadAllBytes($f.src)
    $entryStream.Write($fileBytes, 0, $fileBytes.Length)
    $entryStream.Close()
    Write-Host "Added: $($f.entry)"
}

$archive.Dispose()
$zipStream.Close()
Write-Host ""
Write-Host "Done: $zipPath"
