$token = "1|paaWVSJut5pYVilxvAQNG21rNq2qycEfgqPrPz1N7b4a1757"
$baseUrl = "https://appbr.pro/api/v1"
$headers = @{ "Authorization" = "Bearer $token"; "Content-Type" = "application/json"; "Accept" = "application/json" }

Write-Host "=== Step 1: Get current docker compose ==="
$svc = Invoke-RestMethod -Uri "$baseUrl/services/ye6zgp0gvan73x2g9c979fre" -Method Get -Headers $headers -ErrorAction Stop
$compose = $svc.docker_compose_raw
Write-Host ("Compose length: {0}" -f $compose.Length)

Write-Host "`n=== Step 2: Base64 encode function code ==="
$code = Get-Content -Path "D:\chegoja_2026\send-notification\index.ts" -Raw
$bytes = [System.Text.Encoding]::UTF8.GetBytes($code)
$b64Code = [Convert]::ToBase64String($bytes)
Write-Host ("Base64 length: {0}" -f $b64Code.Length)

Write-Host "`n=== Step 3: Update edge-functions config ==="
$oldBlock = @"
    command:
      - start
      - '--main-service'
      - /home/deno/functions/main
"@

$newBlock = @"
    entrypoint: ["/bin/sh", "-c"]
    command:
      - "mkdir -p /home/deno/functions/send-notification && echo '$b64Code' | base64 -d > /home/deno/functions/send-notification/index.ts && exec edge-runtime start --main-service /home/deno/functions/main"
"@

# Remove any old send-notification bind mounts
$compose = $compose.Replace("`n      -`n        type: bind`n        source: ./volumes/functions/send-notification/index.ts`n        target: /home/deno/functions/send-notification/index.ts", "")

if ($compose.Contains($oldBlock)) {
    $compose = $compose.Replace($oldBlock, $newBlock)
    Write-Host "Original command block replaced"
}
else {
    # Try to find the current command block (might be the broken one from earlier)
    Write-Host "Original block not found - checking for current state..."
    $idx = $compose.IndexOf("supabase-edge-functions:")
    if ($idx -ge 0) {
        $section = $compose.Substring($idx, [Math]::Min(300, $compose.Length - $idx))
        Write-Host ("Current config starts with: {0}" -f $section.Substring(0, [Math]::Min(100, $section.Length)))
    }
    
    # Try to replace the broken pattern if present
    $brokenPattern = 'entrypoint: ["/bin/sh", "-c"]'
    if ($compose.Contains($brokenPattern)) {
        Write-Host "Found existing entrypoint override - will update it"
    }
    
    # Replace the entire block from "command:" to next section
    $cmdStart = $compose.IndexOf("`n    command:")
    if ($cmdStart -ge 0) {
        $cmdEnd = $compose.IndexOf("`n  supabase-supavisor:", $cmdStart)
        if ($cmdEnd -ge 0) {
            $compose = $compose.Substring(0, $cmdStart) + "`n$newBlock" + $compose.Substring($cmdEnd)
            Write-Host "Block replaced by section search"
        }
    }
}

Write-Host "`n=== Step 4: Send PATCH ==="
$bytes2 = [System.Text.Encoding]::UTF8.GetBytes($compose)
$b64Compose = [Convert]::ToBase64String($bytes2)

$patchBody = @{ "docker_compose_raw" = $b64Compose } | ConvertTo-Json
$patchRes = Invoke-RestMethod -Uri "$baseUrl/services/ye6zgp0gvan73x2g9c979fre" -Method Patch -Headers $headers -Body $patchBody -ErrorAction Stop
Write-Host ("PATCH result: {0}" -f ($patchRes | ConvertTo-Json -Compress))

Write-Host "`n=== Step 5: Trigger redeploy ==="
$deployRes = Invoke-RestMethod -Uri "$baseUrl/deploy?uuid=ye6zgp0gvan73x2g9c979fre&force=false" -Method Post -Headers $headers -Body '{}' -ErrorAction Stop
Write-Host ("DEPLOY: {0}" -f ($deployRes | ConvertTo-Json -Compress))

Write-Host "`nDone! Waiting for service to become healthy..."
