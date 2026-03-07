$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

function New-RoundedRectPath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2

  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-PointF {
  param(
    [float]$X,
    [float]$Y
  )

  return New-Object System.Drawing.PointF($X, $Y)
}

$root = Split-Path -Parent $PSScriptRoot
$assetDir = Join-Path $root "desktop\assets"
$pngPath = Join-Path $assetDir "icon.png"
$icoPath = Join-Path $assetDir "icon.ico"
$size = 256

New-Item -ItemType Directory -Force -Path $assetDir | Out-Null

$bitmap = New-Object System.Drawing.Bitmap($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)

try {
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.Clear([System.Drawing.Color]::FromArgb(255, 7, 15, 29))

  $backgroundPath = New-RoundedRectPath -X 10 -Y 10 -Width 236 -Height 236 -Radius 56
  $backgroundBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-PointF 12 12),
    (New-PointF 244 244),
    [System.Drawing.Color]::FromArgb(255, 8, 32, 58),
    [System.Drawing.Color]::FromArgb(255, 18, 96, 110)
  )
  $graphics.FillPath($backgroundBrush, $backgroundPath)

  $glowBrushA = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(70, 88, 196, 255))
  $glowBrushB = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(80, 255, 196, 86))
  $graphics.FillEllipse($glowBrushA, 26, 18, 140, 140)
  $graphics.FillEllipse($glowBrushB, 112, 134, 120, 120)

  $shadowPath = New-RoundedRectPath -X 62 -Y 114 -Width 132 -Height 88 -Radius 28
  $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(60, 0, 0, 0))
  $graphics.TranslateTransform(0, 7)
  $graphics.FillPath($shadowBrush, $shadowPath)
  $graphics.ResetTransform()

  $swooshPenA = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(245, 126, 239, 255), 12)
  $swooshPenA.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $swooshPenA.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $swooshPenA.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $graphics.DrawCurve($swooshPenA, [System.Drawing.PointF[]]@(
      (New-PointF 34 102),
      (New-PointF 78 76),
      (New-PointF 132 88),
      (New-PointF 194 58),
      (New-PointF 222 44)
    ))

  $swooshPenB = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(225, 179, 255, 244), 9)
  $swooshPenB.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $swooshPenB.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $swooshPenB.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $graphics.DrawCurve($swooshPenB, [System.Drawing.PointF[]]@(
      (New-PointF 42 128),
      (New-PointF 88 110),
      (New-PointF 136 118),
      (New-PointF 188 96),
      (New-PointF 220 82)
    ))

  $swooshPenC = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(205, 219, 255, 250), 6)
  $swooshPenC.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $swooshPenC.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $swooshPenC.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $graphics.DrawCurve($swooshPenC, [System.Drawing.PointF[]]@(
      (New-PointF 56 152),
      (New-PointF 104 138),
      (New-PointF 152 142),
      (New-PointF 202 126)
    ))

  $toolPath = New-RoundedRectPath -X 62 -Y 116 -Width 132 -Height 88 -Radius 26
  $toolBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-PointF 70 118),
    (New-PointF 184 202),
    [System.Drawing.Color]::FromArgb(255, 255, 177, 60),
    [System.Drawing.Color]::FromArgb(255, 255, 108, 55)
  )
  $graphics.FillPath($toolBrush, $toolPath)

  $toolHighlight = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(55, 255, 255, 255))
  $graphics.FillEllipse($toolHighlight, 84, 124, 92, 38)

  $toolBorder = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(210, 255, 246, 222), 5)
  $toolBorder.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $graphics.DrawPath($toolBorder, $toolPath)

  $handlePath = New-RoundedRectPath -X 102 -Y 82 -Width 52 -Height 28 -Radius 14
  $handleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(240, 255, 232, 196))
  $handleBorder = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(220, 255, 246, 222), 4)
  $graphics.FillPath($handleBrush, $handlePath)
  $graphics.DrawPath($handleBorder, $handlePath)

  $latchBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(240, 255, 247, 228))
  $graphics.FillEllipse($latchBrush, 113, 146, 30, 18)

  $slashPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(210, 255, 248, 239), 8)
  $slashPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $slashPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLine($slashPen, 152, 138, 178, 160)

  $sparkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(200, 255, 255, 255))
  $graphics.FillEllipse($sparkBrush, 184, 70, 10, 10)
  $graphics.FillEllipse($sparkBrush, 198, 86, 6, 6)

  $framePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(100, 255, 255, 255), 3)
  $graphics.DrawPath($framePen, $backgroundPath)

  $bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
  $stream = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
  $writer = New-Object System.IO.BinaryWriter($stream)

  try {
    $writer.Write([UInt16]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]1)
    $writer.Write([Byte]0)
    $writer.Write([Byte]0)
    $writer.Write([Byte]0)
    $writer.Write([Byte]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]32)
    $writer.Write([UInt32]$pngBytes.Length)
    $writer.Write([UInt32]22)
    $writer.Write($pngBytes)
  } finally {
    $writer.Dispose()
    $stream.Dispose()
  }
} finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}

Write-Host "Generated icon files:"
Write-Host " - $pngPath"
Write-Host " - $icoPath"
