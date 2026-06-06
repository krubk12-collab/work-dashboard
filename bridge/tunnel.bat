@echo off
chcp 65001 >nul
title Claude Code Bridge - TUNNEL (ปิดหน้าต่างนี้ = ปิด tunnel)
echo ============================================================
echo   เปิด Cloudflare Tunnel ชี้ไปที่ Bridge (localhost:4317)
echo ============================================================
echo.
echo   * ต้องเปิด start.bat (ตัว Bridge) ค้างไว้ก่อน
echo   * มองหา URL ด้านล่าง:  https://xxxxx.trycloudflare.com
echo   * เปิด URL นั้นบนมือถือ แล้วใส่รหัสผ่านเพื่อเข้าใช้
echo   * เลิกใช้ = ปิดหน้าต่างนี้ทันที (tunnel จะดับ)
echo.
echo ------------------------------------------------------------
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:4317 --no-autoupdate
echo.
echo (tunnel ปิดแล้ว)
pause
