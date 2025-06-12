import os
import json
import time
import secrets
from flask import Flask, request, send_from_directory, jsonify, Response
import firebase_admin
from firebase_admin import credentials, auth

# --- 將環境變數 FIREBASE_ADMIN_JSON 寫入本地檔案 ---
if os.getenv("FIREBASE_ADMIN_JSON"):
    admin_json = os.environ.get("FIREBASE_ADMIN_JSON")
    try:
        data = json.loads(admin_json)
    except json.JSONDecodeError:
        # 如果已經是 JSON 檔路徑，則不解析
        data = None
    if data:
        with open("firebase-key.json", "w", encoding='utf-8') as f:
            json.dump(data, f)
    else:
        # 假設它已經是檔案路徑
        # 直接寫入環境變數內容
        with open("firebase-key.json", "w", encoding='utf-8') as f:
            f.write(admin_json)

# --- 初始化 Firebase Admin SDK（只做一次） ---
cred = credentials.Certificate("firebase-key.json")
firebase_admin.initialize_app(cred)

# --- Flask 應用設定 ---
app = Flask(__name__)
STATIC_FOLDER = os.getcwd()
# AUTH_KEY 可透過 Render Environment 設定
AUTH_KEY = os.getenv('AUTH_KEY', 'gasyuberu')
# 暫存一次性 tokens：token -> (timestamp, uid)
tokens = {}


@app.route('/')
def home():
    # 讀取靜態 index.html，並替換 __FIREBASE_API_KEY__ 占位符
    tpl_path = os.path.join(STATIC_FOLDER, 'index.html')
    tpl = open(tpl_path, encoding='utf-8').read()
    filled = tpl.replace(
        "__FIREBASE_API_KEY__",
        os.getenv('FIREBASE_API_KEY', '')
    )
    return Response(filled, mimetype='text/html')


@app.route('/index.html')
def index_html():
    # 確保 /index.html 也能動態注入
    return home()


@app.route('/<path:filename>')
def static_files(filename):
    # 其他靜態檔案
    return send_from_directory(STATIC_FOLDER, filename)


@app.route('/get-token', methods=['POST'])
def generate_token():
    global tokens
    auth_key = request.form.get('authKey', '').strip()
    uid = request.form.get('uid', '').strip()

    # 只有在 auth_key 驗證通過且 uid 不為空時才生成 token
    if auth_key == AUTH_KEY and uid:
        now = time.time()
        # 清理過期 token（超過 300 秒）
        tokens = {
            t: (ts, u) for t, (ts, u) in tokens.items()
            if now - ts < 300
        }
        token = secrets.token_urlsafe(16)
        tokens[token] = (now, uid)
        print(f"Generated Token for UID {uid}: {token}")
        return jsonify({"token": token}), 200
    else:
        print("Invalid authKey or missing UID:", auth_key, uid)
        return jsonify({"message": "Invalid Key or missing UID"}), 403


@app.route('/get-firebase-custom-token', methods=['POST'])
def get_firebase_custom_token_route():
    auth_key = request.form.get('authKey', '').strip()
    uid = request.form.get('uid', '').strip()
    if auth_key != AUTH_KEY or not uid:
        return jsonify({"message": "Unauthorized"}), 403
    try:
        custom_token = auth.create_custom_token(uid)
        # decode to string if necessary
        if isinstance(custom_token, bytes):
            custom_token = custom_token.decode('utf-8')
        return jsonify({"customToken": custom_token}), 200
    except Exception as e:
        print("Error creating custom Firebase token:", e)
        return jsonify({"message": "Firebase error"}), 500


@app.route('/validate-token', methods=['GET'])
def validate_token():
    token = request.args.get('token', '').strip()
    uid = request.args.get('uid', '').strip()
    now = time.time()
    entry = tokens.get(token)
    print("Token validation request:", token, "for UID:", uid)
    if entry and now - entry[0] < 300 and entry[1] == uid:
        # 一次性 token 使用後立即移除
        tokens.pop(token, None)
        return jsonify({"message": "Token Valid"}), 200
    # 無效或過期
    tokens.pop(token, None)
    return jsonify({"message": "Invalid or Expired Token"}), 403


if __name__ == '__main__':
    port = int(os.getenv('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
