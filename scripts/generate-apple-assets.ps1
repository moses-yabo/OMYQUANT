# Reproduce Apple launch PNGs using the existing logo. No network or AI assets.
# Run from the repository root with Windows PowerShell/System.Drawing.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$repoRoot = Split-Path -Parent $PSScriptRoot
$assetRoot = Join-Path $repoRoot 'public'
$splashRoot = Join-Path $assetRoot 'images/apple-startup-v1'
New-Item -ItemType Directory -Path $splashRoot -Force | Out-Null
$sizes = Get-Content -LiteralPath (Join-Path $repoRoot 'app/lib/apple-startup-sizes.json') -Raw | ConvertFrom-Json
$logo = [System.Drawing.Image]::FromFile((Join-Path $assetRoot 'images/favicon.png'))
function Write-ApplePng([int]$Width, [int]$Height, [int]$LogoSize, [string]$Destination) {
  # RGB PNGs have no alpha/transparency for Apple home-screen compatibility.
  $bitmap = [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([System.Drawing.Color]::White)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage($logo, [int](($Width - $LogoSize) / 2), [int](($Height - $LogoSize) / 2), $LogoSize, $LogoSize)
    $bitmap.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
try {
  Write-ApplePng 180 180 180 (Join-Path $assetRoot 'apple-touch-icon.png')
  Write-ApplePng 180 180 180 (Join-Path $assetRoot 'apple-touch-icon-precomposed.png')
  foreach ($size in $sizes) {
    $width = [int]($size.width * $size.scale)
    $height = [int]($size.height * $size.scale)
    $logoSize = [int][Math]::Round($width * .26)
    Write-ApplePng $width $height $logoSize (Join-Path $splashRoot "$($width)x$($height).png")
    Write-ApplePng $height $width $logoSize (Join-Path $splashRoot "$($height)x$($width).png")
  }
} finally { $logo.Dispose() }
Write-Output "Generated opaque Apple icons and $($sizes.Count * 2) portrait/landscape startup images."
