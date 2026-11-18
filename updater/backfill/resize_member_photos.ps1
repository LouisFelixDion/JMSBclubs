Add-Type -AssemblyName System.Drawing

$photoDir = Join-Path $PSScriptRoot "..\..\assets\members\fisa"
$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq "image/jpeg"
$quality = [System.Drawing.Imaging.EncoderParameters]::new(1)
$quality.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality, 82L)

Get-ChildItem -LiteralPath $photoDir -Filter *.jpg | ForEach-Object {
  $source = [System.Drawing.Image]::FromFile($_.FullName)
  $bitmap = [System.Drawing.Bitmap]::new(240, 240)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.DrawImage($source, 0, 0, 240, 240)
  $temporary = "$($_.FullName).tmp.jpg"
  $bitmap.Save($temporary, $jpegCodec, $quality)
  $graphics.Dispose()
  $bitmap.Dispose()
  $source.Dispose()
  Move-Item -LiteralPath $temporary -Destination $_.FullName -Force
}

$quality.Dispose()
