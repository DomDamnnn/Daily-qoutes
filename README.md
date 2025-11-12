# Random Philosopher Quotes (Flask)

## วิธีรันในเครื่อง (VS Code)
1) เปิดโฟลเดอร์ `quotes_app` ใน VS Code
2) เปิด Terminal (Ctrl+`)
3) สร้าง virtual env และติดตั้งไลบรารี
   - Windows:
     ```powershell
     python -m venv .venv
     .venv\Scripts\activate
     pip install -r requirements.txt
     ```
   - macOS/Linux:
     ```bash
     python3 -m venv .venv
     source .venv/bin/activate
     pip install -r requirements.txt
     ```
4) รันแอป
   ```bash
   python app.py
   ```
   หรือ
   ```bash
   flask --app app run --debug
   ```
5) เปิดเบราว์เซอร์ที่ http://127.0.0.1:5000

## เพิ่ม/แก้ไขคำคม
- เปิดไฟล์ `quotes.json` แล้วเพิ่มรายการในรูปแบบ:
  ```json
  { "author": "ชื่อผู้เขียน", "text": "ข้อความคำคม" }
  ```
- บันทึกไฟล์ แล้วกดรีเฟรชหน้าเว็บ