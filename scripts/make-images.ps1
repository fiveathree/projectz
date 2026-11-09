# 生成 favicon.svg / favicon.png / og.png（1200x630）
# 用 Windows 內置 System.Drawing，唔使裝任何嘢：  powershell -File scripts/make-images.ps1
Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot '..\public'

# 像素喪屍手（16x16）：# 膚色  d 陰影  r 血  g 地面
$hand = @(
  '................',
  '.......#........',
  '.....#.#.#......',
  '.....#.#.#......',
  '.....#.#.#.#....',
  '.....#.#.#.#....',
  '.....#######....',
  '..#..#######....',
  '..##.######d....',
  '...########d....',
  '....######d.....',
  '.....#####d.....',
  '.....##r##d.....',
  '...gg#rrrrgg....',
  '..ggggrrrrggggg.',
  '.gggggggggggggg.'
)
$colors = @{ '#' = '#7d9a6a'; 'd' = '#4f6844'; 'r' = '#6e1420'; 'g' = '#283040' }
$bg = '#07090d'

# favicon.svg
$rects = for ($y = 0; $y -lt 16; $y++) { for ($x = 0; $x -lt 16; $x++) {
  $c = $hand[$y][$x]; if ($colors.ContainsKey([string]$c)) { "<rect x=`"$x`" y=`"$y`" width=`"1`" height=`"1`" fill=`"$($colors[[string]$c])`"/>" } } }
$svg = "<svg xmlns=`"http://www.w3.org/2000/svg`" viewBox=`"0 0 16 16`" shape-rendering=`"crispEdges`"><rect width=`"16`" height=`"16`" rx=`"2`" fill=`"$bg`"/>$($rects -join '')</svg>"
[IO.File]::WriteAllText((Join-Path $out 'favicon.svg'), $svg)

function Draw-Hand($g, $ox, $oy, $s) {
  for ($y = 0; $y -lt 16; $y++) { for ($x = 0; $x -lt 16; $x++) {
    $c = [string]$hand[$y][$x]
    if ($colors.ContainsKey($c)) {
      $b = New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml($colors[$c]))
      $g.FillRectangle($b, $ox + $x * $s, $oy + $y * $s, $s, $s); $b.Dispose()
    } } }
}

# favicon.png（64x64）
$bmp = New-Object Drawing.Bitmap 64, 64
$g = [Drawing.Graphics]::FromImage($bmp)
$g.Clear([Drawing.ColorTranslator]::FromHtml($bg))
Draw-Hand $g 0 0 4
$bmp.Save((Join-Path $out 'favicon.png'), [Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()

# og.png（1200x630）
$W = 1200; $H = 630
$bmp = New-Object Drawing.Bitmap $W, $H
$g = [Drawing.Graphics]::FromImage($bmp)
$g.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAlias
$grad = New-Object Drawing.Drawing2D.LinearGradientBrush (New-Object Drawing.Point 0, 0), (New-Object Drawing.Point 0, $H), ([Drawing.ColorTranslator]::FromHtml('#161b2a')), ([Drawing.ColorTranslator]::FromHtml('#07090d'))
$g.FillRectangle($grad, 0, 0, $W, $H)
# 斜雨
$rnd = New-Object Random 7
$rain = New-Object Drawing.Pen ([Drawing.Color]::FromArgb(70, 57, 208, 216)), 2
for ($i = 0; $i -lt 160; $i++) { $x = $rnd.Next(-100, $W); $y = $rnd.Next(0, $H); $g.DrawLine($rain, $x, $y, $x + 14, $y + 34) }
# 地面 + 手
$g.FillRectangle((New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml('#1c2230'))), 0, 560, $W, 70)
Draw-Hand $g 70 118 28
# 字
$font = 'Microsoft JhengHei'
$white = New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml('#cfe3ea'))
$red = New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml('#e0384f'))
$grey = New-Object Drawing.SolidBrush ([Drawing.ColorTranslator]::FromHtml('#8a93a6'))
$g.DrawString('澳汐七日', (New-Object Drawing.Font $font, 110, ([Drawing.FontStyle]::Bold), ([Drawing.GraphicsUnit]::Pixel)), $white, 560, 130)
$g.DrawString('TYPHOON DEAD', (New-Object Drawing.Font 'Consolas', 64, ([Drawing.FontStyle]::Bold), ([Drawing.GraphicsUnit]::Pixel)), $red, 566, 280)
$g.DrawString("颱風夜，舊城爆發潮病。`n生存七日，趕上最後一班撤離船。", (New-Object Drawing.Font $font, 34, ([Drawing.FontStyle]::Regular), ([Drawing.GraphicsUnit]::Pixel)), $grey, 566, 390)
$bmp.Save((Join-Path $out 'og.png'), [Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
Write-Output 'done'
