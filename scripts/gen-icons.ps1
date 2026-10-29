# 生成 CampusFlow 应用图标（PWA / Tauri / Capacitor 共用设计）
# 设计：圆角方块（主题蓝）+ 白色日历图形
param([int]$size = 512, [string]$outPath)

Add-Type -AssemblyName System.Drawing

function New-Icon([int]$px, [string]$path, [bool]$rounded = $true) {
  $bmp = New-Object System.Drawing.Bitmap($px, $px)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $s = $px / 512.0
  # 背景：奶油白圆角方块 + 蓝色圆角内块
  $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(250, 247, 241))
  $blueBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(59, 130, 246))
  $whiteBrush = [System.Drawing.Brushes]::White
  $amberBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 158, 11))

  if ($rounded) {
    $bgRect = New-Object System.Drawing.Drawing2D.GraphicsPath
    $r = 96 * $s
    $bgRect.AddArc(0, 0, $r, $r, 180, 90)
    $bgRect.AddArc($px - $r, 0, $r, $r, 270, 90)
    $bgRect.AddArc($px - $r, $px - $r, $r, $r, 0, 90)
    $bgRect.AddArc(0, $px - $r, $r, $r, 90, 90)
    $bgRect.CloseFigure()
    $g.FillPath($bgBrush, $bgRect)

    $inner = New-Object System.Drawing.Drawing2D.GraphicsPath
    $m = 44 * $s
    $iw = $px - 2 * $m
    $inner.AddArc($m, $m, $r * 0.75, $r * 0.75, 180, 90)
    $inner.AddArc($m + $iw - $r * 0.75, $m, $r * 0.75, $r * 0.75, 270, 90)
    $inner.AddArc($m + $iw - $r * 0.75, $m + $iw - $r * 0.75, $r * 0.75, $r * 0.75, 0, 90)
    $inner.AddArc($m, $m + $iw - $r * 0.75, $r * 0.75, $r * 0.75, 90, 90)
    $inner.CloseFigure()
    $g.FillPath($blueBrush, $inner)

    # 日历：白色表头横线 + 三个日期点 + 顶部两个环
    $hdrH = 96 * $s
    $hdr = New-Object System.Drawing.Drawing2D.GraphicsPath
    $r2 = 28 * $s
    $hdr.AddArc($m, $m, $r2, $r2, 180, 90)
    $hdr.AddArc($m + $iw - $r2, $m, $r2, $r2, 270, 90)
    $hdr.AddArc($m + $iw - $r2, $m + $hdrH - $r2, $r2, $r2, 0, 90)
    $hdr.AddArc($m, $m + $hdrH - $r2, $r2, $r2, 90, 90)
    $hdr.CloseFigure()
    $g.FillPath($whiteBrush, $hdr)

    # 环
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, (26 * $s))
    $pen.StartCap = "Round"; $pen.EndCap = "Round"
    $y1 = $m - 6 * $s; $y2 = $m + 20 * $s
    $g.DrawLine($pen, ($m + 110 * $s), $y1, ($m + 110 * $s), $y2)
    $g.DrawLine($pen, ($m + $iw - 110 * $s), $y1, ($m + $iw - 110 * $s), $y2)

    # 日期点
    $dot = 30 * $s
    $rowY = $m + $hdrH + 56 * $s
    $g.FillEllipse($whiteBrush, ($m + 72 * $s), $rowY, $dot, $dot)
    $g.FillEllipse($amberBrush, ($m + $iw / 2 - $dot / 2), $rowY, $dot, $dot)
    $g.FillEllipse($whiteBrush, ($m + $iw - 72 * $s - $dot), $rowY, $dot, $dot)
  } else {
    $g.FillRectangle($blueBrush, 0, 0, $px, $px)
    $g.FillRectangle($whiteBrush, ($px * 0.2), ($px * 0.22), ($px * 0.6), ($px * 0.2))
    $g.FillEllipse($whiteBrush, ($px * 0.28), ($px * 0.5), ($px * 0.12), ($px * 0.12))
    $g.FillEllipse($amberBrush, ($px * 0.44), ($px * 0.5), ($px * 0.12), ($px * 0.12))
    $g.FillEllipse($whiteBrush, ($px * 0.6), ($px * 0.5), ($px * 0.12), ($px * 0.12))
  }

  $dir = Split-Path -Parent $path
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Host "OK $path ($px px)"
}

New-Icon 512 "$outPath\icon-512.png" $true
New-Icon 192 "$outPath\icon-192.png" $true
New-Icon 512 "$outPath\icon.png" $true
New-Icon 128 "$outPath\128x128.png" $true
New-Icon 32 "$outPath\32x32.png" $true
New-Icon 180 "$outPath\apple-touch-icon.png" $true
New-Icon 256 "$outPath\icon-256-no-round.png" $false

# 生成 ICO（多尺寸）
$icoSizes = @(16, 32, 48, 256)
$icoBmp = New-Object System.Drawing.Bitmap(256, 256)
$g2 = [System.Drawing.Graphics]::FromImage($icoBmp)
$g2.Clear([System.Drawing.Color]::Transparent)
$g2.Dispose()
# 简化：从 256px PNG 构造 Icon
$src = [System.Drawing.Image]::FromFile("$outPath\icon-256-no-round.png")
$hIcon = $src.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$fs = New-Object System.IO.FileStream("$outPath\icon.ico", [System.IO.FileMode]::Create)
$icon.Save($fs)
$fs.Close()
$src.Dispose()
Write-Host "OK $outPath\icon.ico"
